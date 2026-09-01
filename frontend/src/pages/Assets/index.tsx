import {
  AppstoreAddOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { Button, Checkbox, Empty, Input, Modal, Pagination, Select, Skeleton, Space, Tabs, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import {
  batchSyncAssets,
  deleteAsset,
  getAssets,
  syncAssets,
  unsyncAssets,
  type AssetItem,
  type AssetStatus,
  type AssetType,
} from '../../api/assets'
import { getAssetCategories, type AssetCategoryItem } from '../../api/asset-categories'
import { getActiveVideoProvider } from '../../api/video-provider'
import { useAuth } from '../../stores/auth'
import { PageHeader } from '../../components/PageHeader'
import { usePolling } from '../../hooks/usePolling'
import { AssetCard } from './AssetCard'
import { mergeAssetsForRefresh } from './asset-list-state'
import { CategoryManagerModal } from './CategoryManagerModal'
import { UploadModal } from './UploadModal'

const filterCardStyle = {
  borderRadius: 28,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%)',
  border: '1px solid #dbe4ea',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.05)',
  padding: 24,
}

const loadingCardStyle = {
  borderRadius: 28,
  border: '1px solid #dbe4ea',
  background: '#ffffff',
  boxShadow: '0 20px 48px rgba(15, 23, 42, 0.04)',
  padding: 18,
}

const DEFAULT_ASSET_PAGE = 1
const DEFAULT_ASSET_PAGE_SIZE = 24

