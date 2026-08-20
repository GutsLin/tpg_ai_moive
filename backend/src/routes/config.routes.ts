import Router from '@koa/router'
import { z } from 'zod'

import { ConfigController } from '../controllers/config.controller'
import { authMiddleware } from '../middleware/auth'
import { requireAdmin } from '../middleware/require-admin'
import { configArkAssetGroupsListSchema, configCreateArkAssetGroupSchema, createVideoProviderSchema, updateConfigSchema, updateVideoProviderSchema } from '../schemas/config.schema'
import type { ConfigService } from '../services/config.service'
import type { OssServiceContract } from '../services/oss.service'
import { VideoProviderService } from '../services/video-provider.service'

export const createConfigRouter = (configService: ConfigService, ossService: OssServiceContract): Router => {
  const router = new Router({ prefix: '/api/config' })
  const controller = new ConfigController(configService, ossService, new VideoProviderService(configService))

  router.get('/branding', controller.publicBranding)

  router.use(authMiddleware(), requireAdmin())

  router.get('/', controller.list)
  router.get('/video-providers', controller.listVideoProviders)
  router.post('/video-providers', async (ctx) => {
    await controller.createVideoProvider(ctx, createVideoProviderSchema.parse(ctx.request.body))
  })
  router.patch('/video-providers/:id', async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    await controller.updateVideoProvider(ctx, id, updateVideoProviderSchema.parse(ctx.request.body))
  })
  router.post('/video-providers/:id/activate', async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    await controller.activateVideoProvider(ctx, id)
  })
  router.put('/', async (ctx) => {
    const payload = updateConfigSchema.parse(ctx.request.body)
    await controller.update(ctx, payload)
  })
  router.post('/ark/asset-groups/list', async (ctx) => {
    const payload = configArkAssetGroupsListSchema.parse(ctx.request.body)
    await controller.listArkAssetGroups(ctx, payload)
  })
  router.post('/ark/asset-groups', async (ctx) => {
    const payload = configCreateArkAssetGroupSchema.parse(ctx.request.body)
    await controller.createArkAssetGroup(ctx, payload)
  })

  return router
}
