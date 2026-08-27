import { ConfigService } from '../services/config.service'

// 平台 API 单次请求超时，防止接口挂起拖死调用方
const ARK_API_TIMEOUT_MS = 60_000

export interface ArkVideoTaskInfo {
  id: string
  status: string
  videoUrl: string | null
  completionTokens: number | null
  totalTokens: number | null
  errorMessage: string | null
  createdAt: string | null
  updatedAt: string | null
  executionExpiresAfter: number | null
}

export type ArkAssetReferenceMode = 'provider_asset' | 'signed_url'

export interface ArkVideoClient {
  createTask(payload: Record<string, unknown>): Promise<string>
  getTask(arkTaskId: string): Promise<ArkVideoTaskInfo>
  listTasks(arkTaskIds: string[]): Promise<ArkVideoTaskInfo[]>
  getAssetReferenceMode?(): Promise<ArkAssetReferenceMode>
}

interface ArkBearerClientOptions {
  fetchImpl?: typeof fetch
  getApiKey?: () => Promise<string>
  getEndpoint?: () => Promise<string>
  providerType?: 'toapis' | 'volcano_ark'
}

export class ArkApiRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'ArkApiRequestError'
  }
}

export const isArkAuthenticationError = (error: unknown): error is ArkApiRequestError =>
  error instanceof ArkApiRequestError &&
  (
    error.status === 401 ||
    error.status === 403 ||
    /invalid\s*(?:api\s*)?key|invalid\s*token|unauthori[sz]ed|authentication|无效的令牌|令牌无效|认证失败/i.test(error.message)
  )

const isTaskNotFoundError = (error: unknown) =>
  error instanceof ArkApiRequestError &&
  (
    error.status === 404 ||
    /task[_\s-]*(?:not[_\s-]*(?:exist|found)|does[_\s-]*not[_\s-]*exist)|任务不存在/i.test(error.message)
  )

const normalizeEndpoint = (endpoint: string) => endpoint.replace(/\/+$/, '')

const resolveErrorMessage = (payload: any, fallback: string) => {
  const candidates = [payload?.error?.message?.message, payload?.error?.message, payload?.message]
  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0) ?? fallback
}

interface ProviderErrorTranslation {
  test: RegExp
  buildMessage: (match: RegExpMatchArray, raw: string) => string
}

const providerErrorTranslations: ProviderErrorTranslation[] = [
  {
    test: /may contain real person/i,
    buildMessage: (match, raw) => {
      const contentMatch = raw.match(/content\[(\d+)\]/i)
      const position = contentMatch ? `第 ${Number(contentMatch[1]) + 1} 个素材` : '某个素材'
      return `参考${position}疑似包含真实人物，平台已拒绝生成。请将真人照片替换为插画、动漫或 AI 生成类图片后重试。`
    },
  },
  {
    test: /SensitiveContentDetection|sensitive content|敏感内容/i,
    buildMessage: () => '素材或提示词疑似包含敏感内容，平台已拒绝生成，请调整后重试。',
  },
  {
    test: /InvalidParameter|invalid parameter|参数错误/i,
    buildMessage: () => '生成参数不合法，请检查分辨率、时长、画幅等设置后重试。',
  },
  {
    test: /Arrearage|insufficient (balance|quota)|余额不足|欠费/i,
    buildMessage: () => '视频生成平台账户余额或额度不足，请联系管理员充值后重试。',
  },
  {
    test: /Model(?:NotFound|NotExists)|model does not exist|模型不存在/i,
    buildMessage: () => '所选模型在当前平台不可用，请更换模型或联系管理员。',
  },
  {
    test: /RateLimit|too many requests|请求过于频繁|限流/i,
    buildMessage: () => '请求过于频繁触发平台限流，请稍后重试。',
  },
]

