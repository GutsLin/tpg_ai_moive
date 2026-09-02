import Router from '@koa/router'
import type { Middleware } from 'koa'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { projectContextMiddleware } from '../middleware/project-context'
import { AtelierController } from '../controllers/atelier.controller'
import { AtelierService } from '../services/atelier.service'
import type { AssetDispatcher } from '../services/asset.service'
import { ConfigService, type ConfigStore } from '../services/config.service'
import { AtelierAiService } from '../services/atelier-ai.service'
import { AtelierImageService } from '../services/atelier-image.service'
import type { ProjectAccessRepository } from '../services/project-access.service'
import { ForbiddenError } from '../utils/errors'
import type { AtelierImageDispatcher } from '../services/atelier-image.service'

const idSchema = z.object({ id: z.coerce.number().int().positive() })
const canvasCreate = z.object({ title: z.string().trim().min(1).max(300), documentJson: z.unknown(), clientStableId: z.string().max(200).optional() })
const canvasUpdate = z.object({ version: z.coerce.number().int().positive(), title: z.string().trim().min(1).max(300).optional(), documentJson: z.unknown().optional() })
const promptCreate = z.object({ title: z.string().trim().min(1).max(300), content: z.string().trim().min(1), tags: z.array(z.string()).max(50).optional() })
const promptUpdate = z.object({ version: z.coerce.number().int().positive(), title: z.string().trim().min(1).max(300).optional(), content: z.string().trim().min(1).optional(), tags: z.array(z.string()).max(50).optional() })
const imageCreate = z.object({ model: z.string().trim().max(255).optional(), prompt: z.string().trim().min(1).max(20000), size: z.string().trim().max(32).optional(), n: z.coerce.number().int().min(1).max(4).optional(), idempotencyKey: z.string().trim().max(255).optional(), references: z.array(z.object({ url: z.string().url().max(4000).optional() })).max(10).optional() })

export const assertAtelierWritable = (projectRole: string | null | undefined): void => {
  if (projectRole === 'viewer') throw new ForbiddenError('当前项目角色为只读')
}

export const createAtelierRouter = (assetDispatcher?: AssetDispatcher, configStore?: ConfigStore, projectAccessRepository?: ProjectAccessRepository, imageDispatcher?: AtelierImageDispatcher): Router => {
  const router = new Router({ prefix: '/api/infinite-atelier' })
  const configService = new ConfigService({ store: configStore })
  const controller = new AtelierController(new AtelierService(undefined, async (assetIds) => {
    await Promise.all(assetIds.map((assetId) => assetDispatcher?.enqueueDelete(assetId)))
  }), new AtelierAiService(configService), new AtelierImageService({ dispatcher: imageDispatcher }))
  router.use(authMiddleware(), projectContextMiddleware(projectAccessRepository))
  const requireWritable: Middleware = async (ctx, next) => {
    assertAtelierWritable(ctx.state.projectRole)
    await next()
  }
  router.get('/canvases', controller.listCanvases)
  router.get('/canvases/:id', async (ctx) => controller.getCanvas(ctx, idSchema.parse(ctx.params).id))
  router.post('/canvases', requireWritable, async (ctx) => { ctx.request.body = canvasCreate.parse(ctx.request.body); await controller.createCanvas(ctx) })
  router.put('/canvases/:id', requireWritable, async (ctx) => { ctx.request.body = canvasUpdate.parse(ctx.request.body); await controller.updateCanvas(ctx, idSchema.parse(ctx.params).id) })
  router.delete('/canvases/:id', requireWritable, async (ctx) => controller.deleteCanvas(ctx, idSchema.parse(ctx.params).id))
  router.get('/prompts', controller.listPrompts)
  router.post('/prompts', requireWritable, async (ctx) => { ctx.request.body = promptCreate.parse(ctx.request.body); await controller.createPrompt(ctx) })
  router.put('/prompts/:id', requireWritable, async (ctx) => { ctx.request.body = promptUpdate.parse(ctx.request.body); await controller.updatePrompt(ctx, idSchema.parse(ctx.params).id) })
  router.delete('/prompts/:id', requireWritable, async (ctx) => controller.deletePrompt(ctx, idSchema.parse(ctx.params).id))
  router.get('/ai/capabilities', controller.aiCapabilities)
  router.post('/images/generate', requireWritable, async (ctx) => { ctx.request.body = imageCreate.parse(ctx.request.body); await controller.createImage(ctx) })
  router.get('/images/tasks/:id', async (ctx) => { await controller.pollImage(ctx, idSchema.parse(ctx.params).id) })
  return router
}
