import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema
    .createTable('video_generation_logs')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('video_task_id', 'bigint', (column) => column.references('video_tasks.id').onDelete('set null'))
    .addColumn('project_id', 'bigint', (column) => column.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('user_id', 'bigint', (column) => column.references('users.id').onDelete('set null'))
    .addColumn('trace_id', 'varchar(64)', (column) => column.notNull())
    .addColumn('stage', 'varchar(64)', (column) => column.notNull())
    .addColumn('action', 'varchar(96)', (column) => column.notNull())
    .addColumn('status', 'varchar(16)', (column) => column.notNull())
    .addColumn('message', 'varchar(255)', (column) => column.notNull())
    .addColumn('request_payload', 'jsonb')
    .addColumn('response_payload', 'jsonb')
    .addColumn('duration_ms', 'integer')
    .addColumn('error_message', 'text')
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      'video_generation_logs_status_check',
      sql`status in ('started', 'succeeded', 'failed', 'info')`
    )
    .execute()

  await db.schema
    .createIndex('idx_video_generation_logs_project_created')
    .ifNotExists()
    .on('video_generation_logs')
    .columns(['project_id', 'created_at'])
    .execute()

  await db.schema
    .createIndex('idx_video_generation_logs_task_created')
    .ifNotExists()
    .on('video_generation_logs')
    .columns(['video_task_id', 'created_at'])
    .execute()

  await sql`
    update users
    set menu_perms = menu_perms || '["logs"]'::jsonb
    where role = 'admin'
      and not (menu_perms ? 'logs')
  `.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`
    update users
    set menu_perms = coalesce(
      (
        select jsonb_agg(permission)
        from jsonb_array_elements_text(users.menu_perms) as item(permission)
        where permission <> 'logs'
      ),
      '[]'::jsonb
    )
    where role = 'admin'
      and menu_perms ? 'logs'
  `.execute(db)

  await db.schema.dropTable('video_generation_logs').ifExists().execute()
}
