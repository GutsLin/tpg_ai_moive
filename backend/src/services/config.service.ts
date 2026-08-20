import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { db } from '../db/kysely'
import type { OssServiceContract } from './oss.service'
import { AppError } from '../utils/errors'

export interface StoredConfigEntry {
  key: string
  value: string
  isSecret: boolean
  description: string | null
}

export interface ConfigStore {
  getByKey(key: string): Promise<StoredConfigEntry | null>
  list(): Promise<StoredConfigEntry[]>
  upsert(entries: StoredConfigEntry[]): Promise<void>
}

interface ConfigServiceOptions {
  store?: ConfigStore
  cacheTtlMs?: number
  now?: () => number
  encryptionSecret?: string
}

interface CachedConfigValue {
  value: string
  expiresAt: number
}

export interface ConfigListEntry {
  key: string
  value: string
  isSecret: boolean
  description: string | null
}

export interface PublicBrandingConfig {
  systemName: string
  logoUrl: string | null
}

export class ConfigNotFoundError extends AppError {
  public constructor(key: string) {
    super(500, 500, `配置项不存在: ${key}`)
  }
}

class KyselyConfigStore implements ConfigStore {
  public async getByKey(key: string): Promise<StoredConfigEntry | null> {
    const row = await db
      .selectFrom('system_config')
      .select(['key', 'value', 'is_secret', 'description'])
      .where('key', '=', key)
      .executeTakeFirst()

    if (!row) {
      return null
    }

    return {
      key: row.key,
      value: row.value,
      isSecret: row.is_secret,
      description: row.description,
    }
  }

  public async list(): Promise<StoredConfigEntry[]> {
    const rows = await db
      .selectFrom('system_config')
      .select(['key', 'value', 'is_secret', 'description'])
      .orderBy('key', 'asc')
      .execute()

    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      isSecret: row.is_secret,
      description: row.description,
    }))
  }

  public async upsert(entries: StoredConfigEntry[]): Promise<void> {
    for (const entry of entries) {
      await db
        .insertInto('system_config')
        .values({
          key: entry.key,
          value: entry.value,
          is_secret: entry.isSecret,
          description: entry.description,
        })
        .onConflict((oc) =>
          oc.column('key').doUpdateSet({
            value: entry.value,
            is_secret: entry.isSecret,
            description: entry.description,
            updated_at: new Date(),
          })
        )
        .execute()
    }
  }
}

const buildEncryptionKey = (secret: string): Buffer => {
  return createHash('sha256').update(secret).digest()
}

export class ConfigService {
  private static readonly sharedCache = new Map<string, CachedConfigValue>()
  private static readonly defaultSystemName = 'Narrix'
  private readonly store: ConfigStore
  private readonly cacheTtlMs: number
  private readonly now: () => number
  private readonly encryptionSecret: string

  public constructor(options: ConfigServiceOptions = {}) {
    this.store = options.store ?? new KyselyConfigStore()
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000
    this.now = options.now ?? Date.now
    this.encryptionSecret = options.encryptionSecret ?? process.env.CONFIG_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'dev-config-secret'
  }

  public async getRequired(key: string): Promise<string> {
    const cached = ConfigService.sharedCache.get(key)
    if (cached && cached.expiresAt > this.now()) {
      return cached.value
    }

    const entry = await this.store.getByKey(key)
    if (!entry) {
      throw new ConfigNotFoundError(key)
    }

    const resolvedValue = entry.isSecret
      ? ConfigService.decryptSecretValue(entry.value, this.encryptionSecret)
      : entry.value

    ConfigService.sharedCache.set(key, {
      value: resolvedValue,
      expiresAt: this.now() + this.cacheTtlMs,
    })

    return resolvedValue
  }

  public async getOptional(key: string): Promise<string | null> {
    const cached = ConfigService.sharedCache.get(key)
    if (cached && cached.expiresAt > this.now()) {
      return cached.value
    }

    const entry = await this.store.getByKey(key)
    if (!entry) {
      return null
    }

    const resolvedValue = entry.isSecret
      ? ConfigService.decryptSecretValue(entry.value, this.encryptionSecret)
      : entry.value

    ConfigService.sharedCache.set(key, {
      value: resolvedValue,
      expiresAt: this.now() + this.cacheTtlMs,
    })

    return resolvedValue
  }

  public clearConfigCache(key?: string): void {
    if (key) {
      ConfigService.sharedCache.delete(key)
      return
    }

    ConfigService.sharedCache.clear()
  }

  public encryptSecret(plainText: string): string {
    return ConfigService.encryptSecretValue(plainText, this.encryptionSecret)
  }

  public decryptSecret(encryptedValue: string): string {
    return ConfigService.decryptSecretValue(encryptedValue, this.encryptionSecret)
  }

  public async listForAdmin(): Promise<{ items: ConfigListEntry[] }> {
    const entries = await this.store.list()

    return {
      items: entries.map((entry) => ({
        key: entry.key,
        value: entry.isSecret ? ConfigService.maskSecretValue(ConfigService.decryptSecretValue(entry.value, this.encryptionSecret)) : entry.value,
        isSecret: entry.isSecret,
        description: entry.description,
      })),
    }
  }

  public async getPublicBranding(ossService: OssServiceContract): Promise<PublicBrandingConfig> {
    const configuredSystemName = (await this.getOptional('system_name'))?.trim()
    const configuredLogoKey = (await this.getOptional('system_logo_key'))?.trim()

    let logoUrl: string | null = null
    if (configuredLogoKey) {
      try {
        logoUrl = await ossService.getSignedUrl(configuredLogoKey)
      } catch {
        logoUrl = null
      }
    }

    return {
      systemName: configuredSystemName || ConfigService.defaultSystemName,
      logoUrl,
    }
  }

  public async updateMany(items: Array<{ key: string; value: string }>): Promise<void> {
    const existingEntries = await this.store.list()
    const entryMap = new Map(existingEntries.map((entry) => [entry.key, entry]))

    const nextEntries = items.map((item) => {
      const currentEntry = entryMap.get(item.key)
      if (!currentEntry) {
        throw new ConfigNotFoundError(item.key)
      }

      return {
        ...currentEntry,
        value: currentEntry.isSecret
          ? ConfigService.encryptSecretValue(item.value, this.encryptionSecret)
          : item.value,
      }
    })

    await this.store.upsert(nextEntries)
    this.clearConfigCache()
  }

  public static encryptSecretValue(plainText: string, secret: string): string {
    const iv = randomBytes(12)
    const key = buildEncryptionKey(secret)
    const cipher = createCipheriv('aes-256-gcm', key, iv)

    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return ['enc-v1', iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':')
  }

  public static decryptSecretValue(encryptedValue: string, secret: string): string {
    const [version, iv, authTag, payload] = encryptedValue.split(':')
    if (version !== 'enc-v1' || !iv || !authTag || !payload) {
      throw new AppError(500, 500, '配置解密失败')
    }

    const key = buildEncryptionKey(secret)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(authTag, 'base64'))

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload, 'base64')),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  }

  public static maskSecretValue(value: string): string {
    const suffix = value.slice(-4)
    if (value.startsWith('sk-')) {
      return `sk-****${suffix}`
    }

    return `****${suffix}`
  }
}
