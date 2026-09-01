import 'dotenv/config'

import IORedis from 'ioredis'
import { Queue, Worker, type Job } from 'bullmq'

import { ArkAkskClient, type ArkAssetClient } from '../lib/ark-aksk'
import { ProviderAssetClient } from '../lib/toapis-avatar'
import { ArkProjectNameService } from '../services/ark-project-name.service'
import { KyselyAssetRepository, type AssetDispatcher, type AssetRepository } from '../services/asset.service'
import { ConfigService } from '../services/config.service'
import { OssService, type OssServiceContract } from '../services/oss.service'
import { classifyWorkerError, createWorkerLogger } from './worker-runtime'

export const ASSET_SYNC_QUEUE_NAME = 'sync-asset-status'
export const ASSET_DELETE_QUEUE_NAME = 'delete-asset'

// 定时重推停滞素材的间隔与停滞判定阈值（processing 正常轮询最长约 2 分钟，超出视为停滞）
const ASSET_RECONCILE_INTERVAL_MS = 2 * 60_000
const ASSET_RECONCILE_STALE_AFTER_MS = 3 * 60_000

export interface AssetWorkerJob {
  assetId: number
}

interface AssetSyncProcessorDeps {
  repository: AssetRepository
  ossService: OssServiceContract
  arkClient: ArkAssetClient
  getDefaultGroupId: () => Promise<string>
  getDefaultSyncEnabled: () => Promise<boolean>
  getProjectName: (projectId?: number | null) => Promise<string | undefined>
  sleep?: (ms: number) => Promise<void>
  pollIntervalMs?: number
  maxPollAttempts?: number
}

interface AssetDeleteProcessorDeps {
  repository: AssetRepository
  ossService: OssServiceContract
  arkClient: ArkAssetClient
  getProjectName: (projectId?: number | null) => Promise<string | undefined>
}

type SchedulableJob = {
  getState: () => Promise<string>
  retry: () => Promise<void>
  remove: () => Promise<void>
}

type SchedulableQueue<T> = {
  add: (name: string, data: T, opts: object) => Promise<unknown>
  getJob: (jobId: string) => Promise<SchedulableJob | undefined>
}

const createRedisConnection = () =>
  new IORedis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })

// 瞬时错误（网络抖动/平台 5xx）不应把素材标记为 failed 终态，保持 pending 等待自动重试
const TRANSIENT_ERROR_PATTERN = /fetch failed|timeout|timed out|abort|econnreset|econnrefused|enotfound|socket hang up|502|503|504|请求过于频繁|rate.?limit/i

export const isTransientAssetSyncError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false
  }
  return TRANSIENT_ERROR_PATTERN.test(error.message)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const formatDeleteError = (scope: 'OSS' | '火山素材', error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  return `${scope}删除失败: ${message}`
}

const queueStatesToKeep = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children'])

const isArkAssetAlreadyDeletedError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  return normalized.includes('specified asset') && normalized.includes('is not found')
}

export const ensureJobScheduled = async <T>(
  queue: SchedulableQueue<T>,
  name: string,
  data: T,
  options: {
    jobId: string
    attempts: number
    backoff: {
      type: 'exponential'
      delay: number
    }
    removeOnComplete: boolean
    removeOnFail: number
  }
): Promise<void> => {
  const existingJob = await queue.getJob(options.jobId)

  if (existingJob) {
    const state = await existingJob.getState()

    if (state === 'failed') {
      await existingJob.retry()
      return
    }

    if (queueStatesToKeep.has(state)) {
      return
    }

    await existingJob.remove().catch(() => undefined)
  }

  await queue.add(name, data, options)
}

const resolvePollingFailure = (result: Awaited<ReturnType<ArkAssetClient['getAsset']>>): string => {
  if (result.errorMessage) {
    return result.errorCode ? `${result.errorCode}: ${result.errorMessage}` : result.errorMessage
  }

  return '素材处理失败'
}

