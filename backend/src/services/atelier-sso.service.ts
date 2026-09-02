import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { db, type Database } from '../db/kysely'
import type { Kysely } from 'kysely'
import { UnauthorizedError } from '../utils/errors'
import { appLogger } from '../utils/logger'
import type { UserRepository, UserRecord } from './user.service'

export interface AtelierSsoClaims {
  issuer: string
  audience: string
  externalUserId: number
  username: string
  displayName: string
  userStatus: number
  role: 'admin' | 'user'
  issuedAt: string
  expiresAt: string
  jti: string
}

const hashTicket = (ticket: string) => createHash('sha256').update(ticket).digest('hex')
const issuer = () => process.env.ATELIER_SSO_ISSUER || 'narrix-main'
const audience = () => process.env.ATELIER_SSO_AUDIENCE || 'narrix-atelier'
const ttlSeconds = () => Math.min(60, Math.max(30, Number(process.env.ATELIER_SSO_TTL_SECONDS || 45)))
const issueCounters = new Map<number, { count: number; resetAt: number }>()

export class AtelierSsoService {
  public constructor(
    private readonly userRepository: UserRepository,
    private readonly database: Kysely<Database> = db
  ) {}

  public async issue(userId: number): Promise<{ ticket: string; expiresAt: string }> {
    const nowMs = Date.now(); const current = issueCounters.get(userId)
    if (current && current.resetAt > nowMs && current.count >= 10) throw new UnauthorizedError('SSO 请求过于频繁，请稍后重试')
    issueCounters.set(userId, current && current.resetAt > nowMs ? { count: current.count + 1, resetAt: current.resetAt } : { count: 1, resetAt: nowMs + 60_000 })
    const user = await this.userRepository.findById(userId)
    if (!user || user.status !== 1) throw new UnauthorizedError('当前用户不存在或已禁用')
    const now = new Date()
    const expires = new Date(now.getTime() + ttlSeconds() * 1000)
    const ticket = randomBytes(32).toString('base64url')
    const claims: AtelierSsoClaims = {
      issuer: issuer(), audience: audience(), externalUserId: Number(user.id), username: user.username,
      displayName: user.username, userStatus: user.status, role: user.role,
      issuedAt: now.toISOString(), expiresAt: expires.toISOString(), jti: randomUUID(),
    }
    await this.database.insertInto('atelier_sso_tickets').values({
      jti: claims.jti, ticket_hash: hashTicket(ticket), issuer: claims.issuer, audience: claims.audience,
      external_user_id: claims.externalUserId, username: claims.username, display_name: claims.displayName,
      user_status: claims.userStatus, role: claims.role, issued_at: now, expires_at: expires, consumed_at: null,
    }).execute()
    appLogger.info({ action: 'atelier.sso.issue', userId, jti: claims.jti }, 'atelier sso audit')
    return { ticket, expiresAt: claims.expiresAt }
  }

  public async exchange(ticket: string): Promise<AtelierSsoClaims> {
    if (!ticket || ticket.length > 256) throw new UnauthorizedError('SSO 票据无效')
    const row = await this.database.selectFrom('atelier_sso_tickets').selectAll().where('ticket_hash', '=', hashTicket(ticket)).executeTakeFirst()
    if (!row || row.consumed_at || new Date(row.expires_at) <= new Date()) throw new UnauthorizedError('SSO 票据无效或已过期')
    const consumed = await this.database.updateTable('atelier_sso_tickets').set({ consumed_at: new Date() }).where('jti', '=', row.jti).where('consumed_at', 'is', null).where('expires_at', '>', new Date()).executeTakeFirst()
    if (!consumed || Number(consumed.numUpdatedRows) !== 1) throw new UnauthorizedError('SSO 票据已使用')
    const user = await this.userRepository.findById(Number(row.external_user_id))
    if (!user || user.status !== 1) throw new UnauthorizedError('主项目用户已禁用')
    appLogger.info({ action: 'atelier.sso.exchange', userId: user.id, jti: row.jti }, 'atelier sso audit')
    return this.toClaims(row, user)
  }

  public async revokeUserTickets(userId: number): Promise<void> {
    await this.database.updateTable('atelier_sso_tickets').set({ consumed_at: new Date() }).where('external_user_id', '=', userId).where('consumed_at', 'is', null).execute()
  }

  public async status(externalUserId: number): Promise<{ active: boolean; username?: string; role?: 'admin' | 'user' }> {
    const user = await this.userRepository.findById(externalUserId)
    return user && user.status === 1
      ? { active: true, username: user.username, role: user.role }
      : { active: false }
  }

  private toClaims(row: any, user: UserRecord): AtelierSsoClaims {
    return { issuer: row.issuer, audience: row.audience, externalUserId: Number(user.id), username: user.username, displayName: user.username, userStatus: user.status, role: user.role, issuedAt: new Date(row.issued_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(), jti: row.jti }
  }

  public static serviceSecretValid(value: string | undefined): boolean {
    const expected = process.env.ATELIER_SSO_SERVICE_SECRET
    if (!expected || !value) return false
    const left = Buffer.from(value); const right = Buffer.from(expected)
    return left.length === right.length && timingSafeEqual(left, right)
  }
}
