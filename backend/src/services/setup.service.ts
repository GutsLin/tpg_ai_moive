import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import * as OpenApi from '@alicloud/openapi-client'
import StsClient, { AssumeRoleRequest } from '@alicloud/sts20150401'
import OSS from 'ali-oss'
import bcrypt from 'bcryptjs'
import IORedis from 'ioredis'
import { sql, type Kysely, type Transaction } from 'kysely'

import { ArkAkskClient } from '../lib/ark-aksk'
import { db, type Database } from '../db/kysely'
import { toJsonbString } from '../db/json'
import { ConfigService, type StoredConfigEntry } from './config.service'
import { ConflictError, ValidationAppError } from '../utils/errors'

const ADMIN_MENU_PERMS = ['assets', 'videos', 'analytics', 'projects', 'users', 'logs', 'config'] as const
const SETUP_CONFIG_KEYS = [
  'system_name',
  'ark_api_key',
  'ark_access_key',
  'ark_secret_key',
  'ark_endpoint',
  'ark_default_group_id',
  'ark_default_sync_enabled',
  'oss_access_key_id',
  'oss_access_key_secret',
  'oss_sts_role_arn',
  'oss_bucket',
  'oss_region',
  'oss_signed_url_ttl',
] as const
const SYSTEM_STATE_KEYS = [
  'system_initialized',
  'system_initialized_at',
  'system_version',
  'system_install_mode',
] as const

type SetupConfigKey = (typeof SETUP_CONFIG_KEYS)[number]
type SystemStateKey = (typeof SYSTEM_STATE_KEYS)[number]
type ConfigKey = SetupConfigKey | SystemStateKey

const DEFAULT_CONFIG_DESCRIPTIONS: Record<ConfigKey, string> = {
  system_name: '系统显示名称',
  ark_api_key: '视频生成 Bearer Token',
  ark_access_key: '素材资产库 Access Key',
  ark_secret_key: '素材资产库 Secret Key',
  ark_endpoint: '视频生成接口地址',
  ark_default_group_id: '默认素材组 ID',
  ark_default_sync_enabled: '默认同步策略',
  oss_access_key_id: 'OSS Access Key ID',
  oss_access_key_secret: 'OSS Access Key Secret',
  oss_sts_role_arn: 'OSS STS Role ARN',
  oss_bucket: 'OSS Bucket',
  oss_region: 'OSS 区域',
  oss_signed_url_ttl: '签名 URL 有效期（秒）',
  system_initialized: '系统是否已完成初始化',
  system_initialized_at: '系统初始化完成时间',
  system_version: '当前系统版本',
  system_install_mode: '当前部署模式',
}

const SECRET_CONFIG_KEYS = new Set<ConfigKey>([
  'ark_api_key',
  'ark_access_key',
  'ark_secret_key',
  'oss_access_key_id',
  'oss_access_key_secret',
])

export interface SetupStatusResult {
  initialized: boolean
  environment: string
  version: string
  installMode: 'self_hosted'
  initializedAt: string | null
  branding: {
    systemName: string
  }
  health: {
    database: boolean
    redis: boolean
  }
}

export interface SetupInitializePayload {
  admin: {
    username: string
    password: string
  }
  config: {
    systemName: string
    arkApiKey: string
    arkAccessKey: string
    arkSecretKey: string
    arkEndpoint: string
    arkDefaultGroupId: string
    arkDefaultSyncEnabled: boolean
    ossAccessKeyId: string
    ossAccessKeySecret: string
    ossStsRoleArn: string
    ossBucket: string
    ossRegion: string
    ossSignedUrlTtl: number
  }
}

export interface SetupValidateOssPayload {
  accessKeyId: string
  accessKeySecret: string
  bucket: string
  region: string
  stsRoleArn: string
  frontendOrigin?: string
}

export interface SetupValidateArkBearerPayload {
  apiKey: string
  endpoint: string
}

export interface SetupValidateArkAkskPayload {
  accessKey: string
  secretKey: string
}

