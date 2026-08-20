import bodyParser from 'koa-bodyparser'
import jwt from 'jsonwebtoken'
import Koa from 'koa'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { errorHandler } from '../../backend/src/middleware/error-handler'
import { createVideoGenerationLogsRouter } from '../../backend/src/routes/video-generation-logs.routes'
import type { ProjectAccessRecord, ProjectAccessRepository } from '../../backend/src/services/project-access.service'
import type {
  VideoGenerationLogQuery,
  VideoGenerationLogRecord,
  VideoGenerationLogRepository,
} from '../../backend/src/services/video-generation-log.service'

class FakeLogRepository implements VideoGenerationLogRepository {
  public listCalls: VideoGenerationLogQuery[] = []
  public deleteCalls: Array<{ projectId: number; dateFrom: Date; dateTo: Date }> = []

  public async create(): Promise<void> {}

  public async list(input: VideoGenerationLogQuery): Promise<{ items: VideoGenerationLogRecord[]; total: number }> {
    this.listCalls.push(input)
    return {
      items: [
        {
          id: 1,
          videoTaskId: 42,
          projectId: input.projectId,
          userId: 1,
          userName: 'admin',
          traceId: 'trace-42',
          stage: 'ark_request',
          action: 'ark_video.create_task',
          status: 'succeeded',
          message: '调用火山视频任务创建接口',
          requestPayload: { model: 'seedance' },
          responsePayload: { arkTaskId: 'ark-42' },
          durationMs: 120,
          errorMessage: null,
          createdAt: new Date('2026-08-18T10:00:00.000Z'),
        },
      ],
      total: 1,
    }
  }

  public async deleteRange(input: { projectId: number; dateFrom: Date; dateTo: Date }): Promise<number> {
    this.deleteCalls.push(input)
    return 3
  }
}

class FakeProjectAccessRepository implements ProjectAccessRepository {
  public async listAccessibleProjectsForUser(): Promise<ProjectAccessRecord[]> {
    return []
  }

  public async findAccessibleProjectForUser(
    _userId: number,
    _role: 'admin' | 'user',
    projectId: number
  ): Promise<ProjectAccessRecord | null> {
    if (projectId !== 101) {
      return null
    }

    return {
      projectId: 101,
      projectName: '弃妃',
      projectCode: 'project-101',
      projectStatus: 'active',
      projectRole: 'manager',
    }
  }
}

const buildApp = (repository: FakeLogRepository) => {
  const app = new Koa()
  const router = createVideoGenerationLogsRouter(repository, new FakeProjectAccessRepository())

  app.use(errorHandler())
  app.use(bodyParser())
  app.use(router.routes())
  app.use(router.allowedMethods())

  return app
}

const tokenFor = (role: 'admin' | 'user') =>
  jwt.sign({ sub: role === 'admin' ? '1' : '2', role }, 'video-log-test-secret', { expiresIn: '1h' })

describe('/api/video-generation-logs', () => {
  let repository: FakeLogRepository

  beforeEach(() => {
    process.env.JWT_SECRET = 'video-log-test-secret'
    repository = new FakeLogRepository()
  })

  it('管理员仅查询当前项目的日志并透传筛选条件', async () => {
    const response = await request(buildApp(repository).callback())
      .get('/api/video-generation-logs?taskId=42&stage=ark_request&status=succeeded&page=2&pageSize=20')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .set('X-Project-Id', '101')

    expect(response.status).toBe(200)
    expect(response.body.data.total).toBe(1)
    expect(response.body.data.items[0].createdAt).toBe('2026-08-18T10:00:00.000Z')
    expect(repository.listCalls).toEqual([
      expect.objectContaining({
        projectId: 101,
        taskId: 42,
        stage: 'ark_request',
        status: 'succeeded',
        page: 2,
        pageSize: 20,
      }),
    ])
  })

  it('普通用户不能读取日志，管理员也不能跨项目读取', async () => {
    const userResponse = await request(buildApp(repository).callback())
      .get('/api/video-generation-logs')
      .set('Authorization', `Bearer ${tokenFor('user')}`)
      .set('X-Project-Id', '101')
    const crossProjectResponse = await request(buildApp(repository).callback())
      .get('/api/video-generation-logs')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .set('X-Project-Id', '202')

    expect(userResponse.status).toBe(403)
    expect(crossProjectResponse.status).toBe(403)
    expect(repository.listCalls).toHaveLength(0)
  })

  it('管理员按当前项目和时间段删除日志', async () => {
    const response = await request(buildApp(repository).callback())
      .delete('/api/video-generation-logs')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .set('X-Project-Id', '101')
      .send({
        dateFrom: '2026-08-01T00:00:00.000+08:00',
        dateTo: '2026-08-18T23:59:59.999+08:00',
      })

    expect(response.status).toBe(200)
    expect(response.body.data.deletedCount).toBe(3)
    expect(repository.deleteCalls).toEqual([
      {
        projectId: 101,
        dateFrom: new Date('2026-08-01T00:00:00.000+08:00'),
        dateTo: new Date('2026-08-18T23:59:59.999+08:00'),
      },
    ])
  })

  it('拒绝结束时间早于开始时间的删除请求', async () => {
    const response = await request(buildApp(repository).callback())
      .delete('/api/video-generation-logs')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .set('X-Project-Id', '101')
      .send({
        dateFrom: '2026-08-18T23:00:00.000+08:00',
        dateTo: '2026-08-18T08:00:00.000+08:00',
      })

    expect(response.status).toBe(422)
    expect(repository.deleteCalls).toHaveLength(0)
  })
})
