import { ConfigProvider } from 'antd'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../../stores/auth'
import { AppLayout } from './AppLayout'

vi.mock('../../api/auth', () => ({
  changePassword: vi.fn(),
  logout: vi.fn(),
}))

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/assets']}>
      <ConfigProvider>
        <AuthProvider>
          <AppLayout brandingName="成都 Propigo">
            <div>content</div>
          </AppLayout>
        </AuthProvider>
      </ConfigProvider>
    </MemoryRouter>
  )

const setAdminUser = () => {
  localStorage.setItem('token', 'admin-token')
  localStorage.setItem(
    'auth-user',
    JSON.stringify({
      id: 1,
      username: 'admin',
      role: 'admin',
      menuPerms: ['assets', 'videos', 'projects', 'users', 'logs', 'config'],
      status: 1,
    })
  )
  localStorage.setItem(
    'auth-projects',
    JSON.stringify([
      { id: 101, name: '成都主线', code: 'PRJ-001', projectRole: 'manager' },
      { id: 102, name: '番外试验场', code: 'PRJ-002', projectRole: 'manager' },
    ])
  )
  localStorage.setItem('active-project-id', '101')
  localStorage.setItem('active-project-role', 'manager')
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    setAdminUser()
  })

  it('外层布局使用 border-box 避免 100vh 与 padding 叠加导致额外滚动条', () => {
    const { container } = renderLayout()

    const appShell = container.querySelector('.ant-layout')

    expect(appShell).not.toBeNull()
    expect(appShell).toHaveStyle({
      boxSizing: 'border-box',
      minHeight: 'calc(100vh - 36px)',
    })
  })

  it('右上角账号菜单提供修改密码入口', async () => {
    renderLayout()

    fireEvent.click(screen.getByLabelText('admin 账号菜单'))

    expect(await screen.findByText('修改密码')).toBeInTheDocument()
    expect(screen.getByText('退出登录')).toBeInTheDocument()
    expect(screen.getByText('成都 Propigo')).toBeInTheDocument()
  })

  it('退出登录时会一并清空视频生成草稿', async () => {
    const { logout } = await import('../../api/auth')

    vi.mocked(logout).mockResolvedValue(undefined)
    sessionStorage.setItem('videos:generate-draft:101', JSON.stringify({ mode: 'frames', framePrompt: '待清空草稿' }))
    sessionStorage.setItem('videos:generate-draft:102', JSON.stringify({ mode: 'omni', omniPrompt: '另一个项目草稿' }))

    renderLayout()

    fireEvent.click(screen.getByLabelText('admin 账号菜单'))
    await userEvent.click(await screen.findByText('退出登录'))

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBeNull()
      expect(sessionStorage.getItem('videos:generate-draft:101')).toBeNull()
      expect(sessionStorage.getItem('videos:generate-draft:102')).toBeNull()
    })
  })

  it('侧栏默认展开，切换后会记住收起状态', async () => {
    const { container } = renderLayout()

    const footerControls = container.querySelector('.app-shell-footer-controls')
    const collapseButton = screen.getByRole('button', { name: '收起导航' })
    const menu = container.querySelector('.app-shell-menu')
    expect(screen.getByText('用户管理')).toBeInTheDocument()
    expect(screen.getByText('生成日志')).toBeInTheDocument()
    expect(footerControls).not.toBeNull()
    expect(menu).not.toBeNull()
    expect(footerControls?.contains(collapseButton)).toBe(true)

    await userEvent.click(collapseButton)

    expect(localStorage.getItem('app-layout-sider-collapsed')).toBe('true')
    expect(menu).toHaveClass('is-collapsed')
    expect(screen.getByRole('button', { name: '展开导航' })).toBeInTheDocument()
  })

  it('窄屏自动使用紧凑侧栏，为主内容保留可用宽度', () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query === '(max-width: 768px)',
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList
    )

    const { container } = renderLayout()
    const sider = container.querySelector('.app-shell-sider')
    const menu = container.querySelector('.app-shell-menu')

    expect(sider).toHaveStyle({ width: '80px', minWidth: '80px' })
    expect(menu).toHaveClass('is-collapsed')
    expect(screen.queryByRole('button', { name: '收起导航' })).not.toBeInTheDocument()

    matchMediaSpy.mockRestore()
  })

  it('展开态侧栏保持更紧凑的宽度，避免被底部卡片撑宽', () => {
    const { container } = renderLayout()

    const sider = container.querySelector('.app-shell-sider')

    expect(sider).not.toBeNull()
    expect(sider).toHaveStyle({
      width: '248px',
      minWidth: '248px',
    })
  })

  it('侧栏固定在视口高度内，底部项目切换与账号区不随内容区拉长', () => {
    const { container } = renderLayout()

    const sider = container.querySelector('.app-shell-sider')
    const footer = container.querySelector('.app-shell-footer')
    const menu = container.querySelector('.app-shell-menu')

    expect(sider).not.toBeNull()
    expect(footer).not.toBeNull()
    expect(menu).not.toBeNull()
    expect(sider).toHaveStyle({
      position: 'sticky',
      top: '18px',
      height: 'calc(100vh - 36px)',
    })
    expect(menu).toHaveStyle({
      overflowY: 'auto',
    })
  })

  it('项目切换器保留在顶部操作区', async () => {
    const { container } = renderLayout()

    await userEvent.click(screen.getByRole('button', { name: '当前项目' }))

    expect(container.querySelector('.app-shell-project-dock-body')).not.toBeNull()
    expect(await screen.findByText('番外试验场')).toBeInTheDocument()
  })

  it('账号卡片使用独立主体区，避免头像和文案整体偏向左侧', () => {
    const { container } = renderLayout()

    expect(container.querySelector('.app-shell-account-body')).not.toBeNull()
  })

  it('项目切换菜单使用专用样式包装项目名称，避免被挤压成逐字换行', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: '当前项目' }))

    const projectName = await screen.findByText('番外试验场')

    expect(document.querySelector('.app-shell-project-menu')).not.toBeNull()
    expect(projectName).toHaveClass('app-shell-project-menu-item-label')
  })

  it('管理员缺少 projects 菜单权限时，侧栏不显示项目管理入口', () => {
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

    renderLayout()

    expect(screen.queryByText('项目管理')).not.toBeInTheDocument()
    expect(screen.getByText('用户管理')).toBeInTheDocument()
  })

  it('具备 assets 权限但没有独立无限画布权限时，侧栏仍显示无限画布入口', () => {
    localStorage.setItem(
      'auth-user',
      JSON.stringify({
        id: 2,
        username: 'member',
        role: 'user',
        menuPerms: ['assets'],
        status: 1,
      })
    )

    renderLayout()

    const atelierLink = screen.getByRole('link', { name: '无限画布' })
    expect(atelierLink).toHaveAttribute('href', '/infinite-atelier')
  })

  it('具备 analytics 权限时侧栏显示数据统计入口', () => {
    localStorage.setItem(
      'auth-user',
      JSON.stringify({
        id: 1,
        username: 'admin',
        role: 'admin',
        menuPerms: ['assets', 'videos', 'analytics', 'projects', 'users', 'config'],
        status: 1,
      })
    )

    renderLayout()

    expect(screen.getByText('数据统计')).toBeInTheDocument()
  })

  it('升级后为已缓存管理员补充生成日志入口并记录迁移标记', () => {
    localStorage.setItem(
      'auth-user',
      JSON.stringify({
        id: 1,
        username: 'admin',
        role: 'admin',
        menuPerms: ['assets', 'videos', 'projects', 'users', 'config'],
        status: 1,
      })
    )

    renderLayout()

    expect(screen.getByText('生成日志')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('auth-user') ?? '{}').menuPerms).toContain('logs')
    expect(localStorage.getItem('auth-cache-migration-20260818-admin-logs')).toBe('true')
  })

  it('提交修改密码后调用接口并清理当前登录态', async () => {
    const { changePassword } = await import('../../api/auth')

    vi.mocked(changePassword).mockResolvedValue(undefined)

    renderLayout()

    fireEvent.click(screen.getByLabelText('admin 账号菜单'))
    fireEvent.click(await screen.findByText('修改密码'))

    const dialog = within(await screen.findByRole('dialog', { name: '修改密码' }))

    await userEvent.type(dialog.getByLabelText('当前密码'), 'pass12345')
    await userEvent.type(dialog.getByLabelText('新密码'), 'new-pass-12345')
    await userEvent.type(dialog.getByLabelText('确认新密码'), 'new-pass-12345')
    await userEvent.click(dialog.getByRole('button', { name: '确认修改' }))

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'pass12345',
        newPassword: 'new-pass-12345',
      })
    })

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBeNull()
      expect(localStorage.getItem('auth-user')).toBeNull()
    })
  })
})
