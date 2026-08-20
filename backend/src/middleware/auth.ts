import type { Middleware } from 'koa'
import jwt, { JsonWebTokenError, TokenExpiredError, type JwtPayload } from 'jsonwebtoken'

import type { AuthenticatedUser } from '../types/koa'
import { UnauthorizedError } from '../utils/errors'

const getJwtSecret = (): string => {
  return process.env.JWT_SECRET || 'dev-jwt-secret'
}

const isAuthenticatedUser = (payload: JwtPayload | string): payload is JwtPayload & AuthenticatedUser => {
  return (
    typeof payload !== 'string' &&
    typeof payload.sub === 'string' &&
    (payload.role === 'admin' || payload.role === 'user')
  )
}

export const authMiddleware = (): Middleware => {
  return async (ctx, next) => {
    const authorization = ctx.get('authorization')
    if (!authorization.startsWith('Bearer ')) {
      throw new UnauthorizedError()
    }

    const token = authorization.slice('Bearer '.length).trim()
    if (!token) {
      throw new UnauthorizedError()
    }

    try {
      const payload = jwt.verify(token, getJwtSecret())

      if (!isAuthenticatedUser(payload)) {
        throw new UnauthorizedError()
      }

      ctx.state.user = {
        sub: payload.sub,
        role: payload.role,
      }

      await next()
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error
      }

      if (error instanceof JsonWebTokenError || error instanceof TokenExpiredError) {
        throw new UnauthorizedError()
      }

      throw error
    }
  }
}
