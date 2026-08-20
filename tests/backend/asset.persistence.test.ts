import { sql, Kysely, PostgresDialect } from 'kysely'
import { newDb } from 'pg-mem'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '../../backend/src/db/kysely'
import { KyselyAssetRepository } from '../../backend/src/services/asset.service'

describe('KyselyAssetRepository', () => {
  let database: Kysely<Database>
  let repository: KyselyAssetRepository

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
      .addColumn('cover_asset_id', 'bigint')
      .execute()

    await database.schema
      .createTable('asset_categories')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('project_id', 'bigint', (column) => column.notNull().references('projects.id'))
      .addColumn('name', 'varchar(128)', (column) => column.notNull())
      .addColumn('sync_enabled', 'boolean', (column) => column.notNull().defaultTo(true))
      .addColumn('ark_group_id', 'varchar(128)')
      .execute()

    await database.schema
      .createTable('assets')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('user_id', 'bigint', (column) => column.notNull())
      .addColumn('name', 'varchar(128)', (column) => column.notNull())
      .addColumn('asset_type', 'varchar(16)', (column) => column.notNull())
      .addColumn('category_id', 'bigint')
      .addColumn('oss_key', 'varchar(512)', (column) => column.notNull().unique())
      .addColumn('ark_group_id', 'varchar(128)')
      .addColumn('ark_asset_id', 'varchar(128)')
      .addColumn('ark_status', 'varchar(32)', (column) => column.notNull().defaultTo('pending'))
      .addColumn('ark_error', 'text')
      .addColumn('tags', 'jsonb', (column) => column.notNull().defaultTo(sql`'[]'::jsonb`))
      .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .execute()

    await database.schema
      .alterTable('projects')
      .addForeignKeyConstraint('projects_cover_asset_id_fkey', ['cover_asset_id'], 'assets', ['id'])
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

    await database.schema
      .createTable('video_tasks')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('status', 'varchar(32)', (column) => column.notNull())
      .addColumn('request_snapshot', 'jsonb', (column) => column.notNull().defaultTo(sql`'{}'::jsonb`))
      .execute()

    await database.schema
      .createTable('video_task_assets')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('video_task_id', 'bigint', (column) => column.notNull().references('video_tasks.id'))
      .addColumn('asset_id', 'bigint', (column) => column.notNull().references('assets.id'))
      .addColumn('role', 'varchar(32)', (column) => column.notNull())
      .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .execute()

    repository = new KyselyAssetRepository(database)
  })

  afterEach(async () => {
    await database.destroy()
  })

  it('create 和 update 会把 tags 正确写入 jsonb', async () => {
    const created = await repository.create({
      userId: 1,
      name: '测试素材',
      assetType: 'Image',
      categoryId: 1,
      ossKey: 'assets/test.png',
      arkGroupId: null,
      arkAssetId: null,
      arkStatus: 'pending',
      arkError: null,
      tags: ['e2e', 'video-flow'],
    })

    expect(created.tags).toEqual(['e2e', 'video-flow'])

    const updated = await repository.update(created.id, {
      tags: ['updated', 'jsonb'],
    })

    expect(updated?.tags).toEqual(['updated', 'jsonb'])
  })

  it('deleteById 会先清理素材引用关系再删除主记录', async () => {
    await database
      .insertInto('assets')
      .values({
        id: 28,
        user_id: 1,
        name: '真人测试2',
        asset_type: 'Image',
        oss_key: 'assets/test-delete.png',
        ark_group_id: 'group-1',
        ark_asset_id: 'asset-20260407160759-vnfl4',
        ark_status: 'deleting',
        tags: sql`'[]'::jsonb`,
      } as never)
      .execute()

    await database
      .insertInto('projects')
      .values({
        id: 6,
        name: '项目6',
        cover_asset_id: 28,
      } as never)
      .execute()

    await database
      .insertInto('project_assets')
      .values({
        project_id: 6,
        asset_id: 28,
        relation_type: 'primary',
      } as never)
      .execute()

    await database
      .insertInto('video_tasks')
      .values([
        {
          id: 9,
          status: 'succeeded',
          request_snapshot: sql`'{}'::jsonb`,
        },
        {
          id: 10,
          status: 'succeeded',
          request_snapshot: sql`'{}'::jsonb`,
        },
      ] as never)
      .execute()

    await database
      .insertInto('video_task_assets')
      .values([
        {
          video_task_id: 9,
          asset_id: 28,
          role: 'last_frame',
        },
        {
          video_task_id: 10,
          asset_id: 28,
          role: 'reference_image',
        },
      ] as never)
      .execute()

    await expect(repository.deleteById(28)).resolves.toBeUndefined()

    const asset = await database.selectFrom('assets').select('id').where('id', '=', 28).executeTakeFirst()
    const projectLink = await database
      .selectFrom('project_assets')
      .select('id')
      .where('asset_id', '=', 28)
      .executeTakeFirst()
    const videoTaskLink = await database
      .selectFrom('video_task_assets')
      .select('id')
      .where('asset_id', '=', 28)
      .executeTakeFirst()
    const project = await database
      .selectFrom('projects')
      .select('cover_asset_id')
      .where('id', '=', 6)
      .executeTakeFirstOrThrow()

    expect(asset).toBeUndefined()
    expect(projectLink).toBeUndefined()
    expect(videoTaskLink).toBeUndefined()
    expect(project.cover_asset_id).toBeNull()
  })
})
