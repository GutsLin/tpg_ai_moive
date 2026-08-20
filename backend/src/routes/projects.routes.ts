import Router from '@koa/router'

import { ProjectsController } from '../controllers/projects.controller'
import { authMiddleware } from '../middleware/auth'
import { requireAdmin } from '../middleware/require-admin'
import {
  createProjectSchema,
  projectIdParamSchema,
  replaceProjectMembersSchema,
  updateProjectSchema,
} from '../schemas/projects.schema'
import {
  ProjectService,
  type ProjectMemberRepository,
  type ProjectRepository,
} from '../services/project.service'

export const createProjectsRouter = (
  projectRepository?: ProjectRepository,
  projectMemberRepository?: ProjectMemberRepository
): Router => {
  const router = new Router({ prefix: '/api/projects' })
  const controller = new ProjectsController(
    new ProjectService({
      projectRepository,
      projectMemberRepository,
    })
  )

  router.use(authMiddleware(), requireAdmin())

  router.get('/', async (ctx) => {
    await controller.list(ctx)
  })

  router.get('/:id', async (ctx) => {
    const params = projectIdParamSchema.parse(ctx.params)
    await controller.detail(ctx, params)
  })

  router.post('/', async (ctx) => {
    const payload = createProjectSchema.parse(ctx.request.body)
    await controller.create(ctx, payload)
  })

  router.patch('/:id', async (ctx) => {
    const params = projectIdParamSchema.parse(ctx.params)
    const payload = updateProjectSchema.parse(ctx.request.body)
    await controller.update(ctx, params, payload)
  })

  router.delete('/:id', async (ctx) => {
    const params = projectIdParamSchema.parse(ctx.params)
    await controller.archive(ctx, params)
  })

  router.get('/:id/members', async (ctx) => {
    const params = projectIdParamSchema.parse(ctx.params)
    await controller.listMembers(ctx, params)
  })

  router.put('/:id/members', async (ctx) => {
    const params = projectIdParamSchema.parse(ctx.params)
    const payload = replaceProjectMembersSchema.parse(ctx.request.body)
    await controller.replaceMembers(ctx, params, payload)
  })

  return router
}
