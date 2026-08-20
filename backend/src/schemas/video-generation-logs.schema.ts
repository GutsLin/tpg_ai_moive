import { z } from 'zod'

const dateRangeSchema = z
  .object({
    dateFrom: z.string().datetime({ offset: true }),
    dateTo: z.string().datetime({ offset: true }),
  })
  .superRefine((value, ctx) => {
    if (new Date(value.dateFrom).getTime() > new Date(value.dateTo).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateTo'],
        message: '结束时间不能早于开始时间',
      })
    }
  })

export const listVideoGenerationLogsQuerySchema = z.object({
  taskId: z.coerce.number().int().positive().optional(),
  stage: z.string().trim().min(1).max(64).optional(),
  status: z.enum(['started', 'succeeded', 'failed', 'info']).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
})

export const deleteVideoGenerationLogsSchema = dateRangeSchema
