import { sql } from 'kysely'

import { db, type Database } from '../db/kysely'
import { type ArkAssetClient } from '../lib/ark-aksk'
import { ProviderAssetClient } from '../lib/toapis-avatar'
import { NoopAssetDispatcher, type AssetDispatcher } from './asset.service'
import { ArkProjectNameService } from './ark-project-name.service'
import { ConfigService } from './config.service'
import { NotFoundError, ValidationAppError } from '../utils/errors'

export interface AssetCategoryRecord {
  id: number
  projectId: number
  name: string
  sortOrder: number
  syncEnabled: boolean
  arkGroupId: string | null
}

export interface AssetCategoryRepository {
  list(projectId: number, createdByUserId?: number): Promise<Array<AssetCategoryRecord & { assetCount: number }>>
  findById(projectId: number, id: number): Promise<AssetCategoryRecord | null>
  existsName(projectId: number, name: string, excludeCategoryId?: number): Promise<boolean>
  findProjectCode(projectId: number): Promise<string | null>
  listSyncCandidateAssetIds(projectId: number, categoryId: number): Promise<number[]>
  create(projectId: number, input: { name: string; sortOrder: number; syncEnabled: boolean; arkGroupId: string | null }): Promise<AssetCategoryRecord>
  update(
    projectId: number,
    id: number,
    input: { name?: string; sortOrder?: number; syncEnabled?: boolean; arkGroupId?: string | null }
  ): Promise<AssetCategoryRecord | null>
  delete(projectId: number, id: number, targetCategoryId?: number | null): Promise<{ affectedAssets: number; deleted: boolean }>
}

export class KyselyAssetCategoryRepository implements AssetCategoryRepository {
  public constructor(private readonly database = db) {}

  public async list(projectId: number, createdByUserId?: number): Promise<Array<AssetCategoryRecord & { assetCount: number }>> {
    const ownerColumn = (await this.hasColumn('assets', 'created_by_user_id')) ? 'created_by_user_id' : 'user_id'

    const rows = await this.database
      .selectFrom('asset_categories as categories')
      .leftJoin('project_assets as projectAssets', (join) =>
        join.onRef('projectAssets.category_id', '=', 'categories.id').on('projectAssets.project_id', '=', projectId)
      )
      .leftJoin('assets as assets', 'assets.id', 'projectAssets.asset_id')
      .select([
        'categories.id as id',
        'categories.project_id as projectId',
        'categories.name as name',
        'categories.sort_order as sortOrder',
        'categories.sync_enabled as syncEnabled',
        'categories.ark_group_id as arkGroupId',
        createdByUserId === undefined
          ? ((eb) => eb.fn.count<number>('projectAssets.id').as('assetCount'))
          : sql<number>`count(case when ${sql.ref(`assets.${ownerColumn}`)} = ${createdByUserId} then ${sql.ref(
              'projectAssets.id'
            )} end)`.as('assetCount'),
      ])
      .where('categories.project_id', '=', projectId)
      .groupBy([
        'categories.id',
        'categories.project_id',
        'categories.name',
        'categories.sort_order',
        'categories.sync_enabled',
        'categories.ark_group_id',
      ])
      .orderBy('categories.sort_order', 'asc')
      .orderBy('categories.id', 'asc')
      .execute()

    return rows.map((row) => ({
      id: Number(row.id),
      projectId: Number(row.projectId),
      name: row.name,
      sortOrder: row.sortOrder,
      syncEnabled: row.syncEnabled,
      arkGroupId: row.arkGroupId,
      assetCount: Number(row.assetCount),
    }))
  }

  private async hasColumn(tableName: string, columnName: string): Promise<boolean> {
    const result = await sql<{ exists: number }>`
      select 1 as exists
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
      limit 1
    `.execute(this.database as any)

    return result.rows.length > 0
  }

  public async findById(projectId: number, id: number): Promise<AssetCategoryRecord | null> {
    const row = await this.database
      .selectFrom('asset_categories')
      .select(['id', 'project_id', 'name', 'sort_order'])
      .select(['sync_enabled', 'ark_group_id'])
      .where('id', '=', id)
      .where('project_id', '=', projectId)
      .executeTakeFirst()

    return row
      ? {
          id: Number(row.id),
          projectId: Number(row.project_id),
          name: row.name,
          sortOrder: row.sort_order,
          syncEnabled: row.sync_enabled,
          arkGroupId: row.ark_group_id,
        }
      : null
  }