const translateProviderErrorMessage = (message: string): string => {
  for (const translation of providerErrorTranslations) {
    const match = message.match(translation.test)
    if (match) {
      const translated = translation.buildMessage(match, message)
      return `${translated}（平台原始信息：${message}）`
    }
  }
  return message
}

const isToApisEndpoint = (endpoint: string) => {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase()
    return hostname === 'toapis.com' || hostname.endsWith('.toapis.com')
  } catch {
    return false
  }
}

const buildToApisPath = (endpoint: string, taskId?: string) => {
  const pathname = new URL(endpoint).pathname.replace(/\/+$/, '')
  const versionPrefix = /(^|\/)v1$/i.test(pathname) ? '' : '/v1'
  const taskSuffix = taskId ? `/${encodeURIComponent(taskId)}` : ''
  return `${versionPrefix}/videos/generations${taskSuffix}`
}

const mapToApisModel = (model: unknown) => {
  if (typeof model !== 'string') {
    return model
  }

  const normalized = model.trim().toLowerCase()
  if (
    normalized.startsWith('doubao-seedance-2-0-fast') ||
    normalized === 'seedance-2.0-fast'
  ) {
    return 'seedance-2-fast'
  }
  if (
    normalized.startsWith('doubao-seedance-2-0-mini') ||
    normalized === 'seedance-2.0-mini'
  ) {
    return 'seedance-2-mini'
  }
  if (
    normalized.startsWith('doubao-seedance-2-0') ||
    normalized === 'seedance-2.0'
  ) {
    return 'seedance-2'
  }

  return model
}

const buildToApisCreatePayload = (payload: Record<string, unknown>) => {
  const content = Array.isArray(payload.content) ? payload.content : []
  const mode = payload.mode
  const textItems = content.filter(
    (item): item is { type: 'text'; text: string } =>
      Boolean(item) &&
      typeof item === 'object' &&
      (item as Record<string, unknown>).type === 'text' &&
      typeof (item as Record<string, unknown>).text === 'string'
  )
  const prompt = textItems.map((item) => item.text.trim()).filter(Boolean).join('\n')

  const imageItems = content.filter(
    (item): item is Record<string, any> =>
      Boolean(item) && typeof item === 'object' && (item as Record<string, unknown>).type === 'image_url'
  )
  const imageWithRoles = imageItems.flatMap((item, index) => {
    const url = item.image_url?.url
    if (typeof url !== 'string' || url.trim().length === 0) {
      return []
    }

    const explicitRole = item.role
    const role =
      explicitRole === 'first_frame' || explicitRole === 'last_frame' || explicitRole === 'reference_image'
        ? explicitRole
        : mode === 'frames'
          ? index === 0
            ? 'first_frame'
            : 'last_frame'
          : 'reference_image'
    return [{ url, role }]
  })

  const videoWithRoles = content.flatMap((item) => {
    if (!item || typeof item !== 'object' || (item as Record<string, unknown>).type !== 'video_url') {
      return []
    }
    const url = (item as any).video_url?.url
    return typeof url === 'string' && url.trim().length > 0 ? [{ url, role: 'reference_video' }] : []
  })

  const audioWithRoles = content.flatMap((item) => {
    if (!item || typeof item !== 'object' || (item as Record<string, unknown>).type !== 'audio_url') {
      return []
    }
    const url = (item as any).audio_url?.url
    return typeof url === 'string' && url.trim().length > 0 ? [{ url, role: 'reference_audio' }] : []
  })

  const {
    content: _content,
    mode: _mode,
    ratio,
    aspect_ratio: aspectRatio,
    operation,
    ...rest
  } = payload
  const result: Record<string, unknown> = {
    ...rest,
    model: mapToApisModel(payload.model),
  }

  if (prompt) {
    result.prompt = prompt
  }
  if (typeof ratio === 'string' && ratio.trim().length > 0) {
    result.aspect_ratio = ratio
  } else if (typeof aspectRatio === 'string' && aspectRatio.trim().length > 0) {
    result.aspect_ratio = aspectRatio
  }
  if (imageWithRoles.length > 0) {
    result.image_with_roles = imageWithRoles
  }
  if (videoWithRoles.length > 0) {
    result.video_with_roles = videoWithRoles
  }
  if (audioWithRoles.length > 0) {
    result.audio_with_roles = audioWithRoles
  }
  if (typeof operation === 'string' && operation.trim().length > 0) {
    result.video_operation = operation
  }

  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined && value !== null))
}

