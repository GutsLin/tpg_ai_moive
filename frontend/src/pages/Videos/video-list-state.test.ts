import { describe, expect, it } from 'vitest'

import type { VideoTaskItem } from '../../api/videos'
import { mergeVideoTasksForRefresh, replaceVideoTaskInList } from './video-list-state'

const buildTask = (overrides: Partial<VideoTaskItem> = {}): VideoTaskItem => ({
  id: 22,
  userId: 1,
  projectId: 101,
  status: 'succeeded',
  mode: 'omni',
  model: 'doubao-seedance-2-0-260128',
  prompt: '等待完成的视频',
  promptRaw: '等待完成的视频',
  duration: 5,
  ratio: '16:9',
  resolution: '720p',
  generateAudio: true,
  createdAt: '2026-04-04T00:00:00.000Z',
  updatedAt: '2026-04-04T00:05:00.000Z',
  errorMessage: null,
  videoUrl: 'https://signed.example.com/videos/22.mp4?token=old',
  elapsedSeconds: 120,
  estimatedTotalSeconds: 130,
  estimateSampleSize: 3,
  ...overrides,
})

describe('mergeVideoTasksForRefresh', () => {
  it('同一任务轮询返回新签名地址时保留旧播放地址，但合并最新状态字段', () => {
    const previous = [buildTask()]
    const incoming = [
      buildTask({
        updatedAt: '2026-04-04T00:06:00.000Z',
        elapsedSeconds: 121,
        videoUrl: 'https://signed.example.com/videos/22.mp4?token=new',
      }),
    ]

    const merged = mergeVideoTasksForRefresh(previous, incoming)

    expect(merged[0]).not.toBe(previous[0])
    expect(merged[0].updatedAt).toBe('2026-04-04T00:06:00.000Z')
    expect(merged[0].elapsedSeconds).toBe(121)
    expect(merged[0].videoUrl).toBe('https://signed.example.com/videos/22.mp4?token=old')
  })

  it('同一任务除播放签名地址外无变化时复用旧对象', () => {
    const previous = [buildTask()]
    const incoming = [
      buildTask({
        videoUrl: 'https://signed.example.com/videos/22.mp4?token=new',
      }),
    ]

    const merged = mergeVideoTasksForRefresh(previous, incoming)

    expect(merged[0]).toBe(previous[0])
  })

  it('任务第一次完成时保留新返回的视频地址', () => {
    const previous = [
      buildTask({
        status: 'processing',
        videoUrl: null,
      }),
    ]
    const incoming = [
      buildTask({
        status: 'succeeded',
        videoUrl: 'https://signed.example.com/videos/22.mp4?token=new',
      }),
    ]

    const merged = mergeVideoTasksForRefresh(previous, incoming)

    expect(merged[0].videoUrl).toBe('https://signed.example.com/videos/22.mp4?token=new')
  })
})

describe('replaceVideoTaskInList', () => {
  it('只替换目标任务并保留当前列表里的其他任务', () => {
    const previous = [
      buildTask({ id: 22, prompt: '保留任务', promptRaw: '保留任务' }),
      buildTask({
        id: 91,
        status: 'failed',
        prompt: '失败任务',
        promptRaw: '失败任务',
        errorMessage: '火山接口限流',
        videoUrl: null,
      }),
    ]

    const replaced = replaceVideoTaskInList(
      previous,
      buildTask({
        id: 91,
        status: 'processing',
        prompt: '失败任务',
        promptRaw: '失败任务',
        errorMessage: null,
        nextPollAt: '2026-04-04T00:06:00.000Z',
        videoUrl: null,
      })
    )

    expect(replaced).toHaveLength(2)
    expect(replaced[0]).toBe(previous[0])
    expect(replaced[1]).not.toBe(previous[1])
    expect(replaced[1].status).toBe('processing')
    expect(replaced[1].nextPollAt).toBe('2026-04-04T00:06:00.000Z')
  })
})
