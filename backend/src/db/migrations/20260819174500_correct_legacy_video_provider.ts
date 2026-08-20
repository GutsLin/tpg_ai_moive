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
  await sql`
    update video_providers
    set
      provider_key = 'volcano_ark',
      name = '火山方舟',
      provider_type = 'volcano_ark',
      capabilities = ${JSON.stringify(volcanoArkCapabilities)}::jsonb,
      updated_at = now()
    where provider_key = 'toapis'
      and lower(endpoint) !~ '^https?://([^/]+\.)?toapis\.com(/|$)'
  `.execute(db)

  await sql`
    update video_tasks as task
    set
      provider_key = provider.provider_key,
      provider_snapshot = jsonb_build_object(
        'providerKey', provider.provider_key,
        'name', provider.name,
        'providerType', provider.provider_type,
        'endpoint', provider.endpoint,
        'capabilities', provider.capabilities
      )
    from video_providers as provider
    where task.provider_key is null
      and task.ark_task_id is not null
      and provider.is_default = true
  `.execute(db)
}

export const down = async (): Promise<void> => {}
