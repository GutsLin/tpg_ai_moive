import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

const LEGACY_DEFAULT_PROJECT_CODE = 'legacy-default'
const STALE_DEFAULT_PROJECT_CODE = 'default'

const tableExists = async (db: Kysely<Database>, tableName: string): Promise<boolean> => {
  const result = await sql<{ exists: boolean }>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${tableName}
    ) as "exists"
  `.execute(db)

  return Boolean(result.rows[0]?.exists)
}

const columnExists = async (db: Kysely<Database>, tableName: string, columnName: string): Promise<boolean> => {
  const result = await sql<{ exists: boolean }>`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
    ) as "exists"
  `.execute(db)

  return Boolean(result.rows[0]?.exists)
}

const findProjectIdByCode = async (db: Kysely<Database>, code: string): Promise<number | null> => {
  if (!(await tableExists(db, 'projects'))) {
    return null
  }

  const row = await db.selectFrom('projects').select('id').where('code', '=', code).executeTakeFirst()
  return row ? Number(row.id) : null
}

const countForProject = async (db: Kysely<Database>, query: ReturnType<typeof sql>): Promise<number> => {
  const result = await query.execute(db)
  const row = result.rows[0] as { count?: number | string } | undefined
  return Number(row?.count ?? 0)
}

const projectHasLiveReferences = async (db: Kysely<Database>, projectId: number): Promise<boolean> => {
  if ((await tableExists(db, 'project_members')) && (await countForProject(db, sql`
    select count(*)::int as count
    from project_members
    where project_id = ${projectId}
  `)) > 0) {
    return true
  }

  if ((await tableExists(db, 'project_assets')) && (await countForProject(db, sql`
    select count(*)::int as count
    from project_assets
    where project_id = ${projectId}
  `)) > 0) {
    return true
  }

  if ((await tableExists(db, 'asset_categories')) &&
    (await columnExists(db, 'asset_categories', 'project_id')) &&
    (await countForProject(db, sql`
      select count(*)::int as count
      from asset_categories
      where project_id = ${projectId}
    `)) > 0) {
    return true
  }

  if ((await tableExists(db, 'assets')) &&
    (await columnExists(db, 'assets', 'source_project_id')) &&
    (await countForProject(db, sql`
      select count(*)::int as count
      from assets
      where source_project_id = ${projectId}
    `)) > 0) {
    return true
  }

  if ((await tableExists(db, 'video_tasks')) &&
    (await columnExists(db, 'video_tasks', 'project_id')) &&
    (await countForProject(db, sql`
      select count(*)::int as count
      from video_tasks
      where project_id = ${projectId}
    `)) > 0) {
    return true
  }

  return false
}

const deleteProjectIfOrphan = async (db: Kysely<Database>, projectId: number | null): Promise<void> => {
  if (!projectId || (await projectHasLiveReferences(db, projectId))) {
    return
  }

  await db.deleteFrom('projects').where('id', '=', projectId).execute()
}

export const up = async (db: Kysely<Database>): Promise<void> => {
  if (!(await tableExists(db, 'projects'))) {
    return
  }

  const legacyDefaultProjectId = await findProjectIdByCode(db, LEGACY_DEFAULT_PROJECT_CODE)
  const staleDefaultProjectId = await findProjectIdByCode(db, STALE_DEFAULT_PROJECT_CODE)

  if ((await tableExists(db, 'assets')) && (await columnExists(db, 'assets', 'project_id'))) {
    if (legacyDefaultProjectId && staleDefaultProjectId) {
      await sql`
        update assets
        set project_id = ${legacyDefaultProjectId}
        where project_id = ${staleDefaultProjectId}
      `.execute(db)
    }

    await sql`drop index if exists idx_assets_project_id`.execute(db)
    await sql`alter table assets drop column if exists project_id`.execute(db)
  }

  await deleteProjectIfOrphan(db, staleDefaultProjectId)
  await deleteProjectIfOrphan(db, legacyDefaultProjectId)
}

export const down = async (): Promise<void> => {
  // Irreversible cleanup migration. Removed bootstrap data is not reconstructed on downgrade.
}