export interface SetupValidationResult {
  key: 'oss' | 'arkBearer' | 'arkAksk'
  valid: boolean
  canContinue: boolean
  message: string
}

export interface SetupArkAssetGroupItem {
  id: string
  name: string
  description: string | null
}

export interface SetupServiceContract {
  getStatus(): Promise<SetupStatusResult>
  initialize(payload: SetupInitializePayload): Promise<void>
  validateOss(payload: SetupValidateOssPayload): Promise<SetupValidationResult>
  validateArkBearer(payload: SetupValidateArkBearerPayload): Promise<SetupValidationResult>
  validateArkAksk(payload: SetupValidateArkAkskPayload): Promise<SetupValidationResult>
  listArkAssetGroups(payload: SetupValidateArkAkskPayload): Promise<{ items: SetupArkAssetGroupItem[] }>
  createArkAssetGroup(payload: SetupValidateArkAkskPayload & { name: string; description?: string }): Promise<SetupArkAssetGroupItem>
}

export interface SetupTransactionContext {
  hasActiveAdmin(): Promise<boolean>
  findUserByUsername(username: string): Promise<boolean>
  getConfigEntries(keys: string[]): Promise<StoredConfigEntry[]>
  createUser(input: {
    username: string
    passwordHash: string
    role: 'admin' | 'user'
    menuPerms: string[]
    status: number
  }): Promise<void>
  upsertConfigEntries(entries: StoredConfigEntry[]): Promise<void>
}

export interface SetupPersistence {
  hasActiveAdmin(): Promise<boolean>
  findUserByUsername(username: string): Promise<boolean>
  getConfigEntries(keys: string[]): Promise<StoredConfigEntry[]>
  transaction<T>(callback: (context: SetupTransactionContext) => Promise<T>): Promise<T>
}

interface SetupServiceOptions {
  persistence?: SetupPersistence
  healthChecks?: {
    database?: () => Promise<boolean>
    redis?: () => Promise<boolean>
  }
  validators?: {
    oss?: (payload: SetupValidateOssPayload) => Promise<void>
    arkBearer?: (payload: SetupValidateArkBearerPayload) => Promise<void>
    arkAksk?: (payload: SetupValidateArkAkskPayload) => Promise<void>
  }
  encryptionSecret?: string
  now?: () => Date
  environment?: string
  version?: string
}

const getEncryptionSecret = (): string => {
  return process.env.CONFIG_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'dev-config-secret'
}

const createRedisConnection = () => {
  const connection = new IORedis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })

  connection.on('error', () => undefined)

  return connection
}

const createDatabaseHealthCheck = async (): Promise<boolean> => {
  try {
    await sql`select 1`.execute(db)
    return true
  } catch {
    return false
  }
}

const createRedisHealthCheck = async (): Promise<boolean> => {
  const connection = createRedisConnection()

  try {
    await connection.connect()
    return (await connection.ping()) === 'PONG'
  } catch {
    return false
  } finally {
    void connection.quit().catch(() => connection.disconnect())
  }
}

const normalizeEndpoint = (endpoint: string) => endpoint.replace(/\/+$/, '')

const OSS_CORS_VALIDATION_ERROR_CODE = 'OSS_CORS_INVALID'

const createOssCorsValidationError = (frontendOrigin: string) =>
  Object.assign(new Error(`OSS bucket CORS does not allow browser upload from ${frontendOrigin}`), {
    code: OSS_CORS_VALIDATION_ERROR_CODE,
    frontendOrigin,
  })

const isOssCorsValidationError = (error: unknown): error is Error & { code: string; frontendOrigin?: string } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: string }).code === OSS_CORS_VALIDATION_ERROR_CODE

const buildOssBucketOrigin = (bucket: string, region: string) => `https://${bucket}.${region}.aliyuncs.com`

const readPackageVersion = (): string => {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
      version?: unknown
    }

    return typeof packageJson.version === 'string' && packageJson.version.trim()
      ? packageJson.version.trim()
      : '1.0.0'
  } catch {
    return '1.0.0'
  }
}

