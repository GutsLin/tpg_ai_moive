import type { Context } from 'koa'

import { ok } from '../utils/http'
import type { UserService } from '../services/user.service'
import { AtelierSsoService } from '../services/atelier-sso.service'
import { UnauthorizedError } from '../utils/errors'

export class AuthController {
  public constructor(private readonly userService: UserService, private readonly atelierSso?: AtelierSsoService) {}

  public login = async (ctx: Context, payload: { username: string; password: string }) => {
    const result = await this.userService.login(payload.username, payload.password)
    ctx.body = ok(result)
  }

  public logout = async (ctx: Context) => {
    if (this.atelierSso && ctx.state.user?.sub) await this.atelierSso.revokeUserTickets(Number(ctx.state.user.sub))
    ctx.body = ok({ success: true })
  }

  public session = async (ctx: Context) => {
    const userId = Number(ctx.state.user?.sub)
    ctx.body = ok(await this.userService.getSession(userId))
  }

  public changePassword = async (
    ctx: Context,
    payload: { currentPassword: string; newPassword: string }
  ) => {
    const userId = Number(ctx.state.user?.sub)
    await this.userService.changePassword(userId, payload.currentPassword, payload.newPassword)
    ctx.body = ok({ success: true })
  }

  public issueAtelierSso = async (ctx: Context) => {
    if (!this.atelierSso) throw new UnauthorizedError()
    const userId = Number(ctx.state.user?.sub)
    ctx.body = ok(await this.atelierSso.issue(userId))
  }

  public exchangeAtelierSso = async (ctx: Context) => {
    if (!this.atelierSso || !AtelierSsoService.serviceSecretValid(ctx.get('x-atelier-sso-secret'))) throw new UnauthorizedError()
    ctx.body = ok(await this.atelierSso.exchange(String((ctx.request.body as { ticket?: string })?.ticket ?? '')))
  }
}
