import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ArkApiRequestError, type ArkVideoClient } from '../../backend/src/lib/ark-bearer'
import type { AssetRecord, AssetRepository } from '../../backend/src/services/asset.service'
import type { OssServiceContract } from '../../backend/src/services/oss.service'
import {
  VideoGenerationLogger,
  type VideoGenerationLogQuery,
  type VideoGenerationLogRecord,
  type VideoGenerationLogRepository,
} from '../../backend/src/services/video-generation-log.service'
import type { VideoDispatcher, VideoDurationEstimate, VideoQueryParams, VideoRecord, VideoRepository } from '../../backend/src/services/video.service'
import {
  BullMqVideoDispatcher,
  createVideoCreateProcessor,
  createVideoReconcileProcessor,
  createVideoSyncProcessor,
  resolveVideoWorkerDispatcher,
} from '../../backend/src/workers/video.worker'

class FakeVideoRepository implements VideoRepository {
  private records = new Map<number, VideoRecord>()
  public readonly updates: Array<{ id: number; patch: Partial<VideoRecord> }> = []
  public readonly syncableCalls: Array<{ now: Date; limit: number }> = []
  public staleIds: number[] = []

  public seed(records: Array<Omit<VideoRecord, 'nextPollAt' | 'lastArkStatus' | 'lastArkStatusChangedAt' | 'lastPolledAt'> & Partial<Pick<VideoRecord, 'nextPollAt' | 'lastArkStatus' | 'lastArkStatusChangedAt' | 'lastPolledAt'>>>) {
    this.records = new Map(records.map((record) => {
      const shouldPoll =
        (record.status === 'pending' || record.status === 'processing') &&
        Boolean(record.arkTaskId) &&
        !record.videoOssKey
      return [
        record.id,
        {
          ...record,
          nextPollAt: record.nextPollAt ?? (shouldPoll ? record.updatedAt : null),
          lastArkStatus: record.lastArkStatus ?? null,
          lastArkStatusChangedAt: record.lastArkStatusChangedAt ?? null,
          lastPolledAt: record.lastPolledAt ?? null,
        },
      ]
    }))
    this.updates.length = 0
  }

  public async create(input: Omit<VideoRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<VideoRecord> {
    const record: VideoRecord = {
      ...input,
      id: 999,
      nextPollAt: input.nextPollAt,
      lastArkStatus: input.lastArkStatus,
      lastArkStatusChangedAt: input.lastArkStatusChangedAt,
      lastPolledAt: input.lastPolledAt,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    }
    this.records.set(record.id, record)
    return record
  }

  public async list(_params: VideoQueryParams): Promise<{ items: VideoRecord[]; total: number }> {
    return { items: [...this.records.values()], total: this.records.size }
  }

  public async getAnalytics() {
    return {
      overview: {
        totalRequests: 0,
        successRate: 0,
        avgDurationSeconds: 0,
        totalTokensConsumed: 0,
        totalTokensSucceeded: 0,
        avgTokensPerTask: 0,
      },
      statusDistribution: [],
      modelDistribution: [],
      userTokenDistribution: [],
    }
  }

  public async getExportData() {
    return {
      models: [],
      projects: [],
      members: [],
    }
  }

  public async findById(id: number): Promise<VideoRecord | null> {
    return this.records.get(id) ?? null
  }

  public async listSyncableArkTasks(input: { now: Date; limit: number }): Promise<VideoRecord[]> {
    this.syncableCalls.push(input)
    const syncable = [...this.records.values()]
      .filter((record) =>
        (record.status === 'pending' || record.status === 'processing') &&
        Boolean(record.arkTaskId) &&
        !record.videoOssKey &&
        record.nextPollAt !== null &&
        record.nextPollAt <= input.now
      )
      .sort((left, right) =>
        (left.nextPollAt?.getTime() ?? 0) - (right.nextPollAt?.getTime() ?? 0) ||
        left.updatedAt.getTime() - right.updatedAt.getTime()
      )

    return syncable.slice(0, input.limit)
  }

  public async update(id: number, patch: Partial<VideoRecord>): Promise<VideoRecord | null> {
    const current = this.records.get(id)
    if (!current) {
      return null
    }

    const next: VideoRecord = {
      ...current,
      ...patch,
      updatedAt: new Date('2026-04-04T00:10:00.000Z'),
    }
    this.records.set(id, next)
    this.updates.push({ id, patch })
    return next
  }

  public async saveAssetReferences(): Promise<void> {}

  public async getDurationEstimate(): Promise<VideoDurationEstimate | null> {
    return null
  }

  public async listStaleProcessingTasks(): Promise<VideoRecord[]> {
    return this.staleIds
      .map((id) => this.records.get(id))
      .filter((record): record is VideoRecord => record !== undefined)
  }
}

class FakeVideoDispatcher implements VideoDispatcher {
  public readonly createIds: number[] = []
  public readonly syncCalls: Array<{ taskId: number; delayMs?: number }> = []

  public async enqueueCreate(taskId: number): Promise<void> {
    this.createIds.push(taskId)
  }

  public async enqueueSync(taskId: number, options?: { delayMs?: number }): Promise<void> {
    this.syncCalls.push({ taskId, delayMs: options?.delayMs })
  }
}

class FakeAssetRepository implements AssetRepository {
  private records = new Map<number, AssetRecord>()

