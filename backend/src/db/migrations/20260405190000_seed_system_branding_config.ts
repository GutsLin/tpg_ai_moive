import { type Kysely } from 'kysely'

import type { Database } from '../kysely'

const seedRows = [
  ['system_name', 'Narrix', false, '系统名称'],
  ['system_logo_key', '', false, '系统 Logo OSS Key'],
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
