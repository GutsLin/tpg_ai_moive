import Router from '@koa/router'
import { z } from 'zod'

import { AssetsController } from '../controllers/assets.controller'
import { authMiddleware } from '../middleware/auth'
import { projectContextMiddleware } from '../middleware/project-context'
import { requireAdmin } from '../middleware/require-admin'
import {
  batchSyncSchema,
  checkAssetNameQuerySchema,
  createAssetSchema,
  linkAssetProjectsSchema,
  listAssetsQuerySchema,
  updateAssetSchema,
} from '../schemas/assets.schema'
import type { ProjectAccessRepository } from '../services/project-access.service'
import { AssetService, type AssetDispatcher, type AssetRepository } from '../services/asset.service'
import type { OssServiceContract } from '../services/oss.service'

export const createAssetsRouter = (
  assetRepository: AssetRepository | undefined,
  assetDispatcher: AssetDispatcher | undefined,
  ossService: OssServiceContract,
  projectAccessRepository?: ProjectAccessRepository
): Router => {
  const router = new Router({ prefix: '/api/assets' })
  const controller = new AssetsController(
    new AssetService(assetRepository, assetDispatcher, ossService, undefined, projectAccessRepository)
  )

  router.use(authMiddleware(), projectContextMiddleware(projectAccessRepository))

  router.post('/', async (ctx) => {
    const payload = createAssetSchema.parse(ctx.request.body)
    await controller.create(ctx, payload)
  })

  router.get('/name-available', async (ctx) => {
    const query = checkAssetNameQuerySchema.parse(ctx.request.query)
    await controller.checkNameAvailable(ctx, query)
  })

  router.get('/', async (ctx) => {
    const query = listAssetsQuerySchema.parse(ctx.request.query)
    await controller.list(ctx, query)
  })

  router.get('/:id', async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    await controller.detail(ctx, id)
  })

  router.patch('/:id', async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    const payload = updateAssetSchema.parse(ctx.request.body)
    await controller.update(ctx, id, payload)
  })

  router.delete('/:id', async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    await controller.remove(ctx, id)
  })

  router.post('/:id/projects', async (ctx) => {
    await requireAdmin()(ctx, async () => {})
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    const payload = linkAssetProjectsSchema.parse(ctx.request.body)
    await controller.linkProjects(ctx, id, payload)
  })

  router.delete('/:id/projects/:projectId', async (ctx) => {
    await requireAdmin()(ctx, async () => {})
    const params = z
      .object({
        id: z.coerce.number().int().positive(),
        projectId: z.coerce.number().int().positive(),
      })
      .parse(ctx.params)
    await controller.detachProject(ctx, params.id, params.projectId)
  })

  router.post('/sync', async (ctx) => {
    await requireAdmin()(ctx, async () => {})
    await controller.sync(ctx)
  })

  router.post('/batch-sync', async (ctx) => {
    const isAdmin = ctx.state.user?.role === 'admin'
    const isManager = ctx.state.projectRole === 'manager'
    if (!isAdmin && !isManager) {
      ctx.throw(403, '仅项目管理员或系统管理员可执行批量同步')
    }
    const payload = batchSyncSchema.parse(ctx.request.body)
    await controller.batchSync(ctx, payload)
  })

  router.post('/batch-unsync', async (ctx) => {
    const isAdmin = ctx.state.user?.role === 'admin'
    const isManager = ctx.state.projectRole === 'manager'
    if (!isAdmin && !isManager) {
      ctx.throw(403, '仅项目管理员或系统管理员可执行取消同步')
    }
    const payload = batchSyncSchema.parse(ctx.request.body)
    await controller.batchUnsync(ctx, payload)
  })

  return router
}
