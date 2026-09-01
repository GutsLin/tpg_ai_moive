import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

const CONFIG_KEY = 'infinite_atelier_video_enabled'
const MARKER_KEY = `system_config.${CONFIG_KEY}`

export const up = async (db: Kysely<Database>): Promise<void> => {
  const existing = await db.selectFrom('system_config').select('key').where('key', '=', CONFIG_KEY).executeTakeFirst()
  await sql`insert into atelier_migration_metadata (key, value) values (${MARKER_KEY}, ${existing ? 'preexisting' : 'created'}) on conflict (key) do nothing`.execute(db)
  await db.insertInto('system_config').values({ key: CONFIG_KEY, value: 'false', is_secret: false, description: '无限画布视频生成功能开关' }).onConflict((conflict) => conflict.column('key').doNothing()).execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  const marker = await sql<{ value: string }>`select value from atelier_migration_metadata where key = ${MARKER_KEY}`.execute(db)
  if (marker.rows[0]?.value === 'created') await db.deleteFrom('system_config').where('key', '=', CONFIG_KEY).execute()
  await sql`delete from atelier_migration_metadata where key = ${MARKER_KEY}`.execute(db)
}
