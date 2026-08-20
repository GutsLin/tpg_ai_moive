import { ArkApiRequestError } from './ark-bearer'
import { ArkAkskClient, type ArkAssetClient, type ArkAssetGroupInfo } from './ark-aksk'
import { VideoProviderService } from '../services/video-provider.service'

const PRIVATE_AVATAR_BASE = '/videos/doubao-seedance-2-0/private-avatar'
const TOAPIS_GROUP_ID_PATTERN = /^pg_[A-Za-z0-9]+$/

interface ToApisAvatarClientOptions {
  fetchImpl?: typeof fetch
  getApiKey?: () => Promise<string>
  getEndpoint?: () => Promise<string>
}

const normalizeEndpoint = (endpoint: string) => endpoint.replace(/\/+$/, '')

const resolveErrorMessage = (payload: any, fallback: string) => {
  const candidates = [payload?.message, payload?.error?.message]
  return candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0) ?? fallback
}

const mapStatus = (status: string): string => {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'Active'
    case 'failed':
      return 'Failed'
    default:
      return 'Processing'
  }
}

export class ToApisAvatarClient implements ArkAssetClient {
  public readonly supportedAssetTypes = ['Image', 'Video', 'Audio'] as const

  private readonly fetchImpl: typeof fetch
  private readonly getApiKey: () => Promise<string>
  private readonly getEndpoint: () => Promise<string>

  public constructor(options: ToApisAvatarClientOptions = {}) {
    const providerService = new VideoProviderService()
    this.fetchImpl = options.fetchImpl ?? fetch
    this.getApiKey = options.getApiKey ?? (async () => {
      const active = await providerService.getActiveForPublic()
      const { snapshot } = await providerService.getActiveForTask(active.providerKey)
      return (await providerService.getClientConfiguration(snapshot)).apiKey
    })
    this.getEndpoint = options.getEndpoint ?? (async () => {
      const active = await providerService.getActiveForPublic()
      const { snapshot } = await providerService.getActiveForTask(active.providerKey)
      return snapshot.endpoint
    })
  }

  public async matchesGroupId(groupId: string | null | undefined): Promise<boolean> {
    return typeof groupId === 'string' && TOAPIS_GROUP_ID_PATTERN.test(groupId.trim())
  }

  public getSupportedAssetTypes(): Promise<ReadonlyArray<'Image' | 'Video' | 'Audio'>> {
    return Promise.resolve(this.supportedAssetTypes)
  }

  public async createAssetGroup(input: {
    name: string
    description?: string | null
    groupType?: string
    projectName?: string
  }): Promise<ArkAssetGroupInfo> {
    const data = await this.callApi<{ group_id?: string; name?: string; description?: string }>('POST', '/groups', {
      name: input.name,
      description: input.description ?? undefined,
    })

    return {
      id: data.group_id ?? '',
      name: data.name ?? input.name,
      description: data.description ?? input.description ?? null,
      groupType: 'PRIVATE_AVATAR',
      projectName: null,
    }
  }

  public async createAsset(
    groupId: string,
    signedUrl: string,
    name?: string,
    assetType: 'Image' | 'Video' | 'Audio' = 'Image',
    _projectName?: string
  ): Promise<string> {
    if (!(await this.matchesGroupId(groupId))) {
      throw new Error('素材组 ID 与 ToAPIs 素材库不匹配，请在素材组设置中重新保存同步开关以创建新组')
    }

    const data = await this.callApi<{ asset_id?: string }>('POST', '/assets', {
      group_id: groupId,
      asset_type: assetType.toLowerCase(),
      source_url: signedUrl,
      name,
    })

    if (!data.asset_id) {
      throw new Error('ToAPIs 素材提交成功但未返回素材 ID')
    }
    return data.asset_id
  }

  public async getAsset(arkAssetId: string, _projectName?: string) {
    const data = await this.callApi<{
      asset_id?: string
      status?: string
      asset_url?: string
      reason?: string
      message?: string
    }>('GET', `/assets/${encodeURIComponent(arkAssetId)}`)

    return {
      id: data.asset_id ?? arkAssetId,
      status: mapStatus(data.status ?? ''),
      url: data.asset_url ?? '',
      errorCode: null,
      errorMessage: data.status?.toLowerCase() === 'failed' ? (data.reason ?? data.message ?? null) : null,
      projectName: null,
    }
  }

  public async deleteAsset(_arkAssetId: string, _projectName?: string): Promise<void> {
    // ToAPIs 素材库暂未提供删除接口，保留远端素材不影响本地删除流程
  }

