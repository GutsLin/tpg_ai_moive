import type { Context } from 'koa'
import { ok } from '../utils/http'
import type { AtelierService } from '../services/atelier.service'

export class AtelierController {
  public constructor(private readonly service: AtelierService) {}
  listCanvases = async (ctx: Context) => { ctx.body = ok(await this.service.listCanvases(Number(ctx.state.projectId), Number(ctx.state.user?.sub))) }
  getCanvas = async (ctx: Context, id: number) => { ctx.body = ok(await this.service.getCanvas(Number(ctx.state.projectId), Number(ctx.state.user?.sub), id)) }
  createCanvas = async (ctx: Context) => { ctx.body = ok(await this.service.createCanvas(Number(ctx.state.projectId), Number(ctx.state.user?.sub), ctx.request.body as any)) }
  updateCanvas = async (ctx: Context, id: number) => { ctx.body = ok(await this.service.updateCanvas(Number(ctx.state.projectId), Number(ctx.state.user?.sub), id, ctx.request.body as any)) }
  deleteCanvas = async (ctx: Context, id: number) => { ctx.body = ok(await this.service.deleteCanvas(Number(ctx.state.projectId), Number(ctx.state.user?.sub), id)) }
  listPrompts = async (ctx: Context) => { ctx.body = ok(await this.service.listPrompts(Number(ctx.state.projectId), typeof ctx.query.q === 'string' ? ctx.query.q : undefined)) }
  createPrompt = async (ctx: Context) => { ctx.body = ok(await this.service.createPrompt(Number(ctx.state.projectId), Number(ctx.state.user?.sub), ctx.request.body as any)) }
  updatePrompt = async (ctx: Context, id: number) => { ctx.body = ok(await this.service.updatePrompt(Number(ctx.state.projectId), Number(ctx.state.user?.sub), ctx.state.projectRole ?? 'member', id, ctx.request.body as any)) }
  deletePrompt = async (ctx: Context, id: number) => { ctx.body = ok(await this.service.deletePrompt(Number(ctx.state.projectId), Number(ctx.state.user?.sub), ctx.state.projectRole ?? 'member', id)) }
}