  public seed(records: AssetRecord[]) {
    this.records = new Map(records.map((record) => [record.id, record]))
  }

  public async existsNameInProjects(): Promise<boolean> {
    return false
  }

  public async create(input: Omit<AssetRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AssetRecord> {
    const record: AssetRecord = {
      ...input,
      id: 999,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    }
    this.records.set(record.id, record)
    return record
  }

  public async list(): Promise<{ items: AssetRecord[]; total: number }> {
    return { items: [...this.records.values()], total: this.records.size }
  }

  public async findById(id: number): Promise<AssetRecord | null> {
    return this.records.get(id) ?? null
  }

  public async findByArkAssetId(arkAssetId: string): Promise<AssetRecord | null> {
    return [...this.records.values()].find((item) => item.arkAssetId === arkAssetId) ?? null
  }

  public async update(id: number, patch: Partial<AssetRecord>): Promise<AssetRecord | null> {
    const current = this.records.get(id)
    if (!current) {
      return null
    }

    const next = {
      ...current,
      ...patch,
      updatedAt: new Date('2026-04-04T00:10:00.000Z'),
    }
    this.records.set(id, next)
    return next
  }

  public async listByStatuses(statuses: string[]): Promise<AssetRecord[]> {
    return [...this.records.values()].filter((item) => statuses.includes(item.arkStatus))
  }

  public async deleteById(id: number): Promise<void> {
    this.records.delete(id)
  }

  public async isReferenced(): Promise<boolean> {
    return false
  }
}

class FakeOssService implements OssServiceContract {
  public readonly putCalls: Array<{ ossKey: string; contentType?: string; size: number }> = []
  public readonly signedUrlCalls: string[] = []

  public async getSignedUrl(ossKey: string): Promise<string> {
    this.signedUrlCalls.push(ossKey)
    return `https://signed.example.com/${ossKey}`
  }

  public async deleteObject(): Promise<void> {}

  public async putObject(ossKey: string, data: Buffer, contentType?: string): Promise<void> {
    this.putCalls.push({ ossKey, size: data.length, contentType })
  }

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

class RecordingVideoLogRepository implements VideoGenerationLogRepository {
  public readonly writes: Array<Omit<VideoGenerationLogRecord, 'id' | 'userName' | 'createdAt'>> = []

  public async create(
    input: Omit<VideoGenerationLogRecord, 'id' | 'userName' | 'createdAt'>
  ): Promise<void> {
    this.writes.push(input)
  }

  public async list(_input: VideoGenerationLogQuery): Promise<{ items: VideoGenerationLogRecord[]; total: number }> {
    return { items: [], total: 0 }
  }

