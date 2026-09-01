import { sql, type Kysely } from 'kysely'

import { db, type Database, type JsonValue } from '../db/kysely'
import { ConflictError, ForbiddenError, NotFoundError, ValidationAppError } from '../utils/errors'

type ProjectRole = 'manager' | 'member' | 'viewer'

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

const assertDocument = (document: unknown): JsonValue => {
  const serialized = JSON.stringify(document)
  if (/data:[^;]+;base64,/i.test(serialized)) throw new ValidationAppError('画布文档不能内嵌 base64 媒体')
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_BYTES) throw new ValidationAppError('画布文档不能超过 10 MiB')
  return document as JsonValue
}

const parseTags = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').slice(0, 50)
  return []
}

export const collectCanvasAssetIds = (value: unknown, result = new Set<number>()): Set<number> => {
  if (!value || typeof value !== 'object') return result
  if (!Array.isArray(value)) {
    const assetId = (value as Record<string, unknown>).assetId
    if (typeof assetId === 'number' && Number.isInteger(assetId) && assetId > 0) result.add(assetId)
  }
  for (const child of Object.values(value)) collectCanvasAssetIds(child, result)
  return result
}

export class AtelierService {
  public constructor(private readonly database: Kysely<Database> = db, private readonly onAssetReferencesReleased?: (assetIds: number[]) => Promise<void>) {}

  async listCanvases(projectId: number, userId: number) {
    return this.database.selectFrom('atelier_canvases')
      .select(['id', 'project_id as projectId', 'created_by_user_id as createdByUserId', 'title', 'version', 'created_at as createdAt', 'updated_at as updatedAt'])
      .where('project_id', '=', projectId).where('created_by_user_id', '=', userId).where('status', '=', 'active')
      .orderBy('updated_at', 'desc').execute()
  }

  async getCanvas(projectId: number, userId: number, canvasId: number) {
    const canvas = await this.database.selectFrom('atelier_canvases').selectAll()
      .where('project_id', '=', projectId).where('id', '=', canvasId).where('created_by_user_id', '=', userId).where('status', '=', 'active').executeTakeFirst()
    if (!canvas) throw new NotFoundError('画布不存在')
    return { ...canvas, projectId: canvas.project_id, createdByUserId: canvas.created_by_user_id, documentJson: canvas.document_json, createdAt: canvas.created_at, updatedAt: canvas.updated_at }
  }

  async createCanvas(projectId: number, userId: number, input: { title: string; documentJson: unknown; clientStableId?: string }) {
    const documentJson = assertDocument(input.documentJson)
    const title = input.title.trim()
    if (!title) throw new ValidationAppError('画布名称不能为空')
    const canvasId = await this.database.transaction().execute(async (trx) => {
      const inserted = await trx.insertInto('atelier_canvases').values({
        project_id: projectId, created_by_user_id: userId, title, document_json: documentJson as any,
        version: 1, status: 'active', client_stable_id: input.clientStableId ?? null, created_at: new Date(), updated_at: new Date(), deleted_at: null,
      }).returning('id').executeTakeFirstOrThrow()
      await this.syncCanvasAssetLinks(trx, projectId, Number(inserted.id), documentJson)
      return Number(inserted.id)
    })
    return this.getCanvas(projectId, userId, canvasId)
  }

  async updateCanvas(projectId: number, userId: number, canvasId: number, input: { title?: string; documentJson?: unknown; version: number }) {
    const documentJson = input.documentJson === undefined ? undefined : assertDocument(input.documentJson)
    const releasedAssetIds = await this.database.transaction().execute(async (trx) => {
      const current = await trx.selectFrom('atelier_canvases').select(['version'])
        .where('project_id', '=', projectId).where('id', '=', canvasId).where('created_by_user_id', '=', userId).where('status', '=', 'active').forUpdate().executeTakeFirst()
      if (!current) throw new NotFoundError('画布不存在')
      if (current.version !== input.version) throw new ConflictError('画布已被修改，请刷新后重试')
      const result = await trx.updateTable('atelier_canvases').set({
        title: input.title === undefined ? undefined : input.title.trim(), document_json: documentJson as any,
        version: sql`version + 1`, updated_at: new Date(),
      }).where('project_id', '=', projectId).where('id', '=', canvasId).where('created_by_user_id', '=', userId).where('status', '=', 'active').where('version', '=', input.version).executeTakeFirst()
      if (Number(result.numUpdatedRows) !== 1) throw new ConflictError('画布已被修改，请刷新后重试')
      if (documentJson !== undefined) return await this.syncCanvasAssetLinks(trx, projectId, canvasId, documentJson)
      return []
    })
    await this.notifyPendingCleanup(releasedAssetIds)
    return this.getCanvas(projectId, userId, canvasId)
  }

