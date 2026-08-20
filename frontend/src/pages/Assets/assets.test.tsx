import { ConfigProvider } from 'antd'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../../stores/auth'
import { AssetsPage } from '.'

vi.mock('../../api/assets', () => ({
  getAssets: vi.fn(),
  createAsset: vi.fn(),
  deleteAsset: vi.fn(),
  syncAssets: vi.fn(),
  getAssetStsToken: vi.fn(),
  updateAsset: vi.fn(),
  checkAssetNameAvailable: vi.fn(),
}))

vi.mock('../../api/asset-categories', () => ({
  getAssetCategories: vi.fn(),
  createAssetCategory: vi.fn(),
  updateAssetCategory: vi.fn(),
  deleteAssetCategory: vi.fn(),
}))

vi.mock('../../utils/oss-upload', () => ({
  uploadFileToOss: vi.fn(),
}))

let mockUploadedAsset: Record<string, unknown> | null = null

vi.mock('./UploadModal', () => ({
  UploadModal: ({
    open,
    onCancel,
    onUploaded,
  }: {
    open: boolean
    onCancel: () => void
    onUploaded: (asset: Record<string, unknown>) => Promise<void> | void
  }) =>
    open ? (
      <div aria-label="上传素材" role="dialog">
        <button onClick={() => void onUploaded(mockUploadedAsset ?? {})}>完成模拟上传</button>
        <button onClick={onCancel}>关闭上传</button>
      </div>
    ) : null,
}))

const renderAssetsPage = () =>
  render(
    <ConfigProvider>
      <AuthProvider>
        <AssetsPage />
      </AuthProvider>
    </ConfigProvider>
  )

const waitForEnabledButton = async (name: string | RegExp) => {
  await waitFor(() => {
    expect(screen.getByRole('button', { name })).not.toBeDisabled()
  })
}

