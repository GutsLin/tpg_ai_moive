import request from '../utils/request'

export type VideoGenerationLogStatus = 'started' | 'succeeded' | 'failed' | 'info'

export interface VideoGenerationLogItem {
  id: number
  videoTaskId: number | null
  projectId: number
  userId: number | null
  userName: string | null
  traceId: string
  stage: string
  action: string
  status: VideoGenerationLogStatus
  message: string
  requestPayload: unknown
  responsePayload: unknown
  durationMs: number | null
  errorMessage: string | null
  createdAt: string
}

export interface VideoGenerationLogsResponse {
  items: VideoGenerationLogItem[]
  total: number
}

export interface VideoGenerationLogQuery {
  taskId?: number
  stage?: string
  status?: VideoGenerationLogStatus
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export const getVideoGenerationLogs = async (
  params: VideoGenerationLogQuery = {}
): Promise<VideoGenerationLogsResponse> => {
  const response = await request.get<VideoGenerationLogsResponse>('/api/video-generation-logs', { params })
  return response.data
}

export const deleteVideoGenerationLogs = async (payload: {
  dateFrom: string
  dateTo: string
}): Promise<{ deletedCount: number }> => {
  const response = await request.delete<{ deletedCount: number }>('/api/video-generation-logs', { data: payload })
  return response.data
}
