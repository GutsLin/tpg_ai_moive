import { UploadOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Radio, Select, Space, Switch, Typography, message } from 'antd'
import { useEffect, useRef, useState } from 'react'

import {
  getConfigItems,
  getApiKeyMode,
  setApiKeyMode,
  updateConfigItems,
  type ApiKeyMode,
  type ConfigItem,
} from '../../api/config'
import { activateVideoProvider, createVideoProvider, getVideoProviders, updateVideoProvider, type VideoProviderAdmin } from '../../api/video-providers'
import { getSetupStatus, type SetupStatus } from '../../api/setup'
import { PageHeader } from '../../components/PageHeader'
import { useBrand } from '../../stores/brand'
import { uploadFileToOss } from '../../utils/oss-upload'

const secretKeys = new Set(['oss_access_key_id', 'oss_access_key_secret'])
const brandKeys = new Set(['system_name', 'system_logo_key'])
const videoLimitKeys = new Set(['video_reference_image_limit', 'video_reference_video_limit', 'video_reference_audio_limit'])
const videoLimitMaxValues: Record<string, number> = {
  video_reference_image_limit: 30,
  video_reference_video_limit: 10,
  video_reference_audio_limit: 10,
}
const labels: Record<string, string> = {
  system_name: '系统名称',
  system_logo_key: '系统 Logo',
  oss_access_key_id: 'OSS Access Key ID',
  oss_access_key_secret: 'OSS Access Key Secret',
  oss_sts_role_arn: 'OSS STS Role ARN',
  oss_bucket: 'OSS Bucket',
  oss_region: 'OSS Region',
  oss_server_internal_enabled: '服务端 OSS 访问网络',
  oss_signed_url_ttl: '签名 URL TTL',
  video_reference_image_limit: '参考图片上限',
  video_reference_video_limit: '参考视频上限',
  video_reference_audio_limit: '参考音频上限',
}

type ConfigFormValues = Record<string, string | number | boolean | undefined>
type RuntimeInfo = Pick<SetupStatus, 'version' | 'environment'>
type VideoProviderDraft = { providerKey: string; name: string; providerType: 'toapis' | 'volcano_ark'; endpoint: string; apiKey: string }

const emptyVideoProviderDraft = (): VideoProviderDraft => ({
  providerKey: '', name: '', providerType: 'toapis', endpoint: 'https://toapis.com', apiKey: '',
})

const normalizeConfigFormValue = (item: ConfigItem): string | number | boolean => {
  if (item.key === 'oss_server_internal_enabled') {
    return item.value === 'true'
  }

  if (videoLimitKeys.has(item.key)) {
    const parsed = Number.parseInt(item.value, 10)
    return Number.isInteger(parsed) ? parsed : Number.NaN
  }

  return item.value
}

const normalizeConfigSubmitValue = (item: ConfigItem, value: string | number | boolean): string => {
  if (item.key === 'oss_server_internal_enabled') {
    return String(Boolean(value))
  }

  return String(value)
}

const buildConfigRules = (item: ConfigItem) => {
  if (
    item.key === 'system_logo_key' ||
    item.key === 'oss_server_internal_enabled'
  ) {
    return []
  }

  if (!item.isSecret) {
    return [{ required: true, message: `请输入${labels[item.key] ?? item.key}` }]
  }

  return []
}

export const buildChangedConfigItems = (items: ConfigItem[], values: ConfigFormValues) =>
  items
    .filter((item) => {
      const nextValue = values[item.key]
      if (nextValue === undefined) {
        return false
      }

      const normalizedNextValue = normalizeConfigSubmitValue(item, nextValue)
      if (item.isSecret) {
        return Boolean(normalizedNextValue && normalizedNextValue !== item.value)
      }

      return normalizedNextValue !== item.value
    })
    .map((item) => ({
      key: item.key,
      value: normalizeConfigSubmitValue(item, values[item.key] as string | boolean),
    }))

