import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema
    .createTable('user_api_keys')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('user_id', 'bigint', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider_key', 'varchar(64)', (column) => column.notNull())
    .addColumn('api_key_encrypted', 'varchar(512)', (column) => column.notNull())
    .addColumn('enabled', 'boolean', (column) => column.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_user_api_keys_user_provider')
    .ifNotExists()
    .on('user_api_keys')
    .columns(['user_id', 'provider_key'])
    .unique()
    .execute()

  await sql`
    insert into system_config (key, value, is_secret, description)
    values ('api_key_mode', 'global', false, 'API Key 模式：global=全局共享 / per_member=成员独立')
    on conflict (key) do nothing
  `.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropIndex('idx_user_api_keys_user_provider').ifExists().execute()
  await db.schema.dropTable('user_api_keys').ifExists().execute()
  await sql`delete from system_config where key = 'api_key_mode'`.execute(db)
}
