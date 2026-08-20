import { sql, type Kysely } from 'kysely'

import { db, type Database } from '../db/kysely'
import { toJsonbString } from '../db/json'
import { ConfigService } from './config.service'
import type { ProjectAccessRepository } from './project-access.service'
import { ProjectAccessService } from './project-access.service'
import { ConflictError, NotFoundError, ValidationAppError } from '../utils/errors'
import { assertProjectPermission, canDeleteAsset, canUploadAsset } from '../utils/project-permissions'
import type { OssServiceContract } from './oss.service'

export type AssetType = 'Image' | 'Video' | 'Audio'
export type AssetStatus = 'pending' | 'processing' | 'active' | 'failed' | 'deleting'
export type AssetRelationType = 'primary' | 'linked'
export type AssetScope = 'project' | 'global'
export type AssetSyncMode = 'inherit' | 'enabled' | 'disabled'

export interface AssetRecord {
  id: number
  createdByUserId: number
  uploaderName?: string | null
  sourceProjectId: number | null
  name: string
  assetType: AssetType
  categoryId: number | null
  groupSyncEnabled: boolean | null
  syncMode: AssetSyncMode
  ossKey: string
  arkGroupId: string | null
  arkAssetId: string | null
  arkStatus: AssetStatus
  arkError: string | null
  tags: string[]
  projectIds: number[]
  projectNames: string[]
  createdAt: Date
  updatedAt: Date
}

export interface AssetQueryParams {
  scope?: AssetScope
  status?: string
  keyword?: string
  uploader?: string
  assetType?: string
  categoryId?: number
  createdByUserId?: number
  page?: number
  pageSize?: number
}

export interface AssetProjectLinkInput {
  projectId: number
  categoryId: number | null
  relationType: AssetRelationType
  createdBy: number | null
}

export interface AssetRepository {
  existsNameInProjects(name: string, projectIds: number[], excludeAssetId?: number): Promise<boolean>
  create(input: {
    createdByUserId: number
    sourceProjectId: number
    name: string
    assetType: AssetType
    categoryId?: number | null
    ossKey: string
    tags: string[]
    syncMode: AssetSyncMode
    arkGroupId: string | null
    arkAssetId?: string | null
    arkStatus?: AssetStatus
    arkError?: string | null
  }): Promise<AssetRecord>
  attachProjects(assetId: number, links: AssetProjectLinkInput[]): Promise<void>
  list(params: AssetQueryParams & { projectId: number; scope: AssetScope }): Promise<{ items: AssetRecord[]; total: number }>
  findById(id: number, params?: { projectId?: number; scope?: AssetScope }): Promise<AssetRecord | null>
  findByArkAssetId(arkAssetId: string): Promise<AssetRecord | null>
  update(
    id: number,
    patch: {
      name?: string
      categoryId?: number | null
      syncMode?: AssetSyncMode
      arkGroupId?: string | null
      arkAssetId?: string | null
      arkStatus?: AssetStatus
      arkError?: string | null
      tags?: string[]
    }
  ): Promise<AssetRecord | null>
  listByStatuses(statuses: string[]): Promise<AssetRecord[]>
  deleteById(id: number): Promise<void>
  isReferenced(assetId: number, arkAssetId: string | null): Promise<boolean>
  countProjectLinks(assetId: number): Promise<number>
  getCategory(
    projectId: number,
    categoryId: number
  ): Promise<{ id: number; syncEnabled: boolean; arkGroupId: string | null } | null>
  findProjectCode(projectId: number): Promise<string | null>
  unlinkFromProject(assetId: number, projectId: number): Promise<number>
  hasProjectLink(assetId: number, projectId: number): Promise<boolean>
  removeProjectLink(input: {
    assetId: number
    projectId: number
    allowRemoveLastLink: boolean
    preventReferencedOrphan: boolean
    arkAssetId: string | null
  }): Promise<{
    status: 'not_linked' | 'unlinked' | 'orphaned' | 'blocked_last_link' | 'unchanged_last_link'
    remainingProjectCount: number
  }>
}

export interface AssetDispatcher {
  enqueueSync(assetId: number): Promise<void>
  enqueueDelete(assetId: number): Promise<void>
}

type AssetRow = {
  id: number
  user_id?: number
  created_by_user_id?: number
  source_project_id?: number | null
  category_id?: number | null
  sync_mode?: AssetSyncMode
  name: string
  asset_type: AssetType
  oss_key: string
  ark_group_id: string | null
  ark_asset_id: string | null
  ark_status: string
  ark_error: string | null
  tags: string[]
  created_at: Date | string
  updated_at: Date | string
}

export class KyselyAssetRepository implements AssetRepository {
  public constructor(private readonly database: Kysely<Database> = db) {}

