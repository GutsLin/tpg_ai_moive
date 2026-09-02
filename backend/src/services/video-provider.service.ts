import { db } from '../db/kysely'
import { ValidationAppError } from '../utils/errors'
import { ConfigService } from './config.service'
import { UserApiKeyService, type ApiKeyMode } from './user-api-key.service'

export type VideoProviderType = 'toapis' | 'volcano_ark'

export interface VideoProviderModelCapability {
  id: string
  label: string
  duration: { min: number; max: number; auto?: boolean }
  resolutions: string[]
  aspectRatios: string[]
  operations: Array<'generate' | 'edit' | 'extend'>
  supports: {
    firstLastFrame: boolean
    referenceImage: boolean
    referenceVideo: boolean
    referenceAudio: boolean
    audioOnlyReference?: boolean
    generateAudio: boolean
    outputFormat?: boolean
  }
  referenceLimits?: VideoProviderReferenceLimits
}

export interface VideoProviderCapabilities {
  version: number
  models: VideoProviderModelCapability[]
}

export interface VideoProviderRecord {
  id: number
  providerKey: string
  name: string
  providerType: VideoProviderType
  endpoint: string
  apiKey: string
  enabled: boolean
  isDefault: boolean
  capabilities: VideoProviderCapabilities
  createdAt: Date
  updatedAt: Date
}

export interface VideoProviderReferenceLimits {
  image: number
  video: number
  audio: number
}

export interface VideoProviderPublic {
  providerKey: string
  name: string
  providerType: VideoProviderType
  capabilities: VideoProviderCapabilities
  referenceLimits?: VideoProviderReferenceLimits
}

export interface ActiveVideoProviderResponse extends VideoProviderPublic {
  referenceLimits: VideoProviderReferenceLimits
}

export interface VideoProviderAdmin extends VideoProviderPublic {
  id: number
  endpoint: string
  enabled: boolean
  isDefault: boolean
  apiKeyMasked: string
}

export interface VideoProviderSnapshot {
  providerKey: string
  name: string
  providerType: VideoProviderType
  endpoint: string
  capabilities: VideoProviderCapabilities
}

const toApisCapabilities: VideoProviderCapabilities = {
  version: 1,
  models: [
    {
      id: 'seedance-2',
      label: 'Seedance 2.0',
      duration: { min: 4, max: 15, auto: true },
      resolutions: ['480p', '720p', '1080p', '4k'],
      aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'],
      operations: ['generate'],
      supports: { firstLastFrame: true, referenceImage: true, referenceVideo: true, referenceAudio: true, generateAudio: true },
      referenceLimits: { image: 9, video: 3, audio: 3 },
    },
    {
      id: 'seedance-2-fast',
      label: 'Seedance 2.0 Fast',
      duration: { min: 4, max: 15, auto: true },
      resolutions: ['480p', '720p'],
      aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'],
      operations: ['generate'],
      supports: { firstLastFrame: true, referenceImage: true, referenceVideo: true, referenceAudio: true, generateAudio: true },
      referenceLimits: { image: 9, video: 3, audio: 3 },
    },
    {
      id: 'seedance-2-5',
      label: 'Seedance 2.5',
      duration: { min: 4, max: 30, auto: true },
      resolutions: ['480p', '720p'],
      aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'],
      operations: ['generate', 'edit', 'extend'],
      supports: {
        firstLastFrame: true,
        referenceImage: true,
        referenceVideo: true,
        referenceAudio: true,
        audioOnlyReference: true,
        generateAudio: true,
        outputFormat: true,
      },
      referenceLimits: { image: 30, video: 10, audio: 10 },
    },
  ],
}

// ToAPIs 平台各模型的参考素材上限（数据库中的旧能力快照缺少该字段时按模型 ID 注入）
const modelReferenceLimitsByModelId: Record<string, VideoProviderReferenceLimits> = {
  'seedance-2': { image: 9, video: 3, audio: 3 },
  'seedance-2-fast': { image: 9, video: 3, audio: 3 },
  'seedance-2-mini': { image: 9, video: 3, audio: 3 },
  'seedance-2-5': { image: 30, video: 10, audio: 10 },
}

