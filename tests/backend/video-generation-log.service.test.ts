import { describe, expect, it } from 'vitest'

import {
  sanitizeVideoGenerationLogValue,
  VideoGenerationLogger,
  type VideoGenerationLogQuery,
  type VideoGenerationLogRecord,
  type VideoGenerationLogRepository,
} from '../../backend/src/services/video-generation-log.service'

class RecordingLogRepository implements VideoGenerationLogRepository {
  public readonly writes: Array<Omit<VideoGenerationLogRecord, 'id' | 'userName' | 'createdAt'>> = []

  public async create(
    input: Omit<VideoGenerationLogRecord, 'id' | 'userName' | 'createdAt'>
  ): Promise<void> {
    this.writes.push(input)
  }

  public async list(_input: VideoGenerationLogQuery): Promise<{ items: VideoGenerationLogRecord[]; total: number }> {
    return { items: [], total: 0 }
  }

  public async deleteRange(): Promise<number> {
    return 0
  }
}

describe('video generation logger', () => {
  it('递归隐藏密钥、URL 查询参数和二进制内容，并处理循环对象', () => {
    const payload: Record<string, unknown> = {
      authorization: 'Bearer secret-token',
      nested: {
        apiKey: 'sk-secret',
        access_key_id: 'ak-secret',
        callbackUrl: 'https://example.com/video.mp4?signature=secret#fragment',
      },
      binary: Buffer.from('video-bytes'),
    }
    payload.self = payload

    expect(sanitizeVideoGenerationLogValue(payload)).toEqual({
      authorization: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        access_key_id: '[REDACTED]',
        callbackUrl: 'https://example.com/video.mp4?[REDACTED]',
      },
      binary: { type: 'Buffer', length: 11 },
      self: '[CIRCULAR]',
    })
  })

  it('step 会记录开始、成功、耗时以及脱敏后的调用参数和结果', async () => {
    const repository = new RecordingLogRepository()
    let currentTime = 100
    const logger = new VideoGenerationLogger(repository, () => currentTime)

    const result = await logger.step(
      {
        videoTaskId: 42,
        projectId: 101,
        userId: 7,
        traceId: 'trace-42',
        stage: 'ark_request',
        action: 'ark_video.create_task',
        message: '调用火山视频任务创建接口',
        requestPayload: { apiKey: 'secret', model: 'seedance' },
        responsePayload: (taskId) => ({ taskId, signedUrl: 'https://example.com/result?token=secret' }),
      },
      async () => {
        currentTime = 145
        return 'ark-task-42'
      }
    )

    expect(result).toBe('ark-task-42')
    expect(repository.writes).toHaveLength(2)
    expect(repository.writes[0]).toMatchObject({
      status: 'started',
      requestPayload: { apiKey: '[REDACTED]', model: 'seedance' },
      responsePayload: null,
    })
    expect(repository.writes[1]).toMatchObject({
      status: 'succeeded',
      durationMs: 45,
      responsePayload: {
        taskId: 'ark-task-42',
        signedUrl: 'https://example.com/result?[REDACTED]',
      },
    })
  })

  it('日志持久化失败不会打断视频主流程', async () => {
    const repository = new RecordingLogRepository()
    repository.create = async () => {
      throw new Error('database unavailable')
    }
    const logger = new VideoGenerationLogger(repository)

    await expect(
      logger.step(
        {
          videoTaskId: 42,
          projectId: 101,
          userId: 7,
          traceId: 'trace-42',
          stage: 'queue',
          action: 'video_create.enqueued',
          message: '加入队列',
        },
        async () => 'queued'
      )
    ).resolves.toBe('queued')
  })
})
