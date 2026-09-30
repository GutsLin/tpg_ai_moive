import 'dotenv/config'

import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
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
export const VIDEO_DOWNLOAD_QUEUE_NAME = 'download-video'

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
  arkClient: ArkVideoClient
  resolveClient?: (task: VideoRecord) => Promise<ArkVideoClient>
  generationLogger?: VideoGenerationLogger
  batchSize?: number
  now?: () => Date
}

interface VideoSyncEnqueuerDeps {
  repository: VideoRepository
  dispatcher: VideoDispatcher
  batchSize?: number
  now?: () => Date
}

interface VideoSyncTaskProcessorDeps {
  repository: VideoRepository
  dispatcher: VideoDispatcher
  arkClient: ArkVideoClient
  resolveClient?: (task: VideoRecord) => Promise<ArkVideoClient>
  generationLogger?: VideoGenerationLogger
  now?: () => Date
}

interface VideoDownloadProcessorDeps {
  repository: VideoRepository
  ossService: OssServiceContract
  fetchImpl?: typeof fetch
  generationLogger?: VideoGenerationLogger
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
export const VIDEO_SYNC_POLL_INTERVAL_MS = 30_000
export const VIDEO_SYNC_SCAN_INTERVAL_MS = 5_000
const DEFAULT_DOWNLOAD_POLL_INTERVAL_MS = 30_000
export const VIDEO_SYNC_SCAN_BATCH_SIZE = 20
const VIDEO_SYNC_CONCURRENCY = 5
const VIDEO_DOWNLOAD_CONCURRENCY = 3
const SYNC_ENQUEUE_TIMEOUT_MS = 30_000
const ARK_STATUS_STALE_TIMEOUT_MS = 24 * 60 * 60 * 1000
const DEFAULT_RECONCILE_INTERVAL_MS = 60_000
const DEFAULT_RECONCILE_STALE_AFTER_MS = 10 * 60_000
const DEFAULT_RECONCILE_BATCH_SIZE = 20
// 下载使用流式传输；整体超时限制最长下载时间，空闲超时只限制长时间无数据的连接。
const VIDEO_DOWNLOAD_CONNECT_TIMEOUT_MS = 30_000
const VIDEO_DOWNLOAD_TOTAL_TIMEOUT_MS = 15 * 60_000
const VIDEO_DOWNLOAD_IDLE_TIMEOUT_MS = 2 * 60_000
export const resolveVideoSyncJobId = (taskId: number, runAtMs: number) =>
  `video-sync-${taskId}-${Math.trunc(runAtMs)}`

const getProviderLabel = (task: VideoRecord) =>
  task.providerSnapshot?.providerType === 'toapis' ? 'ToAPIs' : '火山方舟'

// ToAPIs 结果文件可能签发在 files.toapis.com / files.toapis.cn 独立文件域名上。
// 国内 ECS 直连 files.toapis.cn 的速度明显优于 API 同域代理，因此下载时优先直连，
// 只有直连发生可恢复的 HTTP/链路错误时才切换到 /__files/ 备用路径。
const TOAPIS_FILE_HOSTS = new Set(['files.toapis.com', 'files.toapis.cn'])

const resolveToapisDirectUrl = (videoUrl: string): string | null => {
  try {
    const parsed = new URL(videoUrl)
    const hostname = parsed.hostname.toLowerCase()
    if (!TOAPIS_FILE_HOSTS.has(hostname)) {
      return null
    }

    if (hostname === 'files.toapis.cn') {
      return videoUrl
    }

    // .com 在国内可能被 DNS 污染，统一使用同路径的 .cn 文件域名直连。
    parsed.hostname = 'files.toapis.cn'
    return parsed.toString()
  } catch {
    return null
  }
}

const resolveToapisProxyUrl = (videoUrl: string, task: VideoRecord): string | null => {
  try {
    const endpointOrigin = new URL(task.providerSnapshot?.endpoint ?? '').origin
    const parsed = new URL(videoUrl)
    if (!TOAPIS_FILE_HOSTS.has(parsed.hostname.toLowerCase()) || !endpointOrigin || endpointOrigin === 'null') {
      return null
    }

    return `${endpointOrigin}/__files/${parsed.pathname.replace(/^\/+/, '')}${parsed.search}`
  } catch {
    return null
  }
}

const resolveDownloadUrls = (videoUrl: string, task: VideoRecord): string[] => {
  const directUrl = resolveToapisDirectUrl(videoUrl)
  if (!directUrl) {
    return [videoUrl]
  }

  const urls = [directUrl]
  const proxyUrl = resolveToapisProxyUrl(videoUrl, task)
  if (proxyUrl && !urls.includes(proxyUrl)) {
    urls.push(proxyUrl)
  }
  return urls
}

const isRecoverableDownloadStatus = (status: number) =>
  status === 408 || status === 425 || status === 429 || status === 478 || status >= 500

const isRecoverableDownloadError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return true
  }

  // URL/协议配置错误不会因切换域名而恢复，其他连接中断、超时和 socket 错误可以尝试备用地址。
  return !/invalid url|unsupported protocol|only absolute urls|failed to parse url/i.test(error.message)
}

