import request from '../utils/request'

export interface ConfigItem {
  key: string
  value: string
  isSecret: boolean
  description: string | null
}

export interface ConfigListResponse {
  items: ConfigItem[]
}

export interface PublicBrandingResponse {
  systemName: string
  logoUrl: string | null
}

export const getConfigItems = async (): Promise<ConfigListResponse> => {
  const response = await request.get<ConfigListResponse>('/api/config')
  return response.data
}

export const getPublicBranding = async (): Promise<PublicBrandingResponse> => {
  const response = await request.get<PublicBrandingResponse>('/api/config/branding')
  return response.data
}

export const updateConfigItems = async (items: Array<{ key: string; value: string }>): Promise<void> => {
  await request.put('/api/config', { items })
}

export type ApiKeyMode = 'global' | 'per_member'

export interface ApiKeyModeResponse {
  mode: ApiKeyMode
}

export const getApiKeyMode = async (): Promise<ApiKeyModeResponse> => {
  const response = await request.get<ApiKeyModeResponse>('/api/config/api-key-mode')
  return response.data
}

export const setApiKeyMode = async (mode: ApiKeyMode): Promise<ApiKeyModeResponse> => {
  const response = await request.put<ApiKeyModeResponse>('/api/config/api-key-mode', { mode })
  return response.data
}
