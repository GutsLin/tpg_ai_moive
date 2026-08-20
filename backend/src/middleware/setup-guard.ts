import type { Middleware } from 'koa'

import type { SetupServiceContract } from '../services/setup.service'
import { ForbiddenError } from '../utils/errors'

const isSetupRoute = (path: string): boolean => {
  return path === '/health' || path.startsWith('/api/setup')
}

export const setupGuard = (setupService: SetupServiceContract): Middleware => {
  return async (ctx, next) => {
    if (ctx.method === 'OPTIONS' || isSetupRoute(ctx.path)) {
      await next()
      return
    }

    const status = await setupService.getStatus()
    if (!status.initialized) {
      throw new ForbiddenError('系统尚未初始化')
    }

    await next()
  }
}
