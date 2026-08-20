import { CheckCircleFilled, SearchOutlined } from '@ant-design/icons'
import { Button, Empty, Input, Modal, Segmented, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'

import { getAssets, type AssetItem } from '../../api/assets'
import { AssetMediaPreview } from './AssetMediaPreview'

const assetTypeLabels = {
  Image: '图片',
  Video: '视频',
  Audio: '音频',
} as const

export const AssetPickerModal = ({
  open,
  title,
  acceptedTypes,
  onClose,
  onPick,
}: {
  open: boolean
  title: string
  acceptedTypes: Array<'Image' | 'Video' | 'Audio'>
  onClose: () => void
  onPick: (asset: AssetItem) => void
}) => {
  const [items, setItems] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [draftKeyword, setDraftKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'Image' | 'Video' | 'Audio'>('all')
  const acceptedTypesKey = acceptedTypes.join(',')
  const singleAcceptedType = acceptedTypes.length === 1 ? acceptedTypes[0] : null
  const effectiveTypeFilter =
    singleAcceptedType ?? (typeFilter !== 'all' && acceptedTypes.includes(typeFilter) ? typeFilter : 'all')

  useEffect(() => {
    setTypeFilter(singleAcceptedType ?? 'all')
  }, [acceptedTypesKey, singleAcceptedType])

  useEffect(() => {
    if (!open) {
      return
    }

    let active = true

    const load = async () => {
      setLoading(true)
      try {
        const result = await getAssets({
          page: 1,
          pageSize: 60,
          keyword,
          assetType: effectiveTypeFilter === 'all' ? undefined : effectiveTypeFilter,
        })
        if (active) {
          setItems(result.items.filter((item) => acceptedTypes.includes(item.assetType)))
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [open, keyword, effectiveTypeFilter, acceptedTypesKey])

  return (
    <Modal open={open} title={title} footer={null} width={880} onCancel={onClose} destroyOnHidden>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Input
            value={draftKeyword}
            placeholder="搜索已通过的素材"
            prefix={<SearchOutlined />}
            style={{ width: 260 }}
            onChange={(event) => setDraftKeyword(event.target.value)}
            onPressEnter={() => setKeyword(draftKeyword.trim())}
          />
          <Space wrap>
            <Button onClick={() => setKeyword(draftKeyword.trim())}>应用搜索</Button>
            {singleAcceptedType ? null : (
              <Segmented
                value={effectiveTypeFilter}
                onChange={(value) => setTypeFilter(value as typeof typeFilter)}
                options={[
                  { label: '全部类型', value: 'all' },
                  ...acceptedTypes.map((item) => ({
                    label: assetTypeLabels[item],
                    value: item,
                  })),
                ]}
              />
            )}
          </Space>
        </Space>

        {loading ? (
          <div style={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>
            <Typography.Text type="secondary">正在加载可用素材…</Typography.Text>
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              borderRadius: 20,
              border: '1px dashed #cbd5e1',
              background: '#f8fafc',
              padding: '40px 16px',
            }}
          >
            <Empty description="当前没有可用的已通过素材" />
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  borderRadius: 20,
                  border: '1px solid #dbe4ea',
                  background: '#ffffff',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: 136,
                    background: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 12,
                    overflow: 'hidden',
                  }}
                >
                  <AssetMediaPreview
                    asset={item}
                    imageAlt={`${item.name} 缩略图`}
                    videoLabel={`素材选择视频预览-${item.id}`}
                    audioLabel={`素材选择音频播放-${item.id}`}
                    height={136}
                  />
                </div>
                <div style={{ padding: 14 }}>
                  <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                    <div>
                      <Typography.Text strong>{item.name}</Typography.Text>
                      <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
                        {item.assetType} / {item.tags.join(' / ') || '未打标签'}
                      </Typography.Paragraph>
                      <Typography.Text type="secondary">
                        {item.effectiveSync && item.arkStatus === 'active'
                          ? '火山已同步'
                          : item.effectiveSync
                            ? `火山${item.arkStatus === 'failed' ? '同步失败' : '同步中'}，本次将走 OSS`
                            : '未同步火山，直接走 OSS'}
                      </Typography.Text>
                    </div>
                    <Button
                      type="primary"
                      icon={<CheckCircleFilled aria-hidden="true" />}
                      aria-label={`使用素材 ${item.name}`}
                      onClick={() => onPick(item)}
                      block
                    >
                      使用素材 {item.name}
                    </Button>
                  </Space>
                </div>
              </div>
            ))}
          </div>
        )}
      </Space>
    </Modal>
  )
}
