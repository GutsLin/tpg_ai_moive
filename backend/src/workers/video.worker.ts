import 'dotenv/config'

import IORedis from 'ioredis'
import { Queue, Worker, type Job } from 'bullmq'

import {
  ArkBearerClient,
  type ArkAssetReferenceMode,
  type ArkVideoClient,
  type ArkVideoTaskInfo,
  isArkAuthenticationError,
} from '../lib/ark-bearer'
import { ConfigService } from '../services/config.service'
import {
  KyselyAssetRepository,
  type AssetRecord,
  type AssetRepository,
} from '../services/asset.service'
import { OssService, type OssServiceContract } from '../services/oss.service'
import {
  KyselyVideoGenerationLogRepository,
  VideoGenerationLogger,
  type VideoGenerationLogContext,
} from '../services/video-generation-log.service'
import {
  KyselyVideoRepository,
  type VideoDispatcher,
  type VideoContentItem,
  type VideoRecord,
  type VideoRepository,
  type VideoRequestSnapshot,
  type VideoStatus,
} from '../services/video.service'
import { VideoProviderService } from '../services/video-provider.service'
import { classifyWorkerError, createWorkerLogger } from './worker-runtime'

export const VIDEO_CREATE_QUEUE_NAME = 'create-and-sync-video'
export const VIDEO_SYNC_QUEUE_NAME = 'sync-video-status'

export interface VideoWorkerJob {
  taskId: number
}

interface VideoCreateProcessorDeps {
  repository: VideoRepository
  dispatcher: VideoDispatcher
  assetRepository: AssetRepository
  ossService: OssServiceContract
  arkClient: ArkVideoClient
  resolveClient?: (task: VideoRecord) => Promise<ArkVideoClient>
  generationLogger?: VideoGenerationLogger
  now?: () => Date
}

interface VideoSyncProcessorDeps {
  repository: VideoRepository
  dispatcher: VideoDispatcher
  ossService: OssServiceContract
  arkClient: ArkVideoClient
  resolveClient?: (task: VideoRecord) => Promise<ArkVideoClient>
  generationLogger?: VideoGenerationLogger
  fetchImpl?: typeof fetch
  batchSize?: number
  now?: () => Date
}

interface VideoReconcileProcessorDeps {
  repository: VideoRepository
  dispatcher: VideoDispatcher
  generationLogger?: VideoGenerationLogger
  now?: () => Date
  staleAfterMs?: number
  batchSize?: number
}

const createRedisConnection = () =>
  new IORedis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })

const resolveVideoOssKey = (record: VideoRecord) => record.videoOssKey ?? `videos/${record.arkTaskId}.mp4`
const ASSET_URL_PREFIX = 'asset://'
const FIRST_SYNC_POLL_DELAY_MS = 5 * 60_000
const TOAPIS_FIRST_SYNC_POLL_DELAY_MS = 10_000
const DEFAULT_SYNC_POLL_INTERVAL_MS = 30_000
const DEFAULT_SYNC_BATCH_SIZE = 20
const ARK_STATUS_STALE_TIMEOUT_MS = 24 * 60 * 60 * 1000
const DEFAULT_RECONCILE_INTERVAL_MS = 60_000
const DEFAULT_RECONCILE_STALE_AFTER_MS = 10 * 60_000
const DEFAULT_RECONCILE_BATCH_SIZE = 20
const getProviderLabel = (task: VideoRecord) =>
  task.providerSnapshot?.providerType === 'toapis' ? 'ToAPIs' : '火山方舟'

const buildArkStatusStaleTimeoutMessage = (task: VideoRecord) =>
  `${getProviderLabel(task)}任务超过 24 小时无状态更新，已默认失败`

const buildArkVideoDownloadFailedMessage = (status: number, arkTaskId: string | null, providerLabel = '火山方舟') =>
  status === 403
    ? `${providerLabel}视频链接已过期或无权限访问，无法下载结果视频（HTTP 403，${providerLabel}任务ID：${arkTaskId ?? '-'}）`
    : `视频下载失败: ${status}${arkTaskId ? `（${providerLabel}任务ID：${arkTaskId}）` : ''}`

