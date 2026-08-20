import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../backend/src/app'
import type {
  ProjectAccessRecord,
  ProjectAccessRepository,
} from '../../backend/src/services/project-access.service'
import type {
  ProjectMemberRecord,
  ProjectMemberRepository,
  ProjectRepository,
} from '../../backend/src/services/project.service'
import type {
  CreateUserInput,
  UserProjectAccessRecord,
  UserProjectRepository,
  UpdateUserInput,
  UserRecord,
  UserRepository,
} from '../../backend/src/services/user.service'

class FakeUserRepository implements UserRepository {
  private users = new Map<number, UserRecord>()

  public seed(users: UserRecord[]): void {
    this.users = new Map(users.map((user) => [user.id, user]))
  }

  public async findByUsername(username: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((user) => user.username === username) ?? null
  }

  public async findById(id: number): Promise<UserRecord | null> {
    return this.users.get(id) ?? null
  }

  public async list(): Promise<{ items: UserRecord[]; total: number }> {
    return { items: [...this.users.values()], total: this.users.size }
  }

  public async create(input: CreateUserInput): Promise<UserRecord> {
    return {
      id: 999,
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      menuPerms: input.menuPerms,
      status: input.status,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    }
  }

  public async update(id: number, input: UpdateUserInput): Promise<UserRecord | null> {
    const current = this.users.get(id)
    if (!current) {
      return null
    }

    const next = {
      ...current,
      passwordHash: input.passwordHash ?? current.passwordHash,
      menuPerms: input.menuPerms ?? current.menuPerms,
      status: input.status ?? current.status,
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    }
    this.users.set(id, next)
    return next
  }

  public async softDelete(id: number): Promise<UserRecord | null> {
    return await this.update(id, { status: 0 })
  }
}

class FakeProjectAccessRepository implements ProjectAccessRepository {
  public async listAccessibleProjectsForUser(userId: number, role: 'admin' | 'user'): Promise<ProjectAccessRecord[]> {
    if (role === 'admin') {
      return [
        {
          projectId: 101,
          projectName: '都市逆袭',
          projectCode: 'urban-rise',
          projectStatus: 'active',
          projectRole: 'manager',
        },
      ]
    }

    if (userId === 2) {
      return [
        {
          projectId: 101,
          projectName: '都市逆袭',
          projectCode: 'urban-rise',
          projectStatus: 'active',
          projectRole: 'member',
        },
      ]
    }

    return []
  }

  public async findAccessibleProjectForUser(
    userId: number,
    role: 'admin' | 'user',
    projectId: number
  ): Promise<ProjectAccessRecord | null> {
    const projects = await this.listAccessibleProjectsForUser(userId, role)
    return projects.find((project) => project.projectId === projectId) ?? null
  }
}

class FakeUserProjectRepository implements UserProjectRepository {
  public async listProjectsByUserIds(): Promise<UserProjectAccessRecord[]> {
    return []
  }

  public async listExistingProjectIds(projectIds: number[]): Promise<number[]> {
    return projectIds
  }

  public async replaceUserProjects(): Promise<void> {}
}

class FakeProjectRepository implements ProjectRepository {
  private idSequence = 100
  private projects = new Map<number, any>()
  private failCreateWithDuplicateCode = false
  private codeSequence = 1

  public simulateDuplicateCodeOnCreate() {
    this.failCreateWithDuplicateCode = true
  }

  public async listWithSummary() {
    return [...this.projects.values()].sort((left, right) => left.id - right.id)
  }

  public async findWithSummaryById(id: number) {
    return this.projects.get(id) ?? null
  }

  public async findByCode(code: string) {
    return [...this.projects.values()].find((project) => project.code === code) ?? null
  }

  public async nextCodeSequence(): Promise<number> {
    return this.codeSequence++
  }

