import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../backend/src/app'
import type {
  ProjectAccessRecord,
  ProjectAccessRepository,
} from '../../backend/src/services/project-access.service'
import {
  type CreateUserInput,
  type ListUsersParams,
  type UserProjectAccessRecord,
  type UserProjectRepository,
  type UpdateUserInput,
  type UserRecord,
  type UserRepository,
} from '../../backend/src/services/user.service'

class FakeUserRepository implements UserRepository {
  private users = new Map<number, UserRecord>()
  private idSequence = 100

  public seed(users: UserRecord[]): void {
    this.users = new Map(users.map((user) => [user.id, user]))
  }

  public async findByUsername(username: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((user) => user.username === username) ?? null
  }

  public async findById(id: number): Promise<UserRecord | null> {
    return this.users.get(id) ?? null
  }

  public async list(params: ListUsersParams): Promise<{ items: UserRecord[]; total: number }> {
    const allUsers = [...this.users.values()].filter((user) =>
      params.status === undefined ? true : user.status === params.status
    )
    const page = params.page
    const pageSize = params.pageSize
    const offset = (page - 1) * pageSize

    return {
      items: allUsers.slice(offset, offset + pageSize),
      total: allUsers.length,
    }
  }

  public async create(input: CreateUserInput): Promise<UserRecord> {
    const user: UserRecord = {
      id: this.idSequence++,
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      menuPerms: input.menuPerms,
      status: input.status,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    }

    this.users.set(user.id, user)
    return user
  }

  public async update(id: number, input: UpdateUserInput): Promise<UserRecord | null> {
    const user = this.users.get(id)
    if (!user) {
      return null
    }

    const updatedUser: UserRecord = {
      ...user,
      role: input.role ?? user.role,
      passwordHash: input.passwordHash ?? user.passwordHash,
      menuPerms: input.menuPerms ?? user.menuPerms,
      status: input.status ?? user.status,
      updatedAt: new Date('2026-04-04T00:10:00.000Z'),
    }

    this.users.set(id, updatedUser)
    return updatedUser
  }

  public async softDelete(id: number): Promise<UserRecord | null> {
    const user = this.users.get(id)
    if (!user) {
      return null
    }

    const deletedUser = {
      ...user,
      status: 0,
      updatedAt: new Date('2026-04-04T00:20:00.000Z'),
    }

    this.users.set(id, deletedUser)
    return deletedUser
  }
}

class FakeProjectAccessRepository implements ProjectAccessRepository {
  private userProjects = new Map<number, ProjectAccessRecord[]>()

  public seed(entries: Array<{ userId: number; projects: ProjectAccessRecord[] }>): void {
    this.userProjects = new Map(entries.map((entry) => [entry.userId, entry.projects]))
  }

  public async listAccessibleProjectsForUser(userId: number, role: 'admin' | 'user'): Promise<ProjectAccessRecord[]> {
    if (role === 'admin') {
      return (
        this.userProjects.get(userId) ?? [
          {
            projectId: 900,
            projectName: '平台总控项目',
            projectCode: 'platform-admin',
            projectStatus: 'active',
            projectRole: 'manager',
          },
        ]
      )
    }

    return this.userProjects.get(userId) ?? []
  }

  public async findAccessibleProjectForUser(
    userId: number,
    role: 'admin' | 'user',
    projectId: number
  ): Promise<ProjectAccessRecord | null> {
    const projects = await this.listAccessibleProjectsForUser(userId, role)
    return projects.find((item) => item.projectId === projectId) ?? null
  }
}

class FakeUserProjectRepository implements UserProjectRepository {
  private readonly projectDictionary = new Map<number, { name: string; code: string; status: 'active' | 'archived' }>()
  private readonly userProjects = new Map<number, UserProjectAccessRecord[]>()

  public seed(entries: Array<{ userId: number; projects: ProjectAccessRecord[] }>): void {
    this.userProjects = new Map(
      entries.map((entry) => [
        entry.userId,
        entry.projects.map((project) => ({
          userId: entry.userId,
          projectId: project.projectId,
          projectName: project.projectName,
          projectCode: project.projectCode,
          projectStatus: project.projectStatus,
          projectRole: project.projectRole,
        })),
      ])
    )

    for (const entry of entries) {
      for (const project of entry.projects) {
        this.projectDictionary.set(project.projectId, {
          name: project.projectName,
          code: project.projectCode,
          status: project.projectStatus,
        })
      }
    }
  }

  public async listProjectsByUserIds(userIds: number[]): Promise<UserProjectAccessRecord[]> {
    return userIds.flatMap((userId) => this.userProjects.get(userId) ?? [])
  }

  public async listExistingProjectIds(projectIds: number[]): Promise<number[]> {
    return projectIds.filter((projectId) => this.projectDictionary.has(projectId))
  }