const toLogContext = (task: VideoRecord): VideoGenerationLogContext => ({
  videoTaskId: task.id,
  projectId: task.projectId,
  userId: task.userId,
  traceId: task.idempotencyKey,
})

const summarizeVideoRecord = (record: VideoRecord | null) =>
  record
    ? {
        taskId: record.id,
        arkTaskId: record.arkTaskId,
        status: record.status,
        videoOssKey: record.videoOssKey,
        errorMessage: record.errorMessage,
        nextPollAt: record.nextPollAt,
        lastArkStatus: record.lastArkStatus,
      }
    : { updated: false }

const updateVideoTask = async (
  task: VideoRecord,
  repository: VideoRepository,
  generationLogger: VideoGenerationLogger,
  action: string,
  message: string,
  patch: Partial<VideoRecord>
) =>
  generationLogger.step(
    {
      ...toLogContext(task),
      stage: 'state_update',
      action,
      message,
      requestPayload: { patch },
      responsePayload: summarizeVideoRecord,
    },
    async () => repository.update(task.id, patch)
  )

const mapArkStatusToVideoStatus = (status: string): VideoStatus => {
  switch (status.trim().toLowerCase()) {
    case 'queued':
    case 'pending':
      return 'pending'
    case 'running':
    case 'processing':
    case 'in_progress':
      return 'processing'
    case 'succeeded':
    case 'completed':
      return 'succeeded'
    case 'failed':
    case 'expired':
    case 'cancelled':
    case 'canceled':
      return 'failed'
    default:
      return 'processing'
  }
}

const assertAssetTypeMatches = (
  contentType: VideoContentItem['type'],
  asset: AssetRecord
) => {
  if (
    (contentType === 'image_url' && asset.assetType !== 'Image') ||
    (contentType === 'video_url' && asset.assetType !== 'Video') ||
    (contentType === 'audio_url' && asset.assetType !== 'Audio')
  ) {
    throw new Error(`引用素材类型不匹配: ${asset.arkAssetId}`)
  }
}

const resolveAssetReferenceUrl = async (
  item: VideoContentItem,
  assetRepository: AssetRepository,
  ossService: OssServiceContract,
  assetReferenceMode: ArkAssetReferenceMode
) => {
  if (item.type === 'text') {
    return item.text
  }

  const contentType = item.type
  const url =
    item.type === 'image_url'
      ? item.image_url.url
      : item.type === 'video_url'
        ? item.video_url.url
        : item.audio_url.url

  if (!url.startsWith(ASSET_URL_PREFIX)) {
    if (typeof item.assetId === 'number' && Number.isInteger(item.assetId)) {
      const asset = await assetRepository.findById(item.assetId)
      if (!asset) {
        throw new Error(`引用素材不存在: ${item.assetId}`)
      }

      assertAssetTypeMatches(contentType, asset)
      return ossService.getSignedUrl(asset.ossKey)
    }

    return url
  }

  const arkAssetId = url.slice(ASSET_URL_PREFIX.length).trim()
  if (!arkAssetId) {
    throw new Error('素材引用无效')
  }

  const asset = await assetRepository.findByArkAssetId(arkAssetId)
  if (!asset) {
    throw new Error(`引用素材不存在: ${arkAssetId}`)
  }

  if (asset.arkStatus !== 'active') {
    throw new Error(`引用素材未就绪: ${arkAssetId}`)
  }

  assertAssetTypeMatches(contentType, asset)
  // pa_ 前缀 = 已同步 ToAPIs 素材库的素材，生成时可直接被平台按 asset:// 引用
  const useProviderAsset = assetReferenceMode === 'provider_asset' || arkAssetId.startsWith('pa_')
  return useProviderAsset
    ? `${ASSET_URL_PREFIX}${arkAssetId}`
    : ossService.getSignedUrl(asset.ossKey)
}

