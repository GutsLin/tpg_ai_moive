import type { Context } from 'koa'

import { ArkAkskClient } from '../lib/ark-aksk'
import type { ConfigService } from '../services/config.service'
import type { OssServiceContract } from '../services/oss.service'
import type { VideoProviderService } from '../services/video-provider.service'
import { ValidationAppError } from '../utils/errors'
import { ok } from '../utils/http'

export class ConfigController {
  public constructor(
    private readonly configService: ConfigService,
    private readonly ossService: OssServiceContract,
    private readonly videoProviderService: VideoProviderService
  ) {}

  public list = async (ctx: Context) => {
    ctx.body = ok(await this.configService.listForAdmin())
  }

  public listVideoProviders = async (ctx: Context) => {
    ctx.body = ok(await this.videoProviderService.listForAdmin())
  }

  public createVideoProvider = async (ctx: Context, payload: any) => {
    ctx.body = ok(await this.videoProviderService.create(payload))
  }

  public updateVideoProvider = async (ctx: Context, id: number, payload: any) => {
    ctx.body = ok(await this.videoProviderService.update(id, payload))
  }

  public activateVideoProvider = async (ctx: Context, id: number) => {
    ctx.body = ok(await this.videoProviderService.activate(id))
  }

  public publicBranding = async (ctx: Context) => {
    ctx.body = ok(await this.configService.getPublicBranding(this.ossService))
  }

  public update = async (ctx: Context, payload: { items: Array<{ key: string; value: string }> }) => {
    await this.configService.updateMany(payload.items)
    ctx.body = ok({ success: true })
  }

  public listArkAssetGroups = async (
    ctx: Context,
    payload: { accessKey?: string; secretKey?: string }
  ) => {
    const client = await this.createArkClient(payload)
    const items = await client.listAssetGroups()

    ctx.body = ok({
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
      })),
    })
  }

  public createArkAssetGroup = async (
    ctx: Context,
    payload: { accessKey?: string; secretKey?: string; name: string; description?: string }
  ) => {
    const client = await this.createArkClient(payload)
    const item = await client.createAssetGroup({
      name: payload.name.trim(),
      description: payload.description?.trim() || undefined,
    })

    ctx.body = ok({
      id: item.id,
      name: item.name,
      description: item.description,
    })
  }

  private async createArkClient(payload: { accessKey?: string; secretKey?: string }) {
    const overrideAccessKey = payload.accessKey?.trim()
    const overrideSecretKey = payload.secretKey?.trim()

    const accessKey = overrideAccessKey || (await this.configService.getOptional('ark_access_key'))?.trim() || ''
    const secretKey = overrideSecretKey || (await this.configService.getOptional('ark_secret_key'))?.trim() || ''

    if (!accessKey || !secretKey) {
      throw new ValidationAppError('请先填写并保存有效的火山素材 Access Key / Secret Key，或在当前页面输入后再加载素材组')
    }

    return new ArkAkskClient({
      getCredentials: async () => ({
        accessKey,
        secretKey,
      }),
    })
  }
}
