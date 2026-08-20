import request from '../utils/request'

export interface VideoProviderAdmin {
  id: number
  providerKey: string
  name: string
  providerType: 'toapis' | 'volcano_ark'
  endpoint: string
  enabled: boolean
  isDefault: boolean
  apiKeyMasked: string
  capabilities: unknown
}

export const getVideoProviders = async (): Promise<{ items: VideoProviderAdmin[] }> => {
  const response = await request.get<{ items: VideoProviderAdmin[] }>('/api/config/video-providers')
  return response.data
}

export const createVideoProvider = async (payload: {
  providerKey: string
  name: string
  providerType: 'toapis' | 'volcano_ark'
  endpoint: string
  apiKey: string
}) => {
  const response = await request.post<VideoProviderAdmin>('/api/config/video-providers', payload)
  return response.data
}

export const updateVideoProvider = async (id: number, payload: {
  name?: string
  endpoint?: string
  apiKey?: string
  enabled?: boolean
}) => {
  const response = await request.patch<VideoProviderAdmin>(`/api/config/video-providers/${id}`, payload)
  return response.data
}

export const activateVideoProvider = async (id: number) => {
  const response = await request.post<VideoProviderAdmin>(`/api/config/video-providers/${id}/activate`)
  return response.data
}
