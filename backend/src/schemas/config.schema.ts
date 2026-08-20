import { z } from 'zod'

const isValidArkDefaultGroupId = (value: string) => /^group-[^-]+-.+$/.test(value.trim())
const isBooleanString = (value: string) => value === 'true' || value === 'false'
const isArkProjectNameMode = (value: string) => value === 'project_code' || value === 'default_value'

export const updateConfigSchema = z.object({
  items: z.array(
    z
      .object({
        key: z.string().trim().min(1),
        value: z.string(),
      })
      .superRefine((item, ctx) => {
        if (item.key === 'ark_default_group_id' && !isValidArkDefaultGroupId(item.value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['value'],
            message: 'ark_default_group_id 必须是合法素材组 ID，例如 group-1712300000000-abcd1234',
          })
        }

        if (item.key === 'ark_default_sync_enabled' && !isBooleanString(item.value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['value'],
            message: 'ark_default_sync_enabled 仅支持 true 或 false',
          })
        }

        if (item.key === 'oss_server_internal_enabled' && !isBooleanString(item.value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['value'],
            message: 'oss_server_internal_enabled 仅支持 true 或 false',
          })
        }

        if (item.key === 'ark_project_name_mode' && !isArkProjectNameMode(item.value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['value'],
            message: 'ark_project_name_mode 仅支持 project_code 或 default_value',
          })
        }
      })
  ),
})

export const configArkAssetGroupsListSchema = z.object({
  accessKey: z.string().trim().optional(),
  secretKey: z.string().trim().optional(),
})

export const configCreateArkAssetGroupSchema = configArkAssetGroupsListSchema.extend({
  name: z.string().trim().min(1, 'name 必填').max(64, 'name 不能超过 64 个字符'),
  description: z.string().trim().max(255, 'description 不能超过 255 个字符').optional(),
})

const videoProviderCapabilitiesSchema = z.object({
  version: z.number().int().positive(),
  models: z.array(z.object({
    id: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(128),
    duration: z.object({ min: z.number().int().min(1), max: z.number().int().min(1), auto: z.boolean().optional() }),
    resolutions: z.array(z.string().trim().min(1)).min(1),
    aspectRatios: z.array(z.string().trim().min(1)).min(1),
    operations: z.array(z.enum(['generate', 'edit', 'extend'])).min(1),
    supports: z.object({
      firstLastFrame: z.boolean(), referenceImage: z.boolean(), referenceVideo: z.boolean(), referenceAudio: z.boolean(),
      audioOnlyReference: z.boolean().optional(), generateAudio: z.boolean(), outputFormat: z.boolean().optional(),
    }),
  })).min(1),
})

export const createVideoProviderSchema = z.object({
  providerKey: z.string().trim().min(2).max(64),
  name: z.string().trim().min(1).max(128),
  providerType: z.enum(['toapis', 'volcano_ark']),
  endpoint: z.url().max(512),
  apiKey: z.string().trim().min(1).max(2048),
  enabled: z.boolean().optional(),
  capabilities: videoProviderCapabilitiesSchema.optional(),
})

export const updateVideoProviderSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  endpoint: z.url().max(512).optional(),
  apiKey: z.string().max(2048).optional(),
  enabled: z.boolean().optional(),
  capabilities: videoProviderCapabilitiesSchema.optional(),
})