  public async existsNameInProjects(name: string, projectIds: number[], excludeAssetId?: number): Promise<boolean> {
    if (projectIds.length === 0) {
      return false
    }

    const normalizedName = name.trim().toLocaleLowerCase()
    let query = this.database
      .selectFrom('assets')
      .innerJoin('project_assets', 'project_assets.asset_id', 'assets.id')
      .select('assets.id')
      .where('project_assets.project_id', 'in', projectIds)
      .where(sql<boolean>`lower(trim(assets.name)) = ${normalizedName}`)

    if (excludeAssetId !== undefined) {
      query = query.where('assets.id', '!=', excludeAssetId)
    }

    const row = await query.distinct().executeTakeFirst()
    return Boolean(row)
  }

  public async create(input: {
    userId?: number
    createdByUserId?: number
    sourceProjectId?: number
    name: string
    assetType: AssetType
    categoryId?: number | null
    ossKey: string
    tags: string[]
    syncMode: AssetSyncMode
    arkGroupId: string | null
    arkAssetId?: string | null
    arkStatus?: AssetStatus
    arkError?: string | null
  }): Promise<AssetRecord> {
    const hasCreatedByUserIdColumn = await this.hasColumn('assets', 'created_by_user_id')
    const hasSourceProjectIdColumn = await this.hasColumn('assets', 'source_project_id')
    const userId = input.createdByUserId ?? input.userId ?? 0

    const values: Record<string, unknown> = {
      user_id: userId,
      name: input.name,
      asset_type: input.assetType,
      category_id: input.categoryId ?? null,
      sync_mode: input.syncMode,
      oss_key: input.ossKey,
      ark_group_id: input.arkGroupId,
      ark_asset_id: input.arkAssetId ?? null,
      ark_status: input.arkStatus ?? 'pending',
      ark_error: input.arkError ?? null,
      tags: toJsonbString(input.tags),
    }

    if (hasCreatedByUserIdColumn) {
      values.created_by_user_id = userId
    }

    if (hasSourceProjectIdColumn) {
      values.source_project_id = input.sourceProjectId ?? null
    }

    const row = await this.database
      .insertInto('assets')
      .values(values as any)
      .returningAll()
      .executeTakeFirstOrThrow()

    return await this.hydrateAsset(row)
  }

  public async attachProjects(assetId: number, links: AssetProjectLinkInput[]): Promise<void> {
    if (links.length === 0) {
      return
    }

    await this.database
      .insertInto('project_assets')
      .values(
        links.map((link) => ({
          project_id: link.projectId,
          asset_id: assetId,
          category_id: link.categoryId,
          relation_type: link.relationType,
          created_by: link.createdBy,
        }))
      )
      .onConflict((oc) =>
        oc.columns(['project_id', 'asset_id']).doUpdateSet((eb) => ({
          category_id: eb.ref('excluded.category_id'),
          relation_type: eb.ref('excluded.relation_type'),
          created_by: eb.ref('excluded.created_by'),
        }))
      )
      .execute()
  }

  public async list(params: AssetQueryParams & { projectId: number; scope: AssetScope }): Promise<{ items: AssetRecord[]; total: number }> {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 20

    let query = this.database.selectFrom('assets')
    let countQuery = this.database.selectFrom('assets')

    if (params.scope === 'project') {
      query = query.innerJoin('project_assets as projectAssets', 'projectAssets.asset_id', 'assets.id').where('projectAssets.project_id', '=', params.projectId)
      countQuery = countQuery
        .innerJoin('project_assets as projectAssets', 'projectAssets.asset_id', 'assets.id')
        .where('projectAssets.project_id', '=', params.projectId)
    }

    if (params.status) {
      query = query.where('ark_status', '=', params.status as AssetStatus)
      countQuery = countQuery.where('ark_status', '=', params.status as AssetStatus)
    }
    if (params.assetType) {
      query = query.where('asset_type', '=', params.assetType as AssetType)
      countQuery = countQuery.where('asset_type', '=', params.assetType as AssetType)
    }
    if (params.keyword) {
      query = query.where((eb) =>
        eb.or([
          eb('name', 'ilike', `%${params.keyword}%`),
          sql<boolean>`exists (
            select 1
            from jsonb_array_elements_text(assets.tags) as tag(value)
            where tag.value ilike ${`%${params.keyword}%`}
          )`,
        ])
      )
      countQuery = countQuery.where((eb) =>
        eb.or([
          eb('name', 'ilike', `%${params.keyword}%`),
          sql<boolean>`exists (
            select 1
            from jsonb_array_elements_text(assets.tags) as tag(value)
            where tag.value ilike ${`%${params.keyword}%`}
          )`,
        ])
      )
    }
    if (params.uploader) {
      query = query
        .innerJoin('users as uploaders', 'uploaders.id', 'assets.created_by_user_id')
        .where('uploaders.username', 'ilike', `%${params.uploader}%`)
      countQuery = countQuery
        .innerJoin('users as uploaders', 'uploaders.id', 'assets.created_by_user_id')
        .where('uploaders.username', 'ilike', `%${params.uploader}%`)
    }
    if (params.categoryId && params.scope === 'project') {
      query = (query as any).where('projectAssets.category_id', '=', params.categoryId)
      countQuery = (countQuery as any).where('projectAssets.category_id', '=', params.categoryId)
    }
    if (params.createdByUserId) {
      query = query.where('assets.created_by_user_id', '=', params.createdByUserId)
      countQuery = countQuery.where('assets.created_by_user_id', '=', params.createdByUserId)
    }

    const [rows, totalRow] = await Promise.all([
      query
        .select('assets.id')
        .distinct()
        .orderBy('assets.id', 'desc')
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute(),
      countQuery.select((eb) => eb.fn.count<number>('assets.id').as('count')).executeTakeFirstOrThrow(),
    ])

    const items = await Promise.all(rows.map((row) => this.findById(Number(row.id), params)))
    return {
      items: items.filter((item): item is AssetRecord => item !== null),
      total: Number(totalRow.count),
    }
  }

