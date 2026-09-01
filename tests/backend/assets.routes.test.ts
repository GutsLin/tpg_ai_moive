import request from 'supertest'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../backend/src/app'
import type {
  AssetDispatcher,
  AssetProjectLinkInput,
  AssetQueryParams,
  AssetRecord,
  AssetRepository,
} from '../../backend/src/services/asset.service'
import type { OssServiceContract } from '../../backend/src/services/oss.service'
import type {
  ProjectAccessRecord,
  ProjectAccessRepository,
} from '../../backend/src/services/project-access.service'

interface SeedAsset extends Omit<AssetRecord, 'createdAt' | 'updatedAt'> {
  createdAt?: Date
  updatedAt?: Date
}

class FakeAssetRepository implements AssetRepository {
  private assets = new Map<number, AssetRecord>()
  private referencedAssetIds = new Set<number>()
  private completedReferencedAssetIds = new Set<number>()
  private categoryMetaByProject = new Map<number, Map<number, { syncEnabled: boolean; arkGroupId: string | null }>>()
  private projectCodes = new Map<number, string>([
    [101, 'PRJ-202604-000101'],
    [202, 'PRJ-202604-000202'],
  ])
  private idSequence = 10

  public seed(assets: SeedAsset[], referencedAssetIds: number[] = [], completedReferencedAssetIds: number[] = []) {
    this.assets = new Map(
      assets.map((asset) => [
        asset.id,
        {
          ...asset,
          createdAt: asset.createdAt ?? new Date('2026-04-04T00:00:00.000Z'),
          updatedAt: asset.updatedAt ?? new Date('2026-04-04T00:00:00.000Z'),
        },
      ])
    )
    this.referencedAssetIds = new Set(referencedAssetIds)
    this.completedReferencedAssetIds = new Set(completedReferencedAssetIds)
  }

  public seedCategories(entries: Array<{ projectId: number; categoryIds: number[] }>) {
    this.categoryMetaByProject = new Map(
      entries.map((entry) => [
        entry.projectId,
        new Map(entry.categoryIds.map((categoryId) => [categoryId, { syncEnabled: true, arkGroupId: `group-${categoryId}` }])),
      ])
    )
  }

  public seedCategoryMeta(entries: Array<{ projectId: number; categoryId: number; syncEnabled: boolean; arkGroupId: string | null }>) {
    for (const entry of entries) {
      const current = this.categoryMetaByProject.get(entry.projectId) ?? new Map()
      current.set(entry.categoryId, {
        syncEnabled: entry.syncEnabled,
        arkGroupId: entry.arkGroupId,
      })
      this.categoryMetaByProject.set(entry.projectId, current)
    }
  }

  public async existsNameInProjects(name: string, projectIds: number[], excludeAssetId?: number): Promise<boolean> {
    const normalizedName = name.trim().toLocaleLowerCase()

    return [...this.assets.values()].some((asset) => {
      if (excludeAssetId !== undefined && asset.id === excludeAssetId) {
        return false
      }

      return (
        asset.name.trim().toLocaleLowerCase() === normalizedName &&
        asset.projectIds.some((projectId) => projectIds.includes(projectId))
      )
    })
  }

  public async create(input: {
    createdByUserId: number
    sourceProjectId: number
    name: string
    assetType: 'Image' | 'Video' | 'Audio'
    categoryId?: number | null
    ossKey: string
    tags: string[]
    syncMode: 'inherit' | 'enabled' | 'disabled'
    arkGroupId: string | null
    arkAssetId?: string | null
    arkStatus?: 'pending' | 'processing' | 'active' | 'failed' | 'deleting'
    arkError?: string | null
  }): Promise<AssetRecord> {
    const record: AssetRecord = {
      id: this.idSequence++,
      createdByUserId: input.createdByUserId,
      uploaderName: input.createdByUserId === 9 ? 'operator' : input.createdByUserId === 2 ? 'operator' : 'admin',
      sourceProjectId: input.sourceProjectId,
      name: input.name,
      assetType: input.assetType,
      categoryId: input.categoryId ?? null,
      groupSyncEnabled:
        input.categoryId === null || input.categoryId === undefined
          ? null
          : this.categoryMetaByProject.get(input.sourceProjectId)?.get(input.categoryId)?.syncEnabled ?? null,
      syncMode: input.syncMode,
      ossKey: input.ossKey,
      arkGroupId: input.arkGroupId,
      arkAssetId: input.arkAssetId ?? null,
      arkStatus: input.arkStatus ?? 'pending',
      arkError: input.arkError ?? null,
      tags: input.tags,
      projectIds: [],
      projectNames: [],
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    }
    this.assets.set(record.id, record)
    return record
  }

