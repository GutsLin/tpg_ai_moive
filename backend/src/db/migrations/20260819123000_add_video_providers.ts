import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

const volcanoArkCapabilities = {
  version: 1,
  models: [
    {
      id: 'doubao-seedance-2-0-260128',
      label: 'Seedance 2.0',
      duration: { min: 4, max: 15, auto: true },
      resolutions: ['480p', '720p'],
      aspectRatios: ['16:9', '9:16', '1:1'],
      operations: ['generate'],
      supports: {
        firstLastFrame: true,
        referenceImage: true,
        referenceVideo: true,
        referenceAudio: true,
        generateAudio: true,
      },
    },
    {
      id: 'doubao-seedance-2-0-fast-260128',
      label: 'Seedance 2.0 fast',
      duration: { min: 4, max: 15, auto: true },
      resolutions: ['480p', '720p'],
      aspectRatios: ['16:9', '9:16', '1:1'],
      operations: ['generate'],
      supports: {
        firstLastFrame: true,
        referenceImage: true,
        referenceVideo: true,
        referenceAudio: true,
        generateAudio: true,
      },
    },
  ],
}

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema
    .createTable('video_providers')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('provider_key', 'varchar(64)', (column) => column.notNull().unique())
    .addColumn('name', 'varchar(128)', (column) => column.notNull())
    .addColumn('provider_type', 'varchar(64)', (column) => column.notNull())
    .addColumn('endpoint', 'text', (column) => column.notNull())
    .addColumn('api_key', 'text', (column) => column.notNull())
    .addColumn('enabled', 'boolean', (column) => column.notNull().defaultTo(true))
    .addColumn('is_default', 'boolean', (column) => column.notNull().defaultTo(false))
    .addColumn('capabilities', 'jsonb', (column) => column.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_video_providers_default')
    .ifNotExists()
    .on('video_providers')
    .column('is_default')
    .execute()

  await db.schema
    .alterTable('video_tasks')
    .addColumn('provider_key', 'varchar(64)')
    .addColumn('provider_snapshot', 'jsonb', (column) => column.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute()

  await db.schema
    .createIndex('idx_video_tasks_provider_key')
    .ifNotExists()
    .on('video_tasks')
    .column('provider_key')
    .execute()

  // Preserve the current deployment configuration as the first selectable provider.
  await sql`
    insert into video_providers (
      provider_key, name, provider_type, endpoint, api_key, enabled, is_default, capabilities
    )
    select
      case when lower(legacy.endpoint) ~ '^https?://([^/]+\.)?toapis\.com(/|$)' then 'toapis' else 'volcano_ark' end,
      case when lower(legacy.endpoint) ~ '^https?://([^/]+\.)?toapis\.com(/|$)' then 'ToAPIs' else '火山方舟' end,
      case when lower(legacy.endpoint) ~ '^https?://([^/]+\.)?toapis\.com(/|$)' then 'toapis' else 'volcano_ark' end,
      legacy.endpoint,
      coalesce((select value from system_config where key = 'ark_api_key'), ''),
      true,
      true,
      case
        when lower(legacy.endpoint) ~ '^https?://([^/]+\.)?toapis\.com(/|$)'
          then ${JSON.stringify({ version: 1, models: [] })}::jsonb
        else ${JSON.stringify(volcanoArkCapabilities)}::jsonb
      end
    from (
      select coalesce((select value from system_config where key = 'ark_endpoint'), 'https://toapis.com') as endpoint
    ) legacy
    where not exists (select 1 from video_providers)
  `.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropIndex('idx_video_tasks_provider_key').ifExists().execute()
  await db.schema
    .alterTable('video_tasks')
    .dropColumn('provider_snapshot')
    .dropColumn('provider_key')
    .execute()
  await db.schema.dropIndex('idx_video_providers_default').ifExists().execute()
  await db.schema.dropTable('video_providers').ifExists().execute()
}
