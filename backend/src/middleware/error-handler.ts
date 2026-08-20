import type { Middleware } from 'koa'
import { ZodError } from 'zod'

import { AppError, ValidationAppError } from '../utils/errors'
import { fail } from '../utils/http'
import { appLogger } from '../utils/logger'

const formatZodError = (error: ZodError): string => {
  return error.issues
    .map((issue) => {
      const fieldPath = issue.path.join('.')
      return fieldPath ? `${fieldPath}: ${issue.message}` : issue.message
    })
    .join('; ')
}

export const errorHandler = (): Middleware => {
  return async (ctx, next) => {
    try {
      await next()
    } catch (error) {
      const logger = ctx.state.logger ?? appLogger

      if (error instanceof ZodError) {
        const validationError = new ValidationAppError(formatZodError(error))
        ctx.status = validationError.status
        ctx.body = fail(validationError.code, validationError.message)
        return
      }

      if (error instanceof AppError) {
        ctx.status = error.status
        ctx.body = fail(error.code, error.message)
        return
      }

      logger.error({ error }, 'unhandled application error')
      ctx.status = 500
      ctx.body = fail(500, '服务器内部错误')
    }
  }
}
