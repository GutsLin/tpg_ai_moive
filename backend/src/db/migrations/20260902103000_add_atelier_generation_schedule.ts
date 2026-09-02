import { Kysely } from 'kysely'
import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.alterTable('atelier_generation_tasks').addColumn('next_poll_at', 'timestamptz').execute()
  await db.schema.alterTable('atelier_generation_tasks').addColumn('last_polled_at', 'timestamptz').execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.alterTable('atelier_generation_tasks').dropColumn('last_polled_at').execute()
  await db.schema.alterTable('atelier_generation_tasks').dropColumn('next_poll_at').execute()
}
