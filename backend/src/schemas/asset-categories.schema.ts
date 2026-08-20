import { z } from 'zod'

export const createAssetCategorySchema = z.object({
  name: z.string().trim().min(1).max(64),
  sortOrder: z.coerce.number().int().min(0).max(32767).default(0),
  syncEnabled: z.boolean().optional(),
})

export const updateAssetCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    sortOrder: z.coerce.number().int().min(0).max(32767).optional(),
    syncEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少提供一个更新字段',
  })

export const deleteAssetCategorySchema = z.object({
  targetCategoryId: z.coerce.number().int().positive().nullable().optional(),
})
