import { randomUUID } from 'node:crypto'

import { sql } from 'kysely'

import { db } from '../db/kysely'
import { ConfigService } from './config.service'
import type { OssServiceContract } from './oss.service'
import {
  buildVideoExportCsv,
  createVideoExportFileNames,
  type VideoExportData,
} from './video-export.service'
import { VideoGenerationLogger } from './video-generation-log.service'
import { VideoProviderService, type VideoProviderSnapshot } from './video-provider.service'
import { ForbiddenError, NotFoundError } from '../utils/errors'
import { assertProjectPermission, canCreateVideoTask } from '../utils/project-permissions'

export type VideoStatus = 'pending' | 'processing' | 'succeeded' | 'failed'
export type VideoGenerateMode = 'frames' | 'omni'

export interface VideoContentText {
  type: 'text'
  text: string
}

export interface VideoContentImage {
  type: 'image_url'
  image_url: { url: string }
  assetId?: number
  role?: 'first_frame' | 'last_frame' | 'reference_image'
}

export interface VideoContentVideo {
  type: 'video_url'
  video_url: { url: string }
  assetId?: number
  role: 'reference_video'
}

export interface VideoContentAudio {
  type: 'audio_url'
  audio_url: { url: string }
  assetId?: number
  role: 'reference_audio'
}

export type VideoContentItem = VideoContentText | VideoContentImage | VideoContentVideo | VideoContentAudio

export interface VideoRequestSnapshot extends Record<string, unknown> {
  operation?: 'generate' | 'edit' | 'extend'
  output_format?: 'mp4' | 'mov'
  mode?: VideoGenerateMode
  model: string
  content: VideoContentItem[]
  duration?: number | null
  ratio?: string | null
  resolution?: string | null
  generate_audio?: boolean
}

export interface VideoTaskAssetReference {
  assetId: number
  role: 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio'
}

export interface VideoReplayDraft {
  mode: VideoGenerateMode
  model: string
  duration: number | null
  ratio: string | null
  resolution: string | null
  generateAudio: boolean
  promptRaw: string
  assets: VideoTaskAssetReference[]
}

