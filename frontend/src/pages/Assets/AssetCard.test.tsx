import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { AssetItem } from '../../api/assets'
import { AssetCard } from './AssetCard'

const buildVideoAsset = (overrides: Partial<AssetItem> = {}): AssetItem => ({
  id: 8,
  name: '片段素材',
  uploaderName: 'operator',
  projectId: 101,
  assetType: 'Video',
  categoryId: 1,
  groupSyncEnabled: true,
  syncMode: 'inherit',
  effectiveSync: false,
  projectIds: [101],
  projectNames: ['都市逆袭'],
  ossKey: 'assets/video/demo.mp4',
  sourceUrl: 'https://signed.example.com/assets/video/demo.mp4?token=old',
  thumbnailUrl: 'https://signed.example.com/assets/video/demo.mp4?token=old',
  arkGroupId: null,
  arkAssetId: null,
  arkStatus: 'pending',
  arkError: null,
  projects: [{ id: 101, name: '都市逆袭' }],
  tags: ['预告'],
  createdAt: '2026-04-04T00:00:00.000Z',
  updatedAt: '2026-04-04T00:00:00.000Z',
  ...overrides,
})

const buildImageAsset = (overrides: Partial<AssetItem> = {}): AssetItem => ({
  id: 9,
  name: '海报素材',
  uploaderName: 'operator',
  projectId: 101,
  assetType: 'Image',
  categoryId: 1,
  groupSyncEnabled: true,
  syncMode: 'inherit',
  effectiveSync: true,
  projectIds: [101],
  projectNames: ['都市逆袭'],
  ossKey: 'assets/image/poster.png',
  sourceUrl: 'https://signed.example.com/assets/image/poster.png?token=old',
  thumbnailUrl: 'https://signed.example.com/assets/image/poster.png?token=old',
  arkGroupId: null,
  arkAssetId: null,
  arkStatus: 'pending',
  arkError: null,
  projects: [{ id: 101, name: '都市逆袭' }],
  tags: ['海报'],
  createdAt: '2026-04-04T00:00:00.000Z',
  updatedAt: '2026-04-04T00:00:00.000Z',
  ...overrides,
})

describe('AssetCard', () => {
  it('同一视频素材仅状态变化时保留当前预览地址，避免轮询后重新加载视频', () => {
    const { rerender } = render(
      <AssetCard
        asset={buildVideoAsset()}
        categories={[{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 1 }]}
        deleting={false}
        onDelete={() => undefined}
      />
    )

    const originalVideo = screen.getByLabelText('视频预览-8')
    expect(originalVideo).toHaveAttribute('src', 'https://signed.example.com/assets/video/demo.mp4?token=old')

    rerender(
      <AssetCard
        asset={buildVideoAsset({
          arkStatus: 'active',
          sourceUrl: 'https://signed.example.com/assets/video/demo.mp4?token=new',
          thumbnailUrl: 'https://signed.example.com/assets/video/demo.mp4?token=new',
          updatedAt: '2026-04-04T00:05:00.000Z',
        })}
        categories={[{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 1 }]}
        deleting={false}
        onDelete={() => undefined}
      />
    )

    const updatedVideo = screen.getByLabelText('视频预览-8')
    expect(updatedVideo).toBe(originalVideo)
    expect(updatedVideo).toHaveAttribute('src', 'https://signed.example.com/assets/video/demo.mp4?token=old')
    expect(updatedVideo).toHaveProperty('controls', true)
  })

  it('同一图片素材仅状态变化时保留当前预览地址，避免轮询后闪烁', () => {
    const { rerender } = render(
      <AssetCard
        asset={buildImageAsset()}
        categories={[{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 1 }]}
        deleting={false}
        onDelete={() => undefined}
      />
    )

    const originalImage = screen.getByAltText('海报素材')
    expect(originalImage).toHaveAttribute('src', 'https://signed.example.com/assets/image/poster.png?token=old')

    rerender(
      <AssetCard
        asset={buildImageAsset({
          arkStatus: 'active',
          sourceUrl: 'https://signed.example.com/assets/image/poster.png?token=new',
          thumbnailUrl: 'https://signed.example.com/assets/image/poster.png?token=new',
          updatedAt: '2026-04-04T00:05:00.000Z',
        })}
        categories={[{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 1 }]}
        deleting={false}
        onDelete={() => undefined}
      />
    )

    const updatedImage = screen.getByAltText('海报素材')
    expect(updatedImage).toBe(originalImage)
    expect(updatedImage).toHaveAttribute('src', 'https://signed.example.com/assets/image/poster.png?token=old')
  })

  it('音频素材渲染为可播放音频控件', () => {
    render(
      <AssetCard
        asset={{
          ...buildVideoAsset(),
          id: 10,
          name: '背景音乐',
          assetType: 'Audio',
          ossKey: 'assets/audio/bgm.mp3',
          sourceUrl: 'https://signed.example.com/assets/audio/bgm.mp3?token=old',
          thumbnailUrl: 'https://signed.example.com/assets/audio/bgm-cover.png?token=old',
        }}
        categories={[{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 1 }]}
        deleting={false}
        onDelete={() => undefined}
      />
    )

    const audioPlayer = screen.getByLabelText('音频播放-10')
    expect(audioPlayer).toHaveProperty('controls', true)
  })
})
