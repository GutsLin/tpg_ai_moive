import type { Middleware } from 'koa'

import { appLogger } from '../utils/logger'

export const requestLoggerMiddleware = (): Middleware => {
  return async (ctx, next) => {
    const startTime = Date.now()
    const logger = appLogger.child({
      method: ctx.method,
      path: ctx.path,
    })

    ctx.state.logger = logger

    try {
      await next()
      logger.info(
        {
          statusCode: ctx.status,
          durationMs: Date.now() - startTime,
        },
        'request completed'
      )
    } catch (error) {
      logger.error(
        {
          error,
          statusCode: ctx.status,
          durationMs: Date.now() - startTime,
        },
        'request failed'
      )
      throw error
    }
  }
}