export const ConfigPage = () => {
  const [form] = Form.useForm<ConfigFormValues>()
  const [items, setItems] = useState<ConfigItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [pendingLogoPreviewUrl, setPendingLogoPreviewUrl] = useState<string | null>(null)
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null)
  const [videoProviders, setVideoProviders] = useState<VideoProviderAdmin[]>([])
  const [selectedVideoProviderId, setSelectedVideoProviderId] = useState<number | null>(null)
  const [videoProviderDraft, setVideoProviderDraft] = useState<VideoProviderDraft>(emptyVideoProviderDraft)
  const [videoProviderSaving, setVideoProviderSaving] = useState(false)
  const [apiKeyMode, setApiKeyModeState] = useState<ApiKeyMode>('global')
  const [apiKeyModeSaving, setApiKeyModeSaving] = useState(false)
  const logoUploadTaskRef = useRef<Promise<void> | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const pendingLogoPreviewUrlRef = useRef<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const {
    state: brandState,
    refresh: refreshBrand,
  } = useBrand()

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      try {
        const [result, setupStatus, providerResult] = await Promise.all([
          getConfigItems(),
          getSetupStatus().catch(() => null),
          getVideoProviders().catch(() => ({ items: [] as VideoProviderAdmin[] })),
        ])
        if (!mounted) return

        setItems(result.items)
        setVideoProviders(providerResult.items)
        const activeProvider = providerResult.items.find((item) => item.isDefault) ?? providerResult.items[0]
        if (activeProvider) {
          setSelectedVideoProviderId(activeProvider.id)
          setVideoProviderDraft({ providerKey: activeProvider.providerKey, name: activeProvider.name, providerType: activeProvider.providerType, endpoint: activeProvider.endpoint, apiKey: '' })
        }
        if (setupStatus) {
          setRuntimeInfo({
            version: setupStatus.version,
            environment: setupStatus.environment,
          })
        }
        form.setFieldsValue(
          result.items.reduce<ConfigFormValues>((accumulator, item) => {
            accumulator[item.key] = normalizeConfigFormValue(item)
            return accumulator
          }, {})
        )
        const modeResult = await getApiKeyMode().catch(() => ({ mode: 'global' as const }))
        if (!mounted) return
        setApiKeyModeState(modeResult.mode)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [form])

  useEffect(() => {
    return () => {
      if (pendingLogoPreviewUrlRef.current) {
        URL.revokeObjectURL(pendingLogoPreviewUrlRef.current)
      }
    }
  }, [])

  const groupedItems = {
    brand: items.filter((item) => brandKeys.has(item.key)),
    oss: items.filter((item) => item.key.startsWith('oss_')),
    videoLimits: items.filter((item) => videoLimitKeys.has(item.key)),
  }

  const handleSave = async (values: ConfigFormValues) => {
    if (logoUploadTaskRef.current) {
      await logoUploadTaskRef.current
    }

    const nextValues: ConfigFormValues = {
      ...form.getFieldsValue(),
      ...values,
    }

    const changedItems = buildChangedConfigItems(items, nextValues)
    if (changedItems.length === 0) {
      void messageApi.info('当前没有需要保存的配置变更')
      return
    }

    setSaving(true)
    try {
      await updateConfigItems(changedItems)
      await refreshBrand()
      if (pendingLogoPreviewUrlRef.current) {
        URL.revokeObjectURL(pendingLogoPreviewUrlRef.current)
        pendingLogoPreviewUrlRef.current = null
        setPendingLogoPreviewUrl(null)
      }
      setItems((current) =>
        current.map((item) => {
          const changed = changedItems.find((changedItem) => changedItem.key === item.key)
          return changed ? { ...item, value: changed.value } : item
        })
      )
      void messageApi.success('已生效，无需重启')
    } finally {
      setSaving(false)
    }
  }

  const showPendingLogoPreview = (file: File) => {
    if (pendingLogoPreviewUrlRef.current) {
      URL.revokeObjectURL(pendingLogoPreviewUrlRef.current)
    }

    const objectUrl = URL.createObjectURL(file)
    pendingLogoPreviewUrlRef.current = objectUrl
    setPendingLogoPreviewUrl(objectUrl)
  }

  const renderInputItem = (item: ConfigItem) => {
    if (item.key === 'oss_server_internal_enabled') {
      return (
        <Form.Item
          key={item.key}
          label={labels[item.key]}
          name={item.key}
          valuePropName="checked"
          tooltip="开启后仅后端上传、删除等操作使用内网 Endpoint；浏览器直传、预览和签名 URL 始终使用公网。"
        >
          <Switch aria-label="服务端 OSS 访问网络" checkedChildren="内网" unCheckedChildren="公网" />
        </Form.Item>
      )
    }

    if (videoLimitKeys.has(item.key)) {
      return (
        <Form.Item
          key={item.key}
          label={labels[item.key] ?? item.key}
          name={item.key}
          rules={[{ required: true, message: `请输入${labels[item.key] ?? item.key}` }]}
        >
          <InputNumber
            aria-label={labels[item.key] ?? item.key}
            min={1}
            max={videoLimitMaxValues[item.key] ?? 30}
            precision={0}
            style={{ width: 160 }}
          />
        </Form.Item>
      )
    }

    return (
      <Form.Item
        key={item.key}
        label={labels[item.key] ?? item.key}
        name={item.key}
        rules={buildConfigRules(item)}
      >
        {secretKeys.has(item.key) ? <Input.Password placeholder="未修改则保持原值" /> : <Input />}
      </Form.Item>
    )
  }

  const renderBrandSection = (sectionItems: ConfigItem[]) => {
    const systemNameItem = sectionItems.find((item) => item.key === 'system_name')
    const systemLogoItem = sectionItems.find((item) => item.key === 'system_logo_key')
    const logoKeyValue = form.getFieldValue('system_logo_key') as string | undefined
    const currentLogoUrl = pendingLogoPreviewUrl ?? brandState.logoUrl

    if (!systemNameItem && !systemLogoItem) {
      return null
    }

    return (
      <Card title="品牌配置" style={{ borderRadius: 20 }}>
        {systemNameItem ? renderInputItem(systemNameItem) : null}
        {systemLogoItem ? (
          <>
            <Form.Item name="system_logo_key" hidden>
              <Input />
            </Form.Item>
            <Form.Item
              label="上传 Logo"
              extra="建议上传 PNG / SVG。保存后会同步刷新左上角品牌区，并尽量复用为浏览器 favicon。"
            >
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    justifyContent: 'space-between',
                    gap: 20,
                    padding: 20,
                    borderRadius: 22,
                    border: '1px solid #dbe4ea',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    flexWrap: 'wrap',
                  }}
                >
                  <Space orientation="vertical" size={4} style={{ flex: '1 1 240px' }}>
                    <Typography.Text strong>系统 Logo</Typography.Text>
                    <Typography.Text type="secondary">
                      {logoKeyValue ? `当前 OSS Key：${logoKeyValue}` : '尚未上传 Logo'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      建议使用边缘留白较少的正方形 Logo，保存前这里会先显示本地预览。
                    </Typography.Text>
                  </Space>
                  {currentLogoUrl ? (
                    <div
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: 24,
                        overflow: 'hidden',
                        border: '1px solid rgba(148, 163, 184, 0.35)',
                        background: '#ffffff',
                        boxShadow: '0 18px 36px rgba(15, 23, 42, 0.10)',
                        flex: '0 0 auto',
                      }}
                    >
                      <img
                        src={currentLogoUrl}
                        alt="当前系统 Logo"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      aria-hidden="true"
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: 24,
                        display: 'grid',
                        placeItems: 'center',
                        background: 'linear-gradient(135deg, #dbeafe, #e2e8f0)',
                        color: '#334155',
                        fontWeight: 700,
                        fontSize: 30,
                        boxShadow: 'inset 0 0 0 1px rgba(148, 163, 184, 0.22)',
                      }}
                    >
                      {String(form.getFieldValue('system_name') ?? 'N').slice(0, 1)}
                    </div>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  id="brand-logo-upload"
                  aria-label="上传 Logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={uploadingLogo}
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: 'hidden',
                    clip: 'rect(0, 0, 0, 0)',
                    whiteSpace: 'nowrap',
                    border: 0,
                  }}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) {
                      return
                    }

                     showPendingLogoPreview(file)

                    const uploadTask = (async () => {
                      setUploadingLogo(true)
                      try {
                        const { ossKey } = await uploadFileToOss(file)
                        form.setFieldValue('system_logo_key', ossKey)
                        void messageApi.success('Logo 已上传，保存配置后生效')
                      } catch (error: any) {
                        void messageApi.error(error?.response?.data?.message ?? 'Logo 上传失败，请稍后重试')
                      } finally {
                        event.target.value = ''
                        logoUploadTaskRef.current = null
                        setUploadingLogo(false)
                      }
                    })()

                    logoUploadTaskRef.current = uploadTask
                    void uploadTask
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <Button
                    type="primary"
                    icon={<UploadOutlined />}
                    loading={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                    style={{
                      height: 44,
                      paddingInline: 18,
                      borderRadius: 999,
                      border: 'none',
                      background: 'linear-gradient(135deg, #0f766e, #0f766e 30%, #115e59 100%)',
                      boxShadow: '0 14px 28px rgba(15, 118, 110, 0.22)',
                    }}
                  >
                    {uploadingLogo ? '上传中...' : '选择 Logo 文件'}
                  </Button>
                  <Typography.Text type="secondary">支持 PNG / JPG / WebP / SVG，上传后可直接预览。</Typography.Text>
                </div>
              </Space>
            </Form.Item>
          </>
        ) : null}
      </Card>
    )
  }

  const selectedVideoProvider = videoProviders.find((item) => item.id === selectedVideoProviderId) ?? null

  const selectVideoProvider = (id: number) => {
    const provider = videoProviders.find((item) => item.id === id)
    if (!provider) return
    setSelectedVideoProviderId(id)
    setVideoProviderDraft({ providerKey: provider.providerKey, name: provider.name, providerType: provider.providerType, endpoint: provider.endpoint, apiKey: '' })
  }

  const refreshVideoProviders = async () => {
    const result = await getVideoProviders()
    setVideoProviders(result.items)
    return result.items
  }

  const saveVideoProvider = async () => {
    setVideoProviderSaving(true)
    try {
      if (selectedVideoProvider) {
        await updateVideoProvider(selectedVideoProvider.id, {
          name: videoProviderDraft.name,
          endpoint: videoProviderDraft.endpoint,
          apiKey: videoProviderDraft.apiKey || undefined,
        })
      } else {
        const created = await createVideoProvider(videoProviderDraft)
        setSelectedVideoProviderId(created.id)
      }
      const nextItems = await refreshVideoProviders()
      const active = nextItems.find((item) => item.id === selectedVideoProviderId) ?? nextItems.find((item) => item.isDefault)
      if (active) selectVideoProvider(active.id)
      void messageApi.success('视频生成平台已保存')
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '视频生成平台保存失败')
    } finally {
      setVideoProviderSaving(false)
    }
  }

  const switchApiKeyMode = async (mode: ApiKeyMode) => {
    setApiKeyModeSaving(true)
    try {
      await setApiKeyMode(mode)
      setApiKeyModeState(mode)
      void messageApi.success(`已切换为${mode === 'global' ? '全局共享 Key' : '成员独立 Key'}模式`)
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '切换模式失败')
    } finally {
      setApiKeyModeSaving(false)
    }
  }

  const renderVideoProviderSection = () => (
    <Card title="视频生成平台" style={{ borderRadius: 20 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap>
          <Select
            aria-label="当前视频生成平台"
            value={selectedVideoProviderId ?? undefined}
            style={{ minWidth: 240 }}
            placeholder="选择视频生成平台"
            options={videoProviders.map((item) => ({ label: item.isDefault ? `${item.name}（当前启用）` : item.name, value: item.id }))}
            onChange={selectVideoProvider}
          />
          {selectedVideoProvider ? (
            <Button
              disabled={selectedVideoProvider.isDefault}
              onClick={async () => {
                try {
                  await activateVideoProvider(selectedVideoProvider.id)
                  const nextItems = await refreshVideoProviders()
                  const active = nextItems.find((item) => item.isDefault)
                  if (active) selectVideoProvider(active.id)
                  void messageApi.success('已切换当前视频生成平台')
                } catch (error: any) {
                  void messageApi.error(error?.response?.data?.message ?? '切换视频生成平台失败')
                }
              }}
            >
              设为当前平台
            </Button>
          ) : null}
          <Button onClick={() => { setSelectedVideoProviderId(null); setVideoProviderDraft(emptyVideoProviderDraft()) }}>新增平台</Button>
        </Space>
        <Input aria-label="平台标识" value={videoProviderDraft.providerKey} disabled={Boolean(selectedVideoProvider)} placeholder="例如 toapis" onChange={(event) => setVideoProviderDraft((current) => ({ ...current, providerKey: event.target.value }))} />
        <Input aria-label="平台名称" value={videoProviderDraft.name} placeholder="例如 ToAPIs" onChange={(event) => setVideoProviderDraft((current) => ({ ...current, name: event.target.value }))} />
        <Select aria-label="平台类型" value={videoProviderDraft.providerType} disabled={Boolean(selectedVideoProvider)} options={[{ label: 'ToAPIs', value: 'toapis' }, { label: '火山方舟', value: 'volcano_ark' }]} onChange={(providerType) => setVideoProviderDraft((current) => ({ ...current, providerType }))} />
        <Input aria-label="视频接口地址" value={videoProviderDraft.endpoint} placeholder="https://toapis.com" onChange={(event) => setVideoProviderDraft((current) => ({ ...current, endpoint: event.target.value }))} />
        <Input.Password aria-label="视频 API Key" value={videoProviderDraft.apiKey} placeholder={selectedVideoProvider ? `保留当前密钥（${selectedVideoProvider.apiKeyMasked}）` : '请输入 API Key'} onChange={(event) => setVideoProviderDraft((current) => ({ ...current, apiKey: event.target.value }))} />
        <Button type="primary" loading={videoProviderSaving} onClick={() => void saveVideoProvider()}>{selectedVideoProvider ? '保存平台配置' : '创建平台'}</Button>
      </Space>
    </Card>
  )

  const renderVideoLimitsSection = () => {
    if (groupedItems.videoLimits.length === 0) {
      return null
    }

    return (
      <Card title="视频生成限制" style={{ borderRadius: 20 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            全能参考模式的全局素材数量上限，实际生效上限为「此处配置」与「所选模型支持上限」的较小值，修改后立即生效。模型上限：Seedance 2.0 / 2.0 Fast / mini 为图片 9、视频 3、音频 3；Seedance 2.5 为图片 30、视频 10、音频 10（总参考素材最多 50 个）。
          </Typography.Text>
          {groupedItems.videoLimits.map((item) => renderInputItem(item))}
        </Space>
      </Card>
    )
  }

  return (
    <>
      {contextHolder}
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <PageHeader
          title="系统配置"
          description="所有配置更新后立即生效，密文字段默认展示脱敏值。"
        />

        <Form form={form} layout="vertical" onFinish={handleSave} disabled={loading}>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {renderBrandSection(groupedItems.brand)}
            {renderVideoProviderSection()}
            {renderVideoLimitsSection()}

            <Card title="API Key 模式" style={{ borderRadius: 20 }}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Radio.Group
                  value={apiKeyMode}
                  onChange={(event) => void switchApiKeyMode(event.target.value as ApiKeyMode)}
                  disabled={apiKeyModeSaving}
                >
                  <Space direction="vertical" size={12}>
                    <Radio value="global">
                      <Typography.Text strong>全局共享 Key（默认）</Typography.Text>
                      <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0 24px' }}>
                        所有用户使用系统统一 Key，无法按人统计用量。
                      </Typography.Paragraph>
                    </Radio>
                    <Radio value="per_member">
                      <Typography.Text strong>成员独立 Key</Typography.Text>
                      <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0 24px' }}>
                        每个成员使用独立 API Key，可在 ToAPIs 后台按 Key 查看 Token 消耗。未配置个人 Key 的用户将无法生成视频。
                      </Typography.Paragraph>
                    </Radio>
                  </Space>
                </Radio.Group>
                {apiKeyMode === 'per_member' ? (
                  <div
                    style={{
                      borderRadius: 16,
                      border: '1px solid #e7dcc7',
                      background: 'linear-gradient(135deg, #fffaf0 0%, #f8f4ea 100%)',
                      padding: '12px 16px',
                    }}
                  >
                    <Typography.Text style={{ color: '#92400e' }}>
                      ⚠ 切换为成员独立 Key 前，请确保已在「用户管理」中为每个需要生成视频的成员配置了个人 API Key。
                    </Typography.Text>
                  </div>
                ) : null}
              </Space>
            </Card>

            <Card title="阿里云 OSS 配置" style={{ borderRadius: 20 }}>
              {groupedItems.oss.map((item) => renderInputItem(item))}
            </Card>

            <Card style={{ borderRadius: 20 }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Button type="primary" htmlType="submit" loading={saving}>
                  保存配置
                </Button>
                {runtimeInfo ? (
                  <div>
                    <Typography.Text strong>当前运行版本</Typography.Text>
                    <br />
                    <Typography.Text type="secondary">
                      {runtimeInfo.version} / {runtimeInfo.environment}
                    </Typography.Text>
                  </div>
                ) : null}
              </Space>
            </Card>
          </Space>
        </Form>
      </Space>
    </>
  )
}
