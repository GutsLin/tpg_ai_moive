import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type PropsWithChildren,
} from 'react'

import { getAuthSession, type AuthUser, type LoginResponse, type ProjectRole, type UserProject } from '../api/auth'
import { clearAllVideoDrafts } from '../utils/video-draft-storage'

export const AUTH_STORAGE_KEYS = {
  token: 'token',
  user: 'auth-user',
  projects: 'auth-projects',
  activeProjectId: 'active-project-id',
  activeProjectRole: 'active-project-role',
} as const

const AUTH_CACHE_MIGRATION_KEYS = {
  adminLogsPermission: 'auth-cache-migration-20260818-admin-logs',
} as const

interface AuthState {
  token: string | null
  user: AuthUser | null
  projectScoped: boolean
  projects: UserProject[]
  activeProjectId: number | null
  activeProjectRole: ProjectRole | null
  projectRefreshToken: number
  hydrated: boolean
}

type AuthAction =
  | {
      type: 'hydrate'
      payload: {
        token: string | null
        user: AuthUser | null
        projectScoped: boolean
        projects: UserProject[]
        activeProjectId: number | null
        activeProjectRole: ProjectRole | null
      }
    }
  | {
      type: 'login'
      payload: {
        token: string
        user: AuthUser
        projectScoped: boolean
        projects: UserProject[]
        activeProjectId: number | null
        activeProjectRole: ProjectRole | null
      }
    }
  | { type: 'set-active-project'; payload: { activeProjectId: number; activeProjectRole: ProjectRole | null } }
  | { type: 'logout' }

interface AuthContextValue {
  state: AuthState
  login: (payload: LoginResponse) => void
  refreshSession: () => Promise<void>
  logout: () => void
  switchProject: (projectId: number) => void
}

const initialState: AuthState = {
  token: null,
  user: null,
  projectScoped: false,
  projects: [],
  activeProjectId: null,
  activeProjectRole: null,
  projectRefreshToken: 0,
  hydrated: false,
}

const AuthContext = createContext<AuthContextValue | null>(null)

const parseNumber = (value: string | null): number | null => {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const parseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const migrateCachedAdminLogsPermission = (user: AuthUser | null): AuthUser | null => {
  if (
    !user ||
    user.role !== 'admin' ||
    localStorage.getItem(AUTH_CACHE_MIGRATION_KEYS.adminLogsPermission) === 'true'
  ) {
    return user
  }

  localStorage.setItem(AUTH_CACHE_MIGRATION_KEYS.adminLogsPermission, 'true')
  if (user.menuPerms.includes('logs')) {
    return user
  }

  const migratedUser = {
    ...user,
    menuPerms: [...user.menuPerms, 'logs'],
  }
  localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(migratedUser))
  return migratedUser
}

const resolveProjectContext = (projects: UserProject[], preferredProjectId: number | null) => {
  if (projects.length === 0) {
    return { activeProjectId: null, activeProjectRole: null }
  }
  const selected = projects.find((project) => project.id === preferredProjectId) ?? projects[0]
  return {
    activeProjectId: selected.id,
    activeProjectRole: selected.projectRole,
  }
}

const reducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'hydrate':
      return {
        token: action.payload.token,
        user: action.payload.user,
        projectScoped: action.payload.projectScoped,
        projects: action.payload.projects,
        activeProjectId: action.payload.activeProjectId,
        activeProjectRole: action.payload.activeProjectRole,
        projectRefreshToken: 0,
        hydrated: true,
      }
    case 'login':
      return {
        token: action.payload.token,
        user: action.payload.user,
        projectScoped: action.payload.projectScoped,
        projects: action.payload.projects,
        activeProjectId: action.payload.activeProjectId,
        activeProjectRole: action.payload.activeProjectRole,
        projectRefreshToken: 0,
        hydrated: true,
      }
    case 'set-active-project':
      return {
        ...state,
        activeProjectId: action.payload.activeProjectId,
        activeProjectRole: action.payload.activeProjectRole,
        projectRefreshToken: state.projectRefreshToken + 1,
      }
    case 'logout':
      return {
        token: null,
        user: null,
        projectScoped: false,
        projects: [],
        activeProjectId: null,
        activeProjectRole: null,
        projectRefreshToken: 0,
        hydrated: true,
      }
    default:
      return state
  }
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.token)
    const user = migrateCachedAdminLogsPermission(
      parseJson<AuthUser | null>(localStorage.getItem(AUTH_STORAGE_KEYS.user), null)
    )
    const rawProjects = localStorage.getItem(AUTH_STORAGE_KEYS.projects)
    const projectScoped = rawProjects !== null
    const projects = parseJson<UserProject[]>(rawProjects, [])
    const preferredProjectId = parseNumber(localStorage.getItem(AUTH_STORAGE_KEYS.activeProjectId))
    const projectContext = resolveProjectContext(projects, preferredProjectId)

    dispatch({
      type: 'hydrate',
      payload: {
        token,
        user,
        projectScoped,
        projects,
        activeProjectId: projectContext.activeProjectId,
        activeProjectRole: projectContext.activeProjectRole,
      },
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      refreshSession: async () => {
        if (!state.token) {
          return
        }

        const payload = await getAuthSession()
        const projects = payload.projects ?? []
        const preferredProjectId = parseNumber(localStorage.getItem(AUTH_STORAGE_KEYS.activeProjectId))
        const projectContext = resolveProjectContext(projects, preferredProjectId ?? payload.activeProjectId ?? null)

        localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(payload.user))
        localStorage.setItem(AUTH_CACHE_MIGRATION_KEYS.adminLogsPermission, 'true')
        localStorage.setItem(AUTH_STORAGE_KEYS.projects, JSON.stringify(projects))
        if (projectContext.activeProjectId === null) {
          localStorage.removeItem(AUTH_STORAGE_KEYS.activeProjectId)
          localStorage.removeItem(AUTH_STORAGE_KEYS.activeProjectRole)
        } else {
          localStorage.setItem(AUTH_STORAGE_KEYS.activeProjectId, String(projectContext.activeProjectId))
          localStorage.setItem(AUTH_STORAGE_KEYS.activeProjectRole, projectContext.activeProjectRole ?? '')
        }

        dispatch({
          type: 'login',
          payload: {
            token: state.token,
            user: payload.user,
            projectScoped: true,
            projects,
            activeProjectId: projectContext.activeProjectId,
            activeProjectRole: projectContext.activeProjectRole,
          },
        })
      },
      login: (payload) => {
        const projects = payload.projects ?? []
        const activeProjectId = payload.activeProjectId ?? null
        const projectContext = resolveProjectContext(projects, activeProjectId)
        localStorage.setItem(AUTH_STORAGE_KEYS.token, payload.token)
        localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(payload.user))
        localStorage.setItem(AUTH_CACHE_MIGRATION_KEYS.adminLogsPermission, 'true')
        localStorage.setItem(AUTH_STORAGE_KEYS.projects, JSON.stringify(projects))
        if (projectContext.activeProjectId === null) {
          localStorage.removeItem(AUTH_STORAGE_KEYS.activeProjectId)
          localStorage.removeItem(AUTH_STORAGE_KEYS.activeProjectRole)
        } else {
          localStorage.setItem(AUTH_STORAGE_KEYS.activeProjectId, String(projectContext.activeProjectId))
          localStorage.setItem(AUTH_STORAGE_KEYS.activeProjectRole, projectContext.activeProjectRole ?? '')
        }
        dispatch({
          type: 'login',
          payload: {
            token: payload.token,
            user: payload.user,
            projectScoped: true,
            projects,
            activeProjectId: projectContext.activeProjectId,
            activeProjectRole: projectContext.activeProjectRole,
          },
        })
      },
      switchProject: (projectId) => {
        const project = state.projects.find((item) => item.id === projectId)
        if (!project || state.activeProjectId === projectId) {
          return
        }
        localStorage.setItem(AUTH_STORAGE_KEYS.activeProjectId, String(project.id))
        localStorage.setItem(AUTH_STORAGE_KEYS.activeProjectRole, project.projectRole)
        dispatch({
          type: 'set-active-project',
          payload: {
            activeProjectId: project.id,
            activeProjectRole: project.projectRole,
          },
        })
      },
      logout: () => {
        localStorage.removeItem(AUTH_STORAGE_KEYS.token)
        localStorage.removeItem(AUTH_STORAGE_KEYS.user)
        localStorage.removeItem(AUTH_STORAGE_KEYS.projects)
        localStorage.removeItem(AUTH_STORAGE_KEYS.activeProjectId)
        localStorage.removeItem(AUTH_STORAGE_KEYS.activeProjectRole)
        clearAllVideoDrafts()
        dispatch({ type: 'logout' })
      },
    }),
    [state]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }

  return context
}
