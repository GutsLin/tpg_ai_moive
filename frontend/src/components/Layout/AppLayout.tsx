import {
  AppstoreOutlined,
  BorderOuterOutlined,
  BarChartOutlined,
  DownOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  FileTextOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Dropdown, Form, Input, Layout, Menu, Modal, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { changePassword, createAtelierSsoTicket, logout as logoutApi } from '../../api/auth'
import { isAdminOnlyRoute, routePermMap } from '../../router/permissions'
import { useAuth } from '../../stores/auth'
import { useBrand } from '../../stores/brand'
import { resolveSystemName } from '../../utils/branding'

const { Sider, Content } = Layout

const menuConfig = [
  { key: 'assets', label: '素材管理', path: '/assets', icon: <AppstoreOutlined /> },
  { key: 'infinite-atelier', label: '无限画布', path: '/infinite-atelier', icon: <BorderOuterOutlined /> },
  { key: 'videos', label: '视频生成', path: '/videos', icon: <PlayCircleOutlined /> },
  { key: 'analytics', label: '数据统计', path: '/analytics', icon: <BarChartOutlined /> },
  { key: 'projects', label: '项目管理', path: '/projects', icon: <FolderOutlined /> },
  { key: 'users', label: '用户管理', path: '/users', icon: <TeamOutlined /> },
  { key: 'logs', label: '生成日志', path: '/logs', icon: <FileTextOutlined /> },
  { key: 'config', label: '系统配置', path: '/config', icon: <SettingOutlined /> },
]

// Temporarily keep the feature available by direct route while hiding its
// navigation entry until the rollout is resumed.
const INFINITE_ATELIER_NAV_ENABLED = true

const projectRoleTextMap = {
  manager: '项目管理员',
  member: '项目成员',
  viewer: '只读成员',
} as const

const APP_LAYOUT_STORAGE_KEYS = {
  siderCollapsed: 'app-layout-sider-collapsed',
} as const

const COMPACT_NAVIGATION_QUERY = '(max-width: 768px)'

const getInitialCollapsedState = () => {
  try {
    return window.localStorage.getItem(APP_LAYOUT_STORAGE_KEYS.siderCollapsed) === 'true'
  } catch {
    return false
  }
}

const getInitialCompactNavigationState = () =>
  typeof window !== 'undefined' && window.matchMedia(COMPACT_NAVIGATION_QUERY).matches

const PasswordChangeModal = ({
  open,
  confirmLoading,
  onCancel,
  onSubmit,
}: {
  open: boolean
  confirmLoading: boolean
  onCancel: () => void
  onSubmit: (payload: { currentPassword: string; newPassword: string }) => Promise<void>
}) => {
  const [form] = Form.useForm<{
    currentPassword: string
    newPassword: string
    confirmPassword: string
  }>()

  if (!open) {
    return null
  }

  return (
    <Modal
      open
      title="修改密码"
      okText="确认修改"
      cancelText="取消"
      confirmLoading={confirmLoading}
      destroyOnHidden
      onCancel={() => {
        form.resetFields()
        onCancel()
      }}
      onOk={() => {
        void form.submit()
      }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          if (values.newPassword !== values.confirmPassword) {
            form.setFields([
              {
                name: 'confirmPassword',
                errors: ['两次输入的新密码不一致'],
              },
            ])
            return
          }

          await onSubmit({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
          })
        }}
      >
        <Form.Item
          label={<label htmlFor="current-password">当前密码</label>}
          name="currentPassword"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password id="current-password" aria-label="当前密码" />
        </Form.Item>
        <Form.Item
          label={<label htmlFor="new-password">新密码</label>}
          name="newPassword"
          rules={[{ required: true, message: '请输入新密码' }, { min: 8, message: '新密码至少 8 位' }]}
        >
          <Input.Password id="new-password" aria-label="新密码" />
        </Form.Item>
        <Form.Item
          label={<label htmlFor="confirm-password">确认新密码</label>}
          name="confirmPassword"
          rules={[{ required: true, message: '请再次输入新密码' }]}
        >
          <Input.Password id="confirm-password" aria-label="确认新密码" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export const AppLayout = ({
  children,
  brandingName,
  contentKey,
}: {
  children: React.ReactNode
  brandingName?: string
  contentKey?: string
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, logout, switchProject } = useAuth()
  const { state: brand } = useBrand()
  const [messageApi, contextHolder] = message.useMessage()
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [siderCollapsed, setSiderCollapsed] = useState(getInitialCollapsedState)
  const [compactNavigation, setCompactNavigation] = useState(getInitialCompactNavigationState)
  const systemName = resolveSystemName(brandingName ?? brand.systemName)
  const navigationCollapsed = compactNavigation || siderCollapsed
  const [atelierLoading, setAtelierLoading] = useState(false)

  const activeProject = state.projects.find((project) => project.id === state.activeProjectId) ?? null
  const platformRoleText = state.user?.role === 'admin' ? '管理员' : '普通用户'

  const menuItems = menuConfig
    .filter(
      (item) =>
        item.path !== '/infinite-atelier' ||
        (INFINITE_ATELIER_NAV_ENABLED && state.user?.role === 'admin')
    )
    .filter((item) => {
      const requiredPerm = routePermMap[item.path as keyof typeof routePermMap]
      const hasPerm = requiredPerm === null || Boolean(state.user?.menuPerms.includes(requiredPerm))
      if (!hasPerm) {
        return false
      }

      if (isAdminOnlyRoute(item.path)) {
        return state.user?.role === 'admin'
      }

      return true
    })
    .map((item) => ({
      key: item.path,
      icon: item.icon,
      label:
        item.path === '/infinite-atelier' ? (
          <span role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click() } }} onClick={() => { if (atelierLoading) return; setAtelierLoading(true); void createAtelierSsoTicket().then(({ ticket }) => { window.location.assign(`/atelier-api/api/v1/auth/sso/callback?ticket=${encodeURIComponent(ticket)}`) }).catch(() => { void messageApi.error('无限画布登录票据获取失败，请稍后重试') }).finally(() => setAtelierLoading(false)) }}>{atelierLoading ? '连接中…' : item.label}</span>
        ) : <Link to={item.path}>{item.label}</Link>,
    }))

  useEffect(() => {
    document.title = `${systemName} 管理后台`
  }, [systemName])

  useEffect(() => {
    window.localStorage.setItem(APP_LAYOUT_STORAGE_KEYS.siderCollapsed, String(siderCollapsed))
  }, [siderCollapsed])

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_NAVIGATION_QUERY)
    const handleChange = (event: MediaQueryListEvent) => setCompactNavigation(event.matches)

    setCompactNavigation(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const handleLogout = async () => {
    try {
      await logoutApi()
    } catch {
      // ignore network logout failure and clear local session anyway
    }

    logout()
    navigate('/login', { replace: true })
  }

  const handleAccountMenuClick = async (key: string) => {
    if (key === 'change-password') {
      setPasswordModalOpen(true)
      return
    }

    await handleLogout()
  }

  const handleChangePassword = async (values: { currentPassword: string; newPassword: string }) => {
    setUpdatingPassword(true)
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
      void messageApi.success('密码修改成功，请重新登录')
      setPasswordModalOpen(false)
      await handleLogout()
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '修改密码失败，请稍后重试')
    } finally {
      setUpdatingPassword(false)
    }
  }

  const accountMenu = {
    items: [
      {
        key: 'change-password',
        icon: <LockOutlined />,
        label: '修改密码',
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
      },
    ],
    onClick: ({ key }: { key: string }) => {
      void handleAccountMenuClick(key)
    },
  }

  return (
    <>
      {contextHolder}
      <Layout
        className="app-shell"
        style={{
          minHeight: 'calc(100vh - 36px)',
          boxSizing: 'border-box',
        }}
      >
        <Sider
          className={`app-shell-sider ${navigationCollapsed ? 'is-collapsed' : ''}`}
          width={248}
          collapsedWidth={compactNavigation ? 80 : 96}
          collapsed={navigationCollapsed}
          trigger={null}
          style={{
            position: 'sticky',
            top: compactNavigation ? 12 : 18,
            height: compactNavigation ? 'calc(100vh - 24px)' : 'calc(100vh - 36px)',
            alignSelf: 'flex-start',
          }}
        >
          <div className="app-shell-sider-inner">
            <div className="app-shell-brand">
              <div className="app-shell-brand-main">
                {!navigationCollapsed ? (
                  <div className="app-shell-brand-copy">
                    <Typography.Text className="app-shell-brand-kicker">CREATOR CONSOLE</Typography.Text>
                    <div className="app-shell-brand-identity">
                      {brand.logoUrl ? (
                        <img src={brand.logoUrl} alt={`${systemName} Logo`} className="app-shell-brand-logo" />
                      ) : (
                        <div className="app-shell-brand-logo app-shell-brand-logo-fallback" aria-hidden="true">
                          {systemName.slice(0, 1)}
                        </div>
                      )}
                      <div className="app-shell-brand-texts">
                        <Typography.Title level={4} className="app-shell-brand-title">
                          {systemName}
                        </Typography.Title>
                        <Typography.Text className="app-shell-brand-subtitle">项目化内容管理后台</Typography.Text>
                      </div>
                    </div>
                  </div>
                ) : brand.logoUrl ? (
                  <img src={brand.logoUrl} alt={`${systemName} Logo`} className="app-shell-brand-logo" />
                ) : (
                  <div className="app-shell-brand-logo app-shell-brand-logo-fallback" aria-hidden="true">
                    {systemName.slice(0, 1)}
                  </div>
                )}
              </div>
            </div>

            <Menu
              mode="inline"
              inlineCollapsed={navigationCollapsed}
              selectedKeys={[location.pathname]}
              items={menuItems}
              className={`app-shell-menu ${navigationCollapsed ? 'is-collapsed' : ''}`}
              styles={
                navigationCollapsed
                  ? {
                      item: {
                        width: 56,
                        height: 56,
                        marginInline: 'auto',
                        paddingInline: 0,
                        justifyContent: 'center',
                        insetInlineStart: 'auto',
                      },
                      itemIcon: {
                        margin: 0,
                        fontSize: 22,
                        lineHeight: 1,
                      },
                      itemContent: {
                        width: 0,
                        opacity: 0,
                        overflow: 'hidden',
                      },
                    }
                  : undefined
              }
              style={{
                overflowY: 'auto',
              }}
            />

            {!compactNavigation ? (
              <div className={`app-shell-footer-controls ${navigationCollapsed ? 'is-collapsed' : ''}`}>
                <Button
                  type="text"
                  className="app-shell-collapse-trigger app-shell-collapse-trigger-inline"
                  aria-label={siderCollapsed ? '展开导航' : '收起导航'}
                  icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setSiderCollapsed((prev) => !prev)}
                />
              </div>
            ) : null}

            <div className={`app-shell-footer ${navigationCollapsed ? 'is-collapsed' : ''}`}>
              {state.projects.length > 0 ? (
                <Dropdown
                  trigger={['click']}
                  placement={navigationCollapsed ? 'topRight' : 'top'}
                  classNames={{ root: 'app-shell-project-menu' }}
                  menu={{
                    selectedKeys: state.activeProjectId ? [String(state.activeProjectId)] : [],
                    items: state.projects.map((project) => ({
                      key: String(project.id),
                      label: <span className="app-shell-project-menu-item-label">{project.name}</span>,
                    })),
                    onClick: ({ key }) => switchProject(Number(key)),
                  }}
                >
                  <Button
                    type="text"
                    className={`app-shell-project-dock ${navigationCollapsed ? 'is-collapsed' : ''}`}
                    aria-label="当前项目"
                  >
                    {!navigationCollapsed ? (
                      <>
                        <span className="app-shell-project-dock-body">
                          <span className="app-shell-project-dock-icon">
                            <FolderOpenOutlined />
                          </span>
                          <span className="app-shell-project-dock-copy">
                            <span className="app-shell-project-dock-label">当前项目</span>
                            <span className="app-shell-project-dock-name">{activeProject?.name ?? '请选择项目'}</span>
                          </span>
                        </span>
                        <DownOutlined className="app-shell-account-arrow app-shell-card-arrow" />
                      </>
                    ) : (
                      <span className="app-shell-project-dock-icon">
                        <FolderOpenOutlined />
                      </span>
                    )}
                  </Button>
                </Dropdown>
              ) : null}

              <Dropdown trigger={['click']} menu={accountMenu} placement={navigationCollapsed ? 'topRight' : 'top'}>
                <Button
                  type="text"
                  className={`app-shell-account ${navigationCollapsed ? 'is-collapsed' : ''}`}
                  aria-label={`${state.user?.username ?? '用户'} 账号菜单`}
                >
                  {!navigationCollapsed ? (
                    <>
                      <span className="app-shell-account-body">
                        <Avatar className="app-shell-account-avatar">
                          {state.user?.username?.slice(0, 1).toUpperCase() ?? 'U'}
                        </Avatar>
                        <span className="app-shell-account-copy">
                          <span className="app-shell-account-name">{state.user?.username ?? '未登录用户'}</span>
                          <span className="app-shell-account-meta">{platformRoleText}</span>
                          {state.activeProjectRole ? (
                            <span className="app-shell-account-meta">{projectRoleTextMap[state.activeProjectRole]}</span>
                          ) : null}
                        </span>
                      </span>
                      <DownOutlined className="app-shell-account-arrow app-shell-card-arrow" />
                    </>
                  ) : (
                    <Avatar className="app-shell-account-avatar">
                      {state.user?.username?.slice(0, 1).toUpperCase() ?? 'U'}
                    </Avatar>
                  )}
                </Button>
              </Dropdown>
            </div>
          </div>
        </Sider>

        <Layout className="app-shell-main">
          <Content className="app-shell-content">
            <div key={contentKey}>{children}</div>
          </Content>
        </Layout>
      </Layout>
      <PasswordChangeModal
        open={passwordModalOpen}
        confirmLoading={updatingPassword}
        onCancel={() => {
          setPasswordModalOpen(false)
        }}
        onSubmit={handleChangePassword}
      />
    </>
  )
}
