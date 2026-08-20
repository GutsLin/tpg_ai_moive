import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema
    .createTable('projects')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('name', 'varchar(64)', (column) => column.notNull().unique())
    .addColumn('code', 'varchar(64)', (column) => column.notNull().unique())
    .addColumn('status', 'smallint', (column) => column.notNull().defaultTo(1))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  await db
    .insertInto('projects')
    .values({
      name: '默认项目',
      code: 'default',
      status: 'active',
    })
    .onConflict((oc) => oc.column('code').doNothing())
    .execute()

  await sql`
    alter table assets
    add column if not exists project_id bigint references projects(id)
  `.execute(db)

  await sql`
    update assets
    set project_id = (
      select id
      from projects
      where code = 'default'
      limit 1
    )
    where project_id is null
  `.execute(db)

  await sql`
    alter table assets
    alter column project_id set not null
  `.execute(db)

  await db.schema.createIndex('idx_assets_project_id').ifNotExists().on('assets').column('project_id').execute()

  await db
    .insertInto('system_config')
    .values({
      key: 'system_name',
      value: 'Narrix',
      is_secret: false,
      description: '系统显示名称',
    })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.deleteFrom('system_config').where('key', '=', 'system_name').execute()
  await db.schema.dropIndex('idx_assets_project_id').ifExists().execute()
  await sql`
    alter table assets
    drop column if exists project_id
  `.execute(db)
  await db.schema.dropTable('projects').ifExists().execute()
}
