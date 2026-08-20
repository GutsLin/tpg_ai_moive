import type { Context } from 'koa'

import type { UserService } from '../services/user.service'
import type { ProjectRole } from '../services/project-access.service'
import { ok } from '../utils/http'

export class UsersController {
  public constructor(private readonly userService: UserService) {}

  public list = async (
    ctx: Context,
    query: {
      page: number
      pageSize: number
      status?: number
    }
  ) => {
    ctx.body = ok(await this.userService.listUsers(query))
  }

  public create = async (
    ctx: Context,
    payload: {
      username: string
      password: string
      role: 'admin' | 'user'
      menuPerms: string[]
      projects: Array<{
        projectId: number
        projectRole: ProjectRole
      }>
    }
  ) => {
    ctx.body = ok(
      await this.userService.createUser({
        ...payload,
        operatorUserId: Number(ctx.state.user?.sub ?? 0) || null,
      })
    )
  }

  public update = async (
    ctx: Context,
    params: { id: number },
    payload: {
      role?: 'admin' | 'user'
      menuPerms?: string[]
      status?: number
      password?: string
      projects?: Array<{
        projectId: number
        projectRole: ProjectRole
      }>
    }
  ) => {
    ctx.body = ok(
      await this.userService.updateUser(params.id, {
        ...payload,
        operatorUserId: Number(ctx.state.user?.sub ?? 0) || null,
      })
    )
  }

  public remove = async (ctx: Context, params: { id: number }) => {
    const currentUserId = Number(ctx.state.user?.sub)
    ctx.body = ok(await this.userService.deleteUser(params.id, currentUserId))
  }
}
