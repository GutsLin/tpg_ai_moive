import { type Kysely } from 'kysely'

import type { Database } from '../kysely'

const CONFIG_KEY = 'oss_server_internal_enabled'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db
    .insertInto('system_config')
    .values({
      key: CONFIG_KEY,
      value: 'false',
      is_secret: false,
      description: '服务端 OSS 是否使用内网 Endpoint',
    })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.deleteFrom('system_config').where('key', '=', CONFIG_KEY).execute()
}