const resolveVideoUrl = (content: unknown): string | null => {
  if (!content || typeof content !== 'object') {
    return null
  }

  const direct = (content as Record<string, unknown>).video_url
  if (typeof direct === 'string') {
    return direct
  }

  if (direct && typeof direct === 'object' && typeof (direct as Record<string, unknown>).url === 'string') {
    return (direct as Record<string, unknown>).url as string
  }

  return null
}

const resolveToApisVideoUrl = (task: any): string | null => {
  const resultItems = Array.isArray(task?.result?.data) ? task.result.data : []
  const resultItem = resultItems.find((item: unknown) =>
    Boolean(item) && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string'
  )
  if (resultItem) {
    return (resultItem as Record<string, unknown>).url as string
  }

  return resolveVideoUrl(task?.content)
}

const resolveTimestamp = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString()
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
  }

  return null
}

const mapTaskInfo = (task: any, fallbackId: string): ArkVideoTaskInfo => ({
  id: typeof task?.id === 'string' ? task.id : fallbackId,
  status: typeof task?.status === 'string' ? task.status : 'processing',
  videoUrl: resolveVideoUrl(task?.content),
  completionTokens: typeof task?.usage?.completion_tokens === 'number' ? task.usage.completion_tokens : null,
  totalTokens: typeof task?.usage?.total_tokens === 'number' ? task.usage.total_tokens : null,
  errorMessage:
    typeof task?.error?.message === 'string'
      ? task.error.message
      : typeof task?.error === 'string'
        ? task.error
        : null,
  createdAt: resolveTimestamp(task?.created_at),
  updatedAt: resolveTimestamp(task?.updated_at),
  executionExpiresAfter:
    typeof task?.execution_expires_after === 'number' ? task.execution_expires_after : null,
})

const mapToApisTaskInfo = (task: any, fallbackId: string): ArkVideoTaskInfo => ({
  id: typeof task?.id === 'string' ? task.id : fallbackId,
  status: typeof task?.status === 'string' ? task.status : 'in_progress',
  videoUrl: resolveToApisVideoUrl(task),
  completionTokens: typeof task?.usage?.completion_tokens === 'number' ? task.usage.completion_tokens : null,
  totalTokens: typeof task?.usage?.total_tokens === 'number' ? task.usage.total_tokens : null,
  errorMessage:
    typeof task?.error?.message === 'string'
      ? task.error.message
      : typeof task?.error === 'string'
        ? task.error
        : null,
  createdAt: resolveTimestamp(task?.created_at),
  updatedAt: resolveTimestamp(task?.completed_at ?? task?.updated_at),
  executionExpiresAfter:
    typeof task?.expires_at === 'number' && typeof task?.completed_at === 'number'
      ? Math.max(0, task.expires_at - task.completed_at)
      : null,
})

const unwrapTaskResponse = (response: any) =>
  response?.data && typeof response.data === 'object' && !Array.isArray(response.data)
    ? response.data
    : response

const buildListTasksPath = (arkTaskIds: string[]) => {
  const params = new URLSearchParams({
    page_num: '1',
    page_size: String(arkTaskIds.length),
  })

  for (const taskId of arkTaskIds) {
    params.append('filter.task_ids', taskId)
  }

  return `/contents/generations/tasks?${params.toString()}`
}

export class ArkBearerClient implements ArkVideoClient {
  private readonly fetchImpl: typeof fetch
  private readonly getApiKey: () => Promise<string>
  private readonly getEndpoint: () => Promise<string>
  private readonly providerType?: 'toapis' | 'volcano_ark'

