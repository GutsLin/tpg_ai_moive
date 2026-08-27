import { type Kysely } from 'kysely'

import type { Database } from '../kysely'

const seedRows = [
  ['video_reference_image_limit', '30', false, '全能参考模式图片素材全局上限'],
  ['video_reference_video_limit', '10', false, '全能参考模式视频素材全局上限'],
  ['video_reference_audio_limit', '10', false, '全能参考模式音频素材全局上限'],
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
