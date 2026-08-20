import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

const DEFAULT_PROJECT_CODE = 'legacy-default'
const DEFAULT_PROJECT_NAME = '默认项目'

const ensureDefaultProject = async (db: Kysely<Database>): Promise<number> => {
  const existing = await db
    .selectFrom('projects')
    .select('id')
    .where('code', '=', DEFAULT_PROJECT_CODE)
    .executeTakeFirst()

  if (existing) {
    return Number(existing.id)
  }

  const adminUser = await db
    .selectFrom('users')
    .select('id')
    .where('role', '=', 'admin')
    .orderBy('id', 'asc')
    .executeTakeFirst()

  const inserted = await db
    .insertInto('projects')
    .values({
      name: DEFAULT_PROJECT_NAME,
      code: DEFAULT_PROJECT_CODE,
      status: 'active',
      description: '历史平台级数据回填默认项目',
      cover_asset_id: null,
      created_by: adminUser ? Number(adminUser.id) : null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return Number(inserted.id)
}

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema
    .createTable('projects')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('name', 'varchar(128)', (column) => column.notNull())
    .addColumn('code', 'varchar(64)', (column) => column.notNull().unique())
    .addColumn('status', 'varchar(16)', (column) => column.notNull().defaultTo('active'))
    .addColumn('description', 'text')
    .addColumn('cover_asset_id', 'bigint', (column) => column.references('assets.id').onDelete('set null'))
    .addColumn('created_by', 'bigint', (column) => column.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createTable('project_members')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('project_id', 'bigint', (column) => column.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('user_id', 'bigint', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('project_role', 'varchar(16)', (column) => column.notNull().defaultTo('member'))
    .addColumn('status', 'varchar(16)', (column) => column.notNull().defaultTo('active'))
    .addColumn('created_by', 'bigint', (column) => column.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createTable('project_assets')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('project_id', 'bigint', (column) => column.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('asset_id', 'bigint', (column) => column.notNull().references('assets.id').onDelete('cascade'))
    .addColumn('category_id', 'bigint', (column) => column.references('asset_categories.id').onDelete('set null'))
    .addColumn('relation_type', 'varchar(16)', (column) => column.notNull().defaultTo('linked'))
    .addColumn('created_by', 'bigint', (column) => column.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createTable('video_task_assets')
    .ifNotExists()
    .addColumn('id', 'bigserial', (column) => column.primaryKey())
    .addColumn('video_task_id', 'bigint', (column) => column.notNull().references('video_tasks.id').onDelete('cascade'))
    .addColumn('asset_id', 'bigint', (column) => column.notNull().references('assets.id').onDelete('restrict'))
    .addColumn('role', 'varchar(32)', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()

  const defaultProjectId = await ensureDefaultProject(db)

  await db.schema
    .alterTable('asset_categories')
    .addColumn('project_id', 'bigint', (column) => column.references('projects.id').onDelete('cascade'))
    .execute()

  await db
    .updateTable('asset_categories')
    .set({
      project_id: defaultProjectId,
      updated_at: new Date(),
    })
    .execute()

  await sql`alter table asset_categories alter column project_id set not null`.execute(db)
  await sql`alter table asset_categories drop constraint if exists asset_categories_name_key`.execute(db)

  await db.schema
    .createIndex('idx_asset_categories_project_id')
    .ifNotExists()
    .on('asset_categories')
    .column('project_id')
    .execute()
  await db.schema
    .createIndex('idx_asset_categories_project_name')
    .ifNotExists()
    .on('asset_categories')
    .columns(['project_id', 'name'])
    .unique()
    .execute()

  await db.schema
    .alterTable('assets')
    .addColumn('created_by_user_id', 'bigint', (column) => column.references('users.id').onDelete('restrict'))
    .addColumn('source_project_id', 'bigint', (column) => column.references('projects.id').onDelete('set null'))
    .execute()

  await db
    .updateTable('assets')
    .set({
      created_by_user_id: sql`user_id`,
      source_project_id: defaultProjectId,
      updated_at: new Date(),
    })
    .execute()

  await sql`alter table assets alter column created_by_user_id set not null`.execute(db)

  await db.schema.createIndex('idx_assets_created_by_user_id').ifNotExists().on('assets').column('created_by_user_id').execute()
  await db.schema.createIndex('idx_assets_source_project_id').ifNotExists().on('assets').column('source_project_id').execute()

  await db.schema
    .alterTable('video_tasks')
    .addColumn('project_id', 'bigint', (column) => column.references('projects.id').onDelete('restrict'))
    .execute()

  await db
    .updateTable('video_tasks')
    .set({
      project_id: defaultProjectId,
      updated_at: new Date(),
    })
    .execute()

  await sql`alter table video_tasks alter column project_id set not null`.execute(db)
  await db.schema.createIndex('idx_video_tasks_project_id').ifNotExists().on('video_tasks').column('project_id').execute()

  await sql`
    insert into project_members (project_id, user_id, project_role, status, created_by)
    select
      ${defaultProjectId},
      users.id,
      case when users.role = 'admin' then 'owner' else 'member' end,
      'active',
      case when users.role = 'admin' then users.id else null end
    from users
    on conflict do nothing
  `.execute(db)

  await sql`
    insert into project_assets (project_id, asset_id, category_id, relation_type, created_by)
    select
      ${defaultProjectId},
      assets.id,
      assets.category_id,
      'primary',
      assets.created_by_user_id
    from assets
    on conflict do nothing
  `.execute(db)

  await db.schema
    .createIndex('idx_project_members_project_user')
    .ifNotExists()
    .on('project_members')
    .columns(['project_id', 'user_id'])
    .unique()
    .execute()
  await db.schema.createIndex('idx_project_members_user_id').ifNotExists().on('project_members').column('user_id').execute()
  await db.schema
    .createIndex('idx_project_assets_project_asset')
    .ifNotExists()
    .on('project_assets')
    .columns(['project_id', 'asset_id'])
    .unique()
    .execute()
  await db.schema.createIndex('idx_project_assets_asset_id').ifNotExists().on('project_assets').column('asset_id').execute()
  await db.schema
    .createIndex('idx_video_task_assets_task_asset_role')
    .ifNotExists()
    .on('video_task_assets')
    .columns(['video_task_id', 'asset_id', 'role'])
    .unique()
    .execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropIndex('idx_video_task_assets_task_asset_role').ifExists().execute()
  await db.schema.dropIndex('idx_project_assets_asset_id').ifExists().execute()
  await db.schema.dropIndex('idx_project_assets_project_asset').ifExists().execute()
  await db.schema.dropIndex('idx_project_members_user_id').ifExists().execute()
  await db.schema.dropIndex('idx_project_members_project_user').ifExists().execute()
  await db.schema.dropIndex('idx_video_tasks_project_id').ifExists().execute()
  await db.schema.dropIndex('idx_assets_source_project_id').ifExists().execute()
  await db.schema.dropIndex('idx_assets_created_by_user_id').ifExists().execute()
  await db.schema.dropIndex('idx_asset_categories_project_name').ifExists().execute()
  await db.schema.dropIndex('idx_asset_categories_project_id').ifExists().execute()

  await sql`alter table video_tasks drop column if exists project_id`.execute(db)
  await sql`alter table assets drop column if exists source_project_id`.execute(db)
  await sql`alter table assets drop column if exists created_by_user_id`.execute(db)
  await sql`alter table asset_categories drop column if exists project_id`.execute(db)

  await db.schema.dropTable('video_task_assets').ifExists().execute()
  await db.schema.dropTable('project_assets').ifExists().execute()
  await db.schema.dropTable('project_members').ifExists().execute()
  await db.schema.dropTable('projects').ifExists().execute()
}