  public async existsName(projectId: number, name: string, excludeCategoryId?: number): Promise<boolean> {
    const normalizedName = name.trim().toLocaleLowerCase()
    let query = this.database
      .selectFrom('asset_categories')
      .select('id')
      .where('project_id', '=', projectId)
      .where(sql<boolean>`lower(trim(name)) = ${normalizedName}`)

    if (excludeCategoryId !== undefined) {
      query = query.where('id', '!=', excludeCategoryId)
    }

    const row = await query.executeTakeFirst()
    return Boolean(row)
  }

  public async findProjectCode(projectId: number): Promise<string | null> {
    const row = await this.database.selectFrom('projects').select('code').where('id', '=', projectId).executeTakeFirst()
    return row?.code ?? null
  }

  public async listSyncCandidateAssetIds(projectId: number, categoryId: number): Promise<number[]> {
    const rows = await this.database
      .selectFrom('assets')
      .innerJoin('project_assets', 'project_assets.asset_id', 'assets.id')
      .select('assets.id')
      .where('project_assets.project_id', '=', projectId)
      .where('project_assets.category_id', '=', categoryId)
      .where('assets.source_project_id', '=', projectId)
      .where('assets.sync_mode', '!=', 'disabled')
      .execute()

    return rows.map((row) => Number(row.id))
  }

  public async create(
    projectId: number,
    input: { name: string; sortOrder: number; syncEnabled: boolean; arkGroupId: string | null }
  ): Promise<AssetCategoryRecord> {
    const row = await this.database
      .insertInto('asset_categories')
      .values({
        project_id: projectId,
        name: input.name,
        sort_order: input.sortOrder,
        sync_enabled: input.syncEnabled,
        ark_group_id: input.arkGroupId,
      })
      .returning(['id', 'project_id', 'name', 'sort_order', 'sync_enabled', 'ark_group_id'])
      .executeTakeFirstOrThrow()

    return {
      id: Number(row.id),
      projectId: Number(row.project_id),
      name: row.name,
      sortOrder: row.sort_order,
      syncEnabled: row.sync_enabled,
      arkGroupId: row.ark_group_id,
    }
  }

