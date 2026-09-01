import {
  AudioOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  DeleteOutlined,
  FileImageOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  WarningFilled,
} from '@ant-design/icons'
import { Button, Card, Checkbox, Image, Space, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'

import type { AssetCategoryItem } from '../../api/asset-categories'
import type { AssetItem } from '../../api/assets'
import { resolveVideoPreviewTime } from './video-preview'

const statusMeta: Record<
  AssetItem['arkStatus'],
  { label: string; color: string; icon: React.ReactNode; background: string; border: string }
> = {
  pending: {
    label: '待审核',
    color: '#6b7280',
    icon: <ClockCircleFilled />,
    background: '#f3f4f6',
    border: '#d1d5db',
  },
  processing: {
    label: '审核中',
    color: '#2563eb',
    icon: <LoadingOutlined spin />,
    background: '#eff6ff',
    border: '#bfdbfe',
  },
  active: {
    label: '已通过',
    color: '#15803d',
    icon: <CheckCircleFilled />,
    background: '#f0fdf4',
    border: '#bbf7d0',
  },
  failed: {
    label: '失败',
    color: '#dc2626',
    icon: <WarningFilled />,
    background: '#fef2f2',
    border: '#fecaca',
  },
  deleting: {
    label: '删除中',
    color: '#92400e',
    icon: <LoadingOutlined spin />,
    background: '#fff7ed',
    border: '#fed7aa',
  },
}

const typeMeta = {
  Image: { label: '图片', icon: <FileImageOutlined /> },
  Video: { label: '视频', icon: <PlayCircleOutlined /> },
  Audio: { label: '音频', icon: <AudioOutlined /> },
}

const providerLabels: Record<string, string> = {
  toapis: 'ToAPIs',
  volcano_ark: '火山方舟',
}

const resolveProviderLabel = (asset: AssetItem): string => {
  if (asset.syncProvider && providerLabels[asset.syncProvider]) {
    return providerLabels[asset.syncProvider]
  }
  // 未拿到平台标识时，按素材 ID 前缀推断：pa_/pg_ → ToAPIs，group-/asset-/cgt- → 火山
  const id = asset.arkAssetId ?? ''
  if (id.startsWith('pa_') || id.startsWith('pg_')) return providerLabels.toapis
  if (/^(group-|asset-|cgt-)/i.test(id)) return providerLabels.volcano_ark
  return '素材库'
}

const buildSyncMeta = (asset: AssetItem) => {
  const provider = resolveProviderLabel(asset)

  if (!asset.effectiveSync) {
    return {
      label: '未同步素材库',
      color: '#475569',
      background: '#f8fafc',
      border: '#cbd5e1',
      description: asset.groupSyncEnabled === false ? '所属素材组仅保留本地素材' : '本次生成会直接走 OSS 签名 URL',
    }
  }

  if (asset.arkAssetId && asset.arkStatus === 'active') {
    return {
      label: `${provider}已同步`,
      color: '#15803d',
      background: '#f0fdf4',
      border: '#bbf7d0',
      description: `视频生成将优先使用 asset://${provider} 素材引用`,
    }
  }

  if (asset.arkStatus === 'failed') {
    return {
      label: `${provider}同步失败`,
      color: '#dc2626',
      background: '#fef2f2',
      border: '#fecaca',
      description: '当前仍会回退走 OSS，建议检查后重新补推',
    }
  }

  return {
    label: `${provider}同步中`,
    color: '#2563eb',
    background: '#eff6ff',
    border: '#bfdbfe',
    description: `素材正在等待${provider}审核，完成前会临时走 OSS`,
  }
}

const imageFallback =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
      <defs>
        <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#ecfeff" />
          <stop offset="100%" stop-color="#f8fafc" />
        </linearGradient>
      </defs>
      <rect width="640" height="400" rx="32" fill="url(#bg)" />
      <circle cx="320" cy="168" r="52" fill="#99f6e4" />
      <path d="M180 300l76-78 58 52 72-88 74 114H180z" fill="#0f766e" opacity="0.75" />
      <text x="320" y="352" fill="#155e75" font-family="Arial, sans-serif" font-size="24" text-anchor="middle">
        signed preview unavailable
      </text>
    </svg>
  `)

const placeholderFor = (assetType: AssetItem['assetType']) => (
  <div
    style={{
      minHeight: 220,
      display: 'grid',
      placeItems: 'center',
      background:
        assetType === 'Image'
          ? 'linear-gradient(160deg, #e6fffb 0%, #f8fafc 100%)'
          : assetType === 'Video'
            ? 'linear-gradient(160deg, #e0f2fe 0%, #f8fafc 100%)'
            : 'linear-gradient(160deg, #fef3c7 0%, #f8fafc 100%)',
      color: '#334155',
      fontSize: 40,
    }}
  >
    {typeMeta[assetType].icon}
  </div>
)

const videoPreviewTimeCache = new Map<string, number>()

const buildPreviewIdentity = (asset: AssetItem) => `${asset.id}:${asset.ossKey ?? asset.assetType}`

const audioCoverStyle = {
  width: '100%',
  minHeight: 220,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  background: 'linear-gradient(160deg, #fef3c7 0%, #fff7ed 45%, #f8fafc 100%)',
}

const ImageCover = ({ asset }: { asset: AssetItem }) => {
  const sourceUrl = asset.thumbnailUrl
  const previewIdentity = buildPreviewIdentity(asset)
  const latestSourceUrlRef = useRef(sourceUrl)
  const previewIdentityRef = useRef(previewIdentity)
  const [displaySourceUrl, setDisplaySourceUrl] = useState(sourceUrl)

  useEffect(() => {
    latestSourceUrlRef.current = sourceUrl
  }, [sourceUrl])

  useEffect(() => {
    const identityChanged = previewIdentityRef.current !== previewIdentity
    previewIdentityRef.current = previewIdentity

    setDisplaySourceUrl((current) => {
      if (!sourceUrl) {
        return current
      }

      if (identityChanged || !current) {
        return sourceUrl
      }

      return current
    })
  }, [previewIdentity, sourceUrl])

  return (
    <Image
      src={displaySourceUrl}
      alt={asset.name}
      preview={Boolean(displaySourceUrl)}
      style={{ height: 220, objectFit: 'cover' }}
      fallback={imageFallback}
      onError={() => {
        const latestSourceUrl = latestSourceUrlRef.current
        if (latestSourceUrl && latestSourceUrl !== displaySourceUrl) {
          setDisplaySourceUrl(latestSourceUrl)
          return false
        }

        return true
      }}
    />
  )
}

const VideoCover = ({ asset }: { asset: AssetItem }) => {
  const sourceUrl = asset.sourceUrl || asset.thumbnailUrl
  const previewIdentity = buildPreviewIdentity(asset)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const latestSourceUrlRef = useRef(sourceUrl)
  const previewIdentityRef = useRef(previewIdentity)
  const [displaySourceUrl, setDisplaySourceUrl] = useState(sourceUrl)
  const [previewReady, setPreviewReady] = useState(false)

  useEffect(() => {
    latestSourceUrlRef.current = sourceUrl
  }, [sourceUrl])

  const handleLoadedMetadata = async () => {
    const video = videoRef.current
    if (!video || !displaySourceUrl) {
      return
    }

    const cachedTime = videoPreviewTimeCache.get(displaySourceUrl)
    const previewTime = cachedTime ?? (await resolveVideoPreviewTime(video))
    videoPreviewTimeCache.set(displaySourceUrl, previewTime)

    try {
      video.currentTime = previewTime
    } catch {
      // ignore and keep browser default preview frame
    }
    setPreviewReady(true)
  }

  useEffect(() => {
    const identityChanged = previewIdentityRef.current !== previewIdentity
    previewIdentityRef.current = previewIdentity

    setDisplaySourceUrl((current) => {
      if (!sourceUrl) {
        return current
      }

      if (identityChanged || !current) {
        return sourceUrl
      }

      return current
    })
  }, [previewIdentity, sourceUrl])

  useEffect(() => {
    setPreviewReady(false)
  }, [displaySourceUrl])

  return (
    <video
      ref={videoRef}
      aria-label={`视频预览-${asset.id}`}
      src={displaySourceUrl}
      onLoadedMetadata={() => {
        void handleLoadedMetadata()
      }}
      onError={() => {
        const latestSourceUrl = latestSourceUrlRef.current
        if (latestSourceUrl && latestSourceUrl !== displaySourceUrl) {
          setDisplaySourceUrl(latestSourceUrl)
        }
      }}
      controls
      preload="metadata"
      playsInline
      crossOrigin="anonymous"
      style={{
        width: '100%',
        height: 220,
        objectFit: 'contain',
        background: '#0f172a',
        display: 'block',
        opacity: previewReady ? 1 : 0.01,
        transition: 'opacity 0.2s ease',
      }}
    />
  )
}

const AudioCover = ({ asset }: { asset: AssetItem }) => {
  const sourceUrl = asset.sourceUrl || asset.thumbnailUrl

  if (!sourceUrl) {
    return placeholderFor(asset.assetType)
  }

  return (
    <div style={audioCoverStyle}>
      <audio
        aria-label={`音频播放-${asset.id}`}
        src={sourceUrl}
        controls
        preload="metadata"
        style={{ width: '100%' }}
      />
    </div>
  )
}

const renderCover = (asset: AssetItem) => {
  if (asset.assetType === 'Image') {
    return <ImageCover asset={asset} />
  }

  if (asset.assetType === 'Video') {
    return <VideoCover asset={asset} />
  }

  if (asset.assetType === 'Audio') {
    return <AudioCover asset={asset} />
  }

  return placeholderFor(asset.assetType)
}

export const AssetCard = ({
  asset,
  categories,
  deleting,
  readonly,
  showProjectNames,
  onDelete,
  selectable,
  selected,
  selectDisabled,
  selectDisabledReason,
  onSelect,
}: {
  asset: AssetItem
  categories: AssetCategoryItem[]
  deleting: boolean
  readonly?: boolean
  showProjectNames?: boolean
  onDelete: (asset: AssetItem) => void
  selectable?: boolean
  selected?: boolean
  selectDisabled?: boolean
  selectDisabledReason?: string
  onSelect?: (asset: AssetItem, checked: boolean) => void
}) => {
  const status = statusMeta[asset.arkStatus]
  const category = categories.find((item) => item.id === asset.categoryId)
  const syncMeta = buildSyncMeta(asset)
  const showReviewStatus = asset.effectiveSync !== false
  const syncModeValue = asset.syncMode ?? 'inherit'
  const syncModeLabel =
    syncModeValue === 'enabled' ? '立即同步素材库' : syncModeValue === 'disabled' ? '仅保留本地' : '跟随素材组'
  const cardActions = readonly
    ? undefined
    : [
        <Tooltip key="delete" title="删除">
          <Button
            type="text"
            danger
            aria-label={`删除素材-${asset.id}`}
            icon={<DeleteOutlined />}
            loading={deleting}
            onClick={() => onDelete(asset)}
          />
        </Tooltip>,
      ]

  return (
    <Card
      hoverable
      style={{
        borderRadius: 28,
        overflow: 'hidden',
        borderColor: selected ? '#115e59' : '#dbe4ea',
        boxShadow: selected ? '0 0 0 2px rgba(17, 94, 89, 0.3)' : '0 20px 48px rgba(15, 23, 42, 0.05)',
      }}
      cover={
        selectable ? (
          <div style={{ position: 'relative' }}>
            <Tooltip title={selectDisabled ? (selectDisabledReason ?? '该素材当前不可选择') : ''}>
              <span>
                <Checkbox
                  checked={selected}
                  disabled={selectDisabled}
                  onChange={(e) => onSelect?.(asset, e.target.checked)}
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    zIndex: 2,
                    background: 'rgba(255,255,255,0.9)',
                    borderRadius: 4,
                    padding: '2px 6px',
                  }}
                />
              </span>
            </Tooltip>
            {renderCover(asset)}
          </div>
        ) : (
          renderCover(asset)
        )
      }
      actions={cardActions}
    >
      <Space orientation="vertical" size={14} style={{ width: '100%' }}>
        <Space size={8} wrap>
          {showReviewStatus ? (
            <Tag
              style={{
                borderRadius: 999,
                paddingInline: 10,
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
          ) : null}
          <Tag
            style={{
              borderRadius: 999,
              paddingInline: 10,
              marginInlineEnd: 0,
              color: '#0f766e',
              borderColor: '#99f6e4',
              background: '#f0fdfa',
            }}
          >
            {typeMeta[asset.assetType].label}
          </Tag>
          <Tag
            style={{
              borderRadius: 999,
              paddingInline: 10,
              marginInlineEnd: 0,
              color: syncMeta.color,
              borderColor: syncMeta.border,
              background: syncMeta.background,
            }}
          >
            {syncMeta.label}
          </Tag>
        </Space>

        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {asset.name}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', minHeight: 44 }}>
            {category ? `业务分类：${category.name}` : '未分类'}
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            上传人：{asset.uploaderName || '未知用户'}
          </Typography.Paragraph>
          {asset.tags.length > 0 ? (
            <Space size={[8, 8]} wrap style={{ marginTop: 8 }}>
              {asset.tags.map((tag) => (
                <Tag key={tag} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                  {tag}
                </Tag>
              ))}
            </Space>
          ) : null}
          {showProjectNames && (asset.projectNames?.length ?? 0) > 0 ? (
            <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
              关联项目：{asset.projectNames?.join(' / ')}
            </Typography.Paragraph>
          ) : null}
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            {syncMeta.description}
          </Typography.Paragraph>
        </div>

        {asset.tags.length > 0 ? (
          <Space size={[8, 8]} wrap>
            {asset.tags.map((tag) => (
              <Tag key={tag} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                #{tag}
              </Tag>
            ))}
          </Space>
        ) : null}

        <div>
          <Typography.Text type="secondary">素材同步策略</Typography.Text>
          <Typography.Paragraph style={{ margin: '8px 0 0', color: '#1f2937', fontWeight: 600 }}>
            {syncModeLabel}
          </Typography.Paragraph>
          {asset.groupSyncEnabled === false ? (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
              所属素材组未开启同步，当前素材固定为仅本地素材。
            </Typography.Text>
          ) : null}
        </div>

        {asset.arkStatus === 'failed' && asset.arkError ? (
          <Typography.Text style={{ color: '#b91c1c' }}>{asset.arkError}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">
            {new Date(asset.createdAt).toLocaleString('zh-CN', { hour12: false })}
          </Typography.Text>
        )}
      </Space>
    </Card>
  )
}