  public async findById(id: number, params?: { projectId?: number; scope?: AssetScope }): Promise<AssetRecord | null> {
    let query = this.database.selectFrom('assets').selectAll().where('assets.id', '=', id)

    if (params?.scope === 'project' && params.projectId) {
      query = query
        .innerJoin('project_assets as projectAssets', 'projectAssets.asset_id', 'assets.id')
        .where('projectAssets.project_id', '=', params.projectId)
        .selectAll('assets')
    }

    const row = await query.executeTakeFirst()
    return row ? await this.hydrateAsset(row as AssetRow, params?.projectId) : null
  }

  public async findByArkAssetId(arkAssetId: string): Promise<AssetRecord | null> {
    const row = await this.database
      .selectFrom('assets')
      .selectAll()
      .where('ark_asset_id', '=', arkAssetId)
      .executeTakeFirst()

    return row ? await this.hydrateAsset(row as AssetRow) : null
  }

  public async update(
    id: number,
    patch: {
      name?: string
      categoryId?: number | null
      syncMode?: AssetSyncMode
      arkGroupId?: string | null
      arkAssetId?: string | null
      arkStatus?: AssetStatus
      arkError?: string | null
      tags?: string[]
    }
  ): Promise<AssetRecord | null> {
    const row = await this.database
      .updateTable('assets')
      .set({
        name: patch.name,
        category_id: patch.categoryId,
        sync_mode: patch.syncMode,
        ark_group_id: patch.arkGroupId,
        ark_asset_id: patch.arkAssetId,
        ark_status: patch.arkStatus,
        ark_error: patch.arkError,
        tags: patch.tags ? toJsonbString(patch.tags) : undefined,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    return row ? await this.hydrateAsset(row) : null
  }

  public async listByStatuses(statuses: string[]): Promise<AssetRecord[]> {
    const rows = await this.database
      .selectFrom('assets')
      .selectAll()
      .where('ark_status', 'in', statuses as AssetStatus[])
      .execute()
    return await Promise.all(rows.map((row) => this.hydrateAsset(row as AssetRow)))
  }

  public async deleteById(id: number): Promise<void> {
    await this.database.transaction().execute(async (trx) => {
      const hasProjectAssetsTable = await this.hasTableWithExecutor(trx, 'project_assets')
      const hasVideoTaskAssetsTable = await this.hasTableWithExecutor(trx, 'video_task_assets')
      const hasProjectsTable = await this.hasTableWithExecutor(trx, 'projects')

      if (hasVideoTaskAssetsTable) {
        await trx.deleteFrom('video_task_assets').where('asset_id', '=', id).execute()
      }

      if (hasProjectAssetsTable) {
        await trx.deleteFrom('project_assets').where('asset_id', '=', id).execute()
      }

      if (hasProjectsTable) {
        await trx
          .updateTable('projects')
          .set({
            cover_asset_id: null,
          })
          .where('cover_asset_id', '=', id)
          .execute()
      }

      await trx.deleteFrom('assets').where('id', '=', id).execute()
    })
  }

  public async isReferenced(assetId: number, arkAssetId: string | null): Promise<boolean> {
    return await this.isReferencedWithExecutor(this.database, assetId, arkAssetId)
  }

  public async countProjectLinks(assetId: number): Promise<number> {
    const row = await this.database
      .selectFrom('project_assets')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .where('asset_id', '=', assetId)
      .executeTakeFirstOrThrow()

    return Number(row.count)
  }

  public async getCategory(
    projectId: number,
    categoryId: number
  ): Promise<{ id: number; syncEnabled: boolean; arkGroupId: string | null } | null> {
    const row = await this.database
      .selectFrom('asset_categories')
      .select(['id', 'sync_enabled', 'ark_group_id'])
      .where('id', '=', categoryId)
      .where('project_id', '=', projectId)
      .executeTakeFirst()

    return row
      ? {
          id: Number(row.id),
          syncEnabled: row.sync_enabled,
          arkGroupId: row.ark_group_id,
        }
      : null
  }

  public async findProjectCode(projectId: number): Promise<string | null> {
    const row = await this.database
      .selectFrom('projects')
      .select('code')
      .where('id', '=', projectId)
      .executeTakeFirst()

    return row?.code ?? null
  }

  public async unlinkFromProject(assetId: number, projectId: number): Promise<number> {
    await this.database
      .deleteFrom('project_assets')
      .where('asset_id', '=', assetId)
      .where('project_id', '=', projectId)
      .execute()
    return await this.countProjectLinks(assetId)
  }

  public async hasProjectLink(assetId: number, projectId: number): Promise<boolean> {
    const row = await this.database
      .selectFrom('project_assets')
      .select('id')
      .where('asset_id', '=', assetId)
      .where('project_id', '=', projectId)
      .executeTakeFirst()

    return Boolean(row)
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
    return await this.database.transaction().execute(async (trx) => {
      const links = await trx
        .selectFrom('project_assets')
        .select(['id', 'project_id'])
        .where('asset_id', '=', input.assetId)
        .forUpdate()
        .execute()

      const targetLink = links.find((link) => Number(link.project_id) === input.projectId)
      if (!targetLink) {
        return {
          status: 'not_linked' as const,
          remainingProjectCount: links.length,
        }
      }

      if (links.length > 1) {
        await trx.deleteFrom('project_assets').where('id', '=', Number(targetLink.id)).execute()
        return {
          status: 'unlinked' as const,
          remainingProjectCount: links.length - 1,
        }
      }

      if (!input.allowRemoveLastLink) {
        return {
          status: 'unchanged_last_link' as const,
          remainingProjectCount: 1,
        }
      }

      if (input.preventReferencedOrphan && (await this.isReferencedWithExecutor(trx, input.assetId, input.arkAssetId))) {
        return {
          status: 'blocked_last_link' as const,
          remainingProjectCount: 1,
        }
      }

      await trx.deleteFrom('project_assets').where('id', '=', Number(targetLink.id)).execute()
      return {
        status: 'orphaned' as const,
        remainingProjectCount: 0,
      }
    })
  }

  private async isReferencedWithExecutor(
    executor: Kysely<Database>,
    assetId: number,
    arkAssetId: string | null
  ): Promise<boolean> {
    const videoTaskAssetsTable = await sql<{ video_task_assets: string | null }>`
      select to_regclass('public.video_task_assets') as video_task_assets
    `.execute(executor)

    if (videoTaskAssetsTable.rows[0]?.video_task_assets) {
      const referenced = await executor
        .selectFrom('video_task_assets')
        .innerJoin('video_tasks', 'video_tasks.id', 'video_task_assets.video_task_id')
        .select('video_task_assets.id')
        .where('asset_id', '=', assetId)
        .where('video_tasks.status', 'in', ['pending', 'processing'])
        .executeTakeFirst()

      if (referenced) {
        return true
      }
    }

    if (!arkAssetId) {
      return false
    }

    const reference = `%asset://${arkAssetId}%`
    const legacyResult = await sql<{ id: number }>`
      select id
      from video_tasks
      where status in ('pending', 'processing')
        and cast(request_snapshot as text) like ${reference}
      limit 1
    `.execute(executor)

    return legacyResult.rows.length > 0
  }

  private async hasTableWithExecutor(executor: Kysely<Database>, tableName: string): Promise<boolean> {
    const result = await sql<{ count: number }>`
      select count(*)::int as count
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${tableName}
    `.execute(executor)

    return Number(result.rows[0]?.count ?? 0) > 0
  }

  private async hydrateAsset(row: AssetRow, currentProjectId?: number): Promise<AssetRecord> {
    const hasProjectAssetTables =
      (await this.hasTable('project_assets')) && (await this.hasTable('projects'))

    const projectLinks = hasProjectAssetTables
      ? await this.database
          .selectFrom('project_assets')
          .innerJoin('projects', 'projects.id', 'project_assets.project_id')
          .leftJoin('asset_categories as categories', (join) =>
            join
              .onRef('categories.id', '=', 'project_assets.category_id')
              .onRef('categories.project_id', '=', 'project_assets.project_id')
          )
          .select([
            'project_assets.project_id as projectId',
            'project_assets.category_id as categoryId',
            'projects.name as projectName',
            'categories.sync_enabled as groupSyncEnabled',
            'categories.ark_group_id as categoryArkGroupId',
          ])
          .where('project_assets.asset_id', '=', row.id)
          .orderBy('project_assets.project_id', 'asc')
          .execute()
      : []

    const currentLink =
      projectLinks.find((link) => Number(link.projectId) === currentProjectId) ?? projectLinks[0] ?? null

    return {
      id: Number(row.id),
      createdByUserId: Number(row.created_by_user_id ?? row.user_id),
      uploaderName: await this.resolveUploaderName(Number(row.created_by_user_id ?? row.user_id)),
      sourceProjectId: row.source_project_id === null ? null : Number(row.source_project_id),
      name: row.name,
      assetType: row.asset_type,
      categoryId:
        currentLink?.categoryId === null || currentLink?.categoryId === undefined
          ? row.category_id === null || row.category_id === undefined
            ? null
            : Number(row.category_id)
          : Number(currentLink.categoryId),
      groupSyncEnabled: currentLink?.groupSyncEnabled ?? null,
      syncMode: row.sync_mode ?? 'inherit',
      ossKey: row.oss_key,
      arkGroupId: currentLink?.categoryArkGroupId ?? row.ark_group_id,
      arkAssetId: row.ark_asset_id,
      arkStatus: row.ark_status as AssetStatus,
      arkError: row.ark_error,
      tags: row.tags,
      projectIds: projectLinks.map((link) => Number(link.projectId)),
      projectNames: projectLinks.map((link) => link.projectName),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  private async hasTable(tableName: string): Promise<boolean> {
    const result = await sql<{ exists: number }>`
      select 1 as exists
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${tableName}
      limit 1
    `.execute(this.database)

    return result.rows.length > 0
  }

  private async hasColumn(tableName: string, columnName: string): Promise<boolean> {
    const result = await sql<{ exists: number }>`
      select 1 as exists
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
      limit 1
    `.execute(this.database)

    return result.rows.length > 0
  }

  private async resolveUploaderName(userId: number): Promise<string | null> {
    if (!userId || !(await this.hasTable('users'))) {
      return null
    }

    const row = await this.database
      .selectFrom('users')
      .select('username')
      .where('id', '=', userId)
      .executeTakeFirst()

    return row?.username ?? null
  }
}

export class NoopAssetDispatcher implements AssetDispatcher {
  public async enqueueSync(): Promise<void> {}
  public async enqueueDelete(): Promise<void> {}
}

export class AssetService {
  private readonly projectAccessService: ProjectAccessService

  public constructor(
    private readonly repository: AssetRepository = new KyselyAssetRepository(),
    private readonly dispatcher: AssetDispatcher = new NoopAssetDispatcher(),
    private readonly ossService: OssServiceContract,
    private readonly configService: ConfigService = new ConfigService(),
    projectAccessRepository?: ProjectAccessRepository
  ) {
    this.projectAccessService = new ProjectAccessService(projectAccessRepository)
  }

  public async createAsset(input: {
    userId: number
    userRole: 'admin' | 'user'
    projectId: number
    projectRole: 'manager' | 'member' | 'viewer' | null
    name: string
    assetType: AssetType
    categoryId: number | null
    syncMode?: AssetSyncMode
    ossKey: string
    tags: string[]
    linkProjectIds?: number[]
  }) {
    assertProjectPermission(canUploadAsset(input.projectRole), '当前项目角色不允许上传素材')

    const extraProjectIds = [...new Set((input.linkProjectIds ?? []).filter((projectId) => projectId !== input.projectId))]

    if (extraProjectIds.length > 0 && input.userRole !== 'admin') {
      throw new ConflictError('仅管理员可在上传时关联其他项目')
    }

    await this.validateProjects(input.userId, input.userRole, extraProjectIds)
    await this.ensureAssetNameAvailable(input.name, [input.projectId, ...extraProjectIds])
    const category = await this.validateCategory(input.projectId, input.categoryId)
    const syncMode = await this.resolveCreateSyncMode(input.projectId, category, input.syncMode)
    const shouldSync = await this.shouldSyncDraftAsset(input.assetType, syncMode, category?.syncEnabled ?? null)

    const asset = await this.repository.create({
      createdByUserId: input.userId,
      sourceProjectId: input.projectId,
      name: input.name,
      assetType: input.assetType,
      categoryId: input.categoryId,
      ossKey: input.ossKey,
      tags: input.tags,
      syncMode,
      arkGroupId: category?.arkGroupId ?? null,
      arkStatus: shouldSync ? 'pending' : 'active',
      arkError: null,
    })

    await this.repository.attachProjects(asset.id, [
      {
        projectId: input.projectId,
        categoryId: input.categoryId,
        relationType: 'primary',
        createdBy: input.userId,
      },
      ...extraProjectIds.map((projectId) => ({
        projectId,
        categoryId: null,
        relationType: 'linked' as const,
        createdBy: input.userId,
      })),
    ])

    if (await this.shouldSyncAsset(asset)) {
      await this.dispatcher.enqueueSync(asset.id)
    }
    return await this.getAsset(asset.id, { projectId: input.projectId, scope: 'project' })
  }

  public async checkAssetNameAvailable(input: {
    projectId: number
    name: string
    linkProjectIds?: number[]
  }) {
    const targetProjectIds = [...new Set([input.projectId, ...(input.linkProjectIds ?? [])])]
    const duplicated = await this.repository.existsNameInProjects(input.name, targetProjectIds)

    return {
      available: !duplicated,
    }
  }

  public async listAssets(
    params: AssetQueryParams,
    context: {
      userId: number
      userRole: 'admin' | 'user'
      projectId: number
      projectRole: 'manager' | 'member' | 'viewer' | null
    }
  ) {
    const scope: AssetScope = 'project'
    const result = await this.repository.list({
      ...params,
      projectId: context.projectId,
      scope,
    })

    const defaultSyncEnabled = await this.getDefaultSyncEnabled()

    return {
      items: await Promise.all(
        result.items.map(async (item) => this.toAssetResponse(item, defaultSyncEnabled))
      ),
      total: result.total,
      scope,
    }
  }

  public async getAsset(
    id: number,
    context: {
      userId?: number
      projectId?: number
      projectRole?: 'manager' | 'member' | 'viewer' | null
      scope?: AssetScope
    }
  ) {
    const asset = await this.repository.findById(id, context)
    if (!asset) {
      throw new NotFoundError('素材不存在')
    }

    return await this.toAssetResponse(asset, await this.getDefaultSyncEnabled())
  }

  public async updateAsset(input: {
    assetId: number
    userId: number
    projectId: number
    projectRole: 'manager' | 'member' | 'viewer' | null
    userRole: 'admin' | 'user'
    name?: string
    categoryId?: number | null
    syncMode?: AssetSyncMode
  }) {
    assertProjectPermission(canUploadAsset(input.projectRole), '当前项目角色不允许编辑素材')

    const asset = await this.repository.findById(input.assetId, {
      projectId: input.projectId,
      scope: 'project',
    })
    if (!asset) {
      throw new NotFoundError('素材不存在')
    }
    if (input.projectRole === 'member' && asset.createdByUserId !== input.userId) {
      throw new NotFoundError('素材不存在')
    }

    const nextName = input.name ?? asset.name
    await this.ensureAssetNameAvailable(nextName, asset.projectIds, asset.id)

    const nextCategoryId = input.categoryId === undefined ? asset.categoryId : input.categoryId
    const category = await this.validateCategory(input.projectId, nextCategoryId)
    const nextSyncMode = await this.resolveUpdateSyncMode(input.projectId, asset, category, input.syncMode)
    const shouldSync = await this.shouldSyncDraftAsset(asset.assetType, nextSyncMode, category?.syncEnabled ?? null)

    const updated = await this.repository.update(input.assetId, {
      name: nextName,
      categoryId: nextCategoryId,
      syncMode: nextSyncMode,
      arkGroupId: category?.arkGroupId ?? null,
      arkStatus: shouldSync ? (!asset.arkAssetId ? 'pending' : undefined) : 'active',
      arkError: shouldSync ? (!asset.arkAssetId ? null : undefined) : null,
    })

    if (!updated) {
      throw new NotFoundError('素材不存在')
    }

    if (await this.shouldSyncAsset(updated)) {
      await this.dispatcher.enqueueSync(updated.id)
    }

    return await this.getAsset(updated.id, { projectId: input.projectId, scope: 'project' })
  }

  public async linkAssetProjects(input: {
    assetId: number
    userId: number
    userRole: 'admin' | 'user'
    currentProjectId: number
    projectIds: number[]
  }) {
    if (input.userRole !== 'admin') {
      throw new ConflictError('仅管理员可维护素材项目关联')
    }

    const asset = await this.repository.findById(input.assetId, {
      projectId: input.currentProjectId,
      scope: 'project',
    })
    if (!asset) {
      throw new NotFoundError('素材不存在')
    }

    const targetProjectIds = [...new Set(input.projectIds.filter((projectId) => !asset.projectIds.includes(projectId)))]
    await this.validateProjects(input.userId, input.userRole, targetProjectIds)
    await this.ensureAssetNameAvailable(asset.name, targetProjectIds, input.assetId)

    await this.repository.attachProjects(
      input.assetId,
      targetProjectIds.map((projectId) => ({
        projectId,
        categoryId: null,
        relationType: 'linked',
        createdBy: input.userId,
      }))
    )

    return await this.getAsset(input.assetId, { projectId: input.currentProjectId, scope: 'project' })
  }

  public async detachProjectLink(input: {
    assetId: number
    userRole: 'admin' | 'user'
    currentProjectId: number
    projectId: number
  }) {
    if (input.userRole !== 'admin') {
      throw new ConflictError('仅管理员可解除其他项目关联')
    }

    const asset = await this.repository.findById(input.assetId, {
      projectId: input.currentProjectId,
      scope: 'project',
    })
    if (!asset) {
      throw new NotFoundError('素材不存在')
    }

    const hasProjectLink = await this.repository.hasProjectLink(input.assetId, input.projectId)
    if (!hasProjectLink) {
      throw new NotFoundError('素材未关联到目标项目')
    }

    const result = await this.repository.removeProjectLink({
      assetId: input.assetId,
      projectId: input.projectId,
      allowRemoveLastLink: true,
      preventReferencedOrphan: true,
      arkAssetId: asset.arkAssetId,
    })

    if (result.status === 'not_linked') {
      throw new NotFoundError('素材未关联到目标项目')
    }

    if (result.status === 'blocked_last_link') {
      throw new ConflictError('素材已被视频任务引用，无法解除最后一个项目关联')
    }

    return {
      assetId: input.assetId,
      operation: result.status === 'orphaned' ? 'orphaned' : 'unlinked',
      remainingProjectCount: result.remainingProjectCount,
    }
  }

  public async deleteAsset(input: {
    assetId: number
    projectId: number
    projectRole: 'manager' | 'member' | 'viewer' | null
    userRole: 'admin' | 'user'
  }) {
    assertProjectPermission(canDeleteAsset(input.projectRole), '当前项目角色不允许删除素材')

    const asset = await this.repository.findById(input.assetId, {
      projectId: input.projectId,
      scope: 'project',
    })
    if (!asset) {
      throw new NotFoundError('素材不存在')
    }

    const unlinkResult = await this.repository.removeProjectLink({
      assetId: input.assetId,
      projectId: input.projectId,
      allowRemoveLastLink: false,
      preventReferencedOrphan: false,
      arkAssetId: asset.arkAssetId,
    })

    if (unlinkResult.status === 'unlinked') {
      return {
        assetId: input.assetId,
        operation: 'unlinked',
        remainingProjectCount: unlinkResult.remainingProjectCount,
      }
    }

    if (await this.repository.isReferenced(input.assetId, asset.arkAssetId)) {
      throw new ConflictError('素材已被视频任务引用，无法物理删除')
    }

    const updated = await this.repository.update(input.assetId, { arkStatus: 'deleting' })
    if (!updated) {
      throw new NotFoundError('素材不存在')
    }

    await this.dispatcher.enqueueDelete(input.assetId)
    return {
      assetId: input.assetId,
      operation: 'physical_delete_queued',
      remainingProjectCount: 1,
      asset: updated,
    }
  }

  public async syncPendingAssets(projectId?: number) {
    const targets = await this.repository.listByStatuses(['pending', 'processing', 'deleting'])
    const filteredTargets = projectId ? targets.filter((item) => item.sourceProjectId === projectId) : targets

    const deleteTargets = filteredTargets.filter((item) => item.arkStatus === 'deleting')
    const syncCandidates = filteredTargets.filter((item) => item.arkStatus !== 'deleting')
    const effectiveTargets = await Promise.all(
      syncCandidates.map(async (item) => ((await this.shouldSyncAsset(item)) ? item : null))
    )
    const syncTargets = effectiveTargets.filter((item): item is AssetRecord => item !== null)

    await Promise.all([
      ...syncTargets.map((item) => this.dispatcher.enqueueSync(item.id)),
      ...deleteTargets.map((item) => this.dispatcher.enqueueDelete(item.id)),
    ])

    return { count: syncTargets.length + deleteTargets.length }
  }

  public async syncAssetsByIds(assetIds: number[]) {
    const assets = await Promise.all(assetIds.map((id) => this.repository.findById(id)))
    const valid = assets.filter((item): item is AssetRecord => item !== null)

    for (const asset of valid) {
      await this.repository.update(asset.id, {
        arkAssetId: null,
        arkGroupId: null,
        arkStatus: 'pending',
        arkError: null,
      })
      await this.dispatcher.enqueueSync(asset.id)
    }

    return { count: valid.length }
  }

  private async validateProjects(userId: number, role: 'admin' | 'user', projectIds: number[]): Promise<void> {
    await Promise.all(
      projectIds.map(async (projectId) => {
        const access = await this.projectAccessService.getAccessibleProject(userId, role, projectId)
        if (!access) {
          throw new NotFoundError(`项目 ${projectId} 不存在或不可访问`)
        }
      })
    )
  }

  private async ensureAssetNameAvailable(name: string, projectIds: number[], excludeAssetId?: number): Promise<void> {
    if (await this.repository.existsNameInProjects(name, projectIds, excludeAssetId)) {
      throw new ValidationAppError('素材名称已存在')
    }
  }

  private async validateCategory(
    projectId: number,
    categoryId: number | null
  ): Promise<{ id: number; syncEnabled: boolean; arkGroupId: string | null } | null> {
    if (categoryId === null) {
      return null
    }

    const category = await this.repository.getCategory(projectId, categoryId)
    if (!category) {
      throw new ValidationAppError('素材组不存在或不属于当前项目')
    }

    return category
  }

  private async getDefaultSyncEnabled(): Promise<boolean> {
    try {
      const configured = await this.configService.getOptional('ark_default_sync_enabled')
      return configured === null ? true : configured === 'true'
    } catch {
      return true
    }
  }

  private async resolveCreateSyncMode(
    projectId: number,
    category: { id: number; syncEnabled: boolean; arkGroupId: string | null } | null,
    requestedSyncMode?: AssetSyncMode
  ): Promise<AssetSyncMode> {
    const normalized = requestedSyncMode ?? 'inherit'
    if (category && !category.syncEnabled && normalized === 'enabled') {
      throw new ValidationAppError('当前素材组未开启火山同步，素材不能单独改为同步')
    }

    if (normalized === 'inherit') {
      return category ? 'inherit' : (await this.getDefaultSyncEnabled()) ? 'inherit' : 'disabled'
    }

    return normalized
  }

  private async resolveUpdateSyncMode(
    projectId: number,
    asset: AssetRecord,
    category: { id: number; syncEnabled: boolean; arkGroupId: string | null } | null,
    requestedSyncMode?: AssetSyncMode
  ): Promise<AssetSyncMode> {
    const nextSyncMode = requestedSyncMode ?? asset.syncMode
    if (category && !category.syncEnabled && nextSyncMode === 'enabled') {
      throw new ValidationAppError('当前素材组未开启火山同步，素材不能单独改为同步')
    }

    return nextSyncMode
  }

  private async computeEffectiveSync(syncMode: AssetSyncMode, groupSyncEnabled: boolean | null): Promise<boolean> {
    if (groupSyncEnabled === false) {
      return false
    }
    if (syncMode === 'enabled') {
      return true
    }
    if (syncMode === 'disabled') {
      return false
    }

    return groupSyncEnabled ?? (await this.getDefaultSyncEnabled())
  }

  private async shouldSyncAsset(asset: AssetRecord): Promise<boolean> {
    return await this.shouldSyncDraftAsset(asset.assetType, asset.syncMode, asset.groupSyncEnabled)
  }

  private async shouldSyncDraftAsset(
    assetType: AssetType,
    syncMode: AssetSyncMode,
    groupSyncEnabled: boolean | null
  ): Promise<boolean> {
    return await this.computeEffectiveSync(syncMode, groupSyncEnabled)
  }

  private resolveSyncProvider(arkAssetId: string | null): string | null {
    if (!arkAssetId) {
      return null
    }
    if (arkAssetId.startsWith('pa_') || arkAssetId.startsWith('pg_')) {
      return 'toapis'
    }
    if (/^group-|^(asset|cgt)-/i.test(arkAssetId)) {
      return 'volcano_ark'
    }
    return null
  }

  private async toAssetResponse(asset: AssetRecord, defaultSyncEnabled: boolean) {
    const effectiveSync =
      asset.groupSyncEnabled === false
        ? false
        : asset.syncMode === 'enabled'
          ? true
          : asset.syncMode === 'disabled'
            ? false
            : asset.groupSyncEnabled ?? defaultSyncEnabled

    return {
      ...asset,
      effectiveSync,
      syncProvider: this.resolveSyncProvider(asset.arkAssetId),
      sourceUrl: await this.ossService.getSignedUrl(asset.ossKey),
      thumbnailUrl: await this.ossService.getSignedUrl(asset.ossKey),
    }
  }
}
