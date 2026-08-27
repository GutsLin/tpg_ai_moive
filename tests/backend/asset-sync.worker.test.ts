import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ArkAssetClient } from '../../backend/src/lib/ark-aksk'
import type { AssetRecord, AssetRepository } from '../../backend/src/services/asset.service'
import type { OssServiceContract } from '../../backend/src/services/oss.service'
import {
  ASSET_DELETE_QUEUE_NAME,
  createAssetDeleteProcessor,
  createAssetSyncProcessor,
  ensureJobScheduled,
} from '../../backend/src/workers/asset-sync.worker'

class FakeAssetRepository implements AssetRepository {
  private assets = new Map<number, AssetRecord>()
  public readonly updates: Array<{ id: number; patch: Partial<AssetRecord> }> = []
  public readonly deletedIds: number[] = []

  public seed(assets: AssetRecord[]) {
    this.assets = new Map(assets.map((asset) => [asset.id, asset]))
    this.updates.length = 0
    this.deletedIds.length = 0
  }

  public async existsNameInProjects(): Promise<boolean> {
    return false
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
  }): Promise<AssetRecord> {
    const record: AssetRecord = {
      ...input,
      id: 999,
      categoryId: input.categoryId ?? null,
      groupSyncEnabled: null,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
    }
    this.assets.set(record.id, record)
    return record
  }

  public async list(): Promise<{ items: AssetRecord[]; total: number }> {
    return { items: [...this.assets.values()], total: this.assets.size }
  }

  public async attachProjects(): Promise<void> {}

  public async findById(id: number): Promise<AssetRecord | null> {
    return this.assets.get(id) ?? null
  }

  public async findByArkAssetId(arkAssetId: string): Promise<AssetRecord | null> {
    return [...this.assets.values()].find((asset) => asset.arkAssetId === arkAssetId) ?? null
  }

  public async update(id: number, patch: Partial<AssetRecord>): Promise<AssetRecord | null> {
    const current = this.assets.get(id)
    if (!current) {
      return null
    }

    const next = {
      ...current,
      ...patch,
      updatedAt: new Date('2026-04-04T00:10:00.000Z'),
    }
    this.assets.set(id, next)
    this.updates.push({ id, patch })
    return next
  }

  public async listByStatuses(statuses: string[]): Promise<AssetRecord[]> {
    return [...this.assets.values()].filter((asset) => statuses.includes(asset.arkStatus))
  }

  public async deleteById(id: number): Promise<void> {
    this.assets.delete(id)
    this.deletedIds.push(id)
  }

  public async isReferenced(): Promise<boolean> {
    return false
  }

  public async countProjectLinks(): Promise<number> {
    return 0
  }

  public async getCategory(): Promise<{ id: number; syncEnabled: boolean; arkGroupId: string | null } | null> {
    return null
  }

  public async findProjectCode(projectId: number): Promise<string | null> {
    return projectId === 101 ? 'PRJ-202604-000101' : null
  }

  public async unlinkFromProject(): Promise<number> {
    return 0
  }

  public async hasProjectLink(): Promise<boolean> {
    return false
  }

  public async removeProjectLink(): Promise<{
    status: 'not_linked' | 'unlinked' | 'orphaned' | 'blocked_last_link' | 'unchanged_last_link'
    remainingProjectCount: number
  }> {
    return {
      status: 'not_linked',
      remainingProjectCount: 0,
    }
  }
}

class FakeOssService implements OssServiceContract {
  public readonly signedRequests: Array<{ ossKey: string; ttlSeconds?: number }> = []
  public readonly deletedKeys: string[] = []
  public deleteError: Error | null = null

  public async getSignedUrl(ossKey: string, ttlSeconds?: number): Promise<string> {
    this.signedRequests.push({ ossKey, ttlSeconds })
    return `https://signed.example.com/${ossKey}`
  }

