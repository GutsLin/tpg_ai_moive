import { describe, expect, it, vi } from 'vitest'

import { ArkBearerClient } from '../../backend/src/lib/ark-bearer'

describe('ArkBearerClient', () => {
  it('createTask 会用 Bearer Token 调用创建接口', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'task-123',
          status: 'processing',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    )

    const client = new ArkBearerClient({
      fetchImpl,
      getApiKey: async () => 'sk-test',
      getEndpoint: async () => 'https://ark.cn-beijing.volces.com/api/v3',
    })

    const taskId = await client.createTask({
      model: 'doubao-seedance-2-0-260128',
      content: [{ type: 'text', text: '生成视频' }],
    })

    expect(taskId).toBe('task-123')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('listTasks 会用重复 filter.task_ids 查询多个任务并解析结果', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 2,
          items: [
            {
              id: 'task-123',
              status: 'succeeded',
              content: {
                video_url: 'https://ark.example.com/video.mp4',
              },
              usage: {
                completion_tokens: 111,
                total_tokens: 222,
              },
              created_at: 1779353641,
              updated_at: 1779353917,
              execution_expires_after: 172800,
            },
            {
              id: 'task-456',
              status: 'processing',
              content: {},
              usage: {},
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    )

    const client = new ArkBearerClient({
      fetchImpl,
      getApiKey: async () => 'sk-test',
      getEndpoint: async () => 'https://ark.cn-beijing.volces.com/api/v3',
    })

    await expect(client.listTasks(['task-123', 'task-456'])).resolves.toEqual([
      {
        id: 'task-123',
        status: 'succeeded',
        videoUrl: 'https://ark.example.com/video.mp4',
        completionTokens: 111,
        totalTokens: 222,
        errorMessage: null,
        createdAt: '2026-05-21T08:54:01.000Z',
        updatedAt: '2026-05-21T08:58:37.000Z',
        executionExpiresAfter: 172800,
      },
      {
        id: 'task-456',
        status: 'processing',
        videoUrl: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: null,
        updatedAt: null,
        executionExpiresAfter: null,
      },
    ])

    const requestUrl = new URL(fetchImpl.mock.calls[0][0])
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'
    )
    expect(requestUrl.searchParams.get('page_num')).toBe('1')
    expect(requestUrl.searchParams.get('page_size')).toBe('2')
    expect(requestUrl.searchParams.getAll('filter.task_ids')).toEqual(['task-123', 'task-456'])
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('getTask 兼容单任务查询并复用列表接口', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 1,
          items: [
            {
              id: 'task-123',
              status: 'succeeded',
              content: {
                video_url: 'https://ark.example.com/video.mp4',
              },
              usage: {
                completion_tokens: 111,
                total_tokens: 222,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    )

    const client = new ArkBearerClient({
      fetchImpl,
      getApiKey: async () => 'sk-test',
      getEndpoint: async () => 'https://ark.cn-beijing.volces.com/api/v3',
    })

    await expect(client.getTask('task-123')).resolves.toMatchObject({
      id: 'task-123',
      status: 'succeeded',
      videoUrl: 'https://ark.example.com/video.mp4',
    })
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.getAll('filter.task_ids')).toEqual(['task-123'])
  })

  it('ToAPIs 创建任务会转换模型、参数和多模态素材字段', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'tsk_vid_123',
          object: 'generation.task',
          status: 'in_progress',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    )

    const client = new ArkBearerClient({
      fetchImpl,
      getApiKey: async () => 'sk-toapis-test',
      getEndpoint: async () => 'https://toapis.com/v1/',
    })

    await expect(
      client.createTask({
        mode: 'omni',
        model: 'doubao-seedance-2-0-fast-260128',
        content: [
          { type: 'text', text: ' 保持角色一致 ' },
          {
            type: 'image_url',
            image_url: { url: 'https://oss.example.com/reference.png' },
            role: 'reference_image',
            assetId: 10,
          },
          {
            type: 'video_url',
            video_url: { url: 'https://oss.example.com/reference.mp4' },
            role: 'reference_video',
            assetId: 11,
          },
          {
            type: 'audio_url',
            audio_url: { url: 'https://oss.example.com/reference.mp3' },
            role: 'reference_audio',
            assetId: 12,
          },
        ],
        duration: 8,
        ratio: '16:9',
        resolution: '720p',
        generate_audio: true,
      })
    ).resolves.toBe('tsk_vid_123')

    expect(await client.getAssetReferenceMode()).toBe('signed_url')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://toapis.com/v1/videos/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-toapis-test',
          'Content-Type': 'application/json',
        }),
      })
    )
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toEqual({
      model: 'seedance-2-fast',
      duration: 8,
      resolution: '720p',
      generate_audio: true,
      prompt: '保持角色一致',
      aspect_ratio: '16:9',
      image_with_roles: [
        {
          url: 'https://oss.example.com/reference.png',
          role: 'reference_image',
        },
      ],
      video_with_roles: [
        {
          url: 'https://oss.example.com/reference.mp4',
          role: 'reference_video',
        },
      ],
      audio_with_roles: [
        {
          url: 'https://oss.example.com/reference.mp3',
          role: 'reference_audio',
        },
      ],
    })
  })

  it('ToAPIs 首尾帧任务会使用 image_with_roles 且自动补全 /v1', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'tsk_frames_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const client = new ArkBearerClient({
      fetchImpl,
      getApiKey: async () => 'sk-toapis-test',
      getEndpoint: async () => 'https://api.toapis.com',
    })

    await client.createTask({
      mode: 'frames',
      model: 'doubao-seedance-2-0-260128',
      content: [
        { type: 'text', text: '镜头缓慢推进' },
        { type: 'image_url', image_url: { url: 'https://oss.example.com/first.png' }, role: 'first_frame' },
        { type: 'image_url', image_url: { url: 'https://oss.example.com/last.png' }, role: 'last_frame' },
      ],
      ratio: '9:16',
    })

    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.toapis.com/v1/videos/generations')
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toMatchObject({
      model: 'seedance-2',
      prompt: '镜头缓慢推进',
      aspect_ratio: '9:16',
      image_with_roles: [
        { url: 'https://oss.example.com/first.png', role: 'first_frame' },
        { url: 'https://oss.example.com/last.png', role: 'last_frame' },
      ],
    })
  })

  it('ToAPIs 会逐个查询任务并解析完成结果与失败原因', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/tsk_completed')) {
        return new Response(
          JSON.stringify({
            id: 'tsk_completed',
            status: 'completed',
            created_at: 1768380222,
            completed_at: 1768380514,
            expires_at: 1768466914,
            result: {
              type: 'video',
              data: [{ url: 'https://files.toapis.com/video.mp4', format: 'mp4' }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      if (url.endsWith('/tsk_missing')) {
        return new Response(
          JSON.stringify({ message: 'task_not_exist' }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          id: 'tsk_failed',
          status: 'failed',
          error: { code: 'generation_failed', message: '内容审核未通过' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })
    const client = new ArkBearerClient({
      fetchImpl,
      getApiKey: async () => 'sk-toapis-test',
      getEndpoint: async () => 'https://toapis.com/v1',
    })

    await expect(client.listTasks(['tsk_completed', 'tsk_failed', 'tsk_missing'])).resolves.toEqual([
      {
        id: 'tsk_completed',
        status: 'completed',
        videoUrl: 'https://files.toapis.com/video.mp4',
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        createdAt: '2026-01-14T08:43:42.000Z',
        updatedAt: '2026-01-14T08:48:34.000Z',
        executionExpiresAfter: 86400,
      },
      {
        id: 'tsk_failed',
        status: 'failed',
        videoUrl: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: '内容审核未通过',
        createdAt: null,
        updatedAt: null,
        executionExpiresAfter: null,
      },
    ])
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://toapis.com/v1/videos/generations/tsk_completed',
      'https://toapis.com/v1/videos/generations/tsk_failed',
      'https://toapis.com/v1/videos/generations/tsk_missing',
    ])
    expect(fetchImpl.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-toapis-test' }),
      })
    )
  })

  it('ToAPIs 查询的认证错误不会被当成任务不存在', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: '无效的令牌' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    )
    const client = new ArkBearerClient({
      fetchImpl,
      getApiKey: async () => 'invalid-token',
      getEndpoint: async () => 'https://toapis.com/v1',
    })

    await expect(client.listTasks(['tsk_123'])).rejects.toThrow('无效的令牌')
  })

  it('真人素材合规错误会翻译为中文提示并标注素材位置', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'xxx.PrivacyInformation',
            message: "The request failed because the input image 'content[3]' may contain real person. Request id: 021787195758044b",
            param: '',
            type: 'BadRequest',
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
    )
    const client = new ArkBearerClient({
      fetchImpl,
      getApiKey: async () => 'sk-test',
      getEndpoint: async () => 'https://toapis.com/v1',
    })

    await expect(client.createTask({ model: 'seedance-2-fast', content: [] })).rejects.toThrow(
      /参考第 4 个素材疑似包含真实人物[\s\S]*content\[3\]/
    )
  })

  it('未匹配翻译规则的错误保留原始信息', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'some unknown failure' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    )
    const client = new ArkBearerClient({
      fetchImpl,
      getApiKey: async () => 'sk-test',
      getEndpoint: async () => 'https://toapis.com/v1',
    })

    await expect(client.createTask({ model: 'seedance-2-fast', content: [] })).rejects.toThrow('some unknown failure')
  })
})
