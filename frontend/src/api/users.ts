import request from '../utils/request'
import type { ProjectRole, ProjectStatus } from './projects'

export interface UserItem {
  id: number
  username: string
  role: 'admin' | 'user'
  menuPerms: string[]
  status: number
  projects: UserProjectAccess[]
  createdAt: string
  updatedAt: string
}

export interface UserProjectAccess {
  id: number
  name: string
  code: string
  status: ProjectStatus
  projectRole: ProjectRole
}

export interface UsersListResponse {
  items: UserItem[]
  total: number
  page: number
  pageSize: number
}

export const getUsers = async (params: { page: number; pageSize: number; status?: number }) => {
  const response = await request.get<UsersListResponse>('/api/users', { params })
  return response.data
}

export interface CreateUserPayload {
  username: string
  password: string
  role: 'admin' | 'user'
  menuPerms: string[]
  projects: Array<{
    projectId: number
    projectRole: ProjectRole
  }>
}

export const createUser = async (payload: CreateUserPayload) => {
  const response = await request.post<UserItem>('/api/users', payload)
  return response.data
}

export interface UpdateUserPayload {
  role?: 'admin' | 'user'
  menuPerms?: string[]
  status?: number
  password?: string
  projects?: Array<{
    projectId: number
    projectRole: ProjectRole
  }>
}

export const updateUser = async (id: number, payload: UpdateUserPayload) => {
  const response = await request.patch<UserItem>(`/api/users/${id}`, payload)
  return response.data
}

export const deleteUser = async (id: number) => {
  const response = await request.delete<UserItem>(`/api/users/${id}`)
  return response.data
}
