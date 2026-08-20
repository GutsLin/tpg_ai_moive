import Router from '@koa/router'

import { UsersController } from '../controllers/users.controller'
import { authMiddleware } from '../middleware/auth'
import { requireAdmin } from '../middleware/require-admin'
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
} from '../schemas/users.schema'
import type { UserService } from '../services/user.service'

export const createUsersRouter = (userService: UserService): Router => {
  const router = new Router({ prefix: '/api/users' })
  const controller = new UsersController(userService)

  router.use(authMiddleware(), requireAdmin())

  router.get('/', async (ctx) => {
    const query = listUsersQuerySchema.parse(ctx.request.query)
    await controller.list(ctx, query)
  })

  router.post('/', async (ctx) => {
    const payload = createUserSchema.parse(ctx.request.body)
    await controller.create(ctx, payload)
  })

  router.patch('/:id', async (ctx) => {
    const params = userIdParamSchema.parse(ctx.params)
    const payload = updateUserSchema.parse(ctx.request.body)
    await controller.update(ctx, params, payload)
  })

  router.delete('/:id', async (ctx) => {
    const params = userIdParamSchema.parse(ctx.params)
    await controller.remove(ctx, params)
  })

  return router
}
