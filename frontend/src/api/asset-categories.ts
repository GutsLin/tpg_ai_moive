import request from '../utils/request'

export interface AssetCategoryItem {
  id: number
  name: string
  sortOrder: number
  syncEnabled?: boolean
  arkGroupId?: string | null
  assetCount: number
}

export interface AssetCategoryListResponse {
  items: AssetCategoryItem[]
}

export const getAssetCategories = async (): Promise<AssetCategoryListResponse> => {
  const response = await request.get<AssetCategoryListResponse>('/api/asset-categories')
  return response.data
}

export const createAssetCategory = async (payload: { name: string; sortOrder: number; syncEnabled?: boolean }): Promise<AssetCategoryItem> => {
  const response = await request.post<AssetCategoryItem>('/api/asset-categories', payload)
  return response.data
}

export const updateAssetCategory = async (
  id: number,
  payload: { name?: string; sortOrder?: number; syncEnabled?: boolean }
): Promise<AssetCategoryItem> => {
  const response = await request.patch<AssetCategoryItem>(`/api/asset-categories/${id}`, payload)
  return response.data
}

export const deleteAssetCategory = async (
  id: number,
  payload?: { targetCategoryId?: number | null }
): Promise<{ affectedAssets: number; deleted: boolean; targetCategoryId?: number | null }> => {
  const query = new URLSearchParams()
  if (payload?.targetCategoryId !== undefined && payload.targetCategoryId !== null) {
    query.set('targetCategoryId', String(payload.targetCategoryId))
  }

  const response = await request.delete<{ affectedAssets: number; deleted: boolean; targetCategoryId?: number | null }>(
    `/api/asset-categories/${id}${query.toString() ? `?${query.toString()}` : ''}`,
    { data: payload }
  )
  return response.data
}
