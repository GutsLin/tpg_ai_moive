import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ConfigNotFoundError,
  ConfigService,
  type ConfigStore,
  type StoredConfigEntry,
} from '../../backend/src/services/config.service'

class FakeConfigStore implements ConfigStore {
  private readonly entries = new Map<string, StoredConfigEntry>()

  public readonly getByKey = vi.fn(async (key: string) => this.entries.get(key) ?? null)
  public readonly list = vi.fn(async () => [...this.entries.values()])
  public readonly upsert = vi.fn(async (entries: StoredConfigEntry[]) => {
    for (const entry of entries) {
      this.entries.set(entry.key, entry)
    }
  })

  public seed(entry: StoredConfigEntry): void {
    this.entries.set(entry.key, entry)
  }
}

describe('ConfigService', () => {
  beforeEach(() => {
    const service = new ConfigService({
      store: new FakeConfigStore(),
      cacheTtlMs: 30_000,
      now: () => 0,
      encryptionSecret: 'unit-test-secret',
    })
    service.clearConfigCache()
  })

  it('在缓存有效期内重复读取同一个 key 时只访问一次存储层', async () => {
    const store = new FakeConfigStore()
    store.seed({
      key: 'ark_endpoint',
      value: 'https://ark.example.com',
      isSecret: false,
      description: 'Ark endpoint',
    })

    const service = new ConfigService({
      store,
      cacheTtlMs: 30_000,
      now: () => 1_000,
      encryptionSecret: 'unit-test-secret',
    })

    await expect(service.getRequired('ark_endpoint')).resolves.toBe('https://ark.example.com')
    await expect(service.getRequired('ark_endpoint')).resolves.toBe('https://ark.example.com')

    expect(store.getByKey).toHaveBeenCalledTimes(1)
  })

  it('缓存过期后会重新读取存储层中的最新值', async () => {
    const store = new FakeConfigStore()
    let currentValue = 'https://ark-v1.example.com'

    store.getByKey.mockImplementation(async (key: string) => {
      if (key !== 'ark_endpoint') {
        return null
      }

      return {
        key,
        value: currentValue,
        isSecret: false,
        description: 'Ark endpoint',
      }
    })

    let now = 1_000
    const service = new ConfigService({
      store,
      cacheTtlMs: 30_000,
      now: () => now,
      encryptionSecret: 'unit-test-secret',
    })

    await expect(service.getRequired('ark_endpoint')).resolves.toBe('https://ark-v1.example.com')

    currentValue = 'https://ark-v2.example.com'
    now = 31_500

    await expect(service.getRequired('ark_endpoint')).resolves.toBe('https://ark-v2.example.com')

    expect(store.getByKey).toHaveBeenCalledTimes(2)
  })

  it('读取不存在的 key 时抛出 ConfigNotFoundError', async () => {
    const service = new ConfigService({
      store: new FakeConfigStore(),
      cacheTtlMs: 30_000,
      now: () => 1_000,
      encryptionSecret: 'unit-test-secret',
    })

    await expect(service.getRequired('missing_key')).rejects.toBeInstanceOf(ConfigNotFoundError)
  })

  it('读取 secret 配置时会自动解密后返回原文', async () => {
    const encryptedValue = ConfigService.encryptSecretValue('ark-secret-value', 'unit-test-secret')
    const store = new FakeConfigStore()
    store.seed({
      key: 'ark_api_key',
      value: encryptedValue,
      isSecret: true,
      description: 'Ark API key',
    })

    const service = new ConfigService({
      store,
      cacheTtlMs: 30_000,
      now: () => 1_000,
      encryptionSecret: 'unit-test-secret',
    })

    await expect(service.getRequired('ark_api_key')).resolves.toBe('ark-secret-value')
  })
})
