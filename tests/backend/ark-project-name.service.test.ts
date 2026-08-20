import { describe, expect, it } from 'vitest'

import { ArkProjectNameService } from '../../backend/src/services/ark-project-name.service'

describe('ArkProjectNameService', () => {
  it('固定默认值模式下返回配置中的 ProjectName', async () => {
    const service = new ArkProjectNameService(
      {
        getOptional: async (key: string) => {
          if (key === 'ark_project_name_mode') return 'default_value'
          if (key === 'ark_project_name_default_value') return 'xcyj'
          return null
        },
      } as any,
      {
        findProjectCode: async () => 'PRJ-001',
      }
    )

    await expect(service.resolve(101)).resolves.toBe('xcyj')
  })

  it('项目编码模式下返回当前项目编码', async () => {
    const service = new ArkProjectNameService(
      {
        getOptional: async (key: string) => {
          if (key === 'ark_project_name_mode') return 'project_code'
          if (key === 'ark_project_name_default_value') return 'xcyj'
          return null
        },
      } as any,
      {
        findProjectCode: async (projectId: number) => (projectId === 101 ? 'comic-drama' : null),
      }
    )

    await expect(service.resolve(101)).resolves.toBe('comic-drama')
  })
})