  public async replaceUserProjects(
    userId: number,
    projects: Array<{ projectId: number; projectRole: 'manager' | 'member' | 'viewer' }>
  ): Promise<void> {
    const mapped = projects.map((project) => {
      const projectInfo = this.projectDictionary.get(project.projectId)
      if (!projectInfo) {
        throw new Error('invalid project id')
      }
      return {
        userId,
        projectId: project.projectId,
        projectName: projectInfo.name,
        projectCode: projectInfo.code,
        projectStatus: projectInfo.status,
        projectRole: project.projectRole,
      } satisfies UserProjectAccessRecord
    })

    this.userProjects.set(userId, mapped)
  }
}

describe('auth 与 users 路由', () => {
  let repository: FakeUserRepository
  let projectAccessRepository: FakeProjectAccessRepository
  let userProjectRepository: FakeUserProjectRepository

  beforeEach(() => {
    process.env.JWT_SECRET = 'issue-2-secret'
    process.env.JWT_EXPIRES_IN = '8h'

    repository = new FakeUserRepository()
    projectAccessRepository = new FakeProjectAccessRepository()
    userProjectRepository = new FakeUserProjectRepository()
    repository.seed([
      {
        id: 1,
        username: 'admin',
        passwordHash: '$2b$12$/oG/3s2mR/I9.SbLEV8whu.15jETibyS.8VtZarNH0DlmO3B4dqxa',
        role: 'admin',
        menuPerms: [],
        status: 1,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
      {
        id: 2,
        username: 'operator',
        passwordHash: '$2b$12$/oG/3s2mR/I9.SbLEV8whu.15jETibyS.8VtZarNH0DlmO3B4dqxa',
        role: 'user',
        menuPerms: ['assets'],
        status: 1,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])
    projectAccessRepository.seed([
      {
        userId: 1,
        projects: [
          {
            projectId: 101,
            projectName: '都市逆袭',
            projectCode: 'urban-rise',
            projectStatus: 'active',
            projectRole: 'manager',
          },
        ],
      },
      {
        userId: 2,
        projects: [
          {
            projectId: 102,
            projectName: '校园修仙',
            projectCode: 'campus-xiu',
            projectStatus: 'active',
            projectRole: 'member',
          },
        ],
      },
    ])
    userProjectRepository.seed([
      {
        userId: 1,
        projects: [
          {
            projectId: 101,
            projectName: '都市逆袭',
            projectCode: 'urban-rise',
            projectStatus: 'active',
            projectRole: 'manager',
          },
        ],
      },
      {
        userId: 2,
        projects: [
          {
            projectId: 102,
            projectName: '校园修仙',
            projectCode: 'campus-xiu',
            projectStatus: 'active',
            projectRole: 'member',
          },
        ],
      },
    ])
  })

  it('错误密码登录返回 401', async () => {
    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const response = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'wrong-password',
    })

    expect(response.status).toBe(401)
    expect(response.body.code).toBe(401)
  })

  it('正确密码登录返回 token 与用户信息', async () => {
    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const response = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    expect(response.status).toBe(200)
    expect(response.body.data.token).toEqual(expect.any(String))
    expect(response.body.data.user).toMatchObject({
      id: 1,
      username: 'admin',
      role: 'admin',
    })
    expect(response.body.data.projects).toEqual([
      {
        id: 101,
        name: '都市逆袭',
        code: 'urban-rise',
        status: 'active',
        projectRole: 'manager',
      },
    ])
    expect(response.body.data.activeProjectId).toBe(101)
  })

  it('普通用户访问 /api/users 返回 403', async () => {
    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'operator',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .get('/api/users?page=1&pageSize=10')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)

    expect(response.status).toBe(403)
    expect(response.body.code).toBe(403)
  })

  it('管理员可以分页查询用户列表', async () => {
    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .get('/api/users?page=1&pageSize=10&status=1')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)

    expect(response.status).toBe(200)
    expect(response.body.data.items).toHaveLength(2)
    expect(response.body.data.total).toBe(2)
    expect(response.body.data.items[0].projects).toEqual([
      {
        id: 101,
        name: '都市逆袭',
        code: 'urban-rise',
        status: 'active',
        projectRole: 'manager',
      },
    ])
  })

  it('管理员存在显式项目成员时，登录与用户列表只返回已授权项目', async () => {
    userProjectRepository.seed([
      {
        userId: 1,
        projects: [
          {
            projectId: 101,
            projectName: '都市逆袭',
            projectCode: 'urban-rise',
            projectStatus: 'active',
            projectRole: 'manager',
          },
        ],
      },
      {
        userId: 2,
        projects: [
          {
            projectId: 102,
            projectName: '校园修仙',
            projectCode: 'campus-xiu',
            projectStatus: 'active',
            projectRole: 'member',
          },
        ],
      },
    ])
    projectAccessRepository.seed([
      {
        userId: 1,
        projects: [
          {
            projectId: 101,
            projectName: '都市逆袭',
            projectCode: 'urban-rise',
            projectStatus: 'active',
            projectRole: 'manager',
          },
          {
            projectId: 202,
            projectName: '星际探险',
            projectCode: 'star-quest',
            projectStatus: 'active',
            projectRole: 'manager',
          },
        ],
      },
      {
        userId: 2,
        projects: [
          {
            projectId: 102,
            projectName: '校园修仙',
            projectCode: 'campus-xiu',
            projectStatus: 'active',
            projectRole: 'member',
          },
        ],
      },
    ])

    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    expect(loginResponse.status).toBe(200)
    expect(loginResponse.body.data.projects).toEqual([
      {
        id: 101,
        name: '都市逆袭',
        code: 'urban-rise',
        status: 'active',
        projectRole: 'manager',
      },
    ])

    const listResponse = await request(app.callback())
      .get('/api/users?page=1&pageSize=10&status=1')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)

    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data.items[0].projects).toEqual([
      {
        id: 101,
        name: '都市逆袭',
        code: 'urban-rise',
        status: 'active',
        projectRole: 'manager',
      },
    ])
  })

  it('管理员可以创建用户', async () => {
    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .post('/api/users')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
      .send({
        username: 'producer',
        password: 'pass1234',
        role: 'user',
        menuPerms: ['assets', 'videos'],
        projects: [
          {
            projectId: 101,
            projectRole: 'viewer',
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(response.body.data.username).toBe('producer')
    expect(response.body.data.role).toBe('user')
    expect(response.body.data.menuPerms).toEqual(['assets', 'videos'])
    expect(response.body.data.projects).toEqual([
      {
        id: 101,
        name: '都市逆袭',
        code: 'urban-rise',
        status: 'active',
        projectRole: 'viewer',
      },
    ])
  })

  it('管理员创建用户时不再接受 owner 项目角色', async () => {
    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .post('/api/users')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
      .send({
        username: 'owner-role-user',
        password: 'pass1234',
        role: 'user',
        menuPerms: ['assets', 'videos'],
        projects: [
          {
            projectId: 101,
            projectRole: 'owner',
          },
        ],
      })

    expect(response.status).toBe(422)
  })

  it('管理员不能创建启用且无菜单权限的普通用户', async () => {
    const app = createApp({
      userRepository: repository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .post('/api/users')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
      .send({
        username: 'empty-user',
        password: 'pass1234',
        role: 'user',
        menuPerms: [],
      })

    expect(response.status).toBe(422)
    expect(response.body.message).toBe('启用中的普通用户至少保留一个菜单权限')
  })

  it('管理员不能创建未授权项目的普通用户', async () => {
    const app = createApp({
      userRepository: repository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .post('/api/users')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
      .send({
        username: 'project-empty-user',
        password: 'pass1234',
        role: 'user',
        menuPerms: ['assets', 'videos'],
        projects: [],
      })

    expect(response.status).toBe(422)
    expect(response.body.message).toBe('普通用户至少授权一个项目')
  })

  it('管理员可以更新 menuPerms、status 和 password', async () => {
    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .patch('/api/users/2')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
      .send({
        menuPerms: ['assets', 'config'],
        status: 0,
        password: 'next-pass-1234',
        projects: [
          {
            projectId: 101,
            projectRole: 'manager',
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(response.body.data.menuPerms).toEqual(['assets', 'config'])
    expect(response.body.data.status).toBe(0)
    expect(response.body.data.projects).toEqual([
      {
        id: 101,
        name: '都市逆袭',
        code: 'urban-rise',
        status: 'active',
        projectRole: 'manager',
      },
    ])
  })

  it('管理员不能把启用中的普通用户更新为空菜单权限', async () => {
    const app = createApp({
      userRepository: repository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .patch('/api/users/2')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
      .send({
        menuPerms: [],
        status: 1,
      })

    expect(response.status).toBe(422)
    expect(response.body.message).toBe('启用中的普通用户至少保留一个菜单权限')
  })

  it('管理员不能把普通用户更新为未授权任何项目', async () => {
    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .patch('/api/users/2')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
      .send({
        projects: [],
      })

    expect(response.status).toBe(422)
    expect(response.body.message).toBe('普通用户至少授权一个项目')
  })

  it('管理员不能删除自己', async () => {
    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .delete('/api/users/1')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)

    expect(response.status).toBe(422)
    expect(response.body.code).toBe(422)
  })

  it('管理员可以软删除其他用户', async () => {
    const app = createApp({
      userRepository: repository,
      projectAccessRepository,
      userProjectRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .delete('/api/users/2')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)

    expect(response.status).toBe(200)
    expect(response.body.data.status).toBe(0)
    expect(response.body.data.projects).toEqual([])
  })

  it('已登录用户可以修改自己的密码，并且旧密码立即失效', async () => {
    const app = createApp({
      userRepository: repository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const changePasswordResponse = await request(app.callback())
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
      .send({
        currentPassword: 'pass1234',
        newPassword: 'next-pass-1234',
      })

    const oldPasswordResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const newPasswordResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'next-pass-1234',
    })

    expect(changePasswordResponse.status).toBe(200)
    expect(changePasswordResponse.body.data.success).toBe(true)
    expect(oldPasswordResponse.status).toBe(401)
    expect(newPasswordResponse.status).toBe(200)
  })

  it('修改密码时当前密码错误返回 401', async () => {
    const app = createApp({
      userRepository: repository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)
      .send({
        currentPassword: 'wrong-pass',
        newPassword: 'next-pass-1234',
      })

    expect(response.status).toBe(401)
    expect(response.body.code).toBe(401)
  })
})
