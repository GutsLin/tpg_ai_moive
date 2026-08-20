import { FileTextOutlined, LoadingOutlined } from '@ant-design/icons'
import { Button, Empty, Input, Pagination, Skeleton, Space, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getAssetDetail, type AssetItem } from '../../api/assets'
import {
  createVideoTask,
  getVideoTask,
  getVideoTasks,
  syncVideoTask,
  type CreateVideoTaskPayload,
  type VideoReplayDraftAsset,
  type VideoTaskItem,
  type VideoTaskStatus,
} from '../../api/videos'
import { PageHeader } from '../../components/PageHeader'
import { usePolling } from '../../hooks/usePolling'
import { useAuth } from '../../stores/auth'
import { GeneratePanel, type GeneratePanelReplayDraft } from './GeneratePanel'
import { TaskCard } from './TaskCard'
import { mergeVideoTasksForRefresh, replaceVideoTaskInList } from './video-list-state'

const panelStyle = {
  borderRadius: 30,
  border: '1px solid #dbe4ea',
  background: '#ffffff',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.05)',
  padding: 24,
}

const DEFAULT_TASK_PAGE = 1
const DEFAULT_TASK_PAGE_SIZE = 20

export const VideosPage = () => {
  const navigate = useNavigate()
  const { state: authState } = useAuth()
  const [tasks, setTasks] = useState<VideoTaskItem[]>([])
  const [taskFilter, setTaskFilter] = useState<'all' | 'mine'>('all')
  const [taskPage, setTaskPage] = useState(DEFAULT_TASK_PAGE)
  const [taskPageSize, setTaskPageSize] = useState(DEFAULT_TASK_PAGE_SIZE)
  const [taskTotal, setTaskTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [replayingTaskId, setReplayingTaskId] = useState<number | null>(null)
  const [syncingTaskId, setSyncingTaskId] = useState<number | null>(null)
  const [replayDraft, setReplayDraft] = useState<GeneratePanelReplayDraft | null>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const [historyFilterDraft, setHistoryFilterDraft] = useState<VideoHistoryFilters>(defaultHistoryFilters)
  const [historyFilters, setHistoryFilters] = useState<VideoHistoryFilters>(defaultHistoryFilters)

  const loadTasks = async (options: { silent?: boolean; page?: number; pageSize?: number } = {}) => {
    if (options.silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const nextPage = options.page ?? taskPage
      const nextPageSize = options.pageSize ?? taskPageSize
      const result = await getVideoTasks({
        page: nextPage,
        pageSize: nextPageSize,
        mine: taskFilter === 'mine',
        q: historyFilters.q || undefined,
        mode: historyFilters.mode || undefined,
        status: historyFilters.status || undefined,
        dateFrom: historyFilters.dateFrom ? toUtcBoundary(historyFilters.dateFrom, 'start') : undefined,
        dateTo: historyFilters.dateTo ? toUtcBoundary(historyFilters.dateTo, 'end') : undefined,
      })
      if (!result || !Array.isArray(result.items)) {
        throw new Error('视频任务列表响应无效')
      }
      setTaskTotal(result.total)
      setTasks((current) => mergeVideoTasksForRefresh(current, result.items))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadTasks()
  }, [taskFilter, historyFilters, taskPage, taskPageSize])

  const hasProcessingTasks = tasks.some((item) => item.status === 'pending' || item.status === 'processing')

  usePolling(
    async () => {
      await loadTasks({ silent: true })
    },
    5_000,
    hasProcessingTasks
  )

  const metrics = useMemo(
    () => [
      { label: '任务总数', value: taskTotal },
      { label: '处理中任务', value: tasks.filter((item) => item.status === 'pending' || item.status === 'processing').length },
      { label: '完成任务', value: tasks.filter((item) => item.status === 'succeeded').length },
    ],
    [taskTotal, tasks]
  )

  const historyDescription =
    taskFilter === 'mine'
      ? '当前仅显示由我创建的任务，切回全部任务可查看当前项目的完整流水。'
      : '任务会区分排队中与生成中两个阶段，并持续自动刷新。'

  const handleCreate = async (payload: CreateVideoTaskPayload) => {
    await createVideoTask(payload)
    setTaskPage(DEFAULT_TASK_PAGE)
    await loadTasks({ silent: true, page: DEFAULT_TASK_PAGE })
  }

  const handleReplay = async (taskId: number) => {
    setReplayingTaskId(taskId)

    try {
      const detail = await getVideoTask(taskId)
      if (!detail.replayDraft) {
        void messageApi.warning('该任务缺少可回填草稿，请手动重新填写')
        return
      }

      const resolvedAssets = await Promise.allSettled(
        detail.replayDraft.assets.map(async (assetReference) => ({
          role: assetReference.role,
          asset: await getAssetDetail(assetReference.assetId),
        }))
      )

      const availableAssets = resolvedAssets
        .filter((item): item is PromiseFulfilledResult<{ role: VideoReplayDraftAsset['role']; asset: AssetItem }> => item.status === 'fulfilled')
        .map((item) => item.value)

      setReplayDraft(buildReplayDraft(detail.replayDraft, availableAssets))

      const missingCount = resolvedAssets.length - availableAssets.length
      if (missingCount > 0) {
        void messageApi.warning(`其中 ${missingCount} 个素材已失效或无权限，请重新补选`)
      }
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '回填任务草稿失败，请稍后重试')
    } finally {
      setReplayingTaskId(null)
    }
  }

  const handleSyncTask = async (taskId: number) => {
    setSyncingTaskId(taskId)

    try {
      const syncedTask = await syncVideoTask(taskId)
      setTasks((current) => replaceVideoTaskInList(current, syncedTask))
      void messageApi.success('已加入状态拉取队列，后台将在约 30 秒内查询视频平台状态')
      await loadTasks({ silent: true })
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '重新拉取任务状态失败，请稍后重试')
    } finally {
      setSyncingTaskId(null)
    }
  }

  const handleCreateFirstTask = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleApplyFilters = () => {
    setTaskPage(DEFAULT_TASK_PAGE)
    setHistoryFilters({ ...historyFilterDraft })
  }

  const handleResetFilters = () => {
    setHistoryFilterDraft(defaultHistoryFilters)
    setTaskPage(DEFAULT_TASK_PAGE)
    setHistoryFilters(defaultHistoryFilters)
  }

  const hasActiveHistoryFilters =
    taskFilter === 'mine' ||
    Boolean(historyFilters.q || historyFilters.mode || historyFilters.status || historyFilters.dateFrom || historyFilters.dateTo)

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      {contextHolder}
      <PageHeader
        title="视频生成"
        description="从当前项目素材中直接选择首尾帧或参考素材，系统会自动按素材状态选择火山资产引用或 OSS 签名直链。"
        actions={
          authState.user?.role === 'admin' && authState.user.menuPerms.includes('logs') ? (
            <Button aria-label="生成日志" icon={<FileTextOutlined />} onClick={() => navigate('/logs')}>
              生成日志
            </Button>
          ) : undefined
        }
      />

      <GeneratePanel onSubmit={handleCreate} replayDraft={replayDraft} />

      <section style={panelStyle}>
        <Space orientation="vertical" size={18} style={{ width: '100%' }}>
          <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                任务历史
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                {historyDescription}
              </Typography.Paragraph>
              <Typography.Text
                type="secondary"
                aria-live="polite"
                style={{
                  minHeight: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  visibility: refreshing ? 'visible' : 'hidden',
                }}
              >
                <LoadingOutlined />
                已自动刷新最新状态
              </Typography.Text>
            </div>
            <Space size={16} align="start" wrap>
              <div
                role="radiogroup"
                aria-label="任务视图"
                style={{
                  display: 'inline-flex',
                  gap: 8,
                  padding: 4,
                  borderRadius: 999,
                  background: '#f1f5f9',
                  border: '1px solid #dbe4ea',
                }}
              >
                {[
                  { label: '全部任务', value: 'all' as const },
                  { label: '我创建的任务', value: 'mine' as const },
                ].map((item) => {
                  const active = taskFilter === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setTaskPage(DEFAULT_TASK_PAGE)
                        setTaskFilter(item.value)
                      }}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '10px 16px',
                        background: active ? '#111827' : 'transparent',
                        color: active ? '#f8fafc' : '#475569',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))',
                  gap: 12,
                  minWidth: 360,
                }}
              >
                {metrics.map((item) => (
                  <div
                    key={item.label}
                    style={{
                      borderRadius: 18,
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      padding: '14px 16px',
                    }}
                  >
                    <Typography.Text type="secondary">{item.label}</Typography.Text>
                    <Typography.Title level={4} style={{ margin: '10px 0 0' }}>
                      {item.value}
                    </Typography.Title>
                  </div>
                ))}
              </div>
            </Space>
          </Space>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(4, minmax(140px, 0.8fr)) auto auto',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              <Typography.Text type="secondary">提示词搜索</Typography.Text>
              <Input
                aria-label="提示词搜索"
                placeholder="按提示词关键词搜索"
                value={historyFilterDraft.q}
                onChange={(event) => setHistoryFilterDraft((current) => ({ ...current, q: event.target.value }))}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <Typography.Text type="secondary">开始日期</Typography.Text>
              <input
                aria-label="开始日期"
                type="date"
                value={historyFilterDraft.dateFrom}
                onChange={(event) => setHistoryFilterDraft((current) => ({ ...current, dateFrom: event.target.value }))}
                style={filterInputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <Typography.Text type="secondary">结束日期</Typography.Text>
              <input
                aria-label="结束日期"
                type="date"
                value={historyFilterDraft.dateTo}
                onChange={(event) => setHistoryFilterDraft((current) => ({ ...current, dateTo: event.target.value }))}
                style={filterInputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <Typography.Text type="secondary">生成模式</Typography.Text>
              <select
                aria-label="生成模式筛选"
                value={historyFilterDraft.mode}
                onChange={(event) =>
                  setHistoryFilterDraft((current) => ({ ...current, mode: event.target.value as VideoHistoryFilters['mode'] }))
                }
                style={filterInputStyle}
              >
                <option value="">全部模式</option>
                <option value="frames">首尾帧</option>
                <option value="omni">全能参考</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <Typography.Text type="secondary">任务状态</Typography.Text>
              <select
                aria-label="任务状态筛选"
                value={historyFilterDraft.status}
                onChange={(event) =>
                  setHistoryFilterDraft((current) => ({ ...current, status: event.target.value as VideoHistoryFilters['status'] }))
                }
                style={filterInputStyle}
              >
                <option value="">全部状态</option>
                <option value="pending">排队中</option>
                <option value="processing">生成中</option>
                <option value="succeeded">已完成</option>
                <option value="failed">失败</option>
              </select>
            </label>
            <Button onClick={handleApplyFilters}>应用筛选</Button>
            <Button onClick={handleResetFilters}>重置筛选</Button>
          </div>

          {loading ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 16,
              }}
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} style={{ borderRadius: 24, border: '1px solid #e2e8f0', padding: 16 }}>
                  <Skeleton.Image active style={{ width: '100%', height: 220, borderRadius: 18 }} />
                  <Skeleton active paragraph={{ rows: 3 }} style={{ marginTop: 16 }} />
                </div>
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div
              style={{
                borderRadius: 22,
                border: '1px dashed #cbd5e1',
                background: '#f8fafc',
                minHeight: 280,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Space orientation="vertical" size={12} style={{ textAlign: 'center' }}>
                <Empty
                  description={
                    <Space orientation="vertical" size={6}>
                      <Typography.Text strong>{hasActiveHistoryFilters ? '没有匹配当前筛选条件的任务' : '当前还没有视频任务'}</Typography.Text>
                      <Typography.Text type="secondary">
                        {hasActiveHistoryFilters
                          ? '请调整关键词、时间范围、模式或状态后重试。'
                          : '先选择首帧或参考素材，系统会自动轮询生成结果。'}
                      </Typography.Text>
                    </Space>
                  }
                />
                {hasActiveHistoryFilters ? null : (
                  <Button type="primary" onClick={handleCreateFirstTask}>
                    创建首个任务
                  </Button>
                )}
              </Space>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 16,
              }}
            >
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onReplay={handleReplay}
                  onSync={handleSyncTask}
                  replaying={replayingTaskId === task.id}
                  syncing={syncingTaskId === task.id}
                />
              ))}
            </div>
          )}
          {taskTotal > taskPageSize ? (
            <Pagination
              align="center"
              current={taskPage}
              pageSize={taskPageSize}
              total={taskTotal}
              showSizeChanger={false}
              onChange={(page, pageSize) => {
                setTaskPage(page)
                setTaskPageSize(pageSize)
              }}
            />
          ) : null}
        </Space>
      </section>
    </Space>
  )
}