  public async attachProjects(assetId: number, links: AssetProjectLinkInput[]): Promise<void> {
    const asset = this.assets.get(assetId)
    if (!asset) {
      return
    }

    for (const link of links) {
      const nextProjectIds = new Set(asset.projectIds)
      nextProjectIds.add(link.projectId)
      asset.projectIds = [...nextProjectIds].sort((left, right) => left - right)
      asset.projectNames = asset.projectIds.map((projectId) => `项目${projectId}`)

      if (link.projectId === asset.sourceProjectId) {
        asset.categoryId = link.categoryId
        if (link.categoryId) {
          const category = this.categoryMetaByProject.get(link.projectId)?.get(link.categoryId)
          asset.groupSyncEnabled = category?.syncEnabled ?? null
          asset.arkGroupId = category?.arkGroupId ?? asset.arkGroupId
        }
      }
    }

    asset.updatedAt = new Date('2026-04-04T00:10:00.000Z')
  }

  public async list(params: AssetQueryParams & { projectId: number; scope: 'project' | 'global' }): Promise<{ items: AssetRecord[]; total: number }> {
    let items = [...this.assets.values()]

    if (params.scope === 'project') {
      items = items.filter((item) => item.projectIds.includes(params.projectId))
    }
    if (params.status) {
      items = items.filter((item) => item.arkStatus === params.status)
    }
    if (params.assetType) {
      items = items.filter((item) => item.assetType === params.assetType)
    }
    if (params.keyword) {
      items = items.filter((item) => item.name.includes(params.keyword) || item.tags.some((tag) => tag.includes(params.keyword!)))
    }
    if (params.uploader) {
      items = items.filter((item) => (item.uploaderName ?? '').includes(params.uploader))
    }
    if (params.categoryId) {
      items = items.filter((item) => item.categoryId === params.categoryId)
    }
    if (params.createdByUserId) {
      items = items.filter((item) => item.createdByUserId === params.createdByUserId)
    }

    return { items, total: items.length }
  }

  public async findById(id: number, params?: { projectId?: number; scope?: 'project' | 'global' }): Promise<AssetRecord | null> {
    const asset = this.assets.get(id) ?? null
    if (!asset) {
      return null
    }

    if (params?.scope === 'project' && params.projectId && !asset.projectIds.includes(params.projectId)) {
      return null
    }

    return asset
  }

  public async findByArkAssetId(arkAssetId: string): Promise<AssetRecord | null> {
    return [...this.assets.values()].find((asset) => asset.arkAssetId === arkAssetId) ?? null
  }

  public async update(
    id: number,
    patch: {
      name?: string
      categoryId?: number | null
      syncMode?: 'inherit' | 'enabled' | 'disabled'
      arkGroupId?: string | null
      arkAssetId?: string | null
      arkStatus?: 'pending' | 'processing' | 'active' | 'failed' | 'deleting'
      arkError?: string | null
      tags?: string[]
    }
  ): Promise<AssetRecord | null> {
    const current = this.assets.get(id)
    if (!current) {
      return null
    }

    const next: AssetRecord = {
      ...current,
      name: patch.name ?? current.name,
      categoryId: patch.categoryId ?? current.categoryId,
      syncMode: patch.syncMode ?? current.syncMode,
      arkGroupId: patch.arkGroupId ?? current.arkGroupId,
      arkAssetId: patch.arkAssetId ?? current.arkAssetId,
      arkStatus: patch.arkStatus ?? current.arkStatus,
      arkError: patch.arkError ?? current.arkError,
      tags: patch.tags ?? current.tags,
      updatedAt: new Date('2026-04-04T00:10:00.000Z'),
    }

    this.assets.set(id, next)
    return next
  }

