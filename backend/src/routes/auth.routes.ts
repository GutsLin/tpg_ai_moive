import Router from '@koa/router'

import { AuthController } from '../controllers/auth.controller'
import { authMiddleware } from '../middleware/auth'
import { changePasswordSchema, loginSchema } from '../schemas/auth.schema'
import type { UserService } from '../services/user.service'
import type { AtelierSsoService } from '../services/atelier-sso.service'

export const createAuthRouter = (userService: UserService, atelierSso?: AtelierSsoService): Router => {
  const router = new Router({ prefix: '/api/auth' })
  const controller = new AuthController(userService, atelierSso)

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

  router.post('/atelier/sso-ticket', authMiddleware(), async (ctx) => {
    await controller.issueAtelierSso(ctx)
  })

  router.post('/internal/atelier/sso/exchange', async (ctx) => {
    await controller.exchangeAtelierSso(ctx)
  })

  return router
}
