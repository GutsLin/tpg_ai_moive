import { appLogger } from '../utils/logger'
import { db, type JsonValue } from '../db/kysely'

export type VideoGenerationLogStatus = 'started' | 'succeeded' | 'failed' | 'info'

export interface VideoGenerationLogContext {
  videoTaskId: number
  projectId: number
  userId: number | null
  traceId: string
}

export interface VideoGenerationLogWriteInput extends VideoGenerationLogContext {
  stage: string
  action: string
  status: VideoGenerationLogStatus
  message: string
  requestPayload?: unknown
  responsePayload?: unknown
  durationMs?: number | null
  errorMessage?: string | null
}

export interface VideoGenerationLogRecord {
  id: number
  videoTaskId: number | null
  projectId: number
  userId: number | null
  traceId: string
  userName: string | null
  stage: string
  action: string
  status: VideoGenerationLogStatus
  message: string
  requestPayload: JsonValue | null
  responsePayload: JsonValue | null
  durationMs: number | null
  errorMessage: string | null
  createdAt: Date
}

export interface VideoGenerationLogQuery {
  projectId: number
  taskId?: number
  stage?: string
  status?: VideoGenerationLogStatus
  dateFrom?: Date
  dateTo?: Date
  page: number
  pageSize: number
}

export interface VideoGenerationLogRepository {
  create(input: Omit<VideoGenerationLogRecord, 'id' | 'userName' | 'createdAt'>): Promise<void>
  list(input: VideoGenerationLogQuery): Promise<{ items: VideoGenerationLogRecord[]; total: number }>
  deleteRange(input: { projectId: number; dateFrom: Date; dateTo: Date }): Promise<number>
}

const serializeJsonValue = (value: JsonValue | null) => value === null ? null : JSON.stringify(value)

export class KyselyVideoGenerationLogRepository implements VideoGenerationLogRepository {
  public async create(input: Omit<VideoGenerationLogRecord, 'id' | 'userName' | 'createdAt'>): Promise<void> {
    await db
      .insertInto('video_generation_logs')
      .values({
        video_task_id: input.videoTaskId,
        project_id: input.projectId,
        user_id: input.userId,
        trace_id: input.traceId,
        stage: input.stage,
        action: input.action,
        status: input.status,
        message: input.message,
        request_payload: serializeJsonValue(input.requestPayload),
        response_payload: serializeJsonValue(input.responsePayload),
        duration_ms: input.durationMs,
        error_message: input.errorMessage,
      })
      .execute()
  }

