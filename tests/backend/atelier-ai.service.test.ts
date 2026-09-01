import { describe, expect, it } from 'vitest'

import { AtelierAiService } from '../../backend/src/services/atelier-ai.service'
import { ConfigService, type ConfigStore, type StoredConfigEntry } from '../../backend/src/services/config.service'

class MemoryConfigStore implements ConfigStore {
  public constructor(private readonly entries: StoredConfigEntry[]) {}
  public async getByKey(key: string) { return this.entries.find((entry) => entry.key === key) ?? null }
  public async list() { return [...this.entries] }
  public async upsert(entries: StoredConfigEntry[]) { this.entries.splice(0, this.entries.length, ...entries) }
}

describe('AtelierAiService', () => {
  it('returns image/audio disabled and video disabled by default without exposing endpoint or keys', async () => {
    const config = new ConfigService({ store: new MemoryConfigStore([]), encryptionSecret: 'test-only' })
    const result = await new AtelierAiService(config, { getActiveForPublic: async () => { throw new Error('must not be called') } }).getCapabilities()
    expect(result.items).toEqual([
      expect.objectContaining({ mediaType: 'image', enabled: false, models: [] }),
      expect.objectContaining({ mediaType: 'video', enabled: false, models: [] }),
      expect.objectContaining({ mediaType: 'audio', enabled: false, models: [] }),
    ])
    expect(JSON.stringify(result)).not.toMatch(/endpoint|apiKey|secret/i)
  })

  it('exposes only sanitized video capabilities when the existing project flag is enabled', async () => {
    const config = new ConfigService({
      store: new MemoryConfigStore([{ key: 'infinite_atelier_video_enabled', value: 'true', isSecret: false, description: null }]),
      encryptionSecret: 'test-only',
    })
    const result = await new AtelierAiService(config, {
      getActiveForPublic: async () => ({
        providerKey: 'existing-video',
        name: 'Existing video service',
        providerType: 'toapis',
        referenceLimits: { image: 1, video: 1, audio: 1 },
        capabilities: {
          version: 1,
          models: [{ id: 'model-1', label: 'Model 1', operations: ['generate'], supports: { referenceImage: true } }],
        },
      }),
    }).getCapabilities()
    const video = result.items.find((item) => item.mediaType === 'video')
    expect(video).toMatchObject({ enabled: true, providerKey: 'existing-video', models: [{ id: 'model-1' }] })
    expect(JSON.stringify(video)).not.toMatch(/endpoint|apiKey|secret/i)
  })
})