export interface VideoRecord {
  id: number
  userId: number
  projectId: number
  arkTaskId: string | null
  idempotencyKey: string
  status: VideoStatus
  model: string
  prompt: string
  promptRaw: string
  duration: number | null
  ratio: string | null
  resolution: string | null
  generateAudio: boolean
  providerKey: string | null
  providerSnapshot: VideoProviderSnapshot | null
  requestSnapshot: VideoRequestSnapshot
  arkVideoUrl: string | null
  videoOssKey: string | null
  completionTokens: number | null
  totalTokens: number | null
  errorMessage: string | null
  nextPollAt: Date | null
  lastArkStatus: string | null
  lastArkStatusChangedAt: Date | null
  lastPolledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface VideoDurationEstimate {
  sampleSize: number
  avgSeconds: number
}

export interface VideoQueryParams {
  userId: number
  projectId: number
  mine?: boolean
  status?: VideoStatus
  mode?: VideoGenerateMode
  q?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export interface VideoAnalyticsQueryParams {
  userId: number
  projectId: number
  mine?: boolean
  dateFrom?: string
  dateTo?: string
  model?: string
  status?: VideoStatus
}

export interface VideoAnalyticsOverview {
  totalRequests: number
  successRate: number
  avgDurationSeconds: number
  totalTokensConsumed: number
  totalTokensSucceeded: number
  avgTokensPerTask: number
}

export interface VideoStatusDistributionItem {
  status: VideoStatus
  count: number
}

export interface VideoModelDistributionItem {
  model: string
  count: number
}

export interface VideoUserTokenDistributionItem {
  userId: number
  userName: string
  requestCount: number
  totalTokens: number
  shareRatio: number
}

export interface VideoAnalyticsResult {
  overview: VideoAnalyticsOverview
  statusDistribution: VideoStatusDistributionItem[]
  modelDistribution: VideoModelDistributionItem[]
  userTokenDistribution: VideoUserTokenDistributionItem[]
}

export interface VideoExportQueryParams extends Omit<VideoAnalyticsQueryParams, 'projectId'> {
  projectId?: number
}

export interface VideoRepository {
  create(input: Omit<VideoRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<VideoRecord>
  list(params: VideoQueryParams): Promise<{ items: VideoRecord[]; total: number }>
  getAnalytics(params: VideoAnalyticsQueryParams): Promise<VideoAnalyticsResult>
  getExportData(params: VideoExportQueryParams): Promise<VideoExportData>
  findById(id: number, options?: { projectId?: number }): Promise<VideoRecord | null>
  update(id: number, patch: Partial<VideoRecord>): Promise<VideoRecord | null>
  saveAssetReferences(taskId: number, references: VideoTaskAssetReference[]): Promise<void>
  listSyncableArkTasks(input: { now: Date; limit: number }): Promise<VideoRecord[]>
  listStaleProcessingTasks(input: { updatedBefore: Date; limit: number }): Promise<VideoRecord[]>
  getDurationEstimate(input: {
    model: string
    duration: number | null
    ratio: string | null
    resolution: string | null
  }): Promise<VideoDurationEstimate | null>
}

export interface VideoDispatcher {
  enqueueCreate(taskId: number): Promise<void>
  enqueueSync(taskId: number, options?: { delayMs?: number }): Promise<void>
}

export interface VideoAssetReferenceResolver {
  resolve(projectId: number, content: VideoContentItem[]): Promise<VideoTaskAssetReference[]>
}

type VideoRow = {
  id: number
  user_id: number
  project_id: number
  ark_task_id: string | null
  idempotency_key: string
  status: VideoStatus
  model: string
  prompt: string | null
  prompt_raw: string | null
  duration: number | null
  ratio: string | null
  resolution: string | null
  generate_audio: boolean
  provider_key: string | null
  provider_snapshot: Record<string, unknown>
  request_snapshot: Record<string, unknown>
  ark_video_url: string | null
  video_oss_key: string | null
  completion_tokens: number | null
  total_tokens: number | null
  error_message: string | null
  next_poll_at: Date | string | null
  last_ark_status: string | null
  last_ark_status_changed_at: Date | string | null
  last_polled_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

const normalizeDbNumber = (value: number | string | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0
  }

  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : 0
}

export class KyselyVideoRepository implements VideoRepository {
  public async create(input: Omit<VideoRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<VideoRecord> {
    const row = await db
      .insertInto('video_tasks')
      .values({
        user_id: input.userId,
        project_id: input.projectId,
        ark_task_id: input.arkTaskId,
        idempotency_key: input.idempotencyKey,
        status: input.status,
        model: input.model,
        prompt: input.prompt,
        prompt_raw: input.promptRaw,
        duration: input.duration,
        ratio: input.ratio,
        resolution: input.resolution,
        generate_audio: input.generateAudio,
        provider_key: input.providerKey,
        provider_snapshot: (input.providerSnapshot ?? {}) as unknown as Record<string, unknown>,
        request_snapshot: input.requestSnapshot,
        ark_video_url: input.arkVideoUrl,
        video_oss_key: input.videoOssKey,
        completion_tokens: input.completionTokens,
        total_tokens: input.totalTokens,
        error_message: input.errorMessage,
        next_poll_at: input.nextPollAt,
        last_ark_status: input.lastArkStatus,
        last_ark_status_changed_at: input.lastArkStatusChangedAt,
        last_polled_at: input.lastPolledAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return this.mapRow(row)
  }

  public async list(params: VideoQueryParams): Promise<{ items: VideoRecord[]; total: number }> {
    let query = db.selectFrom('video_tasks').where('project_id', '=', params.projectId)
    let countQuery = db.selectFrom('video_tasks').where('project_id', '=', params.projectId)

    if (params.mine) {
      query = query.where('user_id', '=', params.userId)
      countQuery = countQuery.where('user_id', '=', params.userId)
    }

    if (params.status) {
      query = query.where('status', '=', params.status)
      countQuery = countQuery.where('status', '=', params.status)
    }

    if (params.mode) {
      query = query.where(sql<boolean>`request_snapshot ->> 'mode' = ${params.mode}`)
      countQuery = countQuery.where(sql<boolean>`request_snapshot ->> 'mode' = ${params.mode}`)
    }

    if (params.q) {
      const keyword = `%${params.q.trim()}%`
      query = query.where(
        sql<boolean>`(coalesce(prompt_raw, '') ilike ${keyword} or coalesce(prompt, '') ilike ${keyword})`
      )
      countQuery = countQuery.where(
        sql<boolean>`(coalesce(prompt_raw, '') ilike ${keyword} or coalesce(prompt, '') ilike ${keyword})`
      )
    }

    if (params.dateFrom) {
      const dateFrom = new Date(params.dateFrom)
      query = query.where('created_at', '>=', dateFrom)
      countQuery = countQuery.where('created_at', '>=', dateFrom)
    }

    if (params.dateTo) {
      const dateTo = new Date(params.dateTo)
      query = query.where('created_at', '<=', dateTo)
      countQuery = countQuery.where('created_at', '<=', dateTo)
    }

    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 20

    const [items, totalRow] = await Promise.all([
      query
        .selectAll()
        .orderBy('id', 'desc')
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute(),
      countQuery.select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirstOrThrow(),
    ])

    return {
      items: items.map((item) => this.mapRow(item)),
      total: Number(totalRow.count),
    }
  }

  public async findById(id: number, options?: { projectId?: number }): Promise<VideoRecord | null> {
    let query = db.selectFrom('video_tasks').selectAll().where('id', '=', id)

    if (options?.projectId) {
      query = query.where('project_id', '=', options.projectId)
    }

    const row = await query.executeTakeFirst()
    return row ? this.mapRow(row) : null
  }

  public async getAnalytics(params: VideoAnalyticsQueryParams): Promise<VideoAnalyticsResult> {
    const conditions = [sql`vt.project_id = ${params.projectId}`]

    if (params.mine) {
      conditions.push(sql`vt.user_id = ${params.userId}`)
    }

    if (params.status) {
      conditions.push(sql`vt.status = ${params.status}`)
    }

    if (params.model) {
      conditions.push(sql`vt.model = ${params.model}`)
    }

    if (params.dateFrom) {
      conditions.push(sql`vt.created_at >= ${new Date(params.dateFrom)}`)
    }

    if (params.dateTo) {
      conditions.push(sql`vt.created_at <= ${new Date(params.dateTo)}`)
    }

    const whereClause = sql`where ${sql.join(conditions, sql` and `)}`

    const [overviewResult, statusResult, modelResult, userResult] = await Promise.all([
      sql<{
        total_requests: number | string
        succeeded_count: number | string
        avg_duration_seconds: number | string | null
        total_tokens_consumed: number | string | null
        total_tokens_succeeded: number | string | null
      }>`
        select
          count(*)::int as total_requests,
          count(*) filter (where vt.status = 'succeeded')::int as succeeded_count,
          coalesce(avg(vt.duration)::float8, 0)::float8 as avg_duration_seconds,
          coalesce(sum(vt.total_tokens)::float8, 0)::float8 as total_tokens_consumed,
          coalesce(sum(case when vt.status = 'succeeded' then coalesce(vt.total_tokens, 0) else 0 end)::float8, 0)::float8 as total_tokens_succeeded
        from video_tasks vt
        ${whereClause}
      `.execute(db),
      sql<{
        status: VideoStatus
        count: number | string
      }>`
        select
          vt.status as status,
          count(*)::int as count
        from video_tasks vt
        ${whereClause}
        group by vt.status
        order by
          case vt.status
            when 'pending' then 1
            when 'processing' then 2
            when 'succeeded' then 3
            when 'failed' then 4
            else 99
          end asc
      `.execute(db),
      sql<{
        model: string
        count: number | string
      }>`
        select
          vt.model as model,
          count(*)::int as count
        from video_tasks vt
        ${whereClause}
        group by vt.model
        order by count(*) desc, vt.model asc
      `.execute(db),
      sql<{
        user_id: number | string
        user_name: string
        request_count: number | string
        total_tokens: number | string | null
      }>`
        select
          vt.user_id as user_id,
          u.username as user_name,
          count(*)::int as request_count,
          coalesce(sum(vt.total_tokens)::float8, 0)::float8 as total_tokens
        from video_tasks vt
        inner join users u on u.id = vt.user_id
        ${whereClause}
        group by vt.user_id, u.username
        order by total_tokens desc, request_count desc, vt.user_id asc
      `.execute(db),
    ])

    const overviewRow = overviewResult.rows[0]
    const totalRequests = normalizeDbNumber(overviewRow?.total_requests)
    const succeededCount = normalizeDbNumber(overviewRow?.succeeded_count)
    const totalTokensConsumed = normalizeDbNumber(overviewRow?.total_tokens_consumed)
    const overview: VideoAnalyticsOverview = {
      totalRequests,
      successRate: totalRequests > 0 ? succeededCount / totalRequests : 0,
      avgDurationSeconds: normalizeDbNumber(overviewRow?.avg_duration_seconds),
      totalTokensConsumed,
      totalTokensSucceeded: normalizeDbNumber(overviewRow?.total_tokens_succeeded),
      avgTokensPerTask: totalRequests > 0 ? totalTokensConsumed / totalRequests : 0,
    }

    return {
      overview,
      statusDistribution: statusResult.rows.map((row) => ({
        status: row.status,
        count: normalizeDbNumber(row.count),
      })),
      modelDistribution: modelResult.rows.map((row) => ({
        model: row.model,
        count: normalizeDbNumber(row.count),
      })),
      userTokenDistribution: userResult.rows.map((row) => {
        const totalTokens = normalizeDbNumber(row.total_tokens)

        return {
          userId: normalizeDbNumber(row.user_id),
          userName: row.user_name,
          requestCount: normalizeDbNumber(row.request_count),
          totalTokens,
          shareRatio: totalTokensConsumed > 0 ? totalTokens / totalTokensConsumed : 0,
        }
      }),
    }
  }

  public async getExportData(params: VideoExportQueryParams): Promise<VideoExportData> {
    const conditions = [sql`1 = 1`]

    if (params.projectId !== undefined) {
      conditions.push(sql`vt.project_id = ${params.projectId}`)
    }
    if (params.mine) {
      conditions.push(sql`vt.user_id = ${params.userId}`)
    }
    if (params.status) {
      conditions.push(sql`vt.status = ${params.status}`)
    }
    if (params.model) {
      conditions.push(sql`vt.model = ${params.model}`)
    }
    if (params.dateFrom) {
      conditions.push(sql`vt.created_at >= ${new Date(params.dateFrom)}`)
    }
    if (params.dateTo) {
      conditions.push(sql`vt.created_at <= ${new Date(params.dateTo)}`)
    }

    const whereClause = sql`where ${sql.join(conditions, sql` and `)}`
    const [modelResult, projectResult, memberResult] = await Promise.all([
      sql<{
        project_name: string
        model: string
        total_requests: number | string
        avg_duration_seconds: number | string | null
        total_tokens_consumed: number | string | null
        total_tokens_succeeded: number | string | null
      }>`
        select
          p.name as project_name,
          vt.model as model,
          count(*)::int as total_requests,
          coalesce(avg(vt.duration)::float8, 0)::float8 as avg_duration_seconds,
          coalesce(sum(vt.total_tokens)::float8, 0)::float8 as total_tokens_consumed,
          coalesce(
            sum(case when vt.status = 'succeeded' then coalesce(vt.total_tokens, 0) else 0 end)::float8,
            0
          )::float8 as total_tokens_succeeded
        from video_tasks vt
        inner join projects p on p.id = vt.project_id
        ${whereClause}
        group by vt.project_id, p.name, vt.model
        order by p.name asc, vt.model asc
      `.execute(db),
      sql<{
        project_name: string
        valid_request_count: number | string
        avg_duration_seconds: number | string | null
      }>`
        select
          p.name as project_name,
          count(*) filter (where vt.status = 'succeeded')::int as valid_request_count,
          coalesce(
            avg(vt.duration) filter (where vt.status = 'succeeded')::float8,
            0
          )::float8 as avg_duration_seconds
        from video_tasks vt
        inner join projects p on p.id = vt.project_id
        ${whereClause}
        group by vt.project_id, p.name
        order by p.name asc
      `.execute(db),
      sql<{
        project_name: string
        user_name: string
        request_count: number | string
        total_tokens_consumed: number | string | null
      }>`
        select
          p.name as project_name,
          u.username as user_name,
          count(*)::int as request_count,
          coalesce(sum(vt.total_tokens)::float8, 0)::float8 as total_tokens_consumed
        from video_tasks vt
        inner join projects p on p.id = vt.project_id
        inner join users u on u.id = vt.user_id
        ${whereClause}
        group by vt.project_id, p.name, vt.user_id, u.username
        order by p.name asc, u.username asc
      `.execute(db),
    ])

    return {
      models: modelResult.rows.map((row) => ({
        projectName: row.project_name,
        model: row.model,
        totalRequests: normalizeDbNumber(row.total_requests),
        avgDurationSeconds: normalizeDbNumber(row.avg_duration_seconds),
        totalTokensConsumed: normalizeDbNumber(row.total_tokens_consumed),
        totalTokensSucceeded: normalizeDbNumber(row.total_tokens_succeeded),
      })),
      projects: projectResult.rows.map((row) => ({
        projectName: row.project_name,
        validRequestCount: normalizeDbNumber(row.valid_request_count),
        avgDurationSeconds: normalizeDbNumber(row.avg_duration_seconds),
      })),
      members: memberResult.rows.map((row) => ({
        projectName: row.project_name,
        userName: row.user_name,
        requestCount: normalizeDbNumber(row.request_count),
        totalTokensConsumed: normalizeDbNumber(row.total_tokens_consumed),
      })),
    }
  }

  public async update(id: number, patch: Partial<VideoRecord>): Promise<VideoRecord | null> {
    const row = await db
      .updateTable('video_tasks')
      .set({
        project_id: patch.projectId,
        ark_task_id: patch.arkTaskId,
        status: patch.status,
        model: patch.model,
        prompt: patch.prompt,
        prompt_raw: patch.promptRaw,
        duration: patch.duration,
        ratio: patch.ratio,
        resolution: patch.resolution,
        generate_audio: patch.generateAudio,
        provider_key: patch.providerKey,
        provider_snapshot: patch.providerSnapshot as unknown as Record<string, unknown> | undefined,
        request_snapshot: patch.requestSnapshot,
        ark_video_url: patch.arkVideoUrl,
        video_oss_key: patch.videoOssKey,
        completion_tokens: patch.completionTokens,
        total_tokens: patch.totalTokens,
        error_message: patch.errorMessage,
        next_poll_at: patch.nextPollAt,
        last_ark_status: patch.lastArkStatus,
        last_ark_status_changed_at: patch.lastArkStatusChangedAt,
        last_polled_at: patch.lastPolledAt,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    return row ? this.mapRow(row) : null
  }

  public async saveAssetReferences(taskId: number, references: VideoTaskAssetReference[]): Promise<void> {
    if (references.length === 0) {
      return
    }

    await db
      .insertInto('video_task_assets')
      .values(
        references.map((reference) => ({
          video_task_id: taskId,
          asset_id: reference.assetId,
          role: reference.role,
        }))
      )
      .execute()
  }

  public async listSyncableArkTasks(input: { now: Date; limit: number }): Promise<VideoRecord[]> {
    const rows = await db
      .selectFrom('video_tasks')
      .selectAll()
      .where('status', 'in', ['pending', 'processing'])
      .where('ark_task_id', 'is not', null)
      .where('video_oss_key', 'is', null)
      .where('next_poll_at', 'is not', null)
      .where('next_poll_at', '<=', input.now)
      .orderBy('next_poll_at', 'asc')
      .orderBy('updated_at', 'asc')
      .limit(input.limit)
      .execute()

    return rows.map((row) => this.mapRow(row))
  }

  public async listStaleProcessingTasks(input: { updatedBefore: Date; limit: number }): Promise<VideoRecord[]> {
    const rows = await db
      .selectFrom('video_tasks')
      .selectAll()
      .where('status', 'in', ['pending', 'processing'])
      .where('updated_at', '<=', input.updatedBefore)
      .orderBy('updated_at', 'asc')
      .limit(input.limit)
      .execute()

    return rows.map((row) => this.mapRow(row))
  }

  public async getDurationEstimate(input: {
    model: string
    duration: number | null
    ratio: string | null
    resolution: string | null
  }): Promise<VideoDurationEstimate | null> {
    const result = await sql<{
      sample_size: number | string
      avg_seconds: number | string | null
    }>`
      select
        count(*)::int as sample_size,
        avg(extract(epoch from updated_at - created_at))::float8 as avg_seconds
      from video_tasks
      where status = 'succeeded'
        and model = ${input.model}
        and duration is not distinct from ${input.duration}
        and ratio is not distinct from ${input.ratio}
        and resolution is not distinct from ${input.resolution}
    `.execute(db)

    const row = result.rows[0]
    if (!row) {
      return null
    }

    const sampleSize = Number(row.sample_size)
    const avgSeconds = row.avg_seconds === null ? null : Number(row.avg_seconds)
    if (!Number.isFinite(sampleSize) || sampleSize <= 0 || avgSeconds === null || !Number.isFinite(avgSeconds)) {
      return null
    }

    return {
      sampleSize,
      avgSeconds,
    }
  }

  private mapRow(row: VideoRow): VideoRecord {
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      projectId: Number(row.project_id),
      arkTaskId: row.ark_task_id,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      model: row.model,
      prompt: row.prompt ?? '',
      promptRaw: row.prompt_raw ?? '',
      duration: row.duration === null ? null : Number(row.duration),
      ratio: row.ratio,
      resolution: row.resolution,
      generateAudio: row.generate_audio,
      providerKey: row.provider_key,
      providerSnapshot: row.provider_key ? row.provider_snapshot as unknown as VideoProviderSnapshot : null,
      requestSnapshot: row.request_snapshot as VideoRequestSnapshot,
      arkVideoUrl: row.ark_video_url,
      videoOssKey: row.video_oss_key,
      completionTokens: row.completion_tokens === null ? null : Number(row.completion_tokens),
      totalTokens: row.total_tokens === null ? null : Number(row.total_tokens),
      errorMessage: row.error_message,
      nextPollAt: row.next_poll_at === null ? null : new Date(row.next_poll_at),
      lastArkStatus: row.last_ark_status,
      lastArkStatusChangedAt: row.last_ark_status_changed_at === null ? null : new Date(row.last_ark_status_changed_at),
      lastPolledAt: row.last_polled_at === null ? null : new Date(row.last_polled_at),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }
}

class KyselyVideoAssetReferenceResolver implements VideoAssetReferenceResolver {
  public async resolve(projectId: number, content: VideoContentItem[]): Promise<VideoTaskAssetReference[]> {
    const references = content
      .map((item) => this.parseReference(item))
      .filter((item): item is { assetId?: number; arkAssetId?: string; role: VideoTaskAssetReference['role'] } => item !== null)

    if (references.length === 0) {
      return []
    }

    const explicitAssetIds = [...new Set(references.map((reference) => reference.assetId).filter((value): value is number => Number.isInteger(value)))]
    const arkAssetIds = [...new Set(references.map((reference) => reference.arkAssetId).filter((value): value is string => Boolean(value)))]

    let query = db
      .selectFrom('assets')
      .innerJoin('project_assets', 'project_assets.asset_id', 'assets.id')
      .select(['assets.id as assetId', 'assets.ark_asset_id as arkAssetId'])
      .where('project_assets.project_id', '=', projectId)

    if (explicitAssetIds.length > 0 || arkAssetIds.length > 0) {
      query = query.where((eb) => {
        const conditions = []
        if (explicitAssetIds.length > 0) {
          conditions.push(eb('assets.id', 'in', explicitAssetIds))
        }
        if (arkAssetIds.length > 0) {
          conditions.push(eb('assets.ark_asset_id', 'in', arkAssetIds))
        }
        return eb.or(conditions)
      })
    }

    const rows = await query.execute()
    const assetIdByArkId = new Map(rows.map((row) => [row.arkAssetId, Number(row.assetId)]))
    const allowedAssetIds = new Set(rows.map((row) => Number(row.assetId)))

    return references.map((reference) => {
      const assetId = reference.assetId ?? (reference.arkAssetId ? assetIdByArkId.get(reference.arkAssetId) : undefined)
      if (!assetId || !allowedAssetIds.has(assetId)) {
        throw new NotFoundError('引用素材不存在或不属于当前项目')
      }

      return { assetId, role: reference.role }
    })
  }

  private parseReference(
    item: VideoContentItem
  ): { assetId?: number; arkAssetId?: string; role: VideoTaskAssetReference['role'] } | null {
    if (item.type === 'text') {
      return null
    }

    const url =
      item.type === 'image_url'
        ? item.image_url.url
        : item.type === 'video_url'
          ? item.video_url.url
          : item.audio_url.url

    if (!url.startsWith('asset://')) {
      return null
    }

    const arkAssetId = url.slice('asset://'.length)
    if (!arkAssetId) {
      return {
        assetId: item.assetId,
        role:
          item.type === 'image_url'
            ? item.role ?? 'reference_image'
            : item.role,
      }
    }

    if (item.type === 'image_url') {
      return {
        assetId: item.assetId,
        arkAssetId,
        role: item.role ?? 'reference_image',
      }
    }

    return {
      assetId: item.assetId,
      arkAssetId,
      role: item.role,
    }
  }
}

export class NoopVideoDispatcher implements VideoDispatcher {
  public async enqueueCreate(): Promise<void> {}
  public async enqueueSync(): Promise<void> {}
}

export class VideoService {
  public constructor(
    private readonly repository: VideoRepository = new KyselyVideoRepository(),
    private readonly dispatcher: VideoDispatcher = new NoopVideoDispatcher(),
    private readonly ossService: OssServiceContract,
    private readonly configService: ConfigService = new ConfigService(),
    private readonly assetReferenceResolver: VideoAssetReferenceResolver = new KyselyVideoAssetReferenceResolver(),
    private readonly generationLogger: VideoGenerationLogger = new VideoGenerationLogger(),
    private readonly providerService: VideoProviderService = new VideoProviderService()
  ) {}

  public async createVideoTask(input: {
    userId: number
    userRole: 'admin' | 'user'
    projectId: number
    projectRole: 'manager' | 'member' | 'viewer' | null
    providerKey?: string
    model: string
    operation: 'generate' | 'edit' | 'extend'
    outputFormat: 'mp4' | 'mov'
    mode: VideoGenerateMode
    prompt: string
    promptRaw: string
    duration: number
    ratio: string
    resolution: string
    generateAudio: boolean
    content: VideoContentItem[]
  }) {
    assertProjectPermission(canCreateVideoTask(input.projectRole), '当前项目角色不允许创建视频任务')

    const provider = input.providerKey ? await this.providerService.getActiveForTask(input.providerKey) : null
    if (provider) {
      this.providerService.validateRequest(provider.record, input)
    }

    const assetReferences = await this.assetReferenceResolver.resolve(input.projectId, input.content)

    const requestSnapshot: VideoRequestSnapshot = {
      model: input.model,
      operation: input.operation,
      output_format: input.outputFormat,
      mode: input.mode,
      content: input.content,
      duration: input.duration,
      ratio: input.ratio,
      resolution: input.resolution,
      generate_audio: input.generateAudio,
    }

    const record = await this.repository.create({
      userId: input.userId,
      projectId: input.projectId,
      arkTaskId: null,
      idempotencyKey: randomUUID(),
      status: 'pending',
      model: input.model,
      prompt: input.prompt,
      promptRaw: input.promptRaw,
      duration: input.duration,
      ratio: input.ratio,
      resolution: input.resolution,
      generateAudio: input.generateAudio,
      providerKey: provider?.record.providerKey ?? null,
      providerSnapshot: provider?.snapshot ?? null,
      requestSnapshot,
      arkVideoUrl: null,
      videoOssKey: null,
      completionTokens: null,
      totalTokens: null,
      errorMessage: null,
      nextPollAt: null,
      lastArkStatus: null,
      lastArkStatusChangedAt: null,
      lastPolledAt: null,
    })

    const logContext = {
      videoTaskId: record.id,
      projectId: record.projectId,
      userId: record.userId,
      traceId: record.idempotencyKey,
    }

    await this.generationLogger.write({
      ...logContext,
      stage: 'request',
      action: 'video_task.created',
      status: 'succeeded',
      message: '视频生成请求已落库',
      requestPayload: {
        mode: input.mode,
        model: input.model,
        providerKey: input.providerKey ?? null,
        operation: input.operation,
        outputFormat: input.outputFormat,
        prompt: input.prompt,
        promptRaw: input.promptRaw,
        duration: input.duration,
        ratio: input.ratio,
        resolution: input.resolution,
        generateAudio: input.generateAudio,
        content: input.content,
      },
      responsePayload: {
        taskId: record.id,
        status: record.status,
        idempotencyKey: record.idempotencyKey,
      },
    })

    await this.generationLogger.step(
      {
        ...logContext,
        stage: 'asset_resolution',
        action: 'asset_references.saved',
        message: '任务素材引用校验并关联',
        requestPayload: { content: input.content },
        responsePayload: () => ({ references: assetReferences }),
      },
      async () => this.repository.saveAssetReferences(record.id, assetReferences)
    )

    await this.generationLogger.step(
      {
        ...logContext,
        stage: 'queue',
        action: 'video_create.enqueued',
        message: '视频创建任务加入队列',
        requestPayload: { taskId: record.id },
        responsePayload: () => ({ queue: 'create-and-sync-video', taskId: record.id }),
      },
      async () => this.dispatcher.enqueueCreate(record.id)
    )
    return this.toResponse(record, null, new Map())
  }

  public async getActiveProvider() {
    return this.providerService.getActiveForPublic()
  }

  public async listVideoTasks(
    context: {
      userId: number
      projectId: number
      projectRole: 'manager' | 'member' | 'viewer' | null
    },
    params: Omit<VideoQueryParams, 'userId' | 'projectId'>
  ) {
    const ttlSeconds = Number(await this.configService.getRequired('oss_signed_url_ttl'))
    const result = await this.repository.list({
      ...params,
      mine: context.projectRole === 'member' ? true : params.mine,
      userId: context.userId,
      projectId: context.projectId,
    })

    const estimateCache = new Map<string, Promise<VideoDurationEstimate | null>>()

    return {
      items: await Promise.all(result.items.map((item) => this.toResponse(item, ttlSeconds, estimateCache))),
      total: result.total,
    }
  }

  public async getVideoTask(
    id: number,
    context: { userId: number; projectId: number; projectRole: 'manager' | 'member' | 'viewer' | null }
  ) {
    const record = await this.repository.findById(id, { projectId: context.projectId })
    if (!record) {
      throw new NotFoundError('视频任务不存在')
    }
    if (context.projectRole === 'member' && record.userId !== context.userId) {
      throw new NotFoundError('视频任务不存在')
    }

    const ttlSeconds = Number(await this.configService.getRequired('oss_signed_url_ttl'))
    return this.toResponse(record, ttlSeconds, new Map())
  }

  public async getVideoAnalytics(
    context: {
      userId: number
      userRole: 'admin' | 'user'
      projectId: number
      projectRole: 'manager' | 'member' | 'viewer' | null
    },
    params: Omit<VideoAnalyticsQueryParams, 'userId' | 'projectId'>
  ) {
    return this.repository.getAnalytics({
      ...params,
      mine: context.projectRole === 'member' ? true : params.mine,
      userId: context.userId,
      projectId: context.projectId,
    })
  }

  public async exportVideoAnalytics(
    context: {
      userId: number
      userRole: 'admin' | 'user'
      projectId: number
      projectRole: 'manager' | 'member' | 'viewer' | null
    },
    params: Omit<VideoAnalyticsQueryParams, 'userId' | 'projectId'> & {
      scope?: 'current' | 'all'
    }
  ) {
    const { scope = 'current', ...filters } = params
    if (scope === 'all' && context.userRole !== 'admin') {
      throw new ForbiddenError('只有系统管理员可以导出全部项目数据')
    }

    const data = await this.repository.getExportData({
      ...filters,
      mine: context.projectRole === 'member' ? true : filters.mine,
      userId: context.userId,
      projectId: scope === 'all' ? undefined : context.projectId,
    })
    const fileNames = createVideoExportFileNames(new Date(), filters.status)

    return {
      csv: buildVideoExportCsv(data),
      fileName: fileNames.ascii,
      utf8FileName: fileNames.utf8,
    }
  }

  public async syncVideoTaskStatus(
    id: number,
    context: { userId: number; projectId: number; projectRole: 'manager' | 'member' | 'viewer' | null }
  ) {
    assertProjectPermission(canCreateVideoTask(context.projectRole), '当前项目角色不允许重新拉取视频任务状态')

    const record = await this.repository.findById(id, { projectId: context.projectId })
    if (!record) {
      throw new NotFoundError('视频任务不存在')
    }
    if (context.projectRole === 'member' && record.userId !== context.userId) {
      throw new NotFoundError('视频任务不存在')
    }
    if (!record.arkTaskId) {
      throw new NotFoundError('视频任务尚未创建火山任务')
    }
    if (record.videoOssKey) {
      const completedRecord = await this.generationLogger.step(
        {
          ...this.toLogContext(record),
          stage: 'state_update',
          action: 'video_task.already_completed',
          message: '任务已有 OSS 成品，无需重新拉取',
          requestPayload: { taskId: id },
          responsePayload: (updated) => ({
            status: updated?.status ?? record.status,
            videoOssKey: record.videoOssKey,
          }),
          resultStatus: () => 'succeeded',
        },
        async () => this.repository.update(id, {
          status: 'succeeded',
          errorMessage: null,
          nextPollAt: null,
        })
      )
      return this.toResponse(completedRecord ?? record, null, new Map())
    }

    const nextRecord = await this.generationLogger.step(
      {
        ...this.toLogContext(record),
        stage: 'queue',
        action: 'video_poll.manual_scheduled',
        message: '手动状态拉取加入轮询计划',
        requestPayload: { taskId: id, arkTaskId: record.arkTaskId },
        responsePayload: (updated) => ({
          status: updated?.status ?? record.status,
          nextPollAt: updated?.nextPollAt ?? null,
        }),
      },
      async () => this.repository.update(id, {
        status: 'processing',
        errorMessage: null,
        nextPollAt: new Date(),
      })
    )

    return this.toResponse(nextRecord ?? record, null, new Map())
  }

  private toLogContext(record: VideoRecord) {
    return {
      videoTaskId: record.id,
      projectId: record.projectId,
      userId: record.userId,
      traceId: record.idempotencyKey,
    }
  }

  private async toResponse(
    record: VideoRecord,
    ttlSeconds: number | null,
    estimateCache: Map<string, Promise<VideoDurationEstimate | null>>
  ) {
    const videoUrl =
      record.status === 'succeeded' && record.videoOssKey
        ? await this.ossService.getSignedUrl(record.videoOssKey, ttlSeconds ?? undefined)
        : null

    const elapsedSeconds = this.resolveElapsedSeconds(record)
    const durationEstimate = await this.getDurationEstimate(record, estimateCache)

    return {
      ...record,
      mode: this.resolveMode(record),
      replayDraft: this.buildReplayDraft(record),
      videoUrl,
      elapsedSeconds,
      estimatedTotalSeconds:
        record.status === 'pending' || record.status === 'processing'
          ? durationEstimate?.avgSeconds ? Math.round(durationEstimate.avgSeconds) : null
          : null,
      estimateSampleSize: record.status === 'pending' || record.status === 'processing' ? durationEstimate?.sampleSize ?? null : null,
    }
  }

  private resolveElapsedSeconds(record: VideoRecord): number | null {
    if (record.status !== 'pending' && record.status !== 'processing') {
      return null
    }

    return Math.max(0, Math.round((Date.now() - record.createdAt.getTime()) / 1000))
  }

  private resolveMode(record: VideoRecord): VideoGenerateMode | null {
    const snapshotMode = record.requestSnapshot?.mode
    if (snapshotMode === 'frames' || snapshotMode === 'omni') {
      return snapshotMode
    }

    const content = Array.isArray(record.requestSnapshot?.content) ? record.requestSnapshot.content : []
    const hasFrameRole = content.some(
      (item) =>
        item &&
        typeof item === 'object' &&
        'role' in item &&
        (item.role === 'first_frame' || item.role === 'last_frame')
    )

    if (hasFrameRole) {
      return 'frames'
    }

    const hasOmniRole = content.some(
      (item) =>
        item &&
        typeof item === 'object' &&
        'role' in item &&
        (item.role === 'reference_image' || item.role === 'reference_video' || item.role === 'reference_audio')
    )

    return hasOmniRole ? 'omni' : null
  }

  private async getDurationEstimate(
    record: VideoRecord,
    estimateCache: Map<string, Promise<VideoDurationEstimate | null>>
  ): Promise<VideoDurationEstimate | null> {
    if (record.status !== 'pending' && record.status !== 'processing') {
      return null
    }

    const cacheKey = JSON.stringify({
      model: record.model,
      duration: record.duration,
      ratio: record.ratio,
      resolution: record.resolution,
    })

    if (!estimateCache.has(cacheKey)) {
      estimateCache.set(
        cacheKey,
        this.repository.getDurationEstimate({
          model: record.model,
          duration: record.duration,
          ratio: record.ratio,
          resolution: record.resolution,
        })
      )
    }

    return estimateCache.get(cacheKey) ?? null
  }

  private buildReplayDraft(record: VideoRecord): VideoReplayDraft | null {
    const mode = this.resolveMode(record)
    const model = record.model.trim()
    const promptRaw = record.promptRaw.trim()
    const content = Array.isArray(record.requestSnapshot?.content) ? record.requestSnapshot.content : null

    if (!mode || !model || !promptRaw || content === null) {
      return null
    }

    return {
      mode,
      model: record.model,
      duration: record.duration,
      ratio: record.ratio,
      resolution: record.resolution,
      generateAudio: record.generateAudio,
      promptRaw: record.promptRaw,
      assets: content
        .map((item) => this.extractReplayAsset(item))
        .filter((item): item is VideoTaskAssetReference => item !== null),
    }
  }

  private extractReplayAsset(item: VideoContentItem): VideoTaskAssetReference | null {
    if (item.type === 'text') {
      return null
    }

    const assetId = item.assetId
    if (typeof assetId !== 'number' || !Number.isInteger(assetId) || assetId <= 0) {
      return null
    }

    if (item.type === 'image_url') {
      const role = item.role
      if (role !== 'first_frame' && role !== 'last_frame' && role !== 'reference_image') {
        return null
      }

      return {
        assetId,
        role,
      }
    }

    return {
      assetId,
      role: item.role,
    }
  }
}
