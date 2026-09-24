import { DownloadOutlined, FileTextOutlined, GlobalOutlined } from '@ant-design/icons'
import { Alert, Button, DatePicker, Dropdown, Empty, Skeleton, Space, Typography, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  exportVideoAnalytics,
  exportVideoTaskDetails,
  getVideoAnalytics,
  type VideoAnalyticsResponse,
  type VideoTaskStatus,
} from '../../api/videos'
import { PageHeader } from '../../components/PageHeader'
import { useAuth } from '../../stores/auth'
import { formatCompactNumber, formatDurationSeconds, formatPercent } from '../../utils/analytics-format'

const { RangePicker } = DatePicker
type RangePickerValue = Parameters<NonNullable<React.ComponentProps<typeof RangePicker>['onChange']>>[0]

const panelStyle = {
  borderRadius: 28,
  border: '1px solid #dbe4ea',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.05)',
  padding: 24,
}

const modelOptions = [
  { label: '全部模型', value: '' },
  { label: 'Seedance 2', value: 'seedance-2' },
  { label: 'Seedance 2 fast', value: 'seedance-2-fast' },
  { label: 'Seedance 2.5', value: 'seedance-2-5' },
  { label: 'Seedance 2.0（历史）', value: 'doubao-seedance-2-0-260128' },
  { label: 'Seedance 2.0 fast（历史）', value: 'doubao-seedance-2-0-fast-260128' },
]

const statusOptions: Array<{ label: string; value: '' | VideoTaskStatus }> = [
  { label: '全部状态', value: '' },
  { label: '排队中', value: 'pending' },
  { label: '生成中', value: 'processing' },
  { label: '已完成', value: 'succeeded' },
  { label: '失败', value: 'failed' },
]

const statusLabelMap: Record<VideoTaskStatus, string> = {
  pending: '排队中',
  processing: '生成中',
  succeeded: '已完成',
  failed: '失败',
}

interface AnalyticsFilters {
  mine: boolean
  model: string
  status: '' | VideoTaskStatus
  dateRange: RangePickerValue | null
}

const defaultFilters: AnalyticsFilters = {
  mine: false,
  model: '',
  status: '',
  dateRange: null,
}

const createEmptyAnalyticsData = (): VideoAnalyticsResponse => ({
  overview: {
    totalRequests: 0,
    successRate: 0,
    avgDurationSeconds: 0,
    totalTokensConsumed: 0,
    totalTokensSucceeded: 0,
    avgTokensPerTask: 0,
  },
  statusDistribution: [],
  modelDistribution: [],
  userTokenDistribution: [],
})

const toRequestParams = (filters: AnalyticsFilters) => {
  const [dateFrom, dateTo] = filters.dateRange ?? []
  const params: {
    mine?: boolean
    model?: string
    status?: VideoTaskStatus
    dateFrom?: string
    dateTo?: string
  } = {}

  if (filters.mine) {
    params.mine = true
  }

  if (filters.model) {
    params.model = filters.model
  }

  if (filters.status) {
    params.status = filters.status
  }

  if (dateFrom) {
    params.dateFrom = dateFrom.startOf('day').toISOString()
  }

  if (dateTo) {
    params.dateTo = dateTo.endOf('day').toISOString()
  }

  return params
}

