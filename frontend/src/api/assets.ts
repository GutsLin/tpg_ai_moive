import request from '../utils/request'

export type AssetType = 'Image' | 'Video' | 'Audio'
export type AssetStatus = 'pending' | 'processing' | 'active' | 'failed' | 'deleting'
export type AssetSyncMode = 'inherit' | 'enabled' | 'disabled'

export interface AssetItem {
  id: number
  name: string
  uploaderName?: string | null
  projectId?: number
  assetType: AssetType
  categoryId: number | null
  groupSyncEnabled?: boolean | null
  syncMode?: AssetSyncMode
  effectiveSync?: boolean
  syncProvider?: 'toapis' | 'volcano_ark' | null
  projectIds?: number[]
  projectNames?: string[]
  ossKey?: string
  sourceUrl?: string
  arkGroupId?: string | null
  arkAssetId: string | null
  arkStatus: AssetStatus
  arkError?: string | null
  thumbnailUrl: string
  projects?: Array<{ id: number; name: string }>
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface AssetListResponse {
  items: AssetItem[]
  total: number
  scope?: 'project' | 'global'
}

export interface AssetStsTokenResponse {
  credentials: {
    accessKeyId: string
    accessKeySecret: string
    securityToken: string
    expiration: string
  }
  bucket: string
  region: string
  keyPrefix: string
}

export interface CreateAssetPayload {
  name: string
  assetType: AssetType
  categoryId: number | null
  syncMode?: AssetSyncMode
  ossKey: string
  tags: string[]
  linkProjectIds?: number[]
}

export interface CreateAssetResponse {
  id: number
  name: string
  uploaderName?: string | null
  projectId?: number
  assetType: AssetType
  categoryId: number | null
  groupSyncEnabled?: boolean | null
  syncMode?: AssetSyncMode
  effectiveSync?: boolean
  projectIds?: number[]
  projectNames?: string[]
  ossKey: string
  sourceUrl?: string
  arkGroupId: string | null
  arkAssetId: string | null
  arkStatus: AssetStatus
  arkError: string | null
  projects?: Array<{ id: number; name: string }>
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface AssetQueryParams {
  scope?: 'project' | 'global'
  status?: string
  keyword?: string
  uploader?: string
  assetType?: string
  categoryId?: number
  page?: number
  pageSize?: number
}

const buildQuery = (params: AssetQueryParams): string => {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })

  const query = search.toString()
  return query ? `?${query}` : ''
}

export const getAssets = async (params: AssetQueryParams = {}): Promise<AssetListResponse> => {
  const response = await request.get<AssetListResponse>(`/api/assets${buildQuery(params)}`)
  return response.data
}

export const getAssetDetail = async (id: number): Promise<AssetItem> => {
  const response = await request.get<AssetItem>(`/api/assets/${id}`)
  return response.data
}

export const createAsset = async (payload: CreateAssetPayload): Promise<CreateAssetResponse> => {
  const response = await request.post<CreateAssetResponse>('/api/assets', payload)
  return response.data
}

export const checkAssetNameAvailable = async (
  name: string,
  linkProjectIds: number[] = []
): Promise<{ available: boolean }> => {
  const query = new URLSearchParams()
  query.set('name', name)
  linkProjectIds.forEach((projectId) => {
    query.append('linkProjectIds', String(projectId))
  })

  const response = await request.get<{ available: boolean }>(`/api/assets/name-available?${query.toString()}`)
  return response.data
}

export const updateAsset = async (
  id: number,
  payload: { categoryId?: number | null; syncMode?: AssetSyncMode }
): Promise<AssetItem> => {
  const response = await request.patch<AssetItem>(`/api/assets/${id}`, payload)
  return response.data
}

export const deleteAsset = async (
  id: number
): Promise<{ assetId: number; operation: 'unlinked' | 'physical_delete_queued'; remainingProjectCount: number; asset?: AssetItem }> => {
  const response = await request.delete<{ assetId: number; operation: 'unlinked' | 'physical_delete_queued'; remainingProjectCount: number; asset?: AssetItem }>(
    `/api/assets/${id}`
  )
  return response.data
}

export const syncAssets = async (): Promise<{ count: number }> => {
  const response = await request.post<{ count: number }>('/api/assets/sync')
  return response.data
}

export const batchSyncAssets = async (assetIds: number[]): Promise<{ count: number }> => {
  const response = await request.post<{ count: number }>('/api/assets/batch-sync', { assetIds })
  return response.data
}

export const linkAssetProjects = async (id: number, projectIds: number[]): Promise<AssetItem> => {
  const response = await request.post<AssetItem>(`/api/assets/${id}/projects`, { projectIds })
  return response.data
}

export const unlinkAssetProject = async (
  id: number,
  projectId: number
): Promise<{ assetId: number; operation: 'unlinked' | 'orphaned'; remainingProjectCount: number }> => {
  const response = await request.delete<{ assetId: number; operation: 'unlinked' | 'orphaned'; remainingProjectCount: number }>(
    `/api/assets/${id}/projects/${projectId}`
  )
  return response.data
}

export const getAssetStsToken = async (): Promise<AssetStsTokenResponse> => {
  const response = await request.post<AssetStsTokenResponse>('/api/assets/sts-token')
  return response.data
}
