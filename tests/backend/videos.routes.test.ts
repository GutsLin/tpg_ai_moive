import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../backend/src/app'
import type { ConfigStore, StoredConfigEntry } from '../../backend/src/services/config.service'
import type { OssServiceContract } from '../../backend/src/services/oss.service'
import type {
  VideoAssetReferenceResolver,
  VideoDispatcher,
  VideoDurationEstimate,
  VideoExportQueryParams,
  VideoQueryParams,
  VideoRecord,
  VideoRepository,
  VideoTaskAssetReference,
} from '../../backend/src/services/video.service'
import type {
  ProjectAccessRecord,
  ProjectAccessRepository,
} from '../../backend/src/services/project-access.service'

class FakeVideoRepository implements VideoRepository {
  private records = new Map<number, VideoRecord>()
  private idSequence = 100
  public readonly savedReferences = new Map<number, VideoTaskAssetReference[]>()
  public readonly updates: Array<{ id: number; patch: Partial<VideoRecord> }> = []
  public readonly exportCalls: VideoExportQueryParams[] = []

  public async claimDownload(): Promise<string | null> { return null }
  public async updateDownloadState(): Promise<VideoRecord | null> { return null }

  public seed(records: Array<Omit<VideoRecord, 'nextPollAt' | 'lastArkStatus' | 'lastArkStatusChangedAt' | 'lastPolledAt'> & Partial<Pick<VideoRecord, 'nextPollAt' | 'lastArkStatus' | 'lastArkStatusChangedAt' | 'lastPolledAt'>>>) {
    this.records = new Map(records.map((item) => [
      item.id,
      {
        nextPollAt: null,
        lastArkStatus: null,
        lastArkStatusChangedAt: null,
        lastPolledAt: null,
        ...item,
      },
    ]))
  }

