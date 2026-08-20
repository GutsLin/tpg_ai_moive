import { ConfigProvider } from 'antd'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LogsPage } from '.'

vi.mock('../../api/video-generation-logs', () => ({
  getVideoGenerationLogs: vi.fn(),
  deleteVideoGenerationLogs: vi.fn(),
}))

const renderLogsPage = () =>
  render(
    <ConfigProvider>
      <LogsPage />
    </ConfigProvider>
  )

describe('LogsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('显示调用步骤，并在详情抽屉展示参数、结果和错误', async () => {
    const { getVideoGenerationLogs } = await import('../../api/video-generation-logs')
    vi.mocked(getVideoGenerationLogs).mockResolvedValue({
      items: [
        {
          id: 9,
          videoTaskId: 42,
          projectId: 101,
          userId: 1,
          userName: 'admin',
          traceId: 'trace-42',
          stage: 'ark_request',
          action: 'ark_video.create_task',
          status: 'failed',
          message: '调用火山视频任务创建接口',
          requestPayload: { model: 'seedance', apiKey: '[REDACTED]' },
          responsePayload: null,
          durationMs: 321,
          errorMessage: 'upstream unavailable',
          createdAt: '2026-08-18T10:00:00.000Z',
        },
      ],
      total: 1,
    })

    renderLogsPage()

    expect(await screen.findByText('调用火山视频任务创建接口')).toBeInTheDocument()
    expect(screen.getByText('平台创建')).toBeInTheDocument()
    expect(screen.getByText('321 ms')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '查看日志-9' }))

    expect(await screen.findByText('日志详情 #9')).toBeInTheDocument()
    expect(screen.getByText('upstream unavailable')).toBeInTheDocument()
    expect(screen.getByText(/"apiKey": "\[REDACTED\]"/)).toBeInTheDocument()
  })

  it('提供按时间段删除入口并要求选择完整范围', async () => {
    const { getVideoGenerationLogs, deleteVideoGenerationLogs } = await import('../../api/video-generation-logs')
    vi.mocked(getVideoGenerationLogs).mockResolvedValue({ items: [], total: 0 })

    renderLogsPage()

    await screen.findByText('暂无生成日志')
    await userEvent.click(screen.getByRole('button', { name: '按时间删除' }))
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByText('请选择完整的开始和结束时间')).toBeInTheDocument()
    expect(deleteVideoGenerationLogs).not.toHaveBeenCalled()
  })
})
