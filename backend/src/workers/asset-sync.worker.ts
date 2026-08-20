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
      await repository.update(assetId, {
        arkStatus: 'failed',
        arkError: error instanceof Error ? error.message : String(error),
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
        if (!isArkAssetAlreadyDeletedError(error)) {
          await repository.update(assetId, {
            arkError: formatDeleteError('火山素材', error),
          })
          throw error
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
