import { z } from 'zod'

const projectAssignmentSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  projectRole: z.enum(['manager', 'member', 'viewer']),
})

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z
    .union([z.literal('0'), z.literal('1'), z.literal(0), z.literal(1)])
    .optional()
    .transform((value) => (value === undefined ? undefined : Number(value))),
})

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'user']),
  menuPerms: z.array(z.string().trim().min(1)).default([]),
  projects: z
    .array(projectAssignmentSchema)
    .default([])
    .superRefine((projects, ctx) => {
      const projectIds = projects.map((project) => project.projectId)
      if (new Set(projectIds).size !== projectIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '项目授权不能重复',
        })
      }
    }),
})

export const updateUserSchema = z
  .object({
    role: z.enum(['admin', 'user']).optional(),
    menuPerms: z.array(z.string().trim().min(1)).optional(),
    status: z.union([z.literal(0), z.literal(1)]).optional(),
    password: z.string().min(8).max(128).optional(),
    projects: z
      .array(projectAssignmentSchema)
      .optional()
      .superRefine((projects, ctx) => {
        if (!projects) {
          return
        }
        const projectIds = projects.map((project) => project.projectId)
        if (new Set(projectIds).size !== projectIds.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '项目授权不能重复',
          })
        }
      }),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少提供一个更新字段',
  })

export const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})
