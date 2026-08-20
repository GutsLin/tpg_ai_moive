import { CheckCircleFilled, ClockCircleFilled, LoadingOutlined, ReloadOutlined, WarningFilled } from '@ant-design/icons'
import { Button, Space, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'

import type { VideoTaskItem } from '../../api/videos'

const formatDuration = (seconds: number) => {
  if (seconds < 60) {
    return `${seconds} 秒`
  }

  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  if (remainSeconds === 0) {
    return `${minutes} 分钟`
  }

  return `${minutes} 分 ${remainSeconds} 秒`
}

const buildStatusDescription = (task: VideoTaskItem) => {
  if (task.status === 'failed') {
    return task.errorMessage ?? '任务失败'
  }

  if (task.status === 'succeeded') {
    return '视频已生成完成，可直接预览或下载。'
  }

  const elapsedText = typeof task.elapsedSeconds === 'number' ? `已耗时 ${formatDuration(task.elapsedSeconds)}` : null
  const estimateText =
    typeof task.estimatedTotalSeconds === 'number' && (task.estimateSampleSize ?? 0) > 0
      ? `同规格历史任务通常约 ${formatDuration(task.estimatedTotalSeconds)} 完成`
      : null
  const providerLabel = task.providerSnapshot?.name ?? (task.providerKey === 'toapis' ? 'ToAPIs' : '视频平台')

  if (task.status === 'pending') {
    return [ `${providerLabel}队列排队中`, elapsedText, estimateText ].filter(Boolean).join('，')
  }

  if (task.nextPollAt) {
    return [ `已加入状态拉取队列，等待后台查询${providerLabel}状态`, elapsedText, estimateText ].filter(Boolean).join('，')
  }

  return [ `${providerLabel}开始生成`, elapsedText, estimateText ].filter(Boolean).join('，')
}

const statusMeta: Record<
  VideoTaskItem['status'],
  { label: string; color: string; background: string; border: string; icon: React.ReactNode }
> = {
  pending: {
    label: '排队中',
    color: '#2563eb',
    background: '#eff6ff',
    border: '#bfdbfe',
    icon: <ClockCircleFilled />,
  },
  processing: {
    label: '生成中',
    color: '#2563eb',
    background: '#eff6ff',
    border: '#bfdbfe',
    icon: <LoadingOutlined spin />,
  },
  succeeded: {
    label: '已完成',
    color: '#15803d',
    background: '#f0fdf4',
    border: '#bbf7d0',
    icon: <CheckCircleFilled />,
  },
  failed: {
    label: '失败',
    color: '#dc2626',
    background: '#fef2f2',
    border: '#fecaca',
    icon: <WarningFilled />,
  },
}

export const TaskCard = ({
  task,
  onReplay,
  onSync,
  replaying = false,
  syncing = false,
}: {
  task: VideoTaskItem
  onReplay?: (taskId: number) => void
  onSync?: (taskId: number) => void
  replaying?: boolean
  syncing?: boolean
}) => {
  const status = statusMeta[task.status]
  const statusDescription = buildStatusDescription(task)
  const fullPrompt = task.promptRaw || task.prompt
  const modeLabel = task.mode === 'frames' ? '首尾帧' : task.mode === 'omni' ? '全能参考' : null
  const canSyncFailedTask = Boolean(onSync && task.status === 'failed' && task.arkTaskId)
  const latestVideoUrlRef = useRef(task.videoUrl)
  const [displayVideoUrl, setDisplayVideoUrl] = useState(task.videoUrl)

  useEffect(() => {
    latestVideoUrlRef.current = task.videoUrl
  }, [task.videoUrl])

  useEffect(() => {
    setDisplayVideoUrl((current) => {
      if (!task.videoUrl) {
        return current
      }

      if (!current) {
        return task.videoUrl
      }

      return current
    })
  }, [task.id, task.videoUrl])

  return (
    <section
      style={{
        borderRadius: 28,
        border: '1px solid #dbe4ea',
        background: '#ffffff',
        boxShadow: '0 22px 54px rgba(15, 23, 42, 0.05)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          minHeight: 220,
          background:
            task.status === 'succeeded'
              ? 'linear-gradient(180deg, rgba(15,118,110,0.08) 0%, rgba(248,250,252,1) 100%)'
              : 'linear-gradient(180deg, rgba(37,99,235,0.06) 0%, rgba(248,250,252,1) 100%)',
          display: 'grid',
          placeItems: 'center',
          padding: 18,
        }}
      >
        {modeLabel ? (
          <Tag
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              zIndex: 1,
              borderRadius: 999,
              marginInlineEnd: 0,
              borderColor: '#d6d3d1',
              background: 'rgba(250, 250, 249, 0.94)',
              color: '#44403c',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {modeLabel}
          </Tag>
        ) : null}
        {displayVideoUrl ? (
          <video
            aria-label={`视频播放-${task.prompt}`}
            src={displayVideoUrl}
            controls
            onError={() => {
              const latestVideoUrl = latestVideoUrlRef.current
              if (latestVideoUrl && latestVideoUrl !== displayVideoUrl) {
                setDisplayVideoUrl(latestVideoUrl)
              }
            }}
            style={{ width: '100%', borderRadius: 18, maxHeight: 240, objectFit: 'contain' }}
          />
        ) : (
          <Space
            aria-label={canSyncFailedTask ? '失败任务操作区' : undefined}
            orientation="vertical"
            size={12}
            style={{ textAlign: 'center', width: '100%', maxWidth: 520 }}
          >
            {task.status === 'failed' ? <WarningFilled style={{ color: '#dc2626', fontSize: 36 }} /> : <ClockCircleFilled style={{ color: '#2563eb', fontSize: 36 }} />}
            <Typography.Text type="secondary" style={{ display: 'block', width: '100%', lineHeight: 1.65, wordBreak: 'break-word' }}>
              {statusDescription}
            </Typography.Text>
            {canSyncFailedTask ? (
              <Button
                type="primary"
                size="small"
                icon={<ReloadOutlined />}
                loading={syncing}
                disabled={syncing}
                aria-label={`重新拉取任务状态-${task.id}`}
                onClick={() => onSync?.(task.id)}
              >
                重新拉取状态
              </Button>
            ) : null}
          </Space>
        )}
      </div>

      <div style={{ padding: 18 }}>
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Tag
            style={{
              borderRadius: 999,
              borderColor: status.border,
              background: status.background,
              color: status.color,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginInlineEnd: 0,
            }}
          >
            {status.icon}
            {status.label}
          </Tag>

          <div>
            <Tooltip title={fullPrompt} mouseEnterDelay={0}>
              <div
                aria-label="完整提示词"
                style={{
                  margin: 0,
                  display: '-webkit-box',
                  width: '100%',
                  maxWidth: '100%',
                  lineHeight: 1.45,
                  maxHeight: '2.9em',
                  WebkitLineClamp: '2',
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                  color: '#0f172a',
                  fontSize: 18,
                  fontWeight: 700,
                  cursor: 'help',
                }}
              >
                {fullPrompt}
              </div>
            </Tooltip>
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              {task.model} / {task.resolution} / {task.ratio} / {task.duration ?? '-'}s
            </Typography.Paragraph>
          </div>

          <Space aria-label="任务卡片底部操作区" align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary">
              {new Date(task.createdAt).toLocaleString('zh-CN', { hour12: false })}
            </Typography.Text>
            {onReplay ? (
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                loading={replaying}
                aria-label={`重新生成任务-${task.id}`}
                onClick={() => onReplay(task.id)}
              >
                重新生成
              </Button>
            ) : null}
          </Space>
        </Space>
      </div>
    </section>
  )
}