const buildReplayDraft = (
  replayDraft: NonNullable<VideoTaskItem['replayDraft']>,
  assets: Array<{ role: VideoReplayDraftAsset['role']; asset: AssetItem }>
): GeneratePanelReplayDraft => {
  const nextDraft: GeneratePanelReplayDraft = {
    mode: replayDraft.mode,
    model: replayDraft.model,
    ratio: replayDraft.ratio ?? '16:9',
    duration: replayDraft.duration ?? 5,
    resolution: replayDraft.resolution ?? '720p',
    generateAudio: replayDraft.generateAudio,
    promptRaw: replayDraft.promptRaw,
    firstFrame: null,
    lastFrame: null,
    references: [],
  }

  assets.forEach(({ role, asset }) => {
    if (role === 'first_frame') {
      nextDraft.firstFrame = asset
      return
    }

    if (role === 'last_frame') {
      nextDraft.lastFrame = asset
      return
    }

    nextDraft.references.push(asset)
  })

  return nextDraft
}

type VideoHistoryFilters = {
  q: string
  dateFrom: string
  dateTo: string
  mode: '' | 'frames' | 'omni'
  status: '' | VideoTaskStatus
}

const defaultHistoryFilters: VideoHistoryFilters = {
  q: '',
  dateFrom: '',
  dateTo: '',
  mode: '',
  status: '',
}

const filterInputStyle = {
  height: 32,
  borderRadius: 10,
  border: '1px solid #d9d9d9',
  padding: '0 11px',
  background: '#ffffff',
  color: '#0f172a',
}

const toUtcBoundary = (value: string, boundary: 'start' | 'end') =>
  `${value}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`
