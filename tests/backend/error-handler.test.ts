import Koa from 'koa'
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import request from 'supertest'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import { errorHandler } from '../../backend/src/middleware/error-handler'

describe('errorHandler', () => {
  it('捕获 ZodError 并返回 422 响应体', async () => {
    const app = new Koa()
    const router = new Router()

    app.use(errorHandler())
    app.use(bodyParser())

    router.post('/validate', (ctx) => {
      z.object({
        username: z.string().min(3),
      }).parse(ctx.request.body)

      ctx.body = {
        code: 0,
        data: { ok: true },
        message: 'ok',
      }
    })

    app.use(router.routes())
    app.use(router.allowedMethods())

    const response = await request(app.callback())
      .post('/validate')
      .send({ username: 'ab' })

    expect(response.status).toBe(422)
    expect(response.body.code).toBe(422)
    expect(response.body.data).toBeNull()
    expect(response.body.message).toContain('username')
  })
})