const normalizeCapabilities = (value: Record<string, unknown>): VideoProviderCapabilities => {
  const models = value.models
  if (!Array.isArray(models) || models.length === 0) {
    return toApisCapabilities
  }
  return value as unknown as VideoProviderCapabilities
}

const normalizeEndpoint = (endpoint: string) => endpoint.trim().replace(/\/+$/, '')

const isProviderType = (value: string): value is VideoProviderType => value === 'toapis' || value === 'volcano_ark'

export class VideoProviderService {
  public constructor(
    private readonly configService: ConfigService = new ConfigService(),
    private readonly userApiKeyService: UserApiKeyService = new UserApiKeyService()
  ) {}

  public async listForAdmin(): Promise<{ items: VideoProviderAdmin[] }> {
    const rows = await db.selectFrom('video_providers').selectAll().orderBy('id', 'asc').execute()
    return { items: rows.map((row) => this.toAdmin(row)) }
  }

  public async getActiveForPublic(): Promise<ActiveVideoProviderResponse> {
    const provider = await this.getDefaultEnabled()
    return { ...this.toPublic(provider), referenceLimits: await this.getReferenceLimits() }
  }

  public async getActiveForTask(providerKey: string): Promise<{ record: VideoProviderRecord; snapshot: VideoProviderSnapshot }> {
    const provider = await db
      .selectFrom('video_providers')
      .selectAll()
      .where('provider_key', '=', providerKey)
      .where('enabled', '=', true)
      .executeTakeFirst()
    if (!provider) {
      throw new ValidationAppError('所选视频生成平台不存在或未启用，请刷新页面后重试')
    }
    const record = this.toRecord(provider)
    return { record, snapshot: this.toSnapshot(record) }
  }

  public async getClientConfiguration(
    snapshot: VideoProviderSnapshot,
    userId?: number
  ): Promise<{ endpoint: string; apiKey: string }> {
    const provider = await db
      .selectFrom('video_providers')
      .select(['provider_key', 'api_key', 'endpoint'])
      .where('provider_key', '=', snapshot.providerKey)
      .executeTakeFirst()
    if (!provider) {
      throw new ValidationAppError(`视频生成平台 ${snapshot.name} 已被删除，无法继续查询任务`)
    }

    const globalApiKey = this.decryptStoredKey(provider.api_key)
    // endpoint 优先使用平台当前配置：历史任务快照中的 endpoint 可能已失效（域名切换），
    // 与 api_key 保持同样取当前值的语义
    const endpoint = normalizeEndpoint(provider.endpoint) || snapshot.endpoint

    if (userId !== undefined) {
      const mode = await this.userApiKeyService.getApiKeyMode()
      if (mode === 'per_member') {
        const resolved = await this.userApiKeyService.resolveApiKey(userId, snapshot.providerKey, mode)
        if (resolved) {
          return { endpoint, apiKey: resolved.apiKey }
        }
        // Fall back to global key — ensures already-created tasks can still poll
      }
    }

    return { endpoint, apiKey: globalApiKey }
  }

  /** Resolve the current provider endpoint with the authenticated user's own key.
   * This path intentionally never falls back to the platform-wide key.
   */
  public async getUserClientConfiguration(userId: number, providerKey?: string): Promise<{
    providerKey: string
    providerType: VideoProviderType
    name: string
    endpoint: string
    apiKey: string
  }> {
    const provider = providerKey
      ? await db.selectFrom('video_providers').selectAll().where('provider_key', '=', providerKey).where('enabled', '=', true).executeTakeFirst()
      : await db.selectFrom('video_providers').selectAll().where('is_default', '=', true).where('enabled', '=', true).executeTakeFirst()
    if (!provider) throw new ValidationAppError('尚未配置启用的图像生成平台')
    const record = this.toRecord(provider)
    const userKey = await this.userApiKeyService.getByUser(userId, record.providerKey)
    if (!userKey) throw new ValidationAppError('当前用户尚未配置图像模型 API Key')
    return {
      providerKey: record.providerKey,
      providerType: record.providerType,
      name: record.name,
      endpoint: normalizeEndpoint(record.endpoint),
      apiKey: userKey.apiKey,
    }
  }