  public async deleteRange(): Promise<number> {
    return 0
  }
}

describe('video.worker', () => {
  let repository: FakeVideoRepository
  let dispatcher: FakeVideoDispatcher
  let assetRepository: FakeAssetRepository
  let ossService: FakeOssService

  beforeEach(() => {
    repository = new FakeVideoRepository()
    dispatcher = new FakeVideoDispatcher()
    assetRepository = new FakeAssetRepository()
    ossService = new FakeOssService()
  })

  it('未显式注入 dispatcher 时默认使用 BullMQ dispatcher，而不是 Noop', () => {
    const resolved = resolveVideoWorkerDispatcher()

    expect(resolved).toBeInstanceOf(BullMqVideoDispatcher)
  })

  it('create processor 会创建火山任务并先标记为 pending', async () => {
    const logRepository = new RecordingVideoLogRepository()
    const arkClient: ArkVideoClient = {
      createTask: vi.fn().mockResolvedValue('task-100'),
      getTask: vi.fn(),
      listTasks: vi.fn(),
    }

    repository.seed([
      {
        id: 1,
        userId: 1,
        projectId: 101,
        arkTaskId: null,
        idempotencyKey: 'idem-1',
        status: 'pending',
        model: 'doubao-seedance-2-0-260128',
        prompt: '生成视频',
        promptRaw: '@角色A 生成视频',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: {
          model: 'doubao-seedance-2-0-260128',
          content: [{ type: 'text', text: '生成视频' }],
        },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoCreateProcessor({
      repository,
      dispatcher,
      assetRepository,
      ossService,
      arkClient,
      generationLogger: new VideoGenerationLogger(logRepository),
      now: () => new Date('2026-04-04T00:00:00.000Z'),
    })

    await processor({ taskId: 1 })

    expect(arkClient.createTask).toHaveBeenCalledWith({
      model: 'doubao-seedance-2-0-260128',
      content: [{ type: 'text', text: '生成视频' }],
    })
    expect(repository.updates).toEqual([
      {
        id: 1,
        patch: {
          arkTaskId: 'task-100',
          status: 'pending',
          errorMessage: null,
          nextPollAt: new Date('2026-04-04T00:05:00.000Z'),
          lastArkStatus: null,
          lastArkStatusChangedAt: expect.any(Date),
          lastPolledAt: null,
        },
      },
    ])
    expect(dispatcher.syncCalls).toEqual([])
    expect(logRepository.writes.map((item) => `${item.action}:${item.status}`)).toEqual([
      'video_create.started:info',
      'video_payload.resolve_assets:started',
      'video_payload.resolve_assets:succeeded',
      'ark_video.create_task:started',
      'ark_video.create_task:succeeded',
      'video_task.ark_created:started',
      'video_task.ark_created:succeeded',
    ])
    expect(logRepository.writes.find((item) => item.action === 'ark_video.create_task' && item.status === 'succeeded'))
      .toMatchObject({
        videoTaskId: 1,
        projectId: 101,
        responsePayload: { arkTaskId: 'task-100' },
      })
  })

  it('create processor 在已有 arkTaskId 时跳过 createTask 且不重复入同步队列', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn(),
    }

    repository.seed([
      {
        id: 2,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-existing',
        idempotencyKey: 'idem-2',
        status: 'processing',
        model: 'doubao-seedance-2-0-260128',
        prompt: '已有任务',
        promptRaw: '已有任务',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoCreateProcessor({
      repository,
      dispatcher,
      assetRepository,
      ossService,
      arkClient,
      now: () => new Date('2026-04-04T00:00:00.000Z'),
    })

    await processor({ taskId: 2 })

    expect(arkClient.createTask).not.toHaveBeenCalled()
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('createTask 失败时保留记录并回写 failed 原因', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn().mockRejectedValue(new Error('ark create failed')),
      getTask: vi.fn(),
      listTasks: vi.fn(),
    }

    repository.seed([
      {
        id: 3,
        userId: 1,
        projectId: 101,
        arkTaskId: null,
        idempotencyKey: 'idem-3',
        status: 'pending',
        model: 'doubao-seedance-2-0-260128',
        prompt: '创建失败',
        promptRaw: '创建失败',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoCreateProcessor({
      repository,
      dispatcher,
      assetRepository,
      ossService,
      arkClient,
      now: () => new Date('2026-04-04T00:00:00.000Z'),
    })

    await expect(processor({ taskId: 3 })).rejects.toThrow('ark create failed')
    expect(repository.updates).toContainEqual({
      id: 3,
      patch: {
        status: 'failed',
        errorMessage: 'ark create failed',
        nextPollAt: null,
      },
    })
  })

  it('create processor 会保留已同步素材的 asset:// 引用再提交火山', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn().mockResolvedValue('task-asset-1'),
      getTask: vi.fn(),
      listTasks: vi.fn(),
    }

    assetRepository.seed([
      {
        id: 6,
        userId: 1,
        name: '首帧素材',
        assetType: 'Image',
        categoryId: null,
        ossKey: 'assets/2026/04/05/frame.png',
        arkGroupId: 'group-1',
        arkAssetId: 'asset-1',
        arkStatus: 'active',
        arkError: null,
        tags: ['主角'],
        createdAt: new Date('2026-04-05T00:00:00.000Z'),
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ])

    repository.seed([
      {
        id: 6,
        userId: 1,
        arkTaskId: null,
        idempotencyKey: 'idem-6',
        status: 'pending',
        model: 'doubao-seedance-2-0-260128',
        prompt: '首帧转视频',
        promptRaw: '首帧转视频',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: {
          model: 'doubao-seedance-2-0-260128',
          content: [
            { type: 'text', text: '首帧转视频' },
            { type: 'image_url', image_url: { url: 'asset://asset-1' }, role: 'first_frame' },
          ],
        },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoCreateProcessor({
      repository,
      dispatcher,
      assetRepository,
      ossService,
      arkClient,
      now: () => new Date('2026-04-04T00:00:00.000Z'),
    })

    await processor({ taskId: 6 })

    expect(arkClient.createTask).toHaveBeenCalledWith({
      model: 'doubao-seedance-2-0-260128',
      content: [
        { type: 'text', text: '首帧转视频' },
        {
          type: 'image_url',
          image_url: { url: 'asset://asset-1' },
          role: 'first_frame',
        },
      ],
    })
    expect(ossService.signedUrlCalls).toEqual([])
  })

  it('create processor 在 ToAPIs 模式下会把已同步素材转换为 OSS 签名直链', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn().mockResolvedValue('tsk_toapis_1'),
      getTask: vi.fn(),
      listTasks: vi.fn(),
      getAssetReferenceMode: vi.fn().mockResolvedValue('signed_url'),
    }

    assetRepository.seed([
      {
        id: 16,
        userId: 1,
        name: 'ToAPIs 参考图',
        assetType: 'Image',
        categoryId: null,
        ossKey: 'assets/2026/04/05/toapis-reference.png',
        arkGroupId: 'group-1',
        arkAssetId: 'asset-toapis-1',
        arkStatus: 'active',
        arkError: null,
        tags: ['参考图'],
        createdAt: new Date('2026-04-05T00:00:00.000Z'),
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ])

    repository.seed([
      {
        id: 16,
        userId: 1,
        projectId: 101,
        arkTaskId: null,
        idempotencyKey: 'idem-16',
        status: 'pending',
        model: 'doubao-seedance-2-0-fast-260128',
        prompt: '保持角色一致',
        promptRaw: '@参考图 保持角色一致',
        duration: 8,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: {
          mode: 'omni',
          model: 'doubao-seedance-2-0-fast-260128',
          duration: 8,
          ratio: '16:9',
          resolution: '720p',
          generate_audio: true,
          content: [
            { type: 'text', text: '保持角色一致' },
            {
              type: 'image_url',
              image_url: { url: 'asset://asset-toapis-1' },
              role: 'reference_image',
              assetId: 16,
            },
          ],
        },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoCreateProcessor({
      repository,
      dispatcher,
      assetRepository,
      ossService,
      arkClient,
      now: () => new Date('2026-04-04T00:00:00.000Z'),
    })

    await processor({ taskId: 16 })

    expect(arkClient.getAssetReferenceMode).toHaveBeenCalledOnce()
    expect(arkClient.createTask).toHaveBeenCalledWith({
      mode: 'omni',
      model: 'doubao-seedance-2-0-fast-260128',
      duration: 8,
      ratio: '16:9',
      resolution: '720p',
      generate_audio: true,
      content: [
        { type: 'text', text: '保持角色一致' },
        {
          type: 'image_url',
          image_url: { url: 'https://signed.example.com/assets/2026/04/05/toapis-reference.png' },
          role: 'reference_image',
          assetId: 16,
        },
      ],
    })
    expect(ossService.signedUrlCalls).toEqual(['assets/2026/04/05/toapis-reference.png'])
    expect(repository.updates).toContainEqual({
      id: 16,
      patch: expect.objectContaining({
        arkTaskId: 'tsk_toapis_1',
        nextPollAt: new Date('2026-04-04T00:00:10.000Z'),
      }),
    })
  })

  it('create processor 在 ToAPIs 模式下保留 pa_ 素材的 asset:// 引用', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn().mockResolvedValue('tsk_toapis_pa_1'),
      getTask: vi.fn(),
      listTasks: vi.fn(),
      getAssetReferenceMode: vi.fn().mockResolvedValue('signed_url'),
    }

    assetRepository.seed([
      {
        id: 26,
        userId: 1,
        name: 'ToAPIs 已入库素材',
        assetType: 'Image',
        categoryId: null,
        ossKey: 'assets/2026/04/05/toapis-library.png',
        arkGroupId: 'pg_01KABC',
        arkAssetId: 'pa_01KAAA',
        arkStatus: 'active',
        arkError: null,
        tags: [],
        createdAt: new Date('2026-04-05T00:00:00.000Z'),
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ])

    repository.seed([
      {
        id: 26,
        userId: 1,
        projectId: 101,
        arkTaskId: null,
        idempotencyKey: 'idem-26',
        status: 'pending',
        model: 'doubao-seedance-2-0-fast-260128',
        prompt: '角色一致',
        promptRaw: '角色一致',
        duration: 8,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: {
          mode: 'omni',
          model: 'doubao-seedance-2-0-fast-260128',
          duration: 8,
          ratio: '16:9',
          resolution: '720p',
          generate_audio: true,
          content: [
            { type: 'text', text: '角色一致' },
            {
              type: 'image_url',
              image_url: { url: 'asset://pa_01KAAA' },
              role: 'reference_image',
              assetId: 26,
            },
          ],
        },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoCreateProcessor({
      repository,
      dispatcher,
      assetRepository,
      ossService,
      arkClient,
      now: () => new Date('2026-04-04T00:00:00.000Z'),
    })

    await processor({ taskId: 26 })

    expect(arkClient.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'image_url',
            image_url: { url: 'asset://pa_01KAAA' },
            role: 'reference_image',
            assetId: 26,
          }),
        ]),
      })
    )
    expect(ossService.signedUrlCalls).toEqual([])
  })

  it('create processor 会同时保留已同步素材引用，并仅为未同步素材补签 OSS', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn().mockResolvedValue('task-mixed-1'),
      getTask: vi.fn(),
      listTasks: vi.fn(),
    }

    assetRepository.seed([
      {
        id: 8,
        userId: 1,
        name: '已同步首帧',
        assetType: 'Image',
        categoryId: null,
        ossKey: 'assets/2026/04/05/synced-frame.png',
        arkGroupId: 'group-1',
        arkAssetId: 'asset-synced-1',
        arkStatus: 'active',
        arkError: null,
        tags: ['首帧'],
        createdAt: new Date('2026-04-05T00:00:00.000Z'),
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
      {
        id: 9,
        userId: 1,
        name: '未同步配乐',
        assetType: 'Audio',
        categoryId: null,
        ossKey: 'assets/2026/04/05/bg-audio.mp3',
        arkGroupId: null,
        arkAssetId: null,
        arkStatus: 'pending',
        arkError: null,
        tags: ['配乐'],
        createdAt: new Date('2026-04-05T00:00:00.000Z'),
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ])

    repository.seed([
      {
        id: 8,
        userId: 1,
        projectId: 101,
        arkTaskId: null,
        idempotencyKey: 'idem-8',
        status: 'pending',
        model: 'doubao-seedance-2-0-260128',
        prompt: '混合素材生成',
        promptRaw: '混合素材生成',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: {
          model: 'doubao-seedance-2-0-260128',
          content: [
            { type: 'text', text: '混合素材生成' },
            { type: 'image_url', image_url: { url: 'asset://asset-synced-1' }, role: 'first_frame', assetId: 8 },
            {
              type: 'audio_url',
              audio_url: { url: 'https://oss.example.com/assets/2026/04/05/bg-audio.mp3' },
              role: 'reference_audio',
              assetId: 9,
            },
          ],
        },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoCreateProcessor({
      repository,
      dispatcher,
      assetRepository,
      ossService,
      arkClient,
      now: () => new Date('2026-04-04T00:00:00.000Z'),
    })

    await processor({ taskId: 8 })

    expect(arkClient.createTask).toHaveBeenCalledWith({
      model: 'doubao-seedance-2-0-260128',
      content: [
        { type: 'text', text: '混合素材生成' },
        {
          type: 'image_url',
          image_url: { url: 'asset://asset-synced-1' },
          role: 'first_frame',
          assetId: 8,
        },
        {
          type: 'audio_url',
          audio_url: { url: 'https://signed.example.com/assets/2026/04/05/bg-audio.mp3' },
          role: 'reference_audio',
          assetId: 9,
        },
      ],
    })
    expect(ossService.signedUrlCalls).toEqual(['assets/2026/04/05/bg-audio.mp3'])
  })

  it('create processor 在引用素材不存在时直接失败，不再调用火山', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn(),
    }

    repository.seed([
      {
        id: 7,
        userId: 1,
        arkTaskId: null,
        idempotencyKey: 'idem-7',
        status: 'pending',
        model: 'doubao-seedance-2-0-260128',
        prompt: '引用丢失素材',
        promptRaw: '引用丢失素材',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: {
          model: 'doubao-seedance-2-0-260128',
          content: [
            { type: 'text', text: '引用丢失素材' },
            { type: 'image_url', image_url: { url: 'asset://asset-missing' }, role: 'first_frame' },
          ],
        },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoCreateProcessor({
      repository,
      dispatcher,
      assetRepository,
      ossService,
      arkClient,
      now: () => new Date('2026-04-04T00:00:00.000Z'),
    })

    await expect(processor({ taskId: 7 })).rejects.toThrow('引用素材不存在: asset-missing')
    expect(arkClient.createTask).not.toHaveBeenCalled()
    expect(repository.updates).toContainEqual({
      id: 7,
      patch: {
        status: 'failed',
        errorMessage: '引用素材不存在: asset-missing',
        nextPollAt: null,
      },
    })
  })

  it('sync processor 成功下载视频到 OSS 并更新 succeeded', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([
        {
          id: 'task-4',
          status: 'succeeded',
          videoUrl: 'https://ark.example.com/video.mp4',
          completionTokens: 321,
          totalTokens: 654,
          errorMessage: null,
          createdAt: null,
          updatedAt: null,
          executionExpiresAfter: null,
        },
      ]),
    }

    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(Buffer.from('video-binary'), {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
        },
      })
    )

    repository.seed([
      {
        id: 4,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-4',
        idempotencyKey: 'idem-4',
        status: 'processing',
        model: 'doubao-seedance-2-0-260128',
        prompt: '同步成功',
        promptRaw: '同步成功',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl,
      now: () => new Date('2026-04-04T00:10:00.000Z'),
    })

    await processor()

    expect(repository.syncableCalls).toEqual([{ now: new Date('2026-04-04T00:10:00.000Z'), limit: 20 }])
    expect(arkClient.listTasks).toHaveBeenCalledWith(['task-4'])
    expect(arkClient.getTask).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledWith('https://ark.example.com/video.mp4')
    expect(ossService.putCalls).toEqual([
      {
        ossKey: 'videos/task-4.mp4',
        size: Buffer.byteLength('video-binary'),
        contentType: 'video/mp4',
      },
    ])
    expect(repository.updates).toContainEqual({
      id: 4,
      patch: {
        status: 'succeeded',
        arkVideoUrl: 'https://ark.example.com/video.mp4',
        videoOssKey: 'videos/task-4.mp4',
        completionTokens: 321,
        totalTokens: 654,
        errorMessage: null,
        lastPolledAt: new Date('2026-04-04T00:10:00.000Z'),
        lastArkStatus: 'succeeded',
        lastArkStatusChangedAt: new Date('2026-04-04T00:10:00.000Z'),
        nextPollAt: null,
      },
    })
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('sync processor 在 nextPollAt 未到时不请求火山状态接口', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn(),
    }

    repository.seed([
      {
        id: 16,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-wait-first-poll',
        idempotencyKey: 'idem-16',
        status: 'pending',
        model: 'doubao-seedance-2-0-260128',
        prompt: '首次延迟',
        promptRaw: '首次延迟',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        nextPollAt: new Date('2026-04-04T00:05:00.000Z'),
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl: vi.fn(),
      now: () => new Date('2026-04-04T00:04:59.000Z'),
    })

    await processor()

    expect(arkClient.listTasks).not.toHaveBeenCalled()
    expect(repository.updates).toEqual([])
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('sync processor 每轮最多批量查询 20 个到期任务', async () => {
    const records = Array.from({ length: 25 }, (_, index) => {
      const id = 1000 + index
      return {
        id,
        userId: 1,
        projectId: 101,
        arkTaskId: `task-${id}`,
        idempotencyKey: `idem-${id}`,
        status: 'processing' as const,
        model: 'doubao-seedance-2-0-260128',
        prompt: '批量任务',
        promptRaw: '批量任务',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        nextPollAt: new Date('2026-04-04T00:00:00.000Z'),
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date(`2026-04-04T00:00:${String(index).padStart(2, '0')}.000Z`),
      }
    })
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue(
        records.slice(0, 20).map((record) => ({
          id: record.arkTaskId,
          status: 'processing',
          videoUrl: null,
          completionTokens: null,
          totalTokens: null,
          errorMessage: null,
          createdAt: null,
          updatedAt: null,
          executionExpiresAfter: null,
        }))
      ),
    }

    repository.seed(records)

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl: vi.fn(),
      now: () => new Date('2026-04-04T00:10:00.000Z'),
    })

    await processor()

    expect(arkClient.listTasks).toHaveBeenCalledTimes(1)
    expect(arkClient.listTasks).toHaveBeenCalledWith(records.slice(0, 20).map((record) => record.arkTaskId))
    expect(repository.updates).toHaveLength(20)
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('sync processor 在火山成功但 OSS 上传超时时保留火山结果并延迟重试', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([
        {
          id: 'task-14',
          status: 'succeeded',
          videoUrl: 'https://ark.example.com/task-14.mp4',
          completionTokens: 14,
          totalTokens: 28,
          errorMessage: null,
          createdAt: null,
          updatedAt: null,
          executionExpiresAfter: null,
        },
      ]),
    }

    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(Buffer.from('video-14'), {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
        },
      })
    )
    vi.spyOn(ossService, 'putObject').mockRejectedValue(
      new Error('Response timeout for 60000ms, please increase the timeout')
    )

    repository.seed([
      {
        id: 14,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-14',
        idempotencyKey: 'idem-14',
        status: 'processing',
        model: 'doubao-seedance-2-0-260128',
        prompt: 'OSS 超时',
        promptRaw: 'OSS 超时',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl,
      now: () => new Date('2026-04-04T00:10:00.000Z'),
    })

    await processor()

    expect(repository.updates).toContainEqual({
      id: 14,
      patch: {
        status: 'processing',
        arkVideoUrl: 'https://ark.example.com/task-14.mp4',
        completionTokens: 14,
        totalTokens: 28,
        errorMessage: null,
        lastPolledAt: new Date('2026-04-04T00:10:00.000Z'),
        lastArkStatus: 'succeeded',
        lastArkStatusChangedAt: new Date('2026-04-04T00:10:00.000Z'),
        nextPollAt: null,
      },
    })
    expect(repository.updates).toContainEqual({
      id: 14,
      patch: {
        status: 'processing',
        errorMessage: 'Response timeout for 60000ms, please increase the timeout',
        lastPolledAt: new Date('2026-04-04T00:10:00.000Z'),
        nextPollAt: new Date('2026-04-04T00:10:30.000Z'),
      },
    })
    expect(repository.updates).not.toContainEqual({
      id: 14,
      patch: {
        status: 'failed',
        errorMessage: 'Response timeout for 60000ms, please increase the timeout',
      },
    })
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('sync processor 下载火山视频 403 时写入不可重试失败原因并带火山任务 ID', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([
        {
          id: 'task-expired',
          status: 'succeeded',
          videoUrl: 'https://ark.example.com/expired.mp4',
          completionTokens: 11,
          totalTokens: 22,
          errorMessage: null,
          createdAt: null,
          updatedAt: null,
          executionExpiresAfter: null,
        },
      ]),
    }

    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 403 }))

    repository.seed([
      {
        id: 15,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-expired',
        idempotencyKey: 'idem-15',
        status: 'processing',
        model: 'doubao-seedance-2-0-260128',
        prompt: '链接过期',
        promptRaw: '链接过期',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl,
      now: () => new Date('2026-04-04T00:10:00.000Z'),
    })

    await processor()

    expect(repository.updates).toContainEqual({
      id: 15,
      patch: {
        status: 'failed',
        errorMessage: '火山方舟视频链接已过期或无权限访问，无法下载结果视频（HTTP 403，火山方舟任务ID：task-expired）',
        nextPollAt: null,
      },
    })
    expect(dispatcher.syncCalls).toEqual([])
    expect(ossService.putCalls).toEqual([])
  })

  it('sync processor 在火山 queued 状态时更新 pending 并延迟重入队', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([
        {
          id: 'task-6',
          status: 'queued',
          videoUrl: null,
          completionTokens: null,
          totalTokens: null,
          errorMessage: null,
          createdAt: null,
          updatedAt: null,
          executionExpiresAfter: null,
        },
      ]),
    }

    repository.seed([
      {
        id: 6,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-6',
        idempotencyKey: 'idem-6',
        status: 'pending',
        model: 'doubao-seedance-2-0-260128',
        prompt: '队列状态映射',
        promptRaw: '队列状态映射',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl: vi.fn(),
      now: () => new Date('2026-04-04T00:10:00.000Z'),
    })

    await processor()

    expect(repository.updates).toContainEqual({
      id: 6,
      patch: {
        status: 'pending',
        errorMessage: null,
        lastPolledAt: new Date('2026-04-04T00:10:00.000Z'),
        lastArkStatus: 'queued',
        lastArkStatusChangedAt: new Date('2026-04-04T00:10:00.000Z'),
        nextPollAt: new Date('2026-04-04T00:10:30.000Z'),
      },
    })
    expect(dispatcher.syncCalls).toEqual([])
    expect(arkClient.listTasks).toHaveBeenCalledTimes(1)
    expect(arkClient.getTask).not.toHaveBeenCalled()
  })

  it('sync processor 失败时写入 failed 原因', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([
        {
          id: 'task-5',
          status: 'failed',
          videoUrl: null,
          completionTokens: null,
          totalTokens: null,
          errorMessage: 'sensitive content',
          createdAt: null,
          updatedAt: null,
          executionExpiresAfter: null,
        },
      ]),
    }

    repository.seed([
      {
        id: 5,
        userId: 1,
        arkTaskId: 'task-5',
        idempotencyKey: 'idem-5',
        status: 'processing',
        model: 'doubao-seedance-2-0-260128',
        prompt: '同步失败',
        promptRaw: '同步失败',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl: vi.fn(),
      now: () => new Date('2026-04-04T00:10:00.000Z'),
    })

    await processor()

    expect(repository.updates).toContainEqual({
      id: 5,
      patch: {
        status: 'failed',
        errorMessage: 'sensitive content',
        lastPolledAt: new Date('2026-04-04T00:10:00.000Z'),
        lastArkStatus: 'failed',
        lastArkStatusChangedAt: new Date('2026-04-04T00:10:00.000Z'),
        nextPollAt: null,
      },
    })
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('sync processor 遇到平台认证失败时终止任务并停止后续轮询', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockRejectedValue(new ArkApiRequestError('无效的令牌', 401)),
    }

    repository.seed([
      {
        id: 17,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-auth-failed',
        idempotencyKey: 'idem-17',
        status: 'pending',
        model: 'seedance-2-fast',
        prompt: '认证失败',
        promptRaw: '认证失败',
        duration: 5,
        ratio: '16:9',
        resolution: '480p',
        generateAudio: true,
        providerKey: 'toapis',
        providerSnapshot: {
          providerKey: 'toapis',
          name: 'ToAPIs',
          providerType: 'toapis',
          endpoint: 'https://toapis.com/v1',
          capabilities: { version: 1, models: [] },
        },
        requestSnapshot: { model: 'seedance-2-fast', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl: vi.fn(),
      now: () => new Date('2026-04-04T00:10:00.000Z'),
    })

    await processor()

    expect(repository.updates).toContainEqual({
      id: 17,
      patch: {
        status: 'failed',
        errorMessage: '无效的令牌',
        lastPolledAt: new Date('2026-04-04T00:10:00.000Z'),
        nextPollAt: null,
      },
    })
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('sync processor 隔离不同平台的轮询错误', async () => {
    const authFailedClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockRejectedValue(new ArkApiRequestError('无效的令牌', 401)),
    }
    const healthyClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([
        {
          id: 'task-healthy',
          status: 'processing',
          videoUrl: null,
          completionTokens: null,
          totalTokens: null,
          errorMessage: null,
          createdAt: null,
          updatedAt: null,
          executionExpiresAfter: null,
        },
      ]),
    }
    const baseRecord = {
      userId: 1,
      projectId: 101,
      status: 'pending' as const,
      model: 'seedance-2-fast',
      prompt: '平台隔离',
      promptRaw: '平台隔离',
      duration: 5,
      ratio: '16:9',
      resolution: '480p',
      generateAudio: true,
      requestSnapshot: { model: 'seedance-2-fast', content: [] },
      arkVideoUrl: null,
      videoOssKey: null,
      completionTokens: null,
      totalTokens: null,
      errorMessage: null,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    }

    repository.seed([
      {
        ...baseRecord,
        id: 18,
        arkTaskId: 'task-auth-failed',
        idempotencyKey: 'idem-18',
        providerKey: 'toapis',
        providerSnapshot: {
          providerKey: 'toapis',
          name: 'ToAPIs',
          providerType: 'toapis',
          endpoint: 'https://toapis.com/v1',
          capabilities: { version: 1, models: [] },
        },
      },
      {
        ...baseRecord,
        id: 19,
        arkTaskId: 'task-healthy',
        idempotencyKey: 'idem-19',
        providerKey: 'volcano_ark',
        providerSnapshot: {
          providerKey: 'volcano_ark',
          name: '火山方舟',
          providerType: 'volcano_ark',
          endpoint: 'https://ark.example.com/api/v3',
          capabilities: { version: 1, models: [] },
        },
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient: healthyClient,
      resolveClient: async (task) => task.id === 18 ? authFailedClient : healthyClient,
      fetchImpl: vi.fn(),
      now: () => new Date('2026-04-04T00:10:00.000Z'),
    })

    await processor()

    expect(repository.updates).toContainEqual({
      id: 18,
      patch: expect.objectContaining({ status: 'failed', nextPollAt: null }),
    })
    expect(repository.updates).toContainEqual({
      id: 19,
      patch: expect.objectContaining({
        status: 'processing',
        nextPollAt: new Date('2026-04-04T00:10:30.000Z'),
      }),
    })
  })

  it('sync processor 会一次批量查询多个本地处理中任务', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([
        {
          id: 'task-10',
          status: 'processing',
          videoUrl: null,
          completionTokens: null,
          totalTokens: null,
          errorMessage: null,
          createdAt: null,
          updatedAt: null,
          executionExpiresAfter: null,
        },
        {
          id: 'task-11',
          status: 'succeeded',
          videoUrl: 'https://ark.example.com/task-11.mp4',
          completionTokens: 11,
          totalTokens: 22,
          errorMessage: null,
          createdAt: null,
          updatedAt: null,
          executionExpiresAfter: null,
        },
      ]),
    }

    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(Buffer.from('video-11'), {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
        },
      })
    )

    repository.seed([
      {
        id: 10,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-10',
        idempotencyKey: 'idem-10',
        status: 'processing',
        model: 'doubao-seedance-2-0-260128',
        prompt: '处理中',
        promptRaw: '处理中',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:01:00.000Z'),
      },
      {
        id: 11,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-11',
        idempotencyKey: 'idem-11',
        status: 'pending',
        model: 'doubao-seedance-2-0-260128',
        prompt: '已完成',
        promptRaw: '已完成',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:02:00.000Z'),
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl,
      now: () => new Date('2026-04-04T00:10:00.000Z'),
    })

    await processor()

    expect(arkClient.listTasks).toHaveBeenCalledTimes(1)
    expect(arkClient.listTasks).toHaveBeenCalledWith(['task-10', 'task-11'])
    expect(repository.updates).toContainEqual({
      id: 10,
      patch: {
        status: 'processing',
        errorMessage: null,
        lastPolledAt: new Date('2026-04-04T00:10:00.000Z'),
        lastArkStatus: 'processing',
        lastArkStatusChangedAt: new Date('2026-04-04T00:10:00.000Z'),
        nextPollAt: new Date('2026-04-04T00:10:30.000Z'),
      },
    })
    expect(repository.updates).toContainEqual({
      id: 11,
      patch: {
        status: 'succeeded',
        arkVideoUrl: 'https://ark.example.com/task-11.mp4',
        videoOssKey: 'videos/task-11.mp4',
        completionTokens: 11,
        totalTokens: 22,
        errorMessage: null,
        lastPolledAt: new Date('2026-04-04T00:10:00.000Z'),
        lastArkStatus: 'succeeded',
        lastArkStatusChangedAt: new Date('2026-04-04T00:10:00.000Z'),
        nextPollAt: null,
      },
    })
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('sync processor 对超过 24 小时且火山未返回的任务标记 failed', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([]),
    }

    repository.seed([
      {
        id: 12,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-missing',
        idempotencyKey: 'idem-12',
        status: 'processing',
        model: 'doubao-seedance-2-0-260128',
        prompt: '查不到',
        promptRaw: '查不到',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        lastArkStatusChangedAt: new Date('2026-04-08T00:00:00.000Z'),
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-08T00:00:00.000Z'),
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl: vi.fn(),
      now: () => new Date('2026-04-09T00:00:01.000Z'),
    })

    await processor()

    expect(repository.updates).toContainEqual({
      id: 12,
      patch: {
        status: 'failed',
        errorMessage: '火山方舟任务超过 24 小时无状态更新，已默认失败',
        nextPollAt: null,
      },
    })
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('sync processor 对 24 小时内未返回的任务排到 30 秒后继续轮询', async () => {
    const arkClient: ArkVideoClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([]),
    }

    repository.seed([
      {
        id: 13,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-young-missing',
        idempotencyKey: 'idem-13',
        status: 'processing',
        model: 'doubao-seedance-2-0-260128',
        prompt: '暂未返回',
        promptRaw: '暂未返回',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        lastArkStatusChangedAt: new Date('2026-04-08T12:00:00.000Z'),
        createdAt: new Date('2026-04-08T00:00:00.000Z'),
        updatedAt: new Date('2026-04-08T00:00:00.000Z'),
      },
    ])

    const processor = createVideoSyncProcessor({
      repository,
      dispatcher,
      ossService,
      arkClient,
      fetchImpl: vi.fn(),
      now: () => new Date('2026-04-09T00:00:00.000Z'),
    })

    await processor()

    expect(repository.updates).toContainEqual({
      id: 13,
      patch: {
        lastPolledAt: new Date('2026-04-09T00:00:00.000Z'),
        nextPollAt: new Date('2026-04-09T00:00:30.000Z'),
      },
    })
    expect(dispatcher.syncCalls).toEqual([])
  })

  it('reconcile processor 不再把已有 arkTaskId 的任务重新入同步队列', async () => {
    repository.seed([
      {
        id: 9,
        userId: 1,
        projectId: 101,
        arkTaskId: 'task-9',
        idempotencyKey: 'idem-9',
        status: 'processing',
        model: 'doubao-seedance-2-0-260128',
        prompt: '补偿同步',
        promptRaw: '补偿同步',
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
        generateAudio: true,
        requestSnapshot: { model: 'doubao-seedance-2-0-260128', content: [] },
        arkVideoUrl: null,
        videoOssKey: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])
    repository.staleIds = [9]

    const processor = createVideoReconcileProcessor({
      repository,
      dispatcher,
      staleAfterMs: 60_000,
      batchSize: 20,
      now: () => new Date('2026-04-04T00:10:00.000Z'),
    })

    await processor()

    expect(dispatcher.syncCalls).toEqual([])
    expect(dispatcher.createIds).toEqual([])
  })
})
