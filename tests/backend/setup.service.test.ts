import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigService, type StoredConfigEntry } from '../../backend/src/services/config.service'
import { ArkAkskClient } from '../../backend/src/lib/ark-aksk'
import {
  SetupService,
  type SetupPersistence,
  type SetupTransactionContext,
} from '../../backend/src/services/setup.service'

const validArkGroupId = 'group-1712300000000-abcd1234'

interface FakeUserRecord {
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  menuPerms: string[]
  status: number
}

class FakeSetupPersistence implements SetupPersistence {
  public users: FakeUserRecord[] = []
  public configEntries = new Map<string, StoredConfigEntry>()
  public failNextUserCreate = false

  public seedConfig(entries: StoredConfigEntry[]) {
    this.configEntries = new Map(entries.map((entry) => [entry.key, { ...entry }]))
  }

  public async hasActiveAdmin(): Promise<boolean> {
    return this.users.some((user) => user.role === 'admin' && user.status === 1)
  }

  public async findUserByUsername(username: string): Promise<boolean> {
    return this.users.some((user) => user.username === username)
  }

  public async getConfigEntries(keys: string[]): Promise<StoredConfigEntry[]> {
    return keys
      .map((key) => this.configEntries.get(key))
      .filter((entry): entry is StoredConfigEntry => Boolean(entry))
      .map((entry) => ({ ...entry }))
  }

  public async transaction<T>(callback: (context: SetupTransactionContext) => Promise<T>): Promise<T> {
    const draftUsers = this.users.map((user) => ({ ...user, menuPerms: [...user.menuPerms] }))
    const draftConfigEntries = new Map(
      [...this.configEntries.entries()].map(([key, value]) => [key, { ...value }])
    )

    const context: SetupTransactionContext = {
      hasActiveAdmin: async () => draftUsers.some((user) => user.role === 'admin' && user.status === 1),
      findUserByUsername: async (username) => draftUsers.some((user) => user.username === username),
      createUser: async (input) => {
        if (this.failNextUserCreate) {
          this.failNextUserCreate = false
          throw new Error('inject create user failure')
        }

        draftUsers.push({
          username: input.username,
          passwordHash: input.passwordHash,
          role: input.role,
          menuPerms: [...input.menuPerms],
          status: input.status,
        })
      },
      upsertConfigEntries: async (entries) => {
        for (const entry of entries) {
          draftConfigEntries.set(entry.key, { ...entry })
        }
      },
      getConfigEntries: async (keys) =>
        keys
          .map((key) => draftConfigEntries.get(key))
          .filter((entry): entry is StoredConfigEntry => Boolean(entry))
          .map((entry) => ({ ...entry })),
    }

    const result = await callback(context)
    this.users = draftUsers
    this.configEntries = draftConfigEntries
    return result
  }
}

const seedBusinessConfig = (): StoredConfigEntry[] => [
  { key: 'ark_api_key', value: '', isSecret: true, description: '视频生成 Bearer Token' },
  { key: 'ark_access_key', value: '', isSecret: true, description: '素材资产库 Access Key' },
  { key: 'ark_secret_key', value: '', isSecret: true, description: '素材资产库 Secret Key' },
  { key: 'ark_endpoint', value: 'https://ark.cn-beijing.volces.com/api/v3', isSecret: false, description: '视频生成接口地址' },
  { key: 'ark_default_group_id', value: '', isSecret: false, description: '默认素材组 ID' },
  { key: 'ark_default_sync_enabled', value: 'true', isSecret: false, description: '默认同步策略' },
  { key: 'oss_access_key_id', value: '', isSecret: true, description: 'OSS Access Key ID' },
  { key: 'oss_access_key_secret', value: '', isSecret: true, description: 'OSS Access Key Secret' },
  { key: 'oss_sts_role_arn', value: '', isSecret: false, description: 'OSS STS Role ARN' },
  { key: 'oss_bucket', value: '', isSecret: false, description: 'OSS Bucket' },
  { key: 'oss_region', value: '', isSecret: false, description: 'OSS 区域' },
  { key: 'oss_signed_url_ttl', value: '86400', isSecret: false, description: '签名 URL 有效期（秒）' },
]

