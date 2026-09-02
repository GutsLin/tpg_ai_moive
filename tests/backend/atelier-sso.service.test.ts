import { Kysely, PostgresDialect } from 'kysely'
import { newDb } from 'pg-mem'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../backend/src/db/kysely'
import { up } from '../../backend/src/db/migrations/20260902120000_create_atelier_sso_tickets'
import { AtelierSsoService } from '../../backend/src/services/atelier-sso.service'
import type { UserRecord, UserRepository } from '../../backend/src/services/user.service'

describe('Atelier SSO one-time tickets', () => {
  let database: Kysely<Database>
  let user: UserRecord
  let service: AtelierSsoService

  beforeEach(async () => {
    const memoryDb = newDb()
    const { Pool } = memoryDb.adapters.createPg()
    database = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool() }) })
    await database.schema.createTable('users').addColumn('id', 'bigint', c => c.primaryKey()).execute()
    await database.insertInto('users').values({ id: 7 } as never).execute()
    await up(database)
    user = { id: 7, username: 'alice', passwordHash: 'unused', role: 'user', menuPerms: ['assets'], status: 1, createdAt: new Date(), updatedAt: new Date() }
    const repository = { findById: async () => user } as unknown as UserRepository
    service = new AtelierSsoService(repository, database)
  })

  afterEach(async () => database.destroy())

  it('binds server-side claims and rejects replay and tampering', async () => {
    const issued = await service.issue(7)
    const claims = await service.exchange(issued.ticket)
    expect(claims).toMatchObject({ issuer: 'narrix-main', audience: 'narrix-atelier', externalUserId: 7, username: 'alice', role: 'user' })
    await expect(service.exchange(issued.ticket)).rejects.toThrow('无效或已过期')
    await expect(service.exchange(`${issued.ticket}x`)).rejects.toThrow('无效或已过期')
  })

  it('rejects expired tickets and users disabled after issuance', async () => {
    const expired = await service.issue(7)
    await database.updateTable('atelier_sso_tickets').set({ expires_at: new Date(0) }).execute()
    await expect(service.exchange(expired.ticket)).rejects.toThrow('无效或已过期')
    const disabled = await service.issue(7)
    user = { ...user, status: 0 }
    await expect(service.exchange(disabled.ticket)).rejects.toThrow('已禁用')
  })
})
