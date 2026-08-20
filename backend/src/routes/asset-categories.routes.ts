import Router from '@koa/router'
import { z } from 'zod'

import { AssetCategoriesController } from '../controllers/asset-categories.controller'
import { authMiddleware } from '../middleware/auth'
import { projectContextMiddleware } from '../middleware/project-context'
import { requireAdmin } from '../middleware/require-admin'
import { createAssetCategorySchema, deleteAssetCategorySchema, updateAssetCategorySchema } from '../schemas/asset-categories.schema'
import { AssetCategoryService, type AssetCategoryRepository } from '../services/asset-category.service'
import type { ArkAssetClient } from '../lib/ark-aksk'
import type { AssetDispatcher } from '../services/asset.service'
import { OssService, type OssServiceContract } from '../services/oss.service'
import type { ProjectAccessRepository } from '../services/project-access.service'

export const createAssetCategoriesRouter = (
  assetCategoryRepository?: AssetCategoryRepository,
  assetDispatcher?: AssetDispatcher,
  ossService: OssServiceContract = new OssService(),
  projectAccessRepository?: ProjectAccessRepository,
  arkClient?: ArkAssetClient
): Router => {
  const router = new Router()
  const controller = new AssetCategoriesController(
    new AssetCategoryService(assetCategoryRepository, arkClient, undefined, assetDispatcher),
    ossService
  )

  router.get('/api/asset-categories', authMiddleware(), projectContextMiddleware(projectAccessRepository), controller.list)

  router.post('/api/assets/sts-token', authMiddleware(), projectContextMiddleware(projectAccessRepository), controller.getStsToken)

  router.post('/api/asset-categories', authMiddleware(), projectContextMiddleware(projectAccessRepository), requireAdmin(), async (ctx) => {
    const payload = createAssetCategorySchema.parse(ctx.request.body)
    await controller.create(ctx, payload)
  })

  router.patch('/api/asset-categories/:id', authMiddleware(), projectContextMiddleware(projectAccessRepository), requireAdmin(), async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    const payload = updateAssetCategorySchema.parse(ctx.request.body)
    await controller.update(ctx, id, payload)
  })

  router.delete('/api/asset-categories/:id', authMiddleware(), projectContextMiddleware(projectAccessRepository), requireAdmin(), async (ctx) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(ctx.params)
    const payload = deleteAssetCategorySchema.parse({
      ...(ctx.query ?? {}),
      ...(ctx.request.body ?? {}),
    })
    await controller.remove(ctx, id, payload)
  })

  return router
}
