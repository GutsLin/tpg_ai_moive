import OSS from 'ali-oss'
import type { Readable } from 'node:stream'
import * as OpenApi from '@alicloud/openapi-client'
import StsClient from '@alicloud/sts20150401'
import { AssumeRoleRequest } from '@alicloud/sts20150401'

import { ConfigService } from './config.service'
import { AppError } from '../utils/errors'

export interface OssStsCredentials {
  accessKeyId: string
  accessKeySecret: string
  securityToken: string
  expiration: string
}

export interface OssStsResponse {
  credentials: OssStsCredentials
  bucket: string
  region: string
  keyPrefix: string
}

export interface OssServiceContract {
  getSignedUrl(ossKey: string, ttlSeconds?: number): Promise<string>
  getStsCredentials(): Promise<OssStsResponse>
  deleteObject(ossKey: string): Promise<void>
  putObject(ossKey: string, data: Buffer, contentType?: string): Promise<void>
  putObjectStream?(ossKey: string, data: Readable, contentType?: string): Promise<void>
}

const SERVER_OSS_TIMEOUT_MS = 300_000
const SERVER_OSS_STREAM_TIMEOUT_MS = 20 * 60_000
const SERVER_OSS_RETRY_MAX = 3
const SERVER_OSS_INTERNAL_CONFIG_KEY = 'oss_server_internal_enabled'

export class OssService implements OssServiceContract {
  public constructor(private readonly configService: ConfigService = new ConfigService()) {}

  private async createClient(options?: { serverOperation?: boolean; timeoutMs?: number }): Promise<InstanceType<typeof OSS>> {
    const useInternalEndpoint =
      options?.serverOperation === true &&
      (await this.configService.getOptional(SERVER_OSS_INTERNAL_CONFIG_KEY)) === 'true'

    return new (OSS as any)({
      region: await this.configService.getRequired('oss_region'),
      bucket: await this.configService.getRequired('oss_bucket'),
      accessKeyId: await this.configService.getRequired('oss_access_key_id'),
      accessKeySecret: await this.configService.getRequired('oss_access_key_secret'),
      secure: true,
      ...(useInternalEndpoint ? { internal: true } : {}),
      ...(options?.serverOperation
        ? {
            timeout: options.timeoutMs ?? SERVER_OSS_TIMEOUT_MS,
            retryMax: SERVER_OSS_RETRY_MAX,
          }
        : {}),
    })
  }

  public async getSignedUrl(ossKey: string, ttlSeconds?: number): Promise<string> {
    const client = await this.createClient()

    return client.signatureUrl(ossKey, {
      expires: ttlSeconds ?? Number(await this.configService.getRequired('oss_signed_url_ttl')),
    }) as string
  }

  public async deleteObject(ossKey: string): Promise<void> {
    const client = await this.createClient({ serverOperation: true })

    try {
      await client.delete(ossKey)
    } catch (error: any) {
      if (error?.code === 'NoSuchKey' || error?.status === 404) {
        return
      }
      throw error
    }
  }

  public async putObject(ossKey: string, data: Buffer, contentType?: string): Promise<void> {
    const client = await this.createClient({ serverOperation: true })

    await client.put(ossKey, data, contentType ? { headers: { 'Content-Type': contentType } } : undefined)
  }

  public async putObjectStream(ossKey: string, data: Readable, contentType?: string): Promise<void> {
    const client = await this.createClient({ serverOperation: true, timeoutMs: SERVER_OSS_STREAM_TIMEOUT_MS })

    await (client as any).putStream(ossKey, data, contentType ? { headers: { 'Content-Type': contentType } } : undefined)
  }

  public async getStsCredentials(): Promise<OssStsResponse> {
    const accessKeyId = await this.configService.getRequired('oss_access_key_id')
    const accessKeySecret = await this.configService.getRequired('oss_access_key_secret')
    const roleArn = await this.configService.getRequired('oss_sts_role_arn')
    const bucket = await this.configService.getRequired('oss_bucket')
    const region = await this.configService.getRequired('oss_region')

    const client = new (StsClient as any)(
      new (OpenApi as any).Config({
        accessKeyId,
        accessKeySecret,
        endpoint: 'sts.aliyuncs.com',
      })
    )

    const policy = JSON.stringify({
      Version: '1',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['oss:PutObject', 'oss:AbortMultipartUpload', 'oss:InitiateMultipartUpload', 'oss:UploadPart', 'oss:CompleteMultipartUpload'],
          Resource: [`acs:oss:*:*:${bucket}/assets/*`],
        },
      ],
    })

    const response = await client.assumeRole(
      new (AssumeRoleRequest as any)({
        roleArn,
        roleSessionName: `narrix-oss-${Date.now()}`,
        durationSeconds: 900,
        policy,
      })
    )

    const credentials = response.body?.credentials
    if (!credentials) {
      throw new AppError(500, 1002, '获取 OSS STS 凭证失败')
    }

    const now = new Date()
    const datePrefix = [
      now.getFullYear(),
      `${now.getMonth() + 1}`.padStart(2, '0'),
      `${now.getDate()}`.padStart(2, '0'),
    ].join('/')

    return {
      credentials: {
        accessKeyId: credentials.accessKeyId,
        accessKeySecret: credentials.accessKeySecret,
        securityToken: credentials.securityToken,
        expiration: credentials.expiration,
      },
      bucket,
      region,
      keyPrefix: `assets/${datePrefix}/`,
    }
  }
}