  public async create(input: {
    name: string
    code: string
    description: string | null
    coverAssetId: number | null
    createdBy: number | null
  }) {
    if (this.failCreateWithDuplicateCode) {
      const error = new Error('duplicate key value violates unique constraint "projects_code_key"') as Error & {
        code?: string
        constraint?: string
      }
      error.code = '23505'
      error.constraint = 'projects_code_key'
      throw error
    }

    const record = {
      id: this.idSequence++,
      name: input.name,
      code: input.code,
      status: 'active' as const,
      description: input.description,
      coverAssetId: input.coverAssetId,
      createdBy: input.createdBy,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      memberCount: 0,
      assetCount: 0,
      taskCount: 0,
    }
    this.projects.set(record.id, record)
    return record
  }

  public async update(
    id: number,
    input: { name?: string; description?: string | null; coverAssetId?: number | null; status?: 'active' | 'archived' }
  ) {
    const project = this.projects.get(id)
    if (!project) {
      return null
    }

    const updated = {
      ...project,
      name: input.name ?? project.name,
      description: input.description ?? project.description,
      coverAssetId: input.coverAssetId ?? project.coverAssetId,
      status: input.status ?? project.status,
      updatedAt: new Date('2026-04-04T00:10:00.000Z'),
    }
    this.projects.set(id, updated)
    return updated
  }
}

class FakeProjectMemberRepository implements ProjectMemberRepository {
  private membersByProject = new Map<number, ProjectMemberRecord[]>()
  private usernames = new Map<number, string>([
    [1, 'admin'],
    [2, 'operator'],
  ])

  public async listActiveMembers(projectId: number): Promise<ProjectMemberRecord[]> {
    return this.membersByProject.get(projectId) ?? []
  }

  public async listExistingUserIds(userIds: number[]): Promise<number[]> {
    return userIds.filter((userId) => this.usernames.has(userId))
  }

  public async replaceAllMembers(
    projectId: number,
    members: Array<{ userId: number; projectRole: 'manager' | 'member' | 'viewer' }>
  ): Promise<ProjectMemberRecord[]> {
    const nextMembers = members.map((member) => ({
      projectId,
      userId: member.userId,
      username: this.usernames.get(member.userId) ?? `user-${member.userId}`,
      projectRole: member.projectRole,
      status: 'active' as const,
    }))
    this.membersByProject.set(projectId, nextMembers)
    return nextMembers
  }
}

