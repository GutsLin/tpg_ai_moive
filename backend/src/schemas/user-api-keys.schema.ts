import { z } from 'zod'

export const upsertUserApiKeysSchema = z.object({
  keys: z
    .array(
      z.object({
        providerKey: z.string().trim().min(1).max(64),
        apiKey: z.string().trim().min(1).max(256),
      })
    )
    .min(1)
    .max(10),
})

export const apiKeyModeSchema = z.object({
  mode: z.enum(['global', 'per_member']),
})
