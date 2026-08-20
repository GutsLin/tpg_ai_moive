import { ConfigProvider } from 'antd'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssetItem } from '../../api/assets'
import { getActiveVideoProvider } from '../../api/video-provider'
import { AuthProvider } from '../../stores/auth'
import { VideosPage } from '.'

vi.mock('../../api/videos', () => ({
  getVideoTasks: vi.fn(),
  getVideoTask: vi.fn(),
  createVideoTask: vi.fn(),
  syncVideoTask: vi.fn(),
}))

vi.mock('../../api/video-provider', () => ({
  getActiveVideoProvider: vi.fn(),
}))

vi.mock('../../api/assets', () => ({
  getAssets: vi.fn(),
  getAssetDetail: vi.fn(),
}))

vi.mock('../../api/asset-categories', () => ({
  getAssetCategories: vi.fn(),
}))

const renderVideosPage = () =>
  render(
    <ConfigProvider>
      <MemoryRouter>
        <AuthProvider>
          <VideosPage />
        </AuthProvider>
      </MemoryRouter>
    </ConfigProvider>
  )

const setAuthUser = () => {
  localStorage.setItem('token', 'video-token')
  localStorage.setItem(
    'auth-user',
    JSON.stringify({
      id: 1,
      username: 'video-admin',
      role: 'admin',
      menuPerms: ['assets', 'videos', 'users', 'logs', 'config'],
      status: 1,
    })
  )
  localStorage.setItem(
    'auth-projects',
    JSON.stringify([{ id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', projectRole: 'manager' }])
  )
  localStorage.setItem('active-project-id', '101')
}

describe('VideosPage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setAuthUser()
    vi.resetAllMocks()
    vi.mocked(getActiveVideoProvider).mockResolvedValue({
      providerKey: 'toapis',
      name: 'ToAPIs',
      providerType: 'toapis',
      capabilities: {
        version: 1,
        models: [
          {
            id: 'doubao-seedance-2-0-260128',
            label: 'Seedance 2.0',
            duration: { min: 4, max: 15, auto: true },
            resolutions: ['480p', '720p'],
            aspectRatios: ['16:9', '9:16', '1:1'],
            operations: ['generate'],
            supports: {
              firstLastFrame: true,
              referenceImage: true,
              referenceVideo: true,
              referenceAudio: true,
              generateAudio: true,
            },
          },
          {
            id: 'doubao-seedance-2-0-fast-260128',
            label: 'Seedance 2.0 fast',
            duration: { min: 4, max: 15, auto: true },
            resolutions: ['480p', '720p'],
            aspectRatios: ['16:9', '9:16', '1:1'],
            operations: ['generate'],
            supports: {
              firstLastFrame: true,
              referenceImage: true,
              referenceVideo: true,
              referenceAudio: true,
              generateAudio: true,
            },
          },
        ],
      },
    })
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('只有 videos 权限的用户可见视频生成页标题', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })

    renderVideosPage()

    expect(await screen.findByRole('heading', { name: '视频生成' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生成日志' })).toBeInTheDocument()
  })

  it('切换到全能参考模式后显示 Prompt 输入和参考素材入口', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('radio', { name: '全能参考模式' }))

    expect(await screen.findByLabelText('创意提示词')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加参考素材' })).toBeInTheDocument()
  })

  it('全能参考模式选中素材后展示参考素材预览卡片流', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '已同步角色图',
          assetType: 'Image',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: true,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: 'asset-1',
          sourceUrl: 'https://signed.example.com/assets/1-origin.png',
          thumbnailUrl: 'https://signed.example.com/assets/1.png',
          tags: ['角色A'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        {
          id: 2,
          name: '未同步配乐',
          assetType: 'Audio',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: false,
          syncMode: 'disabled',
          groupSyncEnabled: true,
          arkStatus: 'pending',
          arkAssetId: null,
          sourceUrl: 'https://signed.example.com/assets/2.mp3',
          thumbnailUrl: 'https://signed.example.com/assets/2-cover.png',
          tags: ['配乐'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 2,
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('radio', { name: '全能参考模式' }))
    await userEvent.click(screen.getByRole('button', { name: '添加参考素材' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 已同步角色图' }))
    await userEvent.click(screen.getByRole('button', { name: '添加参考素材' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 未同步配乐' }))

    expect(await screen.findByText('已选参考素材')).toBeInTheDocument()
    expect(screen.getByAltText('已同步角色图 预览')).toBeInTheDocument()
    expect(screen.getByLabelText('已选参考音频播放-2')).toHaveProperty('controls', true)
    expect(screen.getAllByText('已同步角色图').length).toBeGreaterThan(0)
    expect(screen.getAllByText('未同步配乐').length).toBeGreaterThan(0)
  })

  it('全能参考模式素材选择窗口会为视频和音频渲染播放器', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 11,
          name: '参考视频',
          assetType: 'Video',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: false,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: null,
          sourceUrl: 'https://signed.example.com/assets/reference.mp4',
          thumbnailUrl: 'https://signed.example.com/assets/reference.mp4',
          tags: ['视频'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        {
          id: 12,
          name: '参考音频',
          assetType: 'Audio',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: false,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: null,
          sourceUrl: 'https://signed.example.com/assets/reference.mp3',
          thumbnailUrl: 'https://signed.example.com/assets/reference-cover.png',
          tags: ['音频'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 2,
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('radio', { name: '全能参考模式' }))
    await userEvent.click(screen.getByRole('button', { name: '添加参考素材' }))

    const modalVideo = await screen.findByLabelText('素材选择视频预览-11')
    const modalAudio = await screen.findByLabelText('素材选择音频播放-12')
    expect(modalVideo).toHaveProperty('controls', true)
    expect(modalAudio).toHaveProperty('controls', true)
    expect(screen.queryByText('点击试听音频')).not.toBeInTheDocument()
  })

  it('全能参考模式已选参考素材会为视频和音频渲染播放器', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 21,
          name: '过场视频',
          assetType: 'Video',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: false,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: null,
          sourceUrl: 'https://signed.example.com/assets/transitions.mp4',
          thumbnailUrl: 'https://signed.example.com/assets/transitions.mp4',
          tags: ['过场'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        {
          id: 22,
          name: '旁白音频',
          assetType: 'Audio',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: false,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: null,
          sourceUrl: 'https://signed.example.com/assets/narration.mp3',
          thumbnailUrl: 'https://signed.example.com/assets/narration-cover.png',
          tags: ['旁白'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 2,
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('radio', { name: '全能参考模式' }))
    await userEvent.click(screen.getByRole('button', { name: '添加参考素材' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 过场视频' }))
    await userEvent.click(screen.getByRole('button', { name: '添加参考素材' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 旁白音频' }))

    const selectedVideo = await screen.findByLabelText('已选参考视频预览-21')
    const selectedAudio = await screen.findByLabelText('已选参考音频播放-22')
    expect(selectedVideo).toHaveProperty('controls', true)
    expect(selectedAudio).toHaveProperty('controls', true)
    expect(screen.queryByText('点击试听音频')).not.toBeInTheDocument()
    expect(screen.queryByText('当前使用占位卡展示')).not.toBeInTheDocument()
  })

  it('首尾帧模式打开素材选择器时会收敛为仅图片资源', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssets).mockImplementation(async (params) => {
      const items: AssetItem[] = [
        {
          id: 1,
          name: '角色首帧',
          assetType: 'Image',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: true,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: 'asset-image-1',
          sourceUrl: 'https://signed.example.com/assets/1-origin.png',
          thumbnailUrl: 'https://signed.example.com/assets/1.png',
          tags: ['角色A'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        {
          id: 2,
          name: '参考配乐',
          assetType: 'Audio',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: false,
          syncMode: 'disabled',
          groupSyncEnabled: true,
          arkStatus: 'pending',
          arkAssetId: null,
          sourceUrl: 'https://signed.example.com/assets/2.mp3',
          thumbnailUrl: 'https://signed.example.com/assets/2-cover.png',
          tags: ['配乐'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ]

      return {
        items: params?.assetType ? items.filter((item) => item.assetType === params.assetType) : items,
        total: params?.assetType ? items.filter((item) => item.assetType === params.assetType).length : items.length,
      }
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('radio', { name: '全能参考模式' }))
    await userEvent.click(screen.getByRole('button', { name: '添加参考素材' }))
    await userEvent.click(await screen.findByText('音频'))
    await waitFor(() => {
      expect(vi.mocked(getAssets)).toHaveBeenLastCalledWith(expect.objectContaining({ assetType: 'Audio' }))
    })
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 参考配乐' }))

    await userEvent.click(screen.getByRole('radio', { name: '首尾帧模式' }))
    await userEvent.click(screen.getByRole('button', { name: '选择首帧' }))

    await waitFor(() => {
      expect(vi.mocked(getAssets)).toHaveBeenLastCalledWith(expect.objectContaining({ assetType: 'Image' }))
    })
    expect(screen.queryByText('全部类型')).not.toBeInTheDocument()
    expect(screen.queryByText('音频', { exact: true })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '使用素材 角色首帧' })).toBeInTheDocument()
  })

  it('提交生成后任务立即出现在历史列表，状态为生成中', async () => {
    const { getVideoTasks, createVideoTask } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({
        items: [
          {
            id: 11,
            userId: 1,
            projectId: 101,
            status: 'pending',
            model: 'doubao-seedance-2-0-260128',
            prompt: '生成主角开场镜头',
            promptRaw: '生成主角开场镜头',
            duration: 5,
            ratio: '16:9',
            resolution: '720p',
            generateAudio: true,
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
            errorMessage: null,
            videoUrl: null,
            elapsedSeconds: 12,
            estimatedTotalSeconds: 110,
            estimateSampleSize: 3,
          },
        ],
        total: 1,
      })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '角色A首帧',
          assetType: 'Image',
          categoryId: 1,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          arkStatus: 'active',
          arkAssetId: 'asset-1',
          thumbnailUrl: 'https://signed.example.com/assets/1.png',
          tags: ['角色A'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
    })
    vi.mocked(createVideoTask).mockResolvedValue({
      id: 11,
      userId: 1,
      projectId: 101,
      status: 'pending',
      model: 'doubao-seedance-2-0-260128',
      prompt: '生成主角开场镜头',
      promptRaw: '生成主角开场镜头',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
      errorMessage: null,
      videoUrl: null,
      elapsedSeconds: 12,
      estimatedTotalSeconds: 110,
      estimateSampleSize: 3,
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('button', { name: '选择首帧' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 角色A首帧' }))
    const firstFramePreview = await screen.findByAltText('首帧预览')
    expect(firstFramePreview).toBeInTheDocument()
    expect(firstFramePreview.getAttribute('style') ?? '').toContain('object-fit: contain')
    expect(screen.queryByText('已选画面预览')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('首尾帧提示词'), { target: { value: '生成主角开场镜头' } })
    await userEvent.click(screen.getByRole('button', { name: '开始生成' }))
    await userEvent.click(await screen.findByRole('button', { name: '确认提交' }))

    await waitFor(() => {
      expect(vi.mocked(createVideoTask)).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByLabelText('完整提示词')).toHaveTextContent('生成主角开场镜头')
    expect(screen.getAllByText('排队中').length).toBeGreaterThan(0)
  })

  it('首尾帧预览直接显示在各自选择卡片内，不再额外渲染右侧预览面板', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '背景',
          assetType: 'Image',
          categoryId: 1,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          arkStatus: 'active',
          arkAssetId: 'asset-1',
          thumbnailUrl: 'https://signed.example.com/assets/1.png',
          tags: ['背景'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        {
          id: 2,
          name: '真人4',
          assetType: 'Image',
          categoryId: 1,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          arkStatus: 'active',
          arkAssetId: 'asset-2',
          thumbnailUrl: 'https://signed.example.com/assets/2.png',
          tags: ['人物'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 2,
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('button', { name: '选择首帧' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 背景' }))
    await userEvent.click(screen.getByRole('button', { name: '选择尾帧' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 真人4' }))

    expect(await screen.findByAltText('首帧预览')).toBeInTheDocument()
    expect(await screen.findByAltText('尾帧预览')).toBeInTheDocument()
    expect(screen.queryByText('已选画面预览')).not.toBeInTheDocument()
  })

  it('点击开始生成后先展示确认弹窗，返回编辑不会提交任务', async () => {
    const { getVideoTasks, createVideoTask } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '角色A首帧',
          assetType: 'Image',
          categoryId: 1,
          arkStatus: 'active',
          arkAssetId: 'asset-1',
          thumbnailUrl: 'https://signed.example.com/assets/1.png',
          tags: ['角色A'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
    })
    vi.mocked(createVideoTask).mockResolvedValue({
      id: 51,
      userId: 1,
      projectId: 101,
      status: 'pending',
      model: 'doubao-seedance-2-0-260128',
      prompt: '取消确认后继续编辑',
      promptRaw: '取消确认后继续编辑',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
      errorMessage: null,
      videoUrl: null,
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('button', { name: '选择首帧' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 角色A首帧' }))
    await userEvent.type(screen.getByLabelText('首尾帧提示词'), '取消确认后继续编辑')
    await userEvent.click(screen.getByRole('button', { name: '开始生成' }))

    expect(await screen.findByText(/请在提交前再次确认关键参数/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回编辑' }))

    await waitFor(() => {
      expect(vi.mocked(createVideoTask)).not.toHaveBeenCalled()
    })
    expect(screen.getByLabelText('首尾帧提示词')).toHaveValue('取消确认后继续编辑')
  })

  it('提交生成失败时展示错误提示并保留用户输入', async () => {
    const { getVideoTasks, createVideoTask } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '角色A首帧',
          assetType: 'Image',
          categoryId: 1,
          arkStatus: 'active',
          arkAssetId: 'asset-1',
          thumbnailUrl: 'https://signed.example.com/assets/1.png',
          tags: ['角色A'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
    })
    vi.mocked(createVideoTask).mockRejectedValue({
      response: {
        data: {
          message: '模拟视频创建失败',
        },
      },
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('button', { name: '选择首帧' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 角色A首帧' }))
    await userEvent.type(screen.getByLabelText('首尾帧提示词'), '失败后仍保留输入')
    await userEvent.click(screen.getByRole('button', { name: '开始生成' }))
    await userEvent.click(await screen.findByRole('button', { name: '确认提交' }))

    expect(await screen.findByText('模拟视频创建失败')).toBeInTheDocument()
    expect(screen.getByLabelText('首尾帧提示词')).toHaveValue('失败后仍保留输入')
    expect(screen.queryByRole('heading', { name: '失败后仍保留输入' })).not.toBeInTheDocument()
  })

  it('离开页面后返回时会恢复未提交的视频生成草稿', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '角色设定图',
          assetType: 'Image',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: true,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: 'asset-1',
          sourceUrl: 'https://signed.example.com/assets/1-origin.png',
          thumbnailUrl: 'https://signed.example.com/assets/1.png',
          tags: ['角色A'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
    })

    const firstRender = renderVideosPage()

    await userEvent.click(await screen.findByRole('radio', { name: '全能参考模式' }))
    await userEvent.click(screen.getByRole('button', { name: '添加参考素材' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 角色设定图' }))
    await userEvent.type(screen.getByLabelText('创意提示词'), '@角色设定图 镜头缓慢推近')

    firstRender.unmount()
    renderVideosPage()

    expect(await screen.findByRole('radio', { name: '全能参考模式' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('创意提示词')).toHaveValue('@角色设定图 镜头缓慢推近')
    expect(screen.getAllByText('角色设定图').length).toBeGreaterThan(0)
  })

  it('点击清空草稿后会重置当前项目表单并删除会话草稿', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '角色设定图',
          assetType: 'Image',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: true,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: 'asset-1',
          sourceUrl: 'https://signed.example.com/assets/1-origin.png',
          thumbnailUrl: 'https://signed.example.com/assets/1.png',
          tags: ['角色A'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('radio', { name: '全能参考模式' }))
    await userEvent.click(screen.getByRole('button', { name: '添加参考素材' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 角色设定图' }))
    await userEvent.type(screen.getByLabelText('创意提示词'), '@角色设定图 镜头缓慢推近')

    expect(sessionStorage.getItem('videos:generate-draft:101')).not.toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '清空草稿' }))

    expect(screen.getByRole('radio', { name: '首尾帧模式' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('首尾帧提示词')).toHaveValue('')
    expect(screen.queryByText('已选参考素材')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('videos:generate-draft:101')).toBeNull()
  })

  it('混合同步与未同步素材提交时会分别生成 asset:// 与 OSS 直链', async () => {
    const { getVideoTasks, createVideoTask } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '已同步角色图',
          assetType: 'Image',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: true,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: 'asset-1',
          sourceUrl: 'https://signed.example.com/assets/1-origin.png',
          thumbnailUrl: 'https://signed.example.com/assets/1.png',
          tags: ['角色A'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        {
          id: 2,
          name: '未同步配乐',
          assetType: 'Audio',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: false,
          syncMode: 'disabled',
          groupSyncEnabled: true,
          arkStatus: 'pending',
          arkAssetId: null,
          sourceUrl: 'https://signed.example.com/assets/2.mp3',
          thumbnailUrl: 'https://signed.example.com/assets/2-cover.png',
          tags: ['配乐'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 2,
    })
    vi.mocked(createVideoTask).mockResolvedValue({
      id: 31,
      userId: 1,
      projectId: 101,
      status: 'pending',
      model: 'doubao-seedance-2-0-260128',
      prompt: '已同步角色图 跟随 未同步配乐 的节奏推进镜头',
      promptRaw: '@已同步角色图 跟随 @未同步配乐 的节奏推进镜头',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
      errorMessage: null,
      videoUrl: null,
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('radio', { name: '全能参考模式' }))

    await userEvent.click(screen.getByRole('button', { name: '添加参考素材' }))
    expect(await screen.findByText('火山已同步')).toBeInTheDocument()
    expect(screen.getByText('未同步火山，直接走 OSS')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '使用素材 已同步角色图' }))

    await userEvent.click(screen.getByRole('button', { name: '添加参考素材' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 未同步配乐' }))

    fireEvent.change(screen.getByLabelText('创意提示词'), {
      target: { value: '@已同步角色图 跟随 @未同步配乐 的节奏推进镜头' },
    })
    await userEvent.click(screen.getByRole('button', { name: '开始生成' }))
    await userEvent.click(await screen.findByRole('button', { name: '确认提交' }))

    await waitFor(() => {
      expect(vi.mocked(createVideoTask)).toHaveBeenCalledWith({
        providerKey: 'toapis',
        mode: 'omni',
        model: 'doubao-seedance-2-0-260128',
        operation: 'generate',
        outputFormat: 'mp4',
        prompt: '已同步角色图 跟随 未同步配乐 的节奏推进镜头',
        promptRaw: '@已同步角色图 跟随 @未同步配乐 的节奏推进镜头',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        content: [
          { type: 'text', text: '已同步角色图 跟随 未同步配乐 的节奏推进镜头' },
          {
            type: 'image_url',
            image_url: { url: 'asset://asset-1' },
            assetId: 1,
            role: 'reference_image',
          },
          {
            type: 'audio_url',
            audio_url: { url: 'https://signed.example.com/assets/2.mp3' },
            assetId: 2,
            role: 'reference_audio',
          },
        ],
      })
    })
  })

  it('点击重新生成后会按任务详情回填表单并自动滚动聚焦提示词', async () => {
    const { getVideoTasks, getVideoTask, createVideoTask } = await import('../../api/videos')
    const { getAssetDetail } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({
      items: [
        {
          id: 41,
          userId: 1,
          projectId: 101,
          status: 'succeeded',
          mode: 'omni',
          model: 'doubao-seedance-2-0-fast-260128',
          prompt: '旧提示词',
          promptRaw: '@角色图 跟随 @配乐 推进',
          duration: 8,
          ratio: '9:16',
          resolution: '480p',
          generateAudio: false,
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:05:00.000Z',
          errorMessage: null,
          videoUrl: 'https://signed.example.com/videos/41.mp4',
        },
      ],
      total: 1,
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      id: 41,
      userId: 1,
      projectId: 101,
      status: 'succeeded',
      mode: 'omni',
      model: 'doubao-seedance-2-0-fast-260128',
      prompt: '旧提示词',
      promptRaw: '@角色图 跟随 @配乐 推进',
      duration: 8,
      ratio: '9:16',
      resolution: '480p',
      generateAudio: false,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:05:00.000Z',
      errorMessage: null,
      videoUrl: 'https://signed.example.com/videos/41.mp4',
      replayDraft: {
        mode: 'omni',
        model: 'doubao-seedance-2-0-fast-260128',
        duration: 8,
        ratio: '9:16',
        resolution: '480p',
        generateAudio: false,
        promptRaw: '@角色图 跟随 @配乐 推进',
        assets: [
          { assetId: 301, role: 'reference_image' },
          { assetId: 302, role: 'reference_audio' },
        ],
      },
    })
    vi.mocked(getAssetDetail)
      .mockResolvedValueOnce({
        id: 301,
        name: '角色图',
        assetType: 'Image',
        categoryId: 1,
        projectId: 101,
        projectIds: [101],
        projectNames: ['都市逆袭'],
        effectiveSync: true,
        syncMode: 'inherit',
        groupSyncEnabled: true,
        arkStatus: 'active',
        arkAssetId: 'asset-301',
        sourceUrl: 'https://signed.example.com/assets/301-origin.png',
        thumbnailUrl: 'https://signed.example.com/assets/301.png',
        tags: ['角色'],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 302,
        name: '配乐',
        assetType: 'Audio',
        categoryId: 1,
        projectId: 101,
        projectIds: [101],
        projectNames: ['都市逆袭'],
        effectiveSync: false,
        syncMode: 'disabled',
        groupSyncEnabled: true,
        arkStatus: 'active',
        arkAssetId: null,
        sourceUrl: 'https://signed.example.com/assets/302.mp3',
        thumbnailUrl: 'https://signed.example.com/assets/302-cover.png',
        tags: ['配乐'],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('button', { name: '重新生成任务-41' }))

    await waitFor(() => {
      expect(vi.mocked(getVideoTask)).toHaveBeenCalledWith(41)
      expect(vi.mocked(getAssetDetail)).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByRole('radio', { name: '全能参考模式' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByDisplayValue('@角色图 跟随 @配乐 推进')).toBeInTheDocument()
    expect(screen.getByText('角色图')).toBeInTheDocument()
    expect(screen.getByText('配乐')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '静音' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByLabelText('创意提示词')).toHaveFocus()
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })
    expect(vi.mocked(createVideoTask)).not.toHaveBeenCalled()
  })

  it('重新生成时部分素材失效会保留其余字段并提示用户补选', async () => {
    const { getVideoTasks, getVideoTask } = await import('../../api/videos')
    const { getAssetDetail } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({
      items: [
        {
          id: 42,
          userId: 1,
          projectId: 101,
          status: 'succeeded',
          mode: 'frames',
          model: 'doubao-seedance-2-0-260128',
          prompt: '旧首尾帧提示词',
          promptRaw: '旧首尾帧提示词',
          duration: 5,
          ratio: '16:9',
          resolution: '720p',
          generateAudio: true,
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:05:00.000Z',
          errorMessage: null,
          videoUrl: null,
        },
      ],
      total: 1,
    })
    vi.mocked(getVideoTask).mockResolvedValue({
      id: 42,
      userId: 1,
      projectId: 101,
      status: 'succeeded',
      mode: 'frames',
      model: 'doubao-seedance-2-0-260128',
      prompt: '旧首尾帧提示词',
      promptRaw: '旧首尾帧提示词',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:05:00.000Z',
      errorMessage: null,
      videoUrl: null,
      replayDraft: {
        mode: 'frames',
        model: 'doubao-seedance-2-0-260128',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        promptRaw: '旧首尾帧提示词',
        assets: [
          { assetId: 401, role: 'first_frame' },
          { assetId: 402, role: 'last_frame' },
        ],
      },
    })
    vi.mocked(getAssetDetail)
      .mockResolvedValueOnce({
        id: 401,
        name: '首帧素材',
        assetType: 'Image',
        categoryId: 1,
        projectId: 101,
        projectIds: [101],
        projectNames: ['都市逆袭'],
        effectiveSync: true,
        syncMode: 'inherit',
        groupSyncEnabled: true,
        arkStatus: 'active',
        arkAssetId: 'asset-401',
        sourceUrl: 'https://signed.example.com/assets/401-origin.png',
        thumbnailUrl: 'https://signed.example.com/assets/401.png',
        tags: ['首帧'],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      })
      .mockRejectedValueOnce({
        response: {
          data: {
            message: '素材不存在',
          },
        },
      })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('button', { name: '重新生成任务-42' }))

    expect(await screen.findByText('其中 1 个素材已失效或无权限，请重新补选')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '首尾帧模式' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('首尾帧提示词')).toHaveValue('旧首尾帧提示词')
    expect(screen.getByText('首帧素材')).toBeInTheDocument()
    expect(screen.getByText('可选')).toBeInTheDocument()
  })

  it('不同模式的重新生成草稿不会互相覆盖', async () => {
    const { getVideoTasks, getVideoTask } = await import('../../api/videos')
    const { getAssetDetail } = await import('../../api/assets')

    vi.mocked(getVideoTasks).mockResolvedValue({
      items: [
        {
          id: 51,
          userId: 1,
          projectId: 101,
          status: 'succeeded',
          mode: 'frames',
          model: 'doubao-seedance-2-0-260128',
          prompt: '首尾帧旧提示词',
          promptRaw: '首尾帧旧提示词',
          duration: 5,
          ratio: '16:9',
          resolution: '720p',
          generateAudio: true,
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:05:00.000Z',
          errorMessage: null,
          videoUrl: null,
        },
        {
          id: 52,
          userId: 1,
          projectId: 101,
          status: 'succeeded',
          mode: 'omni',
          model: 'doubao-seedance-2-0-fast-260128',
          prompt: '全能参考旧提示词',
          promptRaw: '@角色图 跟随 @配乐 推进',
          duration: 8,
          ratio: '9:16',
          resolution: '480p',
          generateAudio: false,
          createdAt: '2026-04-04T00:01:00.000Z',
          updatedAt: '2026-04-04T00:06:00.000Z',
          errorMessage: null,
          videoUrl: null,
        },
      ],
      total: 2,
    })
    vi.mocked(getVideoTask)
      .mockResolvedValueOnce({
        id: 51,
        userId: 1,
        projectId: 101,
        status: 'succeeded',
        mode: 'frames',
        model: 'doubao-seedance-2-0-260128',
        prompt: '首尾帧旧提示词',
        promptRaw: '首尾帧旧提示词',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:05:00.000Z',
        errorMessage: null,
        videoUrl: null,
        replayDraft: {
          mode: 'frames',
          model: 'doubao-seedance-2-0-260128',
          duration: 5,
          ratio: '16:9',
          resolution: '720p',
          generateAudio: true,
          promptRaw: '首尾帧旧提示词',
          assets: [
            { assetId: 501, role: 'first_frame' },
            { assetId: 502, role: 'last_frame' },
          ],
        },
      })
      .mockResolvedValueOnce({
        id: 52,
        userId: 1,
        projectId: 101,
        status: 'succeeded',
        mode: 'omni',
        model: 'doubao-seedance-2-0-fast-260128',
        prompt: '全能参考旧提示词',
        promptRaw: '@角色图 跟随 @配乐 推进',
        duration: 8,
        ratio: '9:16',
        resolution: '480p',
        generateAudio: false,
        createdAt: '2026-04-04T00:01:00.000Z',
        updatedAt: '2026-04-04T00:06:00.000Z',
        errorMessage: null,
        videoUrl: null,
        replayDraft: {
          mode: 'omni',
          model: 'doubao-seedance-2-0-fast-260128',
          duration: 8,
          ratio: '9:16',
          resolution: '480p',
          generateAudio: false,
          promptRaw: '@角色图 跟随 @配乐 推进',
          assets: [
            { assetId: 503, role: 'reference_image' },
            { assetId: 504, role: 'reference_audio' },
          ],
        },
      })
    vi.mocked(getAssetDetail)
      .mockResolvedValueOnce({
        id: 501,
        name: '首帧素材A',
        assetType: 'Image',
        categoryId: 1,
        projectId: 101,
        projectIds: [101],
        projectNames: ['都市逆袭'],
        effectiveSync: true,
        syncMode: 'inherit',
        groupSyncEnabled: true,
        arkStatus: 'active',
        arkAssetId: 'asset-501',
        sourceUrl: 'https://signed.example.com/assets/501-origin.png',
        thumbnailUrl: 'https://signed.example.com/assets/501.png',
        tags: ['首帧'],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 502,
        name: '尾帧素材B',
        assetType: 'Image',
        categoryId: 1,
        projectId: 101,
        projectIds: [101],
        projectNames: ['都市逆袭'],
        effectiveSync: true,
        syncMode: 'inherit',
        groupSyncEnabled: true,
        arkStatus: 'active',
        arkAssetId: 'asset-502',
        sourceUrl: 'https://signed.example.com/assets/502-origin.png',
        thumbnailUrl: 'https://signed.example.com/assets/502.png',
        tags: ['尾帧'],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 503,
        name: '角色图C',
        assetType: 'Image',
        categoryId: 1,
        projectId: 101,
        projectIds: [101],
        projectNames: ['都市逆袭'],
        effectiveSync: true,
        syncMode: 'inherit',
        groupSyncEnabled: true,
        arkStatus: 'active',
        arkAssetId: 'asset-503',
        sourceUrl: 'https://signed.example.com/assets/503-origin.png',
        thumbnailUrl: 'https://signed.example.com/assets/503.png',
        tags: ['角色'],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 504,
        name: '配乐D',
        assetType: 'Audio',
        categoryId: 1,
        projectId: 101,
        projectIds: [101],
        projectNames: ['都市逆袭'],
        effectiveSync: false,
        syncMode: 'disabled',
        groupSyncEnabled: true,
        arkStatus: 'active',
        arkAssetId: null,
        sourceUrl: 'https://signed.example.com/assets/504.mp3',
        thumbnailUrl: 'https://signed.example.com/assets/504-cover.png',
        tags: ['配乐'],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('button', { name: '重新生成任务-51' }))
    expect(await screen.findByRole('radio', { name: '首尾帧模式' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('首尾帧提示词')).toHaveValue('首尾帧旧提示词')
    expect(screen.getByText('首帧素材A')).toBeInTheDocument()
    expect(screen.getByText('尾帧素材B')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: '重新生成任务-52' }))
    expect(await screen.findByRole('radio', { name: '全能参考模式' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('创意提示词')).toHaveValue('@角色图 跟随 @配乐 推进')
    expect(screen.getByText('角色图C')).toBeInTheDocument()
    expect(screen.getByText('配乐D')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: '首尾帧模式' }))
    expect(screen.getByLabelText('首尾帧提示词')).toHaveValue('首尾帧旧提示词')
    expect(screen.getByText('首帧素材A')).toBeInTheDocument()
    expect(screen.getByText('尾帧素材B')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: '全能参考模式' }))
    expect(screen.getByLabelText('创意提示词')).toHaveValue('@角色图 跟随 @配乐 推进')
    expect(screen.getByText('角色图C')).toBeInTheDocument()
    expect(screen.getByText('配乐D')).toBeInTheDocument()
  })

  it('首尾帧模式提交成功后会同时清空提示词与首尾帧素材', async () => {
    const { getVideoTasks, createVideoTask } = await import('../../api/videos')
    const { getAssets } = await import('../../api/assets')

    vi.mocked(getVideoTasks)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
    vi.mocked(getAssets).mockResolvedValue({
      items: [
        {
          id: 601,
          name: '首帧角色',
          assetType: 'Image',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: true,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: 'asset-601',
          sourceUrl: 'https://signed.example.com/assets/601-origin.png',
          thumbnailUrl: 'https://signed.example.com/assets/601.png',
          tags: ['首帧'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        {
          id: 602,
          name: '尾帧角色',
          assetType: 'Image',
          categoryId: 1,
          projectId: 101,
          projectIds: [101],
          projectNames: ['都市逆袭'],
          effectiveSync: true,
          syncMode: 'inherit',
          groupSyncEnabled: true,
          arkStatus: 'active',
          arkAssetId: 'asset-602',
          sourceUrl: 'https://signed.example.com/assets/602-origin.png',
          thumbnailUrl: 'https://signed.example.com/assets/602.png',
          tags: ['尾帧'],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 2,
    })
    vi.mocked(createVideoTask).mockResolvedValue({
      id: 61,
      userId: 1,
      projectId: 101,
      status: 'pending',
      model: 'doubao-seedance-2-0-260128',
      prompt: '新的首尾帧任务',
      promptRaw: '新的首尾帧任务',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
      errorMessage: null,
      videoUrl: null,
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('button', { name: '选择首帧' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 首帧角色' }))
    await userEvent.click(screen.getByRole('button', { name: '选择尾帧' }))
    await userEvent.click(await screen.findByRole('button', { name: '使用素材 尾帧角色' }))
    await userEvent.type(screen.getByLabelText('首尾帧提示词'), '新的首尾帧任务')
    await userEvent.click(screen.getByRole('button', { name: '开始生成' }))
    await userEvent.click(await screen.findByRole('button', { name: '确认提交' }))

    await waitFor(() => {
      expect(vi.mocked(createVideoTask)).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByLabelText('首尾帧提示词')).toHaveValue('')
    expect(screen.getByText('尚未选择')).toBeInTheDocument()
    expect(screen.getByText('可选')).toBeInTheDocument()
    expect(screen.queryByAltText('首帧预览')).not.toBeInTheDocument()
    expect(screen.queryByAltText('尾帧预览')).not.toBeInTheDocument()
  })

  it('存在 pending 任务时会轮询并在完成后显示视频播放器', async () => {
    const { getVideoTasks } = await import('../../api/videos')

    vi.mocked(getVideoTasks)
      .mockResolvedValueOnce({
        items: [
          {
            id: 22,
            userId: 1,
            projectId: 101,
            status: 'pending',
            model: 'doubao-seedance-2-0-260128',
            prompt: '等待完成的视频',
            promptRaw: '等待完成的视频',
            duration: 5,
            ratio: '16:9',
            resolution: '720p',
            generateAudio: true,
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
            errorMessage: null,
            videoUrl: null,
            elapsedSeconds: 15,
            estimatedTotalSeconds: 110,
            estimateSampleSize: 3,
          },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 22,
            userId: 1,
            projectId: 101,
            status: 'succeeded',
            model: 'doubao-seedance-2-0-260128',
            prompt: '等待完成的视频',
            promptRaw: '等待完成的视频',
            duration: 5,
            ratio: '16:9',
            resolution: '720p',
            generateAudio: true,
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:05:00.000Z',
            errorMessage: null,
            videoUrl: 'https://signed.example.com/videos/22.mp4',
          },
        ],
        total: 1,
      })

    renderVideosPage()

    expect((await screen.findAllByText('排队中')).length).toBeGreaterThan(0)
    await new Promise((resolve) => setTimeout(resolve, 5_200))
    expect((await screen.findAllByText('已完成')).length).toBeGreaterThan(0)
    const videoPlayer = await screen.findByLabelText('视频播放-等待完成的视频')
    expect(videoPlayer).toBeInTheDocument()
    expect(videoPlayer.getAttribute('style') ?? '').toContain('object-fit: contain')
  }, 10_000)

  it('列表里有进行中任务时，轮询刷新不会重载已完成任务的视频地址', async () => {
    const { getVideoTasks } = await import('../../api/videos')

    vi.useFakeTimers()

    try {
      vi.mocked(getVideoTasks)
        .mockResolvedValueOnce({
          items: [
            {
              id: 30,
              userId: 1,
              projectId: 101,
              status: 'succeeded',
              model: 'doubao-seedance-2-0-260128',
              prompt: '已完成的视频',
              promptRaw: '已完成的视频',
              duration: 5,
              ratio: '16:9',
              resolution: '720p',
              generateAudio: true,
              createdAt: '2026-04-04T00:00:00.000Z',
              updatedAt: '2026-04-04T00:05:00.000Z',
              errorMessage: null,
              videoUrl: 'https://signed.example.com/videos/30.mp4?token=old',
            },
            {
              id: 31,
              userId: 1,
              projectId: 101,
              status: 'processing',
              model: 'doubao-seedance-2-0-260128',
              prompt: '仍在生成的视频',
              promptRaw: '仍在生成的视频',
              duration: 5,
              ratio: '16:9',
              resolution: '720p',
              generateAudio: true,
              createdAt: '2026-04-04T00:01:00.000Z',
              updatedAt: '2026-04-04T00:05:00.000Z',
              errorMessage: null,
              videoUrl: null,
              elapsedSeconds: 20,
              estimatedTotalSeconds: 110,
              estimateSampleSize: 3,
            },
          ],
          total: 2,
        })
        .mockResolvedValueOnce({
          items: [
            {
              id: 30,
              userId: 1,
              projectId: 101,
              status: 'succeeded',
              model: 'doubao-seedance-2-0-260128',
              prompt: '已完成的视频',
              promptRaw: '已完成的视频',
              duration: 5,
              ratio: '16:9',
              resolution: '720p',
              generateAudio: true,
              createdAt: '2026-04-04T00:00:00.000Z',
              updatedAt: '2026-04-04T00:06:00.000Z',
              errorMessage: null,
              videoUrl: 'https://signed.example.com/videos/30.mp4?token=new',
            },
            {
              id: 31,
              userId: 1,
              projectId: 101,
              status: 'processing',
              model: 'doubao-seedance-2-0-260128',
              prompt: '仍在生成的视频',
              promptRaw: '仍在生成的视频',
              duration: 5,
              ratio: '16:9',
              resolution: '720p',
              generateAudio: true,
              createdAt: '2026-04-04T00:01:00.000Z',
              updatedAt: '2026-04-04T00:06:00.000Z',
              errorMessage: null,
              videoUrl: null,
              elapsedSeconds: 25,
              estimatedTotalSeconds: 110,
              estimateSampleSize: 3,
            },
          ],
          total: 2,
        })

      renderVideosPage()

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      const originalVideo = screen.getByLabelText('视频播放-已完成的视频')
      expect(originalVideo).toHaveAttribute('src', 'https://signed.example.com/videos/30.mp4?token=old')
      expect(screen.getAllByText('生成中').length).toBeGreaterThan(0)

      await act(async () => {
        vi.advanceTimersByTime(5_000)
        await Promise.resolve()
        await Promise.resolve()
      })

      const updatedVideo = screen.getByLabelText('视频播放-已完成的视频')
      expect(updatedVideo).toBe(originalVideo)
      expect(updatedVideo).toHaveAttribute('src', 'https://signed.example.com/videos/30.mp4?token=old')
    } finally {
      vi.useRealTimers()
    }
  })

  it('轮询刷新时保留稳定的历史说明文案，避免头部布局抖动', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    let resolveRefresh: ((value: { items: any[]; total: number }) => void) | null = null

    vi.useFakeTimers()

    try {
      vi.mocked(getVideoTasks)
        .mockResolvedValueOnce({
          items: [
            {
              id: 41,
              userId: 1,
              projectId: 101,
              status: 'processing',
              model: 'doubao-seedance-2-0-260128',
              prompt: '轮询中的任务',
              promptRaw: '轮询中的任务',
              duration: 5,
              ratio: '16:9',
              resolution: '720p',
              generateAudio: true,
              createdAt: '2026-04-04T00:00:00.000Z',
              updatedAt: '2026-04-04T00:05:00.000Z',
              errorMessage: null,
              videoUrl: null,
              elapsedSeconds: 20,
              estimatedTotalSeconds: 110,
              estimateSampleSize: 3,
            },
          ],
          total: 1,
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveRefresh = resolve
            })
        )

      renderVideosPage()

      const stableDescription = '任务会区分排队中与生成中两个阶段，并持续自动刷新。'

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(screen.getByText(stableDescription)).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(5_000)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(screen.getByText(stableDescription)).toBeInTheDocument()
      expect(screen.getByText('已自动刷新最新状态')).toBeInTheDocument()

      await act(async () => {
        resolveRefresh?.({
          items: [
            {
              id: 41,
              userId: 1,
              projectId: 101,
              status: 'processing',
              model: 'doubao-seedance-2-0-260128',
              prompt: '轮询中的任务',
              promptRaw: '轮询中的任务',
              duration: 5,
              ratio: '16:9',
              resolution: '720p',
              generateAudio: true,
              createdAt: '2026-04-04T00:00:00.000Z',
              updatedAt: '2026-04-04T00:06:00.000Z',
              errorMessage: null,
              videoUrl: null,
              elapsedSeconds: 25,
              estimatedTotalSeconds: 110,
              estimateSampleSize: 3,
            },
          ],
          total: 1,
        })
        await Promise.resolve()
        await Promise.resolve()
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('可切换到我创建的任务筛选', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    vi.mocked(getVideoTasks)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    renderVideosPage()

    await screen.findByRole('heading', { name: '视频生成' })
    await userEvent.click(screen.getByRole('radio', { name: '我创建的任务' }))

    expect(vi.mocked(getVideoTasks).mock.calls[1]?.[0]).toMatchObject({ mine: true, page: 1, pageSize: 20 })
  })

  it('任务历史筛选会透传关键词、时间、模式和状态参数', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    vi.mocked(getVideoTasks)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    renderVideosPage()

    await screen.findByRole('heading', { name: '视频生成' })
    fireEvent.change(screen.getByLabelText('提示词搜索'), { target: { value: '角色A' } })
    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-04-05' } })
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-04-06' } })
    fireEvent.change(screen.getByLabelText('生成模式筛选'), { target: { value: 'frames' } })
    fireEvent.change(screen.getByLabelText('任务状态筛选'), { target: { value: 'processing' } })
    await userEvent.click(screen.getByRole('button', { name: '应用筛选' }))

    expect(vi.mocked(getVideoTasks).mock.calls[1]?.[0]).toMatchObject({
      mine: false,
      q: '角色A',
      mode: 'frames',
      status: 'processing',
      dateFrom: '2026-04-05T00:00:00.000Z',
      dateTo: '2026-04-06T23:59:59.999Z',
      page: 1,
      pageSize: 20,
    })
  })

  it('重置筛选后会恢复默认列表参数', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    vi.mocked(getVideoTasks)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    renderVideosPage()

    await screen.findByRole('heading', { name: '视频生成' })
    fireEvent.change(screen.getByLabelText('提示词搜索'), { target: { value: '角色A' } })
    await userEvent.click(screen.getByRole('button', { name: '应用筛选' }))
    await userEvent.click(screen.getByRole('button', { name: '重置筛选' }))

    expect(vi.mocked(getVideoTasks).mock.calls[2]?.[0]).toEqual({ mine: false, page: 1, pageSize: 20 })
  })

  it('任务总数使用后端总数并支持分页切换和筛选重置页码', async () => {
    const { getVideoTasks } = await import('../../api/videos')

    vi.mocked(getVideoTasks)
      .mockResolvedValueOnce({
        items: Array.from({ length: 20 }).map((_, index) => ({
          id: index + 1,
          userId: 1,
          projectId: 101,
          status: 'succeeded',
          mode: 'frames',
          model: 'doubao-seedance-2-0-260128',
          prompt: `分页任务-${index + 1}`,
          promptRaw: `分页任务-${index + 1}`,
          duration: 5,
          ratio: '16:9',
          resolution: '720p',
          generateAudio: true,
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
          errorMessage: null,
          videoUrl: `https://signed.example.com/videos/${index + 1}.mp4`,
        })),
        total: 51,
      })
      .mockResolvedValue({ items: [], total: 51 })

    renderVideosPage()

    await screen.findByText('分页任务-1')
    expect(screen.getByText('51')).toBeInTheDocument()
    expect(vi.mocked(getVideoTasks).mock.calls[0]?.[0]).toMatchObject({ page: 1, pageSize: 20 })

    await userEvent.click(screen.getByTitle('2'))
    await waitFor(() => {
      const latestCall = vi.mocked(getVideoTasks).mock.calls[vi.mocked(getVideoTasks).mock.calls.length - 1]?.[0]
      expect(latestCall).toMatchObject({ page: 2, pageSize: 20 })
    })

    fireEvent.change(screen.getByLabelText('提示词搜索'), { target: { value: '角色A' } })
    await userEvent.click(screen.getByRole('button', { name: '应用筛选' }))
    await waitFor(() => {
      const latestCall = vi.mocked(getVideoTasks).mock.calls[vi.mocked(getVideoTasks).mock.calls.length - 1]?.[0]
      expect(latestCall).toMatchObject({ page: 1, pageSize: 20, q: '角色A' })
    })
  })

  it('轮询刷新时会保留当前筛选条件', async () => {
    const { getVideoTasks } = await import('../../api/videos')

    vi.useFakeTimers()

    try {
      vi.mocked(getVideoTasks).mockResolvedValue({
        items: [
          {
            id: 90,
            userId: 1,
            projectId: 101,
            status: 'processing',
            mode: 'frames',
            model: 'doubao-seedance-2-0-260128',
            prompt: '角色A 镜头',
            promptRaw: '角色A 镜头',
            duration: 5,
            ratio: '16:9',
            resolution: '720p',
            generateAudio: true,
            createdAt: '2026-04-05T00:00:00.000Z',
            updatedAt: '2026-04-05T00:00:00.000Z',
            errorMessage: null,
            videoUrl: null,
            elapsedSeconds: 10,
            estimatedTotalSeconds: 110,
            estimateSampleSize: 3,
          },
        ],
        total: 1,
      })

      renderVideosPage()

      await act(async () => {
        await Promise.resolve()
      })

      fireEvent.change(screen.getByLabelText('提示词搜索'), { target: { value: '角色A' } })
      fireEvent.change(screen.getByLabelText('生成模式筛选'), { target: { value: 'frames' } })
      fireEvent.click(screen.getByRole('button', { name: '应用筛选' }))

      await act(async () => {
        vi.advanceTimersByTime(5_000)
        await Promise.resolve()
        await Promise.resolve()
      })

      const latestGetVideoTasksCall =
        vi.mocked(getVideoTasks).mock.calls[vi.mocked(getVideoTasks).mock.calls.length - 1]?.[0]

      expect(latestGetVideoTasksCall).toMatchObject({
        mine: false,
        q: '角色A',
        mode: 'frames',
        page: 1,
        pageSize: 20,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('筛选无结果时展示独立空状态文案', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    vi.mocked(getVideoTasks)
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    renderVideosPage()

    expect(await screen.findByText('当前还没有视频任务')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('提示词搜索'), { target: { value: '不存在的关键词' } })
    await userEvent.click(screen.getByRole('button', { name: '应用筛选' }))

    expect(await screen.findByText('没有匹配当前筛选条件的任务')).toBeInTheDocument()
  })

  it('任务卡片中的长提示词默认收起为两行，悬停可查看完整内容', async () => {
    const { getVideoTasks } = await import('../../api/videos')
    const longPrompt =
      '这是一个非常长的视频生成提示词，需要在任务卡片中默认折叠显示，只保留两行，并在鼠标悬停时再展示完整内容，避免整个卡片被大段文本撑高'

    vi.mocked(getVideoTasks).mockResolvedValue({
      items: [
        {
          id: 88,
          userId: 1,
          projectId: 101,
          status: 'succeeded',
          mode: 'omni',
          model: 'doubao-seedance-2-0-260128',
          prompt: longPrompt,
          promptRaw: longPrompt,
          duration: 5,
          ratio: '16:9',
          resolution: '720p',
          generateAudio: true,
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:05:00.000Z',
          errorMessage: null,
          videoUrl: 'https://signed.example.com/videos/88.mp4',
        },
      ],
      total: 1,
    })

    renderVideosPage()

    await waitFor(() => {
      expect(vi.mocked(getVideoTasks)).toHaveBeenCalledTimes(1)
    })

    const promptTitle = screen.getByLabelText('完整提示词')
    expect(promptTitle).toHaveTextContent(longPrompt)
    expect(screen.getAllByText('全能参考').length).toBeGreaterThan(0)
    expect(promptTitle.getAttribute('style') ?? '').toContain('display: -webkit-box')
    expect(promptTitle.getAttribute('style') ?? '').toContain('overflow: hidden')
    expect(promptTitle.getAttribute('style') ?? '').toContain('max-height: 2.9em')
    expect(promptTitle.getAttribute('style') ?? '').toContain('word-break: break-word')
  })

  it('任务历史会显示首尾帧模式角标', async () => {
    const { getVideoTasks } = await import('../../api/videos')

    vi.mocked(getVideoTasks).mockResolvedValue({
      items: [
        {
          id: 89,
          userId: 1,
          projectId: 101,
          status: 'pending',
          mode: 'frames',
          model: 'doubao-seedance-2-0-260128',
          prompt: '首尾帧任务',
          promptRaw: '首尾帧任务',
          duration: 5,
          ratio: '16:9',
          resolution: '720p',
          generateAudio: true,
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
          errorMessage: null,
          videoUrl: null,
        },
      ],
      total: 1,
    })

    renderVideosPage()

    expect(await screen.findByText('首尾帧')).toBeInTheDocument()
  })

  it('点击重新拉取状态后立即进入排队轮询状态并刷新列表', async () => {
    const { getVideoTasks, syncVideoTask } = await import('../../api/videos')

    vi.mocked(getVideoTasks)
      .mockResolvedValueOnce({
        items: [
          {
            id: 91,
            userId: 1,
            projectId: 101,
            status: 'failed',
            mode: 'omni',
            model: 'doubao-seedance-2-0-260128',
            prompt: '失败任务',
            promptRaw: '失败任务',
            duration: 5,
            ratio: '16:9',
            resolution: '720p',
            generateAudio: true,
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:05:00.000Z',
            arkTaskId: 'cgt-20260528163741-fzf6r',
            errorMessage: '火山视频链接已过期或无权限访问，无法下载结果视频（HTTP 403，火山任务ID：cgt-20260528163741-fzf6r）',
            videoUrl: null,
          },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 91,
            userId: 1,
            projectId: 101,
            status: 'processing',
            mode: 'omni',
            model: 'doubao-seedance-2-0-260128',
            prompt: '失败任务',
            promptRaw: '失败任务',
            duration: 5,
            ratio: '16:9',
            resolution: '720p',
            generateAudio: true,
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:06:00.000Z',
            arkTaskId: 'cgt-20260528163741-fzf6r',
            errorMessage: null,
            videoUrl: null,
          },
        ],
        total: 1,
      })
    vi.mocked(syncVideoTask).mockResolvedValue({
      id: 91,
      userId: 1,
      projectId: 101,
      status: 'processing',
      mode: 'omni',
      model: 'doubao-seedance-2-0-260128',
      prompt: '失败任务',
      promptRaw: '失败任务',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:06:00.000Z',
      arkTaskId: 'cgt-20260528163741-fzf6r',
      errorMessage: null,
      nextPollAt: '2026-04-04T00:06:00.000Z',
      videoUrl: null,
    })

    renderVideosPage()

    await userEvent.click(await screen.findByRole('button', { name: '重新拉取任务状态-91' }))

    expect(syncVideoTask).toHaveBeenCalledWith(91)
    expect(await screen.findByText(/已加入状态拉取队列，等待后台查询视频平台状态/)).toBeInTheDocument()
    expect(screen.queryByText(/火山视频链接已过期或无权限访问/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新拉取任务状态-91' })).not.toBeInTheDocument()
    expect(await screen.findByText('已加入状态拉取队列，后台将在约 30 秒内查询视频平台状态')).toBeInTheDocument()
    await waitFor(() => {
      expect(getVideoTasks).toHaveBeenCalledTimes(2)
    })
  })
})
