import { ConfigProvider } from 'antd'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../stores/auth'
import { AppRouter } from './index'

const mockUseBrand = vi.fn()

vi.mock('../api/auth', () => ({
  login: vi.fn(),
}))

vi.mock('../api/setup', () => ({
  getSetupStatus: vi.fn(),
  initializeSetup: vi.fn(),
  validateSetupOss: vi.fn(),
  validateSetupArkBearer: vi.fn(),
  validateSetupArkAksk: vi.fn(),
}))

vi.mock('../api/assets', () => ({
  getAssets: vi.fn(),
  createAsset: vi.fn(),
  deleteAsset: vi.fn(),
  syncAssets: vi.fn(),
  getAssetStsToken: vi.fn(),
}))

vi.mock('../api/asset-categories', () => ({
  getAssetCategories: vi.fn(),
  createAssetCategory: vi.fn(),
  updateAssetCategory: vi.fn(),
  deleteAssetCategory: vi.fn(),
}))

vi.mock('../api/videos', () => ({
  getVideoTasks: vi.fn(),
  createVideoTask: vi.fn(),
  getVideoAnalytics: vi.fn(),
}))

vi.mock('../api/video-generation-logs', () => ({
  getVideoGenerationLogs: vi.fn(),
  deleteVideoGenerationLogs: vi.fn(),
}))

vi.mock('../stores/brand', () => ({
  useBrand: () => mockUseBrand(),
}))

const renderRouter = (initialEntries: string[] = ['/login']) => {
  return render(
    <ConfigProvider>
      <AuthProvider>
        <AppRouter initialEntries={initialEntries} />
      </AuthProvider>
    </ConfigProvider>
  )
}