describe('/api/projects', () => {
  let userRepository: FakeUserRepository
  let projectAccessRepository: FakeProjectAccessRepository
  let userProjectRepository: FakeUserProjectRepository
  let projectRepository: FakeProjectRepository
  let projectMemberRepository: FakeProjectMemberRepository

  beforeEach(() => {
    process.env.JWT_SECRET = 'issue-18-secret'
    process.env.JWT_EXPIRES_IN = '8h'

    userRepository = new FakeUserRepository()
    projectAccessRepository = new FakeProjectAccessRepository()
    userProjectRepository = new FakeUserProjectRepository()
    projectRepository = new FakeProjectRepository()
    projectMemberRepository = new FakeProjectMemberRepository()
    userRepository.seed([
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
  })

  it('普通用户访问项目管理接口返回 403', async () => {
    const app = createApp({
      userRepository,
      projectAccessRepository,
      userProjectRepository,
      projectRepository,
      projectMemberRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'operator',
      password: 'pass1234',
    })

    const response = await request(app.callback())
      .get('/api/projects')
      .set('Authorization', `Bearer ${loginResponse.body.data.token}`)

    expect(response.status).toBe(403)
  })

  it('管理员可执行项目 CRUD 并返回摘要统计字段', async () => {
    const app = createApp({
      userRepository,
      projectAccessRepository,
      userProjectRepository,
      projectRepository,
      projectMemberRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })
    const token = loginResponse.body.data.token as string

    const createResponse = await request(app.callback()).post('/api/projects').set('Authorization', `Bearer ${token}`).send({
      name: '都市逆袭',
      description: '都市逆袭项目',
    })

    expect(createResponse.status).toBe(200)
    expect(createResponse.body.data).toMatchObject({
      name: '都市逆袭',
      status: 'active',
      memberCount: 0,
      assetCount: 0,
      taskCount: 0,
    })
    expect(createResponse.body.data.code).toMatch(/^PRJ-\d{6}-\d{6}$/)

    const projectId = createResponse.body.data.id as number

    const listResponse = await request(app.callback()).get('/api/projects').set('Authorization', `Bearer ${token}`)
    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data.items[0]).toEqual(
      expect.objectContaining({
        id: projectId,
        memberCount: expect.any(Number),
        assetCount: expect.any(Number),
        taskCount: expect.any(Number),
      })
    )

    const updateResponse = await request(app.callback())
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '都市逆袭S2',
        description: '更新后的项目描述',
      })
    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.data.name).toBe('都市逆袭S2')

    const detailResponse = await request(app.callback())
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body.data).toEqual(
      expect.objectContaining({
        id: projectId,
        name: '都市逆袭S2',
        memberCount: expect.any(Number),
        assetCount: expect.any(Number),
        taskCount: expect.any(Number),
      })
    )

    const archiveResponse = await request(app.callback())
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(archiveResponse.status).toBe(200)
    expect(archiveResponse.body.data.status).toBe('archived')
  })

  it('管理员可整表更新项目成员', async () => {
    const app = createApp({
      userRepository,
      projectAccessRepository,
      userProjectRepository,
      projectRepository,
      projectMemberRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })
    const token = loginResponse.body.data.token as string

    const createResponse = await request(app.callback()).post('/api/projects').set('Authorization', `Bearer ${token}`).send({
      name: '校园修仙',
      description: '校园修仙项目',
    })
    const projectId = createResponse.body.data.id as number

    const replaceMembersResponse = await request(app.callback())
      .put(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          {
            userId: 1,
            projectRole: 'manager',
          },
          {
            userId: 2,
            projectRole: 'manager',
          },
        ],
      })

    expect(replaceMembersResponse.status).toBe(200)
    expect(replaceMembersResponse.body.data.items).toEqual([
      expect.objectContaining({
        userId: 1,
        projectRole: 'manager',
        status: 'active',
      }),
      expect.objectContaining({
        userId: 2,
        projectRole: 'manager',
        status: 'active',
      }),
    ])

    const membersResponse = await request(app.callback())
      .get(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)

    expect(membersResponse.status).toBe(200)
    expect(membersResponse.body.data.items).toEqual([
      expect.objectContaining({
        userId: 1,
        projectRole: 'manager',
        status: 'active',
      }),
      expect.objectContaining({
        userId: 2,
        projectRole: 'manager',
        status: 'active',
      }),
    ])
  })

  it('项目成员接口不再接受 owner 角色', async () => {
    const app = createApp({
      userRepository,
      projectAccessRepository,
      userProjectRepository,
      projectRepository,
      projectMemberRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })
    const token = loginResponse.body.data.token as string

    const createResponse = await request(app.callback()).post('/api/projects').set('Authorization', `Bearer ${token}`).send({
      name: '角色收敛测试项目',
      description: '验证 owner 已收敛',
    })
    const projectId = createResponse.body.data.id as number

    const replaceMembersResponse = await request(app.callback())
      .put(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        members: [
          {
            userId: 1,
            projectRole: 'owner',
          },
        ],
      })

    expect(replaceMembersResponse.status).toBe(422)
  })

  it('项目编码唯一键冲突时返回 422', async () => {
    projectRepository.simulateDuplicateCodeOnCreate()

    const app = createApp({
      userRepository,
      projectAccessRepository,
      userProjectRepository,
      projectRepository,
      projectMemberRepository,
    })

    const loginResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })
    const token = loginResponse.body.data.token as string

    const createResponse = await request(app.callback()).post('/api/projects').set('Authorization', `Bearer ${token}`).send({
      name: '并发冲突项目',
      description: '模拟唯一键竞争',
    })

    expect(createResponse.status).toBe(422)
    expect(createResponse.body.code).toBe(422)
    expect(createResponse.body.message).toContain('项目编码已存在')
  })
})
