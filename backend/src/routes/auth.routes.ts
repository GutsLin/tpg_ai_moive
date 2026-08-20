import Router from '@koa/router'

import { AuthController } from '../controllers/auth.controller'
import { authMiddleware } from '../middleware/auth'
import { changePasswordSchema, loginSchema } from '../schemas/auth.schema'
import type { UserService } from '../services/user.service'

export const createAuthRouter = (userService: UserService): Router => {
  const router = new Router({ prefix: '/api/auth' })
  const controller = new AuthController(userService)

  router.post('/login', async (ctx) => {
    const payload = loginSchema.parse(ctx.request.body)
    await controller.login(ctx, payload)
  })

  router.post('/logout', authMiddleware(), async (ctx) => {
    await controller.logout(ctx)
  })

  router.get('/session', authMiddleware(), async (ctx) => {
    await controller.session(ctx)
  })

  router.patch('/password', authMiddleware(), async (ctx) => {
    const payload = changePasswordSchema.parse(ctx.request.body)
    await controller.changePassword(ctx, payload)
  })

  return router
}
