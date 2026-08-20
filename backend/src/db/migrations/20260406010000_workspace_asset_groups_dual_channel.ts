import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

const DEFAULT_SYNC_CONFIG_KEY = 'ark_default_sync_enabled'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`
    create sequence if not exists project_code_global_seq
  `.execute(db)

  await sql`
    do $$
    declare
      max_project_id bigint;
    begin
      select coalesce(max(id), 0) into max_project_id from projects;
      if max_project_id <= 0 then
        perform setval('project_code_global_seq', 1, false);
      else
        perform setval('project_code_global_seq', max_project_id, true);
      end if;
    end $$;
  `.execute(db)

  await sql`
    alter table asset_categories
    add column if not exists sync_enabled boolean not null default false
  `.execute(db)

  await sql`
    alter table asset_categories
    add column if not exists ark_group_id varchar(128)
  `.execute(db)

  await sql`
    alter table assets
    add column if not exists sync_mode varchar(16) not null default 'inherit'
  `.execute(db)

  await sql`
    update asset_categories
    set sync_enabled = false
    where sync_enabled is distinct from false
  `.execute(db)

  await sql`
    update assets
    set sync_mode = case
      when ark_asset_id is not null then 'enabled'
      else 'disabled'
    end
    where sync_mode is null
       or sync_mode not in ('inherit', 'enabled', 'disabled')
  `.execute(db)

  await db
    .insertInto('system_config')
    .values({
      key: DEFAULT_SYNC_CONFIG_KEY,
      value: 'true',
      is_secret: false,
      description: '默认同步火山策略',
    })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.deleteFrom('system_config').where('key', '=', DEFAULT_SYNC_CONFIG_KEY).execute()
  await sql`alter table assets drop column if exists sync_mode`.execute(db)
  await sql`alter table asset_categories drop column if exists ark_group_id`.execute(db)
  await sql`alter table asset_categories drop column if exists sync_enabled`.execute(db)
  await sql`drop sequence if exists project_code_global_seq`.execute(db)
}
