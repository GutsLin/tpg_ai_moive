import Koa from 'koa'
import Router from '@koa/router'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { describe, expect, it } from 'vitest'

import { errorHandler } from '../../backend/src/middleware/error-handler'
import { authMiddleware } from '../../backend/src/middleware/auth'

const buildApp = () => {
  process.env.JWT_SECRET = 'test-jwt-secret'

  const app = new Koa()
  const router = new Router()

  app.use(errorHandler())

  router.get('/secure', authMiddleware(), (ctx) => {
    ctx.body = {
      code: 0,
      data: {
        userId: ctx.state.user?.sub,
        role: ctx.state.user?.role,
      },
      message: 'ok',
    }
  })

  app.use(router.routes())
  app.use(router.allowedMethods())

  return app
}

describe('authMiddleware', () => {
  it('缺少 token 时返回 401', async () => {
    const app = buildApp()

    const response = await request(app.callback()).get('/secure')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      code: 401,
      data: null,
    })
  })

  it('token 已过期时返回 401', async () => {
    const app = buildApp()
    const token = jwt.sign({ sub: '7', role: 'user' }, 'test-jwt-secret', {
      expiresIn: -10,
    })

    const response = await request(app.callback())
      .get('/secure')
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      code: 401,
      data: null,
    })
  })

  it('token 有效时允许访问并把用户信息挂到 ctx.state.user', async () => {
    const app = buildApp()
    const token = jwt.sign({ sub: '9', role: 'admin' }, 'test-jwt-secret', {
      expiresIn: '1h',
    })

    const response = await request(app.callback())
      .get('/secure')
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      code: 0,
      data: {
        userId: '9',
        role: 'admin',
      },
      message: 'ok',
    })
  })
})
