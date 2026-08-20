import { ConfigProvider } from 'antd'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../../stores/auth'
import { UsersPage } from '.'

vi.mock('../../api/users', () => ({
  getUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}))

vi.mock('../../api/projects', () => ({
  getProjects: vi.fn(),
  createProject: vi.fn(),
  getProjectMembers: vi.fn(),
  replaceProjectMembers: vi.fn(),
}))

const renderUsersPage = () =>
  render(
    <ConfigProvider>
      <AuthProvider>
        <UsersPage />
      </AuthProvider>
    </ConfigProvider>
  )

const selectOption = async (target: HTMLElement, optionName: string) => {
  const selector = target.closest('.ant-select')?.querySelector('.ant-select-selector')

  fireEvent.mouseDown((selector ?? target) as HTMLElement)
  await userEvent.click(await screen.findByText(optionName))
}

const setAdminUser = () => {
  localStorage.setItem('token', 'admin-token')
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
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    setAdminUser()
  })

  it('管理员可以打开新建用户弹窗并提交创建', async () => {
    const { getUsers, createUser } = await import('../../api/users')
    const { getProjects } = await import('../../api/projects')

    vi.mocked(getUsers)
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            username: 'admin',
            role: 'admin',
            menuPerms: ['assets', 'videos', 'users', 'config'],
            status: 1,
            projects: [],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      })
      .mockResolvedValue({
        items: [
          {
            id: 1,
            username: 'admin',
            role: 'admin',
            menuPerms: ['assets', 'videos', 'users', 'config'],
            status: 1,
            projects: [],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
          {
            id: 2,
            username: 'producer',
            role: 'user',
            menuPerms: ['assets'],
            status: 1,
            projects: [
              {
                id: 101,
                name: '都市逆袭',
                code: 'urban-rise',
                status: 'active',
                projectRole: 'member',
              },
            ],
            createdAt: '2026-04-04T00:10:00.000Z',
            updatedAt: '2026-04-04T00:10:00.000Z',
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      })
    vi.mocked(getProjects).mockResolvedValue({
      items: [{ id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', description: null, coverAssetId: null, createdBy: 1, createdAt: '2026-04-04T00:00:00.000Z', updatedAt: '2026-04-04T00:00:00.000Z', memberCount: 1, assetCount: 3, taskCount: 2 }],
    })
    vi.mocked(createUser).mockResolvedValue({
      id: 2,
      username: 'producer',
      role: 'user',
      menuPerms: ['assets'],
      status: 1,
      projects: [
        {
          id: 101,
          name: '都市逆袭',
          code: 'urban-rise',
          status: 'active',
          projectRole: 'member',
        },
      ],
      createdAt: '2026-04-04T00:10:00.000Z',
      updatedAt: '2026-04-04T00:10:00.000Z',
    })

    renderUsersPage()

    await screen.findByText('admin')
    await userEvent.click(screen.getByRole('button', { name: '新建用户' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('用户名'), { target: { value: 'producer' } })
    fireEvent.change(within(dialog).getByLabelText('初始密码'), { target: { value: 'pass12345' } })
    await userEvent.click(within(dialog).getByRole('button', { name: '新增项目授权' }))
    await selectOption(within(dialog).getByLabelText('项目-1'), '都市逆袭 (urban-rise)')
    await userEvent.click(within(dialog).getByRole('button', { name: '创建用户' }))

    await waitFor(() => {
      expect(createUser).toHaveBeenCalledWith({
        username: 'producer',
        password: 'pass12345',
        role: 'user',
        menuPerms: ['assets', 'videos'],
        projects: [
          {
            projectId: 101,
            projectRole: 'member',
          },
        ],
      })
    })

    expect(await screen.findByText('都市逆袭 / member')).toBeInTheDocument()
  })

  it('管理员可以打开编辑用户弹窗并提交修改', async () => {
    const { getUsers, updateUser } = await import('../../api/users')
    const { getProjects } = await import('../../api/projects')

    vi.mocked(getUsers)
      .mockResolvedValueOnce({
        items: [
          {
            id: 2,
            username: 'operator',
            role: 'user',
            menuPerms: ['assets'],
            status: 1,
            projects: [
              {
                id: 101,
                name: '都市逆袭',
                code: 'urban-rise',
                status: 'active',
                projectRole: 'manager',
              },
            ],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      })
      .mockResolvedValue({
        items: [
          {
            id: 2,
            username: 'operator',
            role: 'user',
            menuPerms: ['assets', 'videos'],
            status: 1,
            projects: [
              {
                id: 101,
                name: '都市逆袭',
                code: 'urban-rise',
                status: 'active',
                projectRole: 'manager',
              },
            ],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:20:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      })
    vi.mocked(getProjects).mockResolvedValue({
      items: [{ id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', description: null, coverAssetId: null, createdBy: 1, createdAt: '2026-04-04T00:00:00.000Z', updatedAt: '2026-04-04T00:00:00.000Z', memberCount: 1, assetCount: 3, taskCount: 2 }],
    })
    vi.mocked(updateUser).mockResolvedValue({
      id: 2,
      username: 'operator',
      role: 'user',
      menuPerms: ['assets', 'videos'],
      status: 1,
      projects: [
        {
          id: 101,
          name: '都市逆袭',
          code: 'urban-rise',
          status: 'active',
          projectRole: 'manager',
        },
      ],
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:20:00.000Z',
    })

    renderUsersPage()

    await screen.findByText('operator')
    await userEvent.click(screen.getByRole('button', { name: /编\s*辑/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('重置密码'), { target: { value: 'pass67890' } })
    await userEvent.click(within(dialog).getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
        expect(updateUser).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          role: 'user',
          menuPerms: ['assets', 'videos'],
          status: 1,
          password: 'pass67890',
          projects: [
            {
              projectId: 101,
              projectRole: 'manager',
            },
          ],
        })
      )
    })

    expect(await screen.findByText('都市逆袭 / manager')).toBeInTheDocument()
    expect(screen.queryByText('未授权项目')).not.toBeInTheDocument()
  })

  it('编辑用户时新增项目授权会保留原有项目', async () => {
    const { getUsers, updateUser } = await import('../../api/users')
    const { getProjects } = await import('../../api/projects')

    vi.mocked(getUsers)
      .mockResolvedValueOnce({
        items: [
          {
            id: 2,
            username: 'operator',
            role: 'user',
            menuPerms: ['assets', 'videos'],
            status: 1,
            projects: [
              {
                id: 101,
                name: '都市逆袭',
                code: 'urban-rise',
                status: 'active',
                projectRole: 'manager',
              },
            ],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      })
      .mockResolvedValue({
        items: [
          {
            id: 2,
            username: 'operator',
            role: 'user',
            menuPerms: ['assets', 'videos'],
            status: 1,
            projects: [
              {
                id: 101,
                name: '都市逆袭',
                code: 'urban-rise',
                status: 'active',
                projectRole: 'manager',
              },
              {
                id: 202,
                name: '星际探险',
                code: 'space-quest',
                status: 'active',
                projectRole: 'viewer',
              },
            ],
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:20:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      })
    vi.mocked(getProjects).mockResolvedValue({
      items: [
        { id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', description: null, coverAssetId: null, createdBy: 1, createdAt: '2026-04-04T00:00:00.000Z', updatedAt: '2026-04-04T00:00:00.000Z', memberCount: 1, assetCount: 3, taskCount: 2 },
        { id: 202, name: '星际探险', code: 'space-quest', status: 'active', description: null, coverAssetId: null, createdBy: 1, createdAt: '2026-04-04T00:00:00.000Z', updatedAt: '2026-04-04T00:00:00.000Z', memberCount: 1, assetCount: 2, taskCount: 1 },
      ],
    })
    vi.mocked(updateUser).mockResolvedValue({
      id: 2,
      username: 'operator',
      role: 'user',
      menuPerms: ['assets', 'videos'],
      status: 1,
      projects: [
        {
          id: 101,
          name: '都市逆袭',
          code: 'urban-rise',
          status: 'active',
          projectRole: 'manager',
        },
        {
          id: 202,
          name: '星际探险',
          code: 'space-quest',
          status: 'active',
          projectRole: 'viewer',
        },
      ],
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:20:00.000Z',
    })

    renderUsersPage()

    await screen.findByText('operator')
    await userEvent.click(screen.getByRole('button', { name: /编\s*辑/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '新增项目授权' }))
    await selectOption(within(dialog).getByLabelText('项目-2'), '星际探险 (space-quest)')
    fireEvent.mouseDown(within(dialog).getByLabelText('项目角色-2'))
    await userEvent.click(await screen.findByText('只读'))
    await userEvent.click(within(dialog).getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          projects: [
            { projectId: 101, projectRole: 'manager' },
            { projectId: 202, projectRole: 'viewer' },
          ],
        })
      )
    })

    expect(await screen.findByText('星际探险 / viewer')).toBeInTheDocument()
  })

  it('切换为普通用户后菜单权限联动为默认两项且不可手动改散', async () => {
    const { getUsers, updateUser } = await import('../../api/users')
    const { getProjects } = await import('../../api/projects')

    vi.mocked(getUsers).mockResolvedValue({
      items: [
        {
          id: 2,
          username: 'operator',
          role: 'admin',
          menuPerms: ['assets', 'videos', 'projects', 'users', 'config'],
          status: 1,
          projects: [
            {
              id: 101,
              name: '都市逆袭',
              code: 'urban-rise',
              status: 'active',
              projectRole: 'manager',
            },
          ],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    vi.mocked(getProjects).mockResolvedValue({
      items: [{ id: 101, name: '都市逆袭', code: 'urban-rise', status: 'active', description: null, coverAssetId: null, createdBy: 1, createdAt: '2026-04-04T00:00:00.000Z', updatedAt: '2026-04-04T00:00:00.000Z', memberCount: 1, assetCount: 3, taskCount: 2 }],
    })
    vi.mocked(updateUser).mockResolvedValue({
      id: 2,
      username: 'operator',
      role: 'user',
      menuPerms: ['assets', 'videos'],
      status: 1,
      projects: [
        {
          id: 101,
          name: '都市逆袭',
          code: 'urban-rise',
          status: 'active',
          projectRole: 'manager',
        },
      ],
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:20:00.000Z',
    })

    renderUsersPage()

    await screen.findByText('operator')
    await userEvent.click(screen.getByRole('button', { name: /编\s*辑/ }))
    const dialog = await screen.findByRole('dialog')

    await selectOption(within(dialog).getByLabelText('平台角色'), '普通用户')

    expect(within(dialog).getByLabelText('菜单权限').closest('.ant-select')).toHaveClass('ant-select-disabled')
    expect(within(dialog).getByText('素材管理')).toBeInTheDocument()
    expect(within(dialog).getByText('视频生成')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          role: 'user',
          menuPerms: ['assets', 'videos'],
        })
      )
    })
  })

  it('默认只加载启用用户，删除后会重新刷新启用列表', async () => {
    const { getUsers, deleteUser } = await import('../../api/users')
    const { getProjects } = await import('../../api/projects')

    vi.mocked(getUsers)
      .mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      })
      .mockResolvedValueOnce({
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
        pageSize: 50,
      })
    vi.mocked(getProjects).mockResolvedValue({ items: [] })
    vi.mocked(deleteUser).mockResolvedValue({
      id: 2,
      username: 'operator',
      role: 'user',
      menuPerms: ['assets', 'videos'],
      status: 0,
      projects: [],
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:20:00.000Z',
    })

    renderUsersPage()

    expect(await screen.findByText('operator')).toBeInTheDocument()
    expect(getUsers).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 50, status: 1 })

    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: /确\s*认/ }))

    await waitFor(() => {
      expect(deleteUser).toHaveBeenCalledWith(2)
    })

    expect(screen.queryByText('operator')).not.toBeInTheDocument()
  }, 10_000)
})