const resolveVideoRequestSnapshot = async (
  requestSnapshot: VideoRequestSnapshot,
  assetRepository: AssetRepository,
  ossService: OssServiceContract,
  assetReferenceMode: ArkAssetReferenceMode
): Promise<VideoRequestSnapshot> => {
  const content = await Promise.all(
    requestSnapshot.content.map(async (item) => {
      if (item.type === 'image_url') {
        return {
          ...item,
          image_url: {
            url: await resolveAssetReferenceUrl(item, assetRepository, ossService, assetReferenceMode),
          },
        }
      }

      if (item.type === 'video_url') {
        return {
          ...item,
          video_url: {
            url: await resolveAssetReferenceUrl(item, assetRepository, ossService, assetReferenceMode),
          },
        }
      }

      if (item.type === 'audio_url') {
        return {
          ...item,
          audio_url: {
            url: await resolveAssetReferenceUrl(item, assetRepository, ossService, assetReferenceMode),
          },
        }
      }

      return item
    })
  )

  return {
    ...requestSnapshot,
    content,
  }
}

const resolveNextPollAt = (now: Date) => new Date(now.getTime() + DEFAULT_SYNC_POLL_INTERVAL_MS)

const resolveLastStatusChangedAt = (task: VideoRecord) =>
  task.lastArkStatusChangedAt ?? task.lastPolledAt ?? task.updatedAt ?? task.createdAt

const hasArkStatusStalled = (task: VideoRecord, now: Date) =>
  now.getTime() - resolveLastStatusChangedAt(task).getTime() > ARK_STATUS_STALE_TIMEOUT_MS

const resolveArkStatusChangedAtPatch = (task: VideoRecord, arkStatus: string, now: Date) =>
  task.lastArkStatus === arkStatus && task.lastArkStatusChangedAt ? task.lastArkStatusChangedAt : now

const handleMissingArkTask = async (
  task: VideoRecord,
  repository: VideoRepository,
  generationLogger: VideoGenerationLogger,
  now: Date
) => {
  await generationLogger.write({
    ...toLogContext(task),
    stage: 'ark_poll',
    action: 'ark_poll.result_missing',
    status: 'failed',
    message: `${getProviderLabel(task)}轮询结果中未找到当前任务`,
    requestPayload: { arkTaskId: task.arkTaskId },
    responsePayload: { found: false },
    errorMessage: `${getProviderLabel(task)}轮询结果中未找到当前任务`,
  })

  if (hasArkStatusStalled(task, now)) {
    await updateVideoTask(task, repository, generationLogger, 'video_task.stalled', '超时任务已标记失败', {
      status: 'failed',
      errorMessage: buildArkStatusStaleTimeoutMessage(task),
      nextPollAt: null,
    })
    return
  }

  await updateVideoTask(task, repository, generationLogger, 'video_task.poll_rescheduled', '未返回状态，已安排下次轮询', {
    lastPolledAt: now,
    nextPollAt: resolveNextPollAt(now),
  })
}