  public constructor(options: ArkBearerClientOptions = {}) {
    const configService = new ConfigService()
    this.fetchImpl = options.fetchImpl ?? fetch
    this.getApiKey = options.getApiKey ?? (() => configService.getRequired('ark_api_key'))
    this.getEndpoint = options.getEndpoint ?? (() => configService.getRequired('ark_endpoint'))
    this.providerType = options.providerType
  }

  public async getAssetReferenceMode(): Promise<ArkAssetReferenceMode> {
    return this.isToApis(await this.getEndpoint()) ? 'signed_url' : 'provider_asset'
  }

  public async createTask(payload: Record<string, unknown>): Promise<string> {
    const endpoint = await this.getEndpoint()
    const toApis = this.isToApis(endpoint)
    const response = await this.callApi(toApis ? buildToApisPath(endpoint) : '/contents/generations/tasks', {
      method: 'POST',
      body: JSON.stringify(toApis ? buildToApisCreatePayload(payload) : payload),
    }, endpoint)

    const task = unwrapTaskResponse(response)
    const taskId =
      typeof task?.id === 'string'
        ? task.id
        : typeof task?.task_id === 'string'
          ? task.task_id
          : null
    if (!taskId) {
      throw new Error('火山视频任务创建成功但未返回任务 ID')
    }

    return taskId
  }

  public async getTask(arkTaskId: string): Promise<ArkVideoTaskInfo> {
    const tasks = await this.listTasks([arkTaskId])
    return tasks[0] ?? {
      id: arkTaskId,
      status: 'processing',
      videoUrl: null,
      completionTokens: null,
      totalTokens: null,
      errorMessage: null,
      createdAt: null,
      updatedAt: null,
      executionExpiresAfter: null,
    }
  }

  public async listTasks(arkTaskIds: string[]): Promise<ArkVideoTaskInfo[]> {
    if (arkTaskIds.length === 0) {
      return []
    }

    const endpoint = await this.getEndpoint()
    if (this.isToApis(endpoint)) {
      const tasks = await Promise.all(
        arkTaskIds.map(async (taskId) => {
          try {
            const response = await this.callApi(buildToApisPath(endpoint, taskId), {
              method: 'GET',
            }, endpoint)
            return mapToApisTaskInfo(unwrapTaskResponse(response), taskId)
          } catch (error) {
            if (isTaskNotFoundError(error)) {
              return null
            }
            throw error
          }
        })
      )
      return tasks.filter((task): task is ArkVideoTaskInfo => task !== null)
    }

    const response = await this.callApi(buildListTasksPath(arkTaskIds), {
      method: 'GET',
    }, endpoint)

    const items = Array.isArray(response?.items) ? response.items : []
    return items.map((item: any) => mapTaskInfo(item, ''))
  }

  private isToApis(endpoint: string): boolean {
    return this.providerType === 'toapis' || (this.providerType !== 'volcano_ark' && isToApisEndpoint(endpoint))
  }

  private async callApi(pathname: string, init: RequestInit, endpointOverride?: string): Promise<any> {
    const [endpoint, apiKey] = await Promise.all([
      endpointOverride ? Promise.resolve(endpointOverride) : this.getEndpoint(),
      this.getApiKey(),
    ])
    const url = `${normalizeEndpoint(endpoint)}${pathname}`

    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      // 防止平台接口挂起拖死调用方（如视频轮询循环）
      signal: init.signal ?? AbortSignal.timeout(ARK_API_TIMEOUT_MS),
    })

    const json = await response.json().catch(() => null)
    if (!response.ok) {
      throw new ArkApiRequestError(
        translateProviderErrorMessage(resolveErrorMessage(json, `火山 API 调用失败: ${response.status}`)),
        response.status
      )
    }

    return json
  }
}