  async deleteCanvas(projectId: number, userId: number, canvasId: number) {
    const releasedAssetIds = await this.database.transaction().execute(async (trx) => {
      const linked = await trx.selectFrom('atelier_canvas_asset_links').select('asset_id').where('project_id', '=', projectId).where('canvas_id', '=', canvasId).execute()
      const result = await trx.updateTable('atelier_canvases').set({ status: 'deleted', deleted_at: new Date(), updated_at: new Date() })
        .where('project_id', '=', projectId).where('id', '=', canvasId).where('created_by_user_id', '=', userId).where('status', '=', 'active').executeTakeFirst()
      if (Number(result.numUpdatedRows) !== 1) throw new NotFoundError('画布不存在')
      await trx.deleteFrom('atelier_canvas_asset_links').where('project_id', '=', projectId).where('canvas_id', '=', canvasId).execute()
      return linked.map((row) => Number(row.asset_id))
    })
    await this.notifyPendingCleanup(releasedAssetIds)
    return { ok: true }
  }

  private async syncCanvasAssetLinks(executor: Kysely<Database>, projectId: number, canvasId: number, documentJson: JsonValue): Promise<number[]> {
    const assetIds = [...collectCanvasAssetIds(documentJson)]
    if (assetIds.length) {
      const valid = await executor.selectFrom('project_assets').select('asset_id').where('project_id', '=', projectId).where('asset_id', 'in', assetIds).execute()
      if (new Set(valid.map((row) => Number(row.asset_id))).size !== assetIds.length) throw new NotFoundError('画布引用的项目资产不存在')
    }
    const previous = await executor.selectFrom('atelier_canvas_asset_links').select('asset_id').where('project_id', '=', projectId).where('canvas_id', '=', canvasId).execute()
    const nextSet = new Set(assetIds)
    const released = previous.map((row) => Number(row.asset_id)).filter((assetId) => !nextSet.has(assetId))
    await executor.deleteFrom('atelier_canvas_asset_links').where('project_id', '=', projectId).where('canvas_id', '=', canvasId).execute()
    if (assetIds.length) await executor.insertInto('atelier_canvas_asset_links').values(assetIds.map((assetId, sequenceNo) => ({ project_id: projectId, canvas_id: canvasId, asset_id: assetId, role: 'canvas_media', sequence_no: sequenceNo, created_at: new Date() }))).execute()
    return released
  }

  private async notifyPendingCleanup(assetIds: number[]) {
    if (!assetIds.length || !this.onAssetReferencesReleased) return
    const pending = await this.database.selectFrom('assets').select('id').where('id', 'in', assetIds).where('ark_status', '=', 'deleting').execute()
    if (pending.length) await this.onAssetReferencesReleased(pending.map((row) => Number(row.id)))
  }

  async listPrompts(projectId: number, query?: string) {
    let statement = this.database.selectFrom('atelier_prompts as p').innerJoin('atelier_prompt_versions as v', (join) => join.onRef('v.project_id', '=', 'p.project_id').onRef('v.prompt_id', '=', 'p.id').onRef('v.version', '=', 'p.current_version'))
      .select(['p.id', 'p.project_id as projectId', 'p.title', 'p.tags', 'p.current_version as version', 'p.created_by_user_id as createdByUserId', 'p.updated_by_user_id as updatedByUserId', 'v.content', 'p.created_at as createdAt', 'p.updated_at as updatedAt'])
      .where('p.project_id', '=', projectId).where('p.status', '=', 'active')
    if (query?.trim()) statement = statement.where((eb) => eb.or([eb('p.title', 'ilike', `%${query.trim()}%`), eb('v.content', 'ilike', `%${query.trim()}%`)]))
    const rows = await statement.orderBy('p.updated_at', 'desc').execute()
    return rows.map((row) => ({ ...row, tags: parseTags(row.tags) }))
  }

