import { ConfigProvider } from 'antd'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../../stores/auth'
import { AnalyticsPage } from '.'

vi.mock('../../api/videos', () => ({
  exportVideoAnalytics: vi.fn(),
  exportVideoTaskDetails: vi.fn(),
  getVideoAnalytics: vi.fn(),
}))

const renderAnalyticsPage = () =>
  render(
    <ConfigProvider>
      <AuthProvider>
        <AnalyticsPage />
      </AuthProvider>
    </ConfigProvider>
  )

const setAuthedUser = ({
  role = 'admin',
  projectRole = 'manager',
}: {
  role?: 'admin' | 'user'
  projectRole?: 'manager' | 'member' | 'viewer'
} = {}) => {
  localStorage.setItem('token', 'analytics-token')
  localStorage.setItem(
    'auth-user',
    JSON.stringify({
      id: 1,
      username: 'analyst',
      role,
      menuPerms: ['analytics'],
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

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    setAuthedUser()
  })

  it('首次加载会请求 analytics 并展示概览与分布模块', async () => {
    const { getVideoAnalytics } = await import('../../api/videos')

    vi.mocked(getVideoAnalytics).mockResolvedValue({
      overview: {
        totalRequests: 12,
        successRate: 0.75,
        avgDurationSeconds: 8.5,
        totalTokensConsumed: 123456,
        totalTokensSucceeded: 120000,
        avgTokensPerTask: 10288,
      },
      statusDistribution: [
        { status: 'pending', count: 1 },
        { status: 'processing', count: 2 },
        { status: 'succeeded', count: 9 },
      ],
      modelDistribution: [
        { model: 'doubao-seedance-2-0-260128', count: 7 },
        { model: 'doubao-seedance-2-0-fast-260128', count: 5 },
      ],
      userTokenDistribution: [
        { userId: 1, userName: 'analyst', requestCount: 12, totalTokens: 123456, shareRatio: 1 },
      ],
    })

    renderAnalyticsPage()

    expect(await screen.findByText('数据统计')).toBeInTheDocument()
    await waitFor(() => {
      expect(getVideoAnalytics).toHaveBeenCalled()
      expect(vi.mocked(getVideoAnalytics).mock.calls[0]?.[0]).toEqual({})
    })
    expect(screen.getByText('总请求次数')).toBeInTheDocument()
    expect(screen.getByText('任务状态分布')).toBeInTheDocument()
    expect(screen.getByText('模型使用分布')).toBeInTheDocument()
    expect(screen.getByText('用户 Token 分布')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('空数据时显示空态提示', async () => {
    const { getVideoAnalytics } = await import('../../api/videos')

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

    renderAnalyticsPage()

    expect(await screen.findByText('当前筛选范围内暂无统计数据')).toBeInTheDocument()
  })

  it('筛选条件会透传到 analytics 接口', async () => {
    const { getVideoAnalytics } = await import('../../api/videos')

    vi.mocked(getVideoAnalytics).mockResolvedValue({
      overview: {
        totalRequests: 1,
        successRate: 1,
        avgDurationSeconds: 5,
        totalTokensConsumed: 123,
        totalTokensSucceeded: 123,
        avgTokensPerTask: 123,
      },
      statusDistribution: [{ status: 'succeeded', count: 1 }],
      modelDistribution: [{ model: 'doubao-seedance-2-0-fast-260128', count: 1 }],
      userTokenDistribution: [{ userId: 1, userName: 'analyst', requestCount: 1, totalTokens: 123, shareRatio: 1 }],
    })

    renderAnalyticsPage()
    await screen.findByText('数据统计')

    await userEvent.selectOptions(screen.getByLabelText('模型筛选'), 'doubao-seedance-2-0-fast-260128')
    await userEvent.selectOptions(screen.getByLabelText('任务状态筛选'), 'succeeded')

    await userEvent.click(screen.getByRole('button', { name: '仅看我的' }))
    await userEvent.click(screen.getByRole('button', { name: '更新统计' }))

    await waitFor(() => {
      expect(getVideoAnalytics).toHaveBeenLastCalledWith({
        mine: true,
        model: 'doubao-seedance-2-0-fast-260128',
        status: 'succeeded',
      })
    })
  })

  it('按当前已应用筛选条件导出 CSV，管理员可选择全部项目', async () => {
    const { exportVideoAnalytics, getVideoAnalytics } = await import('../../api/videos')

    vi.mocked(getVideoAnalytics).mockResolvedValue({
      overview: {
        totalRequests: 1,
        successRate: 1,
        avgDurationSeconds: 5,
        totalTokensConsumed: 123,
        totalTokensSucceeded: 123,
        avgTokensPerTask: 123,
      },
      statusDistribution: [{ status: 'succeeded', count: 1 }],
      modelDistribution: [{ model: 'doubao-seedance-2-0-fast-260128', count: 1 }],
      userTokenDistribution: [{ userId: 1, userName: 'analyst', requestCount: 1, totalTokens: 123, shareRatio: 1 }],
    })
    vi.mocked(exportVideoAnalytics).mockResolvedValue(new Blob(['report'], { type: 'text/csv' }))
    const createObjectUrl = vi.fn(() => 'blob:narrix-report')
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl })
    const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    renderAnalyticsPage()
    await screen.findByText('数据统计')
    await userEvent.selectOptions(screen.getByLabelText('任务状态筛选'), 'succeeded')
    await userEvent.click(screen.getByRole('button', { name: '更新统计' }))
    await userEvent.click(screen.getByRole('button', { name: '导出 CSV' }))
    await userEvent.click(await screen.findByText('导出全部项目'))

    await waitFor(() => {
      expect(exportVideoAnalytics).toHaveBeenCalledWith({
        scope: 'all',
        status: 'succeeded',
      })
    })
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
    expect(clickAnchor).toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:narrix-report')
    clickAnchor.mockRestore()
  })

  it('受限成员只能查看自己的统计视图', async () => {
    const { getVideoAnalytics } = await import('../../api/videos')

    setAuthedUser({ role: 'user', projectRole: 'member' })
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

    renderAnalyticsPage()

    const toggleGroup = await screen.findByRole('group', { name: '统计范围' })
    expect(within(toggleGroup).getByRole('button', { name: '全部任务' })).toBeDisabled()
    await waitFor(() => {
      expect(getVideoAnalytics).toHaveBeenCalledWith({ mine: true })
    })
  })
})