  public async listAssetGroups(input: {
    pageNumber?: number
    pageSize?: number
    name?: string
    projectName?: string
    groupIds?: string[]
  } = {}): Promise<ArkAssetGroupInfo[]> {
    try {
      const data = await this.callApi<{ items?: Array<{ group_id?: string; name?: string; description?: string }> }>(
        'GET',
        `/groups?page=${input.pageNumber ?? 1}&page_size=${input.pageSize ?? 100}`
      )
      return (data.items ?? []).map((item) => ({
        id: item.group_id ?? '',
        name: item.name ?? '',
        description: item.description ?? null,
        groupType: 'PRIVATE_AVATAR',
        projectName: null,
      }))
    } catch {
      return []
    }
  }

  public async updateAssetGroup(input: {
    id: string
    name?: string
    description?: string | null
    projectName?: string
  }): Promise<ArkAssetGroupInfo> {
    // ToAPIs 素材库暂未提供更新组接口，直接回显当前值
    return {
      id: input.id,
      name: input.name ?? '',
      description: input.description ?? null,
      groupType: 'PRIVATE_AVATAR',
      projectName: null,
    }
  }

  private async callApi<T>(method: string, pathname: string, body?: Record<string, unknown>): Promise<T> {
    const [endpoint, apiKey] = await Promise.all([this.getEndpoint(), this.getApiKey()])
    const url = `${normalizeEndpoint(endpoint)}${PRIVATE_AVATAR_BASE}${pathname}`

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    const json: any = await response.json().catch(() => null)
    if (!response.ok) {
      throw new ArkApiRequestError(
        resolveErrorMessage(json, `ToAPIs 素材库接口调用失败: ${response.status}`),
        response.status
      )
    }
    if (json && json.success === false) {
      throw new Error(resolveErrorMessage(json, 'ToAPIs 素材库接口返回失败'))
    }
    return (json?.data ?? {}) as T
  }
}

/**
 * 按当前默认视频生成平台选择素材库客户端：
 * toapis → ToAPIs 虚拟人像素材库；volcano_ark → 火山素材库（AK/SK）。
 */
export class ProviderAssetClient implements ArkAssetClient {
  private readonly providerService: VideoProviderService
  private readonly volcanoClient: ArkAkskClient
  private readonly toapisClient: ToApisAvatarClient

  public constructor(options?: {
    providerService?: VideoProviderService
    volcanoClient?: ArkAkskClient
    toapisClient?: ToApisAvatarClient
  }) {
    this.providerService = options?.providerService ?? new VideoProviderService()
    this.volcanoClient = options?.volcanoClient ?? new ArkAkskClient()
    this.toapisClient = options?.toapisClient ?? new ToApisAvatarClient()
  }

  private async resolveClient(): Promise<ArkAssetClient> {
    const active = await this.providerService.getActiveForPublic()
    return active.providerType === 'toapis' ? this.toapisClient : this.volcanoClient
  }

  public async matchesGroupId(groupId: string | null | undefined): Promise<boolean> {
    const client = await this.resolveClient()
    return (await client.matchesGroupId?.(groupId)) ?? true
  }

  public async getSupportedAssetTypes(): Promise<ReadonlyArray<'Image' | 'Video' | 'Audio'>> {
    const client = await this.resolveClient()
    return (await client.getSupportedAssetTypes?.()) ?? ['Image']
  }

  public async createAssetGroup(input: Parameters<ArkAssetClient['createAssetGroup']>[0]): Promise<ArkAssetGroupInfo> {
    return (await this.resolveClient()).createAssetGroup(input)
  }

  public async createAsset(...args: Parameters<ArkAssetClient['createAsset']>): Promise<string> {
    return (await this.resolveClient()).createAsset(...args)
  }

  public async getAsset(...args: Parameters<ArkAssetClient['getAsset']>) {
    return (await this.resolveClient()).getAsset(...args)
  }

  public async deleteAsset(...args: Parameters<ArkAssetClient['deleteAsset']>): Promise<void> {
    await (await this.resolveClient()).deleteAsset(...args)
  }

  public async listAssetGroups(...args: Parameters<ArkAssetClient['listAssetGroups']>): Promise<ArkAssetGroupInfo[]> {
    return (await this.resolveClient()).listAssetGroups(...args)
  }

  public async updateAssetGroup(...args: Parameters<ArkAssetClient['updateAssetGroup']>): Promise<ArkAssetGroupInfo> {
    return (await this.resolveClient()).updateAssetGroup(...args)
  }
}