export const AnalyticsPage = () => {
  const { state, refreshSession } = useAuth()
  const canViewAll = state.user?.role === 'admin' || state.activeProjectRole === 'manager'
  const canExportAllProjects = state.user?.role === 'admin'
  const activeProject = state.projects.find((project) => project.id === state.activeProjectId) ?? null
  const [draftFilters, setDraftFilters] = useState<AnalyticsFilters>(defaultFilters)
  const [activeFilters, setActiveFilters] = useState<AnalyticsFilters>(defaultFilters)
  const [data, setData] = useState<VideoAnalyticsResponse>(createEmptyAnalyticsData)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [exportingScope, setExportingScope] = useState<'current' | 'all' | null>(null)
  const [exportingTaskDetails, setExportingTaskDetails] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const sessionRefreshAttempted = useRef(false)

  // A cached token can outlive the project cache (for example after a browser
  // cache clear or a deployment). Restore the project context before treating
  // the page as an empty result; the API requires X-Project-Id for analytics.
  useEffect(() => {
    if (
      !state.hydrated ||
      !state.token ||
      !state.user ||
      state.projectScoped ||
      state.activeProjectId !== null ||
      sessionRefreshAttempted.current
    ) {
      return
    }

    sessionRefreshAttempted.current = true
    void refreshSession().catch(() => {
      // The normal auth interceptor handles an expired token. Keep the page
      // usable when a transient session refresh fails.
    })
  }, [refreshSession, state.activeProjectId, state.hydrated, state.projectScoped, state.token, state.user])

  useEffect(() => {
    if (!state.hydrated) {
      return
    }

    if (canViewAll) {
      return
    }

    setDraftFilters((current) => ({ ...current, mine: true }))
    setActiveFilters((current) => ({ ...current, mine: true }))
  }, [canViewAll, state.hydrated])

  useEffect(() => {
    if (!state.hydrated) {
      return
    }

    if (state.activeProjectId === null) {
      setLoading(false)
      return
    }

    let cancelled = false

    const loadAnalytics = async () => {
      setLoading(true)
      setErrorMessage(null)

      try {
        const result = await getVideoAnalytics(
          toRequestParams(canViewAll ? activeFilters : { ...activeFilters, mine: true })
        )
        if (!cancelled) {
          setData(result)
        }
      } catch (error: any) {
        if (!cancelled) {
          setErrorMessage(error?.response?.data?.message ?? '加载统计数据失败，请稍后重试')
          setData(createEmptyAnalyticsData())
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadAnalytics()

    return () => {
      cancelled = true
    }
  }, [activeFilters, canViewAll, state.activeProjectId, state.hydrated])

  const overviewItems = useMemo(
    () => [
      { label: '总请求次数', value: `${data.overview.totalRequests}` },
      { label: '生成成功率', value: formatPercent(data.overview.successRate) },
      { label: '平均视频时长', value: formatDurationSeconds(data.overview.avgDurationSeconds) },
      { label: '消耗总 Token', value: formatCompactNumber(data.overview.totalTokensConsumed) },
      { label: '生成总 Token', value: formatCompactNumber(data.overview.totalTokensSucceeded) },
      { label: '平均任务 Token', value: formatCompactNumber(data.overview.avgTokensPerTask) },
    ],
    [data]
  )

  const hasDistributionData =
    data.statusDistribution.length > 0 ||
    data.modelDistribution.length > 0 ||
    data.userTokenDistribution.length > 0

  const handleExport = async (scope: 'current' | 'all') => {
    setExportingScope(scope)

    try {
      const effectiveFilters = canViewAll ? activeFilters : { ...activeFilters, mine: true }
      const blob = await exportVideoAnalytics({
        ...toRequestParams(effectiveFilters),
        scope,
      })
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('导出文件为空')
      }

      const dateTag = new Date()
        .toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
        .replace(/-/g, '')
      const statusTag = effectiveFilters.status ? `_${effectiveFilters.status}` : ''
      const fileName = `Narrix${scope === 'all' ? '全项目' : '当前项目'}统计_${dateTag}${statusTag}.csv`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      void messageApi.success('CSV 导出成功')
    } catch (error: any) {
      let exportError = error?.response?.data?.message ?? error?.message ?? '导出失败，请稍后重试'
      if (error?.response?.data instanceof Blob) {
        try {
          const responseText = await error.response.data.text()
          const responseBody = JSON.parse(responseText)
          exportError = responseBody?.message ?? exportError
        } catch {
          // Keep the original request error when the response is not JSON.
        }
      }
      void messageApi.error(exportError)
    } finally {
      setExportingScope(null)
    }
  }

  const handleExportTaskDetails = async () => {
    // 明细导出使用当前控件中的时间范围，不要求用户先刷新汇总卡片。
    const effectiveFilters = canViewAll ? draftFilters : { ...draftFilters, mine: true }
    const [dateFrom, dateTo] = effectiveFilters.dateRange ?? []
    if (!dateFrom || !dateTo) {
      void messageApi.warning('请先选择完整的时间范围，再导出用户任务明细')
      return
    }

    setExportingTaskDetails(true)
    try {
      const blob = await exportVideoTaskDetails({
        dateFrom: dateFrom.startOf('day').toISOString(),
        dateTo: dateTo.endOf('day').toISOString(),
        scope: canExportAllProjects ? 'all' : 'current',
        mine: effectiveFilters.mine,
      })
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('导出文件为空')
      }

      const csvText = await blob.text()
      const dataRows = csvText
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .slice(1)
        .filter((line) => line.trim().length > 0)
      if (dataRows.length === 0) {
        throw new Error('当前时间范围内没有可导出的任务数据')
      }

      const fileName = `Narrix用户任务明细_${dateFrom.format('YYYYMMDD')}-${dateTo.format('YYYYMMDD')}.csv`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      // 大 CSV 在部分浏览器中会在 click 返回前才开始读取 Blob，延迟释放避免空文件。
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      void messageApi.success('用户任务明细导出成功')
    } catch (error: any) {
      let exportError = error?.response?.data?.message ?? error?.message ?? '导出失败，请稍后重试'
      if (error?.response?.data instanceof Blob) {
        try {
          const responseText = await error.response.data.text()
          const responseBody = JSON.parse(responseText)
          exportError = responseBody?.message ?? exportError
        } catch {
          // Keep the original request error when the response is not JSON.
        }
      }
      void messageApi.error(exportError)
    } finally {
      setExportingTaskDetails(false)
    }
  }

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      {contextHolder}
      <PageHeader
        title="数据统计"
        description="按当前项目汇总视频任务请求、成功率、Token 消耗和用户分布。统计口径与任务历史页保持一致。"
        actions={
          <Dropdown
            disabled={exportingScope !== null || exportingTaskDetails}
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'current',
                  label: '导出当前项目',
                  icon: <DownloadOutlined />,
                  onClick: () => void handleExport('current'),
                },
                ...(canExportAllProjects
                  ? [{
                      key: 'all',
                      label: '导出全部项目',
                      icon: <GlobalOutlined />,
                      onClick: () => void handleExport('all'),
                    }]
                  : []),
                {
                  key: 'task-details',
                  label: '导出用户任务明细',
                  icon: <FileTextOutlined />,
                  onClick: () => void handleExportTaskDetails(),
                },
              ],
            }}
          >
            <Button aria-label="导出 CSV" icon={<DownloadOutlined />} loading={exportingScope !== null || exportingTaskDetails}>
              导出 CSV
            </Button>
          </Dropdown>
        }
      />

      <section style={panelStyle}>
        <Space orientation="vertical" size={18} style={{ width: '100%' }}>
          <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                筛选区
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                先锁定统计范围，再刷新卡片和分布模块。非项目管理员只会看到自己的任务统计。
              </Typography.Paragraph>
            </div>
            <div
              role="group"
              aria-label="统计范围"
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
                { label: '全部任务', value: false, disabled: !canViewAll },
                { label: '仅看我的', value: true, disabled: false },
              ].map((item) => {
                const active = draftFilters.mine === item.value
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => setDraftFilters((current) => ({ ...current, mine: item.value }))}
                    style={{
                      border: 'none',
                      borderRadius: 999,
                      padding: '10px 16px',
                      background: active ? '#111827' : 'transparent',
                      color: item.disabled ? '#94a3b8' : active ? '#f8fafc' : '#475569',
                      fontWeight: 600,
                      cursor: item.disabled ? 'not-allowed' : 'pointer',
                      opacity: item.disabled ? 0.7 : 1,
                    }}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </Space>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <div>
              <Typography.Text type="secondary">时间范围</Typography.Text>
              <RangePicker
                style={{ width: '100%', marginTop: 8 }}
                value={draftFilters.dateRange ?? null}
                onChange={(value) => {
                  setDraftFilters((current) => ({
                    ...current,
                    dateRange: value ? [value[0], value[1]] : null,
                  }))
                }}
              />
            </div>
            <FilterSelect
              label="模型"
              ariaLabel="模型筛选"
              value={draftFilters.model}
              options={modelOptions}
              onChange={(value) => setDraftFilters((current) => ({ ...current, model: value }))}
            />
            <FilterSelect
              label="任务状态"
              ariaLabel="任务状态筛选"
              value={draftFilters.status}
              options={statusOptions}
              onChange={(value) => setDraftFilters((current) => ({ ...current, status: value as '' | VideoTaskStatus }))}
            />
          </div>

          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button
              onClick={() =>
                setDraftFilters({
                  ...defaultFilters,
                  mine: !canViewAll,
                })
              }
            >
              重置筛选
            </Button>
            <Button
              type="primary"
              onClick={() =>
                setActiveFilters({
                  ...draftFilters,
                  mine: canViewAll ? draftFilters.mine : true,
                })
              }
            >
              更新统计
            </Button>
          </Space>
        </Space>
      </section>

      {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}

      <section style={panelStyle}>
        <Space orientation="vertical" size={18} style={{ width: '100%' }}>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              核心指标概览
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              第一阶段基于已落库的任务数据统计，失败任务若已回写 Token 也会纳入消耗口径。
            </Typography.Paragraph>
          </div>

          {loading ? (
            <div aria-label="统计加载中">
              <Skeleton active paragraph={{ rows: 6 }} />
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              {overviewItems.map((item, index) => (
                <div
                  key={item.label}
                  style={{
                    borderRadius: 20,
                    border: '1px solid #e2e8f0',
                    background: index % 2 === 0 ? '#fbf7ef' : '#f2fbf8',
                    padding: '16px 18px',
                  }}
                >
                  <Typography.Text type="secondary">{item.label}</Typography.Text>
                  <Typography.Title level={4} style={{ margin: '10px 0 0' }}>
                    {item.value}
                  </Typography.Title>
                </div>
              ))}
            </div>
          )}
        </Space>
      </section>

      {loading ? null : hasDistributionData ? (
        <>
          <DistributionSection title="任务状态分布">
            {data.statusDistribution.map((item) => (
              <DistributionRow
                key={item.status}
                label={statusLabelMap[item.status]}
                value={`${item.count}`}
                ratio={data.overview.totalRequests > 0 ? item.count / data.overview.totalRequests : 0}
              />
            ))}
          </DistributionSection>

          <DistributionSection title="模型使用分布">
            {data.modelDistribution.map((item) => (
              <DistributionRow
                key={item.model}
                label={item.model}
                value={`${item.count}`}
                ratio={data.overview.totalRequests > 0 ? item.count / data.overview.totalRequests : 0}
              />
            ))}
          </DistributionSection>

          <DistributionSection title="用户 Token 分布">
            {data.userTokenDistribution.map((item) => (
              <DistributionRow
                key={item.userId}
                label={`${item.userName} · ${item.requestCount} 次`}
                value={formatCompactNumber(item.totalTokens)}
                ratio={item.shareRatio}
              />
            ))}
          </DistributionSection>
        </>
      ) : (
        <section style={panelStyle}>
          <Empty
            description={
              <Space orientation="vertical" size={4}>
                <Typography.Text>当前筛选范围内暂无统计数据</Typography.Text>
                <Typography.Text type="secondary">
                  项目：{activeProject?.name ?? '未选择项目'} · 范围：{canViewAll && !activeFilters.mine ? '全部任务' : '仅看我的'} ·
                  模型：{activeFilters.model || '全部'} · 状态：{activeFilters.status ? statusLabelMap[activeFilters.status] : '全部'}
                </Typography.Text>
                {!activeProject ? (
                  <Typography.Text type="warning">正在恢复项目上下文，请稍后点击“更新统计”。</Typography.Text>
                ) : null}
              </Space>
            }
          />
        </section>
      )}
    </Space>
  )
}

