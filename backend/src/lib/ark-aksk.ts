import { createHash, createHmac } from 'node:crypto'

import { ConfigService } from '../services/config.service'

const ARK_SERVICE = 'ark'
const ARK_REGION = 'cn-beijing'
const ARK_VERSION = '2024-01-01'
const ARK_HOST = 'open.volcengineapi.com'
// 平台 API 单次请求超时，防止接口挂起拖死调用方
const ARK_API_TIMEOUT_MS = 60_000

export interface ArkAssetInfo {
  id: string
  status: string
  url: string
  errorCode: string | null
  errorMessage: string | null
  projectName: string | null
}

export interface ArkAssetGroupInfo {
  id: string
  name: string
  description: string | null
  groupType: string
  projectName: string | null
}

export interface ArkAssetClient {
  createAsset(
    groupId: string,
    signedUrl: string,
    name?: string,
    assetType?: 'Image' | 'Video' | 'Audio',
    projectName?: string
  ): Promise<string>
  getAsset(arkAssetId: string, projectName?: string): Promise<ArkAssetInfo>
  deleteAsset(arkAssetId: string, projectName?: string): Promise<void>
  listAssetGroups(input?: {
    pageNumber?: number
    pageSize?: number
    name?: string
    projectName?: string
    groupIds?: string[]
  }): Promise<ArkAssetGroupInfo[]>
  createAssetGroup(input: {
    name: string
    description?: string | null
    groupType?: string
    projectName?: string
  }): Promise<ArkAssetGroupInfo>
  updateAssetGroup(input: {
    id: string
    name?: string
    description?: string | null
    projectName?: string
  }): Promise<ArkAssetGroupInfo>
  matchesGroupId?(groupId: string | null | undefined): Promise<boolean>
  getSupportedAssetTypes?(): Promise<ReadonlyArray<'Image' | 'Video' | 'Audio'>>
}

interface ArkCredentials {
  accessKey: string
  secretKey: string
}

interface ArkAkskClientOptions {
  fetchImpl?: typeof fetch
  now?: () => Date
  getCredentials?: () => Promise<ArkCredentials>
  region?: string
  host?: string
}

interface ArkOpenApiResponse<T> {
  Result?: T
  ResponseMetadata?: {
    RequestId?: string
    Error?: {
      Code?: string
      Message?: string
    }
  }
}

const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex')

const hmacSha256 = (key: Buffer | string, value: string): Buffer =>
  createHmac('sha256', key).update(value, 'utf8').digest()

const toAmzDate = (date: Date): string => date.toISOString().replace(/[:-]|\.\d{3}/g, '')

const toDateStamp = (date: Date): string => toAmzDate(date).slice(0, 8)

const extractArkErrorMessage = (payload: ArkOpenApiResponse<unknown> | null, fallback: string): string => {
  return payload?.ResponseMetadata?.Error?.Message ?? fallback
}

export class ArkAkskClient implements ArkAssetClient {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date
  private readonly getCredentials: () => Promise<ArkCredentials>
  private readonly region: string
  private readonly host: string

  public async matchesGroupId(groupId: string | null | undefined): Promise<boolean> {
    return typeof groupId === 'string' && /^group-\d{8}-[a-z0-9]+$/i.test(groupId.trim())
  }

  public getSupportedAssetTypes(): Promise<ReadonlyArray<'Image' | 'Video' | 'Audio'>> {
    return Promise.resolve(['Image'])
  }

  public constructor(options: ArkAkskClientOptions = {}) {
    const configService = new ConfigService()

    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? (() => new Date())
    this.getCredentials =
      options.getCredentials ??
      (async () => ({
        accessKey: await configService.getRequired('ark_access_key'),
        secretKey: await configService.getRequired('ark_secret_key'),
      }))
    this.region = options.region ?? ARK_REGION
    this.host = options.host ?? ARK_HOST
  }

  public async createAsset(
    groupId: string,
    signedUrl: string,
    name?: string,
    assetType: 'Image' | 'Video' | 'Audio' = 'Image',
    projectName?: string
  ): Promise<string> {
    const result = await this.callApi<{ Id?: string; AssetId?: string }>('CreateAsset', {
      GroupId: groupId,
      URL: signedUrl,
      Name: name,
      AssetType: assetType,
      ProjectName: projectName,
    })

    const assetId = result.Id ?? result.AssetId
    if (!assetId) {
      throw new Error('火山素材创建成功但未返回素材 ID')
    }

    return assetId
  }

  public async getAsset(arkAssetId: string, projectName?: string): Promise<ArkAssetInfo> {
    const result = await this.callApi<{
      Id?: string
      Status?: string
      URL?: string
      ProjectName?: string
      Error?: {
        Code?: string
        Message?: string
      }
    }>('GetAsset', {
      Id: arkAssetId,
      ProjectName: projectName,
    })

    return {
      id: result.Id ?? arkAssetId,
      status: result.Status ?? 'Processing',
      url: result.URL ?? '',
      errorCode: result.Error?.Code ?? null,
      errorMessage: result.Error?.Message ?? null,
      projectName: result.ProjectName ?? projectName ?? null,
    }
  }