  async createPrompt(projectId: number, userId: number, input: { title: string; content: string; tags?: string[] }) {
    const title = input.title.trim(); const content = input.content.trim()
    if (!title || !content) throw new ValidationAppError('提示词标题和正文不能为空')
    return this.database.transaction().execute(async (trx) => {
      const prompt = await trx.insertInto('atelier_prompts').values({ project_id: projectId, title, tags: parseTags(input.tags), current_version: 1, created_by_user_id: userId, updated_by_user_id: userId, status: 'active', client_stable_id: null, created_at: new Date(), updated_at: new Date(), deleted_at: null }).returningAll().executeTakeFirstOrThrow()
      await trx.insertInto('atelier_prompt_versions').values({ project_id: projectId, prompt_id: Number(prompt.id), version: 1, content, updated_by_user_id: userId, created_at: new Date() }).execute()
      return { id: Number(prompt.id), projectId, title, tags: parseTags(input.tags), version: 1, createdByUserId: userId, content }
    })
  }

  async updatePrompt(projectId: number, userId: number, role: ProjectRole, promptId: number, input: { title?: string; content?: string; tags?: string[]; version: number }) {
    const current = await this.database.selectFrom('atelier_prompts').selectAll().where('project_id', '=', projectId).where('id', '=', promptId).where('status', '=', 'active').executeTakeFirst()
    if (!current) throw new NotFoundError('提示词不存在')
    if (role !== 'manager' && current.created_by_user_id !== userId) throw new ForbiddenError('只能修改自己创建的提示词')
    if (current.current_version !== input.version) throw new ConflictError('提示词已被修改，请刷新后重试')
    const content = input.content?.trim()
    if (input.content !== undefined && !content) throw new ValidationAppError('提示词正文不能为空')
    return this.database.transaction().execute(async (trx) => {
      const nextVersion = current.current_version + 1
      await trx.updateTable('atelier_prompts').set({ title: input.title?.trim(), tags: input.tags === undefined ? undefined : parseTags(input.tags), current_version: nextVersion, updated_by_user_id: userId, updated_at: new Date() }).where('project_id', '=', projectId).where('id', '=', promptId).where('current_version', '=', input.version).executeTakeFirstOrThrow()
      const latest = content ?? (await trx.selectFrom('atelier_prompt_versions').select('content').where('project_id', '=', projectId).where('prompt_id', '=', promptId).where('version', '=', current.current_version).executeTakeFirstOrThrow()).content
      await trx.insertInto('atelier_prompt_versions').values({ project_id: projectId, prompt_id: promptId, version: nextVersion, content: latest, updated_by_user_id: userId, created_at: new Date() }).execute()
      return { id: promptId, projectId, title: input.title?.trim() ?? current.title, tags: input.tags === undefined ? parseTags(current.tags) : parseTags(input.tags), version: nextVersion, createdByUserId: current.created_by_user_id, content: latest }
    })
  }

  async deletePrompt(projectId: number, userId: number, role: ProjectRole, promptId: number) {
    const current = await this.database.selectFrom('atelier_prompts').select(['created_by_user_id as createdByUserId']).where('project_id', '=', projectId).where('id', '=', promptId).where('status', '=', 'active').executeTakeFirst()
    if (!current) throw new NotFoundError('提示词不存在')
    if (role !== 'manager' && current.createdByUserId !== userId) throw new ForbiddenError('只能删除自己创建的提示词')
    await this.database.updateTable('atelier_prompts').set({ status: 'deleted', deleted_at: new Date(), updated_by_user_id: userId, updated_at: new Date() }).where('project_id', '=', projectId).where('id', '=', promptId).execute()
    return { ok: true }
  }
}
