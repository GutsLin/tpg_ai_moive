import { type Kysely } from 'kysely'

import type { Database } from '../kysely'

const seedRows = [
  ['ark_project_name_mode', 'project_code', false, '火山素材 ProjectName 来源'],
  ['ark_project_name_default_value', '', false, '火山素材 ProjectName 默认值'],
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