  public async create(input: {
    providerKey: string
    name: string
    providerType: VideoProviderType
    endpoint: string
    apiKey: string
    enabled?: boolean
    capabilities?: VideoProviderCapabilities
  }): Promise<VideoProviderAdmin> {
    this.assertInput(input)
    const noProviders = !(await db.selectFrom('video_providers').select('id').executeTakeFirst())
    const row = await db
      .insertInto('video_providers')
      .values({
        provider_key: input.providerKey.trim(),
        name: input.name.trim(),
        provider_type: input.providerType,
        endpoint: normalizeEndpoint(input.endpoint),
        api_key: this.configService.encryptSecret(input.apiKey.trim()),
        enabled: input.enabled ?? true,
        is_default: noProviders,
        capabilities: (input.capabilities ?? toApisCapabilities) as unknown as Record<string, unknown>,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    return this.toAdmin(row)
  }

  public async update(id: number, input: {
    name?: string
    endpoint?: string
    apiKey?: string
    enabled?: boolean
    capabilities?: VideoProviderCapabilities
  }): Promise<VideoProviderAdmin> {
    const current = await db.selectFrom('video_providers').selectAll().where('id', '=', id).executeTakeFirst()
    if (!current) {
      throw new ValidationAppError('视频生成平台不存在')
    }
    if (input.enabled === false && current.is_default) {
      throw new ValidationAppError('请先启用并切换到另一个平台后，再停用当前平台')
    }
    if (input.endpoint !== undefined && !normalizeEndpoint(input.endpoint)) {
      throw new ValidationAppError('接口地址不能为空')
    }
    const row = await db
      .updateTable('video_providers')
      .set({
        name: input.name === undefined ? undefined : input.name.trim(),
        endpoint: input.endpoint === undefined ? undefined : normalizeEndpoint(input.endpoint),
        api_key: input.apiKey?.trim() ? this.configService.encryptSecret(input.apiKey.trim()) : undefined,
        enabled: input.enabled,
        capabilities: input.capabilities as unknown as Record<string, unknown> | undefined,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()
    return this.toAdmin(row)
  }

  public async activate(id: number): Promise<VideoProviderAdmin> {
    const target = await db.selectFrom('video_providers').selectAll().where('id', '=', id).executeTakeFirst()
    if (!target) {
      throw new ValidationAppError('视频生成平台不存在')
    }
    if (!target.enabled) {
      throw new ValidationAppError('请先启用该视频生成平台')
    }
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('video_providers').set({ is_default: false, updated_at: new Date() }).where('is_default', '=', true).execute()
      await trx.updateTable('video_providers').set({ is_default: true, updated_at: new Date() }).where('id', '=', id).execute()
    })
    const active = await db.selectFrom('video_providers').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    return this.toAdmin(active)
  }

  public validateRequest(provider: VideoProviderRecord, input: {
    model: string
    operation?: 'generate' | 'edit' | 'extend'
    duration: number
    ratio: string
    resolution: string
    mode: 'frames' | 'omni'
  }): void {
    const model = provider.capabilities.models.find((item) => item.id === input.model)
    if (!model) {
      throw new ValidationAppError('所选模型不属于当前视频生成平台')
    }
    const operation = input.operation ?? 'generate'
    if (!model.operations.includes(operation)) {
      throw new ValidationAppError('当前模型不支持所选的视频操作')
    }
    if (input.duration !== -1 && (input.duration < model.duration.min || input.duration > model.duration.max)) {
      throw new ValidationAppError(`当前模型支持 ${model.duration.min}-${model.duration.max} 秒视频`) 
    }
    if (input.duration === -1 && !model.duration.auto) {
      throw new ValidationAppError('当前模型不支持自动时长')
    }
    if (!model.resolutions.includes(input.resolution)) {
      throw new ValidationAppError('当前模型不支持所选分辨率')
    }
    if (!model.aspectRatios.includes(input.ratio)) {
      throw new ValidationAppError('当前模型不支持所选画幅比例')
    }
    if (input.mode === 'frames' && !model.supports.firstLastFrame) {
      throw new ValidationAppError('当前模型不支持首尾帧模式')
    }
    if ((operation === 'edit' || operation === 'extend' || input.mode === 'frames') && input.ratio !== 'adaptive' && model.id === 'seedance-2-5') {
      throw new ValidationAppError('Seedance 2.5 的编辑、续写和首尾帧任务必须使用 adaptive 画幅')
    }
  }

  private async getDefaultEnabled(): Promise<VideoProviderRecord> {
    const row = await db
      .selectFrom('video_providers')
      .selectAll()
      .where('is_default', '=', true)
      .where('enabled', '=', true)
      .executeTakeFirst()
    if (!row) {
      throw new ValidationAppError('尚未配置启用的视频生成平台，请在系统配置中完成配置')
    }
    return this.toRecord(row)
  }

  private async getReferenceLimits(): Promise<VideoProviderReferenceLimits> {
    const readLimit = async (key: string, fallback: number, max: number) => {
      const raw = await this.configService.getOptional(key)
      const parsed = Number.parseInt(raw ?? '', 10)
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback
    }

    return {
      image: await readLimit('video_reference_image_limit', 30, 30),
      video: await readLimit('video_reference_video_limit', 10, 10),
      audio: await readLimit('video_reference_audio_limit', 10, 10),
    }
  }

  private assertInput(input: { providerKey: string; name: string; providerType: string; endpoint: string; apiKey: string }): void {
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(input.providerKey.trim())) {
      throw new ValidationAppError('平台标识仅支持小写字母、数字、下划线和连字符')
    }
    if (!input.name.trim() || !isProviderType(input.providerType) || !normalizeEndpoint(input.endpoint) || !input.apiKey.trim()) {
      throw new ValidationAppError('请完整填写平台名称、类型、接口地址和 API Key')
    }
  }

  private toRecord(row: any): VideoProviderRecord {
    if (!isProviderType(row.provider_type)) {
      throw new ValidationAppError(`不支持的视频生成平台类型: ${row.provider_type}`)
    }
    return {
      id: Number(row.id), providerKey: row.provider_key, name: row.name, providerType: row.provider_type,
      endpoint: row.endpoint, apiKey: row.api_key, enabled: row.enabled, isDefault: row.is_default,
      capabilities: normalizeCapabilities(row.capabilities as Record<string, unknown>),
      createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
    }
  }

  private toPublic(record: VideoProviderRecord): VideoProviderPublic {
    return {
      providerKey: record.providerKey,
      name: record.name,
      providerType: record.providerType,
      capabilities: {
        ...record.capabilities,
        models: record.capabilities.models.map((model) => ({
          ...model,
          referenceLimits: model.referenceLimits ?? modelReferenceLimitsByModelId[model.id],
        })),
      },
    }
  }

  private toSnapshot(record: VideoProviderRecord): VideoProviderSnapshot {
    return { ...this.toPublic(record), endpoint: record.endpoint }
  }

  private toAdmin(row: any): VideoProviderAdmin {
    const record = this.toRecord(row)
    return { ...this.toPublic(record), id: record.id, endpoint: record.endpoint, enabled: record.enabled, isDefault: record.isDefault, apiKeyMasked: ConfigService.maskSecretValue(this.decryptStoredKey(record.apiKey)) }
  }

  private decryptStoredKey(value: string): string {
    if (!value) return ''
    try {
      return this.configService.decryptSecret(value)
    } catch {
      return value
    }
  }
}

export const defaultToApisCapabilities = toApisCapabilities
