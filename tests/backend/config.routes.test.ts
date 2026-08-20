import request from 'supertest'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../../backend/src/app'
import { ArkAkskClient } from '../../backend/src/lib/ark-aksk'
import {
  ConfigService,
  type ConfigListEntry,
  type ConfigStore,
  type StoredConfigEntry,
} from '../../backend/src/services/config.service'
import type { OssServiceContract } from '../../backend/src/services/oss.service'

class FakeConfigStore implements ConfigStore {
  private entries = new Map<string, StoredConfigEntry>()

  public readonly updates: StoredConfigEntry[][] = []

  public seed(entries: StoredConfigEntry[]) {
    this.entries = new Map(entries.map((entry) => [entry.key, entry]))
  }

  public async getByKey(key: string): Promise<StoredConfigEntry | null> {
    return this.entries.get(key) ?? null
  }

  public async list(): Promise<StoredConfigEntry[]> {
    return [...this.entries.values()].sort((left, right) => left.key.localeCompare(right.key))
  }

  public async upsert(entries: StoredConfigEntry[]): Promise<void> {
    this.updates.push(entries)
    for (const entry of entries) {
      this.entries.set(entry.key, entry)
    }
  }
}

class FakeOssService implements OssServiceContract {
  public async getSignedUrl(ossKey: string): Promise<string> {
    return `https://oss.example.com/${ossKey}?signed=1`
  }

  public async getStsCredentials() {
    return {
      credentials: {
        accessKeyId: 'sts-ak',
        accessKeySecret: 'sts-sk',
        securityToken: 'sts-token',
        expiration: '2026-04-04T12:00:00.000Z',
      },
      bucket: 'narrix-assets',
      region: 'oss-cn-shanghai',
      keyPrefix: 'assets/2026/04/04/',
    }
  }

  public async deleteObject(): Promise<void> {}

  public async putObject(): Promise<void> {}
}