const writeDownloadFallbackLog = async (
  task: VideoRecord,
  generationLogger: VideoGenerationLogger,
  fromUrl: string,
  toUrl: string,
  reason: { status?: number; error?: unknown }
) => {
  const errorMessage = reason.error instanceof Error ? reason.error.message : reason.error ? String(reason.error) : null

  await generationLogger.write({
    ...toLogContext(task),
    stage: 'download',
    action: 'video_result.download_fallback',
    status: 'info',
    message: '直连结果视频下载失败，切换到 ToAPIs 备用下载路径',
    requestPayload: {
      fromUrl,
      toUrl,
      arkTaskId: task.arkTaskId,
      ...(reason.status === undefined ? {} : { status: reason.status }),
    },
    errorMessage,
  })
}

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

const updateDownloadState = async (
  task: VideoRecord,
  repository: VideoRepository,
  generationLogger: VideoGenerationLogger,
  claimToken: string,
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
      resultStatus: (record) => record ? 'succeeded' : 'failed',
      resultErrorMessage: (record) => record ? null : '下载租约已失效，状态更新已跳过',
    },
    async () => repository.updateDownloadState(task.id, claimToken, patch)
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

const resolveNextPollAt = (now: Date) => new Date(now.getTime() + VIDEO_SYNC_POLL_INTERVAL_MS)

const resolveLastStatusChangedAt = (task: VideoRecord) =>
  task.lastArkStatusChangedAt ?? task.lastPolledAt ?? task.updatedAt ?? task.createdAt

const hasArkStatusStalled = (task: VideoRecord, now: Date) =>
  now.getTime() - resolveLastStatusChangedAt(task).getTime() > ARK_STATUS_STALE_TIMEOUT_MS

const resolveArkStatusChangedAtPatch = (task: VideoRecord, arkStatus: string, now: Date) =>
  task.lastArkStatus === arkStatus && task.lastArkStatusChangedAt ? task.lastArkStatusChangedAt : now

const handleMissingArkTask = async (
  task: VideoRecord,
  repository: VideoRepository,
  dispatcher: VideoDispatcher,
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

  const nextPollAt = resolveNextPollAt(now)
  await updateVideoTask(task, repository, generationLogger, 'video_task.poll_rescheduled', '未返回状态，已安排下次轮询', {
    lastPolledAt: now,
    nextPollAt,
  })
  await dispatcher.enqueueSync(task.id, { runAt: nextPollAt }).catch(() => undefined)
}