  public async deleteObject(ossKey: string): Promise<void> {
    if (this.deleteError) {
      throw this.deleteError
    }
    this.deletedKeys.push(ossKey)
  }

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

describe('asset-sync.worker', () => {
  let repository: FakeAssetRepository
  let ossService: FakeOssService

  beforeEach(() => {
    repository = new FakeAssetRepository()
    ossService = new FakeOssService()
  })

  it('pending 素材会创建火山资产并轮询到 active', async () => {
    const arkClient: ArkAssetClient = {
      createAsset: vi.fn().mockResolvedValue('asset-100'),
      getAsset: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'asset-100',
          status: 'Processing',
          url: '',
          errorCode: null,
          errorMessage: null,
        })
        .mockResolvedValueOnce({
          id: 'asset-100',
          status: 'Active',
          url: 'asset://asset-100',
          errorCode: null,
          errorMessage: null,
        }),
      deleteAsset: vi.fn().mockResolvedValue(undefined),
    }

    repository.seed([
      {
        id: 1,
        createdByUserId: 1,
        sourceProjectId: 101,
        name: '角色A',
        assetType: 'Image',
        categoryId: 1,
        groupSyncEnabled: true,
        syncMode: 'inherit',
        ossKey: 'assets/a.png',
        arkGroupId: null,
        arkAssetId: null,
        arkStatus: 'pending',
        arkError: null,
        tags: ['角色A'],
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createAssetSyncProcessor({
      repository,
      ossService,
      arkClient,
      getDefaultGroupId: async () => 'group-default',
      getDefaultSyncEnabled: async () => true,
      getProjectName: async () => 'xcyj',
      sleep: vi.fn().mockResolvedValue(undefined),
    })

    await processor({ assetId: 1 })

    expect(ossService.signedRequests).toEqual([{ ossKey: 'assets/a.png', ttlSeconds: 86_400 }])
    expect(arkClient.createAsset).toHaveBeenCalledWith(
      'group-default',
      'https://signed.example.com/assets/a.png',
      '角色A',
      'Image',
      'xcyj'
    )
    expect(arkClient.getAsset).toHaveBeenCalledTimes(2)
    expect(arkClient.getAsset).toHaveBeenNthCalledWith(1, 'asset-100', 'xcyj')
    expect(arkClient.getAsset).toHaveBeenNthCalledWith(2, 'asset-100', 'xcyj')
    expect(repository.updates).toEqual([
      {
        id: 1,
        patch: {
          arkGroupId: 'group-default',
          arkAssetId: 'asset-100',
          arkStatus: 'processing',
          arkError: null,
        },
      },
      {
        id: 1,
        patch: {
          arkStatus: 'active',
          arkError: null,
        },
      },
    ])
  })

  it('瞬时网络错误保持 pending 等待重试，不落 failed 终态', async () => {
    const arkClient: ArkAssetClient = {
      createAsset: vi.fn().mockRejectedValue(new TypeError('fetch failed')),
      getAsset: vi.fn(),
      deleteAsset: vi.fn(),
    }

    repository.seed([
      {
        id: 30,
        createdByUserId: 1,
        sourceProjectId: 101,
        name: '网络抖动素材',
        assetType: 'Image',
        categoryId: 1,
        groupSyncEnabled: true,
        syncMode: 'inherit',
        ossKey: 'assets/net.png',
        arkGroupId: null,
        arkAssetId: null,
        arkStatus: 'pending',
        arkError: null,
        tags: [],
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createAssetSyncProcessor({
      repository,
      ossService,
      arkClient,
      getDefaultGroupId: async () => 'group-default',
      getDefaultSyncEnabled: async () => true,
      getProjectName: async () => 'xcyj',
      sleep: vi.fn().mockResolvedValue(undefined),
    })

    await expect(processor({ assetId: 30 })).rejects.toThrow('fetch failed')

    expect(repository.updates).toEqual([
      {
        id: 30,
        patch: {
          arkStatus: 'pending',
          arkError: '同步暂时失败，等待自动重试: fetch failed',
        },
      },
    ])
  })

  it('永久性错误仍标记 failed 终态', async () => {
    const arkClient: ArkAssetClient = {
      createAsset: vi.fn().mockRejectedValue(new Error('InvalidParameter.AspectRatioTooSmall: bad ratio')),
      getAsset: vi.fn(),
      deleteAsset: vi.fn(),
    }

    repository.seed([
      {
        id: 31,
        createdByUserId: 1,
        sourceProjectId: 101,
        name: '非法素材',
        assetType: 'Image',
        categoryId: 1,
        groupSyncEnabled: true,
        syncMode: 'inherit',
        ossKey: 'assets/bad.png',
        arkGroupId: null,
        arkAssetId: null,
        arkStatus: 'pending',
        arkError: null,
        tags: [],
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createAssetSyncProcessor({
      repository,
      ossService,
      arkClient,
      getDefaultGroupId: async () => 'group-default',
      getDefaultSyncEnabled: async () => true,
      getProjectName: async () => 'xcyj',
      sleep: vi.fn().mockResolvedValue(undefined),
    })

    await expect(processor({ assetId: 31 })).rejects.toThrow('InvalidParameter')

    expect(repository.updates).toEqual([
      {
        id: 31,
        patch: {
          arkStatus: 'failed',
          arkError: 'InvalidParameter.AspectRatioTooSmall: bad ratio',
        },
      },
    ])
  })

  it('幂等重试时若已有 arkAssetId 则不会重复 createAsset', async () => {
    const arkClient: ArkAssetClient = {
      createAsset: vi.fn().mockResolvedValue('asset-new'),
      getAsset: vi.fn().mockResolvedValue({
        id: 'asset-existing',
        status: 'Active',
        url: 'asset://asset-existing',
        errorCode: null,
        errorMessage: null,
      }),
      deleteAsset: vi.fn().mockResolvedValue(undefined),
    }

    repository.seed([
      {
        id: 2,
        createdByUserId: 1,
        sourceProjectId: 101,
        name: '角色B',
        assetType: 'Image',
        categoryId: null,
        groupSyncEnabled: null,
        syncMode: 'inherit',
        ossKey: 'assets/b.png',
        arkGroupId: 'group-1',
        arkAssetId: 'asset-existing',
        arkStatus: 'processing',
        arkError: null,
        tags: [],
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createAssetSyncProcessor({
      repository,
      ossService,
      arkClient,
      getDefaultGroupId: async () => 'group-default',
      getDefaultSyncEnabled: async () => true,
      getProjectName: async () => 'comic-drama',
      sleep: vi.fn().mockResolvedValue(undefined),
    })

    await processor({ assetId: 2 })

    expect(arkClient.createAsset).not.toHaveBeenCalled()
    expect(arkClient.getAsset).toHaveBeenCalledWith('asset-existing', 'comic-drama')
    expect(repository.updates).toEqual([
      {
        id: 2,
        patch: {
          arkStatus: 'active',
          arkError: null,
        },
      },
    ])
  })

  it('删除处理会依次删除 OSS、火山资产和 DB 记录', async () => {
    const arkClient: ArkAssetClient = {
      createAsset: vi.fn().mockResolvedValue('asset-new'),
      getAsset: vi.fn().mockResolvedValue({
        id: 'asset-3',
        status: 'Active',
        url: 'asset://asset-3',
        errorCode: null,
        errorMessage: null,
      }),
      deleteAsset: vi.fn().mockResolvedValue(undefined),
    }

    repository.seed([
      {
        id: 3,
        createdByUserId: 1,
        sourceProjectId: 101,
        name: '角色C',
        assetType: 'Image',
        categoryId: null,
        groupSyncEnabled: null,
        syncMode: 'inherit',
        ossKey: 'assets/c.png',
        arkGroupId: 'group-1',
        arkAssetId: 'asset-3',
        arkStatus: 'deleting',
        arkError: null,
        tags: [],
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createAssetDeleteProcessor({
      repository,
      ossService,
      arkClient,
      getProjectName: async () => 'xcyj',
    })

    await processor({ assetId: 3 })

    expect(ossService.deletedKeys).toEqual(['assets/c.png'])
    expect(arkClient.deleteAsset).toHaveBeenCalledWith('asset-3', 'xcyj')
    expect(repository.deletedIds).toEqual([3])
  })

  it('删除任一步失败时会记录 arkError 便于重试', async () => {
    const arkClient: ArkAssetClient = {
      createAsset: vi.fn().mockResolvedValue('asset-new'),
      getAsset: vi.fn().mockResolvedValue({
        id: 'asset-4',
        status: 'Active',
        url: 'asset://asset-4',
        errorCode: null,
        errorMessage: null,
      }),
      deleteAsset: vi.fn().mockRejectedValue(new Error('ark delete failed')),
    }

    repository.seed([
      {
        id: 4,
        createdByUserId: 1,
        sourceProjectId: 101,
        name: '角色D',
        assetType: 'Image',
        categoryId: null,
        groupSyncEnabled: null,
        syncMode: 'inherit',
        ossKey: 'assets/d.png',
        arkGroupId: 'group-1',
        arkAssetId: 'asset-4',
        arkStatus: 'deleting',
        arkError: null,
        tags: [],
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createAssetDeleteProcessor({
      repository,
      ossService,
      arkClient,
      getProjectName: async () => 'xcyj',
    })

    // 远端删除失败不再阻断本地清理：记录错误后仍删除 DB 记录，残留远端素材由 reconcile 幂等重推
    await processor({ assetId: 4 })
    expect(repository.deletedIds).toEqual([4])
    expect(repository.updates).toContainEqual({
      id: 4,
      patch: {
        arkError: '火山素材删除失败: ark delete failed',
      },
    })
  })

  it('火山返回素材不存在时仍会完成本地删除，避免卡在 deleting', async () => {
    const arkClient: ArkAssetClient = {
      createAsset: vi.fn().mockResolvedValue('asset-new'),
      getAsset: vi.fn().mockResolvedValue({
        id: 'asset-5',
        status: 'Active',
        url: 'asset://asset-5',
        errorCode: null,
        errorMessage: null,
      }),
      deleteAsset: vi
        .fn()
        .mockRejectedValue(new Error('The specified asset asset-20260407160759-vnfl4 is not found')),
    }

    repository.seed([
      {
        id: 5,
        createdByUserId: 1,
        sourceProjectId: 101,
        name: '角色E',
        assetType: 'Image',
        categoryId: null,
        groupSyncEnabled: null,
        syncMode: 'inherit',
        ossKey: 'assets/e.png',
        arkGroupId: 'group-1',
        arkAssetId: 'asset-20260407160759-vnfl4',
        arkStatus: 'deleting',
        arkError: null,
        tags: [],
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])

    const processor = createAssetDeleteProcessor({
      repository,
      ossService,
      arkClient,
      getProjectName: async () => 'xcyj',
    })

    await expect(processor({ assetId: 5 })).resolves.toBeUndefined()
    expect(ossService.deletedKeys).toEqual(['assets/e.png'])
    expect(arkClient.deleteAsset).toHaveBeenCalledWith('asset-20260407160759-vnfl4', 'xcyj')
    expect(repository.deletedIds).toEqual([5])
    expect(repository.updates).toEqual([])
  })

  it('重新补推删除任务时会优先 retry 已失败的同 jobId 任务', async () => {
    const retry = vi.fn().mockResolvedValue(undefined)
    const remove = vi.fn().mockResolvedValue(undefined)
    const add = vi.fn().mockResolvedValue(undefined)
    const getJob = vi.fn().mockResolvedValue({
      getState: vi.fn().mockResolvedValue('failed'),
      retry,
      remove,
    })

    await ensureJobScheduled(
      {
        add,
        getJob,
      },
      ASSET_DELETE_QUEUE_NAME,
      { assetId: 5 },
      {
        jobId: 'asset-delete-5',
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      }
    )

    expect(getJob).toHaveBeenCalledWith('asset-delete-5')
    expect(retry).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })
})
