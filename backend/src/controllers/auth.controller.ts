import type { Context } from 'koa'

import { ok } from '../utils/http'
import type { UserService } from '../services/user.service'

export class AuthController {
  public constructor(private readonly userService: UserService) {}

  public login = async (ctx: Context, payload: { username: string; password: string }) => {
    const result = await this.userService.login(payload.username, payload.password)
    ctx.body = ok(result)
  }

  public logout = async (ctx: Context) => {
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
}
