import type { Context } from 'koa'

import type { ProjectService } from '../services/project.service'
import { ok } from '../utils/http'
import type { ProjectRole } from '../services/project-access.service'

export class ProjectsController {
  public constructor(private readonly projectService: ProjectService) {}

  public list = async (ctx: Context) => {
    ctx.body = ok(await this.projectService.listProjects())
  }

  public detail = async (ctx: Context, params: { id: number }) => {
    ctx.body = ok(await this.projectService.getProject(params.id))
  }

  public create = async (
    ctx: Context,
    payload: {
      name: string
      description: string | null
      coverAssetId: number | null
    }
  ) => {
    ctx.body = ok(
      await this.projectService.createProject({
        ...payload,
        operatorUserId: Number(ctx.state.user?.sub ?? 0) || null,
      })
    )
  }

  public update = async (
    ctx: Context,
    params: { id: number },
    payload: {
      name?: string
      description?: string | null
      coverAssetId?: number | null
    }
  ) => {
    ctx.body = ok(await this.projectService.updateProject(params.id, payload))
  }

  public archive = async (ctx: Context, params: { id: number }) => {
    ctx.body = ok(await this.projectService.archiveProject(params.id))
  }

  public listMembers = async (ctx: Context, params: { id: number }) => {
    ctx.body = ok(await this.projectService.listMembers(params.id))
  }

  public replaceMembers = async (
    ctx: Context,
    params: { id: number },
    payload: {
      members: Array<{
        userId: number
        projectRole: ProjectRole
      }>
    }
  ) => {
    ctx.body = ok(
      await this.projectService.replaceMembers(params.id, payload.members, Number(ctx.state.user?.sub ?? 0) || null)
    )
  }
}