  public async listByStatuses(statuses: string[]): Promise<AssetRecord[]> {
    return [...this.assets.values()].filter((item) => statuses.includes(item.arkStatus))
  }

  public async deleteById(id: number): Promise<void> {
    this.assets.delete(id)
  }

  public async isReferenced(assetId: number): Promise<boolean> {
    return this.referencedAssetIds.has(assetId)
  }

  public async isReferencedByAtelier(assetId: number): Promise<boolean> {
    const asset = this.assets.get(assetId)
    return Boolean(asset?.tags.includes('infinite-atelier') && this.referencedAssetIds.has(assetId))
  }

  public async countProjectLinks(assetId: number): Promise<number> {
    return this.assets.get(assetId)?.projectIds.length ?? 0
  }

  public async getCategory(
    projectId: number,
    categoryId: number
  ): Promise<{ id: number; syncEnabled: boolean; arkGroupId: string | null } | null> {
    const category = this.categoryMetaByProject.get(projectId)?.get(categoryId)
    if (!category) {
      return null
    }

    return {
      id: categoryId,
      syncEnabled: category.syncEnabled,
      arkGroupId: category.arkGroupId,
    }
  }

  public async findProjectCode(projectId: number): Promise<string | null> {
    return this.projectCodes.get(projectId) ?? null
  }

  public async unlinkFromProject(assetId: number, projectId: number): Promise<number> {
    const asset = this.assets.get(assetId)
    if (!asset) {
      return 0
    }

    asset.projectIds = asset.projectIds.filter((currentProjectId) => currentProjectId !== projectId)
    asset.projectNames = asset.projectIds.map((currentProjectId) => `项目${currentProjectId}`)
    if (asset.sourceProjectId === projectId) {
      asset.categoryId = null
    }
    asset.updatedAt = new Date('2026-04-04T00:10:00.000Z')
    return asset.projectIds.length
  }

  public async hasProjectLink(assetId: number, projectId: number): Promise<boolean> {
    return this.assets.get(assetId)?.projectIds.includes(projectId) ?? false
  }

  public async removeProjectLink(input: {
    assetId: number
    projectId: number
    allowRemoveLastLink: boolean
    preventReferencedOrphan: boolean
    arkAssetId: string | null
  }): Promise<{
    status: 'not_linked' | 'unlinked' | 'orphaned' | 'blocked_last_link' | 'unchanged_last_link'
    remainingProjectCount: number
  }> {
    const asset = this.assets.get(input.assetId)
    if (!asset) {
      return {
        status: 'not_linked',
        remainingProjectCount: 0,
      }
    }

    const hasTargetLink = asset.projectIds.includes(input.projectId)
    if (!hasTargetLink) {
      return {
        status: 'not_linked',
        remainingProjectCount: asset.projectIds.length,
      }
    }

    if (asset.projectIds.length > 1) {
      const remainingProjectCount = await this.unlinkFromProject(input.assetId, input.projectId)
      return {
        status: 'unlinked',
        remainingProjectCount,
      }
    }

    if (!input.allowRemoveLastLink) {
      return {
        status: 'unchanged_last_link',
        remainingProjectCount: 1,
      }
    }

    if (input.preventReferencedOrphan && this.referencedAssetIds.has(input.assetId)) {
      return {
        status: 'blocked_last_link',
        remainingProjectCount: 1,
      }
    }

    const remainingProjectCount = await this.unlinkFromProject(input.assetId, input.projectId)
    return {
      status: 'orphaned',
      remainingProjectCount,
    }
  }
}

class FakeAssetDispatcher implements AssetDispatcher {
  public readonly syncIds: number[] = []
  public readonly deleteIds: number[] = []

