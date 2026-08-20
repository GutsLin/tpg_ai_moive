import { sql, Kysely, PostgresDialect } from 'kysely'
import { newDb } from 'pg-mem'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '../../backend/src/db/kysely'
import { KyselyAssetCategoryRepository } from '../../backend/src/services/asset-category.service'

describe('KyselyAssetCategoryRepository', () => {
  let database: Kysely<Database>
  let repository: KyselyAssetCategoryRepository

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
      .addColumn('code', 'varchar(64)', (column) => column.notNull().defaultTo('demo'))
      .addColumn('status', 'varchar(16)', (column) => column.notNull().defaultTo('active'))
      .addColumn('description', 'text')
      .addColumn('cover_asset_id', 'bigint')
      .addColumn('created_by', 'bigint')
      .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .execute()

    await database.schema
      .createTable('asset_categories')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('project_id', 'bigint', (column) => column.notNull().references('projects.id'))
      .addColumn('name', 'varchar(128)', (column) => column.notNull())
      .addColumn('sort_order', 'integer', (column) => column.notNull())
      .addColumn('sync_enabled', 'boolean', (column) => column.notNull().defaultTo(true))
      .addColumn('ark_group_id', 'varchar(128)')
      .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .execute()

    await database.schema
      .createTable('assets')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('user_id', 'bigint', (column) => column.notNull())
      .addColumn('name', 'varchar(128)', (column) => column.notNull())
      .addColumn('asset_type', 'varchar(16)', (column) => column.notNull())
      .addColumn('category_id', 'bigint')
      .addColumn('sync_mode', 'varchar(16)', (column) => column.notNull().defaultTo('inherit'))
      .addColumn('oss_key', 'varchar(512)', (column) => column.notNull())
      .addColumn('ark_group_id', 'varchar(128)')
      .addColumn('ark_asset_id', 'varchar(128)')
      .addColumn('ark_status', 'varchar(32)', (column) => column.notNull().defaultTo('pending'))
      .addColumn('ark_error', 'text')
      .addColumn('tags', 'jsonb', (column) => column.notNull().defaultTo(sql`'[]'::jsonb`))
      .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .execute()

    await database.schema
      .createTable('project_assets')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('project_id', 'bigint', (column) => column.notNull().references('projects.id'))
      .addColumn('asset_id', 'bigint', (column) => column.notNull().references('assets.id'))
      .addColumn('category_id', 'bigint')
      .addColumn('relation_type', 'varchar(32)', (column) => column.notNull())
      .addColumn('created_by', 'bigint')
      .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .execute()

    repository = new KyselyAssetCategoryRepository(database)
  })

  afterEach(async () => {
    await database.destroy()
  })

  it('成员统计在旧表结构仅有 user_id 时仍可正常返回', async () => {
    await database.insertInto('projects').values({ id: 101, name: '都市逆袭' } as never).execute()

    await database
      .insertInto('asset_categories')
      .values([
        { id: 1, project_id: 101, name: '角色', sort_order: 1, sync_enabled: true },
        { id: 2, project_id: 101, name: '场景', sort_order: 2, sync_enabled: true },
      ] as never)
      .execute()

    await database
      .insertInto('assets')
      .values([
        { id: 11, user_id: 2, name: '角色A', asset_type: 'Image', oss_key: 'assets/11.png' },
        { id: 12, user_id: 2, name: '角色B', asset_type: 'Image', oss_key: 'assets/12.png' },
        { id: 13, user_id: 3, name: '场景A', asset_type: 'Image', oss_key: 'assets/13.png' },
      ] as never)
      .execute()

    await database
      .insertInto('project_assets')
      .values([
        { project_id: 101, asset_id: 11, category_id: 1, relation_type: 'primary' },
        { project_id: 101, asset_id: 12, category_id: 1, relation_type: 'primary' },
        { project_id: 101, asset_id: 13, category_id: 2, relation_type: 'primary' },
      ] as never)
      .execute()

    const items = await repository.list(101, 2)

    expect(items).toEqual([
      {
        id: 1,
        projectId: 101,
        name: '角色',
        sortOrder: 1,
        syncEnabled: true,
        arkGroupId: null,
        assetCount: 2,
      },
      {
        id: 2,
        projectId: 101,
        name: '场景',
        sortOrder: 2,
        syncEnabled: true,
        arkGroupId: null,
        assetCount: 0,
      },
    ])
  })
})
