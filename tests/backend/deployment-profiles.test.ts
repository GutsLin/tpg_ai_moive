import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')

const deploymentProfilesPath = path.join(repoRoot, 'deploy', 'deployment-profiles.cjs')

describe('Narrix deployment profiles', () => {
  it('定义了可复用的 dev/prod 隔离配置', async () => {
    expect(existsSync(deploymentProfilesPath)).toBe(true)

    const deploymentProfilesModule = await import(deploymentProfilesPath)
    const deploymentProfiles = deploymentProfilesModule.default ?? deploymentProfilesModule

    expect(deploymentProfiles).toEqual({
      prod: {
        profile: 'prod',
        composeProjectName: 'narrix-prod',
        networkName: 'narrix_prod_net',
        frontendPort: 8080,
        backendPort: 3000,
        database: {
          containerName: 'postgres',
          databaseName: 'narrix_prod',
          username: 'narrix_prod',
          volumeName: 'narrix_prod_pgdata',
        },
        redis: {
          containerName: 'redis',
          volumeName: 'narrix_prod_redisdata',
        },
      },
      dev: {
        profile: 'dev',
        composeProjectName: 'narrix-dev',
        networkName: 'narrix_dev_net',
        frontendPort: 18080,
        backendPort: 13000,
        database: {
          containerName: 'postgres',
          databaseName: 'narrix_dev',
          username: 'narrix_dev',
          volumeName: 'narrix_dev_pgdata',
        },
        redis: {
          containerName: 'redis',
          volumeName: 'narrix_dev_redisdata',
        },
      },
    })
  })

  it('提供了面向 compose 的 Narrix 环境变量模板', async () => {
    const stackEnvFiles = {
      prod: path.join(repoRoot, 'deploy', 'env', 'prod', 'stack.env.example'),
      dev: path.join(repoRoot, 'deploy', 'env', 'dev', 'stack.env.example'),
    }

    for (const [profile, filePath] of Object.entries(stackEnvFiles)) {
      expect(existsSync(filePath)).toBe(true)
      const content = readFileSync(filePath, 'utf8')

      expect(content).toContain(`NARRIX_PROFILE=${profile}`)
      expect(content).toContain(`NARRIX_COMPOSE_PROJECT_NAME=narrix-${profile}`)
      expect(content).toContain('NARRIX_FRONTEND_PORT=')
      expect(content).toContain('NARRIX_BACKEND_PORT=')
      expect(content).toContain('NARRIX_DB_NAME=')
      expect(content).toContain('NARRIX_DB_USER=')
      expect(content).toContain('NARRIX_DB_PASSWORD=')
      expect(content).toContain('NARRIX_DB_VOLUME=')
      expect(content).toContain('NARRIX_REDIS_VOLUME=')
      expect(content).toContain('NARRIX_NETWORK_NAME=')
      expect(content).toContain('NARRIX_JWT_SECRET=')
      expect(content).toContain('NARRIX_CONFIG_ENCRYPTION_KEY=')
      expect(content).not.toContain('NARRIX_BACKEND_IMAGE=')
      expect(content).not.toContain('NARRIX_FRONTEND_IMAGE=')
      expect(content).toContain('NARRIX_IMAGE_TAG=')
    }

    const devContent = readFileSync(stackEnvFiles.dev, 'utf8')
    const prodContent = readFileSync(stackEnvFiles.prod, 'utf8')

    expect(devContent).toContain('NARRIX_FRONTEND_PORT=18080')
    expect(devContent).toContain('NARRIX_BACKEND_PORT=13000')
    expect(prodContent).toContain('NARRIX_FRONTEND_PORT=8080')
    expect(prodContent).toContain('NARRIX_BACKEND_PORT=3000')
  })
})