  public async create(input: Omit<VideoRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<VideoRecord> {
    const record: VideoRecord = {
      ...input,
      id: this.idSequence++,
      nextPollAt: input.nextPollAt,
      lastArkStatus: input.lastArkStatus,
      lastArkStatusChangedAt: input.lastArkStatusChangedAt,
      lastPolledAt: input.lastPolledAt,
      createdAt: new Date('2026-04-04T10:00:00.000Z'),
      updatedAt: new Date('2026-04-04T10:00:00.000Z'),
    }
    this.records.set(record.id, record)
    return record
  }

  public async list(params: VideoQueryParams): Promise<{ items: VideoRecord[]; total: number }> {
    let items = [...this.records.values()].filter((item) => item.projectId === params.projectId)

    if (params.mine) {
      items = items.filter((item) => item.userId === params.userId)
    }

    if (params.status) {
      items = items.filter((item) => item.status === params.status)
    }

    if (params.mode) {
      items = items.filter((item) => item.requestSnapshot.mode === params.mode)
    }

    if (params.q) {
      const keyword = params.q.toLowerCase()
      items = items.filter((item) => item.promptRaw.toLowerCase().includes(keyword) || item.prompt.toLowerCase().includes(keyword))
    }

    if (params.dateFrom) {
      const dateFrom = new Date(params.dateFrom)
      items = items.filter((item) => item.createdAt >= dateFrom)
    }

    if (params.dateTo) {
      const dateTo = new Date(params.dateTo)
      items = items.filter((item) => item.createdAt <= dateTo)
    }

    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 20
    const offset = (page - 1) * pageSize
    items = items.sort((left, right) => right.id - left.id)

    return {
      items: items.slice(offset, offset + pageSize),
      total: items.length,
    }
  }

  public async findById(id: number, options?: { projectId?: number }): Promise<VideoRecord | null> {
    const record = this.records.get(id) ?? null
    if (!record) {
      return null
    }

    if (options?.projectId && record.projectId !== options.projectId) {
      return null
    }

    return record
  }

  public async getAnalytics(params: {
    userId: number
    projectId: number
    mine?: boolean
    dateFrom?: string
    dateTo?: string
    model?: string
    status?: VideoRecord['status']
  }) {
    let items = [...this.records.values()].filter((item) => item.projectId === params.projectId)

    if (params.mine) {
      items = items.filter((item) => item.userId === params.userId)
    }

    if (params.status) {
      items = items.filter((item) => item.status === params.status)
    }

    if (params.model) {
      items = items.filter((item) => item.model === params.model)
    }

    if (params.dateFrom) {
      const dateFrom = new Date(params.dateFrom)
      items = items.filter((item) => item.createdAt >= dateFrom)
    }

    if (params.dateTo) {
      const dateTo = new Date(params.dateTo)
      items = items.filter((item) => item.createdAt <= dateTo)
    }

    const totalRequests = items.length
    const succeededCount = items.filter((item) => item.status === 'succeeded').length
    const totalTokensConsumed = items.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0)
    const totalTokensSucceeded = items.reduce(
      (sum, item) => sum + (item.status === 'succeeded' ? item.totalTokens ?? 0 : 0),
      0
    )
    const statusOrder = ['pending', 'processing', 'succeeded', 'failed'] as const
    const userNameMap = new Map([
      [1, '管理员甲'],
      [2, '运营乙'],
      [9, '成员丙'],
    ])

    return {
      overview: {
        totalRequests,
        successRate: totalRequests > 0 ? succeededCount / totalRequests : 0,
        avgDurationSeconds:
          totalRequests > 0 ? items.reduce((sum, item) => sum + (item.duration ?? 0), 0) / totalRequests : 0,
        totalTokensConsumed,
        totalTokensSucceeded,
        avgTokensPerTask: totalRequests > 0 ? totalTokensConsumed / totalRequests : 0,
      },
      statusDistribution: statusOrder
        .map((status) => ({
          status,
          count: items.filter((item) => item.status === status).length,
        }))
        .filter((item) => item.count > 0),
      modelDistribution: [...new Set(items.map((item) => item.model))]
        .map((model) => ({
          model,
          count: items.filter((item) => item.model === model).length,
        }))
        .sort((left, right) => right.count - left.count || left.model.localeCompare(right.model)),
      userTokenDistribution: [...new Set(items.map((item) => item.userId))]
        .map((userId) => {
          const userItems = items.filter((item) => item.userId === userId)
          const totalTokens = userItems.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0)

          return {
            userId,
            userName: userNameMap.get(userId) ?? `用户${userId}`,
            requestCount: userItems.length,
            totalTokens,
            shareRatio: totalTokensConsumed > 0 ? totalTokens / totalTokensConsumed : 0,
          }
        })
        .sort((left, right) => right.totalTokens - left.totalTokens || right.requestCount - left.requestCount || left.userId - right.userId),
    }
  }

  public async getExportData(params: VideoExportQueryParams) {
    this.exportCalls.push(params)
    let items = [...this.records.values()]

    if (params.projectId !== undefined) {
      items = items.filter((item) => item.projectId === params.projectId)
    }
    if (params.mine) {
      items = items.filter((item) => item.userId === params.userId)
    }
    if (params.status) {
      items = items.filter((item) => item.status === params.status)
    }
    if (params.model) {
      items = items.filter((item) => item.model === params.model)
    }
    if (params.dateFrom) {
      const dateFrom = new Date(params.dateFrom)
      items = items.filter((item) => item.createdAt >= dateFrom)
    }
    if (params.dateTo) {
      const dateTo = new Date(params.dateTo)
      items = items.filter((item) => item.createdAt <= dateTo)
    }

    const projectNameMap = new Map([
      [101, '都市逆袭'],
      [202, '其他项目'],
    ])
    const userNameMap = new Map([
      [1, '管理员甲'],
      [2, '运营乙'],
      [9, '成员丙'],
    ])
    const modelGroups = new Map<string, VideoRecord[]>()
    const projectGroups = new Map<number, VideoRecord[]>()
    const memberGroups = new Map<string, VideoRecord[]>()

    for (const item of items) {
      const modelKey = `${item.projectId}\u0000${item.model}`
      modelGroups.set(modelKey, [...(modelGroups.get(modelKey) ?? []), item])
      projectGroups.set(item.projectId, [...(projectGroups.get(item.projectId) ?? []), item])
      const memberKey = `${item.projectId}\u0000${item.userId}`
      memberGroups.set(memberKey, [...(memberGroups.get(memberKey) ?? []), item])
    }

    const byProjectName = (left: { projectName: string }, right: { projectName: string }) =>
      left.projectName.localeCompare(right.projectName, 'zh-CN')

    return {
      models: [...modelGroups.values()]
        .map((group) => ({
          projectName: projectNameMap.get(group[0]!.projectId) ?? `项目${group[0]!.projectId}`,
          model: group[0]!.model,
          totalRequests: group.length,
          avgDurationSeconds: group.reduce((sum, item) => sum + (item.duration ?? 0), 0) / group.length,
          totalTokensConsumed: group.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0),
          totalTokensSucceeded: group.reduce(
            (sum, item) => sum + (item.status === 'succeeded' ? item.totalTokens ?? 0 : 0),
            0
          ),
        }))
        .sort((left, right) => byProjectName(left, right) || left.model.localeCompare(right.model)),
      projects: [...projectGroups.entries()]
        .map(([projectId, group]) => {
          const succeededItems = group.filter((item) => item.status === 'succeeded')
          return {
            projectName: projectNameMap.get(projectId) ?? `项目${projectId}`,
            validRequestCount: succeededItems.length,
            avgDurationSeconds: succeededItems.length > 0
              ? succeededItems.reduce((sum, item) => sum + (item.duration ?? 0), 0) / succeededItems.length
              : 0,
          }
        })
        .sort(byProjectName),
      members: [...memberGroups.values()]
        .map((group) => ({
          projectName: projectNameMap.get(group[0]!.projectId) ?? `项目${group[0]!.projectId}`,
          userName: userNameMap.get(group[0]!.userId) ?? `用户${group[0]!.userId}`,
          requestCount: group.length,
          totalTokensConsumed: group.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0),
        }))
        .sort((left, right) => byProjectName(left, right) || left.userName.localeCompare(right.userName, 'zh-CN')),
    }
  }

  public async update(id: number, patch: Partial<VideoRecord>): Promise<VideoRecord | null> {
    const current = this.records.get(id)
    if (!current) {
      return null
    }

    const next: VideoRecord = {
      ...current,
      ...patch,
      updatedAt: new Date('2026-04-04T10:05:00.000Z'),
    }
    this.records.set(id, next)
    this.updates.push({ id, patch })
    return next
  }

  public async saveAssetReferences(taskId: number, references: VideoTaskAssetReference[]): Promise<void> {
    this.savedReferences.set(taskId, references)
  }

  public async listStaleProcessingTasks(): Promise<VideoRecord[]> {
    return []
  }

  public async listSyncableArkTasks(): Promise<VideoRecord[]> {
    return []
  }

  public async getDurationEstimate(input: {
    model: string
    duration: number | null
    ratio: string | null
    resolution: string | null
  }): Promise<VideoDurationEstimate | null> {
    if (
      input.model === 'doubao-seedance-2-0-260128' &&
      input.duration === 5 &&
      input.ratio === '16:9' &&
      input.resolution === '720p'
    ) {
      return {
        sampleSize: 3,
        avgSeconds: 110,
      }
    }

    return null
  }
}

