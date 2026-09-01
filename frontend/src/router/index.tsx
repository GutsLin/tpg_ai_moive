import { Alert, Button, Card, Spin, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'

import { getSetupStatus, type SetupStatus } from '../api/setup'
import { AppLayout } from '../components/Layout/AppLayout'
import { AnalyticsPage } from '../pages/Analytics'
import { AssetsPage } from '../pages/Assets'
import { ConfigPage } from '../pages/Config'
import { LoginPage } from '../pages/Login'
import { LogsPage } from '../pages/Logs'
import { NoAccessPage } from '../pages/NoAccess'
import { NoProjectPage } from '../pages/NoProject'
import { NotFoundPage } from '../pages/NotFound'
import { ProjectsPage } from '../pages/Projects'
import { SetupPage } from '../pages/Setup'
import { SetupHelpPage } from '../pages/SetupHelp'
import { UsersPage } from '../pages/Users'
import { VideosPage } from '../pages/Videos'
import { InfiniteAtelierPage } from '../pages/InfiniteAtelier'
import { useBrand } from '../stores/brand'
import { resolveSystemName } from '../utils/branding'
import { getDefaultRouteForUser, isAdminOnlyRoute, isProjectScopedRoute, noAccessRoute, routePermMap } from './permissions'
import { useAuth } from '../stores/auth'

const ProtectedRoute = ({
  path,
  brandingName,
  children,
}: {
  path?: keyof typeof routePermMap
  brandingName: string
  children: React.ReactNode
}) => {
  const { state } = useAuth()

  if (!state.hydrated) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!state.token || !state.user) {
    return <Navigate to="/login" replace />
  }

  if (path && isAdminOnlyRoute(path) && state.user.role !== 'admin') {
    return <NotFoundPage />
  }

  if (
    path &&
    state.projectScoped &&
    isProjectScopedRoute(path) &&
    (state.projects.length === 0 || state.activeProjectId === null)
  ) {
    return (
      <AppLayout brandingName={brandingName} contentKey="no-project">
        <NoProjectPage />
      </AppLayout>
    )
  }

  const requiredPerm = path ? routePermMap[path] : null
  const hasPermission = requiredPerm === null || state.user.menuPerms.includes(requiredPerm)

  if (!hasPermission) {
    return <NotFoundPage />
  }

  return (
    <AppLayout brandingName={brandingName} contentKey={`${path}-${state.projectRefreshToken}`}>
      {children}
    </AppLayout>
  )
}

const FullscreenSpinner = () => (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
    <Spin size="large" />
  </div>
)

const FullscreenSetupError = ({
  brandingName,
  message,
  retrying,
  onRetry,
}: {
  brandingName: string
  message: string
  retrying: boolean
  onRetry: () => void
}) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      background:
        'radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 26%), linear-gradient(160deg, #f7f4ee 0%, #ebe5d8 100%)',
    }}
  >
    <Card
      style={{
        width: 'min(100%, 520px)',
        borderRadius: 24,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        boxShadow: '0 24px 60px rgba(15, 23, 42, 0.10)',
      }}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <Typography.Title level={3} style={{ marginBottom: 8 }}>
            无法获取 {brandingName} 安装状态
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            安装向导需要先确认当前实例是否已初始化。请检查后端服务与 API 地址后重新尝试。
          </Typography.Paragraph>
          </div>
        <Alert type="error" showIcon title={message} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" loading={retrying} onClick={onRetry}>
            重新检查
          </Button>
        </div>
      </div>
    </Card>
  </div>
)

const AppRoutes = () => {
  const { state: brand } = useBrand()
  const [setupState, setSetupState] = useState<{
    hydrated: boolean
    status: SetupStatus | null
    error: string | null
  }>({
    hydrated: false,
    status: null,
    error: null,
  })

  const refreshSetupStatus = async () => {
    const nextStatus = await getSetupStatus()
    setSetupState({
      hydrated: true,
      status: nextStatus,
      error: null,
    })
    return nextStatus
  }

  const loadSetupStatus = async () => {
    setSetupState((current) => ({
      ...current,
      hydrated: false,
      error: null,
    }))

    try {
      await refreshSetupStatus()
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : `${brand.systemName} 安装态探测失败`
      setSetupState({
        hydrated: true,
        status: null,
        error: nextMessage,
      })
    }
  }

  useEffect(() => {
    void loadSetupStatus()
  }, [brand.systemName])

  if (!setupState.hydrated) {
    return <FullscreenSpinner />
  }

  if (setupState.error) {
    return (
      <FullscreenSetupError
        brandingName={resolveSystemName(brand.systemName)}
        message={setupState.error}
        retrying={!setupState.hydrated}
        onRetry={() => {
          void loadSetupStatus()
        }}
      />
    )
  }

  if (!setupState.status) {
    return <FullscreenSpinner />
  }

  const brandingName = resolveSystemName(setupState.status.branding?.systemName ?? brand.systemName)

  const ensureInitialized = (element: React.ReactNode) => {
    if (!setupState.status?.initialized) {
      return <Navigate to="/setup" replace />
    }

    return element
  }

  return (
    <Routes>
      <Route path="/setup/help/configuration" element={<SetupHelpPage />} />
      <Route
        path="/setup"
        element={
          setupState.status.initialized ? (
            <Navigate to="/login" replace />
          ) : (
            <SetupPage status={setupState.status} refreshStatus={refreshSetupStatus} />
          )
        }
      />
      <Route path="/login" element={ensureInitialized(<LoginPage brandingName={brandingName} />)} />
      <Route
        path={noAccessRoute}
        element={ensureInitialized(
          <ProtectedRoute brandingName={brandingName}>
            <NoAccessPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/assets"
        element={ensureInitialized(
          <ProtectedRoute path="/assets" brandingName={brandingName}>
            <AssetsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/videos"
        element={ensureInitialized(
          <ProtectedRoute path="/videos" brandingName={brandingName}>
            <VideosPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/infinite-atelier/*"
        element={ensureInitialized(
          <ProtectedRoute path="/infinite-atelier" brandingName={brandingName}>
            <InfiniteAtelierPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/analytics"
        element={ensureInitialized(
          <ProtectedRoute path="/analytics" brandingName={brandingName}>
            <AnalyticsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/logs"
        element={ensureInitialized(
          <ProtectedRoute path="/logs" brandingName={brandingName}>
            <LogsPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/config"
        element={ensureInitialized(
          <ProtectedRoute path="/config" brandingName={brandingName}>
            <ConfigPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/users"
        element={ensureInitialized(
          <ProtectedRoute path="/users" brandingName={brandingName}>
            <UsersPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/projects"
        element={ensureInitialized(
          <ProtectedRoute path="/projects" brandingName={brandingName}>
            <ProjectsPage />
          </ProtectedRoute>
        )}
      />
      <Route path="/" element={ensureInitialized(<NavigateToDefault />)} />
      <Route
        path="*"
        element={setupState.status.initialized ? <NotFoundPage /> : <Navigate to="/setup" replace />}
      />
    </Routes>
  )
}

const NavigateToDefault = () => {
  const { state } = useAuth()

  if (!state.hydrated) {
    return <FullscreenSpinner />
  }

  return <Navigate to={getDefaultRouteForUser(state.user)} replace />
}

export const AppRouter = ({ initialEntries }: { initialEntries?: string[] }) => {
  if (initialEntries) {
    return (
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    )
  }

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
