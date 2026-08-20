import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema
    .alterTable('video_tasks')
    .addColumn('next_poll_at', 'timestamptz')
    .addColumn('last_ark_status', 'varchar(64)')
    .addColumn('last_ark_status_changed_at', 'timestamptz')
    .addColumn('last_polled_at', 'timestamptz')
    .execute()

  await sql`
    update video_tasks
    set
      next_poll_at = now(),
      last_ark_status_changed_at = updated_at
    where status in ('pending', 'processing')
      and ark_task_id is not null
      and video_oss_key is null
  `.execute(db)

  await db.schema
    .createIndex('idx_video_tasks_next_poll_at')
    .ifNotExists()
    .on('video_tasks')
    .column('next_poll_at')
    .execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropIndex('idx_video_tasks_next_poll_at').ifExists().execute()
  await db.schema
    .alterTable('video_tasks')
    .dropColumn('last_polled_at')
    .dropColumn('last_ark_status_changed_at')
    .dropColumn('last_ark_status')
    .dropColumn('next_poll_at')
    .execute()
}
