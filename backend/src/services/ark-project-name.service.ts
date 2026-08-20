import { ConfigService } from './config.service'

export type ArkProjectNameMode = 'project_code' | 'default_value'

export interface ArkProjectCodeResolver {
  findProjectCode(projectId: number): Promise<string | null>
}

export class ArkProjectNameService {
  public constructor(
    private readonly configService: ConfigService = new ConfigService(),
    private readonly projectCodeResolver?: ArkProjectCodeResolver
  ) {}

  public async resolve(projectId?: number | null): Promise<string | undefined> {
    const mode = await this.getMode()

    if (mode === 'default_value') {
      const defaultValue = (await this.configService.getOptional('ark_project_name_default_value'))?.trim()
      return defaultValue || undefined
    }

    if (!projectId || !this.projectCodeResolver) {
      return undefined
    }

    const projectCode = (await this.projectCodeResolver.findProjectCode(projectId))?.trim()
    return projectCode || undefined
  }

  private async getMode(): Promise<ArkProjectNameMode> {
    const rawValue = (await this.configService.getOptional('ark_project_name_mode'))?.trim()
    return rawValue === 'default_value' ? 'default_value' : 'project_code'
  }
}
