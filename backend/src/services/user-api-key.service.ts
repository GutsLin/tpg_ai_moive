import { db } from '../db/kysely'
import { ConfigService } from './config.service'
import { NotFoundError, ValidationAppError } from '../utils/errors'

export interface UserApiKeyMasked {
  providerKey: string
  apiKeyMasked: string
  enabled: boolean
  updatedAt: Date
}

export interface UserApiKeyPlain {
  providerKey: string
  apiKey: string
  enabled: boolean
}

export type ApiKeyMode = 'global' | 'per_member'

export interface UserWithKeyStatus {
  userId: number
  username: string
  role: 'admin' | 'user'
  status: number
  providerKey: string
  hasKey: boolean
  apiKeyMasked: string
}

export interface BatchImportResult {
  total: number
  imported: number
  skipped: number
  errors: string[]
}

export class UserApiKeyService {
  public constructor(private readonly configService: ConfigService = new ConfigService()) {}

  public async getByUser(userId: number, providerKey: string): Promise<UserApiKeyPlain | null> {
    const row = await db
      .selectFrom('user_api_keys')
      .select(['provider_key', 'api_key_encrypted', 'enabled'])
      .where('user_id', '=', userId)
      .where('provider_key', '=', providerKey)
      .where('enabled', '=', true)
      .executeTakeFirst()

    if (!row) {
      return null
    }

    return {
      providerKey: row.provider_key,
      apiKey: this.decrypt(row.api_key_encrypted),
      enabled: row.enabled,
    }
  }

  public async getMaskedByUser(userId: number): Promise<{ items: UserApiKeyMasked[] }> {
    const rows = await db
      .selectFrom('user_api_keys')
      .select(['provider_key', 'api_key_encrypted', 'enabled', 'updated_at'])
      .where('user_id', '=', userId)
      .orderBy('provider_key', 'asc')
      .execute()

    return {
      items: rows.map((row) => ({
        providerKey: row.provider_key,
        apiKeyMasked: ConfigService.maskSecretValue(this.decrypt(row.api_key_encrypted)),
        enabled: row.enabled,
        updatedAt: new Date(row.updated_at),
      })),
    }
  }

  public async upsert(userId: number, keys: Array<{ providerKey: string; apiKey: string }>): Promise<void> {
    for (const key of keys) {
      const encrypted = this.configService.encryptSecret(key.apiKey.trim())
      await db
        .insertInto('user_api_keys')
        .values({
          user_id: userId,
          provider_key: key.providerKey.trim(),
          api_key_encrypted: encrypted,
          enabled: true,
        })
        .onConflict((oc) =>
          oc.columns(['user_id', 'provider_key']).doUpdateSet({
            api_key_encrypted: encrypted,
            enabled: true,
            updated_at: new Date(),
          })
        )
        .execute()
    }
  }

  public async delete(userId: number, providerKey: string): Promise<void> {
    await db
      .deleteFrom('user_api_keys')
      .where('user_id', '=', userId)
      .where('provider_key', '=', providerKey)
      .execute()
  }

  public async listAllUsersWithKeyStatus(providerKey: string): Promise<UserWithKeyStatus[]> {
    const users = await db
      .selectFrom('users')
      .select(['id', 'username', 'role', 'status'])
      .orderBy('id', 'asc')
      .execute()

    if (users.length === 0) {
      return []
    }

    const userIds = users.map((user) => Number(user.id))
    const keys = await db
      .selectFrom('user_api_keys')
      .select(['user_id', 'api_key_encrypted', 'enabled'])
      .where('user_id', 'in', userIds)
      .where('provider_key', '=', providerKey)
      .execute()

    const keyMap = new Map(
      keys.map((row) => [Number(row.user_id), row])
    )

    return users.map((user) => {
      const keyRow = keyMap.get(Number(user.id))
      return {
        userId: Number(user.id),
        username: user.username,
        role: user.role,
        status: user.status,
        providerKey,
        hasKey: Boolean(keyRow?.enabled),
        apiKeyMasked: keyRow ? ConfigService.maskSecretValue(this.decrypt(keyRow.api_key_encrypted)) : '',
      }
    })
  }

  public async batchImportApiKeys(
    providerKey: string,
    entries: Array<{ userId: number; apiKey: string }>
  ): Promise<BatchImportResult> {
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const entry of entries) {
      const trimmedKey = entry.apiKey.trim()
      if (!trimmedKey) {
        skipped++
        continue
      }

      const user = await db
        .selectFrom('users')
        .select('id')
        .where('id', '=', entry.userId)
        .executeTakeFirst()

      if (!user) {
        errors.push(`用户 ID ${entry.userId} 不存在，已跳过`)
        skipped++
        continue
      }

      await this.upsert(entry.userId, [{ providerKey, apiKey: trimmedKey }])
      imported++
    }