describe('/api/config', () => {
  let store: FakeConfigStore

  beforeEach(() => {
    process.env.JWT_SECRET = 'issue-3-secret'
    process.env.CONFIG_ENCRYPTION_KEY = 'issue-3-config-secret'

    store = new FakeConfigStore()
    store.seed([
      {
        key: 'ark_api_key',
        value: ConfigService.encryptSecretValue('sk-live-12348abc', 'issue-3-config-secret'),
        isSecret: true,
        description: 'Ark API Key',
      },
      {
        key: 'ark_endpoint',
        value: 'https://ark.example.com',
        isSecret: false,
        description: 'Ark endpoint',
      },
      {
        key: 'ark_default_group_id',
        value: 'group-1712300000000-abcd1234',
        isSecret: false,
        description: '默认素材组 ID',
      },
      {
        key: 'ark_access_key',
        value: ConfigService.encryptSecretValue('ak-live-12348abc', 'issue-3-config-secret'),
        isSecret: true,
        description: 'Ark Access Key',
      },
      {
        key: 'ark_secret_key',
        value: ConfigService.encryptSecretValue('sk-live-12348xyz', 'issue-3-config-secret'),
        isSecret: true,
        description: 'Ark Secret Key',
      },
      {
        key: 'oss_server_internal_enabled',
        value: 'false',
        isSecret: false,
        description: '服务端 OSS 是否使用内网 Endpoint',
      },
    ])
  })

  const signToken = (role: 'admin' | 'user') =>
    jwt.sign({ sub: '1', role }, process.env.JWT_SECRET || 'issue-3-secret', { expiresIn: '8h' })

  it('管理员获取配置��� secret 字段返回脱敏值', async () => {
    const app = createApp({
      configStore: store,
    })

    const response = await request(app.callback())
      .get('/api/config')
      .set('Authorization', `Bearer ${signToken('admin')}`)

    expect(response.status).toBe(200)
    expect(response.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining<Partial<ConfigListEntry>>({
          key: 'ark_api_key',
          value: 'sk-****8abc',
          isSecret: true,
        }),
        expect.objectContaining<Partial<ConfigListEntry>>({
          key: 'ark_endpoint',
          value: 'https://ark.example.com',
          isSecret: false,
        }),
      ])
    )
  })

  it('普通用户读取配置返回 403', async () => {
    const app = createApp({
      configStore: store,
    })

    const response = await request(app.callback())
      .get('/api/config')
      .set('Authorization', `Bearer ${signToken('user')}`)

    expect(response.status).toBe(403)
    expect(response.body.code).toBe(403)
  })

  it('未登录也可以读取公开品牌配置，并拿到签名 Logo 地址', async () => {
    const app = createApp({
      configStore: store,
      ossService: new FakeOssService(),
    })

    await store.upsert([
      {
        key: 'system_name',
        value: '调皮狗云创',
        isSecret: false,
        description: '系统名称',
      },
      {
        key: 'system_logo_key',
        value: 'assets/branding/logo.png',
        isSecret: false,
        description: '系统 Logo OSS Key',
      },
    ])

    const response = await request(app.callback()).get('/api/config/branding')

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual({
      systemName: '调皮狗云创',
      logoUrl: 'https://oss.example.com/assets/branding/logo.png?signed=1',
    })
  })

  it('管理员更新配置时 secret 字段会加密写入并清空缓存', async () => {
    const app = createApp({
      configStore: store,
    })

    const service = new ConfigService({
      store,
      encryptionSecret: 'issue-3-config-secret',
      cacheTtlMs: 30_000,
      now: () => 1_000,
    })

    await expect(service.getRequired('ark_endpoint')).resolves.toBe('https://ark.example.com')

    const response = await request(app.callback())
      .put('/api/config')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .send({
        items: [
          { key: 'ark_api_key', value: 'sk-next-9999' },
          { key: 'ark_endpoint', value: 'https://ark-next.example.com' },
        ],
      })

    expect(response.status).toBe(200)
    expect(store.updates).toHaveLength(1)
    expect(store.updates[0][0].value).not.toBe('sk-next-9999')

    await expect(service.getRequired('ark_endpoint')).resolves.toBe('https://ark-next.example.com')
  })

  it('管理员更新无效默认素材组 ID 时返回 422', async () => {
    const app = createApp({
      configStore: store,
    })

    const response = await request(app.callback())
      .put('/api/config')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .send({
        items: [{ key: 'ark_default_group_id', value: 'default' }],
      })

    expect(response.status).toBe(422)
    expect(response.body.code).toBe(422)
    expect(response.body.message).toContain('ark_default_group_id')
    expect(store.updates).toHaveLength(0)
  })

  it('管理员只能使用布尔值切换服务端 OSS 内网模式', async () => {
    const app = createApp({
      configStore: store,
    })

    const validResponse = await request(app.callback())
      .put('/api/config')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .send({
        items: [{ key: 'oss_server_internal_enabled', value: 'true' }],
      })
    const invalidResponse = await request(app.callback())
      .put('/api/config')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .send({
        items: [{ key: 'oss_server_internal_enabled', value: 'internal' }],
      })

    expect(validResponse.status).toBe(200)
    expect(store.updates.at(-1)).toEqual([
      expect.objectContaining({ key: 'oss_server_internal_enabled', value: 'true' }),
    ])
    expect(invalidResponse.status).toBe(422)
    expect(invalidResponse.body.message).toContain('oss_server_internal_enabled')
  })

  it('管理员可在配置页加载火山素材组并创建新素材组', async () => {
    vi.spyOn(ArkAkskClient.prototype, 'listAssetGroups').mockResolvedValueOnce([
      {
        id: 'group-existing',
        name: '既有素材组',
        description: '来自火山',
      },
    ])
    vi.spyOn(ArkAkskClient.prototype, 'createAssetGroup').mockResolvedValueOnce({
      id: 'group-created',
      name: '新建默认组',
      description: '用于项目默认同步',
    })

    const app = createApp({
      configStore: store,
    })

    const listResponse = await request(app.callback())
      .post('/api/config/ark/asset-groups/list')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .send({})
    const createResponse = await request(app.callback())
      .post('/api/config/ark/asset-groups')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .send({
        name: '新建默认组',
        description: '用于项目默认同步',
      })

    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data.items).toEqual([
      {
        id: 'group-existing',
        name: '既有素材组',
        description: '来自火山',
      },
    ])
    expect(createResponse.status).toBe(200)
    expect(createResponse.body.data).toEqual({
      id: 'group-created',
      name: '新建默认组',
      description: '用于项目默认同步',
    })
  })
})