describe('setup.service', () => {
  let persistence: FakeSetupPersistence
  let service: SetupService
  const originalProfile = process.env.NARRIX_PROFILE
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    persistence = new FakeSetupPersistence()
    persistence.seedConfig(seedBusinessConfig())
    process.env.NARRIX_PROFILE = originalProfile
    process.env.NODE_ENV = originalNodeEnv

    service = new SetupService({
      persistence,
      healthChecks: {
        database: async () => true,
        redis: async () => true,
      },
      encryptionSecret: 'setup-service-secret',
      now: () => new Date('2026-04-04T10:00:00.000Z'),
      environment: 'dev',
      version: '1.0.0',
    })
  })

  it('未显式设置 NARRIX_PROFILE 时，运行态环境默认展示为 dev 而不是 NODE_ENV', async () => {
    process.env.NARRIX_PROFILE = ''
    process.env.NODE_ENV = 'production'

    const defaultEnvService = new SetupService({
      persistence,
      healthChecks: {
        database: async () => true,
        redis: async () => true,
      },
      encryptionSecret: 'setup-service-secret',
      version: '1.0.1',
    })

    await expect(defaultEnvService.getStatus()).resolves.toMatchObject({
      environment: 'dev',
      version: '1.0.1',
    })
  })

  it('未安装时返回安装态状态', async () => {
    await expect(service.getStatus()).resolves.toEqual({
      initialized: false,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: null,
      branding: {
        systemName: 'Narrix',
      },
      health: {
        database: true,
        redis: true,
      },
    })
  })

  it('OSS 联通性校验成功时返回统一结果结构', async () => {
    const validationService = new SetupService({
      persistence,
      validators: {
        oss: async () => undefined,
      },
      healthChecks: {
        database: async () => true,
        redis: async () => true,
      },
    })

    await expect(
      validationService.validateOss({
        accessKeyId: 'oss-ak',
        accessKeySecret: 'oss-sk',
        bucket: 'narrix-assets',
        region: 'oss-cn-shanghai',
        stsRoleArn: 'acs:ram::123:role/narrix',
      })
    ).resolves.toEqual({
      key: 'oss',
      valid: true,
      canContinue: true,
      message: 'OSS 配置校验通过',
    })
  })

  it('OSS 联通性校验遇到浏览器 CORS 缺失时返回可操作提示', async () => {
    const validationService = new SetupService({
      persistence,
      validators: {
        oss: async () => {
          throw Object.assign(new Error('cors blocked'), {
            code: 'OSS_CORS_INVALID',
            frontendOrigin: 'http://localhost:28080',
          })
        },
      },
      healthChecks: {
        database: async () => true,
        redis: async () => true,
      },
    })

    await expect(
      validationService.validateOss({
        accessKeyId: 'oss-ak',
        accessKeySecret: 'oss-sk',
        bucket: 'narrix-assets',
        region: 'oss-cn-shanghai',
        stsRoleArn: 'acs:ram::123:role/narrix',
        frontendOrigin: 'http://localhost:28080',
      })
    ).resolves.toEqual({
      key: 'oss',
      valid: false,
      canContinue: true,
      message:
        'OSS 配置校验失败，Bucket 未放行 http://localhost:28080 的浏览器直传跨域。请在 OSS CORS 中允许 PUT、OPTIONS 和必要请求头后重试',
    })
  })

  it('火山 Bearer 联通性校验失败时返回可继续安装的安全错误提示', async () => {
    const validationService = new SetupService({
      persistence,
      validators: {
        arkBearer: async () => {
          throw new Error('request failed with token sk-ark-secret')
        },
      },
      healthChecks: {
        database: async () => true,
        redis: async () => true,
      },
    })

    await expect(
      validationService.validateArkBearer({
        apiKey: 'sk-ark-secret',
        endpoint: 'https://ark.example.com/api/v3',
      })
    ).resolves.toEqual({
      key: 'arkBearer',
      valid: false,
      canContinue: true,
      message: '火山视频配置校验失败，请检查 Bearer Token 与 Endpoint 是否正确',
    })
  })

  it('火山 AK/SK 联通性校验在已安装后会被拒绝', async () => {
    persistence.users.push({
      username: 'narrix-admin',
      passwordHash: 'hash',
      role: 'admin',
      menuPerms: ['assets', 'videos', 'analytics', 'projects', 'users', 'logs', 'config'],
      status: 1,
    })
    persistence.configEntries.set('system_initialized', {
      key: 'system_initialized',
      value: 'true',
      isSecret: false,
      description: '系统是否已完成初始化',
    })

    await expect(
      service.validateArkAksk({
        accessKey: 'ak-001',
        secretKey: 'sk-001',
      })
    ).rejects.toThrow('系统已完成初始化')
  })

  it('火山 AK/SK 校验遇到未知错误时应返回失败，不能误报成功', async () => {
    vi.spyOn(ArkAkskClient.prototype, 'getAsset').mockRejectedValueOnce(new Error('socket hang up'))

    await expect(
      service.validateArkAksk({
        accessKey: 'fake-ak',
        secretKey: 'fake-sk',
      })
    ).resolves.toEqual({
      key: 'arkAksk',
      valid: false,
      canContinue: true,
      message: '火山素材资产库配置校验失败，请检查 Access Key 与 Secret Key 是否正确',
    })
  })

  it('火山 AK/SK 校验遇到 Id is Invalid 时应视为探针命中，返回成功', async () => {
    vi.spyOn(ArkAkskClient.prototype, 'getAsset').mockRejectedValueOnce(new Error('Id is Invalid'))

    await expect(
      service.validateArkAksk({
        accessKey: 'real-ak',
        secretKey: 'real-sk',
      })
    ).resolves.toEqual({
      key: 'arkAksk',
      valid: true,
      canContinue: true,
      message: '火山素材资产库配置校验通过',
    })
  })

  it('初始化成功后创建管理员并写入安装标记', async () => {
    await service.initialize({
      admin: {
        username: 'narrix-admin',
        password: 'pass12345',
      },
      config: {
        systemName: 'Narrix',
        arkApiKey: 'sk-ark',
        arkAccessKey: 'ak-001',
        arkSecretKey: 'sk-001',
        arkEndpoint: 'https://ark.example.com/api/v3',
        arkDefaultGroupId: validArkGroupId,
        arkDefaultSyncEnabled: true,
        ossAccessKeyId: 'oss-ak',
        ossAccessKeySecret: 'oss-sk',
        ossStsRoleArn: 'acs:ram::123:role/narrix',
        ossBucket: 'narrix-assets',
        ossRegion: 'oss-cn-shanghai',
        ossSignedUrlTtl: 3600,
      },
    })

    expect(persistence.users).toHaveLength(1)
    expect(persistence.users[0]).toMatchObject({
      username: 'narrix-admin',
      role: 'admin',
      status: 1,
      menuPerms: ['assets', 'videos', 'analytics', 'projects', 'users', 'logs', 'config'],
    })

    expect(persistence.configEntries.get('system_initialized')?.value).toBe('true')
    expect(persistence.configEntries.get('system_initialized_at')?.value).toBe('2026-04-04T10:00:00.000Z')
    expect(persistence.configEntries.get('system_version')?.value).toBe('1.0.0')
    expect(persistence.configEntries.get('system_install_mode')?.value).toBe('self_hosted')

    const encryptedArkApiKey = persistence.configEntries.get('ark_api_key')?.value
    expect(encryptedArkApiKey).not.toBe('sk-ark')
    expect(ConfigService.decryptSecretValue(encryptedArkApiKey as string, 'setup-service-secret')).toBe('sk-ark')
  })

  it('初始化事务失败时不会留下脏数据', async () => {
    persistence.failNextUserCreate = true

    await expect(
      service.initialize({
        admin: {
          username: 'narrix-admin',
        password: 'pass12345',
      },
      config: {
        systemName: 'Narrix',
        arkApiKey: 'sk-ark',
        arkAccessKey: 'ak-001',
        arkSecretKey: 'sk-001',
          arkEndpoint: 'https://ark.example.com/api/v3',
          arkDefaultGroupId: validArkGroupId,
          ossAccessKeyId: 'oss-ak',
          ossAccessKeySecret: 'oss-sk',
          ossStsRoleArn: 'acs:ram::123:role/narrix',
          ossBucket: 'narrix-assets',
          ossRegion: 'oss-cn-shanghai',
          ossSignedUrlTtl: 3600,
        },
      })
    ).rejects.toThrow('inject create user failure')

    expect(persistence.users).toHaveLength(0)
    expect(persistence.configEntries.get('system_initialized')).toBeUndefined()
  })

  it('重复初始化会被拒绝', async () => {
    persistence.users.push({
      username: 'narrix-admin',
      passwordHash: 'hash',
      role: 'admin',
      menuPerms: ['assets', 'videos', 'analytics', 'projects', 'users', 'config'],
      status: 1,
    })
    persistence.configEntries.set('system_initialized', {
      key: 'system_initialized',
      value: 'true',
      isSecret: false,
      description: '系统是否已完成初始化',
    })

    await expect(
      service.initialize({
        admin: {
          username: 'narrix-admin',
        password: 'pass12345',
      },
      config: {
        systemName: 'Narrix',
        arkApiKey: 'sk-ark',
        arkAccessKey: 'ak-001',
        arkSecretKey: 'sk-001',
          arkEndpoint: 'https://ark.example.com/api/v3',
          arkDefaultGroupId: validArkGroupId,
          ossAccessKeyId: 'oss-ak',
          ossAccessKeySecret: 'oss-sk',
          ossStsRoleArn: 'acs:ram::123:role/narrix',
          ossBucket: 'narrix-assets',
          ossRegion: 'oss-cn-shanghai',
          ossSignedUrlTtl: 3600,
        },
      })
    ).rejects.toThrow('系统已完成初始化')
  })
})
