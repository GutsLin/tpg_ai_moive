import axios from 'axios'

export interface ApiEnvelope<T> {
  code: number
  data: T
  message: string
}

const STORAGE_KEYS = {
  token: 'token',
  user: 'auth-user',
  projects: 'auth-projects',
  activeProjectId: 'active-project-id',
  activeProjectRole: 'active-project-role',
} as const

interface UnauthorizedRedirectCheckInput {
  response?: {
    status?: number
  }
  config?: {
    url?: string
  }
}

const PLACEHOLDER_API_BASE_URLS = new Set([
  'https://api.your-domain.com',
  'http://api.your-domain.com',
])

export const resolveApiBaseUrl = (rawBaseUrl?: string): string => {
  const trimmedBaseUrl = rawBaseUrl?.trim() ?? ''

  if (!trimmedBaseUrl) {
    return ''
  }

  const normalizedBaseUrl = trimmedBaseUrl.replace(/\/+$/, '')

  if (!normalizedBaseUrl || PLACEHOLDER_API_BASE_URLS.has(normalizedBaseUrl)) {
    return ''
  }

  if (normalizedBaseUrl === '/api') {
    return ''
  }

  return normalizedBaseUrl.replace(/\/api$/, '')
}

const request = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  timeout: 30000,
})

const normalizeRequestPath = (url?: string): string => {
  if (!url) {
    return ''
  }

  try {
    return new URL(url, window.location.origin).pathname
  } catch {
    return url.split('?')[0] ?? url
  }
}

export const shouldRedirectToLoginOnUnauthorized = (error: UnauthorizedRedirectCheckInput): boolean => {
  if (error.response?.status !== 401) {
    return false
  }

  if (normalizeRequestPath(error.config?.url) === '/api/auth/login') {
    return false
  }

  if (window.location.pathname === '/login') {
    return false
  }

  return true
}

// 请求拦截器：自动带上 JWT Token
request.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEYS.token)
  const activeProjectId = localStorage.getItem(STORAGE_KEYS.activeProjectId)
  const headers = config.headers ?? {}

  if (token) {
    ;(headers as Record<string, string>).Authorization = `Bearer ${token}`
  }
  if (activeProjectId) {
    ;(headers as Record<string, string>)['X-Project-Id'] = activeProjectId
  }

  config.headers = headers
  return config
})

// 响应拦截器：统一错误处理
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (shouldRedirectToLoginOnUnauthorized(error)) {
      localStorage.removeItem(STORAGE_KEYS.token)
      localStorage.removeItem(STORAGE_KEYS.user)
      localStorage.removeItem(STORAGE_KEYS.projects)
      localStorage.removeItem(STORAGE_KEYS.activeProjectId)
      localStorage.removeItem(STORAGE_KEYS.activeProjectRole)
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default request