class FakeVideoDispatcher implements VideoDispatcher {
  public readonly createIds: number[] = []
  public readonly syncCalls: Array<{ taskId: number; delayMs?: number; runAt?: Date }> = []
  public readonly downloadIds: number[] = []

  public async enqueueCreate(taskId: number): Promise<void> {
    this.createIds.push(taskId)
  }

  public async enqueueSync(taskId: number, options?: { delayMs?: number; runAt?: Date }): Promise<void> {
    this.syncCalls.push({
      taskId,
      ...(options?.delayMs === undefined ? {} : { delayMs: options.delayMs }),
      ...(options?.runAt === undefined ? {} : { runAt: options.runAt }),
    })
  }

  public async enqueueDownload(taskId: number): Promise<void> {
    this.downloadIds.push(taskId)
  }
}

class FakeConfigStore implements ConfigStore {
  public async getByKey(key: string): Promise<StoredConfigEntry | null> {
    if (key !== 'oss_signed_url_ttl') {
      return null
    }

    return {
      key,
      value: '600',
      isSecret: false,
      description: '签名有效期',
    }
  }

  public async list(): Promise<StoredConfigEntry[]> {
    return [
      {
        key: 'oss_signed_url_ttl',
        value: '600',
        isSecret: false,
        description: '签名有效期',
      },
    ]
  }

