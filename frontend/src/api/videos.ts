import request from '../utils/request'

export type VideoTaskStatus = 'pending' | 'processing' | 'succeeded' | 'failed'
export type VideoGenerateMode = 'frames' | 'omni'

export interface VideoContentText {
  type: 'text'
  text: string
}

export interface VideoContentImage {
  type: 'image_url'
  image_url: { url: string }
  assetId?: number
  role?: 'first_frame' | 'last_frame' | 'reference_image'
}

export interface VideoContentVideo {
  type: 'video_url'
  video_url: { url: string }
  assetId?: number
  role: 'reference_video'
}

export interface VideoContentAudio {
  type: 'audio_url'
  audio_url: { url: string }
  assetId?: number
  role: 'reference_audio'
}

export type VideoContentItem = VideoContentText | VideoContentImage | VideoContentVideo | VideoContentAudio

export interface VideoReplayDraftAsset {
  assetId: number
  role: 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio'
}

export interface VideoReplayDraft {
  mode: VideoGenerateMode
  model: string
  duration: number | null
  ratio: string | null
  resolution: string | null
  generateAudio: boolean
  promptRaw: string
  assets: VideoReplayDraftAsset[]
}

export interface VideoTaskItem {
  id: number
  userId: number
  projectId: number
  providerKey?: string | null
  providerSnapshot?: {
    name: string
    providerType: 'toapis' | 'volcano_ark'
  } | null
  arkTaskId?: string | null
  status: VideoTaskStatus
  mode?: VideoGenerateMode | null
  model: string
  prompt: string
  promptRaw: string
  duration: number | null
  ratio: string | null
  resolution: string | null
  generateAudio: boolean
  createdAt: string
  updatedAt: string
  errorMessage: string | null
  nextPollAt?: string | null
  lastArkStatus?: string | null
  lastArkStatusChangedAt?: string | null
  lastPolledAt?: string | null
  videoUrl: string | null
  elapsedSeconds?: number | null
  estimatedTotalSeconds?: number | null
  estimateSampleSize?: number | null
  replayDraft?: VideoReplayDraft | null
}

export interface VideoTasksResponse {
  items: VideoTaskItem[]
  total: number
}

export interface CreateVideoTaskPayload {
  providerKey: string
  mode: VideoGenerateMode
  model: string
  operation: 'generate' | 'edit' | 'extend'
  outputFormat: 'mp4' | 'mov'
  prompt: string
  promptRaw: string
  duration: number
  ratio: string
  resolution: string
  generateAudio: boolean
  content: VideoContentItem[]
}

export interface VideoProviderModelCapability {
  id: string
  label: string
  duration: { min: number; max: number; auto?: boolean }
  resolutions: string[]
  aspectRatios: string[]
  operations: Array<'generate' | 'edit' | 'extend'>
  supports: {
    firstLastFrame: boolean
    referenceImage: boolean
    referenceVideo: boolean
    referenceAudio: boolean
    audioOnlyReference?: boolean
    generateAudio: boolean
    outputFormat?: boolean
  }
  referenceLimits?: {
    image: number
    video: number
    audio: number
  }
}

export interface ActiveVideoProvider {
  providerKey: string
  name: string
  providerType: 'toapis' | 'volcano_ark'
  capabilities: { version: number; models: VideoProviderModelCapability[] }
  referenceLimits?: {
    image: number
    video: number
    audio: number
  }
}

export interface VideoAnalyticsOverview {
  totalRequests: number
  successRate: number
  avgDurationSeconds: number
  totalTokensConsumed: number
  totalTokensSucceeded: number
  avgTokensPerTask: number
}

export interface VideoStatusDistributionItem {
  status: VideoTaskStatus
  count: number
}

export interface VideoModelDistributionItem {
  model: string
  count: number
}

export interface VideoUserTokenDistributionItem {
  userId: number
  userName: string
  requestCount: number
  totalTokens: number
  shareRatio: number
}

export interface VideoAnalyticsResponse {
  overview: VideoAnalyticsOverview
  statusDistribution: VideoStatusDistributionItem[]
  modelDistribution: VideoModelDistributionItem[]
  userTokenDistribution: VideoUserTokenDistributionItem[]
}

export interface VideoAnalyticsQuery {
  mine?: boolean
  dateFrom?: string
  dateTo?: string
  model?: string
  status?: VideoTaskStatus
}

export const getVideoTasks = async (params: {
  mine?: boolean
  status?: VideoTaskStatus
  mode?: VideoGenerateMode
  q?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
} = {}): Promise<VideoTasksResponse> => {
  const response = await request.get<VideoTasksResponse>('/api/videos', { params })
  return response.data
}

export const getActiveVideoProvider = async (): Promise<ActiveVideoProvider> => {
  const response = await request.get<ActiveVideoProvider>('/api/videos/provider')
  return response.data
}

export const getVideoTask = async (id: number): Promise<VideoTaskItem> => {
  const response = await request.get<VideoTaskItem>(`/api/videos/${id}`)
  return response.data
}

export const getVideoAnalytics = async (params: VideoAnalyticsQuery = {}): Promise<VideoAnalyticsResponse> => {
  const response = await request.get<VideoAnalyticsResponse>('/api/videos/analytics', { params })
  return response.data
}

export const exportVideoAnalytics = async (
  params: VideoAnalyticsQuery & { scope?: 'current' | 'all' } = {}
): Promise<Blob> => {
  const response = await request.get<Blob>('/api/videos/analytics/export', {
    params,
    responseType: 'blob',
  })

  // The shared response interceptor unwraps response.data at runtime.
  return response as unknown as Blob
}

export const createVideoTask = async (payload: CreateVideoTaskPayload): Promise<VideoTaskItem> => {
  const response = await request.post<VideoTaskItem>('/api/videos', payload)
  return response.data
}

export const syncVideoTask = async (id: number): Promise<VideoTaskItem> => {
  const response = await request.post<VideoTaskItem>(`/api/videos/${id}/sync`)
  return response.data
}
