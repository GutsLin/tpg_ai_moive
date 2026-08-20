import { afterEach, describe, expect, it, vi } from 'vitest'

import { ArkAkskClient } from '../../backend/src/lib/ark-aksk'

describe('ArkAkskClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('createAsset 会按 HMAC-SHA256 V4 规则构造请求', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          Result: {
            Id: 'asset-123',
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    )

    const client = new ArkAkskClient({
      fetchImpl,
      now: () => new Date('2026-04-04T01:02:03.000Z'),
      getCredentials: async () => ({
        accessKey: 'ak-test',
        secretKey: 'sk-test',
      }),
    })

    const assetId = await client.createAsset('group-1', 'https://signed.example.com/a.png', '角色A', 'Image')

    expect(assetId).toBe('asset-123')
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://open.volcengineapi.com/?Action=CreateAsset&Version=2024-01-01')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Host: 'open.volcengineapi.com',
      'X-Date': '20260404T010203Z',
    })
    expect(String((init?.headers as Record<string, string>).Authorization)).toContain(
      'Credential=ak-test/20260404/cn-beijing/ark/request'
    )
    expect(String((init?.headers as Record<string, string>).Authorization)).toContain('SignedHeaders=content-type;host;x-content-sha256;x-date')
    expect(JSON.parse(String(init?.body))).toEqual({
      GroupId: 'group-1',
      URL: 'https://signed.example.com/a.png',
      Name: '角色A',
      AssetType: 'Image',
    })
  })

  it('getAsset 会解析状态与错误信息', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          Result: {
            Id: 'asset-123',
            Status: 'Failed',
            URL: '',
            Error: {
              Code: 'BadRequest',
              Message: 'invalid image',
            },
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    )

    const client = new ArkAkskClient({
      fetchImpl,
      now: () => new Date('2026-04-04T01:02:03.000Z'),
      getCredentials: async () => ({
        accessKey: 'ak-test',
        secretKey: 'sk-test',
      }),
    })

    await expect(client.getAsset('asset-123')).resolves.toEqual({
      id: 'asset-123',
      status: 'Failed',
      url: '',
      projectName: null,
      errorCode: 'BadRequest',
      errorMessage: 'invalid image',
    })
  })
})
