import { sql, type Kysely } from 'kysely'

import type { Database } from '../kysely'

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

export const up = async (db: Kysely<Database>): Promise<void> => {
  if (!(await tableExists(db, 'project_members')) || !(await columnExists(db, 'project_members', 'project_role'))) {
    return
  }

  await sql`
    update project_members
    set project_role = 'manager'
    where project_role = 'owner'
  `.execute(db)
}

export const down = async (): Promise<void> => {
  // Irreversible data migration. Historical owner rows are folded into manager.
}
