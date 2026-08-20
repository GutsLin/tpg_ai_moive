import { z } from 'zod'

export const projectRoleSchema = z.enum(['manager', 'member', 'viewer'])

export const projectIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(1000).nullable().optional().default(null),
  coverAssetId: z.coerce.number().int().positive().nullable().optional().default(null),
})

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    coverAssetId: z.coerce.number().int().positive().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少提供一个更新字段',
  })

export const replaceProjectMembersSchema = z.object({
  members: z
    .array(
      z.object({
        userId: z.coerce.number().int().positive(),
        projectRole: projectRoleSchema,
      })
    )
    .default([])
    .superRefine((members, ctx) => {
      const userIds = members.map((member) => member.userId)
      if (new Set(userIds).size !== userIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '成员用户不能重复',
        })
      }
    }),
})
