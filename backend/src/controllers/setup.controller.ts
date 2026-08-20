import type { Context } from 'koa'

import type {
  SetupArkAssetGroupItem,
  SetupInitializePayload,
  SetupServiceContract,
  SetupValidateArkAkskPayload,
  SetupValidateArkBearerPayload,
  SetupValidateOssPayload,
} from '../services/setup.service'
import { ok } from '../utils/http'

export class SetupController {
  public constructor(private readonly setupService: SetupServiceContract) {}

  public status = async (ctx: Context) => {
    const result = await this.setupService.getStatus()
    ctx.body = ok(result)
  }

  public initialize = async (ctx: Context, payload: SetupInitializePayload) => {
    await this.setupService.initialize(payload)
    ctx.body = ok({ success: true })
  }

  public validateOss = async (ctx: Context, payload: SetupValidateOssPayload) => {
    ctx.body = ok(
      await this.setupService.validateOss({
        ...payload,
        frontendOrigin: ctx.get('origin') || undefined,
      })
    )
  }

  public validateArkBearer = async (ctx: Context, payload: SetupValidateArkBearerPayload) => {
    ctx.body = ok(await this.setupService.validateArkBearer(payload))
  }

  public validateArkAksk = async (ctx: Context, payload: SetupValidateArkAkskPayload) => {
    ctx.body = ok(await this.setupService.validateArkAksk(payload))
  }

  public listArkAssetGroups = async (ctx: Context, payload: SetupValidateArkAkskPayload) => {
    ctx.body = ok(await this.setupService.listArkAssetGroups(payload))
  }

  public createArkAssetGroup = async (
    ctx: Context,
    payload: SetupValidateArkAkskPayload & { name: string; description?: string }
  ) => {
    ctx.body = ok<SetupArkAssetGroupItem>(await this.setupService.createArkAssetGroup(payload))
  }
}
