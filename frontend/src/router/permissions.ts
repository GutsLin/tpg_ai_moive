import type { AuthUser } from '../api/auth'

export const noAccessRoute = '/no-access'

export const routePermMap = {
  '/assets': 'assets',
  '/videos': 'videos',
  '/analytics': 'analytics',
  '/projects': 'projects',
  '/users': 'users',
  '/logs': 'logs',
  '/config': 'config',
  // Infinite Atelier is available to every authenticated user. Project access
  // and canvas ownership are enforced by the project context and API layers.
  '/infinite-atelier': null,
} as const

const routeOrder = ['/assets', '/infinite-atelier', '/videos', '/analytics', '/projects', '/users', '/logs', '/config'] as const
const adminOnlyRoutes = new Set<string>(['/projects', '/users', '/logs', '/config'])
const projectScopedRoutes = new Set<string>(['/assets', '/infinite-atelier', '/videos', '/analytics', '/logs'])

export const isAdminOnlyRoute = (route: string) => adminOnlyRoutes.has(route)
export const isProjectScopedRoute = (route: string) => projectScopedRoutes.has(route)

export const getDefaultRouteForUser = (user: AuthUser | null | undefined) => {
  if (!user) {
    return '/login'
  }

  const allowedRoute = routeOrder.find((route) => {
    const requiredPerm = routePermMap[route]
    const hasPerm = requiredPerm === null || user.menuPerms.includes(requiredPerm)
    if (!hasPerm) {
      return false
    }

    if (isAdminOnlyRoute(route)) {
      return user.role === 'admin'
    }

    return true
  })
  return allowedRoute ?? noAccessRoute
}
