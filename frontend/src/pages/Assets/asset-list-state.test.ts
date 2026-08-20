import { describe, expect, it } from 'vitest'

import type { AssetItem } from '../../api/assets'
import { mergeAssetsForRefresh } from './asset-list-state'

const buildAsset = (overrides: Partial<AssetItem> = {}): AssetItem => ({
  id: 1,
  name: '角色海报',
  uploaderName: 'operator',
  projectId: 101,
  assetType: 'Image',
  categoryId: 1,
  groupSyncEnabled: true,
  syncMode: 'inherit',
  effectiveSync: true,
  projectIds: [101],
  projectNames: ['都市逆袭'],
  ossKey: 'assets/poster.png',
  sourceUrl: 'https://signed.example.com/assets/poster.png?token=old',
  thumbnailUrl: 'https://signed.example.com/assets/poster.png?token=old',
  arkGroupId: null,
  arkAssetId: null,
  arkStatus: 'pending',
  arkError: null,
  projects: [{ id: 101, name: '都市逆袭' }],
  tags: ['角色A'],
  createdAt: '2026-04-04T00:00:00.000Z',
  updatedAt: '2026-04-04T00:00:00.000Z',
  ...overrides,
})

describe('mergeAssetsForRefresh', () => {
  it('同一素材轮询返回新签名地址时保留旧预览 URL，但合并最新状态字段', () => {
    const previous = [
      buildAsset(),
    ]
    const incoming = [
      buildAsset({
        arkStatus: 'active',
        arkAssetId: 'ark-asset-1',
        sourceUrl: 'https://signed.example.com/assets/poster.png?token=new',
        thumbnailUrl: 'https://signed.example.com/assets/poster.png?token=new',
        updatedAt: '2026-04-04T00:05:00.000Z',
      }),
    ]

    const merged = mergeAssetsForRefresh(previous, incoming)

    expect(merged[0]).not.toBe(previous[0])
    expect(merged[0].arkStatus).toBe('active')
    expect(merged[0].arkAssetId).toBe('ark-asset-1')
    expect(merged[0].sourceUrl).toBe('https://signed.example.com/assets/poster.png?token=old')
    expect(merged[0].thumbnailUrl).toBe('https://signed.example.com/assets/poster.png?token=old')
  })

  it('同一素材除签名地址外无变化时复用旧对象，避免无意义重渲染', () => {
    const previous = [
      buildAsset(),
    ]
    const incoming = [
      buildAsset({
        sourceUrl: 'https://signed.example.com/assets/poster.png?token=new',
        thumbnailUrl: 'https://signed.example.com/assets/poster.png?token=new',
      }),
    ]

    const merged = mergeAssetsForRefresh(previous, incoming)

    expect(merged[0]).toBe(previous[0])
  })
})