  public async update(
    projectId: number,
    id: number,
    input: { name?: string; sortOrder?: number; syncEnabled?: boolean; arkGroupId?: string | null }
  ): Promise<AssetCategoryRecord | null> {
    const row = await this.database
      .updateTable('asset_categories')
      .set({
        name: input.name,
        sort_order: input.sortOrder,
        sync_enabled: input.syncEnabled,
        ark_group_id: input.arkGroupId,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('project_id', '=', projectId)
      .returning(['id', 'project_id', 'name', 'sort_order', 'sync_enabled', 'ark_group_id'])
      .executeTakeFirst()

    return row
      ? {
          id: Number(row.id),
          projectId: Number(row.project_id),
          name: row.name,
          sortOrder: row.sort_order,
          syncEnabled: row.sync_enabled,
          arkGroupId: row.ark_group_id,
        }
      : null
  }

  public async delete(projectId: number, id: number, targetCategoryId?: number | null): Promise<{ affectedAssets: number; deleted: boolean }> {
    return await this.database.transaction().execute(async (trx) => {
      const affectedAssetsResult = await trx
        .updateTable('project_assets')
        .set({
          category_id: targetCategoryId ?? null,
        })
        .where('category_id', '=', id)
        .where('project_id', '=', projectId)
        .returning('id')
        .execute()

      const deleted = await trx
        .deleteFrom('asset_categories')
        .where('id', '=', id)
        .where('project_id', '=', projectId)
        .executeTakeFirst()

      return {
        affectedAssets: affectedAssetsResult.length,
        deleted: Number(deleted.numDeletedRows ?? 0) > 0,
      }
    })
  }
}

export class AssetCategoryService {
  private readonly projectNameService: ArkProjectNameService

  public constructor(
    private readonly repository: AssetCategoryRepository = new KyselyAssetCategoryRepository(),
    private readonly arkClient: ArkAssetClient = new ProviderAssetClient(),
    private readonly configService: ConfigService = new ConfigService(),
    private readonly assetDispatcher: AssetDispatcher = new NoopAssetDispatcher()
  ) {
    this.projectNameService = new ArkProjectNameService(this.configService, this.repository)
  }

  public async listCategories(
    projectId: number,
    context?: {
      userId: number
      projectRole: 'manager' | 'member' | 'viewer' | null
    }
  ) {
    return {
      items: await this.repository.list(projectId, context?.projectRole === 'member' ? context.userId : undefined),
    }
  }

  public async findCategory(projectId: number, id: number): Promise<AssetCategoryRecord | null> {
    return await this.repository.findById(projectId, id)
  }

  public async createCategory(
    projectId: number,
    input: { name: string; sortOrder: number; syncEnabled?: boolean }
  ) {
    await this.ensureCategoryNameAvailable(projectId, input.name)
    const syncEnabled = input.syncEnabled ?? (await this.getDefaultSyncEnabled())
    const remoteGroup = syncEnabled
      ? await this.arkClient.createAssetGroup({
          name: input.name,
          description: `${input.name} 素材组`,
          projectName: await this.projectNameService.resolve(projectId),
        })
      : null

    return await this.repository.create(projectId, {
      name: input.name,
      sortOrder: input.sortOrder,
      syncEnabled,
      arkGroupId: remoteGroup?.id ?? null,
    })
  }

  public async updateCategory(
    projectId: number,
    id: number,
    input: { name?: string; sortOrder?: number; syncEnabled?: boolean }
  ) {
    const current = await this.repository.findById(projectId, id)
    if (!current) {
      throw new NotFoundError('分类不存在')
    }

    const nextName = input.name ?? current.name
    await this.ensureCategoryNameAvailable(projectId, nextName, id)

    const nextSyncEnabled = input.syncEnabled ?? current.syncEnabled

    let nextArkGroupId = current.arkGroupId

    if (nextSyncEnabled) {
      const projectName = await this.projectNameService.resolve(projectId)
      const groupMatchesProvider = (await this.arkClient.matchesGroupId?.(current.arkGroupId)) !== false
      if (!current.arkGroupId || !groupMatchesProvider) {
        const createdGroup = await this.arkClient.createAssetGroup({
          name: nextName,
          description: `${nextName} 素材组`,
          projectName,
        })
        nextArkGroupId = createdGroup.id
      } else if (input.name && input.name !== current.name) {
        await this.arkClient.updateAssetGroup({
          id: current.arkGroupId,
          name: input.name,
          description: `${input.name} 素材组`,
          projectName,
        })
      }
    }

    const category = await this.repository.update(projectId, id, {
      ...input,
      syncEnabled: nextSyncEnabled,
      arkGroupId: nextArkGroupId,
    })
    if (!category) {
      throw new NotFoundError('分类不存在')
    }

    if (!current.syncEnabled && category.syncEnabled) {
      const candidateIds = await this.repository.listSyncCandidateAssetIds(projectId, id)
      await Promise.all(candidateIds.map((assetId) => this.assetDispatcher.enqueueSync(assetId)))
    }

    return category
  }

  public async deleteCategory(projectId: number, id: number, input: { targetCategoryId?: number | null } = {}) {
    const categories = await this.repository.list(projectId)
    const current = categories.find((item) => Number(item.id) === id)
    if (!current) {
      throw new NotFoundError('分类不存在')
    }

    if (current.assetCount > 0 && input.targetCategoryId === undefined) {
      throw new ValidationAppError('删除非空素材组前，请先选择迁移目标')
    }

    if (input.targetCategoryId !== undefined && input.targetCategoryId !== null) {
      if (input.targetCategoryId === id) {
        throw new ValidationAppError('迁移目标不能与当前素材组相同')
      }

      const targetCategory = await this.repository.findById(projectId, input.targetCategoryId)
      if (!targetCategory) {
        throw new ValidationAppError('迁移目标素材组不存在')
      }
    }

    const result = await this.repository.delete(projectId, id, input.targetCategoryId)
    if (!result.deleted) {
      throw new NotFoundError('分类不存在')
    }

    return {
      affectedAssets: result.affectedAssets,
      targetCategoryId: input.targetCategoryId ?? null,
    }
  }

  private async getDefaultSyncEnabled(): Promise<boolean> {
    try {
      const configured = await this.configService.getOptional('ark_default_sync_enabled')
      return configured === null ? true : configured === 'true'
    } catch {
      return true
    }
  }

  private async ensureCategoryNameAvailable(projectId: number, name: string, excludeCategoryId?: number): Promise<void> {
    if (await this.repository.existsName(projectId, name, excludeCategoryId)) {
      throw new ValidationAppError('素材组名称已存在')
    }
  }
}
