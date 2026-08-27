import Router from '@koa/router'
import { z } from 'zod'

import { UserApiKeysController } from '../controllers/user-api-keys.controller'
import { authMiddleware } from '../middleware/auth'
import { requireAdmin } from '../middleware/require-admin'
import { upsertUserApiKeysSchema } from '../schemas/user-api-keys.schema'
import type { UserApiKeyService } from '../services/user-api-key.service'
import type { ConfigService } from '../services/config.service'
import type { VideoProviderService } from '../services/video-provider.service'

export const createUserApiKeysRouter = (
  userApiKeyService: UserApiKeyService,
  configService: ConfigService,
  videoProviderService: VideoProviderService
): Router => {
  const router = new Router({ prefix: '/api' })
  const controller = new UserApiKeysController(userApiKeyService, configService, videoProviderService)

  // GET /api/me/api-keys — any authenticated user can view their own keys (masked)
  router.get('/me/api-keys', authMiddleware(), async (ctx) => {
    await controller.listMine(ctx)
  })

  // GET /api/users/:id/api-keys — admin only
  // PUT /api/users/:id/api-keys — admin only
  // DELETE /api/users/:id/api-keys/:providerKey — admin only
  // GET /api/users/api-keys/export — admin only (CSV download)
  // POST /api/users/api-keys/import — admin only (CSV upload)
  router.use('/users/:id/api-keys', authMiddleware(), requireAdmin())
  router.use('/users/api-keys', authMiddleware(), requireAdmin())

  router.get('/users/api-keys/export', async (ctx) => {
    await controller.exportApiKeys(ctx)
  })

  router.post('/users/api-keys/import', async (ctx) => {
    const csvText = typeof ctx.request.body === 'string'
      ? ctx.request.body
      : (ctx.request.body as { csv?: string })?.csv ?? ''
    await controller.importApiKeys(ctx, csvText)
  })

  router.get('/users/:id/api-keys', async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    await controller.listByUser(ctx, id)
  })

  router.put('/users/:id/api-keys', async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    const payload = upsertUserApiKeysSchema.parse(ctx.request.body)
    await controller.upsertByUser(ctx, id, payload)
  })

  router.delete('/users/:id/api-keys/:providerKey', async (ctx) => {
    const { id, providerKey } = z
      .object({
        id: z.coerce.number().int().positive(),
        providerKey: z.string().trim().min(1).max(64),
      })
      .parse(ctx.params)
    await controller.deleteByUser(ctx, id, providerKey)
  })

  // GET /api/config/api-key-mode — any authenticated user
  // PUT /api/config/api-key-mode — admin only
  router.get('/config/api-key-mode', authMiddleware(), async (ctx) => {
    await controller.getApiKeyMode(ctx)
  })

  router.put('/config/api-key-mode', authMiddleware(), requireAdmin(), async (ctx) => {
    const { mode } = z.object({ mode: z.enum(['global', 'per_member']) }).parse(ctx.request.body)
    await controller.setApiKeyMode(ctx, { mode })
  })

  return router
}