const syncTaskResult = async (
  task: VideoRecord,
  result: ArkVideoTaskInfo,
  repository: VideoRepository,
  dispatcher: VideoDispatcher,
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

    const nextPollAt = resolveNextPollAt(now)
    await updateVideoTask(task, repository, generationLogger, 'video_task.poll_progress', '任务状态与下次轮询时间已更新', {
      status: mappedStatus,
      errorMessage: null,
      lastPolledAt: now,
      lastArkStatus: result.status,
      lastArkStatusChangedAt: resolveArkStatusChangedAtPatch(task, result.status, now),
      nextPollAt,
    })
    await dispatcher.enqueueSync(task.id, { runAt: nextPollAt }).catch(() => undefined)
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

    await dispatcher.enqueueDownload(task.id)
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

const downloadVideoResult = async (
  task: VideoRecord,
  repository: VideoRepository,
  ossService: OssServiceContract,
  fetchImpl: typeof fetch,
  generationLogger: VideoGenerationLogger,
  now: Date,
  claimToken: string
) => {
  if (!task.arkVideoUrl || task.videoOssKey) {
    return
  }

  const downloadUrls = resolveDownloadUrls(task.arkVideoUrl, task)
  let downloadUrl = downloadUrls[0] ?? task.arkVideoUrl
  let response: Response | null = null
  let encounteredRecoverableCandidateFailure = false
  let responseAbortController: AbortController | null = null
  let cleanupResponseAbortRelay: (() => void) | null = null
  const totalAbortController = new AbortController()
  const totalTimeout = setTimeout(
    () => totalAbortController.abort(new Error('视频下载整体超时')),
    VIDEO_DOWNLOAD_TOTAL_TIMEOUT_MS
  )
  totalTimeout.unref?.()

  const scheduleDownloadRetry = async (errorMessage: string) => {
    await generationLogger.write({
      ...toLogContext(task),
      stage: 'download',
      action: 'video_result.download',
      status: 'failed',
      message: '结果视频下载失败，已安排重试',
      requestPayload: { url: downloadUrl, arkTaskId: task.arkTaskId },
      errorMessage,
    })
    await updateDownloadState(task, repository, generationLogger, claimToken, 'video_task.download_retry_scheduled', '结果视频下载失败，已安排重试', {
      status: 'processing',
      errorMessage: `结果视频下载失败，等待重试: ${errorMessage}`,
      downloadClaimedAt: null,
      downloadClaimToken: null,
      nextPollAt: resolveNextPollAt(now),
    })
  }

  try {
    for (const [index, candidateUrl] of downloadUrls.entries()) {
      const nextDownloadUrl = downloadUrls[index + 1]
      downloadUrl = candidateUrl

      // Each candidate gets its own connection timeout. The total timeout is shared so a
      // failed direct attempt cannot extend the 15-minute ceiling before the proxy attempt.
      const attemptAbortController = new AbortController()
      const abortAttemptForTotalTimeout = () => attemptAbortController.abort(totalAbortController.signal.reason)
      if (totalAbortController.signal.aborted) {
        abortAttemptForTotalTimeout()
      } else {
        totalAbortController.signal.addEventListener('abort', abortAttemptForTotalTimeout, { once: true })
      }
      const connectTimeout = setTimeout(
        () => attemptAbortController.abort(new Error('视频下载连接超时')),
        VIDEO_DOWNLOAD_CONNECT_TIMEOUT_MS
      )
      connectTimeout.unref?.()
      let keepAttemptController = false

      try {
        response = await generationLogger.step(
          {
            ...toLogContext(task),
            stage: 'download',
            action: 'video_result.download',
            message: `下载${getProviderLabel(task)}生成结果`,
            requestPayload: {
              url: downloadUrl,
              arkTaskId: task.arkTaskId,
              provider: getProviderLabel(task),
              attempt: index + 1,
              candidates: downloadUrls.length,
            },
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
          async () => fetchImpl(downloadUrl, { signal: attemptAbortController.signal })
        )
        keepAttemptController = response.ok
      } catch (error) {
        if (nextDownloadUrl && !totalAbortController.signal.aborted && isRecoverableDownloadError(error)) {
          encounteredRecoverableCandidateFailure = true
          await writeDownloadFallbackLog(task, generationLogger, downloadUrl, nextDownloadUrl, { error })
          continue
        }

        await scheduleDownloadRetry(error instanceof Error ? error.message : String(error))
        return
      } finally {
        clearTimeout(connectTimeout)
        if (!keepAttemptController) {
          totalAbortController.signal.removeEventListener('abort', abortAttemptForTotalTimeout)
        }
      }

      if (!response.ok) {
        const errorMessage = buildArkVideoDownloadFailedMessage(response.status, task.arkTaskId, getProviderLabel(task))
        if (nextDownloadUrl && !totalAbortController.signal.aborted && isRecoverableDownloadStatus(response.status)) {
          encounteredRecoverableCandidateFailure = true
          if (response.body) {
            await response.body.cancel().catch(() => undefined)
          }
          await writeDownloadFallbackLog(task, generationLogger, downloadUrl, nextDownloadUrl, { status: response.status })
          response = null
          continue
        }

        if (response.status === 404 || response.status === 403) {
          // A terminal response from a fallback URL must not override a transient failure
          // from the canonical file URL. The canonical URL can recover on a later retry.
          if (encounteredRecoverableCandidateFailure) {
            await scheduleDownloadRetry(errorMessage)
            return
          }

          await updateDownloadState(task, repository, generationLogger, claimToken, 'video_task.download_failed', '结果视频下载失败', {
            status: 'failed',
            errorMessage,
            downloadClaimedAt: null,
            downloadClaimToken: null,
            nextPollAt: null,
          })
          return
        }

        await scheduleDownloadRetry(errorMessage)
        return
      }

      responseAbortController = attemptAbortController
      cleanupResponseAbortRelay = () => {
        totalAbortController.signal.removeEventListener('abort', abortAttemptForTotalTimeout)
      }
      break
    }

    if (!response || !responseAbortController) {
      await scheduleDownloadRetry('未获得视频下载响应')
      return
    }

    const contentType = response.headers.get('content-type') ?? 'video/mp4'
    const rawContentLength = response.headers.get('content-length')
    const parsedContentLength = rawContentLength ? Number(rawContentLength) : Number.NaN
    const contentLength = Number.isSafeInteger(parsedContentLength) && parsedContentLength > 0
      ? parsedContentLength
      : undefined
    const ossKey = resolveVideoOssKey(task)
    let uploadStarted = false
    try {
      if (response.body && ossService.putObjectFile) {
        const tempDirectory = await mkdtemp(join(tmpdir(), 'narrix-video-'))
        const tempFilePath = join(tempDirectory, 'result.mp4')
        try {
          const source = Readable.fromWeb(response.body as never)
          const destination = createWriteStream(tempFilePath)
          let idleTimer: NodeJS.Timeout | undefined
          const stopDownload = (reason?: unknown) => {
            const error = reason instanceof Error ? reason : new Error('视频下载流已中止')
            if (!source.destroyed) source.destroy(error)
            if (!destination.destroyed) destination.destroy(error)
          }
          const onAbort = () => stopDownload(responseAbortController!.signal.reason)
          const resetIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
              responseAbortController!.abort(new Error('视频下载空闲超时'))
            }, VIDEO_DOWNLOAD_IDLE_TIMEOUT_MS)
            idleTimer.unref?.()
          }
          responseAbortController.signal.addEventListener('abort', onAbort, { once: true })
          source.on('data', resetIdleTimer)
          resetIdleTimer()
          try {
            await pipeline(source, destination)
          } finally {
            if (idleTimer) clearTimeout(idleTimer)
            responseAbortController.signal.removeEventListener('abort', onAbort)
          }

          await generationLogger.step(
            {
              ...toLogContext(task),
              stage: 'oss_upload',
              action: 'video_result.upload_oss',
              message: '分片上传结果视频到 OSS',
              requestPayload: { ossKey, contentType, contentLength },
              responsePayload: () => ({ ossKey, contentType, contentLength }),
            },
            async () => {
              uploadStarted = true
              return ossService.putObjectFile!(ossKey, tempFilePath, contentType)
            }
          )
        } finally {
          await rm(tempDirectory, { recursive: true, force: true })
        }
      } else if (!response.body || !ossService.putObjectStream) {
        const buffer = Buffer.from(await response.arrayBuffer())
        await generationLogger.step(
          {
            ...toLogContext(task),
            stage: 'oss_upload',
            action: 'video_result.upload_oss',
            message: '上传结果视频到 OSS',
            requestPayload: { ossKey, size: buffer.length, contentType },
            responsePayload: () => ({ ossKey, size: buffer.length, contentType }),
          },
          async () => {
            uploadStarted = true
            return ossService.putObject(ossKey, buffer, contentType)
          }
        )
      } else {
        const source = Readable.fromWeb(response.body as never)
        const uploadStream = new PassThrough()
        uploadStream.on('error', () => undefined)
        let idleTimer: NodeJS.Timeout | undefined
        const stopStreams = (reason?: unknown) => {
          const error = reason instanceof Error ? reason : new Error('视频下载流已中止')
          if (!source.destroyed) source.destroy(error)
          if (!uploadStream.destroyed) uploadStream.destroy(error)
        }
        const onAbort = () => stopStreams(responseAbortController!.signal.reason)
        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => {
            const error = new Error('视频下载空闲超时')
            responseAbortController!.abort(error)
          }, VIDEO_DOWNLOAD_IDLE_TIMEOUT_MS)
          idleTimer.unref?.()
        }
        responseAbortController.signal.addEventListener('abort', onAbort, { once: true })
        source.on('data', resetIdleTimer)
        source.once('end', () => idleTimer && clearTimeout(idleTimer))
        source.once('error', (error) => uploadStream.destroy(error))
        resetIdleTimer()
        source.pipe(uploadStream)
        try {
          await generationLogger.step(
            {
              ...toLogContext(task),
              stage: 'oss_upload',
              action: 'video_result.upload_oss',
              message: '流式上传结果视频到 OSS',
              requestPayload: { ossKey, contentType, contentLength },
              responsePayload: () => ({ ossKey, contentType, contentLength }),
            },
            async () => {
              uploadStarted = true
              return ossService.putObjectStream!(ossKey, uploadStream, contentType, contentLength)
            }
          )
        } finally {
          if (idleTimer) clearTimeout(idleTimer)
          responseAbortController.signal.removeEventListener('abort', onAbort)
          source.unpipe(uploadStream)
          if (!source.readableEnded && !source.destroyed) source.destroy()
          if (!uploadStream.writableEnded && !uploadStream.destroyed) uploadStream.destroy()
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (uploadStarted) {
        await updateDownloadState(task, repository, generationLogger, claimToken, 'video_task.oss_retry_scheduled', 'OSS 上传失败，已安排重试', {
          status: 'processing',
          errorMessage,
          downloadClaimedAt: null,
          downloadClaimToken: null,
          lastPolledAt: now,
          nextPollAt: resolveNextPollAt(now),
        })
        return
      }
      await generationLogger.write({
        ...toLogContext(task),
        stage: 'download',
        action: 'video_result.download',
        status: 'failed',
        message: '结果视频读取中断，已安排重试',
        requestPayload: { url: downloadUrl, arkTaskId: task.arkTaskId },
        errorMessage,
      })
      await updateDownloadState(task, repository, generationLogger, claimToken, 'video_task.download_retry_scheduled', '结果视频读取中断，已安排重试', {
        status: 'processing',
        errorMessage: `结果视频读取中断，等待重试: ${errorMessage}`,
        downloadClaimedAt: null,
        downloadClaimToken: null,
        nextPollAt: resolveNextPollAt(now),
      })
      return
    }

    await updateDownloadState(task, repository, generationLogger, claimToken, 'video_task.completed', '视频任务已完成', {
      status: 'succeeded',
      videoOssKey: ossKey,
      errorMessage: null,
      downloadClaimedAt: null,
      downloadClaimToken: null,
      lastPolledAt: now,
      nextPollAt: null,
    })
  } finally {
    cleanupResponseAbortRelay?.()
    clearTimeout(totalTimeout)
  }
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
      const firstPollAt = new Date(
        runAt.getTime() +
        (assetReferenceMode === 'signed_url' ? TOAPIS_FIRST_SYNC_POLL_DELAY_MS : FIRST_SYNC_POLL_DELAY_MS)
      )
      await updateVideoTask(task, repository, generationLogger, 'video_task.ark_created', `${getProviderLabel(task)}任务 ID 与首次轮询时间已保存`, {
        arkTaskId,
        status: 'pending',
        errorMessage: null,
        nextPollAt: firstPollAt,
        lastArkStatus: null,
        lastArkStatusChangedAt: runAt,
        lastPolledAt: null,
      })
      // BullMQ 延迟任务是主轮询路径；数据库中的 nextPollAt 保留为可恢复的事实来源。
      await dispatcher.enqueueSync(task.id, { runAt: firstPollAt }).catch(() => undefined)
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
    arkClient,
    resolveClient,
    generationLogger = new VideoGenerationLogger(),
    batchSize = VIDEO_SYNC_SCAN_BATCH_SIZE,
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
        await handleMissingArkTask(task, repository, dispatcher, generationLogger, runAt)
        continue
      }

      try {
        await syncTaskResult(task, result, repository, dispatcher, generationLogger, runAt)
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

// 数据库扫描只负责把到期任务补入 BullMQ。正常轮询由每任务延迟 job 驱动，
// 因此扫描频率可以高于单任务轮询频率，且不会提前请求上游。
export const createVideoSyncEnqueuer =
  ({
    repository,
    dispatcher,
    batchSize = VIDEO_SYNC_SCAN_BATCH_SIZE,
    now = () => new Date(),
  }: VideoSyncEnqueuerDeps) =>
  async (): Promise<void> => {
    const runAt = now()
    const tasks = await repository.listSyncableArkTasks({ now: runAt, limit: batchSize })
    await Promise.all(
      tasks.map((task) => dispatcher.enqueueSync(task.id, { runAt: task.nextPollAt ?? runAt }))
    )
  }

// BullMQ 单任务轮询处理器。nextPollAt 是数据库中的权威时间，旧 job 或过早触发的
// job 只会重新安排到正确时间，不会造成额外的上游请求。
export const createVideoSyncTaskProcessor =
  ({
    repository,
    dispatcher,
    arkClient,
    resolveClient,
    generationLogger = new VideoGenerationLogger(),
    now = () => new Date(),
  }: VideoSyncTaskProcessorDeps) =>
  async ({ taskId }: VideoWorkerJob): Promise<void> => {
    const runAt = now()
    const task = await repository.findById(taskId)
    if (
      !task ||
      !task.arkTaskId ||
      task.videoOssKey ||
      (task.status !== 'pending' && task.status !== 'processing')
    ) {
      return
    }

    if (task.arkVideoUrl) {
      await dispatcher.enqueueDownload(taskId)
      return
    }

    if (task.nextPollAt && task.nextPollAt.getTime() > runAt.getTime()) {
      await dispatcher.enqueueSync(taskId, { runAt: task.nextPollAt })
      return
    }

    const scheduledAt = task.nextPollAt
    const schedulerLagMs = scheduledAt ? Math.max(0, runAt.getTime() - scheduledAt.getTime()) : null
    const pollStartedAt = Date.now()
    const requestPayload = {
      arkTaskId: task.arkTaskId,
      batchTaskIds: [task.arkTaskId],
      scheduledAt,
      schedulerLagMs,
    }

    await generationLogger.write({
      ...toLogContext(task),
      stage: 'ark_poll',
      action: 'ark_video.list_tasks',
      status: 'started',
      message: `调用${getProviderLabel(task)}视频任务状态查询接口`,
      requestPayload,
    })

    let results: ArkVideoTaskInfo[]
    try {
      const client = resolveClient ? await resolveClient(task) : arkClient
      results = await client.listTasks([task.arkTaskId])
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const authenticationFailed = isArkAuthenticationError(error)
      await generationLogger.write({
        ...toLogContext(task),
        stage: 'ark_poll',
        action: 'ark_video.list_tasks',
        status: 'failed',
        message: authenticationFailed
          ? `${getProviderLabel(task)}视频平台认证失败，任务已停止轮询`
          : `${getProviderLabel(task)}视频任务状态查询失败`,
        requestPayload,
        durationMs: Date.now() - pollStartedAt,
        errorMessage,
      })

      if (authenticationFailed) {
        await updateVideoTask(task, repository, generationLogger, 'video_task.auth_failed', `${getProviderLabel(task)}认证失败，已标记任务失败并停止轮询`, {
          status: 'failed',
          errorMessage,
          lastPolledAt: runAt,
          nextPollAt: null,
        })
        return
      }

      const nextPollAt = resolveNextPollAt(runAt)
      await updateVideoTask(task, repository, generationLogger, 'video_task.poll_retry_scheduled', '视频状态查询失败，已安排下次轮询', {
        lastPolledAt: runAt,
        nextPollAt,
      })
      await dispatcher.enqueueSync(task.id, { runAt: nextPollAt }).catch(() => undefined)
      return
    }

    const result = results.find((item) => item.id === task.arkTaskId)
    await generationLogger.write({
      ...toLogContext(task),
      stage: 'ark_poll',
      action: 'ark_video.list_tasks',
      status: result ? 'succeeded' : 'failed',
      message: result ? `${getProviderLabel(task)}视频任务状态查询完成` : `${getProviderLabel(task)}查询响应未包含当前任务`,
      requestPayload,
      responsePayload: result ?? { found: false },
      durationMs: Date.now() - pollStartedAt,
      errorMessage: result ? null : `${getProviderLabel(task)}查询响应未包含当前任务`,
    })

    if (!result) {
      await handleMissingArkTask(task, repository, dispatcher, generationLogger, runAt)
      return
    }

    await syncTaskResult(task, result, repository, dispatcher, generationLogger, runAt)
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
      staleTasks.map(async (task) => {
        // 无平台任务 ID：创建阶段停滞，重新入队创建
        if (!task.arkTaskId) {
          return generationLogger.step(
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
        }

        // 有平台任务 ID 但 next_poll_at 为空且无结果视频（如 worker 在下载阶段中断）：
        // 恢复轮询时间，让定时器重新拾取（有 arkVideoUrl 的由下载定时器处理，其余由同步定时器处理）
        if (!task.nextPollAt && !task.videoOssKey) {
          const pollAt = now()
          await updateVideoTask(task, repository, generationLogger, 'video_task.repoll_reconciled', '停滞任务已恢复轮询', {
            nextPollAt: pollAt,
          })
          if (task.arkVideoUrl) {
            await dispatcher.enqueueDownload(task.id)
          } else {
            await dispatcher.enqueueSync(task.id, { runAt: pollAt })
          }
        }
      })
    )
  }

export const createVideoDownloadProcessor =
  ({
    repository,
    ossService,
    fetchImpl = fetch,
    generationLogger = new VideoGenerationLogger(),
    now = () => new Date(),
  }: VideoDownloadProcessorDeps) =>
  async ({ taskId }: VideoWorkerJob): Promise<void> => {
    const runAt = now()
    const task = await repository.findById(taskId)
    if (!task || !task.arkVideoUrl || task.videoOssKey) {
      return
    }

    const claimToken = await repository.claimDownload(taskId)
    if (!claimToken) {
      return
    }

    await downloadVideoResult(task, repository, ossService, fetchImpl, generationLogger, runAt, claimToken)
  }

export class BullMqVideoDispatcher implements VideoDispatcher {
  private readonly connection = createRedisConnection()
  private createQueue?: Queue<VideoWorkerJob>
  private syncQueue?: Queue<VideoWorkerJob>
  private downloadQueue?: Queue<VideoWorkerJob>

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

  private getDownloadQueue(): Queue<VideoWorkerJob> {
    this.downloadQueue ??= new Queue<VideoWorkerJob>(VIDEO_DOWNLOAD_QUEUE_NAME, {
      connection: this.connection,
    })
    return this.downloadQueue
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

  public async enqueueSync(taskId: number, options?: { delayMs?: number; runAt?: Date }): Promise<void> {
    const queue = this.getSyncQueue()
    const nowMs = Date.now()
    const requestedRunAtMs = options?.runAt?.getTime()
    const runAtMs = Number.isFinite(requestedRunAtMs)
      ? Math.max(0, requestedRunAtMs as number)
      : nowMs + Math.max(0, options?.delayMs ?? 0)
    const jobId = resolveVideoSyncJobId(taskId, runAtMs)
    const existing = await queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'waiting-children' || state === 'prioritized') {
        return
      }
      try {
        await existing.remove()
      } catch {
        return
      }
    }

    await queue.add(
      VIDEO_SYNC_QUEUE_NAME,
      { taskId },
      {
        jobId,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        delay: Math.max(0, Math.trunc(runAtMs - nowMs)),
        removeOnComplete: true,
        removeOnFail: 100,
      }
    )
  }

  public async enqueueDownload(taskId: number): Promise<void> {
    const queue = this.getDownloadQueue()
    const jobId = `video-download-${taskId}`
    const existing = await queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'waiting-children' || state === 'prioritized') {
        return
      }
      try {
        await existing.remove()
      } catch {
        return
      }
    }

    await queue.add(
      VIDEO_DOWNLOAD_QUEUE_NAME,
      { taskId },
      {
        jobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
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
      const connection = await providerService.getClientConfiguration(task.providerSnapshot, task.userId)
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

  const syncEnqueuer = createVideoSyncEnqueuer({
    repository,
    dispatcher,
  })
  const syncTaskProcessor = createVideoSyncTaskProcessor({
    repository,
    dispatcher,
    arkClient,
    resolveClient,
    generationLogger,
  })
  const downloadProcessor = createVideoDownloadProcessor({
    repository,
    ossService,
    generationLogger,
  })
  const reconcileProcessor = createVideoReconcileProcessor({
    repository,
    dispatcher,
    generationLogger,
  })

  let syncEnqueuerRunning = false
  const runSyncEnqueuer = async () => {
    if (syncEnqueuerRunning) {
      workerLogger.warn({ queue: VIDEO_SYNC_QUEUE_NAME }, 'video sync enqueuer skipped because previous scan is still active')
      return
    }

    syncEnqueuerRunning = true
    try {
      const watchdog = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`video sync enqueuer timed out after ${SYNC_ENQUEUE_TIMEOUT_MS}ms`)), SYNC_ENQUEUE_TIMEOUT_MS)
        timer.unref?.()
      })
      await Promise.race([syncEnqueuer(), watchdog])
    } finally {
      syncEnqueuerRunning = false
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
    async (job: Job<VideoWorkerJob>) => syncTaskProcessor(job.data),
    {
      connection,
      concurrency: VIDEO_SYNC_CONCURRENCY,
    }
  )

  const downloadWorker = new Worker<VideoWorkerJob>(
    VIDEO_DOWNLOAD_QUEUE_NAME,
    async (job: Job<VideoWorkerJob>) => downloadProcessor(job.data),
    {
      connection,
      concurrency: VIDEO_DOWNLOAD_CONCURRENCY,
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

  downloadWorker.on('failed', (job, error) => {
    const errorDetails = classifyWorkerError(error)
    const logPayload = {
      queue: VIDEO_DOWNLOAD_QUEUE_NAME,
      jobId: job?.id,
      jobData: job?.data,
      ...errorDetails,
    }

    if (errorDetails.recoverable) {
      workerLogger.warn(logPayload, 'video download worker failed with recoverable error')
      return
    }

    workerLogger.error(logPayload, 'video download worker failed')
  })

  createWorker.on('error', (error) => {
    workerLogger.error({ queue: VIDEO_CREATE_QUEUE_NAME, ...classifyWorkerError(error) }, 'video create worker runtime error')
  })

  syncWorker.on('error', (error) => {
    workerLogger.error({ queue: VIDEO_SYNC_QUEUE_NAME, ...classifyWorkerError(error) }, 'video sync worker runtime error')
  })

  downloadWorker.on('error', (error) => {
    workerLogger.error({ queue: VIDEO_DOWNLOAD_QUEUE_NAME, ...classifyWorkerError(error) }, 'video download worker runtime error')
  })

  workerLogger.info(
    {
      queues: [VIDEO_CREATE_QUEUE_NAME, VIDEO_SYNC_QUEUE_NAME, VIDEO_DOWNLOAD_QUEUE_NAME],
    },
    'video worker service started'
  )

  void runSyncEnqueuer().catch((error) => {
    workerLogger.error(
      { queue: VIDEO_SYNC_QUEUE_NAME, ...classifyWorkerError(error) },
      'initial video sync enqueuer failed'
    )
  })

  const syncTimer = setInterval(() => {
    void runSyncEnqueuer().catch((error) => {
      workerLogger.error(
        { queue: VIDEO_SYNC_QUEUE_NAME, ...classifyWorkerError(error) },
        'video sync enqueuer failed'
      )
    })
  }, VIDEO_SYNC_SCAN_INTERVAL_MS)
  syncTimer.unref?.()

  const downloadTimer = setInterval(() => {
    void (async () => {
      const now = new Date()
      const tasks = await repository.listDownloadableTasks({ now, limit: VIDEO_SYNC_SCAN_BATCH_SIZE })
      await Promise.all(
        tasks.map((task) => dispatcher.enqueueDownload(task.id))
      )
    })().catch((error) => {
      workerLogger.error(
        { queue: VIDEO_DOWNLOAD_QUEUE_NAME, ...classifyWorkerError(error) },
        'video download enqueuer failed'
      )
    })
  }, DEFAULT_DOWNLOAD_POLL_INTERVAL_MS)
  downloadTimer.unref?.()

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
    downloadWorker,
    syncTimer,
    downloadTimer,
    reconcileTimer,
  }
}

if (require.main === module) {
  startVideoWorkers()
}
