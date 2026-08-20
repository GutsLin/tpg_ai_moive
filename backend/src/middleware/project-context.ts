import type { Middleware } from 'koa'

import { ProjectAccessService, type ProjectAccessRepository } from '../services/project-access.service'
import { ForbiddenError, UnauthorizedError, ValidationAppError } from '../utils/errors'

interface ProjectContextMiddlewareOptions {
  requireProject?: boolean
  allowAdminGlobalRead?: boolean
}

export const projectContextMiddleware = (
  repository?: ProjectAccessRepository,
  options: ProjectContextMiddlewareOptions = {}
): Middleware => {
  const service = new ProjectAccessService(repository)
  const requireProject = options.requireProject ?? true

  return async (ctx, next) => {
    const user = ctx.state.user
    if (!user) {
      throw new UnauthorizedError()
    }

    const headerValue = ctx.get('X-Project-Id').trim()

    if (!headerValue) {
      if (options.allowAdminGlobalRead && user.role === 'admin') {
        ctx.state.projectId = null
        ctx.state.projectRole = null
        ctx.state.project = null
        ctx.state.globalProjectView = true
        await next()
        return
      }

      if (requireProject) {
        throw new ValidationAppError('缺少 X-Project-Id 请求头')
      }

      await next()
      return
    }

    const projectId = Number(headerValue)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      throw new ValidationAppError('X-Project-Id 必须为正整数')
    }

    const access = await service.getAccessibleProject(Number(user.sub), user.role, projectId)
    if (!access) {
      throw new ForbiddenError('无权限访问当前项目')
    }

    ctx.state.projectId = access.projectId
    ctx.state.projectRole = access.projectRole
    ctx.state.project = access
    ctx.state.globalProjectView = false

    await next()
  }
}
