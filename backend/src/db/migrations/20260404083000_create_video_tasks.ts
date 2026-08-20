import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema
    .createTable('video_tasks')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('user_id', 'bigint', (column) => column.notNull().references('users.id'))
    .addColumn('ark_task_id', 'varchar(128)')
    .addColumn('idempotency_key', 'varchar(128)', (column) => column.notNull().unique())
    .addColumn('status', 'varchar(32)', (column) => column.notNull().defaultTo('pending'))
    .addColumn('model', 'varchar(64)', (column) => column.notNull())
    .addColumn('prompt', 'text')
    .addColumn('prompt_raw', 'text')
    .addColumn('duration', 'smallint')
    .addColumn('ratio', 'varchar(16)')
    .addColumn('resolution', 'varchar(8)')
    .addColumn('generate_audio', 'boolean', (column) => column.notNull().defaultTo(true))
    .addColumn('request_snapshot', 'jsonb', (column) => column.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('ark_video_url', 'text')
    .addColumn('video_oss_key', 'text')
    .addColumn('completion_tokens', 'integer')
    .addColumn('total_tokens', 'integer')
    .addColumn('error_message', 'text')
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema.createIndex('idx_video_tasks_user_id').ifNotExists().on('video_tasks').column('user_id').execute()
  await db.schema.createIndex('idx_video_tasks_status').ifNotExists().on('video_tasks').column('status').execute()
  await db.schema.createIndex('idx_video_tasks_ark_task_id').ifNotExists().on('video_tasks').column('ark_task_id').execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropIndex('idx_video_tasks_ark_task_id').ifExists().execute()
  await db.schema.dropIndex('idx_video_tasks_status').ifExists().execute()
  await db.schema.dropIndex('idx_video_tasks_user_id').ifExists().execute()
  await db.schema.dropTable('video_tasks').ifExists().execute()
}