const syncTaskResult = async (
  task: VideoRecord,
  result: ArkVideoTaskInfo,
  repository: VideoRepository,
  ossService: OssServiceContract,
  fetchImpl: typeof fetch,
  generationLogger: VideoGenerationLogger,
  now: Date
) => {
  const mappedStatus = mapArkStatusToVideoStatus(result.status)

  await generationLogger.write({
    ...toLogContext(task),
    stage: 'ark_poll',
    action: 'ark_status.mapped',
    status: 'info',
    message: `${getProviderLabel(task)}状态已映射为平台任务状态`,
    requestPayload: { arkStatus: result.status },
    responsePayload: { videoStatus: mappedStatus },
  })

  if (mappedStatus === 'pending' || mappedStatus === 'processing') {
    if (hasArkStatusStalled(task, now)) {
      await updateVideoTask(task, repository, generationLogger, 'video_task.stalled', '超时任务已标记失败', {
        status: 'failed',
        errorMessage: buildArkStatusStaleTimeoutMessage(task),
        lastPolledAt: now,
        nextPollAt: null,
      })
      return
    }

    await updateVideoTask(task, repository, generationLogger, 'video_task.poll_progress', '任务状态与下次轮询时间已更新', {
      status: mappedStatus,
      errorMessage: null,
      lastPolledAt: now,
      lastArkStatus: result.status,
      lastArkStatusChangedAt: resolveArkStatusChangedAtPatch(task, result.status, now),
      nextPollAt: resolveNextPollAt(now),
    })
    return
  }

  if (mappedStatus === 'succeeded') {
    if (!result.videoUrl) {
      await updateVideoTask(task, repository, generationLogger, 'video_task.result_missing', `${getProviderLabel(task)}任务缺少结果视频地址`, {
        status: 'failed',
        errorMessage: `${getProviderLabel(task)}任务已完成但未返回视频地址`,
        lastPolledAt: now,
        lastArkStatus: result.status,
        lastArkStatusChangedAt: resolveArkStatusChangedAtPatch(task, result.status, now),
        nextPollAt: null,
      })
      return
    }

    await updateVideoTask(task, repository, generationLogger, 'video_task.download_prepared', `${getProviderLabel(task)}结果已就绪，准备下载视频`, {
      status: 'processing',
      arkVideoUrl: result.videoUrl,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      errorMessage: null,
      lastPolledAt: now,
      lastArkStatus: result.status,
      lastArkStatusChangedAt: resolveArkStatusChangedAtPatch(task, result.status, now),
      nextPollAt: null,
    })

    const response = await generationLogger.step(
      {
        ...toLogContext(task),
        stage: 'download',
        action: 'video_result.download',
        message: `下载${getProviderLabel(task)}生成结果`,
        requestPayload: { url: result.videoUrl, arkTaskId: task.arkTaskId, provider: getProviderLabel(task) },
        responsePayload: (downloadResponse) => ({
          ok: downloadResponse.ok,
          status: downloadResponse.status,
          contentType: downloadResponse.headers.get('content-type'),
          contentLength: downloadResponse.headers.get('content-length'),
        }),
        resultStatus: (downloadResponse) => downloadResponse.ok ? 'succeeded' : 'failed',
        resultErrorMessage: (downloadResponse) =>
          downloadResponse.ok ? null : buildArkVideoDownloadFailedMessage(downloadResponse.status, task.arkTaskId, getProviderLabel(task)),
      },
      async () => fetchImpl(result.videoUrl as string)
    )
    if (!response.ok) {
      const errorMessage = buildArkVideoDownloadFailedMessage(response.status, task.arkTaskId, getProviderLabel(task))
      await updateVideoTask(task, repository, generationLogger, 'video_task.download_failed', '结果视频下载失败', {
        status: 'failed',
        errorMessage,
        nextPollAt: null,
      })
      if (response.status === 403) {
        return
      }
      throw new Error(errorMessage)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const contentType = response.headers.get('content-type') ?? 'video/mp4'
    const ossKey = resolveVideoOssKey(task)

    try {
      await generationLogger.step(
        {
          ...toLogContext(task),
          stage: 'oss_upload',
          action: 'video_result.upload_oss',
          message: '上传结果视频到 OSS',
          requestPayload: { ossKey, size: buffer.length, contentType },
          responsePayload: () => ({ ossKey, size: buffer.length, contentType }),
        },
        async () => ossService.putObject(ossKey, buffer, contentType)
      )
    } catch (error) {
      await updateVideoTask(task, repository, generationLogger, 'video_task.oss_retry_scheduled', 'OSS 上传失败，已安排重试', {
        status: 'processing',
        errorMessage: error instanceof Error ? error.message : String(error),
        lastPolledAt: now,
        nextPollAt: resolveNextPollAt(now),
      })
      return
    }

    await updateVideoTask(task, repository, generationLogger, 'video_task.completed', '视频任务已完成', {
      status: 'succeeded',
      arkVideoUrl: result.videoUrl,
      videoOssKey: ossKey,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      errorMessage: null,
      lastPolledAt: now,
      lastArkStatus: result.status,
      lastArkStatusChangedAt: resolveArkStatusChangedAtPatch(task, result.status, now),
      nextPollAt: null,
    })
    return
  }

  await updateVideoTask(task, repository, generationLogger, 'video_task.failed', `${getProviderLabel(task)}任务失败状态已落库`, {
    status: 'failed',
    errorMessage: result.errorMessage ?? '视频生成失败',
    lastPolledAt: now,
    lastArkStatus: result.status,
    lastArkStatusChangedAt: resolveArkStatusChangedAtPatch(task, result.status, now),
    nextPollAt: null,
  })
}

export const createVideoCreateProcessor =
  ({
    repository,
    dispatcher,
    assetRepository,
    ossService,
    arkClient,
    resolveClient,
    generationLogger = new VideoGenerationLogger(),
    now = () => new Date(),
  }: VideoCreateProcessorDeps) =>
  async ({ taskId }: VideoWorkerJob): Promise<void> => {
    const runAt = now()
    const task = await repository.findById(taskId)
    if (!task) {
      return
    }

    if (task.arkTaskId) {
      await generationLogger.write({
        ...toLogContext(task),
        stage: 'queue',
        action: 'video_create.skipped',
        status: 'info',
        message: `任务已有${getProviderLabel(task)}任务 ID，跳过重复创建`,
        requestPayload: { taskId },
        responsePayload: { arkTaskId: task.arkTaskId },
      })
      return
    }

    await generationLogger.write({
      ...toLogContext(task),
      stage: 'queue',
      action: 'video_create.started',
      status: 'info',
      message: '视频创建 worker 开始处理任务',
      requestPayload: { taskId },
    })

    try {
      const videoClient = resolveClient ? await resolveClient(task) : arkClient
      const assetReferenceMode = await videoClient.getAssetReferenceMode?.() ?? 'provider_asset'
      const requestSnapshot = await generationLogger.step(
        {
          ...toLogContext(task),
          stage: 'asset_resolution',
          action: 'video_payload.resolve_assets',
          message: '解析视频请求中的素材引用',
          requestPayload: task.requestSnapshot,
          responsePayload: (resolvedSnapshot) => resolvedSnapshot,
        },
        async () => resolveVideoRequestSnapshot(
          task.requestSnapshot,
          assetRepository,
          ossService,
          assetReferenceMode
        )
      )
      const arkTaskId = await generationLogger.step(
        {
          ...toLogContext(task),
          stage: 'ark_request',
          action: 'ark_video.create_task',
          message: `调用${getProviderLabel(task)}视频任务创建接口`,
          requestPayload: requestSnapshot,
          responsePayload: (createdTaskId) => ({ arkTaskId: createdTaskId }),
        },
        async () => videoClient.createTask(requestSnapshot)
      )
      await updateVideoTask(task, repository, generationLogger, 'video_task.ark_created', `${getProviderLabel(task)}任务 ID 与首次轮询时间已保存`, {
        arkTaskId,
        status: 'pending',
        errorMessage: null,
        nextPollAt: new Date(
          runAt.getTime() +
          (assetReferenceMode === 'signed_url' ? TOAPIS_FIRST_SYNC_POLL_DELAY_MS : FIRST_SYNC_POLL_DELAY_MS)
        ),
        lastArkStatus: null,
        lastArkStatusChangedAt: runAt,
        lastPolledAt: null,
      })
    } catch (error) {
      await updateVideoTask(task, repository, generationLogger, 'video_task.create_failed', '视频创建流程失败状态已落库', {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        nextPollAt: null,
      })
      await generationLogger.write({
        ...toLogContext(task),
        stage: 'queue',
        action: 'video_create.failed',
        status: 'failed',
        message: '视频创建 worker 处理失败',
        requestPayload: { taskId },
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

export const createVideoSyncProcessor =
  ({
    repository,
    dispatcher,
    ossService,
    arkClient,
    resolveClient,
    generationLogger = new VideoGenerationLogger(),
    fetchImpl = fetch,
    batchSize = DEFAULT_SYNC_BATCH_SIZE,
    now = () => new Date(),
  }: VideoSyncProcessorDeps) =>
  async (): Promise<void> => {
    const runAt = now()
    const tasks = await repository.listSyncableArkTasks({ now: runAt, limit: batchSize })
    if (tasks.length === 0) {
      return
    }

    const tasksByArkId = new Map(tasks.flatMap((task) => task.arkTaskId ? [[task.arkTaskId, task]] : []))
    const arkTaskIds = [...tasksByArkId.keys()]
    const pollStartedAt = Date.now()

    await Promise.all(
      tasks.map((task) =>
        generationLogger.write({
          ...toLogContext(task),
          stage: 'ark_poll',
          action: 'ark_video.list_tasks',
          status: 'started',
          message: `调用${getProviderLabel(task)}视频任务状态查询接口`,
          requestPayload: { arkTaskId: task.arkTaskId, batchTaskIds: arkTaskIds },
        })
      )
    )

    let results: ArkVideoTaskInfo[] = []
    const pollErrors = new Map<number, unknown>()

    if (resolveClient) {
      const outcomes = await Promise.all(
        tasks.map(async (task) => {
          try {
            if (!task.arkTaskId) {
              return { task, results: [] as ArkVideoTaskInfo[] }
            }
            return { task, results: await (await resolveClient(task)).listTasks([task.arkTaskId]) }
          } catch (error) {
            return { task, error }
          }
        })
      )

      for (const outcome of outcomes) {
        if ('error' in outcome) {
          pollErrors.set(outcome.task.id, outcome.error)
        } else {
          results.push(...outcome.results)
        }
      }
    } else {
      try {
        results = await arkClient.listTasks(arkTaskIds)
      } catch (error) {
        tasks.forEach((task) => pollErrors.set(task.id, error))
      }
    }

    await Promise.all(
      tasks.flatMap((task) => {
        const error = pollErrors.get(task.id)
        if (!error) {
          return []
        }

        const errorMessage = error instanceof Error ? error.message : String(error)
        const authenticationFailed = isArkAuthenticationError(error)
        return [
          (async () => {
            await generationLogger.write({
              ...toLogContext(task),
              stage: 'ark_poll',
              action: 'ark_video.list_tasks',
              status: 'failed',
              message: authenticationFailed
                ? `${getProviderLabel(task)}视频平台认证失败，任务已停止轮询`
                : `${getProviderLabel(task)}视频任务状态查询失败`,
              requestPayload: { arkTaskId: task.arkTaskId, batchTaskIds: arkTaskIds },
              durationMs: Date.now() - pollStartedAt,
              errorMessage,
            })

            if (authenticationFailed) {
              await updateVideoTask(
                task,
                repository,
                generationLogger,
                'video_task.auth_failed',
                `${getProviderLabel(task)}认证失败，已标记任务失败并停止轮询`,
                {
                  status: 'failed',
                  errorMessage,
                  lastPolledAt: runAt,
                  nextPollAt: null,
                }
              )
            }
          })(),
        ]
      })
    )

    const resultByArkId = new Map(results.map((result) => [result.id, result]))
    const polledTasks = tasks.filter((task) => !pollErrors.has(task.id))
    await Promise.all(
      polledTasks.map((task) => {
        const result = task.arkTaskId ? resultByArkId.get(task.arkTaskId) : undefined
        return generationLogger.write({
          ...toLogContext(task),
          stage: 'ark_poll',
          action: 'ark_video.list_tasks',
          status: result ? 'succeeded' : 'failed',
          message: result ? `${getProviderLabel(task)}视频任务状态查询完成` : `${getProviderLabel(task)}查询响应未包含当前任务`,
          requestPayload: { arkTaskId: task.arkTaskId, batchTaskIds: arkTaskIds },
          responsePayload: result ?? { found: false },
          durationMs: Date.now() - pollStartedAt,
          errorMessage: result ? null : `${getProviderLabel(task)}查询响应未包含当前任务`,
        })
      })
    )

    let firstError: unknown = [...pollErrors.values()].find((error) => !isArkAuthenticationError(error)) ?? null
    for (const task of polledTasks) {
      const result = task.arkTaskId ? resultByArkId.get(task.arkTaskId) : undefined
      if (!result) {
        await handleMissingArkTask(task, repository, generationLogger, runAt)
        continue
      }

      try {
        await syncTaskResult(task, result, repository, ossService, fetchImpl, generationLogger, runAt)
      } catch (error) {
        await updateVideoTask(task, repository, generationLogger, 'video_task.sync_failed', '视频状态同步失败状态已落库', {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
          nextPollAt: null,
        })
        firstError ??= error
      }
    }

    if (firstError) {
      throw firstError
    }
  }

export const createVideoReconcileProcessor =
  ({
    repository,
    dispatcher,
    generationLogger = new VideoGenerationLogger(),
    now = () => new Date(),
    staleAfterMs = DEFAULT_RECONCILE_STALE_AFTER_MS,
    batchSize = DEFAULT_RECONCILE_BATCH_SIZE,
  }: VideoReconcileProcessorDeps) =>
  async (): Promise<void> => {
    const staleTasks = await repository.listStaleProcessingTasks({
      updatedBefore: new Date(now().getTime() - staleAfterMs),
      limit: batchSize,
    })

    await Promise.all(
      staleTasks.map((task) =>
        task.arkTaskId
          ? Promise.resolve()
          : generationLogger.step(
              {
                ...toLogContext(task),
                stage: 'reconcile',
                action: 'video_create.reconciled',
                message: '停滞任务重新加入视频创建队列',
                requestPayload: { taskId: task.id },
                responsePayload: () => ({ taskId: task.id, queue: VIDEO_CREATE_QUEUE_NAME }),
              },
              async () => dispatcher.enqueueCreate(task.id)
            )
      )
    )
  }

export class BullMqVideoDispatcher implements VideoDispatcher {
  private readonly connection = createRedisConnection()
  private createQueue?: Queue<VideoWorkerJob>
  private syncQueue?: Queue<VideoWorkerJob>

  private getCreateQueue(): Queue<VideoWorkerJob> {
    this.createQueue ??= new Queue<VideoWorkerJob>(VIDEO_CREATE_QUEUE_NAME, {
      connection: this.connection,
    })
    return this.createQueue
  }

  private getSyncQueue(): Queue<VideoWorkerJob> {
    this.syncQueue ??= new Queue<VideoWorkerJob>(VIDEO_SYNC_QUEUE_NAME, {
      connection: this.connection,
    })
    return this.syncQueue
  }

  public async enqueueCreate(taskId: number): Promise<void> {
    await this.getCreateQueue().add(
      VIDEO_CREATE_QUEUE_NAME,
      { taskId },
      {
        jobId: `video-create-${taskId}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3_000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      }
    )
  }

  public async enqueueSync(taskId: number, options?: { delayMs?: number }): Promise<void> {
    await this.getSyncQueue().add(
      VIDEO_SYNC_QUEUE_NAME,
      { taskId },
      {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        delay: options?.delayMs ?? 0,
        removeOnComplete: true,
        removeOnFail: 100,
      }
    )
  }
}

export const resolveVideoWorkerDispatcher = (dispatcher?: VideoDispatcher): VideoDispatcher =>
  dispatcher ?? new BullMqVideoDispatcher()

export const startVideoWorkers = (dependencies?: {
  repository?: VideoRepository
  dispatcher?: VideoDispatcher
  assetRepository?: AssetRepository
  ossService?: OssServiceContract
  arkClient?: ArkVideoClient
  configService?: ConfigService
  generationLogger?: VideoGenerationLogger
}) => {
  const workerLogger = createWorkerLogger('worker-video')
  const repository = dependencies?.repository ?? new KyselyVideoRepository()
  const dispatcher = resolveVideoWorkerDispatcher(dependencies?.dispatcher)
  const assetRepository = dependencies?.assetRepository ?? new KyselyAssetRepository()
  const ossService = dependencies?.ossService ?? new OssService()
  const arkClient = dependencies?.arkClient ?? new ArkBearerClient()
  const providerService = new VideoProviderService(dependencies?.configService ?? new ConfigService())
  const resolveClient = dependencies?.arkClient
    ? undefined
    : async (task: VideoRecord): Promise<ArkVideoClient> => {
        if (!task.providerSnapshot) {
          throw new Error('视频任务缺少平台快照，无法创建或查询任务')
        }
        const connection = await providerService.getClientConfiguration(task.providerSnapshot)
        return new ArkBearerClient({
          getEndpoint: async () => connection.endpoint,
          getApiKey: async () => connection.apiKey,
          providerType: task.providerSnapshot.providerType,
        })
      }
  const generationLogger =
    dependencies?.generationLogger ??
    new VideoGenerationLogger(new KyselyVideoGenerationLogRepository())
  const connection = createRedisConnection()

  const createProcessor = createVideoCreateProcessor({
    repository,
    dispatcher,
    assetRepository,
    ossService,
    arkClient,
    resolveClient,
    generationLogger,
  })

  const syncProcessor = createVideoSyncProcessor({
    repository,
    dispatcher,
    ossService,
    arkClient,
    resolveClient,
    generationLogger,
  })
  const reconcileProcessor = createVideoReconcileProcessor({
    repository,
    dispatcher,
    generationLogger,
  })

  let syncRunning = false
  const runSyncProcessor = async () => {
    if (syncRunning) {
      workerLogger.warn({ queue: VIDEO_SYNC_QUEUE_NAME }, 'video sync processor skipped because previous run is still active')
      return
    }

    syncRunning = true
    try {
      await syncProcessor()
    } finally {
      syncRunning = false
    }
  }

  const createWorker = new Worker<VideoWorkerJob>(
    VIDEO_CREATE_QUEUE_NAME,
    async (job: Job<VideoWorkerJob>) => createProcessor(job.data),
    {
      connection,
      concurrency: 2,
    }
  )

  const syncWorker = new Worker<VideoWorkerJob>(
    VIDEO_SYNC_QUEUE_NAME,
    async () => undefined,
    {
      connection,
      concurrency: 2,
    }
  )

  createWorker.on('failed', (job, error) => {
    const errorDetails = classifyWorkerError(error)
    const logPayload = {
      queue: VIDEO_CREATE_QUEUE_NAME,
      jobId: job?.id,
      jobData: job?.data,
      ...errorDetails,
    }

    if (errorDetails.recoverable) {
      workerLogger.warn(logPayload, 'video create worker failed with recoverable error')
      return
    }

    workerLogger.error(logPayload, 'video create worker failed')
  })

  syncWorker.on('failed', (job, error) => {
    const errorDetails = classifyWorkerError(error)
    const logPayload = {
      queue: VIDEO_SYNC_QUEUE_NAME,
      jobId: job?.id,
      jobData: job?.data,
      ...errorDetails,
    }

    if (errorDetails.recoverable) {
      workerLogger.warn(logPayload, 'video sync worker failed with recoverable error')
      return
    }

    workerLogger.error(logPayload, 'video sync worker failed')
  })

  createWorker.on('error', (error) => {
    workerLogger.error({ queue: VIDEO_CREATE_QUEUE_NAME, ...classifyWorkerError(error) }, 'video create worker runtime error')
  })

  syncWorker.on('error', (error) => {
    workerLogger.error({ queue: VIDEO_SYNC_QUEUE_NAME, ...classifyWorkerError(error) }, 'video sync worker runtime error')
  })

  workerLogger.info(
    {
      queues: [VIDEO_CREATE_QUEUE_NAME, VIDEO_SYNC_QUEUE_NAME],
    },
    'video worker service started'
  )

  const syncTimer = setInterval(() => {
    void runSyncProcessor().catch((error) => {
      workerLogger.error(
        { queue: VIDEO_SYNC_QUEUE_NAME, ...classifyWorkerError(error) },
        'video sync processor failed'
      )
    })
  }, DEFAULT_SYNC_POLL_INTERVAL_MS)
  syncTimer.unref?.()

  const reconcileTimer = setInterval(() => {
    void reconcileProcessor().catch((error) => {
      workerLogger.error(
        { queue: VIDEO_SYNC_QUEUE_NAME, ...classifyWorkerError(error) },
        'video reconcile processor failed'
      )
    })
  }, DEFAULT_RECONCILE_INTERVAL_MS)
  reconcileTimer.unref?.()

  return {
    createWorker,
    syncWorker,
    syncTimer,
    reconcileTimer,
  }
}

if (require.main === module) {
  startVideoWorkers()
}
