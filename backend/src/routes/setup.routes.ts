import Router from '@koa/router'

import { SetupController } from '../controllers/setup.controller'
import {
  setupCreateArkAssetGroupSchema,
  setupInitializeSchema,
  setupListArkAssetGroupsSchema,
  setupValidateArkAkskSchema,
  setupValidateArkBearerSchema,
  setupValidateOssSchema,
} from '../schemas/setup.schema'
import type { SetupServiceContract } from '../services/setup.service'

export const createSetupRouter = (setupService: SetupServiceContract): Router => {
  const router = new Router({ prefix: '/api/setup' })
  const controller = new SetupController(setupService)

  router.get('/status', controller.status)
  router.post('/initialize', async (ctx) => {
    const payload = setupInitializeSchema.parse(ctx.request.body)
    await controller.initialize(ctx, payload)
  })
  router.post('/validate/oss', async (ctx) => {
    const payload = setupValidateOssSchema.parse(ctx.request.body)
    await controller.validateOss(ctx, payload)
  })
  router.post('/validate/ark-bearer', async (ctx) => {
    const payload = setupValidateArkBearerSchema.parse(ctx.request.body)
    await controller.validateArkBearer(ctx, payload)
  })
  router.post('/validate/ark-aksk', async (ctx) => {
    const payload = setupValidateArkAkskSchema.parse(ctx.request.body)
    await controller.validateArkAksk(ctx, payload)
  })
  router.post('/ark/asset-groups/list', async (ctx) => {
    const payload = setupListArkAssetGroupsSchema.parse(ctx.request.body)
    await controller.listArkAssetGroups(ctx, payload)
  })
  router.post('/ark/asset-groups', async (ctx) => {
    const payload = setupCreateArkAssetGroupSchema.parse(ctx.request.body)
    await controller.createArkAssetGroup(ctx, payload)
  })

  return router
}