  public async deleteAsset(arkAssetId: string, projectName?: string): Promise<void> {
    await this.callApi('DeleteAsset', {
      Id: arkAssetId,
      ProjectName: projectName,
    })
  }

  public async listAssetGroups(input: {
    pageNumber?: number
    pageSize?: number
    name?: string
    projectName?: string
    groupIds?: string[]
  } = {}): Promise<ArkAssetGroupInfo[]> {
    const result = await this.callApi<{
      Items?: Array<{
        Id?: string
        Name?: string
        Description?: string
        GroupType?: string
        ProjectName?: string
      }>
    }>('ListAssetGroups', {
      PageNumber: input.pageNumber ?? 1,
      PageSize: input.pageSize ?? 100,
      Filter: {
        GroupType: 'AIGC',
        Name: input.name,
        GroupIds: input.groupIds,
      },
      ProjectName: input.projectName,
    })

    return (result.Items ?? []).map((item) => ({
      id: item.Id ?? '',
      name: item.Name ?? '',
      description: item.Description ?? null,
      groupType: item.GroupType ?? 'AIGC',
      projectName: item.ProjectName ?? input.projectName ?? null,
    }))
  }

  public async createAssetGroup(input: {
    name: string
    description?: string | null
    groupType?: string
    projectName?: string
  }): Promise<ArkAssetGroupInfo> {
    const result = await this.callApi<{
      Id?: string
      Name?: string
      Description?: string
      GroupType?: string
      ProjectName?: string
    }>('CreateAssetGroup', {
      Name: input.name,
      Description: input.description ?? undefined,
      GroupType: input.groupType ?? 'AIGC',
      ProjectName: input.projectName,
    })

    return {
      id: result.Id ?? '',
      name: result.Name ?? input.name,
      description: result.Description ?? input.description ?? null,
      groupType: result.GroupType ?? input.groupType ?? 'AIGC',
      projectName: result.ProjectName ?? input.projectName ?? null,
    }
  }

  public async updateAssetGroup(input: {
    id: string
    name?: string
    description?: string | null
    projectName?: string
  }): Promise<ArkAssetGroupInfo> {
    const result = await this.callApi<{
      Id?: string
      Name?: string
      Description?: string
      GroupType?: string
      ProjectName?: string
    }>('UpdateAssetGroup', {
      Id: input.id,
      Name: input.name,
      Description: input.description ?? undefined,
      ProjectName: input.projectName,
    })

    return {
      id: result.Id ?? input.id,
      name: result.Name ?? input.name ?? '',
      description: result.Description ?? input.description ?? null,
      groupType: result.GroupType ?? 'AIGC',
      projectName: result.ProjectName ?? input.projectName ?? null,
    }
  }

  private async callApi<T>(action: string, body: Record<string, unknown>): Promise<T> {
    const payload = JSON.stringify(
      Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined))
    )
    const now = this.now()
    const amzDate = toAmzDate(now)
    const dateStamp = toDateStamp(now)
    const payloadHash = sha256Hex(payload)
    const canonicalQuery = `Action=${action}&Version=${ARK_VERSION}`
    const canonicalHeaders =
      `content-type:application/json\n` +
      `host:${this.host}\n` +
      `x-content-sha256:${payloadHash}\n` +
      `x-date:${amzDate}\n`
    const signedHeaders = 'content-type;host;x-content-sha256;x-date'
    const canonicalRequest =
      `POST\n/\n${canonicalQuery}\n` +
      `${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`

    const credentialScope = `${dateStamp}/${this.region}/${ARK_SERVICE}/request`
    const stringToSign =
      `HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`

    const { accessKey, secretKey } = await this.getCredentials()
    const kDate = hmacSha256(Buffer.from(secretKey, 'utf8'), dateStamp)
    const kRegion = hmacSha256(kDate, this.region)
    const kService = hmacSha256(kRegion, ARK_SERVICE)
    const kSigning = hmacSha256(kService, 'request')
    const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

    const response = await this.fetchImpl(`https://${this.host}/?${canonicalQuery}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: this.host,
        'X-Date': amzDate,
        'X-Content-Sha256': payloadHash,
        Authorization: `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body: payload,
      // 防止平台接口挂起拖死调用方（与 ark-bearer/toapis-avatar 同策略）
      signal: AbortSignal.timeout(ARK_API_TIMEOUT_MS),
    })

    const json = (await response.json().catch(() => null)) as ArkOpenApiResponse<T> | null

    if (!response.ok) {
      throw new Error(extractArkErrorMessage(json, `火山素材接口调用失败: ${response.status}`))
    }

    if (json?.ResponseMetadata?.Error?.Message) {
      throw new Error(json.ResponseMetadata.Error.Message)
    }

    return (json?.Result ?? {}) as T
  }
}