    return { total: entries.length, imported, skipped, errors }
  }

  public buildExportCsv(users: UserWithKeyStatus[]): string {
    const lines: string[] = []
    lines.push('用户ID,用户名,角色,状态,平台标识,API Key 状态,API Key(脱敏),API Key')

    for (const user of users) {
      const roleLabel = user.role === 'admin' ? '管理员' : '普通用户'
      const statusLabel = user.status === 1 ? '启用' : '禁用'
      const keyStatusLabel = user.hasKey ? '已配置' : '未配置'
      const maskedLabel = user.apiKeyMasked || ''

      appendCsvRow(lines, [
        user.userId,
        user.username,
        roleLabel,
        statusLabel,
        user.providerKey,
        keyStatusLabel,
        maskedLabel,
        '',
      ])
    }

    return `\uFEFF${lines.join('\r\n')}`
  }

  public parseImportCsv(csvText: string): Array<{ userId: number; username: string; providerKey: string; apiKey: string }> {
    const rows = parseCsv(csvText)
    if (rows.length < 2) {
      throw new ValidationAppError('CSV 文件至少需要一行表头和一行数据')
    }

    const headers = rows[0].map((header) => header.trim())
    const userIdIdx = headers.findIndex((header) => header.includes('用户ID') || header.toLowerCase().includes('user_id'))
    const usernameIdx = headers.findIndex((header) => header.includes('用户名') || header.toLowerCase().includes('username'))
    const apiKeyIdx = headers.findIndex((header) => header.includes('API Key') && !header.includes('状态') && !header.includes('脱敏'))
    const providerKeyIdx = headers.findIndex((header) => header.includes('平台标识') || header.toLowerCase().includes('provider_key'))

    if (userIdIdx === -1) {
      throw new ValidationAppError('CSV 缺少「用户ID」列')
    }
    if (apiKeyIdx === -1) {
      throw new ValidationAppError('CSV 缺少「API Key」列')
    }

    const defaultProviderKey = 'toapis'
    const entries: Array<{ userId: number; username: string; providerKey: string; apiKey: string }> = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) {
        continue
      }

      const userIdStr = row[userIdIdx]?.trim() ?? ''
      const userId = Number(userIdStr)
      if (!Number.isFinite(userId) || userId <= 0) {
        continue
      }

      const username = usernameIdx >= 0 ? (row[usernameIdx]?.trim() ?? '') : ''
      const providerKey = providerKeyIdx >= 0 ? (row[providerKeyIdx]?.trim() || defaultProviderKey) : defaultProviderKey
      const apiKey = row[apiKeyIdx]?.trim() ?? ''

      entries.push({ userId, username, providerKey, apiKey })
    }

    return entries
  }

  public async resolveApiKey(
    userId: number,
    providerKey: string,
    mode: ApiKeyMode
  ): Promise<{ apiKey: string; source: 'personal' | 'global' } | null> {
    if (mode === 'global') {
      return null
    }

    const userKey = await this.getByUser(userId, providerKey)
    if (userKey) {
      return { apiKey: userKey.apiKey, source: 'personal' }
    }

    return null
  }

  public async getApiKeyMode(): Promise<ApiKeyMode> {
    const value = await this.configService.getOptional('api_key_mode')
    return value === 'per_member' ? 'per_member' : 'global'
  }

  public async setApiKeyMode(mode: ApiKeyMode): Promise<void> {
    await this.configService.updateMany([{ key: 'api_key_mode', value: mode }])
  }

  private decrypt(value: string): string {
    try {
      return this.configService.decryptSecret(value)
    } catch {
      return value
    }
  }
}

const neutralizeSpreadsheetFormula = (value: string): string =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value

const escapeCsv = (value: unknown): string => {
  const raw = String(value ?? '')
  const normalized = neutralizeSpreadsheetFormula(raw)

  if (normalized.includes(',') || normalized.includes('"') || normalized.includes('\n')) {
    return `"${normalized.replace(/"/g, '""')}"`
  }

  return normalized
}

const appendCsvRow = (lines: string[], values: unknown[]): void => {
  lines.push(values.map(escapeCsv).join(','))
}

const parseCsv = (csvText: string): string[][] => {
  const text = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentValue += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        currentValue += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        currentRow.push(currentValue)
        currentValue = ''
      } else if (char === '\n') {
        currentRow.push(currentValue)
        rows.push(currentRow)
        currentRow = []
        currentValue = ''
      } else {
        currentValue += char
      }
    }
  }

  if (currentValue !== '' || currentRow.length > 0) {
    currentRow.push(currentValue)
    rows.push(currentRow)
  }

  return rows.filter((row) => row.length > 0 && !(row.length === 1 && row[0].trim() === ''))
}
