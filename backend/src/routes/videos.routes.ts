import Router from '@koa/router'
import { z } from 'zod'

import { VideosController } from '../controllers/videos.controller'
import { authMiddleware } from '../middleware/auth'
import { projectContextMiddleware } from '../middleware/project-context'
import { ConfigService, type ConfigStore } from '../services/config.service'
import { type OssServiceContract } from '../services/oss.service'
import type { ProjectAccessRepository } from '../services/project-access.service'
import type { VideoGenerationLogger } from '../services/video-generation-log.service'
import { VideoService, type VideoAssetReferenceResolver, type VideoDispatcher, type VideoRepository } from '../services/video.service'
import { VideoProviderService } from '../services/video-provider.service'
import {
  analyticsVideosQuerySchema,
  createVideoSchema,
  exportAnalyticsVideosQuerySchema,
  listVideosQuerySchema,
} from '../schemas/videos.schema'

export const createVideosRouter = (
  videoRepository: VideoRepository | undefined,
  videoDispatcher: VideoDispatcher | undefined,
  ossService: OssServiceContract,
  configStore?: ConfigStore,
  projectAccessRepository?: ProjectAccessRepository,
  assetReferenceResolver?: VideoAssetReferenceResolver,
  generationLogger?: VideoGenerationLogger
): Router => {
  const router = new Router({ prefix: '/api/videos' })
  const controller = new VideosController(
    new VideoService(
      videoRepository,
      videoDispatcher,
      ossService,
      new ConfigService({ store: configStore }),
      assetReferenceResolver,
      generationLogger,
      new VideoProviderService(new ConfigService({ store: configStore }))
    )
  )

  router.use(authMiddleware(), projectContextMiddleware(projectAccessRepository))

  router.get('/provider', controller.provider)

  router.post('/', async (ctx) => {
    const payload = createVideoSchema.parse(ctx.request.body)
    await controller.create(ctx, payload)
  })

  router.get('/', async (ctx) => {
    const query = listVideosQuerySchema.parse(ctx.request.query)
    await controller.list(ctx, query)
  })

  router.get('/analytics', async (ctx) => {
    const query = analyticsVideosQuerySchema.parse(ctx.request.query)
    await controller.analytics(ctx, query)
  })

  router.get('/analytics/export', async (ctx) => {
    const query = exportAnalyticsVideosQuerySchema.parse(ctx.request.query)
    await controller.exportAnalytics(ctx, query)
  })

  router.get('/:id', async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    await controller.detail(ctx, id)
  })

  router.post('/:id/sync', async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    await controller.sync(ctx, id)
  })

  return router
}
