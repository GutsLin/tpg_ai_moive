import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { createApp } from '../../backend/src/app'
import type {
  SetupArkAssetGroupItem,
  SetupInitializePayload,
  SetupServiceContract,
  SetupStatusResult,
  SetupValidateArkAkskPayload,
  SetupValidateArkBearerPayload,
  SetupValidateOssPayload,
  SetupValidationResult,
} from '../../backend/src/services/setup.service'

const validArkGroupId = 'group-1712300000000-abcd1234'

class FakeSetupService implements SetupServiceContract {
  public initialized = false
  public initializeCalls: SetupInitializePayload[] = []
  public validateOssCalls: SetupValidateOssPayload[] = []
  public validateArkBearerCalls: SetupValidateArkBearerPayload[] = []
  public validateArkAkskCalls: SetupValidateArkAkskPayload[] = []
  public listArkAssetGroupsCalls: SetupValidateArkAkskPayload[] = []
  public createArkAssetGroupCalls: Array<SetupValidateArkAkskPayload & { name: string; description?: string }> = []
  public readonly arkGroups: SetupArkAssetGroupItem[] = [{ id: validArkGroupId, name: '默认素材组', description: null }]

  public async getStatus(): Promise<SetupStatusResult> {
    return {
      initialized: this.initialized,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: this.initialized ? '2026-04-04T10:00:00.000Z' : null,
      branding: {
        systemName: 'Narrix',
      },
      health: {
        database: true,
        redis: true,
      },
    }
  }

  public async initialize(payload: SetupInitializePayload): Promise<void> {
    this.initializeCalls.push(payload)
    this.initialized = true
  }

  public async validateOss(payload: SetupValidateOssPayload): Promise<SetupValidationResult> {
    this.validateOssCalls.push(payload)
    return {
      key: 'oss',
      valid: true,
      canContinue: true,
      message: 'OSS 配置校验通过',
    }
  }

  public async validateArkBearer(payload: SetupValidateArkBearerPayload): Promise<SetupValidationResult> {
    this.validateArkBearerCalls.push(payload)
    return {
      key: 'arkBearer',
      valid: false,
      canContinue: true,
      message: '火山视频配置校验失败，请检查 Bearer Token 与 Endpoint 是否正确',
    }
  }

  public async validateArkAksk(payload: SetupValidateArkAkskPayload): Promise<SetupValidationResult> {
    this.validateArkAkskCalls.push(payload)
    return {
      key: 'arkAksk',
      valid: true,
      canContinue: true,
      message: '火山素材资产库配置校验通过',
    }
  }

  public async listArkAssetGroups(payload: SetupValidateArkAkskPayload): Promise<{ items: SetupArkAssetGroupItem[] }> {
    this.listArkAssetGroupsCalls.push(payload)
    return {
      items: this.arkGroups,
    }
  }

  public async createArkAssetGroup(
    payload: SetupValidateArkAkskPayload & { name: string; description?: string }
  ): Promise<SetupArkAssetGroupItem> {
    this.createArkAssetGroupCalls.push(payload)
    return {
      id: `group-created-${payload.name}`,
      name: payload.name,
      description: payload.description ?? null,
    }
  }
}

