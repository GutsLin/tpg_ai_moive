import Router from '@koa/router'

import { VideoGenerationLogsController } from '../controllers/video-generation-logs.controller'
import { authMiddleware } from '../middleware/auth'
import { projectContextMiddleware } from '../middleware/project-context'
import { requireAdmin } from '../middleware/require-admin'
import { deleteVideoGenerationLogsSchema, listVideoGenerationLogsQuerySchema } from '../schemas/video-generation-logs.schema'
import type { ProjectAccessRepository } from '../services/project-access.service'
import {
  VideoGenerationLogService,
  type VideoGenerationLogRepository,
} from '../services/video-generation-log.service'

export const createVideoGenerationLogsRouter = (
  repository: VideoGenerationLogRepository,
  projectAccessRepository?: ProjectAccessRepository
): Router => {
  const router = new Router({ prefix: '/api/video-generation-logs' })
  const controller = new VideoGenerationLogsController(new VideoGenerationLogService(repository))

  router.use(authMiddleware(), requireAdmin(), projectContextMiddleware(projectAccessRepository))

  router.get('/', async (ctx) => {
    await controller.list(ctx, listVideoGenerationLogsQuerySchema.parse(ctx.request.query))
  })

  router.delete('/', async (ctx) => {
    await controller.deleteRange(ctx, deleteVideoGenerationLogsSchema.parse(ctx.request.body))
  })

  return router
}
