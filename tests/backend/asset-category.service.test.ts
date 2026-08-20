import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ArkAssetClient, ArkAssetGroupInfo } from '../../backend/src/lib/ark-aksk'
import { AssetCategoryService, type AssetCategoryRecord, type AssetCategoryRepository } from '../../backend/src/services/asset-category.service'
import type { AssetDispatcher } from '../../backend/src/services/asset.service'

class FakeAssetCategoryRepository implements AssetCategoryRepository {
  private categories = new Map<number, AssetCategoryRecord>()
  private projectCodes = new Map<number, string>([[101, 'urban-rise']])
  private nextId = 10

  public seed(categories: AssetCategoryRecord[]) {
    this.categories = new Map(categories.map((category) => [category.id, category]))
  }

  public async list(projectId: number, _createdByUserId?: number): Promise<Array<AssetCategoryRecord & { assetCount: number }>> {
    return [...this.categories.values()]
      .filter((category) => category.projectId === projectId)
      .map((category) => ({ ...category, assetCount: 0 }))
  }

  public async findById(projectId: number, id: number): Promise<AssetCategoryRecord | null> {
    const category = this.categories.get(id)
    return category && category.projectId === projectId ? category : null
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
    const record: AssetCategoryRecord = {
      id: this.nextId++,
      projectId,
      name: input.name,
      sortOrder: input.sortOrder,
      syncEnabled: input.syncEnabled,
      arkGroupId: input.arkGroupId,
    }
    this.categories.set(record.id, record)
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

    const next: AssetCategoryRecord = {
      ...current,
      name: input.name ?? current.name,
      sortOrder: input.sortOrder ?? current.sortOrder,
      syncEnabled: input.syncEnabled ?? current.syncEnabled,
      arkGroupId: input.arkGroupId ?? current.arkGroupId,
    }
    this.categories.set(id, next)
    return next
  }

  public async delete(_projectId: number, _id: number, _targetCategoryId?: number | null): Promise<{ affectedAssets: number; deleted: boolean }> {
    return { affectedAssets: 0, deleted: true }
  }
}

class StringIdAssetCategoryRepository extends FakeAssetCategoryRepository {
  public override async list(projectId: number): Promise<Array<AssetCategoryRecord & { assetCount: number }>> {
    const categories = await super.list(projectId)
    return categories.map((category) => ({
      ...category,
      id: String(category.id) as unknown as number,
    }))
  }
}

class FakeAssetDispatcher implements AssetDispatcher {
  public readonly syncIds: number[] = []

  public async enqueueSync(assetId: number): Promise<void> {
    this.syncIds.push(assetId)
  }

  public async enqueueDelete(): Promise<void> {}
}

describe('AssetCategoryService', () => {
  let repository: FakeAssetCategoryRepository
  let dispatcher: FakeAssetDispatcher
  let remoteGroup: ArkAssetGroupInfo
  let arkClient: ArkAssetClient

  beforeEach(() => {
    repository = new FakeAssetCategoryRepository()
    dispatcher = new FakeAssetDispatcher()
    remoteGroup = {
      id: 'group-default-1',
      name: '角色',
      description: '角色 素材组',
      groupType: 'AIGC',
      projectName: null,
    }
    arkClient = {
      createAsset: vi.fn(),
      getAsset: vi.fn(),
      deleteAsset: vi.fn(),
      listAssetGroups: vi.fn(),
      createAssetGroup: vi.fn().mockResolvedValue(remoteGroup),
      updateAssetGroup: vi.fn().mockResolvedValue(remoteGroup),
    }
  })

  it('创建同步分类时会把当前项目解析出的 ProjectName 透传给火山素材组', async () => {
    const service = new AssetCategoryService(repository, arkClient, {
      getOptional: async () => 'true',
    } as any, dispatcher)

    await service.createCategory(101, {
      name: '角色',
      sortOrder: 1,
      syncEnabled: true,
    })

    expect(arkClient.createAssetGroup).toHaveBeenCalledWith({
      name: '角色',
      description: '角色 素材组',
      projectName: 'urban-rise',
    })
  })

  it('重命名已同步分类时会把当前项目解析出的 ProjectName 透传给火山素材组', async () => {
    repository.seed([
      {
        id: 1,
        projectId: 101,
        name: '旧角色',
        sortOrder: 1,
        syncEnabled: true,
        arkGroupId: 'group-existing',
      },
    ])

    const service = new AssetCategoryService(repository, arkClient, {
      getOptional: async () => 'true',
    } as any, dispatcher)

    await service.updateCategory(101, 1, {
      name: '新角色',
    })

    expect(arkClient.updateAssetGroup).toHaveBeenCalledWith({
      id: 'group-existing',
      name: '新角色',
      description: '新角色 素材组',
      projectName: 'urban-rise',
    })
  })

  it('创建未同步分类时不会读取 ProjectName 或调用火山素材组接口', async () => {
    const configService = {
      getOptional: vi.fn(async (key: string) => {
        if (key === 'ark_default_sync_enabled') {
          return 'false'
        }

        throw new Error(`不应读取配置: ${key}`)
      }),
    }
    const service = new AssetCategoryService(repository, arkClient, configService as any, dispatcher)

    const category = await service.createCategory(101, {
      name: '道具',
      sortOrder: 3,
      syncEnabled: false,
    })

    expect(category.syncEnabled).toBe(false)
    expect(category.arkGroupId).toBeNull()
    expect(arkClient.createAssetGroup).not.toHaveBeenCalled()
    expect(configService.getOptional).not.toHaveBeenCalledWith('ark_project_name_mode')
    expect(configService.getOptional).not.toHaveBeenCalledWith('ark_project_name_default_value')
  })

  it('删除分类时即使仓储返回字符串 id，也能识别当前分类', async () => {
    const repository = new StringIdAssetCategoryRepository()
    repository.seed([
      {
        id: 20,
        projectId: 101,
        name: '测试用移动可同步',
        sortOrder: 3,
        syncEnabled: true,
        arkGroupId: 'group-20260407211145-wclhp',
      },
    ])

    const service = new AssetCategoryService(repository, arkClient, {
      getOptional: async () => 'true',
    } as any, dispatcher)

    await expect(service.deleteCategory(101, 20)).resolves.toEqual({
      affectedAssets: 0,
      targetCategoryId: null,
    })
  })
})
