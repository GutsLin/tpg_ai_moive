import request from '../utils/request'

export interface SetupStatus {
  initialized: boolean
  environment: string
  version: string
  installMode: 'self_hosted'
  initializedAt: string | null
  branding?: {
    systemName?: string | null
  }
  health: {
    database: boolean
    redis: boolean
  }
}

export interface SetupInitializePayload {
  admin: {
    username: string
    password: string
  }
  config: {
    systemName: string
    arkApiKey: string
    arkAccessKey: string
    arkSecretKey: string
    arkEndpoint: string
    arkDefaultGroupId: string
    arkDefaultSyncEnabled: boolean
    ossAccessKeyId: string
    ossAccessKeySecret: string
    ossStsRoleArn: string
    ossBucket: string
    ossRegion: string
    ossSignedUrlTtl: number
  }
}

export interface SetupValidationResult {
  key: 'oss' | 'arkBearer' | 'arkAksk'
  valid: boolean
  canContinue: boolean
  message: string
}

export interface SetupArkAssetGroupItem {
  id: string
  name: string
  description: string | null
}

export const getSetupStatus = async (): Promise<SetupStatus> => {
  const response = await request.get<SetupStatus>('/api/setup/status')
  return response.data
}

export const initializeSetup = async (
  payload: SetupInitializePayload
): Promise<{ success: boolean }> => {
  const response = await request.post<{ success: boolean }>('/api/setup/initialize', payload)
  return response.data
}

export const validateSetupOss = async (payload: {
  accessKeyId: string
  accessKeySecret: string
  bucket: string
  region: string
  stsRoleArn: string
}): Promise<SetupValidationResult> => {
  const response = await request.post<SetupValidationResult>('/api/setup/validate/oss', payload)
  return response.data
}

export const validateSetupArkBearer = async (payload: {
  apiKey: string
  endpoint: string
}): Promise<SetupValidationResult> => {
  const response = await request.post<SetupValidationResult>('/api/setup/validate/ark-bearer', payload)
  return response.data
}

export const validateSetupArkAksk = async (payload: {
  accessKey: string
  secretKey: string
}): Promise<SetupValidationResult> => {
  const response = await request.post<SetupValidationResult>('/api/setup/validate/ark-aksk', payload)
  return response.data
}

export const listSetupArkAssetGroups = async (payload: {
  accessKey: string
  secretKey: string
}): Promise<{ items: SetupArkAssetGroupItem[] }> => {
  const response = await request.post<{ items: SetupArkAssetGroupItem[] }>('/api/setup/ark/asset-groups/list', payload)
  return response.data
}

export const createSetupArkAssetGroup = async (payload: {
  accessKey: string
  secretKey: string
  name: string
  description?: string
}): Promise<SetupArkAssetGroupItem> => {
  const response = await request.post<SetupArkAssetGroupItem>('/api/setup/ark/asset-groups', payload)
  return response.data
}
