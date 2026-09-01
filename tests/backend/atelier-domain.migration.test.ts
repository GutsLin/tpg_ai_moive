import { Kysely, PostgresDialect, sql } from 'kysely'
import { newDb } from 'pg-mem'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '../../backend/src/db/kysely'
import { down, up } from '../../backend/src/db/migrations/20260902090000_create_atelier_domain'

describe('Infinite Atelier domain migration', () => {
  let database: Kysely<Database>

  beforeEach(async () => {
    const memoryDb = newDb()
    const { Pool } = memoryDb.adapters.createPg()
    database = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool() }) })
    await database.schema.createTable('users').addColumn('id', 'bigserial', (c) => c.primaryKey()).execute()
    await database.schema.createTable('projects').addColumn('id', 'bigserial', (c) => c.primaryKey()).execute()
    await database.schema.createTable('assets')
      .addColumn('id', 'bigserial', (c) => c.primaryKey())
      .addColumn('name', 'varchar(128)', (c) => c.notNull())
      .execute()
    await database.insertInto('users').values({ id: 1 } as never).execute()
    await database.insertInto('projects').values({ id: 1 } as never).execute()
    await database.insertInto('assets').values({ name: 'existing asset' } as never).execute()
  })

  afterEach(async () => database.destroy())

  it('creates project-scoped domain tables without replacing existing data and rolls back cleanly', async () => {
    await up(database)

    await database.insertInto('atelier_canvases').values({
      project_id: 1,
      created_by_user_id: 1,
      title: 'Canvas',
      document_json: sql`'{}'::jsonb`,
      version: 1,
      status: 'active',
      client_stable_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    }).execute()
    const canvas = await database.selectFrom('atelier_canvases').select(['project_id', 'created_by_user_id']).executeTakeFirstOrThrow()
    expect(canvas).toMatchObject({ project_id: 1, created_by_user_id: 1 })

    await down(database)

    expect(await database.selectFrom('assets').select('name').execute()).toEqual([{ name: 'existing asset' }])
    await expect(database.schema.createTable('atelier_canvases').addColumn('id', 'bigint').execute()).resolves.toBeUndefined()
    await expect(database.schema.alterTable('assets').addColumn('prompt_content', 'text').execute()).resolves.toBeUndefined()
  })

  it('preserves a prompt_content column that existed before the Atelier migration', async () => {
    await database.schema.alterTable('assets').addColumn('prompt_content', 'text').execute()
    await database.updateTable('assets').set({ prompt_content: 'existing prompt' }).execute()
    await up(database)
    await down(database)
    expect(await database.selectFrom('assets').select(['name', 'prompt_content']).execute()).toEqual([{ name: 'existing asset', prompt_content: 'existing prompt' }])
  })
})