// 依次校验候选组 ID 是否属于当前平台的素材库（客户端未实现校验时视为有效）
const resolveProviderGroupId = async (
  arkClient: ArkAssetClient,
  candidates: Array<string | null | undefined>
): Promise<string | null> => {
  for (const candidate of candidates) {
    if (candidate && (await arkClient.matchesGroupId?.(candidate)) !== false) {
      return candidate
    }
  }
  return null
}

export const createAssetSyncProcessor =
  ({
    repository,
    ossService,
    arkClient,
    getDefaultGroupId,
    getDefaultSyncEnabled,
    getProjectName,
    sleep: sleepImpl = sleep,
    pollIntervalMs = 3_000,
    maxPollAttempts = 40,
  }: AssetSyncProcessorDeps) =>
  async ({ assetId }: AssetWorkerJob): Promise<void> => {
    const asset = await repository.findById(assetId)
    if (!asset) {
      return
    }

    if (asset.arkStatus === 'active') {
      return
    }

    const defaultSyncEnabled = await getDefaultSyncEnabled()
    const effectiveSync =
      asset.groupSyncEnabled === false
        ? false
        : asset.syncMode === 'enabled'
          ? true
          : asset.syncMode === 'disabled'
            ? false
            : asset.groupSyncEnabled ?? defaultSyncEnabled

    if (!effectiveSync) {
      return
    }

    const supportedAssetTypes = (await arkClient.getSupportedAssetTypes?.()) ?? ['Image']
    if (!supportedAssetTypes.includes(asset.assetType)) {
      await repository.update(assetId, {
        arkStatus: 'failed',
        arkError: `当前平台素材库仅支持 ${supportedAssetTypes.join('/')} 类型素材`,
      })
      return
    }

    let currentAsset = asset

    try {
      const projectName = await getProjectName(currentAsset.sourceProjectId)

      if (!currentAsset.arkAssetId) {
        const signedUrl = await ossService.getSignedUrl(currentAsset.ossKey, 86_400)
        const defaultGroupId = await getDefaultGroupId()
        const groupId = await resolveProviderGroupId(arkClient, [currentAsset.arkGroupId, defaultGroupId])
        if (!groupId) {
          throw new Error(
            `素材组 ID「${currentAsset.arkGroupId ?? defaultGroupId}」与当前视频平台素材库不匹配，请在项目设置中重新保存该素材组的同步开关以创建新组`
          )
        }
        const arkAssetId = await arkClient.createAsset(
          groupId,
          signedUrl,
          currentAsset.name,
          currentAsset.assetType,
          projectName
        )
        const updated = await repository.update(assetId, {
          arkGroupId: groupId,
          arkAssetId,
          arkStatus: 'processing',
          arkError: null,
        })

        currentAsset = updated ?? {
          ...currentAsset,
          arkGroupId: groupId,
          arkAssetId,
          arkStatus: 'processing',
          arkError: null,
        }
      }

      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        const result = await arkClient.getAsset(currentAsset.arkAssetId as string, projectName)

        if (result.status === 'Active') {
          await repository.update(assetId, {
            arkStatus: 'active',
            arkError: null,
          })
          return
        }

        if (result.status === 'Failed') {
          await repository.update(assetId, {
            arkStatus: 'failed',
            arkError: resolvePollingFailure(result),
          })
          return
        }

        if (attempt < maxPollAttempts - 1) {
          await sleepImpl(pollIntervalMs)
        }
      }

      await repository.update(assetId, {
        arkStatus: 'failed',
        arkError: 'timeout',
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (isTransientAssetSyncError(error)) {
        // 网络抖动/平台 5xx 属瞬时错误：回到 pending 由 BullMQ 重试与定时 reconcile 兜底，不落 failed 终态
        await repository.update(assetId, {
          arkStatus: 'pending',
          arkError: `同步暂时失败，等待自动重试: ${errorMessage}`,
        })
        throw error
      }

      await repository.update(assetId, {
        arkStatus: 'failed',
        arkError: errorMessage,
      })
      throw error
    }
  }

export const createAssetDeleteProcessor =
  ({ repository, ossService, arkClient, getProjectName }: AssetDeleteProcessorDeps) =>
  async ({ assetId }: AssetWorkerJob): Promise<void> => {
    const asset = await repository.findById(assetId)
    if (!asset) {
      return
    }

    if (await repository.isReferenced(asset.id, asset.arkAssetId)) {
      await repository.update(assetId, { arkStatus: 'deleting', arkError: '等待画布或任务引用解除' })
      return
    }

    try {
      await ossService.deleteObject(asset.ossKey)
    } catch (error) {
      await repository.update(assetId, {
        arkError: formatDeleteError('OSS', error),
      })
      throw error
    }

    if (asset.arkAssetId) {
      try {
        const projectName = await getProjectName(asset.sourceProjectId)
        await arkClient.deleteAsset(asset.arkAssetId, projectName)
      } catch (error) {
        // 远端删除失败不再阻断本地清理（重试会因 OSS 已删而 404 跳过、因本地已删而找不到记录直接返回），
        // 残留的远端素材由 reconcile 周期重推本流程时按幂等规则处理
        if (!isArkAssetAlreadyDeletedError(error)) {
          await repository.update(assetId, {
            arkError: formatDeleteError('火山素材', error),
          })
        }
      }
    }

    await repository.deleteById(assetId)
  }

export class BullMqAssetDispatcher implements AssetDispatcher {
  private readonly connection = createRedisConnection()
  private syncQueue?: Queue<AssetWorkerJob>
  private deleteQueue?: Queue<AssetWorkerJob>

  private getSyncQueue(): Queue<AssetWorkerJob> {
    this.syncQueue ??= new Queue<AssetWorkerJob>(ASSET_SYNC_QUEUE_NAME, {
      connection: this.connection,
    })
    return this.syncQueue
  }

  private getDeleteQueue(): Queue<AssetWorkerJob> {
    this.deleteQueue ??= new Queue<AssetWorkerJob>(ASSET_DELETE_QUEUE_NAME, {
      connection: this.connection,
    })
    return this.deleteQueue
  }

  public async enqueueSync(assetId: number): Promise<void> {
    await ensureJobScheduled(this.getSyncQueue(), ASSET_SYNC_QUEUE_NAME, { assetId }, {
      jobId: `asset-sync-${assetId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3_000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    })
  }

  public async enqueueDelete(assetId: number): Promise<void> {
    await ensureJobScheduled(this.getDeleteQueue(), ASSET_DELETE_QUEUE_NAME, { assetId }, {
      jobId: `asset-delete-${assetId}`,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5_000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    })
  }
}

export const startAssetWorkers = (dependencies?: {
  repository?: AssetRepository
  ossService?: OssServiceContract
  arkClient?: ArkAssetClient
  configService?: ConfigService
}) => {
  const workerLogger = createWorkerLogger('worker-asset-sync')
  const repository = dependencies?.repository ?? new KyselyAssetRepository()
  const ossService = dependencies?.ossService ?? new OssService()
  const arkClient = dependencies?.arkClient ?? new ProviderAssetClient({ volcanoClient: new ArkAkskClient() })
  const configService = dependencies?.configService ?? new ConfigService()
  const projectNameService = new ArkProjectNameService(configService, repository)
  const connection = createRedisConnection()

  const syncProcessor = createAssetSyncProcessor({
    repository,
    ossService,
    arkClient,
    getDefaultGroupId: async () => configService.getRequired('ark_default_group_id'),
    getDefaultSyncEnabled: async () => (await configService.getOptional('ark_default_sync_enabled')) !== 'false',
    getProjectName: async (projectId) => projectNameService.resolve(projectId),
  })

  const deleteProcessor = createAssetDeleteProcessor({
    repository,
    ossService,
    arkClient,
    getProjectName: async (projectId) => projectNameService.resolve(projectId),
  })

  const syncWorker = new Worker<AssetWorkerJob>(
    ASSET_SYNC_QUEUE_NAME,
    async (job: Job<AssetWorkerJob>) => syncProcessor(job.data),
    {
      connection,
      concurrency: 3,
    }
  )

  const deleteWorker = new Worker<AssetWorkerJob>(
    ASSET_DELETE_QUEUE_NAME,
    async (job: Job<AssetWorkerJob>) => deleteProcessor(job.data),
    {
      connection,
      concurrency: 2,
    }
  )

  // 周期兜底：BullMQ 重试耗尽或 worker 重启后，停滞的 pending/processing/deleting 素材自动恢复
  // （网络抖动导致的批量 fetch failed、轮询中断的 processing 均会在网络恢复后自动补齐）
  const reconcileStaleAssets = async () => {
    try {
      const stale = await repository.listByStatuses(['pending', 'processing', 'deleting'])
      const cutoff = Date.now() - ASSET_RECONCILE_STALE_AFTER_MS
      const syncTargets = stale.filter((item) => item.arkStatus !== 'deleting' && new Date(item.updatedAt).getTime() < cutoff)
      const deleteTargets = stale.filter((item) => item.arkStatus === 'deleting' && new Date(item.updatedAt).getTime() < cutoff)

      for (const item of syncTargets) {
        await syncProcessor({ assetId: item.id }).catch(() => undefined)
      }
      for (const item of deleteTargets) {
        await deleteProcessor({ assetId: item.id }).catch(() => undefined)
      }

      if (syncTargets.length + deleteTargets.length > 0) {
        workerLogger.info(
          { queue: ASSET_SYNC_QUEUE_NAME, syncCount: syncTargets.length, deleteCount: deleteTargets.length },
          'stale assets reconciled'
        )
      }
    } catch (error) {
      workerLogger.error({ queue: ASSET_SYNC_QUEUE_NAME, ...classifyWorkerError(error) }, 'asset reconcile processor failed')
    }
  }

  const reconcileTimer = setInterval(() => {
    void reconcileStaleAssets()
  }, ASSET_RECONCILE_INTERVAL_MS)
  reconcileTimer.unref?.()

  syncWorker.on('failed', (job, error) => {
    const errorDetails = classifyWorkerError(error)
    const logPayload = {
      queue: ASSET_SYNC_QUEUE_NAME,
      jobId: job?.id,
      jobData: job?.data,
      ...errorDetails,
    }

    if (errorDetails.recoverable) {
      workerLogger.warn(logPayload, 'asset sync worker failed with recoverable error')
      return
    }

    workerLogger.error(logPayload, 'asset sync worker failed')
  })

  deleteWorker.on('failed', (job, error) => {
    const errorDetails = classifyWorkerError(error)
    const logPayload = {
      queue: ASSET_DELETE_QUEUE_NAME,
      jobId: job?.id,
      jobData: job?.data,
      ...errorDetails,
    }

    if (errorDetails.recoverable) {
      workerLogger.warn(logPayload, 'asset delete worker failed with recoverable error')
      return
    }

    workerLogger.error(logPayload, 'asset delete worker failed')
  })

  syncWorker.on('error', (error) => {
    workerLogger.error({ queue: ASSET_SYNC_QUEUE_NAME, ...classifyWorkerError(error) }, 'asset sync worker runtime error')
  })

  deleteWorker.on('error', (error) => {
    workerLogger.error({ queue: ASSET_DELETE_QUEUE_NAME, ...classifyWorkerError(error) }, 'asset delete worker runtime error')
  })

  workerLogger.info(
    {
      queues: [ASSET_SYNC_QUEUE_NAME, ASSET_DELETE_QUEUE_NAME],
    },
    'asset-sync worker service started'
  )

  return {
    syncWorker,
    deleteWorker,
  }
}

if (require.main === module) {
  startAssetWorkers()
}
