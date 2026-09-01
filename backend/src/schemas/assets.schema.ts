import { z } from 'zod'

const assetSyncModeSchema = z.enum(['inherit', 'enabled', 'disabled'])

export const createAssetSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1).max(128),
  assetType: z.enum(['Image', 'Video', 'Audio']),
  categoryId: z.coerce.number().int().positive().nullable().optional().default(null),
  syncMode: assetSyncModeSchema.optional(),
  ossKey: z.string().trim().min(1).max(512),
  tags: z.array(z.string().trim().min(1)).default([]),
  linkProjectIds: z.array(z.coerce.number().int().positive()).default([]),
  promptContent: z.string().max(10000).nullable().optional(),
})

export const updateAssetSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    categoryId: z.coerce.number().int().positive().nullable().optional(),
    syncMode: assetSyncModeSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少提供一个更新字段',
  })

export const listAssetsQuerySchema = z.object({
  scope: z.enum(['project', 'global']).optional(),
  status: z.string().optional(),
  keyword: z.string().optional(),
  uploader: z.string().optional(),
  assetType: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
})

export const checkAssetNameQuerySchema = z.object({
  name: z.string().trim().min(1).max(128),
  linkProjectIds: z
    .union([z.coerce.number().int().positive(), z.array(z.coerce.number().int().positive())])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return []
      }

      return Array.isArray(value) ? value : [value]
    }),
})

export const linkAssetProjectsSchema = z.object({
  projectIds: z.array(z.coerce.number().int().positive()).min(1),
})

export const batchSyncSchema = z.object({
  assetIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
})
