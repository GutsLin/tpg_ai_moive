import request from 'supertest'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../../backend/src/app'
import type { ArkAssetClient } from '../../backend/src/lib/ark-aksk'
import type { AssetCategoryRecord, AssetCategoryRepository } from '../../backend/src/services/asset-category.service'
import type { OssServiceContract } from '../../backend/src/services/oss.service'
import type {
  ProjectAccessRecord,
  ProjectAccessRepository,
} from '../../backend/src/services/project-access.service'

class FakeAssetCategoryRepository implements AssetCategoryRepository {
  private categories = new Map<number, AssetCategoryRecord>()
  private assetCounts = new Map<number, number>()
  private memberAssetCounts = new Map<string, number>()
  public lastDeleteInput: { projectId: number; id: number; targetCategoryId?: number | null } | null = null
  public lastListInput: { projectId: number; createdByUserId?: number } | null = null
  private projectCodes = new Map<number, string>([
    [101, 'PRJ-202604-000101'],
    [202, 'PRJ-202604-000202'],
  ])
  private idSequence = 10

  public seed(
    categories: Array<AssetCategoryRecord & { assetCount: number; memberAssetCounts?: Record<number, number> }>
  ) {
    this.categories = new Map(
      categories.map((category) => [
        category.id,
        {
          id: category.id,
          projectId: category.projectId,
          name: category.name,
          sortOrder: category.sortOrder,
          syncEnabled: category.syncEnabled,
          arkGroupId: category.arkGroupId,
        },
      ])
    )
    this.assetCounts = new Map(categories.map((category) => [category.id, category.assetCount]))
    this.memberAssetCounts = new Map(
      categories.flatMap((category) =>
        Object.entries(category.memberAssetCounts ?? {}).map(([userId, count]) => [`${category.id}:${userId}`, count] as const)
      )
    )
  }

