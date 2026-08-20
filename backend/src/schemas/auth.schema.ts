import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'username 必填'),
  password: z.string().min(1, 'password 必填'),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'currentPassword 必填'),
  newPassword: z.string().min(8, 'newPassword 至少 8 位'),
})