  public async enqueueSync(assetId: number): Promise<void> {
    this.syncIds.push(assetId)
  }

  public async enqueueDelete(assetId: number): Promise<void> {
    this.deleteIds.push(assetId)
  }
}

class FakeOssService implements OssServiceContract {
  public async getSignedUrl(ossKey: string): Promise<string> {
    return `https://signed.example.com/${ossKey}`
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
      bucket: 'comic-drama-assets',
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

  public async listAccessibleProjectsForUser(userId: number, role: 'admin' | 'user'): Promise<ProjectAccessRecord[]> {
    if (role === 'admin') {
      return (
        this.userProjects.get(userId) ?? [
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
            projectCode: 'space-quest',
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

describe('/api/assets', () => {
  const signToken = (role: 'admin' | 'user', sub = '1') =>
    jwt.sign({ sub, role }, 'issue-5-secret', { expiresIn: '8h' })
  const seedAssets = (): SeedAsset[] => [
    {
      id: 1,
      createdByUserId: 1,
      uploaderName: 'admin',
      sourceProjectId: 101,
      name: '主角立绘',
      assetType: 'Image',
      categoryId: 2,
      groupSyncEnabled: true,
      syncMode: 'inherit',
      ossKey: 'assets/a.png',
      arkGroupId: 'group-1',
      arkAssetId: 'asset-1',
      arkStatus: 'active',
      arkError: null,
      tags: ['主角'],
      projectIds: [101, 202],
      projectNames: ['项目101', '项目202'],
    },
    {
      id: 2,
      createdByUserId: 1,
      uploaderName: 'admin',
      sourceProjectId: 101,
      name: '待同步素材',
      assetType: 'Image',
      categoryId: null,
      groupSyncEnabled: null,
      syncMode: 'inherit',
      ossKey: 'assets/b.png',
      arkGroupId: 'group-1',
      arkAssetId: null,
      arkStatus: 'pending',
      arkError: null,
      tags: [],
      projectIds: [101],
      projectNames: ['项目101'],
    },
    {
      id: 3,
      createdByUserId: 2,
      uploaderName: 'operator',
      sourceProjectId: 202,
      name: '外部项目素材',
      assetType: 'Image',
      categoryId: 8,
      groupSyncEnabled: true,
      syncMode: 'inherit',
      ossKey: 'assets/c.png',
      arkGroupId: 'group-2',
      arkAssetId: 'asset-3',
      arkStatus: 'active',
      arkError: null,
      tags: ['外部'],
      projectIds: [202],
      projectNames: ['项目202'],
    },
    {
      id: 4,
      createdByUserId: 9,
      uploaderName: 'member-user',
      sourceProjectId: 101,
      name: '成员自有素材',
      assetType: 'Image',
      categoryId: 2,
      groupSyncEnabled: true,
      syncMode: 'inherit',
      ossKey: 'assets/member.png',
      arkGroupId: 'group-1',
      arkAssetId: 'asset-4',
      arkStatus: 'active',
      arkError: null,
      tags: ['成员'],
      projectIds: [101],
      projectNames: ['项目101'],
    },
  ]

  let repository: FakeAssetRepository
  let dispatcher: FakeAssetDispatcher
  let projectAccessRepository: FakeProjectAccessRepository
  const projectId = '101'

  beforeEach(() => {
    process.env.JWT_SECRET = 'issue-5-secret'
    repository = new FakeAssetRepository()
    dispatcher = new FakeAssetDispatcher()
    projectAccessRepository = new FakeProjectAccessRepository()
    repository.seed(seedAssets(), [1])
    repository.seedCategories([
      { projectId: 101, categoryIds: [2] },
      { projectId: 202, categoryIds: [8] },
    ])
    repository.seedCategoryMeta([
      { projectId: 101, categoryId: 2, syncEnabled: true, arkGroupId: 'group-1' },
      { projectId: 202, categoryId: 8, syncEnabled: true, arkGroupId: 'group-2' },
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
            projectCode: 'space-quest',
            projectStatus: 'active',
            projectRole: 'manager',
          },
        ],
      },
      {
        userId: 9,
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

  it('创建素材时写入当前项目关联并派发同步任务', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/assets')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)
      .send({
        name: '新素材',
        assetType: 'Image',
        categoryId: 2,
        ossKey: 'assets/new.png',
        tags: ['新'],
        linkProjectIds: [],
      })

    expect(response.status).toBe(200)
    expect(response.body.data.arkStatus).toBe('pending')
    expect(response.body.data.projectIds).toEqual([101])
    expect(response.body.data.effectiveSync).toBe(true)
    expect(dispatcher.syncIds).toEqual([10])
  })

  it('创建素材时禁止引用其他项目的分类', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/assets')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)
      .send({
        name: '跨项目分类素材',
        assetType: 'Image',
        categoryId: 8,
        ossKey: 'assets/cross-project.png',
        tags: [],
        linkProjectIds: [],
      })

    expect(response.status).toBe(422)
    expect(response.body.code).toBe(422)
  })

  it('同一项目内创建素材时不允许名称重名', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/assets')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)
      .send({
        name: '主角立绘',
        assetType: 'Image',
        categoryId: 2,
        ossKey: 'assets/duplicate.png',
        tags: [],
        linkProjectIds: [],
      })

    expect(response.status).toBe(422)
    expect(response.body.message).toContain('素材名称已存在')
  })

  it('上传视频素材时直接标记为可用且不进入火山补推', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/assets')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)
      .send({
        name: '真人口播样片',
        assetType: 'Video',
        categoryId: 2,
        ossKey: 'assets/real-person.mp4',
        tags: ['真人'],
        linkProjectIds: [],
      })

    expect(response.status).toBe(200)
    expect(response.body.data.arkStatus).toBe('active')
    expect(response.body.data.effectiveSync).toBe(false)
    expect(dispatcher.syncIds).toEqual([])
  })

  it('可在上传前校验当前项目内素材名称是否可用', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const availableResponse = await request(app.callback())
      .get('/api/assets/name-available?name=全新素材')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)

    expect(availableResponse.status).toBe(200)
    expect(availableResponse.body.data).toEqual({
      available: true,
    })

    const duplicatedResponse = await request(app.callback())
      .get('/api/assets/name-available?name=主角立绘')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)

    expect(duplicatedResponse.status).toBe(200)
    expect(duplicatedResponse.body.data).toEqual({
      available: false,
    })
  })

  it('同一项目内编辑素材名称时不允许改成重复名称', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .patch('/api/assets/2')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)
      .send({
        name: '主角立绘',
      })

    expect(response.status).toBe(422)
    expect(response.body.message).toContain('素材名称已存在')
  })

