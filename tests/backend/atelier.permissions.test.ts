import { Kysely, PostgresDialect, sql } from 'kysely'
import { newDb } from 'pg-mem'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '../../backend/src/db/kysely'
import { AtelierService } from '../../backend/src/services/atelier.service'
import { assertAtelierWritable } from '../../backend/src/routes/atelier.routes'

describe('Infinite Atelier permissions', () => {
  let database: Kysely<Database>
  let service: AtelierService

  beforeEach(async () => {
    const memoryDb = newDb()
    const { Pool } = memoryDb.adapters.createPg()
    database = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool() }) })
    await database.schema.createTable('atelier_canvases').addColumn('id', 'bigserial', (c) => c.primaryKey()).addColumn('project_id', 'bigint').addColumn('created_by_user_id', 'bigint').addColumn('title', 'varchar(300)').addColumn('document_json', 'jsonb').addColumn('version', 'integer').addColumn('status', 'varchar(16)').addColumn('client_stable_id', 'varchar(200)').addColumn('created_at', 'timestamptz').addColumn('updated_at', 'timestamptz').addColumn('deleted_at', 'timestamptz').execute()
    await database.schema.createTable('atelier_prompts').addColumn('id', 'bigserial', (c) => c.primaryKey()).addColumn('project_id', 'bigint').addColumn('title', 'varchar(300)').addColumn('tags', 'jsonb').addColumn('current_version', 'integer').addColumn('created_by_user_id', 'bigint').addColumn('updated_by_user_id', 'bigint').addColumn('status', 'varchar(16)').addColumn('client_stable_id', 'varchar(200)').addColumn('created_at', 'timestamptz').addColumn('updated_at', 'timestamptz').addColumn('deleted_at', 'timestamptz').execute()
    await database.schema.createTable('atelier_prompt_versions').addColumn('project_id', 'bigint').addColumn('prompt_id', 'bigint').addColumn('version', 'integer').addColumn('content', 'text').addColumn('updated_by_user_id', 'bigint').addColumn('created_at', 'timestamptz').execute()
    await database.schema.createTable('atelier_canvas_asset_links').addColumn('project_id', 'bigint').addColumn('canvas_id', 'bigint').addColumn('asset_id', 'bigint').addColumn('role', 'varchar(50)').addColumn('sequence_no', 'integer').addColumn('created_at', 'timestamptz').execute()
    service = new AtelierService(database)
    await database.insertInto('atelier_canvases').values({ project_id: 7, created_by_user_id: 11, title: 'A', document_json: sql`'{}'::jsonb`, version: 1, status: 'active', client_stable_id: null, created_at: new Date(), updated_at: new Date(), deleted_at: null }).execute()
  })

  afterEach(async () => database.destroy())

  it('only the canvas creator can read, update, or delete; project admin cannot take over', async () => {
    await expect(service.getCanvas(7, 12, 1)).rejects.toMatchObject({ status: 404 })
    await expect(service.updateCanvas(7, 12, 1, { version: 1, title: 'hijack' })).rejects.toMatchObject({ status: 404 })
    await expect(service.deleteCanvas(7, 12, 1)).rejects.toMatchObject({ status: 404 })
    await expect(service.getCanvas(7, 11, 1)).resolves.toMatchObject({ title: 'A', createdByUserId: 11 })
  })

  it('viewer is read-only for Atelier writes', () => {
    expect(() => assertAtelierWritable('viewer')).toThrowError(/只读/)
    expect(() => assertAtelierWritable('member')).not.toThrow()
    expect(() => assertAtelierWritable('manager')).not.toThrow()
  })
})
