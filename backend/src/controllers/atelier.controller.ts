import type { Context } from 'koa'
import { ok } from '../utils/http'
import type { AtelierService } from '../services/atelier.service'
import type { AtelierAiService } from '../services/atelier-ai.service'
import type { AtelierImageService } from '../services/atelier-image.service'

export class AtelierController {
  public constructor(private readonly service: AtelierService, private readonly aiService?: AtelierAiService, private readonly imageService?: AtelierImageService) {}
  listCanvases = async (ctx: Context) => { ctx.body = ok(await this.service.listCanvases(Number(ctx.state.projectId), Number(ctx.state.user?.sub))) }
  getCanvas = async (ctx: Context, id: number) => { ctx.body = ok(await this.service.getCanvas(Number(ctx.state.projectId), Number(ctx.state.user?.sub), id)) }
  createCanvas = async (ctx: Context) => { ctx.body = ok(await this.service.createCanvas(Number(ctx.state.projectId), Number(ctx.state.user?.sub), ctx.request.body as any)) }
  updateCanvas = async (ctx: Context, id: number) => { ctx.body = ok(await this.service.updateCanvas(Number(ctx.state.projectId), Number(ctx.state.user?.sub), id, ctx.request.body as any)) }
  deleteCanvas = async (ctx: Context, id: number) => { ctx.body = ok(await this.service.deleteCanvas(Number(ctx.state.projectId), Number(ctx.state.user?.sub), id)) }
  listPrompts = async (ctx: Context) => { ctx.body = ok(await this.service.listPrompts(Number(ctx.state.projectId), typeof ctx.query.q === 'string' ? ctx.query.q : undefined)) }
  createPrompt = async (ctx: Context) => { ctx.body = ok(await this.service.createPrompt(Number(ctx.state.projectId), Number(ctx.state.user?.sub), ctx.request.body as any)) }
  updatePrompt = async (ctx: Context, id: number) => { ctx.body = ok(await this.service.updatePrompt(Number(ctx.state.projectId), Number(ctx.state.user?.sub), ctx.state.projectRole ?? 'member', id, ctx.request.body as any)) }
  deletePrompt = async (ctx: Context, id: number) => { ctx.body = ok(await this.service.deletePrompt(Number(ctx.state.projectId), Number(ctx.state.user?.sub), ctx.state.projectRole ?? 'member', id)) }
  aiCapabilities = async (ctx: Context) => {
    const result = await this.aiService!.getCapabilities()
    if (this.imageService) result.items = [await this.imageService.getCapability(Number(ctx.state.user?.sub)), ...result.items.filter((item) => item.mediaType !== 'image')]
    ctx.body = ok(result)
  }
  createImage = async (ctx: Context) => { ctx.body = ok(await this.imageService!.create({ ...ctx.request.body as any, projectId: Number(ctx.state.projectId), userId: Number(ctx.state.user?.sub), projectRole: ctx.state.projectRole ?? null })) }
  pollImage = async (ctx: Context, id: number) => { ctx.body = ok(await this.imageService!.poll(Number(ctx.state.projectId), Number(ctx.state.user?.sub), id)) }
}
