import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`alter table video_tasks add column if not exists download_claimed_at timestamptz`.execute(db)
  await sql`alter table video_tasks add column if not exists download_claim_token varchar(64)`.execute(db)

  await db.schema
    .createIndex('idx_video_tasks_downloadable')
    .ifNotExists()
    .on('video_tasks')
    .columns(['status', 'download_claimed_at', 'next_poll_at'])
    .execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropIndex('idx_video_tasks_downloadable').ifExists().execute()
  await sql`alter table video_tasks drop column if exists download_claim_token`.execute(db)
  await sql`alter table video_tasks drop column if exists download_claimed_at`.execute(db)
}
