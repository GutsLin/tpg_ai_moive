import { z } from 'zod'

const textContentSchema = z.object({
  type: z.literal('text'),
  text: z.string().trim().min(1).max(5000),
})

const imageContentSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string().trim().min(1).max(512),
  }),
  assetId: z.number().int().positive().optional(),
  role: z.enum(['first_frame', 'last_frame', 'reference_image']).optional(),
})

const videoContentSchema = z.object({
  type: z.literal('video_url'),
  video_url: z.object({
    url: z.string().trim().min(1).max(512),
  }),
  assetId: z.number().int().positive().optional(),
  role: z.literal('reference_video'),
})

const audioContentSchema = z.object({
  type: z.literal('audio_url'),
  audio_url: z.object({
    url: z.string().trim().min(1).max(512),
  }),
  assetId: z.number().int().positive().optional(),
  role: z.literal('reference_audio'),
})

export const createVideoSchema = z
  .object({
    providerKey: z.string().trim().min(1).max(64).optional(),
    mode: z.enum(['frames', 'omni']),
    model: z.string().trim().min(1).max(64),
    operation: z.enum(['generate', 'edit', 'extend']).default('generate'),
    outputFormat: z.enum(['mp4', 'mov']).default('mp4'),
    prompt: z.string().trim().min(1).max(5000),
    promptRaw: z.string().trim().min(1).max(5000),
    duration: z.number().int().min(-1).max(30),
    ratio: z.string().trim().min(1).max(16),
    resolution: z.string().trim().min(1).max(8),
    generateAudio: z.boolean().default(true),
    content: z
      .array(z.union([textContentSchema, imageContentSchema, videoContentSchema, audioContentSchema]))
      .min(1)
      .max(51),
  })
  .superRefine((value, ctx) => {
    if (value.mode !== 'frames') {
      return
    }

    value.content.forEach((item, index) => {
      if (item.type === 'video_url' || item.type === 'audio_url') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', index],
          message: '首尾帧模式暂不支持引用音频或视频素材',
        })
      }

      if (item.type === 'image_url' && item.role === 'reference_image') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', index, 'role'],
          message: '首尾帧模式仅支持首帧/尾帧图片',
        })
      }
    })
  })

export const listVideosQuerySchema = z.object({
  mine: z.coerce.boolean().optional(),
  status: z.enum(['pending', 'processing', 'succeeded', 'failed']).optional(),
  mode: z.enum(['frames', 'omni']).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
})

export const analyticsVideosQuerySchema = z.object({
  mine: z.coerce.boolean().optional(),
  status: z.enum(['pending', 'processing', 'succeeded', 'failed']).optional(),
  model: z.string().trim().min(1).max(64).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
})

export const exportAnalyticsVideosQuerySchema = analyticsVideosQuerySchema.extend({
  scope: z.enum(['current', 'all']).optional(),
})
