import { Kysely, sql } from 'kysely'
import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.alterTable('atelier_generation_tasks').addColumn('result_json', 'jsonb').execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  const row = await sql<{ count: string }>`select count(*)::text as count from atelier_generation_tasks where result_json is not null`.execute(db)
  if (Number(row.rows[0]?.count ?? 0) > 0) {
    throw new Error('无法回滚 result_json：已有图片生成结果，避免删除任务结果数据')
  }
  await db.schema.alterTable('atelier_generation_tasks').dropColumn('result_json').execute()
}
