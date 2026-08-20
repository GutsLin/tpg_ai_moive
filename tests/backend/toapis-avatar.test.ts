import { describe, expect, it, vi } from 'vitest'

import { ArkApiRequestError } from '../../backend/src/lib/ark-bearer'
import { ToApisAvatarClient } from '../../backend/src/lib/toapis-avatar'

const createClient = (fetchImpl: ReturnType<typeof vi.fn>) =>
  new ToApisAvatarClient({
    fetchImpl,
    getApiKey: async () => 'sk-test',
    getEndpoint: async () => 'https://toapis.com/v1',
  })

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('ToApisAvatarClient', () => {
  it('创建素材组调用 private-avatar/groups 并解析 group_id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { group_id: 'pg_01KABC', name: '人物', description: '人物 素材组' },
      })
    )

    const group = await createClient(fetchImpl).createAssetGroup({ name: '人物', description: '人物 素材组' })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://toapis.com/v1/videos/doubao-seedance-2-0/private-avatar/groups',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ name: '人物', description: '人物 素材组' }),
      })
    )
    expect(group.id).toBe('pg_01KABC')
    expect(group.name).toBe('人物')
  })

  it('上传素材使用小写 asset_type 与 source_url，并返回 asset_id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { asset_id: 'pa_01KXYZ', status: 'processing' },
      })
    )

    const assetId = await createClient(fetchImpl).createAsset(
      'pg_01KABC',
      'https://signed.example.com/a.png',
      '主角立绘',
      'Image'
    )

    expect(assetId).toBe('pa_01KXYZ')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://toapis.com/v1/videos/doubao-seedance-2-0/private-avatar/assets',
      expect.objectContaining({
        body: JSON.stringify({
          group_id: 'pg_01KABC',
          asset_type: 'image',
          source_url: 'https://signed.example.com/a.png',
          name: '主角立绘',
        }),
      })
    )
  })

  it('上传素材时组 ID 不符合 pg_ 格式直接抛中文错误，不外呼', async () => {
    const fetchImpl = vi.fn()

    await expect(
      createClient(fetchImpl).createAsset('group-20260514151418-tghtg', 'https://signed.example.com/a.png')
    ).rejects.toThrow(/与 ToAPIs 素材库不匹配/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('查询素材状态映射为 Processing/Active/Failed', async () => {
    const statuses = ['processing', 'active', 'failed']
    const results: string[] = []
    for (const status of statuses) {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse({ success: true, data: { asset_id: 'pa_01KXYZ', status } })
      )
      const info = await createClient(fetchImpl).getAsset('pa_01KXYZ')
      results.push(info.status)
    }

    expect(results).toEqual(['Processing', 'Active', 'Failed'])
  })

  it('查询失败素材时透出平台失败原因', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { asset_id: 'pa_01KXYZ', status: 'failed', reason: 'image quality too low' },
      })
    )

    const info = await createClient(fetchImpl).getAsset('pa_01KXYZ')

    expect(info.status).toBe('Failed')
    expect(info.errorMessage).toBe('image quality too low')
  })

  it('HTTP 错误抛出 ArkApiRequestError 以便统一错误分类', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, message: 'InvalidToken' }, 401)
    )

    const error = await createClient(fetchImpl).createAssetGroup({ name: 'x' }).catch((e) => e)

    expect(error).toBeInstanceOf(ArkApiRequestError)
    expect(error.status).toBe(401)
    expect(error.message).toBe('InvalidToken')
  })

  it('matchesGroupId 仅接受 pg_ 前缀', async () => {
    const client = createClient(vi.fn())

    expect(await client.matchesGroupId('pg_01KABC')).toBe(true)
    expect(await client.matchesGroupId('group-20260514151418-tghtg')).toBe(false)
    expect(await client.matchesGroupId(null)).toBe(false)
  })

  it('getSupportedAssetTypes 返回全类型', async () => {
    const types = await createClient(vi.fn()).getSupportedAssetTypes()

    expect([...types]).toEqual(['Image', 'Video', 'Audio'])
  })
})