const setAuthUser = (role: 'admin' | 'user', projectRole: 'manager' | 'member' | 'viewer' = 'manager') => {
  localStorage.setItem('token', `${role}-token`)
  localStorage.setItem(
    'auth-user',
    JSON.stringify({
      id: role === 'admin' ? 1 : 2,
      username: role === 'admin' ? 'admin' : 'operator',
      role,
      menuPerms: ['assets'],
      status: 1,
    })
  )
  localStorage.setItem(
    'auth-projects',
    JSON.stringify([{ id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', projectRole }])
  )
  localStorage.setItem('active-project-id', '101')
  localStorage.setItem('active-project-role', projectRole)
}

const mockImageDimensions = (width: number, height: number) => {
  class MockImage {
    public onload: (() => void) | null = null
    public onerror: (() => void) | null = null
    public width = width
    public height = height
    public naturalWidth = width
    public naturalHeight = height

    public set src(_value: string) {
      queueMicrotask(() => {
        this.onload?.()
      })
    }
  }

  vi.stubGlobal('Image', MockImage)
}

describe('AssetsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    setAuthUser('admin')
    mockUploadedAsset = null
    vi.resetAllMocks()
    mockImageDimensions(640, 480)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-upload'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('管理员可见素材组管理入口', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssets).mockResolvedValue({
      items: [],
      total: 0,
    })
    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 2 }],
    })

    renderAssetsPage()

    expect(await screen.findByRole('button', { name: /素材组管理/ })).toBeInTheDocument()
  })

  it('删除非空素材组时需要先选择迁移目标', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories, deleteAssetCategory } = await import('../../api/asset-categories')

    vi.mocked(getAssets).mockResolvedValue({
      items: [],
      total: 0,
    })
    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [
        { id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 2 },
        { id: 2, name: '场景', sortOrder: 2, syncEnabled: true, assetCount: 0 },
      ],
    })
    vi.mocked(deleteAssetCategory).mockResolvedValue({
      affectedAssets: 2,
      deleted: true,
      targetCategoryId: 2,
    })

    renderAssetsPage()

    await userEvent.click(await screen.findByRole('button', { name: /素材组管理/ }))
    await userEvent.click(await screen.findByRole('button', { name: '删除素材组-1' }))

    expect(await screen.findByText('迁移组内素材')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByLabelText('迁移目标素材组'))
    await userEvent.click(await screen.findByText('场景'))
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }))

    expect(deleteAssetCategory).toHaveBeenCalledWith(1, { targetCategoryId: 2 })
  }, 10_000)

  it('普通用户不可见分类管理入口', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    localStorage.clear()
    setAuthUser('user')

    vi.mocked(getAssets).mockResolvedValue({
      items: [],
      total: 0,
    })
    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 2 }],
    })

    renderAssetsPage()

    await screen.findByRole('heading', { name: '素材管理' })
    expect(screen.queryByRole('button', { name: /素材组管理/ })).not.toBeInTheDocument()
  })

  it('轮询刷新同一图片素材状态时保留当前预览地址', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.useFakeTimers()

    try {
      vi.mocked(getAssetCategories).mockResolvedValue({
        items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 1 }],
      })
      vi.mocked(getAssets)
        .mockResolvedValueOnce({
          items: [
            {
              id: 21,
              name: '角色海报',
              uploaderName: 'operator',
              assetType: 'Image',
              categoryId: 1,
              projectIds: [101],
              projectNames: ['都市逆袭'],
              effectiveSync: true,
              syncMode: 'inherit',
              arkStatus: 'pending',
              arkAssetId: null,
              sourceUrl: 'https://signed.example.com/assets/poster.png?token=old',
              thumbnailUrl: 'https://signed.example.com/assets/poster.png?token=old',
              tags: ['角色A'],
              createdAt: '2026-04-04T00:00:00.000Z',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          ],
          total: 1,
        })
        .mockResolvedValueOnce({
          items: [
            {
              id: 21,
              name: '角色海报',
              uploaderName: 'operator',
              assetType: 'Image',
              categoryId: 1,
              projectIds: [101],
              projectNames: ['都市逆袭'],
              effectiveSync: true,
              syncMode: 'inherit',
              arkStatus: 'active',
              arkAssetId: 'ark-image-21',
              sourceUrl: 'https://signed.example.com/assets/poster.png?token=new',
              thumbnailUrl: 'https://signed.example.com/assets/poster.png?token=new',
              tags: ['角色A'],
              createdAt: '2026-04-04T00:00:00.000Z',
              updatedAt: '2026-04-04T00:05:00.000Z',
            },
          ],
          total: 1,
        })

      renderAssetsPage()

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      const image = screen.getByAltText('角色海报')
      expect(image).toHaveAttribute('src', 'https://signed.example.com/assets/poster.png?token=old')
      expect(screen.getByText('待审核')).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(5_000)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(screen.getByText('已通过')).toBeInTheDocument()
      expect(screen.getByAltText('角色海报')).toHaveAttribute('src', 'https://signed.example.com/assets/poster.png?token=old')
    } finally {
      vi.useRealTimers()
    }
  })

  it('上传完成后素材立即出现在列表，并使用所选素材组的默认同步策略', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 2 }],
    })
    vi.mocked(getAssets)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({
        items: [
          {
            id: 11,
            name: '新素材',
            uploaderName: 'operator',
            assetType: 'Image',
            categoryId: 1,
            projectIds: [101],
            projectNames: ['都市逆袭'],
            effectiveSync: true,
            syncMode: 'inherit',
            arkStatus: 'pending',
            arkAssetId: null,
            thumbnailUrl: 'https://signed.example.com/assets/new.png',
            tags: ['角色A'],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        ],
        total: 1,
      })
    mockUploadedAsset = {
      id: 11,
      name: '新素材',
      uploaderName: 'operator',
      assetType: 'Image',
      categoryId: 1,
      projectIds: [101],
      projectNames: ['都市逆袭'],
      effectiveSync: true,
      syncMode: 'inherit',
      ossKey: 'assets/new.png',
      arkGroupId: null,
      arkAssetId: null,
      arkStatus: 'pending',
      arkError: null,
      tags: ['角色A'],
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    }

    renderAssetsPage()

    await screen.findByText('当前还没有素材')
    await waitForEnabledButton('立即上传')
    await userEvent.click(screen.getByRole('button', { name: '立即上传' }))
    await userEvent.click(await screen.findByRole('button', { name: '完成模拟上传' }))

    expect(await screen.findByText('新素材')).toBeInTheDocument()
    expect(await screen.findByText('待审核')).toBeInTheDocument()
    expect(await screen.findByText('业务分类：角色')).toBeInTheDocument()
    expect(screen.getByText('上传人：operator')).toBeInTheDocument()
    expect(screen.queryByText('未分类')).not.toBeInTheDocument()
  }, 10_000)

  it('从素材组1上传到素材组2后会切换到目标素材组并刷新分类统计', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories)
      .mockResolvedValueOnce({
        items: [
          { id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 1 },
          { id: 2, name: '真人', sortOrder: 2, syncEnabled: false, assetCount: 0 },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          { id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 1 },
          { id: 2, name: '真人', sortOrder: 2, syncEnabled: false, assetCount: 1 },
        ],
      })
    vi.mocked(getAssets)
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            name: '角色素材',
            uploaderName: 'admin',
            assetType: 'Image',
            categoryId: 1,
            projectIds: [101],
            projectNames: ['都市逆袭'],
            effectiveSync: true,
            syncMode: 'inherit',
            arkStatus: 'active',
            arkAssetId: 'asset-1',
            thumbnailUrl: 'https://signed.example.com/assets/role.png',
            tags: ['角色'],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 21,
            name: '真人视频',
            uploaderName: 'operator',
            assetType: 'Video',
            categoryId: 2,
            projectIds: [101],
            projectNames: ['都市逆袭'],
            effectiveSync: false,
            syncMode: 'inherit',
            arkStatus: 'active',
            arkAssetId: null,
            sourceUrl: 'https://signed.example.com/assets/real.mp4',
            thumbnailUrl: 'https://signed.example.com/assets/real.mp4',
            tags: ['真人'],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        ],
        total: 1,
      })
    mockUploadedAsset = {
      id: 21,
      name: '真人视频',
      uploaderName: 'operator',
      assetType: 'Video',
      categoryId: 2,
      projectIds: [101],
      projectNames: ['都市逆袭'],
      effectiveSync: false,
      syncMode: 'inherit',
      ossKey: 'assets/real.mp4',
      arkGroupId: null,
      arkAssetId: null,
      arkStatus: 'active',
      arkError: null,
      tags: ['真人'],
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    }

    renderAssetsPage()

    await screen.findByText('角色素材')
    await waitForEnabledButton(/上传素材/)
    await userEvent.click(screen.getByRole('button', { name: /上传素材/ }))
    await userEvent.click(await screen.findByRole('button', { name: '完成模拟上传' }))

    await waitFor(() => {
      expect(vi.mocked(getAssetCategories)).toHaveBeenCalledTimes(2)
      expect(
        vi.mocked(getAssets).mock.calls.some(([params]) => (params as { categoryId?: number })?.categoryId === 2)
      ).toBe(true)
    })
  }, 15_000)

  it('存在 pending 素材时会轮询并刷新为 active 状态', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 2 }],
    })
    vi.mocked(getAssets)
      .mockResolvedValueOnce({
        items: [
          {
            id: 12,
            name: '待审核素材',
            uploaderName: 'admin',
            assetType: 'Image',
            categoryId: 1,
            projectIds: [101],
            projectNames: ['都市逆袭'],
            effectiveSync: true,
            syncMode: 'inherit',
            arkStatus: 'pending',
            arkAssetId: null,
            thumbnailUrl: 'https://signed.example.com/assets/pending.png',
            tags: [],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 12,
            name: '待审核素材',
            uploaderName: 'admin',
            assetType: 'Image',
            categoryId: 1,
            projectIds: [101],
            projectNames: ['都市逆袭'],
            effectiveSync: true,
            syncMode: 'inherit',
            arkStatus: 'active',
            arkAssetId: 'asset-12',
            thumbnailUrl: 'https://signed.example.com/assets/pending.png',
            tags: [],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:05:00.000Z',
          },
        ],
        total: 1,
      })

    renderAssetsPage()

    expect(await screen.findByText('待审核')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 5_200))
    expect((await screen.findAllByText('已通过')).length).toBeGreaterThan(0)
  }, 10_000)

  it('素材页会提示当前项目隔离，不再提供跨项目总览切换', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 2 }],
    })
    vi.mocked(getAssets).mockResolvedValue({ items: [], total: 0, scope: 'project' })

    renderAssetsPage()

    await screen.findByRole('heading', { name: '素材管理' })
    expect(screen.getByText(/当前列表严格限定在当前项目工作区/)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '跨项目总览' })).not.toBeInTheDocument()
  })

  it('空列表时仍允许在当前项目直接上传', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 2 }],
    })
    vi.mocked(getAssets).mockResolvedValue({ items: [], total: 0, scope: 'project' })

    renderAssetsPage()

    await screen.findByRole('heading', { name: '素材管理' })
    expect(await screen.findByText('当前还没有素材')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即上传' })).toBeInTheDocument()
  })

  it('仅本地素材不显示审核状态标签', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: false, assetCount: 1 }],
    })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 31,
          name: '本地素材',
          uploaderName: 'admin',
          assetType: 'Image',
          categoryId: 1,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: false,
          syncMode: 'disabled',
          groupSyncEnabled: false,
          arkStatus: 'pending',
          arkAssetId: null,
          thumbnailUrl: 'https://signed.example.com/assets/local.png',
          tags: [],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
      scope: 'project',
    })

    renderAssetsPage()

    const assetCard = within((await screen.findByText('本地素材')).closest('.ant-card') as HTMLElement)

    expect(assetCard.getByText('本地素材')).toBeInTheDocument()
    expect(assetCard.queryByText('待审核')).not.toBeInTheDocument()
    expect(assetCard.getByText('未同步火山')).toBeInTheDocument()
    expect(assetCard.getByText('素材同步策略')).toBeInTheDocument()
    expect(assetCard.getByText('仅保留本地')).toBeInTheDocument()
    expect(assetCard.queryByLabelText('素材同步策略-31')).not.toBeInTheDocument()
  })

  it('素材卡片底部不再渲染预览图标入口', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 1 }],
    })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 41,
          name: '角色立绘',
          uploaderName: 'admin',
          assetType: 'Image',
          categoryId: 1,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: true,
          syncMode: 'inherit',
          arkStatus: 'active',
          arkAssetId: 'asset-41',
          thumbnailUrl: 'https://signed.example.com/assets/role.png',
          tags: [],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
    })

    const { container } = renderAssetsPage()

    await screen.findByText('角色立绘')
    expect(container.querySelectorAll('.ant-card-actions li')).toHaveLength(1)
    expect(screen.getByLabelText('删除素材-41')).toBeInTheDocument()
  })

  it('视频素材会直接显示首帧预览播放器', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 2, name: '真人', sortOrder: 2, syncEnabled: false, assetCount: 1 }],
    })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 52,
          name: '真人样片',
          uploaderName: 'operator',
          assetType: 'Video',
          categoryId: 2,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: false,
          syncMode: 'inherit',
          arkStatus: 'active',
          arkAssetId: null,
          sourceUrl: 'https://signed.example.com/assets/real.mp4',
          thumbnailUrl: 'https://signed.example.com/assets/real.mp4',
          tags: ['真人'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
    })

    renderAssetsPage()

    const videoPreview = await screen.findByLabelText('视频预览-52')
    expect(videoPreview).toBeInTheDocument()
    expect(videoPreview).toHaveProperty('controls', true)
  })

  it('音频素材会渲染可播放音频控件', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 3, name: '配乐', sortOrder: 3, syncEnabled: false, assetCount: 1 }],
    })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 53,
          name: '背景音乐',
          uploaderName: 'operator',
          assetType: 'Audio',
          categoryId: 3,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: false,
          syncMode: 'inherit',
          arkStatus: 'active',
          arkAssetId: null,
          sourceUrl: 'https://signed.example.com/assets/bgm.mp3',
          thumbnailUrl: 'https://signed.example.com/assets/bgm-cover.png',
          tags: ['配乐'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
    })

    renderAssetsPage()

    await screen.findByText('背景音乐')
    const audioPlayer = screen.queryByLabelText('音频播放-53')
    expect(audioPlayer).toBeInTheDocument()
    expect(audioPlayer).toHaveProperty('controls', true)
  })

  it('平台管理员在当前项目仅为 member 时不显示删除入口', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    localStorage.clear()
    setAuthUser('admin', 'member')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 1 }],
    })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 61,
          name: '成员素材',
          uploaderName: 'operator',
          assetType: 'Image',
          categoryId: 1,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: true,
          syncMode: 'inherit',
          arkStatus: 'active',
          arkAssetId: 'asset-61',
          thumbnailUrl: 'https://signed.example.com/assets/member.png',
          tags: ['成员'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
    })

    renderAssetsPage()

    await screen.findByText('成员素材')
    expect(screen.queryByLabelText('删除素材-61')).not.toBeInTheDocument()
  })

  it('当前项目角色为 member 时，素材组标签显示自己可见素材数量统计', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    localStorage.clear()
    setAuthUser('admin', 'member')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 12 }],
    })
    vi.mocked(getAssets).mockResolvedValue({ items: [], total: 0 })

    renderAssetsPage()

    await screen.findByRole('heading', { name: '素材管理' })
    expect(screen.getByText('角色 · 可同步 (12)')).toBeInTheDocument()
  })

  it('支持按上传人筛选素材列表', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 2 }],
    })
    vi.mocked(getAssets).mockResolvedValue({ items: [], total: 0 })

    renderAssetsPage()

    await screen.findByRole('heading', { name: '素材管理' })
    await userEvent.type(screen.getByPlaceholderText('按上传人筛选'), 'operator')
    await userEvent.click(screen.getByRole('button', { name: '按上传人筛选' }))

    expect(getAssets).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 24,
      keyword: '',
      uploader: 'operator',
      assetType: undefined,
      status: undefined,
      categoryId: undefined,
    })
  })

  it('素材统计使用后端总数并支持分页切换和筛选重置页码', async () => {
    const { getAssets } = await import('../../api/assets')
    const { getAssetCategories } = await import('../../api/asset-categories')

    vi.mocked(getAssetCategories).mockResolvedValue({
      items: [{ id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 12 }],
    })
    vi.mocked(getAssets)
      .mockResolvedValueOnce({
        items: Array.from({ length: 24 }).map((_, index) => ({
          id: index + 1,
          name: `素材-${index + 1}`,
          uploaderName: 'operator',
          assetType: 'Image',
          categoryId: 1,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: true,
          syncMode: 'inherit',
          arkStatus: 'active',
          arkAssetId: `asset-${index + 1}`,
          thumbnailUrl: `https://signed.example.com/assets/${index + 1}.png`,
          tags: [],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        })),
        total: 64,
      })
      .mockResolvedValue({ items: [], total: 64 })

    renderAssetsPage()

    await screen.findByText('素材-1')
    expect(screen.getByText('64')).toBeInTheDocument()
    expect(screen.getByText('全部素材组 (64)')).toBeInTheDocument()
    expect(screen.getByText('角色 · 可同步 (12)')).toBeInTheDocument()
    expect(vi.mocked(getAssets).mock.calls[0]?.[0]).toMatchObject({ page: 1, pageSize: 24 })

    await userEvent.click(screen.getByTitle('2'))
    await waitFor(() => {
      const latestCall = vi.mocked(getAssets).mock.calls[vi.mocked(getAssets).mock.calls.length - 1]?.[0]
      expect(latestCall).toMatchObject({ page: 2, pageSize: 24 })
    })

    await userEvent.click(screen.getByText('角色 · 可同步 (12)'))
    await waitFor(() => {
      const latestCall = vi.mocked(getAssets).mock.calls[vi.mocked(getAssets).mock.calls.length - 1]?.[0]
      expect(latestCall).toMatchObject({ page: 1, pageSize: 24, categoryId: 1 })
    })
  })
})