export const AssetsPage = () => {
  const { state } = useAuth()
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [categories, setCategories] = useState<AssetCategoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [draftKeyword, setDraftKeyword] = useState('')
  const [uploader, setUploader] = useState('')
  const [draftUploader, setDraftUploader] = useState('')
  const [status, setStatus] = useState<'all' | AssetStatus>('all')
  const [assetType, setAssetType] = useState<'all' | AssetType>('all')
  const [categoryId, setCategoryId] = useState<'all' | number>('all')
  const [assetPage, setAssetPage] = useState(DEFAULT_ASSET_PAGE)
  const [assetPageSize, setAssetPageSize] = useState(DEFAULT_ASSET_PAGE_SIZE)
  const [assetTotal, setAssetTotal] = useState(0)
  const [messageApi, contextHolder] = message.useMessage()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectMode, setSelectMode] = useState<'sync' | 'unsync' | null>(null)
  const [batchSyncOpen, setBatchSyncOpen] = useState(false)
  const [batchUnsyncOpen, setBatchUnsyncOpen] = useState(false)
  const [batchSyncing, setBatchSyncing] = useState(false)
  const [batchUnsyncing, setBatchUnsyncing] = useState(false)
  const [activeProviderName, setActiveProviderName] = useState('')

  const loadCategories = async () => {
    try {
      const result = await getAssetCategories()
      setCategories(result.items)
    } catch {
      void messageApi.error('加载素材组失败')
    }
  }

  const loadAssets = async (
    options: {
      silent?: boolean
      categoryId?: 'all' | number
      keyword?: string
      uploader?: string
      assetType?: 'all' | AssetType
      status?: 'all' | AssetStatus
      page?: number
      pageSize?: number
    } = {}
  ) => {
    if (options.silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const nextAssetType = options.assetType ?? assetType
      const nextStatus = options.status ?? status
      const nextCategoryId = options.categoryId ?? categoryId
      const nextPage = options.page ?? assetPage
      const nextPageSize = options.pageSize ?? assetPageSize
      const result = await getAssets({
        page: nextPage,
        pageSize: nextPageSize,
        keyword: options.keyword ?? keyword,
        uploader: options.uploader ?? uploader,
        assetType: nextAssetType === 'all' ? undefined : nextAssetType,
        status: nextStatus === 'all' ? undefined : nextStatus,
        categoryId: nextCategoryId === 'all' ? undefined : nextCategoryId,
      })
      if (!result || !Array.isArray(result.items)) {
        throw new Error('素材列表响应无效')
      }
      setAssetTotal(result.total)
      setAssets((current) => mergeAssetsForRefresh(current, result.items))
    } catch {
      void messageApi.error('加载素材失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadCategories()
  }, [])

  useEffect(() => {
    void loadAssets()
  }, [keyword, uploader, status, assetType, categoryId, assetPage, assetPageSize])

  const hasPollingAssets = assets.some(
    (item) => item.arkStatus === 'pending' || item.arkStatus === 'processing' || item.arkStatus === 'deleting'
  )

  usePolling(
    async () => {
      await Promise.all([loadAssets({ silent: true }), loadCategories()])
    },
    5_000,
    hasPollingAssets
  )

  const categoryTabs = useMemo(
    () => [
      { key: 'all', label: `全部素材组${assetTotal > 0 ? ` (${assetTotal})` : ''}` },
      ...categories.map((item) => ({
        key: String(item.id),
        label: `${item.name}${item.syncEnabled === false ? ' · 仅本地' : ' · 可同步'}${item.assetCount > 0 ? ` (${item.assetCount})` : ''}`,
      })),
    ],
    [assetTotal, categories]
  )

  const metrics = useMemo(
    () => [
      {
        label: '素材总数',
        value: assetTotal,
      },
      {
        label: '火山同步中',
        value: assets.filter((item) => item.effectiveSync && (item.arkStatus === 'pending' || item.arkStatus === 'processing')).length,
      },
      {
        label: '仅本地素材',
        value: assets.filter((item) => !item.effectiveSync).length,
      },
    ],
    [assetTotal, assets]
  )

  const resetAssetPage = () => {
    setAssetPage(DEFAULT_ASSET_PAGE)
  }

  const handleDelete = (asset: AssetItem) => {
    Modal.confirm({
      title: '删除素材',
      content: `确认删除「${asset.name}」？删除后将异步清理 OSS 与火山素材记录。`,
      okText: '确认删除',
      cancelText: '取消',
      onOk: async () => {
        setDeletingId(asset.id)
        try {
          await deleteAsset(asset.id)
          void messageApi.success('删除任务已提交')
          await Promise.all([loadAssets({ silent: true }), loadCategories()])
        } catch (error: any) {
          const statusCode = error?.response?.status
          const backendMessage = error?.response?.data?.message
          if (statusCode === 409) {
            void messageApi.warning(backendMessage ?? '该素材已被视频任务引用，暂时无法删除')
          } else {
            void messageApi.error(backendMessage ?? '删除失败，请稍后重试')
          }
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

  const handleManualSync = async () => {
    setSyncing(true)
    try {
      const result = await syncAssets()
      void messageApi.success(`已补推 ${result.count} 个素材任务`)
      await Promise.all([loadAssets({ silent: true }), loadCategories()])
    } finally {
      setSyncing(false)
    }
  }

  const toggleSelect = (asset: AssetItem, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) { next.add(asset.id) } else { next.delete(asset.id) }
      return next
    })
  }

  // 同步中的素材不可重复入队（避免与 worker 竞态）；已同步（active）素材允许重新选中同步
  const isAssetSyncing = (asset: AssetItem): boolean => {
    return asset.arkStatus === 'processing' || asset.arkStatus === 'pending' || asset.arkStatus === 'deleting'
  }

  // 已绑定素材库（有 pa_id）的素材才可取消同步
  const isAssetSynced = (asset: AssetItem): boolean => {
    return Boolean(asset.arkAssetId)
  }

  // sync 模式：排除同步中；unsync 模式：仅选已同步的
  const isAssetSelectable = (asset: AssetItem): boolean => {
    if (selectMode === 'unsync') return isAssetSynced(asset) && !isAssetSyncing(asset)
    return !isAssetSyncing(asset)
  }

  const selectableAssets = useMemo(
    () => selectMode ? assets.filter((a) => isAssetSelectable(a)) : [],
    [selectMode, assets]
  )

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(selectableAssets.map((a) => a.id)) : new Set())
  }

  const exitSelectMode = () => {
    setSelectMode(null)
    setSelectedIds(new Set())
  }

  const handleBatchSync = async () => {
    setBatchSyncing(true)
    try {
      const result = await batchSyncAssets([...selectedIds])
      void messageApi.success(`已提交 ${result.count} 个素材到素材库同步队列`)
      setBatchSyncOpen(false)
      exitSelectMode()
      await Promise.all([loadAssets({ silent: true }), loadCategories()])
    } catch {
      void messageApi.error('批量同步提交失败')
    } finally {
      setBatchSyncing(false)
    }
  }

  const openBatchSync = async () => {
    try {
      const provider = await getActiveVideoProvider()
      setActiveProviderName(provider.name)
    } catch {
      setActiveProviderName('当前默认平台')
    }
    setBatchSyncOpen(true)
  }

  const handleBatchUnsync = async () => {
    setBatchUnsyncing(true)
    try {
      const result = await unsyncAssets([...selectedIds])
      void messageApi.success(`已取消 ${result.count} 个素材的素材库同步，此后走 OSS 签名 URL`)
      setBatchUnsyncOpen(false)
      exitSelectMode()
      await Promise.all([loadAssets({ silent: true }), loadCategories()])
    } catch {
      void messageApi.error('取消同步提交失败')
    } finally {
      setBatchUnsyncing(false)
    }
  }

  const isAdmin = state.user?.role === 'admin'
  const canUpload = state.activeProjectRole === 'manager' || state.activeProjectRole === 'member'
  const canDelete = state.activeProjectRole === 'manager'
  const canBatchSync = isAdmin || state.activeProjectRole === 'manager'

  return (
    <>
      {contextHolder}
      <Space orientation="vertical" size={20} style={{ width: '100%' }}>
        <PageHeader
          title="素材管理"
          description="当前列表严格限定在当前项目工作区。上传素材后会按素材组与素材级同步策略，自动走火山或 OSS 双通道。"
          actions={
            <Space wrap size={12}>
              {canBatchSync ? (
                <Button
                  aria-label="批量同步"
                  icon={<SyncOutlined />}
                  type={selectMode === 'sync' ? 'primary' : 'default'}
                  onClick={() => (selectMode === 'sync' ? exitSelectMode() : setSelectMode('sync'))}
                >
                  {selectMode === 'sync' ? '退出选择' : '批量同步'}
                </Button>
              ) : null}
              {canBatchSync ? (
                <Button
                  aria-label="取消同步"
                  icon={<StopOutlined />}
                  danger
                  type={selectMode === 'unsync' ? 'primary' : 'default'}
                  onClick={() => (selectMode === 'unsync' ? exitSelectMode() : setSelectMode('unsync'))}
                >
                  {selectMode === 'unsync' ? '退出选择' : '取消同步'}
                </Button>
              ) : null}
              {isAdmin ? (
                <Button aria-label="素材组管理" icon={<FolderOpenOutlined />} onClick={() => setCategoryModalOpen(true)}>
                  素材组管理
                </Button>
              ) : null}
              {isAdmin ? (
                <Button aria-label="手动补推" icon={<SyncOutlined />} onClick={() => void handleManualSync()} loading={syncing}>
                  手动补推
                </Button>
              ) : null}
              <Button
                aria-label="上传素材"
                type="primary"
                icon={<AppstoreAddOutlined />}
                disabled={!canUpload}
                onClick={() => {
                  if (canUpload) {
                    setUploadOpen(true)
                  }
                }}
              >
                上传素材
              </Button>
            </Space>
          }
        />
        {!canUpload ? (
          <Typography.Text type="secondary">当前项目角色为只读，不能上传素材、编辑素材或创建任务。</Typography.Text>
        ) : null}

        <section style={filterCardStyle}>
          <Space orientation="vertical" size={18} style={{ width: '100%' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
              }}
            >
              {metrics.map((item) => (
                <div
                  key={item.label}
                  style={{
                    borderRadius: 22,
                    padding: '16px 18px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <Typography.Text type="secondary">{item.label}</Typography.Text>
                  <Typography.Title level={4} style={{ margin: '10px 0 0' }}>
                    {item.value}
                  </Typography.Title>
                </div>
              ))}
            </div>

            <Tabs
              activeKey={String(categoryId)}
              items={categoryTabs}
              onChange={(key) => {
                resetAssetPage()
                setCategoryId(key === 'all' ? 'all' : Number(key))
              }}
            />

            <Space size={12} wrap style={{ width: '100%' }}>
              <Input
                value={draftKeyword}
                placeholder="搜索名称或标签"
                prefix={<SearchOutlined />}
                allowClear
                size="large"
                style={{ width: 260 }}
                onChange={(event) => setDraftKeyword(event.target.value)}
                onPressEnter={() => {
                  resetAssetPage()
                  setKeyword(draftKeyword.trim())
                }}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  resetAssetPage()
                  setKeyword(draftKeyword.trim())
                }}
              >
                应用搜索
              </Button>
              <Input
                value={draftUploader}
                placeholder="按上传人筛选"
                allowClear
                size="large"
                style={{ width: 220 }}
                onChange={(event) => setDraftUploader(event.target.value)}
                onPressEnter={() => {
                  resetAssetPage()
                  setUploader(draftUploader.trim())
                }}
              />
              <Button
                onClick={() => {
                  resetAssetPage()
                  setUploader(draftUploader.trim())
                }}
              >
                按上传人筛选
              </Button>
              <Select
                value={assetType}
                size="large"
                style={{ width: 160 }}
                onChange={(value) => {
                  resetAssetPage()
                  setAssetType(value)
                }}
                options={[
                  { label: '全部类型', value: 'all' },
                  { label: '图片', value: 'Image' },
                  { label: '视频', value: 'Video' },
                  { label: '音频', value: 'Audio' },
                ]}
              />
              <Select
                value={status}
                size="large"
                style={{ width: 160 }}
                onChange={(value) => {
                  resetAssetPage()
                  setStatus(value)
                }}
                options={[
                  { label: '全部状态', value: 'all' },
                  { label: '待审核', value: 'pending' },
                  { label: '审核中', value: 'processing' },
                  { label: '已通过', value: 'active' },
                  { label: '失败', value: 'failed' },
                ]}
              />
              {refreshing ? (
                <Typography.Text type="secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <LoadingOutlined />
                  正在同步审核状态
                </Typography.Text>
              ) : null}
            </Space>
          </Space>
        </section>

        {selectMode && assets.length > 0 ? (
          <section style={{ ...filterCardStyle, padding: '12px 24px' }}>
            <Space size={16} style={{ width: '100%', justifyContent: 'space-between' }}>
              <Checkbox
                checked={selectableAssets.length > 0 && selectedIds.size === selectableAssets.length}
                indeterminate={selectedIds.size > 0 && selectedIds.size < selectableAssets.length}
                disabled={selectableAssets.length === 0}
                onChange={(e) => toggleSelectAll(e.target.checked)}
              >
                {selectMode === 'unsync' ? '全选已同步素材' : '全选可同步素材'}
              </Checkbox>
              <Typography.Text type="secondary">
                已选 {selectedIds.size} 个素材 · 不可选 {assets.length - selectableAssets.length} 个（{selectMode === 'unsync' ? '未同步或同步中' : '同步中'}）
              </Typography.Text>
              {selectMode === 'unsync' ? (
                <Button
                  danger
                  type="primary"
                  icon={<StopOutlined />}
                  disabled={selectedIds.size === 0}
                  onClick={() => setBatchUnsyncOpen(true)}
                >
                  取消同步选中素材
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<SyncOutlined />}
                  disabled={selectedIds.size === 0}
                  onClick={() => void openBatchSync()}
                >
                  同步选中素材
                </Button>
              )}
            </Space>
          </section>
        ) : null}

        {loading ? (
          <section
            aria-label="素材加载中"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} style={loadingCardStyle}>
                <Skeleton.Image active style={{ width: '100%', height: 220, borderRadius: 20 }} />
                <Skeleton active paragraph={{ rows: 3 }} title={{ width: '58%' }} style={{ marginTop: 16 }} />
              </div>
            ))}
          </section>
        ) : assets.length === 0 ? (
          <section
            style={{
              ...filterCardStyle,
              minHeight: 320,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前还没有素材"
            >
              <Button
                type="primary"
                disabled={!canUpload}
                onClick={() => {
                  if (canUpload) {
                    setUploadOpen(true)
                  }
                }}
              >
                立即上传
              </Button>
            </Empty>
          </section>
        ) : (
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                categories={categories}
                deleting={deletingId === asset.id}
                readonly={!canDelete}
                onDelete={handleDelete}
                selectable={Boolean(selectMode)}
                selected={selectedIds.has(asset.id)}
                selectDisabled={Boolean(selectMode) && !isAssetSelectable(asset)}
                selectDisabledReason={
                  selectMode === 'unsync'
                    ? (isAssetSyncing(asset) ? '该素材正在同步中，请等待完成' : '该素材未同步到素材库，无需取消')
                    : '该素材正在同步中，请等待完成'
                }
                onSelect={toggleSelect}
              />
            ))}
          </section>
        )}
        {assetTotal > assetPageSize ? (
          <Pagination
            align="center"
            current={assetPage}
            pageSize={assetPageSize}
            total={assetTotal}
            showSizeChanger={false}
            onChange={(page, pageSize) => {
              setAssetPage(page)
              setAssetPageSize(pageSize)
            }}
          />
        ) : null}
      </Space>

      <UploadModal
        open={uploadOpen}
        categories={categories}
        onCancel={() => setUploadOpen(false)}
        onUploaded={async (asset) => {
          const nextCategoryId = asset.categoryId ?? 'all'
          const shouldReloadByCategoryEffect = nextCategoryId !== categoryId
          setAssetPage(DEFAULT_ASSET_PAGE)
          setCategoryId(nextCategoryId)
          await loadCategories()
          if (!shouldReloadByCategoryEffect) {
            await loadAssets({ silent: true, categoryId: nextCategoryId, page: DEFAULT_ASSET_PAGE })
          }
        }}
      />

      <CategoryManagerModal
        open={categoryModalOpen}
        categories={categories}
        onClose={() => setCategoryModalOpen(false)}
        onChanged={async () => {
          await Promise.all([loadCategories(), loadAssets({ silent: true })])
        }}
      />

      <Modal
        title="批量同步素材到素材库"
        open={batchSyncOpen}
        onCancel={() => setBatchSyncOpen(false)}
        onOk={() => void handleBatchSync()}
        confirmLoading={batchSyncing}
        okText={`确认同步 ${selectedIds.size} 个素材`}
        okButtonProps={{ disabled: selectedIds.size === 0 }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>
            将对选中的 <strong>{selectedIds.size}</strong> 个素材执行以下操作：
          </Typography.Text>
          <Typography.Text type="secondary">
            1. 清除原有素材库关联（ark_asset_id / ark_group_id）
          </Typography.Text>
          <Typography.Text type="secondary">
            2. 重置为待同步状态并加入同步队列
          </Typography.Text>
          <Typography.Text type="secondary">
            3. Worker 将自动提交到当前默认平台「{activeProviderName}」素材库审核
          </Typography.Text>
          <Typography.Text type="warning" style={{ fontSize: 12 }}>
            ⚠ 已同步过的素材会被重新提交，审核通过后将获得新的素材库 ID（旧 asset:// 引用会失效，适用于素材库报"not synced to current channel"时修复）。
          </Typography.Text>
          <Typography.Text type="warning" style={{ fontSize: 12 }}>
            ⚠ 同步后的素材需等待平台审核通过才能用于视频生成的 asset:// 引用。审核期间仍走 OSS 签名 URL，不影响使用。
          </Typography.Text>
        </Space>
      </Modal>

      <Modal
        title="取消素材库同步"
        open={batchUnsyncOpen}
        onCancel={() => setBatchUnsyncOpen(false)}
        onOk={() => void handleBatchUnsync()}
        confirmLoading={batchUnsyncing}
        okText={`确认取消同步 ${selectedIds.size} 个素材`}
        okButtonProps={{ danger: true, disabled: selectedIds.size === 0 }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>
            将对选中的 <strong>{selectedIds.size}</strong> 个素材执行以下操作：
          </Typography.Text>
          <Typography.Text type="secondary">
            1. 清除素材库关联（pa_id / 素材组映射），素材与 OSS 文件完整保留
          </Typography.Text>
          <Typography.Text type="secondary">
            2. 素材级同步策略改为"仅保留本地"，即使所属素材组开着同步也不会自动重新同步
          </Typography.Text>
          <Typography.Text type="secondary">
            3. 此后视频生成对这些素材走 OSS 签名 URL
          </Typography.Text>
          <Typography.Text type="warning" style={{ fontSize: 12 }}>
            ⚠ 引用旧素材库 ID 的历史任务重放会失效，需重新选择素材创建新任务。
          </Typography.Text>
          <Typography.Text type="warning" style={{ fontSize: 12 }}>
            ⚠ 远端素材库中的旧记录不会删除（平台未提供删除接口），如需释放配额请联系素材库平台。
          </Typography.Text>
        </Space>
      </Modal>
    </>
  )
}