describe('/api/setup 与安装态路由守卫', () => {
  it('未安装时 setup 接口和 /health 可用，业务接口被拦截', async () => {
    const setupService = new FakeSetupService()
    const app = createApp({
      setupService,
    })

    const healthResponse = await request(app.callback()).get('/health')
    const statusResponse = await request(app.callback()).get('/api/setup/status')
    const authResponse = await request(app.callback()).post('/api/auth/login').send({
      username: 'admin',
      password: 'pass1234',
    })

    expect(healthResponse.status).toBe(200)
    expect(statusResponse.status).toBe(200)
    expect(statusResponse.body.data.initialized).toBe(false)
    expect(authResponse.status).toBe(403)
    expect(authResponse.body.code).toBe(403)
  })

  it('初始化接口成功后切换为运行态', async () => {
    const setupService = new FakeSetupService()
    const app = createApp({
      setupService,
    })

    const initializeResponse = await request(app.callback()).post('/api/setup/initialize').send({
      admin: {
        username: 'narrix-admin',
        password: 'pass12345',
      },
      config: {
        systemName: 'Narrix',
        arkApiKey: 'sk-ark',
        arkAccessKey: 'ak-001',
        arkSecretKey: 'sk-001',
        arkEndpoint: 'https://ark.example.com/api/v3',
        arkDefaultGroupId: validArkGroupId,
        arkDefaultSyncEnabled: true,
        ossAccessKeyId: 'oss-ak',
        ossAccessKeySecret: 'oss-sk',
        ossStsRoleArn: 'acs:ram::123:role/narrix',
        ossBucket: 'narrix-assets',
        ossRegion: 'oss-cn-shanghai',
        ossSignedUrlTtl: 3600,
      },
    })

    const statusResponse = await request(app.callback()).get('/api/setup/status')

    expect(initializeResponse.status).toBe(200)
    expect(initializeResponse.body.data.success).toBe(true)
    expect(setupService.initializeCalls).toHaveLength(1)
    expect(statusResponse.body.data.initialized).toBe(true)
  })

  it('校验接口返回统一结构并支持 422 参数错误', async () => {
    const setupService = new FakeSetupService()
    const app = createApp({
      setupService,
    })

    const ossResponse = await request(app.callback())
      .post('/api/setup/validate/oss')
      .set('Origin', 'http://localhost:28080')
      .send({
        accessKeyId: 'oss-ak',
        accessKeySecret: 'oss-sk',
        bucket: 'narrix-assets',
        region: 'oss-cn-shanghai',
        stsRoleArn: 'acs:ram::123:role/narrix',
      })
    const bearerResponse = await request(app.callback()).post('/api/setup/validate/ark-bearer').send({
      apiKey: 'sk-ark',
      endpoint: 'https://ark.example.com/api/v3',
    })
    const akskResponse = await request(app.callback()).post('/api/setup/validate/ark-aksk').send({
      accessKey: 'ak-001',
      secretKey: 'sk-001',
    })
    const invalidResponse = await request(app.callback()).post('/api/setup/validate/oss').send({
      accessKeyId: '',
    })

    expect(ossResponse.status).toBe(200)
    expect(ossResponse.body.data).toEqual({
      key: 'oss',
      valid: true,
      canContinue: true,
      message: 'OSS 配置校验通过',
    })
    expect(bearerResponse.status).toBe(200)
    expect(bearerResponse.body.data.key).toBe('arkBearer')
    expect(akskResponse.status).toBe(200)
    expect(akskResponse.body.data.key).toBe('arkAksk')
    expect(setupService.validateOssCalls).toHaveLength(1)
    expect(setupService.validateOssCalls[0]).toMatchObject({
      bucket: 'narrix-assets',
      frontendOrigin: 'http://localhost:28080',
    })
    expect(setupService.validateArkBearerCalls).toHaveLength(1)
    expect(setupService.validateArkAkskCalls).toHaveLength(1)
    expect(invalidResponse.status).toBe(422)
    expect(invalidResponse.body.code).toBe(422)
  })

  it('支持在 Setup 中加载已有火山素材组并创建新素材组', async () => {
    const setupService = new FakeSetupService()
    const app = createApp({
      setupService,
    })

    const listResponse = await request(app.callback()).post('/api/setup/ark/asset-groups/list').send({
      accessKey: 'ak-001',
      secretKey: 'sk-001',
    })
    const createResponse = await request(app.callback()).post('/api/setup/ark/asset-groups').send({
      accessKey: 'ak-001',
      secretKey: 'sk-001',
      name: '新建素材组',
      description: '供默认同步使用',
    })

    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data.items).toEqual([
      {
        id: validArkGroupId,
        name: '默认素材组',
        description: null,
      },
    ])
    expect(createResponse.status).toBe(200)
    expect(createResponse.body.data).toEqual({
      id: 'group-created-新建素材组',
      name: '新建素材组',
      description: '供默认同步使用',
    })
    expect(setupService.listArkAssetGroupsCalls).toEqual([
      {
        accessKey: 'ak-001',
        secretKey: 'sk-001',
      },
    ])
    expect(setupService.createArkAssetGroupCalls).toEqual([
      {
        accessKey: 'ak-001',
        secretKey: 'sk-001',
        name: '新建素材组',
        description: '供默认同步使用',
      },
    ])
  })
})
