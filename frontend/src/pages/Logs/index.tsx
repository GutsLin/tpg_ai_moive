import {
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  type TableColumnsType,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'

import {
  deleteVideoGenerationLogs,
  getVideoGenerationLogs,
  type VideoGenerationLogItem,
  type VideoGenerationLogQuery,
  type VideoGenerationLogStatus,
} from '../../api/video-generation-logs'
import { PageHeader } from '../../components/PageHeader'

interface DateValue {
  toISOString(): string
}

interface FilterFormValues {
  taskId?: number
  stage?: string
  status?: VideoGenerationLogStatus
  dateRange?: [DateValue, DateValue]
}

interface DeleteFormValues {
  dateRange: [DateValue, DateValue]
}

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 50

const stageOptions = [
  { value: 'request', label: '请求入库' },
  { value: 'asset_resolution', label: '素材解析' },
  { value: 'queue', label: '队列调度' },
  { value: 'ark_request', label: '平台创建' },
  { value: 'ark_poll', label: '平台轮询' },
  { value: 'download', label: '结果下载' },
  { value: 'oss_upload', label: 'OSS 上传' },
  { value: 'state_update', label: '状态落库' },
  { value: 'reconcile', label: '任务恢复' },
]

const statusOptions: Array<{ value: VideoGenerationLogStatus; label: string }> = [
  { value: 'started', label: '开始' },
  { value: 'succeeded', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'info', label: '信息' },
]

const statusMeta: Record<VideoGenerationLogStatus, { color: string; label: string }> = {
  started: { color: 'processing', label: '开始' },
  succeeded: { color: 'success', label: '成功' },
  failed: { color: 'error', label: '失败' },
  info: { color: 'default', label: '信息' },
}

const stageLabel = new Map(stageOptions.map((option) => [option.value, option.label]))

const formatTimestamp = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))

