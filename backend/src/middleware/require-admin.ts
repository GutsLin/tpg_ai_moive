import type { Middleware } from 'koa'

import { ForbiddenError, UnauthorizedError } from '../utils/errors'

export const requireAdmin = (): Middleware => {
  return async (ctx, next) => {
    if (!ctx.state.user) {
      throw new UnauthorizedError()
    }

    if (ctx.state.user.role !== 'admin') {
      throw new ForbiddenError()
    }

    await next()
  }
}