const normalizeFrontendOrigin = (origin: string | undefined): string | null => {
  if (!origin || origin === 'null') {
    return null
  }

  try {
    return new URL(origin).origin
  } catch {
    return null
  }
}

const validateOssBrowserCors = async (payload: SetupValidateOssPayload): Promise<void> => {
  const frontendOrigin = normalizeFrontendOrigin(payload.frontendOrigin)
  if (!frontendOrigin) {
    return
  }

  const response = await fetch(`${buildOssBucketOrigin(payload.bucket, payload.region)}/__narrix_cors_probe__`, {
    method: 'OPTIONS',
    headers: {
      Origin: frontendOrigin,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'content-type,x-oss-security-token,x-oss-user-agent',
    },
  })

  const allowOrigin = response.headers.get('access-control-allow-origin')
  const allowMethods = response.headers.get('access-control-allow-methods') ?? ''
  const allowHeaders = response.headers.get('access-control-allow-headers') ?? ''

  const originAllowed = allowOrigin === '*' || allowOrigin === frontendOrigin
  const methodAllowed = allowMethods.split(',').map((item) => item.trim().toUpperCase()).includes('PUT')
  const headersAllowed =
    allowHeaders === '*' ||
    ['content-type', 'x-oss-security-token', 'x-oss-user-agent'].every((header) =>
      allowHeaders
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .includes(header)
    )

  if (!response.ok || !originAllowed || !methodAllowed || !headersAllowed) {
    throw createOssCorsValidationError(frontendOrigin)
  }
}

const validateOssConnectivity = async (payload: SetupValidateOssPayload): Promise<void> => {
  const client = new (OSS as any)({
    region: payload.region,
    bucket: payload.bucket,
    accessKeyId: payload.accessKeyId,
    accessKeySecret: payload.accessKeySecret,
  })

  await client.getBucketInfo(payload.bucket)

  const stsClient = new (StsClient as any)(
    new (OpenApi as any).Config({
      accessKeyId: payload.accessKeyId,
      accessKeySecret: payload.accessKeySecret,
      endpoint: 'sts.aliyuncs.com',
    })
  )

  const response = await stsClient.assumeRole(
    new (AssumeRoleRequest as any)({
      roleArn: payload.stsRoleArn,
      roleSessionName: `narrix-setup-validate-${Date.now()}`,
      durationSeconds: 900,
      policy: JSON.stringify({
        Version: '1',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['oss:PutObject'],
            Resource: [`acs:oss:*:*:${payload.bucket}/*`],
          },
        ],
      }),
    })
  )

  if (!response.body?.credentials) {
    throw new Error('OSS STS assumeRole 返回结果为空')
  }

  await validateOssBrowserCors(payload)
}

