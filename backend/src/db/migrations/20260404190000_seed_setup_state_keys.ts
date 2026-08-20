import { type Kysely } from 'kysely'

import type { Database } from '../kysely'

const seedRows = [
  ['system_initialized', 'false', false, '系统是否已完成初始化'],
  ['system_initialized_at', '', false, '系统初始化完成时间'],
  ['system_version', '', false, '当前系统版本'],
  ['system_install_mode', 'self_hosted', false, '当前部署模式'],
] as const

export const up = async (db: Kysely<Database>): Promise<void> => {
  for (const [key, value, isSecret, description] of seedRows) {
    await db
      .insertInto('system_config')
      .values({
        key,
        value,
        is_secret: isSecret,
        description,
      })
      .onConflict((oc) => oc.column('key').doNothing())
      .execute()
  }
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.deleteFrom('system_config').where('key', 'in', seedRows.map(([key]) => key)).execute()
}
