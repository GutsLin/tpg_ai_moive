import { type Kysely } from 'kysely'

import type { Database } from '../kysely'

const seedRows = [
  ['ark_api_key', '', true, '视频生成 Bearer Token'],
  ['ark_access_key', '', true, '素材资产库 Access Key'],
  ['ark_secret_key', '', true, '素材资产库 Secret Key'],
  ['ark_endpoint', 'https://ark.cn-beijing.volces.com/api/v3', false, '视频生成接口地址'],
  ['ark_default_group_id', '', false, '默认素材组 ID'],
  ['oss_access_key_id', '', true, 'OSS Access Key ID'],
  ['oss_access_key_secret', '', true, 'OSS Access Key Secret'],
  ['oss_sts_role_arn', '', false, 'OSS STS Role ARN'],
  ['oss_bucket', '', false, 'OSS Bucket'],
  ['oss_region', '', false, 'OSS 区域'],
  ['oss_signed_url_ttl', '86400', false, '签名 URL 有效期（秒）'],
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