  it('列表接口只返回当前项目关联素材', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/assets')
      .set('Authorization', `Bearer ${signToken('user')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.total).toBe(3)
    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([1, 2, 4])
    expect(response.body.data.items[0].thumbnailUrl).toBe('https://signed.example.com/assets/a.png')
    expect(response.body.data.items[0].uploaderName).toBe('admin')
  })

  it('列表接口支持按上传人筛选', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/assets?uploader=operator')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', '202')

    expect(response.status).toBe(200)
    expect(response.body.data.total).toBe(1)
    expect(response.body.data.items[0].id).toBe(3)
    expect(response.body.data.items[0].uploaderName).toBe('operator')
  })

  it('列表接口支持按标签关键字筛选', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/assets?keyword=成员')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([4])
  })

  it('管理员访问素材列表时也严格限定当前项目', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/assets?scope=global')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.scope).toBe('project')
    expect(response.body.data.total).toBe(3)
    expect(response.body.data.items.every((item: { projectIds: number[] }) => item.projectIds.includes(101))).toBe(true)
  })

  it('详情接口返回单条素材与签名 thumbnailUrl', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/assets/1')
      .set('Authorization', `Bearer ${signToken('user')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.id).toBe(1)
    expect(response.body.data.thumbnailUrl).toBe('https://signed.example.com/assets/a.png')
  })