const DistributionSection = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
  <section style={panelStyle}>
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        {children}
      </Space>
    </Space>
  </section>
)

const DistributionRow = ({
  label,
  value,
  ratio,
}: {
  label: string
  value: string
  ratio: number
}) => (
  <div
    style={{
      borderRadius: 18,
      border: '1px solid #e2e8f0',
      background: '#ffffff',
      padding: '14px 16px',
    }}
  >
    <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
      <Typography.Text style={{ color: '#0f172a' }}>{label}</Typography.Text>
      <Typography.Text strong>{value}</Typography.Text>
    </Space>
    <div
      style={{
        marginTop: 10,
        height: 10,
        borderRadius: 999,
        background: '#e2e8f0',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.max(6, Math.round(ratio * 100))}%`,
          height: '100%',
          borderRadius: 999,
          background: 'linear-gradient(90deg, #0f766e 0%, #f59e0b 100%)',
        }}
      />
    </div>
    <Typography.Text type="secondary" style={{ display: 'inline-block', marginTop: 8 }}>
      占比 {formatPercent(ratio)}
    </Typography.Text>
  </div>
)

const FilterSelect = ({
  label,
  ariaLabel,
  value,
  options,
  onChange,
}: {
  label: string
  ariaLabel: string
  value: string
  options: Array<{ label: string; value: string }>
  onChange: (value: string) => void
}) => (
  <div>
    <Typography.Text type="secondary">{label}</Typography.Text>
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        width: '100%',
        marginTop: 8,
        minHeight: 40,
        borderRadius: 12,
        border: '1px solid #d1d5db',
        padding: '0 12px',
        background: '#ffffff',
        color: '#0f172a',
      }}
    >
      {options.map((option) => (
        <option key={option.value || 'all'} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
)
