import type { Context } from 'koa'

import type { UserApiKeyService } from '../services/user-api-key.service'
import type { ConfigService } from '../services/config.service'
import type { VideoProviderService } from '../services/video-provider.service'
import { ok } from '../utils/http'

export class UserApiKeysController {
  public constructor(
    private readonly userApiKeyService: UserApiKeyService,
    private readonly configService: ConfigService,
    private readonly videoProviderService: VideoProviderService
  ) {}

  public listByUser = async (ctx: Context, userId: number) => {
    ctx.body = ok(await this.userApiKeyService.getMaskedByUser(userId))
  }

  public upsertByUser = async (
    ctx: Context,
    userId: number,
    payload: { keys: Array<{ providerKey: string; apiKey: string }> }
  ) => {
    await this.userApiKeyService.upsert(userId, payload.keys)
    ctx.body = ok(await this.userApiKeyService.getMaskedByUser(userId))
  }

  public deleteByUser = async (ctx: Context, userId: number, providerKey: string) => {
    await this.userApiKeyService.delete(userId, providerKey)
    ctx.body = ok({ success: true })
  }

  public listMine = async (ctx: Context) => {
    const userId = Number(ctx.state.user?.sub)
    ctx.body = ok(await this.userApiKeyService.getMaskedByUser(userId))
  }

  public getApiKeyMode = async (ctx: Context) => {
    const mode = await this.userApiKeyService.getApiKeyMode()
    ctx.body = ok({ mode })
  }

  public setApiKeyMode = async (ctx: Context, payload: { mode: 'global' | 'per_member' }) => {
    await this.userApiKeyService.setApiKeyMode(payload.mode)
    ctx.body = ok({ mode: payload.mode })
  }

  public exportApiKeys = async (ctx: Context) => {
    const providerKey = 'toapis'
    const users = await this.userApiKeyService.listAllUsersWithKeyStatus(providerKey)
    const csv = this.userApiKeyService.buildExportCsv(users)

    const shanghaiDate = new Date(Date.now() + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')

    ctx.status = 200
    ctx.set('Content-Type', 'text/csv; charset=utf-8')
    ctx.set(
      'Content-Disposition',
      `attachment; filename="user_api_keys_${shanghaiDate}.csv"; filename*=UTF-8''${encodeURIComponent(`用户API_Key导出_${shanghaiDate}.csv`)}`
    )
    ctx.set('Cache-Control', 'no-store')
    ctx.body = csv
  }

  public importApiKeys = async (ctx: Context, csvText: string) => {
    const providerKey = 'toapis'
    const entries = this.userApiKeyService.parseImportCsv(csvText)
    const result = await this.userApiKeyService.batchImportApiKeys(providerKey, entries)
    ctx.body = ok(result)
  }
}
