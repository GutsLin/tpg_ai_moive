import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { ConfigNotFoundError } from '../../backend/src/services/config.service'
import { classifyWorkerError, getWorkerLogBindings } from '../../backend/src/workers/worker-runtime'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')

const readUtf8 = (filePath: string) => readFileSync(filePath, 'utf8')

describe('Narrix worker service hardening', () => {
  const originalProfile = process.env.NARRIX_PROFILE
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NARRIX_PROFILE = originalProfile
    process.env.NODE_ENV = originalNodeEnv
  })

  it('为 worker 日志生成 service 与 environment 标签', () => {
    process.env.NARRIX_PROFILE = 'dev'

    expect(getWorkerLogBindings('worker-video')).toEqual({
      service: 'worker-video',
      environment: 'dev',
    })
  })

  it('将缺失配置归类为可恢复 worker 错误', () => {
    expect(classifyWorkerError(new ConfigNotFoundError('ark_api_key'))).toEqual({
      recoverable: true,
      reason: 'missing_required_config',
      errorName: 'ConfigNotFoundError',
      errorMessage: '配置项不存在: ark_api_key',
    })

    expect(classifyWorkerError(new Error('boom'))).toEqual({
      recoverable: false,
      reason: 'worker_processing_error',
      errorName: 'Error',
      errorMessage: 'boom',
    })
  })

  it('为 video 与 asset-sync worker 提供独立启动脚本和 compose 服务', () => {
    const packageJson = JSON.parse(readUtf8(path.join(repoRoot, 'backend', 'package.json'))) as {
      scripts?: Record<string, string>
    }
    const composeContent = readUtf8(path.join(repoRoot, 'deploy', 'docker-compose.yml'))

    expect(packageJson.scripts?.['worker:video']).toBe('node dist/workers/video.worker.js')
    expect(packageJson.scripts?.['worker:asset-sync']).toBe('node dist/workers/asset-sync.worker.js')
    expect(packageJson.scripts?.['worker:video:dev']).toBe('nodemon --exec ts-node src/workers/video.worker.ts')
    expect(packageJson.scripts?.['worker:asset-sync:dev']).toBe('nodemon --exec ts-node src/workers/asset-sync.worker.ts')

    expect(composeContent).toContain('worker-video:')
    expect(composeContent).toContain('worker-asset-sync:')
    expect(composeContent).toContain('command: ["node", "dist/workers/video.worker.js"]')
    expect(composeContent).toContain('command: ["node", "dist/workers/asset-sync.worker.js"]')
    expect(composeContent).toContain('service: worker-video')
    expect(composeContent).toContain('service: worker-asset-sync')
  })
})
