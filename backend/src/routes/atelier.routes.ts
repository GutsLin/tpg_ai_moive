import Router from '@koa/router'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { projectContextMiddleware } from '../middleware/project-context'
import { AtelierController } from '../controllers/atelier.controller'
import { AtelierService } from '../services/atelier.service'

const idSchema = z.object({ id: z.coerce.number().int().positive() })
const canvasCreate = z.object({ title: z.string().trim().min(1).max(300), documentJson: z.unknown(), clientStableId: z.string().max(200).optional() })
const canvasUpdate = z.object({ version: z.coerce.number().int().positive(), title: z.string().trim().min(1).max(300).optional(), documentJson: z.unknown().optional() })
const promptCreate = z.object({ title: z.string().trim().min(1).max(300), content: z.string().trim().min(1), tags: z.array(z.string()).max(50).optional() })
const promptUpdate = z.object({ version: z.coerce.number().int().positive(), title: z.string().trim().min(1).max(300).optional(), content: z.string().trim().min(1).optional(), tags: z.array(z.string()).max(50).optional() })

export const createAtelierRouter = (): Router => {
  const router = new Router({ prefix: '/api/infinite-atelier' })
  const controller = new AtelierController(new AtelierService())
  router.use(authMiddleware(), projectContextMiddleware())
  router.get('/canvases', controller.listCanvases)
  router.get('/canvases/:id', async (ctx) => controller.getCanvas(ctx, idSchema.parse(ctx.params).id))
  router.post('/canvases', async (ctx) => { ctx.request.body = canvasCreate.parse(ctx.request.body); await controller.createCanvas(ctx) })
  router.put('/canvases/:id', async (ctx) => { ctx.request.body = canvasUpdate.parse(ctx.request.body); await controller.updateCanvas(ctx, idSchema.parse(ctx.params).id) })
  router.delete('/canvases/:id', async (ctx) => controller.deleteCanvas(ctx, idSchema.parse(ctx.params).id))
  router.get('/prompts', controller.listPrompts)
  router.post('/prompts', async (ctx) => { ctx.request.body = promptCreate.parse(ctx.request.body); await controller.createPrompt(ctx) })
  router.put('/prompts/:id', async (ctx) => { ctx.request.body = promptUpdate.parse(ctx.request.body); await controller.updatePrompt(ctx, idSchema.parse(ctx.params).id) })
  router.delete('/prompts/:id', async (ctx) => controller.deletePrompt(ctx, idSchema.parse(ctx.params).id))
  return router
}