  public async list(input: VideoGenerationLogQuery): Promise<{ items: VideoGenerationLogRecord[]; total: number }> {
    let query = db
      .selectFrom('video_generation_logs as logs')
      .leftJoin('users', 'users.id', 'logs.user_id')
      .where('logs.project_id', '=', input.projectId)
    let countQuery = db.selectFrom('video_generation_logs as logs').where('logs.project_id', '=', input.projectId)

    if (input.taskId) {
      query = query.where('logs.video_task_id', '=', input.taskId)
      countQuery = countQuery.where('logs.video_task_id', '=', input.taskId)
    }

    if (input.stage) {
      query = query.where('logs.stage', '=', input.stage)
      countQuery = countQuery.where('logs.stage', '=', input.stage)
    }

    if (input.status) {
      query = query.where('logs.status', '=', input.status)
      countQuery = countQuery.where('logs.status', '=', input.status)
    }

    if (input.dateFrom) {
      query = query.where('logs.created_at', '>=', input.dateFrom)
      countQuery = countQuery.where('logs.created_at', '>=', input.dateFrom)
    }

    if (input.dateTo) {
      query = query.where('logs.created_at', '<=', input.dateTo)
      countQuery = countQuery.where('logs.created_at', '<=', input.dateTo)
    }

    const [rows, totalRow] = await Promise.all([
      query
        .select([
          'logs.id as id',
          'logs.video_task_id as videoTaskId',
          'logs.project_id as projectId',
          'logs.user_id as userId',
          'logs.trace_id as traceId',
          'logs.stage as stage',
          'logs.action as action',
          'logs.status as status',
          'logs.message as message',
          'logs.request_payload as requestPayload',
          'logs.response_payload as responsePayload',
          'logs.duration_ms as durationMs',
          'logs.error_message as errorMessage',
          'logs.created_at as createdAt',
          'users.username as userName',
        ])
        .orderBy('logs.id', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .execute(),
      countQuery.select((eb) => eb.fn.count<number>('logs.id').as('count')).executeTakeFirstOrThrow(),
    ])

    return {
      items: rows.map((row) => ({
        id: Number(row.id),
        videoTaskId: row.videoTaskId === null ? null : Number(row.videoTaskId),
        projectId: Number(row.projectId),
        userId: row.userId === null ? null : Number(row.userId),
        userName: row.userName,
        traceId: row.traceId,
        stage: row.stage,
        action: row.action,
        status: row.status,
        message: row.message,
        requestPayload: row.requestPayload,
        responsePayload: row.responsePayload,
        durationMs: row.durationMs,
        errorMessage: row.errorMessage,
        createdAt: new Date(row.createdAt),
      })),
      total: Number(totalRow.count),
    }
  }

  public async deleteRange(input: { projectId: number; dateFrom: Date; dateTo: Date }): Promise<number> {
    const result = await db
      .deleteFrom('video_generation_logs')
      .where('project_id', '=', input.projectId)
      .where('created_at', '>=', input.dateFrom)
      .where('created_at', '<=', input.dateTo)
      .executeTakeFirst()

    return Number(result.numDeletedRows)
  }
}

export class NoopVideoGenerationLogRepository implements VideoGenerationLogRepository {
  public async create(): Promise<void> {}

  public async list(): Promise<{ items: VideoGenerationLogRecord[]; total: number }> {
    return { items: [], total: 0 }
  }

