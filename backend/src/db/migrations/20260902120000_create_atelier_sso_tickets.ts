import { sql, type Kysely } from 'kysely'
import type { Database } from '../kysely'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.createTable('atelier_sso_tickets').ifNotExists()
    .addColumn('jti', 'varchar(64)', c => c.primaryKey())
    .addColumn('ticket_hash', 'varchar(128)', c => c.notNull().unique())
    .addColumn('issuer', 'varchar(128)', c => c.notNull())
    .addColumn('audience', 'varchar(128)', c => c.notNull())
    .addColumn('external_user_id', 'bigint', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('username', 'varchar(64)', c => c.notNull())
    .addColumn('display_name', 'varchar(128)', c => c.notNull())
    .addColumn('user_status', 'smallint', c => c.notNull())
    .addColumn('role', 'varchar(16)', c => c.notNull())
    .addColumn('issued_at', 'timestamptz', c => c.notNull())
    .addColumn('expires_at', 'timestamptz', c => c.notNull())
    .addColumn('consumed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema.createIndex('idx_atelier_sso_tickets_expiry').ifNotExists().on('atelier_sso_tickets').column('expires_at').execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropIndex('idx_atelier_sso_tickets_expiry').ifExists().execute()
  await db.schema.dropTable('atelier_sso_tickets').ifExists().execute()
}
