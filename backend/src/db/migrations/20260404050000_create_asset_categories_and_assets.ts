import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema
    .createTable('asset_categories')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('name', 'varchar(64)', (column) => column.notNull().unique())
    .addColumn('sort_order', 'smallint', (column) => column.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createTable('assets')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('user_id', 'bigint', (column) => column.notNull().references('users.id'))
    .addColumn('name', 'varchar(128)', (column) => column.notNull())
    .addColumn('asset_type', 'varchar(16)', (column) => column.notNull())
    .addColumn('category_id', 'bigint', (column) =>
      column.references('asset_categories.id').onDelete('set null')
    )
    .addColumn('oss_key', 'varchar(512)', (column) => column.notNull())
    .addColumn('ark_group_id', 'varchar(128)')
    .addColumn('ark_asset_id', 'varchar(128)')
    .addColumn('ark_status', 'varchar(32)', (column) => column.notNull().defaultTo('pending'))
    .addColumn('ark_error', 'text')
    .addColumn('tags', 'jsonb', (column) => column.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema.createIndex('idx_assets_user_id').ifNotExists().on('assets').column('user_id').execute()
  await db.schema.createIndex('idx_assets_ark_status').ifNotExists().on('assets').column('ark_status').execute()
  await db.schema.createIndex('idx_assets_ark_asset_id').ifNotExists().on('assets').column('ark_asset_id').execute()
  await db.schema.createIndex('idx_assets_category_id').ifNotExists().on('assets').column('category_id').execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropIndex('idx_assets_category_id').ifExists().execute()
  await db.schema.dropIndex('idx_assets_ark_asset_id').ifExists().execute()
  await db.schema.dropIndex('idx_assets_ark_status').ifExists().execute()
  await db.schema.dropIndex('idx_assets_user_id').ifExists().execute()
  await db.schema.dropTable('assets').ifExists().execute()
  await db.schema.dropTable('asset_categories').ifExists().execute()
}
