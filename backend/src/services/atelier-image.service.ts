import { randomUUID } from 'node:crypto'

import { db, type Database, type JsonValue } from '../db/kysely'
import type { Kysely } from 'kysely'
import { AppError, ForbiddenError, NotFoundError, ValidationAppError } from '../utils/errors'
import { UserApiKeyService } from './user-api-key.service'
import { VideoProviderService } from './video-provider.service'
import { OpenAiCompatibleImageAdapter, type AtelierImageAdapter, type ImageOutput } from './atelier-image.adapter'
import type { AtelierAiCapability } from './atelier-ai.service'

type ProjectRole = 'manager' | 'member' | 'viewer' | null

export interface ImageGenerationInput {
  projectId: number
  userId: number
  projectRole: ProjectRole
  model?: string
  prompt: string
  size?: string
  n?: number
  idempotencyKey?: string
  references?: Array<{ url?: string }>
}

export interface ImageGenerationServiceOptions {
  database?: Kysely<Database>
  userApiKeyService?: UserApiKeyService
  providerService?: VideoProviderService
  adapter?: AtelierImageAdapter
  dispatcher?: AtelierImageDispatcher
}

export interface AtelierImageDispatcher {
  enqueueCreate(taskId: number): Promise<void>
  enqueuePoll(taskId: number, options?: { delayMs?: number; runAt?: Date }): Promise<void>
}

const DEFAULT_MODEL = 'gpt-image-2'
const IMAGE_PROVIDER_KEY = 'toapis'

