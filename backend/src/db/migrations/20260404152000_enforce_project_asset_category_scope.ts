import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`
    update project_assets
    set category_id = null
    where category_id is not null
      and exists (
        select 1
        from asset_categories
        where asset_categories.id = project_assets.category_id
          and asset_categories.project_id <> project_assets.project_id
      )
  `.execute(db)

  await db.schema
    .createIndex('idx_asset_categories_project_id_id')
    .ifNotExists()
    .on('asset_categories')
    .columns(['project_id', 'id'])
    .unique()
    .execute()

  await sql`alter table project_assets drop constraint if exists project_assets_category_id_foreign`.execute(db)
  await sql`
    alter table project_assets
    add constraint project_assets_project_category_foreign
    foreign key (project_id, category_id)
    references asset_categories (project_id, id)
  `.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await sql`alter table project_assets drop constraint if exists project_assets_project_category_foreign`.execute(db)
  await db.schema.dropIndex('idx_asset_categories_project_id_id').ifExists().execute()
  await sql`
    alter table project_assets
    add constraint project_assets_category_id_foreign
    foreign key (category_id)
    references asset_categories (id)
    on delete set null
  `.execute(db)
}