  public async upsert(): Promise<void> {}
}

class FakeOssService implements OssServiceContract {
  public readonly signedRequests: Array<{ ossKey: string; ttlSeconds?: number }> = []

  public async getSignedUrl(ossKey: string, ttlSeconds?: number): Promise<string> {
    this.signedRequests.push({ ossKey, ttlSeconds })
    return `https://signed.example.com/${ossKey}?ttl=${ttlSeconds ?? 'default'}`
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

class FakeVideoAssetReferenceResolver implements VideoAssetReferenceResolver {
  public readonly calls: Array<{ projectId: number; refs: string[] }> = []

  public async resolve(projectId: number, _content: unknown[]): Promise<VideoTaskAssetReference[]> {
    this.calls.push({ projectId, refs: ['asset-1'] })
    if (projectId !== 101) {
      return []
    }

    return [{ assetId: 501, role: 'reference_image' }]
  }
}

describe('/api/videos', () => {
  const signToken = (role: 'admin' | 'user', sub = '1') =>
    jwt.sign({ sub, role }, 'issue-7-secret', { expiresIn: '8h' })

  let repository: FakeVideoRepository
  let dispatcher: FakeVideoDispatcher
  let ossService: FakeOssService
  let projectAccessRepository: FakeProjectAccessRepository
  let assetReferenceResolver: FakeVideoAssetReferenceResolver
  const projectId = '101'

  beforeEach(() => {
    process.env.JWT_SECRET = 'issue-7-secret'
    repository = new FakeVideoRepository()
    dispatcher = new FakeVideoDispatcher()
    ossService = new FakeOssService()
    projectAccessRepository = new FakeProjectAccessRepository()
    assetReferenceResolver = new FakeVideoAssetReferenceResolver()
    repository.seed([
      {
        id: 1,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-1',
        idempotencyKey: 'idem-1',
        status: 'succeeded',
        model: 'doubao-seedance-2-0-260128',
        prompt: '生成主角视频',
        promptRaw: '@角色A 生成主角视频',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: {
          mode: 'frames',
          model: 'doubao-seedance-2-0-260128',
          content: [
            { type: 'text', text: '生成主角视频' },
            { type: 'image_url', image_url: { url: 'asset://asset-start' }, assetId: 701, role: 'first_frame' },
          ],
        },
        arkVideoUrl: 'https://ark.example.com/video.mp4',
        videoOssKey: 'videos/task-1.mp4',
        completionTokens: 123,
        totalTokens: 456,
        errorMessage: null,
        createdAt: new Date('2026-04-04T10:00:00.000Z'),
        updatedAt: new Date('2026-04-04T10:01:00.000Z'),
      },
      {
        id: 2,
        userId: 2,
        projectId: 101,
        arkTaskId: 'task-2',
        idempotencyKey: 'idem-2',
        status: 'processing',
        model: 'doubao-seedance-2-0-260128',
        prompt: '同项目其他人任务',
        promptRaw: '同项目其他人任务',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: {
          mode: 'omni',
          model: 'doubao-seedance-2-0-260128',
          content: [
            { type: 'text', text: '同项目其他人任务' },
            { type: 'audio_url', audio_url: { url: 'asset://asset-audio' }, assetId: 702, role: 'reference_audio' },
          ],
        },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-05T10:00:00.000Z'),
        updatedAt: new Date('2026-04-05T10:00:00.000Z'),
      },
      {
        id: 3,
        userId: 1,
        projectId: 202,
        arkTaskId: 'task-3',
        idempotencyKey: 'idem-3',
        status: 'failed',
        model: 'doubao-seedance-2-0-260128',
        prompt: '其他项目任务',
        promptRaw: '其他项目任务',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: {
          mode: 'omni',
          model: 'doubao-seedance-2-0-260128',
          content: [{ type: 'text', text: '其他项目任务' }],
        },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: 'failed',
        createdAt: new Date('2026-04-03T10:00:00.000Z'),
        updatedAt: new Date('2026-04-03T10:00:00.000Z'),
      },
      {
        id: 4,
        userId: 9,
        projectId: 101,
        arkTaskId: 'task-4',
        idempotencyKey: 'idem-4',
        status: 'pending',
        model: 'doubao-seedance-2-0-260128',
        prompt: '成员自己的任务',
        promptRaw: '成员自己的任务',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: {
          mode: 'frames',
          model: 'doubao-seedance-2-0-260128',
          content: [{ type: 'text', text: '成员自己的任务' }],
        },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-06T10:00:00.000Z'),
        updatedAt: new Date('2026-04-06T10:00:00.000Z'),
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

  it('创建任务时写入 project_id 并保存素材引用', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/videos')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)
      .send({
        mode: 'omni',
        model: 'doubao-seedance-2-0-260128',
        prompt: '角色A 模仿角色B动作',
        promptRaw: '@角色A 模仿 @角色B 动作',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        content: [
          { type: 'text', text: '角色A 模仿角色B动作' },
          { type: 'image_url', image_url: { url: 'asset://asset-1' }, role: 'reference_image' },
        ],
      })

    expect(response.status).toBe(200)
    expect(response.body.data.status).toBe('pending')
    expect(response.body.data.projectId).toBe(101)
    expect(response.body.data.mode).toBe('omni')
    expect(dispatcher.createIds).toEqual([100])
    expect(repository.savedReferences.get(100)).toEqual([{ assetId: 501, role: 'reference_image' }])
  })

  it('非法参数返回 422', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/videos')
      .set('Authorization', `Bearer ${signToken('user')}`)
      .set('X-Project-Id', projectId)
      .send({
        prompt: '',
        content: [],
      })

    expect(response.status).toBe(422)
    expect(response.body.code).toBe(422)
  })

  it('首尾帧模式不接受音视频参考', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/videos')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)
      .send({
        mode: 'frames',
        model: 'doubao-seedance-2-0-260128',
        prompt: '保持镜头推进',
        promptRaw: '保持镜头推进',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        content: [
          { type: 'text', text: '保持镜头推进' },
          { type: 'image_url', image_url: { url: 'asset://asset-1' }, role: 'first_frame' },
          { type: 'video_url', video_url: { url: 'asset://asset-video' }, role: 'reference_video' },
        ],
      })

    expect(response.status).toBe(422)
  })

  it('列表接口默认返回当前项目全部任务', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.total).toBe(3)
    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([4, 2, 1])
    expect(response.body.data.items[1]).toMatchObject({
      status: 'processing',
      mode: 'omni',
      estimatedTotalSeconds: 110,
      estimateSampleSize: 3,
    })
  })

  it('mine=true 时只返回当前用户创建的项目任务', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos?mine=true')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.total).toBe(1)
    expect(response.body.data.items[0].id).toBe(1)
  })

  it('列表接口支持关键词、时间、模式和状态叠加筛选', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos?q=同项目&status=processing&mode=frames&dateFrom=2026-04-05T00:00:00.000Z&dateTo=2026-04-05T23:59:59.999Z')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.total).toBe(0)
    expect(response.body.data.items).toEqual([])
  })

  it('member 默认只能看到自己创建的任务', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.total).toBe(1)
    expect(response.body.data.items[0].id).toBe(4)
  })

  it('member 在筛选场景下仍只能看到自己的任务', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos?mine=false&q=同项目&status=processing&mode=omni')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.total).toBe(0)
    expect(response.body.data.items).toEqual([])
  })

  it('详情接口按项目返回任务并附带签名 videoUrl', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos/1')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.videoUrl).toBe('https://signed.example.com/videos/task-1.mp4?ttl=600')
    expect(response.body.data.mode).toBe('frames')
    expect(response.body.data.replayDraft).toEqual({
      mode: 'frames',
      model: 'doubao-seedance-2-0-260128',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      promptRaw: '@角色A 生成主角视频',
      assets: [{ assetId: 701, role: 'first_frame' }],
    })
    expect(ossService.signedRequests).toEqual([{ ossKey: 'videos/task-1.mp4', ttlSeconds: 600 }])
  })

  it('详情接口为 omni 任务返回可回填的 replayDraft', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos/2')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.replayDraft).toEqual({
      mode: 'omni',
      model: 'doubao-seedance-2-0-260128',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      generateAudio: true,
      promptRaw: '同项目其他人任务',
      assets: [{ assetId: 702, role: 'reference_audio' }],
    })
  })

  it('重新拉取任务状态接口会创建确定执行时间的后台轮询任务', async () => {
    await repository.update(2, {
      status: 'failed',
      errorMessage: '火山视频链接已过期',
    })

    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/videos/2/sync')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      id: 2,
      status: 'processing',
      errorMessage: null,
      nextPollAt: expect.any(String),
    })
    expect(repository.updates).toContainEqual({
      id: 2,
      patch: {
        status: 'processing',
        errorMessage: null,
        nextPollAt: expect.any(Date),
      },
    })
    expect(dispatcher.syncCalls).toEqual([
      { taskId: 2, runAt: expect.any(Date) },
    ])
    expect(dispatcher.syncCalls[0]?.runAt?.getTime()).toBe(
      repository.updates.at(-1)?.patch.nextPollAt?.getTime()
    )
  })

  it('已有 OSS 视频的任务重新拉取状态时不会被打回生成中', async () => {
    await repository.update(2, {
      status: 'processing',
      errorMessage: null,
      videoOssKey: 'videos/cgt-20260601142604-nf9vn.mp4',
      nextPollAt: new Date('2026-06-02T06:50:31.711Z'),
    })

    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .post('/api/videos/2/sync')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      id: 2,
      status: 'succeeded',
      errorMessage: null,
      nextPollAt: null,
      videoUrl: 'https://signed.example.com/videos/cgt-20260601142604-nf9vn.mp4?ttl=default',
    })
    expect(repository.updates).toContainEqual({
      id: 2,
      patch: {
        status: 'succeeded',
        errorMessage: null,
        nextPollAt: null,
      },
    })
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('快照缺少回填必要字段时返回 replayDraft=null', async () => {
    await repository.update(1, {
      promptRaw: '',
      requestSnapshot: {
        model: 'doubao-seedance-2-0-260128',
        content: [{ type: 'text', text: '生成主角视频' }],
      },
    })

    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos/1')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.replayDraft).toBeNull()
  })

  it('不能查看其他项目的视频任务详情', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos/3')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(404)
  })

  it('member 不能查看其他人创建的同项目任务详情', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos/2')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(404)
  })

  it('analytics 接口返回 overview、分布与用户 Token 数据', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos/analytics')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.overview).toEqual({
      totalRequests: 3,
      successRate: 1 / 3,
      avgDurationSeconds: 5,
      totalTokensConsumed: 456,
      totalTokensSucceeded: 456,
      avgTokensPerTask: 152,
    })
    expect(response.body.data.statusDistribution).toEqual([
      { status: 'pending', count: 1 },
      { status: 'processing', count: 1 },
      { status: 'succeeded', count: 1 },
    ])
    expect(response.body.data.modelDistribution).toEqual([
      { model: 'doubao-seedance-2-0-260128', count: 3 },
    ])
    expect(response.body.data.userTokenDistribution).toEqual([
      {
        userId: 1,
        userName: '管理员甲',
        requestCount: 1,
        totalTokens: 456,
        shareRatio: 1,
      },
      {
        userId: 2,
        userName: '运营乙',
        requestCount: 1,
        totalTokens: 0,
        shareRatio: 0,
      },
      {
        userId: 9,
        userName: '成员丙',
        requestCount: 1,
        totalTokens: 0,
        shareRatio: 0,
      },
    ])
  })

  it('analytics export 导出与独立报表服务一致的三个 CSV 区段', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos/analytics/export?status=succeeded')
      .set('Authorization', `Bearer ${signToken('admin', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.headers['content-disposition']).toContain('Narrix_')
    expect(response.headers['content-disposition']).toContain('_succeeded.csv')
    expect(response.text).toContain('按项目×模型汇总')
    expect(response.text).toContain('项目名称,模型,总请求数,平均视频时长(秒),消耗总Token(M),生成总Token(M)')
    expect(response.text).toContain('按项目金额汇总')
    expect(response.text).toContain('项目名称,总有效请求数,平均时长(秒),项目金额')
    expect(response.text).toContain('按项目×成员请求数')
    expect(response.text).toContain('项目名称,成员,请求数,消耗Token(M),Token占比(%),个人金额')
    expect(response.text).toContain('都市逆袭,doubao-seedance-2-0-260128,1,5.00,0.00,0.00')
    expect(response.text).toContain('都市逆袭,项目汇总,1,0.00,100.00%,5.00')
    expect(repository.exportCalls).toEqual([
      {
        userId: 1,
        projectId: 101,
        status: 'succeeded',
        mine: undefined,
      },
    ])
  })

  it('系统管理员可以导出全部项目，普通成员不能越权', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const adminResponse = await request(app.callback())
      .get('/api/videos/analytics/export?scope=all')
      .set('Authorization', `Bearer ${signToken('admin', '1')}`)
      .set('X-Project-Id', projectId)

    expect(adminResponse.status).toBe(200)
    expect(adminResponse.text).toContain('都市逆袭')
    expect(adminResponse.text).toContain('其他项目')
    expect(repository.exportCalls[0]).toMatchObject({ userId: 1, projectId: undefined })

    const memberResponse = await request(app.callback())
      .get('/api/videos/analytics/export?scope=all')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)

    expect(memberResponse.status).toBe(403)
    expect(memberResponse.body.message).toBe('只有系统管理员可以导出全部项目数据')
    expect(repository.exportCalls).toHaveLength(1)
  })

  it('analytics 对 member 强制收敛为本人任务', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos/analytics?mine=false')
      .set('Authorization', `Bearer ${signToken('user', '9')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.overview).toEqual({
      totalRequests: 1,
      successRate: 0,
      avgDurationSeconds: 5,
      totalTokensConsumed: 0,
      totalTokensSucceeded: 0,
      avgTokensPerTask: 0,
    })
    expect(response.body.data.userTokenDistribution).toEqual([
      {
        userId: 9,
        userName: '成员丙',
        requestCount: 1,
        totalTokens: 0,
        shareRatio: 0,
      },
    ])
  })

  it('analytics 支持时间、模型、状态筛选并在空数据时返回 0 与空数组', async () => {
    const app = createApp({
      videoRepository: repository,
      videoDispatcher: dispatcher,
      videoAssetReferenceResolver: assetReferenceResolver,
      configStore: new FakeConfigStore(),
      ossService,
      projectAccessRepository,
    })

    const response = await request(app.callback())
      .get('/api/videos/analytics?dateFrom=2026-04-05T00:00:00.000Z&dateTo=2026-04-05T23:59:59.999Z&status=succeeded&model=doubao-seedance-2-0-fast-260128')
      .set('Authorization', `Bearer ${signToken('user', '1')}`)
      .set('X-Project-Id', projectId)

    expect(response.status).toBe(200)
    expect(response.body.data.overview).toEqual({
      totalRequests: 0,
      successRate: 0,
      avgDurationSeconds: 0,
      totalTokensConsumed: 0,
      totalTokensSucceeded: 0,
      avgTokensPerTask: 0,
    })
    expect(response.body.data.statusDistribution).toEqual([])
    expect(response.body.data.modelDistribution).toEqual([])
    expect(response.body.data.userTokenDistribution).toEqual([])
  })
})