const validateArkBearerConnectivity = async (payload: SetupValidateArkBearerPayload): Promise<void> => {
  const response = await fetch(`${normalizeEndpoint(payload.endpoint)}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${payload.apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`火山视频接口响应异常: ${response.status}`)
  }
}

const isArkAssetProbeSemanticError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return /(not\s+found|not\s+exist|does not exist|不存在|id\s+is\s+invalid|invalid\s+id|非法)/.test(message)
}

const validateArkAkskConnectivity = async (payload: SetupValidateArkAkskPayload): Promise<void> => {
  const client = new ArkAkskClient({
    getCredentials: async () => ({
      accessKey: payload.accessKey,
      secretKey: payload.secretKey,
    }),
  })

  try {
    await client.getAsset('__narrix_setup_validate__')
  } catch (error) {
    if (isArkAssetProbeSemanticError(error)) {
      return
    }

    throw error
  }
}

const normalizeConfigEntries = (
  currentEntries: Map<string, StoredConfigEntry>,
  inputEntries: Array<{ key: ConfigKey; value: string }>
): StoredConfigEntry[] => {
  return inputEntries.map(({ key, value }) => {
    const currentEntry = currentEntries.get(key)

    return {
      key,
      value,
      isSecret: currentEntry?.isSecret ?? SECRET_CONFIG_KEYS.has(key),
      description: currentEntry?.description ?? DEFAULT_CONFIG_DESCRIPTIONS[key],
    }
  })
}

const isInitialized = (entries: StoredConfigEntry[]): boolean => {
  return entries.some((entry) => entry.key === 'system_initialized' && entry.value === 'true')
}

export class KyselySetupPersistence implements SetupPersistence {
  public constructor(private readonly database: Kysely<Database> = db) {}

  public async hasActiveAdmin(): Promise<boolean> {
    const row = await this.database
      .selectFrom('users')
      .select('id')
      .where('role', '=', 'admin')
      .where('status', '=', 1)
      .executeTakeFirst()

    return Boolean(row)
  }

  public async findUserByUsername(username: string): Promise<boolean> {
    const row = await this.database
      .selectFrom('users')
      .select('id')
      .where('username', '=', username)
      .executeTakeFirst()
    return Boolean(row)
  }

  public async getConfigEntries(keys: string[]): Promise<StoredConfigEntry[]> {
    if (keys.length === 0) {
      return []
    }

    const rows = await this.database
      .selectFrom('system_config')
      .select(['key', 'value', 'is_secret', 'description'])
      .where('key', 'in', keys)
      .execute()

    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      isSecret: row.is_secret,
      description: row.description,
    }))
  }

  public async transaction<T>(callback: (context: SetupTransactionContext) => Promise<T>): Promise<T> {
    return this.database.transaction().execute(async (trx) => callback(this.createContext(trx)))
  }

  private createContext(trx: Transaction<Database>): SetupTransactionContext {
    return {
      hasActiveAdmin: async () => {
        const row = await trx
          .selectFrom('users')
          .select('id')
          .where('role', '=', 'admin')
          .where('status', '=', 1)
          .executeTakeFirst()

        return Boolean(row)
      },
      findUserByUsername: async (username) => {
        const row = await trx.selectFrom('users').select('id').where('username', '=', username).executeTakeFirst()
        return Boolean(row)
      },
      getConfigEntries: async (keys) => {
        if (keys.length === 0) {
          return []
        }

        const rows = await trx
          .selectFrom('system_config')
          .select(['key', 'value', 'is_secret', 'description'])
          .where('key', 'in', keys)
          .execute()

        return rows.map((row) => ({
          key: row.key,
          value: row.value,
          isSecret: row.is_secret,
          description: row.description,
        }))
      },
      createUser: async (input) => {
        await trx
          .insertInto('users')
          .values({
            username: input.username,
            password_hash: input.passwordHash,
            role: input.role,
            menu_perms: toJsonbString(input.menuPerms),
            status: input.status,
          })
          .execute()
      },
      upsertConfigEntries: async (entries) => {
        for (const entry of entries) {
          await trx
            .insertInto('system_config')
            .values({
              key: entry.key,
              value: entry.value,
              is_secret: entry.isSecret,
              description: entry.description,
            })
            .onConflict((oc) =>
              oc.column('key').doUpdateSet({
                value: entry.value,
                is_secret: entry.isSecret,
                description: entry.description,
                updated_at: new Date(),
              })
            )
            .execute()
        }
      },
    }
  }
}

export class SetupService implements SetupServiceContract {
  private readonly persistence: SetupPersistence
  private readonly databaseHealthCheck: () => Promise<boolean>
  private readonly redisHealthCheck: () => Promise<boolean>
  private readonly validateOssConnectivity: (payload: SetupValidateOssPayload) => Promise<void>
  private readonly validateArkBearerConnectivity: (payload: SetupValidateArkBearerPayload) => Promise<void>
  private readonly validateArkAkskConnectivity: (payload: SetupValidateArkAkskPayload) => Promise<void>
  private readonly encryptionSecret: string
  private readonly now: () => Date
  private readonly environment: string
  private readonly version: string

  public constructor(options: SetupServiceOptions = {}) {
    this.persistence = options.persistence ?? new KyselySetupPersistence()
    this.databaseHealthCheck = options.healthChecks?.database ?? createDatabaseHealthCheck
    this.redisHealthCheck = options.healthChecks?.redis ?? createRedisHealthCheck
    this.validateOssConnectivity = options.validators?.oss ?? validateOssConnectivity
    this.validateArkBearerConnectivity = options.validators?.arkBearer ?? validateArkBearerConnectivity
    this.validateArkAkskConnectivity = options.validators?.arkAksk ?? validateArkAkskConnectivity
    this.encryptionSecret = options.encryptionSecret ?? getEncryptionSecret()
    this.now = options.now ?? (() => new Date())
    this.environment = options.environment?.trim() || process.env.NARRIX_PROFILE?.trim() || 'dev'
    this.version = options.version ?? process.env.NARRIX_VERSION ?? readPackageVersion()
  }

  public async getStatus(): Promise<SetupStatusResult> {
    const [databaseHealthy, redisHealthy, stateEntries] = await Promise.all([
      this.databaseHealthCheck(),
      this.redisHealthCheck(),
      this.persistence.getConfigEntries([...SYSTEM_STATE_KEYS, 'system_name']),
    ])
    const stateMap = new Map(stateEntries.map((entry) => [entry.key, entry.value]))

    return {
      initialized: stateMap.get('system_initialized') === 'true',
      environment: this.environment,
      version: this.version,
      installMode: 'self_hosted',
      initializedAt: stateMap.get('system_initialized_at') ?? null,
      branding: {
        systemName: stateMap.get('system_name')?.trim() || 'Narrix',
      },
      health: {
        database: databaseHealthy,
        redis: redisHealthy,
      },
    }
  }

  public async validateOss(payload: SetupValidateOssPayload): Promise<SetupValidationResult> {
    await this.ensureSetupWritable()

    try {
      await this.validateOssConnectivity(payload)
      return {
        key: 'oss',
        valid: true,
        canContinue: true,
        message: 'OSS 配置校验通过',
      }
    } catch (error) {
      if (isOssCorsValidationError(error)) {
        const originLabel = error.frontendOrigin ?? '当前前端域名'

        return {
          key: 'oss',
          valid: false,
          canContinue: true,
          message: `OSS 配置校验失败，Bucket 未放行 ${originLabel} 的浏览器直传跨域。请在 OSS CORS 中允许 PUT、OPTIONS 和必要请求头后重试`,
        }
      }

      return {
        key: 'oss',
        valid: false,
        canContinue: true,
        message: 'OSS 配置校验失败，请检查 Access Key、Bucket、Region 与 STS Role ARN 是否正确',
      }
    }
  }

  public async validateArkBearer(payload: SetupValidateArkBearerPayload): Promise<SetupValidationResult> {
    await this.ensureSetupWritable()

    try {
      await this.validateArkBearerConnectivity(payload)
      return {
        key: 'arkBearer',
        valid: true,
        canContinue: true,
        message: '火山视频配置校验通过',
      }
    } catch {
      return {
        key: 'arkBearer',
        valid: false,
        canContinue: true,
        message: '火山视频配置校验失败，请检查 Bearer Token 与 Endpoint 是否正确',
      }
    }
  }

  public async validateArkAksk(payload: SetupValidateArkAkskPayload): Promise<SetupValidationResult> {
    await this.ensureSetupWritable()

    try {
      await this.validateArkAkskConnectivity(payload)
      return {
        key: 'arkAksk',
        valid: true,
        canContinue: true,
        message: '火山素材资产库配置校验通过',
      }
    } catch {
      return {
        key: 'arkAksk',
        valid: false,
        canContinue: true,
        message: '火山素材资产库配置校验失败，请检查 Access Key 与 Secret Key 是否正确',
      }
    }
  }

  public async listArkAssetGroups(payload: SetupValidateArkAkskPayload): Promise<{ items: SetupArkAssetGroupItem[] }> {
    await this.ensureSetupWritable()
    await this.validateArkAkskConnectivity(payload)

    const client = new ArkAkskClient({
      getCredentials: async () => ({
        accessKey: payload.accessKey,
        secretKey: payload.secretKey,
      }),
    })

    const items = await client.listAssetGroups()
    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
      })),
    }
  }

  public async createArkAssetGroup(
    payload: SetupValidateArkAkskPayload & { name: string; description?: string }
  ): Promise<SetupArkAssetGroupItem> {
    await this.ensureSetupWritable()
    await this.validateArkAkskConnectivity(payload)

    const client = new ArkAkskClient({
      getCredentials: async () => ({
        accessKey: payload.accessKey,
        secretKey: payload.secretKey,
      }),
    })

    const created = await client.createAssetGroup({
      name: payload.name,
      description: payload.description,
    })

    return {
      id: created.id,
      name: created.name,
      description: created.description,
    }
  }

  public async initialize(payload: SetupInitializePayload): Promise<void> {
    await this.ensureSetupWritable()

    if (await this.persistence.findUserByUsername(payload.admin.username)) {
      throw new ValidationAppError('用户名已存在')
    }

    const passwordHash = await bcrypt.hash(payload.admin.password, 12)
    const now = this.now().toISOString()

    await this.persistence.transaction(async (context) => {
      const stateEntries = await context.getConfigEntries([...SYSTEM_STATE_KEYS])
      if (isInitialized(stateEntries) || (await context.hasActiveAdmin())) {
        throw new ConflictError('系统已完成初始化')
      }

      if (await context.findUserByUsername(payload.admin.username)) {
        throw new ValidationAppError('用户名已存在')
      }

      await context.createUser({
        username: payload.admin.username,
        passwordHash,
        role: 'admin',
        menuPerms: [...ADMIN_MENU_PERMS],
        status: 1,
      })

      const currentConfigEntries = await context.getConfigEntries([...SETUP_CONFIG_KEYS, ...SYSTEM_STATE_KEYS])
      const currentConfigMap = new Map(currentConfigEntries.map((entry) => [entry.key, entry]))
      const encryptedEntries = normalizeConfigEntries(currentConfigMap, [
        { key: 'system_name', value: payload.config.systemName.trim() || 'Narrix' },
        { key: 'ark_api_key', value: ConfigService.encryptSecretValue(payload.config.arkApiKey, this.encryptionSecret) },
        { key: 'ark_access_key', value: ConfigService.encryptSecretValue(payload.config.arkAccessKey, this.encryptionSecret) },
        { key: 'ark_secret_key', value: ConfigService.encryptSecretValue(payload.config.arkSecretKey, this.encryptionSecret) },
        { key: 'ark_endpoint', value: payload.config.arkEndpoint },
        { key: 'ark_default_group_id', value: payload.config.arkDefaultGroupId },
        { key: 'ark_default_sync_enabled', value: String(payload.config.arkDefaultSyncEnabled) },
        { key: 'oss_access_key_id', value: ConfigService.encryptSecretValue(payload.config.ossAccessKeyId, this.encryptionSecret) },
        { key: 'oss_access_key_secret', value: ConfigService.encryptSecretValue(payload.config.ossAccessKeySecret, this.encryptionSecret) },
        { key: 'oss_sts_role_arn', value: payload.config.ossStsRoleArn },
        { key: 'oss_bucket', value: payload.config.ossBucket },
        { key: 'oss_region', value: payload.config.ossRegion },
        { key: 'oss_signed_url_ttl', value: String(payload.config.ossSignedUrlTtl) },
        { key: 'system_initialized', value: 'true' },
        { key: 'system_initialized_at', value: now },
        { key: 'system_version', value: this.version },
        { key: 'system_install_mode', value: 'self_hosted' },
      ])

      await context.upsertConfigEntries(encryptedEntries)
    })
  }

  private async ensureSetupWritable(): Promise<void> {
    const stateEntries = await this.persistence.getConfigEntries([...SYSTEM_STATE_KEYS])
    if (isInitialized(stateEntries) || (await this.persistence.hasActiveAdmin())) {
      throw new ConflictError('系统已完成初始化')
    }
  }
}
