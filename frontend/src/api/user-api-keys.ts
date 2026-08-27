import request from '../utils/request'

export interface UserApiKeyItem {
  providerKey: string
  apiKeyMasked: string
  enabled: boolean
  updatedAt: string
}

export interface UserApiKeysResponse {
  items: UserApiKeyItem[]
}

export const getUserApiKeys = async (userId: number): Promise<UserApiKeysResponse> => {
  const response = await request.get<UserApiKeysResponse>(`/api/users/${userId}/api-keys`)
  return response.data
}

export const upsertUserApiKeys = async (
  userId: number,
  keys: Array<{ providerKey: string; apiKey: string }>
): Promise<UserApiKeysResponse> => {
  const response = await request.put<UserApiKeysResponse>(`/api/users/${userId}/api-keys`, { keys })
  return response.data
}

export const deleteUserApiKey = async (userId: number, providerKey: string): Promise<void> => {
  await request.delete(`/api/users/${userId}/api-keys/${providerKey}`)
}

export const getMyApiKeys = async (): Promise<UserApiKeysResponse> => {
  const response = await request.get<UserApiKeysResponse>('/api/me/api-keys')
  return response.data
}

export interface BatchImportResult {
  total: number
  imported: number
  skipped: number
  errors: string[]
}

export const exportUserApiKeysCsv = async (): Promise<Blob> => {
  const response = await request.get<Blob>('/api/users/api-keys/export', {
    responseType: 'blob',
  })

  // The shared response interceptor unwraps response.data at runtime.
  return response as unknown as Blob
}

export const importUserApiKeysCsv = async (csvText: string): Promise<BatchImportResult> => {
  const response = await request.post<{ code: number; data: BatchImportResult }>('/api/users/api-keys/import', { csv: csvText })
  return (response as unknown as { data: BatchImportResult }).data
}