  it('缺少 X-Project-Id 时返回 422', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/assets')
      .set('Authorization', `Bearer ${signToken('user')}`)

    expect(response.status).toBe(422)
    expect(response.body.code).toBe(422)
  })

  it('访问未授权项目时返回 403', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/assets')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', '202')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe(403)
  })

  it('手动补推会重新派发 pending/processing，并补救卡在 deleting 的任务', async () => {
    repository.seed([
      ...seedAssets(),
      {
        id: 5,
        createdByUserId: 1,
        uploaderName: 'admin',
        sourceProjectId: 101,
        name: '删除中素材',
        assetType: 'Image',
        categoryId: null,
        groupSyncEnabled: null,
        syncMode: 'inherit',
        ossKey: 'assets/deleting.png',
        arkGroupId: 'group-1',
        arkAssetId: 'asset-deleting',
        arkStatus: 'deleting',
        arkError: '火山素材删除失败: The specified asset asset-deleting is not found',
        tags: [],
        projectIds: [101],
        projectNames: ['项目101'],
      },
    ])

    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/assets/sync')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.count).toBe(2)
    expect(dispatcher.syncIds).toEqual([2])
    expect(dispatcher.deleteIds).toEqual([5])
  })

  it('普通用户不能手动补推同步任务', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/assets/sync')
      .set('Authorization', `Bearer ${signToken('user')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(403)
    expect(dispatcher.syncIds).toEqual([])
  })

  it('多项目关联素材删除时仅解除当前项目关联', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .delete('/api/assets/1')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.operation).toBe('unlinked')
    expect(response.body.data.remainingProjectCount).toBe(1)
    expect(dispatcher.deleteIds).toEqual([])
  })

  it('单项目且未被引用时删除接口进入物理删除队列', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .delete('/api/assets/2')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.operation).toBe('physical_delete_queued')
    expect(response.body.data.asset.arkStatus).toBe('deleting')
    expect(dispatcher.deleteIds).toEqual([2])
  })

  it('仅被已完成任务引用的素材仍可删除', async () => {
    repository.seed(seedAssets(), [], [2])

    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .delete('/api/assets/2')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.operation).toBe('physical_delete_queued')
    expect(dispatcher.deleteIds).toEqual([2])
  })

  it('member 在素材列表中可以看到项目内全部素材', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/assets')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([1, 2, 4])
  })

  it('member 不能编辑其他人上传的素材', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .patch('/api/assets/2')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)
      .send({
        categoryId: 2,
      })

    expect(response.status).toBe(404)
  })

  it('平台管理员在当前项目仅为 member 时不能删除素材', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .delete('/api/assets/2')
      .set('Authorization', `Bearer ${signToken('admin', '9')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(403)
    expect(response.body.message).toContain('当前项目角色不允许删除素材')
    expect(dispatcher.deleteIds).toEqual([])
  })

  it('删除最后一个项目关联且素材被引用时返回 409', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    await request(app.callback())
      .delete('/api/assets/1')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    const response = await request(app.callback())
      .delete('/api/assets/1')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', '202')

    expect(response.status).toBe(409)
    expect(response.body.code).toBe(409)
    expect(dispatcher.deleteIds).toEqual([])
  })

  it('管理员解除最后一个项目关联且素材被引用时返回 409', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    await request(app.callback())
      .delete('/api/assets/1')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)

    const response = await request(app.callback())
      .delete('/api/assets/1/projects/202')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', '202')

    expect(response.status).toBe(409)
    expect(response.body.code).toBe(409)
  })

  it('管理员可把素材关联到其他项目', async () => {
    const app = createApp({
      assetRepository: repository,
      assetDispatcher: dispatcher,
      ossService: new FakeOssService(),
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/assets/2/projects')
      .set('Authorization', `Bearer ${signToken('admin')}`)
      .set('X-Project-Id', projectId)
      .send({ projectIds: [202] })

    expect(response.status).toBe(200)
    expect(response.body.data.projectIds).toEqual([101, 202])
  })
})
