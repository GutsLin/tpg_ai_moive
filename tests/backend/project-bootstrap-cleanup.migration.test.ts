import { Kysely, PostgresDialect, sql } from 'kysely'
import { newDb } from 'pg-mem'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '../../backend/src/db/kysely'
import { up as cleanupBootstrapDefaults } from '../../backend/src/db/migrations/20260406123000_cleanup_bootstrap_default_projects'

describe('cleanup_bootstrap_default_projects migration', () => {
  let database: Kysely<Database>

  beforeEach(async () => {
    const memoryDb = newDb()
    const { Pool } = memoryDb.adapters.createPg()

    database = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool(),
      }),
    })

    await database.schema
      .createTable('projects')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('name', 'varchar(128)', (column) => column.notNull())
      .addColumn('code', 'varchar(64)', (column) => column.notNull().unique())
      .addColumn('status', 'varchar(16)', (column) => column.notNull().defaultTo('active'))
      .addColumn('description', 'text')
      .addColumn('cover_asset_id', 'bigint')
      .addColumn('created_by', 'bigint')
      .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .execute()

    await database.schema
      .createTable('project_members')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('project_id', 'bigint', (column) => column.notNull())
      .execute()

    await database.schema
      .createTable('project_assets')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('project_id', 'bigint', (column) => column.notNull())
      .execute()

    await database.schema
      .createTable('asset_categories')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('project_id', 'bigint')
      .addColumn('name', 'varchar(128)', (column) => column.notNull())
      .execute()

    await database.schema
      .createTable('assets')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('project_id', 'bigint')
      .addColumn('source_project_id', 'bigint')
      .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .execute()

    await database.schema.createIndex('idx_assets_project_id').on('assets').column('project_id').execute()

    await database.schema
      .createTable('video_tasks')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('project_id', 'bigint')
      .execute()
  })

  afterEach(async () => {
    await database.destroy()
  })

  it('会清理 fresh install 中的两个引导默认项目，并移除废弃 assets.project_id', async () => {
    await database
      .insertInto('projects')
      .values([
        { name: '默认项目', code: 'legacy-default', status: 'active' },
        { name: '默认项目', code: 'default', status: 'active' },
      ])
      .execute()

    const staleDefault = await database.selectFrom('projects').select('id').where('code', '=', 'default').executeTakeFirstOrThrow()

    await database.insertInto('assets').values({ project_id: Number(staleDefault.id), source_project_id: null }).execute()

    await cleanupBootstrapDefaults(database)

    const remainingProjects = await database.selectFrom('projects').select(['name', 'code']).orderBy('id', 'asc').execute()
    expect(remainingProjects).toEqual([])

    await expect(
      database.schema.alterTable('assets').addColumn('project_id', 'bigint').execute()
    ).resolves.toBeUndefined()
  })

  it('会保留仍被当前项目域数据引用的 legacy 默认项目，只删除重复的 stale 默认项目', async () => {
    await database
      .insertInto('projects')
      .values([
        { name: '默认项目', code: 'legacy-default', status: 'active' },
        { name: '默认项目', code: 'default', status: 'active' },
      ])
      .execute()

    const legacyDefault = await database.selectFrom('projects').select('id').where('code', '=', 'legacy-default').executeTakeFirstOrThrow()
    const staleDefault = await database.selectFrom('projects').select('id').where('code', '=', 'default').executeTakeFirstOrThrow()

    await database.insertInto('project_assets').values({ project_id: Number(legacyDefault.id) }).execute()
    await database.insertInto('assets').values({ project_id: Number(staleDefault.id), source_project_id: null }).execute()

    await cleanupBootstrapDefaults(database)

    const remainingProjects = await database.selectFrom('projects').select(['name', 'code']).orderBy('id', 'asc').execute()
    expect(remainingProjects).toEqual([{ name: '默认项目', code: 'legacy-default' }])
  })
})
