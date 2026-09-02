import 'dotenv/config'

import IORedis from 'ioredis'
import { Queue, Worker, type Job } from 'bullmq'
import { AtelierImageService, type AtelierImageDispatcher } from '../services/atelier-image.service'
import { classifyWorkerError, createWorkerLogger } from './worker-runtime'
import { db } from '../db/kysely'

export const ATELIER_IMAGE_CREATE_QUEUE_NAME = 'atelier-image-create'
export const ATELIER_IMAGE_POLL_QUEUE_NAME = 'atelier-image-poll'
const ATELIER_IMAGE_RECONCILE_INTERVAL_MS = 60_000
const ATELIER_IMAGE_STALE_AFTER_MS = 3 * 60_000

export interface AtelierImageWorkerJob { taskId: number }

const createRedisConnection = () => new IORedis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  lazyConnect: true,
})

type QueueLike = Queue<AtelierImageWorkerJob>
const activeStates = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children'])

const schedule = async (queue: QueueLike, name: string, taskId: number, options: { delayMs?: number; attempts: number }) => {
  const runAt = Date.now() + Math.max(0, options.delayMs ?? 0)
  const jobId = `${name}-${taskId}-${options.delayMs ? runAt : 'once'}`
  const existing = await queue.getJob(jobId)
  if (existing) {
    const state = await existing.getState()
    if (activeStates.has(state)) return
    await existing.remove().catch(() => undefined)
  }
  await queue.add(name, { taskId }, {
    jobId,
    delay: Math.max(0, Math.trunc(runAt - Date.now())),
    attempts: options.attempts,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: true,
    removeOnFail: 100,
  })
}

export class BullMqAtelierImageDispatcher implements AtelierImageDispatcher {
  private readonly connection = createRedisConnection()
  private readonly createQueue: QueueLike
  private readonly pollQueue: QueueLike

  public constructor() {
    this.createQueue = new Queue<AtelierImageWorkerJob>(ATELIER_IMAGE_CREATE_QUEUE_NAME, { connection: this.connection })
    this.pollQueue = new Queue<AtelierImageWorkerJob>(ATELIER_IMAGE_POLL_QUEUE_NAME, { connection: this.connection })
  }

  public enqueueCreate(taskId: number): Promise<void> {
    return schedule(this.createQueue, ATELIER_IMAGE_CREATE_QUEUE_NAME, taskId, { attempts: 3 })
  }

  public enqueuePoll(taskId: number, options?: { delayMs?: number; runAt?: Date }): Promise<void> {
    const delayMs = options?.runAt ? Math.max(0, options.runAt.getTime() - Date.now()) : options?.delayMs
    return schedule(this.pollQueue, ATELIER_IMAGE_POLL_QUEUE_NAME, taskId, { delayMs, attempts: 3 })
  }
}

export const startAtelierImageWorkers = (dependencies?: { service?: AtelierImageService }) => {
  const logger = createWorkerLogger('worker-atelier-image')
  const dispatcher = new BullMqAtelierImageDispatcher()
  const service = dependencies?.service ?? new AtelierImageService({ dispatcher })
  const connection = createRedisConnection()
  const createWorker = new Worker<AtelierImageWorkerJob>(ATELIER_IMAGE_CREATE_QUEUE_NAME, (job: Job<AtelierImageWorkerJob>) => service.processCreate(job.data.taskId), { connection, concurrency: 8 })
  const pollWorker = new Worker<AtelierImageWorkerJob>(ATELIER_IMAGE_POLL_QUEUE_NAME, (job: Job<AtelierImageWorkerJob>) => service.processPoll(job.data.taskId), { connection, concurrency: 16 })

  const reconcile = async () => {
    const cutoff = new Date(Date.now() - ATELIER_IMAGE_STALE_AFTER_MS)
    const stale = await db.selectFrom('atelier_generation_tasks').select(['id', 'status', 'provider_task_id', 'next_poll_at'])
      .where('operation', '=', 'image.generate').where('status', 'in', ['pending', 'processing']).where('updated_at', '<', cutoff).execute()
    await Promise.all(stale.map((task) => task.status === 'pending'
      ? dispatcher.enqueueCreate(Number(task.id))
      : task.provider_task_id
        ? dispatcher.enqueuePoll(Number(task.id), { runAt: task.next_poll_at && new Date(task.next_poll_at).getTime() > Date.now() ? new Date(task.next_poll_at) : new Date() })
        : dispatcher.enqueueCreate(Number(task.id))))
    if (stale.length > 0) logger.info({ staleCount: stale.length }, 'atelier image stale tasks reconciled')
  }
  const reconcileTimer = setInterval(() => { void reconcile().catch((error) => logger.error({ ...classifyWorkerError(error) }, 'atelier image reconcile failed')) }, ATELIER_IMAGE_RECONCILE_INTERVAL_MS)
  reconcileTimer.unref?.()
  void reconcile().catch((error) => logger.error({ ...classifyWorkerError(error) }, 'atelier image initial reconcile failed'))

  const onFailed = (queue: string, job: Job<AtelierImageWorkerJob> | undefined, error: Error) => {
    const details = classifyWorkerError(error)
    logger.error({ queue, jobId: job?.id, taskId: job?.data.taskId, attemptsMade: job?.attemptsMade, recoverable: details.recoverable, reason: details.reason, errorName: details.errorName }, 'atelier image worker job failed')
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void db.updateTable('atelier_generation_tasks').set({ status: 'failed', error_code: 'IMAGE_WORKER_ERROR', error_message: '图像生成 worker 处理失败', updated_at: new Date() }).where('id', '=', job.data.taskId).where((eb) => eb('status', '=', 'pending').or(eb('status', '=', 'processing'))).execute().catch(() => undefined)
    }
  }
  createWorker.on('failed', (job, error) => onFailed(ATELIER_IMAGE_CREATE_QUEUE_NAME, job, error))
  pollWorker.on('failed', (job, error) => onFailed(ATELIER_IMAGE_POLL_QUEUE_NAME, job, error))
  createWorker.on('error', (error) => logger.error({ queue: ATELIER_IMAGE_CREATE_QUEUE_NAME, ...classifyWorkerError(error) }, 'atelier image create worker runtime error'))
  pollWorker.on('error', (error) => logger.error({ queue: ATELIER_IMAGE_POLL_QUEUE_NAME, ...classifyWorkerError(error) }, 'atelier image poll worker runtime error'))
  logger.info({ queues: [ATELIER_IMAGE_CREATE_QUEUE_NAME, ATELIER_IMAGE_POLL_QUEUE_NAME], concurrency: { create: 8, poll: 16 } }, 'atelier image worker service started')
  return { createWorker, pollWorker, reconcileTimer }
}

if (require.main === module) startAtelierImageWorkers()
