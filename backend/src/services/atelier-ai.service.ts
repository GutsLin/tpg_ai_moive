import type { ConfigService } from './config.service'
import { VideoProviderService, type ActiveVideoProviderResponse } from './video-provider.service'

export type AtelierMediaType = 'image' | 'video' | 'audio'
export type AtelierAiOperation = 'image.generate' | 'image.edit' | 'video.generate' | 'audio.generate'

export interface AtelierAiCapability {
  mediaType: AtelierMediaType
  enabled: boolean
  operations: AtelierAiOperation[]
  providerKey: string | null
  providerName: string | null
  models: Array<{
    id: string
    label: string
    operations: string[]
    supports: Record<string, boolean | undefined>
  }>
}

export interface AtelierVideoProviderPort {
  getActiveForPublic(): Promise<ActiveVideoProviderResponse>
}

const disabledCapability = (mediaType: AtelierMediaType, operations: AtelierAiOperation[]): AtelierAiCapability => ({
  mediaType,
  enabled: false,
  operations,
  providerKey: null,
  providerName: null,
  models: [],
})

export class AtelierAiService {
  public constructor(
    private readonly configService: ConfigService,
    private readonly videoProviderService: AtelierVideoProviderPort = new VideoProviderService(configService)
  ) {}

  public async getCapabilities(): Promise<{ items: AtelierAiCapability[] }> {
    const image = disabledCapability('image', ['image.generate', 'image.edit'])
    const audio = disabledCapability('audio', ['audio.generate'])
    const videoFlag = (await this.configService.getOptional('infinite_atelier_video_enabled')) === 'true'
    if (!videoFlag) return { items: [image, disabledCapability('video', ['video.generate']), audio] }

    try {
      const provider = await this.videoProviderService.getActiveForPublic()
      const video: AtelierAiCapability = {
        mediaType: 'video',
        enabled: true,
        operations: ['video.generate'],
        providerKey: provider.providerKey,
        providerName: provider.name,
        models: provider.capabilities.models.map((model) => ({
          id: model.id,
          label: model.label,
          operations: [...model.operations],
          supports: { ...model.supports },
        })),
      }
      return { items: [image, video, audio] }
    } catch {
      return { items: [image, disabledCapability('video', ['video.generate']), audio] }
    }
  }
}
