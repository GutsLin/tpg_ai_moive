import { ConfigProvider } from 'antd'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../../stores/auth'
import { ProjectsPage } from '.'
import { getUsers } from '../../api/users'

vi.mock('../../api/projects', () => ({
  getProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  getProjectMembers: vi.fn(),
  replaceProjectMembers: vi.fn(),
}))

vi.mock('../../api/users', () => ({
  getUsers: vi.fn(),
}))

const renderProjectsPage = () =>
  render(
    <ConfigProvider>
      <AuthProvider>
        <ProjectsPage />
      </AuthProvider>
    </ConfigProvider>
  )

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    localStorage.setItem('token', 'admin-token')
    localStorage.setItem(
      'auth-user',
      JSON.stringify({
        id: 1,
        username: 'admin',
        role: 'admin',
        menuPerms: ['assets', 'videos', 'users', 'projects', 'config'],
        status: 1,
      })
    )
  })

  it('管理员可以创建项目', async () => {
    const { getProjects, createProject } = await import('../../api/projects')

    vi.mocked(getProjects).mockResolvedValue({
      items: [],
    })
    vi.mocked(createProject).mockResolvedValue({
      id: 1,
      name: '广告企划',
      code: 'PRJ-202604-000001',
      status: 'active',
      description: null,
      coverAssetId: null,
      createdBy: 1,
      memberCount: 0,
      assetCount: 0,
      taskCount: 0,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    })

    renderProjectsPage()

    await userEvent.click(await screen.findByRole('button', { name: '新建项目' }))
    await userEvent.type(screen.getByLabelText('项目名称'), '广告企划')
    await userEvent.click(screen.getByRole('button', { name: '保存项目' }))

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: '广告企划',
        description: null,
      })
    })
  })

  it('管理员可以编辑并归档项目', async () => {
    const { getProjects, updateProject, archiveProject } = await import('../../api/projects')

    vi.mocked(getProjects).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '广告企划',
          code: 'PRJ-202604-000001',
          status: 'active',
          description: '初始描述',
          coverAssetId: null,
          createdBy: 1,
          memberCount: 0,
          assetCount: 0,
          taskCount: 0,
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
    })
    vi.mocked(updateProject).mockResolvedValue({
      id: 1,
      name: '广告企划2',
      code: 'PRJ-202604-000001',
      status: 'active',
      description: '更新描述',
      coverAssetId: null,
      createdBy: 1,
      memberCount: 0,
      assetCount: 0,
      taskCount: 0,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:10:00.000Z',
    })
    vi.mocked(archiveProject).mockResolvedValue({
      id: 1,
      name: '广告企划2',
      code: 'PRJ-202604-000001',
      status: 'archived',
      description: '更新描述',
      coverAssetId: null,
      createdBy: 1,
      memberCount: 0,
      assetCount: 0,
      taskCount: 0,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:20:00.000Z',
    })

    renderProjectsPage()

    await screen.findByText('广告企划')
    await userEvent.click(screen.getByRole('button', { name: '编辑项目' }))
    await userEvent.clear(screen.getByLabelText('项目名称'))
    await userEvent.type(screen.getByLabelText('项目名称'), '广告企划2')
    await userEvent.click(screen.getByRole('button', { name: '保存项目' }))

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith(1, {
        name: '广告企划2',
        description: '初始描述',
      })
    })

    await userEvent.click(screen.getByRole('button', { name: '归档项目' }))
    await userEvent.click(screen.getByRole('button', { name: '确认归档' }))

    await waitFor(() => {
      expect(archiveProject).toHaveBeenCalledWith(1)
    })
  })

  it('成员设置中展示用户名，并可保存当前成员设置', async () => {
    const { getProjects, getProjectMembers, replaceProjectMembers } = await import('../../api/projects')

    vi.mocked(getProjects).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '广告企划',
          code: 'PRJ-202604-000001',
          status: 'active',
          description: '初始描述',
          coverAssetId: null,
          createdBy: 1,
          memberCount: 1,
          assetCount: 0,
          taskCount: 0,
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
    })
    vi.mocked(getProjectMembers).mockResolvedValue({
      items: [
        {
          projectId: 1,
          userId: 2,
          username: 'operator',
          projectRole: 'manager',
          status: 'active',
        },
      ],
    })
    vi.mocked(getUsers).mockResolvedValue({
      items: [
        {
          id: 2,
          username: 'operator',
          role: 'user',
          menuPerms: ['assets', 'videos'],
          status: 1,
          projects: [],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    })
    vi.mocked(replaceProjectMembers).mockResolvedValue({
      items: [
        {
          projectId: 1,
          userId: 2,
          username: 'operator',
          projectRole: 'manager',
          status: 'active',
        },
      ],
    })

    renderProjectsPage()

    await screen.findByText('广告企划')
    await userEvent.click(screen.getByRole('button', { name: '成员设置' }))

    expect(await screen.findByText('operator')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '保存成员' }))

    await waitFor(() => {
      expect(replaceProjectMembers).toHaveBeenCalledWith(1, {
        members: [
          {
            userId: 2,
            projectRole: 'manager',
          },
        ],
      })
    })
  })

  it('成员用户不在启用用户列表中时，成员设置仍展示接口返回的用户名', async () => {
    const { getProjects, getProjectMembers } = await import('../../api/projects')

    vi.mocked(getProjects).mockResolvedValue({
      items: [
        {
          id: 1,
          name: '广告企划',
          code: 'PRJ-202604-000001',
          status: 'active',
          description: '初始描述',
          coverAssetId: null,
          createdBy: 1,
          memberCount: 1,
          assetCount: 0,
          taskCount: 0,
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
    })
    vi.mocked(getProjectMembers).mockResolvedValue({
      items: [
        {
          projectId: 1,
          userId: 9,
          username: 'archived-user',
          projectRole: 'viewer',
          status: 'inactive',
        },
      ],
    })
    vi.mocked(getUsers).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    })

    renderProjectsPage()

    await screen.findByText('广告企划')
    await userEvent.click(screen.getByRole('button', { name: '成员设置' }))

    expect(await screen.findByText('archived-user')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('9')).not.toBeInTheDocument()
  })
})
