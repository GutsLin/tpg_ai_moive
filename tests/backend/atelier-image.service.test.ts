import { Kysely, PostgresDialect } from 'kysely'
import { newDb } from 'pg-mem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '../../backend/src/db/kysely'
import { AtelierImageService } from '../../backend/src/services/atelier-image.service'

describe('Atelier image generation service', () => {
  let database: Kysely<Database>

  beforeEach(async () => {
    const memoryDb = newDb()
    const { Pool } = memoryDb.adapters.createPg()
    database = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool() }) })
    await database.schema.createTable('atelier_generation_tasks').addColumn('id', 'bigserial', (c) => c.primaryKey()).addColumn('project_id', 'bigint').addColumn('created_by_user_id', 'bigint').addColumn('canvas_id', 'bigint').addColumn('canvas_version', 'integer').addColumn('prompt_id', 'bigint').addColumn('prompt_version', 'integer').addColumn('operation', 'varchar(100)').addColumn('media_type', 'varchar(16)').addColumn('channel_key', 'varchar(128)').addColumn('model', 'varchar(255)').addColumn('idempotency_key', 'varchar(255)').addColumn('request_json', 'jsonb').addColumn('status', 'varchar(32)').addColumn('progress_percent', 'integer').addColumn('provider_task_id', 'varchar(255)').addColumn('error_code', 'varchar(128)').addColumn('error_message', 'text').addColumn('created_at', 'timestamptz').addColumn('updated_at', 'timestamptz').execute()
  })

  afterEach(async () => database.destroy())

  it('uses the authenticated user key and stores no key in the task snapshot', async () => {
    const adapter = { create: vi.fn().mockResolvedValue({ mode: 'async', providerTaskId: 'provider-task-1' }), poll: vi.fn() }
    const providerService = { getUserClientConfiguration: vi.fn().mockResolvedValue({ providerKey: 'toapis', providerType: 'toapis', name: 'ToAPIs', endpoint: 'https://provider.test', apiKey: 'user-only-secret' }) }
    const service = new AtelierImageService({ database, adapter, providerService: providerService as any })
    const task = await service.create({ projectId: 7, userId: 11, projectRole: 'member', prompt: 'cinematic portrait' })
    expect(providerService.getUserClientConfiguration).toHaveBeenCalledWith(11, 'toapis')
    expect(adapter.create).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'user-only-secret', prompt: 'cinematic portrait' }))
    const stored = await database.selectFrom('atelier_generation_tasks').selectAll().executeTakeFirstOrThrow()
    expect(stored.request_json).toEqual(expect.objectContaining({ prompt: 'cinematic portrait' }))
    expect(JSON.stringify(stored)).not.toContain('user-only-secret')
    expect(task).toMatchObject({ projectId: 7, createdByUserId: 11, status: 'processing' })
  })

  it('does not allow another project member to poll the task', async () => {
    const adapter = { create: vi.fn().mockResolvedValue({ mode: 'async', providerTaskId: 'provider-task-1' }), poll: vi.fn() }
    const providerService = { getUserClientConfiguration: vi.fn().mockResolvedValue({ providerKey: 'toapis', providerType: 'toapis', name: 'ToAPIs', endpoint: 'https://provider.test', apiKey: 'key' }) }
    const service = new AtelierImageService({ database, adapter, providerService: providerService as any })
    const task = await service.create({ projectId: 7, userId: 11, projectRole: 'member', prompt: 'x' })
    await expect(service.poll(7, 12, task.id)).rejects.toMatchObject({ status: 404 })
    expect(adapter.poll).not.toHaveBeenCalled()
  })

  it('rejects viewers and users without a personal key before calling the provider', async () => {
    const adapter = { create: vi.fn(), poll: vi.fn() }
    const providerService = { getUserClientConfiguration: vi.fn().mockRejectedValue(new Error('no personal key')) }
    const service = new AtelierImageService({ database, adapter, providerService: providerService as any })
    await expect(service.create({ projectId: 7, userId: 11, projectRole: 'viewer', prompt: 'x' })).rejects.toMatchObject({ status: 403 })
    await expect(service.create({ projectId: 7, userId: 11, projectRole: 'member', prompt: 'x' })).rejects.toThrow('no personal key')
    expect(adapter.create).not.toHaveBeenCalled()
  })
})