  public async list(projectId: number, createdByUserId?: number): Promise<Array<AssetCategoryRecord & { assetCount: number }>> {
    this.lastListInput = { projectId, createdByUserId }

    return [...this.categories.values()]
      .filter((category) => category.projectId === projectId)
      .map((category) => ({
        ...category,
        assetCount:
          createdByUserId === undefined
            ? this.assetCounts.get(category.id) ?? 0
            : this.memberAssetCounts.get(`${category.id}:${createdByUserId}`) ?? 0,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
  }

  public async findById(projectId: number, id: number): Promise<AssetCategoryRecord | null> {
    const category = this.categories.get(id)
    if (!category || category.projectId !== projectId) {
      return null
    }

    return category
  }

  public async existsName(projectId: number, name: string, excludeCategoryId?: number): Promise<boolean> {
    const normalizedName = name.trim().toLocaleLowerCase()

    return [...this.categories.values()].some((category) => {
      if (category.projectId !== projectId) {
        return false
      }
      if (excludeCategoryId !== undefined && category.id === excludeCategoryId) {
        return false
      }

      return category.name.trim().toLocaleLowerCase() === normalizedName
    })
  }

  public async findProjectCode(projectId: number): Promise<string | null> {
    return this.projectCodes.get(projectId) ?? null
  }

  public async listSyncCandidateAssetIds(): Promise<number[]> {
    return []
  }

  public async create(
    projectId: number,
    input: { name: string; sortOrder: number; syncEnabled: boolean; arkGroupId: string | null }
  ): Promise<AssetCategoryRecord> {
    const record = {
      id: this.idSequence++,
      projectId,
      name: input.name,
      sortOrder: input.sortOrder,
      syncEnabled: input.syncEnabled,
      arkGroupId: input.arkGroupId,
    }
    this.categories.set(record.id, record)
    this.assetCounts.set(record.id, 0)
    return record
  }

  public async update(
    projectId: number,
    id: number,
    input: { name?: string; sortOrder?: number; syncEnabled?: boolean; arkGroupId?: string | null }
  ): Promise<AssetCategoryRecord | null> {
    const current = this.categories.get(id)
    if (!current || current.projectId !== projectId) {
      return null
    }

    const next = {
      ...current,
      name: input.name ?? current.name,
      sortOrder: input.sortOrder ?? current.sortOrder,
      syncEnabled: input.syncEnabled ?? current.syncEnabled,
      arkGroupId: input.arkGroupId ?? current.arkGroupId,
    }
    this.categories.set(id, next)
    return next
  }

  public async delete(
    projectId: number,
    id: number,
    targetCategoryId?: number | null
  ): Promise<{ affectedAssets: number; deleted: boolean }> {
    const current = this.categories.get(id)
    if (!current || current.projectId !== projectId) {
      return { affectedAssets: 0, deleted: false }
    }

    this.lastDeleteInput = { projectId, id, targetCategoryId }
    const affectedAssets = this.assetCounts.get(id) ?? 0
    this.categories.delete(id)
    this.assetCounts.delete(id)
    return { affectedAssets, deleted: true }
  }
}

class FakeOssService implements OssServiceContract {
  public async getSignedUrl(ossKey: string, ttlSeconds?: number): Promise<string> {
    return `https://oss.example.com/${ossKey}?ttl=${ttlSeconds ?? 86400}`
  }

  public async deleteObject(): Promise<void> {}

  public async putObject(): Promise<void> {}

  public async getStsCredentials() {
    return {
      credentials: {
        accessKeyId: 'sts-ak',
        accessKeySecret: 'sts-sk',
        securityToken: 'sts-token',
        expiration: '2026-04-04T12:00:00.000Z',
      },
      bucket: 'narrix-assets',
      region: 'oss-cn-shanghai',
      keyPrefix: 'assets/2026/04/04/',
    }
  }
}

class FakeProjectAccessRepository implements ProjectAccessRepository {
  private userProjects = new Map<number, ProjectAccessRecord[]>()

  public seed(entries: Array<{ userId: number; projects: ProjectAccessRecord[] }>): void {
    this.userProjects = new Map(entries.map((entry) => [entry.userId, entry.projects]))
  }

  public async listAccessibleProjectsForUser(userId: number): Promise<ProjectAccessRecord[]> {
    return this.userProjects.get(userId) ?? []
  }

  public async findAccessibleProjectForUser(
    userId: number,
    _role: 'admin' | 'user',
    projectId: number
  ): Promise<ProjectAccessRecord | null> {
    const projects = this.userProjects.get(userId) ?? []
    return projects.find((item) => item.projectId === projectId) ?? null
  }
}

const createFakeArkClient = (): ArkAssetClient => ({
  createAsset: vi.fn(),
  getAsset: vi.fn(),
  deleteAsset: vi.fn(),
  listAssetGroups: vi.fn().mockResolvedValue([]),
  createAssetGroup: vi.fn().mockImplementation(async ({ name, description, projectName }) => ({
    id: `group-${name}`,
    name,
    description: description ?? null,
    groupType: 'AIGC',
    projectName: projectName ?? null,
  })),
  updateAssetGroup: vi.fn().mockImplementation(async ({ id, name, description, projectName }) => ({
    id,
    name: name ?? id,
    description: description ?? null,
    groupType: 'AIGC',
    projectName: projectName ?? null,
  })),
})

describe('/api/asset-categories 与 /api/assets/sts-token', () => {
  const signToken = (role: 'admin' | 'user') =>
    jwt.sign({ sub: '1', role }, 'issue-4-secret', { expiresIn: '8h' })

  let repository: FakeAssetCategoryRepository
  let projectAccessRepository: FakeProjectAccessRepository
  const projectId = '101'

  beforeEach(() => {
    process.env.JWT_SECRET = 'issue-4-secret'
    repository = new FakeAssetCategoryRepository()
    projectAccessRepository = new FakeProjectAccessRepository()
    repository.seed([
      { id: 1, projectId: 101, name: '场景', sortOrder: 2, syncEnabled: true, arkGroupId: 'group-scene', assetCount: 3 },
      { id: 2, projectId: 101, name: '角色', sortOrder: 1, syncEnabled: false, arkGroupId: null, assetCount: 5 },
      { id: 3, projectId: 202, name: '外部分类', sortOrder: 1, syncEnabled: true, arkGroupId: 'group-external', assetCount: 9 },
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
            projectId: 101,
            projectName: '都市逆袭',
            projectCode: 'urban-rise',
            projectStatus: 'active',
            projectRole: 'member',
          },
        ],
      },
    ])
  })

  it('分类列表按当前项目过滤，并按 sort_order 和 id 排序', async () => {
    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/asset-categories')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.items).toEqual([
      { id: 2, projectId: 101, name: '角色', sortOrder: 1, syncEnabled: false, arkGroupId: null, assetCount: 5 },
      { id: 1, projectId: 101, name: '场景', sortOrder: 2, syncEnabled: true, arkGroupId: 'group-scene', assetCount: 3 },
    ])
  })

  it('项目成员获取分类列表时返回自己可见素材的统计数量', async () => {
    repository.seed([
      {
        id: 1,
        projectId: 101,
        name: '场景',
        sortOrder: 2,
        syncEnabled: true,
        arkGroupId: 'group-scene',
        assetCount: 3,
        memberAssetCounts: { 2: 1 },
      },
      {
        id: 2,
        projectId: 101,
        name: '角色',
        sortOrder: 1,
        syncEnabled: false,
        arkGroupId: null,
        assetCount: 5,
        memberAssetCounts: { 2: 2 },
      },
    ])

    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/asset-categories')
      .set('Authorization', `Bearer ${jwt.sign({ sub: '2', role: 'user' }, 'issue-4-secret', { expiresIn: '8h' })}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(repository.lastListInput).toEqual({ projectId: 101, createdByUserId: 2 })
    expect(response.body.data.items).toEqual([
      { id: 2, projectId: 101, name: '角色', sortOrder: 1, syncEnabled: false, arkGroupId: null, assetCount: 2 },
      { id: 1, projectId: 101, name: '场景', sortOrder: 2, syncEnabled: true, arkGroupId: 'group-scene', assetCount: 1 },
    ])
  })

  it('普通用户不能创建分类', async () => {
    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/asset-categories')
      .set('Authorization', `Bearer ${signToken('user')}`)
      .set('X-Project-Id', projectId)
      .send({ name: '道具', sortOrder: 3, syncEnabled: false })

    expect(response.status).toBe(403)
  })

  it('管理员可以在当前项目创建和更新分类', async () => {
    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const createResponse = await request(app.callback())
      .post('/api/asset-categories')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)
      .send({ name: '道具', sortOrder: 3, syncEnabled: false })

    expect(createResponse.status).toBe(200)
    expect(createResponse.body.data.projectId).toBe(101)
    expect(createResponse.body.data.name).toBe('道具')
    expect(createResponse.body.data.syncEnabled).toBe(false)

    const updateResponse = await request(app.callback())
      .patch(`/api/asset-categories/${createResponse.body.data.id}`)
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)
      .send({ sortOrder: 4 })

    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.data.sortOrder).toBe(4)
  })

  it('同一项目内创建素材组时不允许名称重名', async () => {
    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/asset-categories')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)
      .send({ name: '角色', sortOrder: 3, syncEnabled: false })

    expect(response.status).toBe(422)
    expect(response.body.message).toContain('素材组名称已存在')
  })

  it('同一项目内编辑素材组名称时不允许改成重复名称', async () => {
    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .patch('/api/asset-categories/1')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)
      .send({ name: '角色' })

    expect(response.status).toBe(422)
    expect(response.body.message).toContain('素材组名称已存在')
  })

  it('删除非空分类时要求显式提供迁移目标', async () => {
    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .delete('/api/asset-categories/1')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(422)
    expect(response.body.message).toContain('迁移目标')
  })

  it('删除分类返回当前项目受影响素材数量，并把素材迁移到选中的目标组', async () => {
    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .delete('/api/asset-categories/1')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)
      .send({ targetCategoryId: 2 })

    expect(response.status).toBe(200)
    expect(response.body.data.affectedAssets).toBe(3)
    expect(response.body.data.targetCategoryId).toBe(2)
    expect(repository.lastDeleteInput).toEqual({ projectId: 101, id: 1, targetCategoryId: 2 })
  })

  it('删除分类时仅通过 query 传递迁移目标也能生效', async () => {
    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .delete('/api/asset-categories/1?targetCategoryId=2')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(repository.lastDeleteInput).toEqual({ projectId: 101, id: 1, targetCategoryId: 2 })
  })

  it('删除分类时通过 body 传递 null 也会被识别为转为未分类', async () => {
    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .delete('/api/asset-categories/1')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)
      .send({ targetCategoryId: null })

    expect(response.status).toBe(200)
    expect(response.body.data.targetCategoryId).toBeNull()
    expect(repository.lastDeleteInput).toEqual({ projectId: 101, id: 1, targetCategoryId: null })
  })

  it('STS 接口返回 bucket、region、keyPrefix 和临时凭证', async () => {
    const app = createApp({
      assetCategoryRepository: repository,
      assetCategoryArkClient: createFakeArkClient(),
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/assets/sts-token')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.bucket).toBe('narrix-assets')
    expect(response.body.data.region).toBe('oss-cn-shanghai')
    expect(response.body.data.credentials.accessKeyId).toBe('sts-ak')
  })
})
