import { sql, Kysely, PostgresDialect } from 'kysely'
import { newDb } from 'pg-mem'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '../../backend/src/db/kysely'
import { KyselyUserRepository } from '../../backend/src/services/user.service'

describe('KyselyUserRepository', () => {
  let database: Kysely<Database>
  let repository: KyselyUserRepository

  beforeEach(async () => {
    const memoryDb = newDb()
    const { Pool } = memoryDb.adapters.createPg()

    database = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool(),
      }),
    })

    await database.schema
      .createTable('users')
      .addColumn('id', 'bigserial', (column) => column.primaryKey())
      .addColumn('username', 'varchar(64)', (column) => column.notNull().unique())
      .addColumn('password_hash', 'varchar(128)', (column) => column.notNull())
      .addColumn('role', 'varchar(16)', (column) => column.notNull().defaultTo('user'))
      .addColumn('menu_perms', 'jsonb', (column) => column.notNull().defaultTo(sql`'[]'::jsonb`))
      .addColumn('status', 'smallint', (column) => column.notNull().defaultTo(1))
      .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
      .execute()

    repository = new KyselyUserRepository(database)
  })

  afterEach(async () => {
    await database.destroy()
  })

  it('create 和 update 会把 menuPerms 正确写入 jsonb', async () => {
    const created = await repository.create({
      username: 'producer',
      passwordHash: 'hashed-password',
      role: 'user',
      menuPerms: ['assets', 'videos'],
      status: 1,
    })

    expect(created.menuPerms).toEqual(['assets', 'videos'])

    const updated = await repository.update(created.id, {
      menuPerms: ['assets', 'config'],
    })

    expect(updated?.menuPerms).toEqual(['assets', 'config'])
  })
})
