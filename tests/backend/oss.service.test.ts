import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'

import { ConfigService, type ConfigStore, type StoredConfigEntry } from '../../backend/src/services/config.service'
import { OssService } from '../../backend/src/services/oss.service'

const ossConstructorCalls: any[] = []
const ossInstances: Array<{
  signatureUrl: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  putStream: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}> = []

vi.mock('ali-oss', () => ({
  default: vi.fn().mockImplementation(function MockOss(this: any, options) {
    ossConstructorCalls.push(options)
    const instance = {
      signatureUrl: vi.fn().mockReturnValue('https://public.example.com/signed'),
      put: vi.fn().mockResolvedValue({}),
      putStream: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    }
    ossInstances.push(instance)
    Object.assign(this, instance)
  }),
}))

class FakeConfigStore implements ConfigStore {
  private readonly entries: Map<string, StoredConfigEntry>

  public constructor(internalEnabled: boolean) {
    this.entries = new Map<string, StoredConfigEntry>([
      ['oss_region', 'oss-cn-chengdu'],
      ['oss_bucket', 'tiaopigouycloud'],
      ['oss_access_key_id', 'test-ak'],
      ['oss_access_key_secret', 'test-sk'],
      ['oss_signed_url_ttl', '3600'],
      ['oss_server_internal_enabled', String(internalEnabled)],
    ].map(([key, value]) => [
      key,
      {
        key,
        value,
        isSecret: false,
        description: null,
      },
    ]))
  }

  public async getByKey(key: string): Promise<StoredConfigEntry | null> {
    return this.entries.get(key) ?? null
  }

  public async list(): Promise<StoredConfigEntry[]> {
    return [...this.entries.values()]
  }

  public async upsert(entries: StoredConfigEntry[]): Promise<void> {
    for (const entry of entries) {
      this.entries.set(entry.key, entry)
    }
  }
}

const createService = (internalEnabled = false) =>
  new OssService(
    new ConfigService({
      store: new FakeConfigStore(internalEnabled),
      cacheTtlMs: 0,
      now: () => 1,
    })
  )

describe('OssService', () => {
  beforeEach(() => {
    ossConstructorCalls.length = 0
    ossInstances.length = 0
  })

  it('签名 URL 使用公网 OSS client，避免把内网地址发给浏览器', async () => {
    const service = createService(true)

    const url = await service.getSignedUrl('videos/demo.mp4', 600)

    expect(url).toBe('https://public.example.com/signed')
    expect(ossConstructorCalls[0]).toMatchObject({
      region: 'oss-cn-chengdu',
      bucket: 'tiaopigouycloud',
      accessKeyId: 'test-ak',
      accessKeySecret: 'test-sk',
      secure: true,
    })
    expect(ossConstructorCalls[0]).not.toHaveProperty('internal')
    expect(ossInstances[0].signatureUrl).toHaveBeenCalledWith('videos/demo.mp4', {
      expires: 600,
    })
  })

  it('服务端上传使用 OSS 公网 HTTPS client，并加长超时和重试', async () => {
    const service = createService()

    await service.putObject('videos/demo.mp4', Buffer.from('video'), 'video/mp4')

    expect(ossConstructorCalls[0]).toMatchObject({
      region: 'oss-cn-chengdu',
      bucket: 'tiaopigouycloud',
      accessKeyId: 'test-ak',
      accessKeySecret: 'test-sk',
      secure: true,
      timeout: 300_000,
      retryMax: 3,
    })
    expect(ossConstructorCalls[0]).not.toHaveProperty('internal')
    expect(ossInstances[0].put).toHaveBeenCalledWith('videos/demo.mp4', Buffer.from('video'), {
      headers: { 'Content-Type': 'video/mp4' },
    })
  })

  it('开启配置后仅服务端 OSS 操作使用内网 Endpoint', async () => {
    const service = createService(true)

    await service.putObject('videos/demo.mp4', Buffer.from('video'), 'video/mp4')

    expect(ossConstructorCalls[0]).toMatchObject({
      region: 'oss-cn-chengdu',
      bucket: 'tiaopigouycloud',
      secure: true,
      internal: true,
      timeout: 300_000,
      retryMax: 3,
    })
  })

  it('流式上传调用 putStream，并使用更长的服务端传输超时', async () => {
    const service = createService()
    const stream = Readable.from([Buffer.from('video')])

    await service.putObjectStream('videos/streamed.mp4', stream, 'video/mp4')

    expect(ossConstructorCalls[0]).toMatchObject({
      timeout: 20 * 60_000,
      retryMax: 3,
    })
    expect(ossInstances[0].putStream).toHaveBeenCalledWith('videos/streamed.mp4', stream, {
      headers: { 'Content-Type': 'video/mp4' },
    })
  })
})
