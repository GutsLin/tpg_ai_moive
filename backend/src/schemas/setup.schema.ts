import { z } from 'zod'

const arkDefaultGroupIdRule = z
  .string()
  .trim()
  .min(1, 'config.arkDefaultGroupId 必填')
  .regex(/^group-[^-]+-.+$/, 'config.arkDefaultGroupId 必须是合法素材组 ID，例如 group-1712300000000-abcd1234')

export const setupInitializeSchema = z.object({
  admin: z.object({
    username: z.string().trim().min(1, 'admin.username 必填'),
    password: z.string().min(8, 'admin.password 至少 8 位'),
  }),
  config: z.object({
    systemName: z.string().trim().min(1, 'config.systemName 必填').max(64, 'config.systemName 不能超过 64 个字符'),
    arkApiKey: z.string().trim().min(1, 'config.arkApiKey 必填'),
    arkAccessKey: z.string().trim().min(1, 'config.arkAccessKey 必填'),
    arkSecretKey: z.string().trim().min(1, 'config.arkSecretKey 必填'),
    arkEndpoint: z.string().trim().url('config.arkEndpoint 必须是合法 URL'),
    arkDefaultGroupId: arkDefaultGroupIdRule,
    arkDefaultSyncEnabled: z.boolean(),
    ossAccessKeyId: z.string().trim().min(1, 'config.ossAccessKeyId 必填'),
    ossAccessKeySecret: z.string().trim().min(1, 'config.ossAccessKeySecret 必填'),
    ossStsRoleArn: z.string().trim().min(1, 'config.ossStsRoleArn 必填'),
    ossBucket: z.string().trim().min(1, 'config.ossBucket 必填'),
    ossRegion: z.string().trim().min(1, 'config.ossRegion 必填'),
    ossSignedUrlTtl: z.number().int().positive('config.ossSignedUrlTtl 必须大于 0'),
  }),
})

export const setupValidateOssSchema = z.object({
  accessKeyId: z.string().trim().min(1, 'accessKeyId 必填'),
  accessKeySecret: z.string().trim().min(1, 'accessKeySecret 必填'),
  bucket: z.string().trim().min(1, 'bucket 必填'),
  region: z.string().trim().min(1, 'region 必填'),
  stsRoleArn: z.string().trim().min(1, 'stsRoleArn 必填'),
})

export const setupValidateArkBearerSchema = z.object({
  apiKey: z.string().trim().min(1, 'apiKey 必填'),
  endpoint: z.string().trim().url('endpoint 必须是合法 URL'),
})

export const setupValidateArkAkskSchema = z.object({
  accessKey: z.string().trim().min(1, 'accessKey 必填'),
  secretKey: z.string().trim().min(1, 'secretKey 必填'),
})

export const setupListArkAssetGroupsSchema = setupValidateArkAkskSchema

export const setupCreateArkAssetGroupSchema = setupValidateArkAkskSchema.extend({
  name: z.string().trim().min(1, 'name 必填').max(64, 'name 不能超过 64 个字符'),
  description: z.string().trim().max(255, 'description 不能超过 255 个字符').optional(),
})