const formatJson = (value: unknown) => {
  if (value === null || value === undefined) {
    return '无'
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const detailCodeStyle = {
  margin: 0,
  padding: 14,
  maxHeight: 320,
  overflow: 'auto',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#f8fafc',
  color: '#1f2937',
  fontSize: 12,
  lineHeight: 1.65,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
}

export const LogsPage = () => {
  const [filterForm] = Form.useForm<FilterFormValues>()
  const [deleteForm] = Form.useForm<DeleteFormValues>()
  const [messageApi, messageContextHolder] = message.useMessage()
  const [modalApi, modalContextHolder] = Modal.useModal()
  const [items, setItems] = useState<VideoGenerationLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(DEFAULT_PAGE)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [filters, setFilters] = useState<Omit<VideoGenerationLogQuery, 'page' | 'pageSize'>>({})
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [selectedLog, setSelectedLog] = useState<VideoGenerationLogItem | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const result = await getVideoGenerationLogs({
        ...filters,
        page,
        pageSize,
      })
      setItems(result.items)
      setTotal(result.total)
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '加载生成日志失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadLogs()
  }, [filters, page, pageSize])

  const columns = useMemo<TableColumnsType<VideoGenerationLogItem>>(
    () => [
      {
        title: '时间',
        dataIndex: 'createdAt',
        width: 178,
        render: (value: string) => formatTimestamp(value),
      },
      {
        title: '任务',
        dataIndex: 'videoTaskId',
        width: 90,
        render: (value: number | null) => (value ? `#${value}` : '-'),
      },
      {
        title: '阶段',
        dataIndex: 'stage',
        width: 112,
        render: (value: string) => stageLabel.get(value) ?? value,
      },
      {
        title: '调用过程',
        key: 'process',
        width: 330,
        render: (_value, record) => (
          <Space orientation="vertical" size={2} style={{ maxWidth: 310 }}>
            <Typography.Text strong>{record.message}</Typography.Text>
            <Typography.Text type="secondary" ellipsis={{ tooltip: record.action }}>
              {record.action}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 88,
        render: (value: VideoGenerationLogStatus) => (
          <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag>
        ),
      },
      {
        title: '耗时',
        dataIndex: 'durationMs',
        width: 100,
        render: (value: number | null) => (value === null ? '-' : `${value} ms`),
      },
      {
        title: '操作人',
        dataIndex: 'userName',
        width: 120,
        render: (value: string | null, record) => value ?? (record.userId ? `用户 #${record.userId}` : '-'),
      },
      {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        width: 86,
        render: (_value, record) => (
          <Button
            type="text"
            icon={<EyeOutlined />}
            aria-label={`查看日志-${record.id}`}
            title="查看详情"
            onClick={() => setSelectedLog(record)}
          />
        ),
      },
    ],
    []
  )

  const applyFilters = (values: FilterFormValues) => {
    setPage(DEFAULT_PAGE)
    setFilters({
      taskId: values.taskId,
      stage: values.stage,
      status: values.status,
      dateFrom: values.dateRange?.[0].toISOString(),
      dateTo: values.dateRange?.[1].toISOString(),
    })
  }

  const resetFilters = () => {
    filterForm.resetFields()
    setPage(DEFAULT_PAGE)
    setFilters({})
  }

  const confirmDelete = async () => {
    let values: DeleteFormValues
    try {
      values = await deleteForm.validateFields()
    } catch {
      return
    }
    const [dateFrom, dateTo] = values.dateRange
    const payload = {
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
    }

    setDeleteModalOpen(false)
    modalApi.confirm({
      title: '确认删除所选时间段日志？',
      content: `${formatTimestamp(payload.dateFrom)} 至 ${formatTimestamp(payload.dateTo)}`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeleting(true)
        try {
          const result = await deleteVideoGenerationLogs(payload)
          void messageApi.success(`已删除 ${result.deletedCount} 条日志`)
          deleteForm.resetFields()
          setPage(DEFAULT_PAGE)
          await loadLogs()
        } catch (error: any) {
          void messageApi.error(error?.response?.data?.message ?? '删除生成日志失败')
          setDeleteModalOpen(true)
          throw error
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      {messageContextHolder}
      {modalContextHolder}
      <PageHeader
        title="生成日志"
        actions={
          <Space wrap>
            <Button aria-label="刷新" icon={<ReloadOutlined />} loading={loading} onClick={() => void loadLogs()}>
              刷新
            </Button>
            <Button
              danger
              aria-label="按时间删除"
              icon={<DeleteOutlined />}
              onClick={() => {
                deleteForm.resetFields()
                setDeleteModalOpen(true)
              }}
            >
              按时间删除
            </Button>
          </Space>
        }
      />

      <section className="logs-filter-panel">
        <Form<FilterFormValues> form={filterForm} layout="inline" onFinish={applyFilters}>
          <Form.Item name="taskId" label="任务 ID">
            <InputNumber min={1} precision={0} placeholder="任务 ID" style={{ width: 132 }} />
          </Form.Item>
          <Form.Item name="stage" label="阶段">
            <Select allowClear options={stageOptions} placeholder="全部阶段" style={{ width: 148 }} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select allowClear options={statusOptions} placeholder="全部状态" style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="dateRange" label="调用时间">
            <DatePicker.RangePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder={['开始时间', '结束时间']}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button aria-label="查询" type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button onClick={resetFilters}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </section>

      <section className="logs-table-panel">
        <Table<VideoGenerationLogItem>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          scroll={{ x: 1100 }}
          locale={{ emptyText: <Empty description="暂无生成日志" /> }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : DEFAULT_PAGE)
              setPageSize(nextPageSize)
            },
          }}
        />
      </section>

      <Drawer
        open={selectedLog !== null}
        title={selectedLog ? `日志详情 #${selectedLog.id}` : '日志详情'}
        size="large"
        onClose={() => setSelectedLog(null)}
      >
        {selectedLog ? (
          <Space orientation="vertical" size={20} style={{ width: '100%' }}>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                { key: 'time', label: '时间', children: formatTimestamp(selectedLog.createdAt) },
                { key: 'task', label: '任务', children: selectedLog.videoTaskId ? `#${selectedLog.videoTaskId}` : '-' },
                { key: 'trace', label: '追踪 ID', children: selectedLog.traceId },
                { key: 'stage', label: '阶段', children: stageLabel.get(selectedLog.stage) ?? selectedLog.stage },
                { key: 'action', label: '动作', children: selectedLog.action },
                {
                  key: 'status',
                  label: '状态',
                  children: <Tag color={statusMeta[selectedLog.status].color}>{statusMeta[selectedLog.status].label}</Tag>,
                },
                { key: 'duration', label: '耗时', children: selectedLog.durationMs === null ? '-' : `${selectedLog.durationMs} ms` },
                { key: 'message', label: '说明', children: selectedLog.message },
                { key: 'error', label: '错误', children: selectedLog.errorMessage ?? '-' },
              ]}
            />
            <div>
              <Typography.Title level={5}>调用参数</Typography.Title>
              <pre style={detailCodeStyle}>{formatJson(selectedLog.requestPayload)}</pre>
            </div>
            <div>
              <Typography.Title level={5}>调用结果</Typography.Title>
              <pre style={detailCodeStyle}>{formatJson(selectedLog.responsePayload)}</pre>
            </div>
          </Space>
        ) : null}
      </Drawer>

      <Modal
        open={deleteModalOpen}
        title="按时间段删除日志"
        okText="下一步"
        cancelText="取消"
        confirmLoading={deleting}
        onOk={() => void confirmDelete()}
        onCancel={() => setDeleteModalOpen(false)}
      >
        <Form<DeleteFormValues> form={deleteForm} layout="vertical">
          <Form.Item
            name="dateRange"
            label="删除时间段"
            rules={[{ required: true, message: '请选择完整的开始和结束时间' }]}
          >
            <DatePicker.RangePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder={['开始时间', '结束时间']}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
