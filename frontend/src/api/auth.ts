import request from '../utils/request'

export interface AuthUser {
  id: number
  username: string
  role: 'admin' | 'user'
  menuPerms: string[]
  status: number
}

export type ProjectRole = 'manager' | 'member' | 'viewer'

export interface UserProject {
  id: number
  name: string
  code: string
  status: 'active' | 'archived'
  projectRole: ProjectRole
}

export interface LoginResponse {
  token: string
  user: AuthUser
  projects: UserProject[]
  activeProjectId: number | null
}

export interface SessionResponse {
  user: AuthUser
  projects: UserProject[]
  activeProjectId: number | null
}

export const login = async (payload: { username: string; password: string }): Promise<LoginResponse> => {
  const response = await request.post<LoginResponse>('/api/auth/login', payload)
  return response.data
}

export const logout = async (): Promise<void> => {
  await request.post('/api/auth/logout')
}

export const getAuthSession = async (): Promise<SessionResponse> => {
  const response = await request.get<SessionResponse>('/api/auth/session')
  return response.data
}

export const changePassword = async (payload: {
  currentPassword: string
  newPassword: string
}): Promise<void> => {
  await request.patch('/api/auth/password', payload)
}
