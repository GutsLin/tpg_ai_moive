import OSS from 'ali-oss'

import { getAssetStsToken } from '../api/assets'

const normalizeFileName = (name: string) => name.replace(/[^\w.-]+/g, '-').toLowerCase()

const buildObjectKey = (prefix: string, file: File, options?: { projectId: number; namespace: 'infinite-atelier' }) => {
  const identifier =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  const normalizedPrefix = `${prefix.replace(/\/+$/, '')}/`
  const isolatedPrefix = options ? `${normalizedPrefix}projects/${options.projectId}/${options.namespace}/` : normalizedPrefix
  return `${isolatedPrefix}${identifier}-${normalizeFileName(file.name)}`
}

export const uploadFileToOss = async (
  file: File,
  onProgress?: (percent: number) => void,
  options?: { projectId: number; namespace: 'infinite-atelier' }
): Promise<{ ossKey: string }> => {
  const sts = await getAssetStsToken()
  const ossKey = buildObjectKey(sts.keyPrefix, file, options)

  const client = new (OSS as any)({
    region: sts.region,
    bucket: sts.bucket,
    accessKeyId: sts.credentials.accessKeyId,
    accessKeySecret: sts.credentials.accessKeySecret,
    stsToken: sts.credentials.securityToken,
    secure: true,
  })

  await client.put(ossKey, file, {
    progress: async (progress: number) => {
      onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))))
    },
  })

  onProgress?.(100)

  return { ossKey }
}
