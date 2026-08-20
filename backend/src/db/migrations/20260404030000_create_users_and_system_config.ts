import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema
    .createTable('users')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('username', 'varchar(64)', (column) => column.notNull().unique())
    .addColumn('password_hash', 'varchar(128)', (column) => column.notNull())
    .addColumn('role', 'varchar(16)', (column) => column.notNull().defaultTo('user'))
    .addColumn('menu_perms', 'jsonb', (column) => column.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('status', 'smallint', (column) => column.notNull().defaultTo(1))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createTable('system_config')
    .ifNotExists()
    .addColumn('key', 'varchar(64)', (column) => column.primaryKey())
    .addColumn('value', 'text', (column) => column.notNull())
    .addColumn('is_secret', 'boolean', (column) => column.notNull().defaultTo(false))
    .addColumn('description', 'varchar(256)')
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropTable('system_config').ifExists().execute()
  await db.schema.dropTable('users').ifExists().execute()
}
