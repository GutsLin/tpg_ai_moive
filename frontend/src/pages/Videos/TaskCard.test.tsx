import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { VideoTaskItem } from '../../api/videos'
import { TaskCard } from './TaskCard'

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

describe('TaskCard', () => {
  it('展示重新生成按钮并响应点击', async () => {
    const onReplay = vi.fn()

    render(<TaskCard task={buildTask()} onReplay={onReplay} />)

    await userEvent.click(screen.getByRole('button', { name: '重新生成任务-22' }))

    expect(onReplay).toHaveBeenCalledWith(22)
  })

  it('失败任务展示火山任务 ID 并支持重新拉取状态', async () => {
    const onSync = vi.fn()

    render(
      <TaskCard
        task={buildTask({
          status: 'failed',
          arkTaskId: 'cgt-20260528163741-fzf6r',
          errorMessage: '火山视频链接已过期或无权限访问，无法下载结果视频（HTTP 403，火山任务ID：cgt-20260528163741-fzf6r）',
          videoUrl: null,
        })}
        onSync={onSync}
      />
    )

    expect(screen.getByText(/火山任务ID：cgt-20260528163741-fzf6r/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '重新拉取任务状态-22' }))

    expect(onSync).toHaveBeenCalledWith(22)
  })

  it('失败任务把重新拉取状态按钮放在错误信息区域，避免挤压底部时间', async () => {
    const onSync = vi.fn()

    render(
      <TaskCard
        task={buildTask({
          status: 'failed',
          arkTaskId: 'cgt-20260602103857-lttwn',
          errorMessage:
            'The request failed because the output video may contain sensitive information. Request id: 02178036819693800000000000000000000ffffac193cdbc7b2e2',
          videoUrl: null,
        })}
        onSync={onSync}
      />
    )

    const errorRegion = screen.getByLabelText('失败任务操作区')
    const footer = screen.getByLabelText('任务卡片底部操作区')
    const syncButton = screen.getByRole('button', { name: '重新拉取任务状态-22' })

    expect(errorRegion).toContainElement(syncButton)
    expect(footer).not.toContainElement(syncButton)

    await userEvent.click(syncButton)

    expect(onSync).toHaveBeenCalledWith(22)
  })

  it('处理中且已排队轮询的任务展示等待后台查询文案', () => {
    render(
      <TaskCard
        task={buildTask({
          status: 'processing',
          providerKey: 'toapis',
          providerSnapshot: { name: 'ToAPIs', providerType: 'toapis' },
          arkTaskId: 'cgt-20260528163741-fzf6r',
          nextPollAt: '2026-04-04T00:06:30.000Z',
          errorMessage: null,
          videoUrl: null,
        })}
      />
    )

    expect(screen.getByText(/已加入状态拉取队列，等待后台查询ToAPIs状态/)).toBeInTheDocument()
  })

  it('ToAPIs 排队任务展示对应平台名称', () => {
    render(
      <TaskCard
        task={buildTask({
          status: 'pending',
          providerKey: 'toapis',
          providerSnapshot: { name: 'ToAPIs', providerType: 'toapis' },
          videoUrl: null,
        })}
      />
    )

    expect(screen.getByText(/ToAPIs队列排队中/)).toBeInTheDocument()
  })

  it('重新拉取状态按钮同步中时展示 loading 并禁用重复点击', async () => {
    const onSync = vi.fn()

    render(
      <TaskCard
        task={buildTask({
          status: 'failed',
          arkTaskId: 'cgt-20260528163741-fzf6r',
          errorMessage: '火山接口限流',
          videoUrl: null,
        })}
        onSync={onSync}
        syncing
      />
    )

    const button = screen.getByRole('button', { name: '重新拉取任务状态-22' })
    expect(button).toBeDisabled()

    await userEvent.click(button)

    expect(onSync).not.toHaveBeenCalled()
  })

  it('同一任务刷新时保留当前视频播放地址，避免播放器重载', () => {
    const { rerender } = render(<TaskCard task={buildTask()} />)

    const originalVideo = screen.getByLabelText('视频播放-等待完成的视频')
    expect(originalVideo).toHaveAttribute('src', 'https://signed.example.com/videos/22.mp4?token=old')

    rerender(
      <TaskCard
        task={buildTask({
          updatedAt: '2026-04-04T00:06:00.000Z',
          videoUrl: 'https://signed.example.com/videos/22.mp4?token=new',
        })}
      />
    )

    const updatedVideo = screen.getByLabelText('视频播放-等待完成的视频')
    expect(updatedVideo).toBe(originalVideo)
    expect(updatedVideo).toHaveAttribute('src', 'https://signed.example.com/videos/22.mp4?token=old')
  })
})
