import request from '../utils/request'

export type ProjectStatus = 'active' | 'archived'
export type ProjectRole = 'manager' | 'member' | 'viewer'

export interface ProjectItem {
  id: number
  name: string
  code: string
  status: ProjectStatus
  description: string | null
  coverAssetId: number | null
  createdBy: number | null
  createdAt: string
  updatedAt: string
  memberCount: number
  assetCount: number
  taskCount: number
}

export interface ProjectListResponse {
  items: ProjectItem[]
}

export interface ProjectMemberItem {
  projectId: number
  userId: number
  username: string
  projectRole: ProjectRole
  status: 'active' | 'inactive'
}

export interface ProjectMembersResponse {
  items: ProjectMemberItem[]
}

export interface CreateProjectPayload {
  name: string
  description?: string | null
  coverAssetId?: number | null
}

export interface UpdateProjectPayload {
  name?: string
  description?: string | null
  coverAssetId?: number | null
}

export interface ReplaceProjectMembersPayload {
  members: Array<{
    userId: number
    projectRole: ProjectRole
  }>
}

export const getProjects = async (): Promise<ProjectListResponse> => {
  const response = await request.get<ProjectListResponse>('/api/projects')
  return response.data
}

export const createProject = async (payload: CreateProjectPayload): Promise<ProjectItem> => {
  const response = await request.post<ProjectItem>('/api/projects', payload)
  return response.data
}

export const updateProject = async (id: number, payload: UpdateProjectPayload): Promise<ProjectItem> => {
  const response = await request.patch<ProjectItem>(`/api/projects/${id}`, payload)
  return response.data
}

export const archiveProject = async (id: number): Promise<ProjectItem> => {
  const response = await request.delete<ProjectItem>(`/api/projects/${id}`)
  return response.data
}

export const getProjectMembers = async (projectId: number): Promise<ProjectMembersResponse> => {
  const response = await request.get<ProjectMembersResponse>(`/api/projects/${projectId}/members`)
  return response.data
}

export const replaceProjectMembers = async (
  projectId: number,
  payload: ReplaceProjectMembersPayload
): Promise<ProjectMembersResponse> => {
  const response = await request.put<ProjectMembersResponse>(`/api/projects/${projectId}/members`, payload)
  return response.data
}