  public async deleteRange(): Promise<number> {
    return 0
  }
}

const SENSITIVE_KEY_PATTERN = /authorization|api[_-]?key|access[_-]?key|secret|password|token|credential|cookie|signature/i
const MAX_DEPTH = 8
const MAX_ARRAY_ITEMS = 50
const MAX_OBJECT_KEYS = 100
const MAX_STRING_LENGTH = 8_000

const sanitizeString = (value: string): string => {
  if (value.startsWith('data:')) {
    return '[REDACTED_DATA_URL]'
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value)
      return `${parsed.origin}${parsed.pathname}${parsed.search || parsed.hash ? '?[REDACTED]' : ''}`
    } catch {
      // Keep non-standard URL-like strings as regular text.
    }
  }

  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]` : value
}

export const sanitizeVideoGenerationLogValue = (value: unknown): JsonValue => {
  const seen = new WeakSet<object>()

  const visit = (current: unknown, key: string | null, depth: number): JsonValue => {
    if (key && SENSITIVE_KEY_PATTERN.test(key)) {
      return '[REDACTED]'
    }

    if (current === null || current === undefined) {
      return null
    }

    if (typeof current === 'string') {
      return sanitizeString(current)
    }

    if (typeof current === 'boolean') {
      return current
    }

    if (typeof current === 'number') {
      return Number.isFinite(current) ? current : String(current)
    }

    if (typeof current === 'bigint') {
      return current.toString()
    }

    if (current instanceof Date) {
      return current.toISOString()
    }

    if (current instanceof Error) {
      return {
        name: current.name,
        message: sanitizeString(current.message),
      }
    }

    if (Buffer.isBuffer(current)) {
      return { type: 'Buffer', length: current.length }
    }

    if (typeof current !== 'object') {
      return String(current)
    }

    if (depth >= MAX_DEPTH) {
      return '[MAX_DEPTH]'
    }

    if (seen.has(current)) {
      return '[CIRCULAR]'
    }
    seen.add(current)

    if (Array.isArray(current)) {
      const items = current.slice(0, MAX_ARRAY_ITEMS).map((item) => visit(item, null, depth + 1))
      if (current.length > MAX_ARRAY_ITEMS) {
        items.push(`[${current.length - MAX_ARRAY_ITEMS} MORE ITEMS]`)
      }
      return items
    }

    const entries = Object.entries(current as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS)
    const sanitized: Record<string, JsonValue> = {}
    for (const [entryKey, entryValue] of entries) {
      sanitized[entryKey] = visit(entryValue, entryKey, depth + 1)
    }
    if (Object.keys(current).length > MAX_OBJECT_KEYS) {
      sanitized.__truncatedKeys = Object.keys(current).length - MAX_OBJECT_KEYS
    }
    return sanitized
  }

  return visit(value, null, 0)
}

const resolveErrorMessage = (error: unknown) =>
  sanitizeString(error instanceof Error ? error.message : String(error)).slice(0, 2_000)

export class VideoGenerationLogger {
  public constructor(
    private readonly repository: VideoGenerationLogRepository = new NoopVideoGenerationLogRepository(),
    private readonly now: () => number = Date.now
  ) {}

  public async write(input: VideoGenerationLogWriteInput): Promise<void> {
    try {
      await this.repository.create({
        videoTaskId: input.videoTaskId,
        projectId: input.projectId,
        userId: input.userId,
        traceId: input.traceId,
        stage: input.stage,
        action: input.action,
        status: input.status,
        message: input.message,
        requestPayload: input.requestPayload === undefined ? null : sanitizeVideoGenerationLogValue(input.requestPayload),
        responsePayload: input.responsePayload === undefined ? null : sanitizeVideoGenerationLogValue(input.responsePayload),
        durationMs: input.durationMs ?? null,
        errorMessage: input.errorMessage ? resolveErrorMessage(input.errorMessage) : null,
      })
    } catch (error) {
      appLogger.warn(
        {
          videoTaskId: input.videoTaskId,
          stage: input.stage,
          action: input.action,
          errorMessage: resolveErrorMessage(error),
        },
        'video generation log persistence failed'
      )
    }
  }

  public async step<T>(
    input: VideoGenerationLogContext & {
      stage: string
      action: string
      message: string
      requestPayload?: unknown
      responsePayload?: (result: T) => unknown
      resultStatus?: (result: T) => 'succeeded' | 'failed'
      resultErrorMessage?: (result: T) => string | null
    },
    operation: () => Promise<T>
  ): Promise<T> {
    const startedAt = this.now()
    const {
      responsePayload: summarizeResponse,
      resultStatus,
      resultErrorMessage,
      ...logInput
    } = input
    await this.write({ ...logInput, status: 'started' })

    try {
      const result = await operation()
      let responsePayload: unknown = result
      if (summarizeResponse) {
        try {
          responsePayload = summarizeResponse(result)
        } catch {
          responsePayload = { summary: '结果摘要生成失败' }
        }
      }
      await this.write({
        ...logInput,
        status: resultStatus?.(result) ?? 'succeeded',
        responsePayload,
        durationMs: Math.max(0, this.now() - startedAt),
        errorMessage: resultErrorMessage?.(result) ?? null,
      })
      return result
    } catch (error) {
      await this.write({
        ...logInput,
        status: 'failed',
        durationMs: Math.max(0, this.now() - startedAt),
        errorMessage: resolveErrorMessage(error),
      })
      throw error
    }
  }
}

export class VideoGenerationLogService {
  public constructor(private readonly repository: VideoGenerationLogRepository = new KyselyVideoGenerationLogRepository()) {}

  public async list(
    projectId: number,
    query: {
      taskId?: number
      stage?: string
      status?: VideoGenerationLogStatus
      dateFrom?: string
      dateTo?: string
      page?: number
      pageSize?: number
    }
  ) {
    const result = await this.repository.list({
      projectId,
      taskId: query.taskId,
      stage: query.stage,
      status: query.status,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 50,
    })

    return {
      items: result.items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
      total: result.total,
    }
  }

  public async deleteRange(projectId: number, input: { dateFrom: string; dateTo: string }) {
    const deletedCount = await this.repository.deleteRange({
      projectId,
      dateFrom: new Date(input.dateFrom),
      dateTo: new Date(input.dateTo),
    })

    return { deletedCount }
  }
}