const outputToResponse = async (output: ImageOutput): Promise<{ url?: string; contentType?: string; base64?: string }> => {
  if (output.source === 'url') return { url: output.url, contentType: output.contentType }
  const chunks: Buffer[] = []
  for await (const chunk of output.body as AsyncIterable<Buffer | string>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return { base64: Buffer.concat(chunks).toString('base64'), contentType: output.contentType }
}

export class AtelierImageService {
  private readonly database: Kysely<Database>
  private readonly userApiKeyService: UserApiKeyService
  private readonly providerService: VideoProviderService
  private readonly adapter: AtelierImageAdapter
  private readonly dispatcher?: AtelierImageDispatcher
  private readonly allowInlineExecution: boolean

  public constructor(options: ImageGenerationServiceOptions = {}) {
    this.database = options.database ?? db
    this.userApiKeyService = options.userApiKeyService ?? new UserApiKeyService()
    this.providerService = options.providerService ?? new VideoProviderService()
    this.adapter = options.adapter ?? new OpenAiCompatibleImageAdapter()
    this.dispatcher = options.dispatcher
    this.allowInlineExecution = Boolean(options.adapter && !options.dispatcher)
  }

  public async getCapability(userId: number): Promise<AtelierAiCapability> {
    try {
      const provider = await this.providerService.getUserClientConfiguration(userId, IMAGE_PROVIDER_KEY)
      if (provider.providerType !== 'toapis') throw new ValidationAppError('当前启用的平台不支持图像生成')
      return {
        mediaType: 'image' as const,
        enabled: true,
        operations: ['image.generate'],
        providerKey: provider.providerKey,
        providerName: provider.name,
        models: [{ id: DEFAULT_MODEL, label: DEFAULT_MODEL, operations: ['generate'], supports: { referenceImage: true } }],
      }
    } catch {
      return {
        mediaType: 'image' as const,
        enabled: false,
        operations: ['image.generate'],
        providerKey: null,
        providerName: null,
        models: [],
      }
    }
  }

  public async create(input: ImageGenerationInput) {
    this.assertWritable(input.projectRole)
    const prompt = input.prompt.trim()
    if (!prompt) throw new ValidationAppError('图片提示词不能为空')
    const model = (input.model ?? DEFAULT_MODEL).trim()
    if (!model) throw new ValidationAppError('图像模型不能为空')
    const idempotencyKey = (input.idempotencyKey ?? randomUUID()).trim()
    if (idempotencyKey.length > 255) throw new ValidationAppError('幂等键过长')

    const provider = await this.providerService.getUserClientConfiguration(input.userId, IMAGE_PROVIDER_KEY)
    if (provider.providerType !== 'toapis') throw new ValidationAppError('当前启用的平台不支持图像生成')

    const existing = await this.database.selectFrom('atelier_generation_tasks').selectAll()
      .where('project_id', '=', input.projectId).where('created_by_user_id', '=', input.userId)
      .where('operation', '=', 'image.generate').where('idempotency_key', '=', idempotencyKey).executeTakeFirst()
    if (existing) return this.toTaskResponse(existing)

    const requestJson = { prompt, size: input.size ?? '1:1', n: input.n ?? 1, references: input.references ?? [] } as unknown as JsonValue
    const task = await this.database.insertInto('atelier_generation_tasks').values({
      project_id: input.projectId, created_by_user_id: input.userId, canvas_id: null, canvas_version: null,
      prompt_id: null, prompt_version: null, operation: 'image.generate', media_type: 'image', channel_key: provider.providerKey,
      model, idempotency_key: idempotencyKey, request_json: requestJson, status: 'pending', progress_percent: 0,
      provider_task_id: null, error_code: null, error_message: null, created_at: new Date(), updated_at: new Date(),
    }).returningAll().executeTakeFirstOrThrow()

    if (!this.dispatcher && this.allowInlineExecution) {
      try {
        const result = await this.adapter.create({ endpoint: provider.endpoint, apiKey: provider.apiKey, model, prompt, size: input.size ?? '1:1', n: input.n ?? 1, references: input.references })
        if (result.mode === 'async') {
          const updated = await this.database.updateTable('atelier_generation_tasks').set({ status: 'processing', provider_task_id: result.providerTaskId, updated_at: new Date() }).where('id', '=', task.id).returningAll().executeTakeFirstOrThrow()
          return { ...this.toTaskResponse(updated), nextPollAfterMs: result.nextPollAfterMs ?? 1000 }
        }
        const outputs = await Promise.all(result.outputs.map(outputToResponse))
        const updated = await this.database.updateTable('atelier_generation_tasks').set({ status: 'succeeded', progress_percent: 100, updated_at: new Date() }).where('id', '=', task.id).returningAll().executeTakeFirstOrThrow()
        return { ...this.toTaskResponse(updated), outputs }
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : '图像生成失败'
        const safeMessage = rawMessage.replaceAll(provider.apiKey, '[REDACTED]').slice(0, 500)
        await this.database.updateTable('atelier_generation_tasks').set({ status: 'failed', error_code: 'IMAGE_PROVIDER_ERROR', error_message: safeMessage, updated_at: new Date() }).where('id', '=', task.id).execute()
        throw new AppError(502, 502, '图像生成服务调用失败')
      }
    }
    if (!this.dispatcher) throw new AppError(503, 503, '图片生成队列未配置')
    try {
      await this.dispatcher.enqueueCreate(Number(task.id))
    } catch {
      await this.database.updateTable('atelier_generation_tasks').set({ status: 'failed', error_code: 'IMAGE_QUEUE_ERROR', error_message: '图片生成任务入队失败', updated_at: new Date() }).where('id', '=', task.id).execute()
      throw new AppError(503, 503, '图片生成队列暂不可用')
    }
    return this.toTaskResponse(task)
  }

  public async poll(projectId: number, userId: number, taskId: number) {
    const task = await this.database.selectFrom('atelier_generation_tasks').selectAll().where('id', '=', taskId)
      .where('project_id', '=', projectId).where('created_by_user_id', '=', userId).where('operation', '=', 'image.generate').executeTakeFirst()
    if (!task) throw new NotFoundError('图像任务不存在')
    return this.toTaskResponse(task)
  }

  /** Called only by the image worker. The HTTP layer never invokes provider APIs. */
  public async processCreate(taskId: number): Promise<void> {
    const task = await this.database.selectFrom('atelier_generation_tasks').selectAll().where('id', '=', taskId).executeTakeFirst()
    if (!task || task.status !== 'pending') return
    const request = (task.request_json ?? {}) as { prompt?: string; size?: string; n?: number; references?: Array<{ url?: string }> }
    const provider = await this.providerService.getUserClientConfiguration(Number(task.created_by_user_id), task.channel_key ?? 'toapis')
    if (provider.providerType !== 'toapis') throw new ValidationAppError('当前启用的平台不支持图像生成')
    const result = await this.adapter.create({ endpoint: provider.endpoint, apiKey: provider.apiKey, model: task.model, prompt: request.prompt ?? '', size: request.size, n: request.n, references: request.references })
    if (result.mode === 'async') {
      const nextPollAt = new Date(Date.now() + (result.nextPollAfterMs ?? 1000))
      await this.database.updateTable('atelier_generation_tasks').set({ status: 'processing', provider_task_id: result.providerTaskId, next_poll_at: nextPollAt, updated_at: new Date() }).where('id', '=', taskId).where('status', '=', 'pending').execute()
      await this.dispatcher?.enqueuePoll(taskId, { runAt: nextPollAt })
      return
    }
    await this.completeTask(taskId, result.outputs)
  }

  public async processPoll(taskId: number): Promise<void> {
    const task = await this.database.selectFrom('atelier_generation_tasks').selectAll().where('id', '=', taskId).executeTakeFirst()
    if (!task || task.status !== 'processing' || !task.provider_task_id) return
    const now = new Date()
    if (task.next_poll_at && new Date(task.next_poll_at).getTime() > now.getTime()) {
      await this.dispatcher?.enqueuePoll(taskId, { runAt: new Date(task.next_poll_at) })
      return
    }
    const provider = await this.providerService.getUserClientConfiguration(Number(task.created_by_user_id), task.channel_key ?? 'toapis')
    const result = await this.adapter.poll({ endpoint: provider.endpoint, apiKey: provider.apiKey, providerTaskId: task.provider_task_id })
    if (result.status === 'processing') {
      const nextPollAt = new Date(Date.now() + 2000)
      await this.database.updateTable('atelier_generation_tasks').set({ progress_percent: result.progress ?? task.progress_percent, last_polled_at: now, next_poll_at: nextPollAt, updated_at: new Date() }).where('id', '=', taskId).execute()
      await this.dispatcher?.enqueuePoll(taskId, { runAt: nextPollAt })
      return
    }
    if (result.status === 'succeeded' && result.outputs) {
      await this.completeTask(taskId, result.outputs)
      return
    }
    const safeErrorMessage = result.errorMessage?.replaceAll(provider.apiKey, '[REDACTED]').slice(0, 500) ?? '图像生成失败'
    await this.database.updateTable('atelier_generation_tasks').set({ status: 'failed', progress_percent: result.progress ?? task.progress_percent, error_code: result.errorCode ?? 'IMAGE_PROVIDER_ERROR', error_message: safeErrorMessage, last_polled_at: now, next_poll_at: null, updated_at: new Date() }).where('id', '=', taskId).execute()
  }

  private async completeTask(taskId: number, outputs: ImageOutput[]): Promise<void> {
    const serialized = await Promise.all(outputs.map(outputToResponse))
    await this.database.updateTable('atelier_generation_tasks').set({ status: 'succeeded', progress_percent: 100, result_json: serialized as unknown as any, next_poll_at: null, updated_at: new Date() }).where('id', '=', taskId).execute()
  }

  private assertWritable(role: ProjectRole) {
    if (role === 'viewer' || role === null) throw new ForbiddenError('当前项目角色不允许生成图片')
  }

  private toTaskResponse(task: any) {
    return { id: Number(task.id), projectId: Number(task.project_id), createdByUserId: Number(task.created_by_user_id), model: task.model, operation: task.operation, status: task.status, progress: task.progress_percent, errorCode: task.error_code, errorMessage: task.error_message, createdAt: task.created_at, updatedAt: task.updated_at, ...(task.result_json ? { outputs: task.result_json } : {}) }
  }
}
