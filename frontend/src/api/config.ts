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

export interface ConfigArkAssetGroupItem {
  id: string
  name: string
  description: string | null
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

export const listConfigArkAssetGroups = async (payload: {
  accessKey?: string
  secretKey?: string
} = {}): Promise<{ items: ConfigArkAssetGroupItem[] }> => {
  const response = await request.post<{ items: ConfigArkAssetGroupItem[] }>('/api/config/ark/asset-groups/list', payload)
  return response.data
}

export const createConfigArkAssetGroup = async (payload: {
  accessKey?: string
  secretKey?: string
  name: string
  description?: string
}): Promise<ConfigArkAssetGroupItem> => {
  const response = await request.post<ConfigArkAssetGroupItem>('/api/config/ark/asset-groups', payload)
  return response.data
}