describe('AppRouter', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    mockUseBrand.mockReturnValue({
      state: {
        systemName: 'Narrix',
        logoUrl: null,
        hydrated: true,
      },
      refresh: vi.fn(),
    })
    document.title = ''
  })

  it('登录成功后写入 token 并进入素材页', async () => {
    const { login } = await import('../api/auth')
    const { getAssets } = await import('../api/assets')
    const { getAssetCategories } = await import('../api/asset-categories')
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(login).mockResolvedValue({
      token: 'token-123',
      user: {
        id: 1,
        username: 'admin',
        role: 'admin',
        menuPerms: ['assets', 'users', 'config'],
        status: 1,
      },
      projects: [
        { id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', projectRole: 'manager' },
      ],
      activeProjectId: 101,
    })
    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })
    vi.mocked(getAssets).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssetCategories).mockResolvedValue({ items: [] })

    renderRouter(['/login'])

    await userEvent.type(await screen.findByLabelText('用户名'), 'admin')
    await userEvent.type(screen.getByLabelText('密码'), 'pass1234')
    await userEvent.click(screen.getByRole('button', { name: /登\s*录/ }))

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBe('token-123')
    })

    expect(await screen.findByRole('heading', { name: '素材管理' })).toBeInTheDocument()
    expect(screen.getByText('Narrix')).toBeInTheDocument()
  })

  it('仅有 videos 权限的用户登录后进入视频生成页', async () => {
    const { login } = await import('../api/auth')
    const { getVideoTasks } = await import('../api/videos')
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(login).mockResolvedValue({
      token: 'token-video',
      user: {
        id: 3,
        username: 'video-operator',
        role: 'user',
        menuPerms: ['videos'],
        status: 1,
      },
      projects: [
        { id: 102, name: '校园修仙', code: 'campus-xiu', status: 'active', projectRole: 'member' },
      ],
      activeProjectId: 102,
    })
    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })
    vi.mocked(getVideoTasks).mockResolvedValue({ items: [], total: 0 })

    renderRouter(['/login'])

    await userEvent.type(await screen.findByLabelText('用户名'), 'video-operator')
    await userEvent.type(screen.getByLabelText('密码'), 'pass1234')
    await userEvent.click(screen.getByRole('button', { name: /登\s*录/ }))

    expect(await screen.findByRole('heading', { name: '视频生成' })).toBeInTheDocument()
  })

  it('仅有 analytics 权限的用户登录后进入数据统计页', async () => {
    const { login } = await import('../api/auth')
    const { getVideoAnalytics } = await import('../api/videos')
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(login).mockResolvedValue({
      token: 'token-analytics',
      user: {
        id: 5,
        username: 'analyst',
        role: 'user',
        menuPerms: ['analytics'],
        status: 1,
      },
      projects: [
        { id: 103, name: '数据看板', code: 'analytics-board', status: 'active', projectRole: 'manager' },
      ],
      activeProjectId: 103,
    })
    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })
    vi.mocked(getVideoAnalytics).mockResolvedValue({
      overview: {
        totalRequests: 0,
        successRate: 0,
        avgDurationSeconds: 0,
        totalTokensConsumed: 0,
        totalTokensSucceeded: 0,
        avgTokensPerTask: 0,
      },
      statusDistribution: [],
      modelDistribution: [],
      userTokenDistribution: [],
    })

    renderRouter(['/login'])

    await userEvent.type(await screen.findByLabelText('用户名'), 'analyst')
    await userEvent.type(screen.getByLabelText('密码'), 'pass1234')
    await userEvent.click(screen.getByRole('button', { name: /登\s*录/ }))

    expect(await screen.findByRole('heading', { name: '数据统计' })).toBeInTheDocument()
  })

  it('没有菜单权限的用户登录后进入无权限提示页', async () => {
    const { login } = await import('../api/auth')
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(login).mockResolvedValue({
      token: 'token-no-access',
      user: {
        id: 4,
        username: 'blocked-user',
        role: 'user',
        menuPerms: [],
        status: 1,
      },
      projects: [],
      activeProjectId: null,
    })
    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })

    renderRouter(['/login'])

    await userEvent.type(await screen.findByLabelText('用户名'), 'blocked-user')
    await userEvent.type(screen.getByLabelText('密码'), 'pass1234')
    await userEvent.click(screen.getByRole('button', { name: /登\s*录/ }))

    expect(await screen.findByText('当前账号尚未分配任何可见菜单')).toBeInTheDocument()
  })

  it('没有菜单权限的用户访���受限页面时显示 404', async () => {
    const { getAssets } = await import('../api/assets')
    const { getAssetCategories } = await import('../api/asset-categories')
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })
    vi.mocked(getAssets).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getAssetCategories).mockResolvedValue({ items: [] })

    localStorage.setItem('token', 'token-user')
    localStorage.setItem(
      'auth-user',
      JSON.stringify({
        id: 2,
        username: 'operator',
        role: 'user',
        menuPerms: ['assets'],
        status: 1,
      })
    )

    renderRouter(['/users'])

    expect(await screen.findByText('页面不存在或无权访问')).toBeInTheDocument()
  })

  it('管理员移除 projects 菜单权限后访问项目管理页也会显示 404', async () => {
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })

    localStorage.setItem('token', 'token-admin')
    localStorage.setItem(
      'auth-user',
      JSON.stringify({
        id: 1,
        username: 'admin',
        role: 'admin',
        menuPerms: ['assets', 'videos', 'users', 'config'],
        status: 1,
      })
    )
    localStorage.setItem(
      'auth-projects',
      JSON.stringify([{ id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', projectRole: 'manager' }])
    )
    localStorage.setItem('active-project-id', '101')
    localStorage.setItem('active-project-role', 'manager')

    renderRouter(['/projects'])

    expect(await screen.findByText('页面不存在或无权访问')).toBeInTheDocument()
  })

  it('具备 logs 权限的管理员可进入当前项目生成日志页', async () => {
    const { getSetupStatus } = await import('../api/setup')
    const { getVideoGenerationLogs } = await import('../api/video-generation-logs')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: { database: true, redis: true },
    })
    vi.mocked(getVideoGenerationLogs).mockResolvedValue({ items: [], total: 0 })
    localStorage.setItem('token', 'token-admin')
    localStorage.setItem(
      'auth-user',
      JSON.stringify({
        id: 1,
        username: 'admin',
        role: 'admin',
        menuPerms: ['logs'],
        status: 1,
      })
    )
    localStorage.setItem(
      'auth-projects',
      JSON.stringify([{ id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', projectRole: 'manager' }])
    )
    localStorage.setItem('active-project-id', '101')
    localStorage.setItem('active-project-role', 'manager')

    renderRouter(['/logs'])

    expect(await screen.findByRole('heading', { name: '生成日志' })).toBeInTheDocument()
    expect(getVideoGenerationLogs).toHaveBeenCalledWith({ page: 1, pageSize: 50 })
  })

  it('没有 analytics 权限的用户访问数据统计页时显示 404', async () => {
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })

    localStorage.setItem('token', 'token-user')
    localStorage.setItem(
      'auth-user',
      JSON.stringify({
        id: 6,
        username: 'video-user',
        role: 'user',
        menuPerms: ['videos'],
        status: 1,
      })
    )
    localStorage.setItem(
      'auth-projects',
      JSON.stringify([{ id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', projectRole: 'manager' }])
    )
    localStorage.setItem('active-project-id', '101')

    renderRouter(['/analytics'])

    expect(await screen.findByText('页面不存在或无权访问')).toBeInTheDocument()
  })

  it('未安装时访问任意入口会被重定向到 /setup', async () => {
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: false,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: null,
      health: {
        database: true,
        redis: true,
      },
    })

    renderRouter(['/login'])

    expect(await screen.findByRole('heading', { name: '初始化 Narrix' })).toBeInTheDocument()
    expect(document.title).toBe('Narrix 安装向导')
  })

  it('安装帮助中心路由在未安装时也可直接访问', async () => {
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: false,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: null,
      health: {
        database: true,
        redis: true,
      },
    })

    renderRouter(['/setup/help/configuration'])

    expect(await screen.findByRole('heading', { name: 'Narrix 安装帮助中心' })).toBeInTheDocument()
    expect(screen.getByText('OSS STS Role ARN 详细教程')).toBeInTheDocument()
    expect(document.title).toBe('Narrix 安装帮助中心')
  })

  it('已安装后访问 /setup 会自动跳回登录页', async () => {
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })

    renderRouter(['/setup'])

    expect(await screen.findByRole('heading', { name: 'Narrix' })).toBeInTheDocument()
    expect(screen.getByText('登录管理后台')).toBeInTheDocument()
  })

  it('安��状态接口失败时会显示错误提示，并允许重试恢复', async () => {
    const { getSetupStatus } = await import('../api/setup')

    vi.mocked(getSetupStatus)
      .mockRejectedValueOnce(new Error('setup status unavailable'))
      .mockResolvedValueOnce({
        initialized: false,
        environment: 'dev',
        version: '1.0.0',
        installMode: 'self_hosted',
        initializedAt: null,
        health: {
          database: true,
          redis: true,
        },
      })

    renderRouter(['/login'])

    expect(await screen.findByText('无法获取 Narrix 安装状态')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '重新检查' }))

    expect(await screen.findByRole('heading', { name: '初始化 Narrix' })).toBeInTheDocument()
  })

  it('安装态错误页会使用当前品牌名', async () => {
    const { getSetupStatus } = await import('../api/setup')

    mockUseBrand.mockReturnValue({
      state: {
        systemName: '调皮狗云创',
        logoUrl: null,
        hydrated: true,
      },
      refresh: vi.fn(),
    })

    vi.mocked(getSetupStatus).mockRejectedValueOnce(new Error('setup status unavailable'))

    renderRouter(['/login'])

    expect(await screen.findByText('无法获取 调皮狗云创 安装状态')).toBeInTheDocument()
  })
})
