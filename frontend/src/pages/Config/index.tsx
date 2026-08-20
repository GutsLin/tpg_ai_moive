import { UploadOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, Radio, Select, Space, Switch, Typography, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  createConfigArkAssetGroup,
  getConfigItems,
  listConfigArkAssetGroups,
  updateConfigItems,
  type ConfigArkAssetGroupItem,
  type ConfigItem,
} from '../../api/config'
import { activateVideoProvider, createVideoProvider, getVideoProviders, updateVideoProvider, type VideoProviderAdmin } from '../../api/video-providers'
import { getSetupStatus, type SetupStatus } from '../../api/setup'
import { PageHeader } from '../../components/PageHeader'
import { useBrand } from '../../stores/brand'
import { uploadFileToOss } from '../../utils/oss-upload'

const secretKeys = new Set(['ark_api_key', 'ark_access_key', 'ark_secret_key', 'oss_access_key_id', 'oss_access_key_secret'])
const brandKeys = new Set(['system_name', 'system_logo_key'])
const arkKeys = new Set([
  'ark_api_key',
  'ark_access_key',
  'ark_secret_key',
  'ark_endpoint',
  'ark_default_group_id',
  'ark_default_sync_enabled',
  'ark_project_name_mode',
  'ark_project_name_default_value',
])
const labels: Record<string, string> = {
  system_name: '系统名称',
  system_logo_key: '系统 Logo',
  ark_api_key: '火山 Bearer Token',
  ark_access_key: '火山素材 Access Key',
  ark_secret_key: '火山素材 Secret Key',
  ark_endpoint: '火山视频 Endpoint',
  ark_default_group_id: '默认素材组',
  ark_default_sync_enabled: '默认同步策略',
  ark_project_name_mode: '火山素材 ProjectName 来源',
  ark_project_name_default_value: 'ProjectName 默认值',
  oss_access_key_id: 'OSS Access Key ID',
  oss_access_key_secret: 'OSS Access Key Secret',
  oss_sts_role_arn: 'OSS STS Role ARN',
  oss_bucket: 'OSS Bucket',
  oss_region: 'OSS Region',
  oss_server_internal_enabled: '服务端 OSS 访问网络',
  oss_signed_url_ttl: '签名 URL TTL',
}

type ConfigFormValues = Record<string, string | boolean | undefined>
type ArkGroupMode = 'existing' | 'create'
type RuntimeInfo = Pick<SetupStatus, 'version' | 'environment'>
type ArkProjectNameMode = 'project_code' | 'default_value'
type VideoProviderDraft = { providerKey: string; name: string; providerType: 'toapis' | 'volcano_ark'; endpoint: string; apiKey: string }

const emptyVideoProviderDraft = (): VideoProviderDraft => ({
  providerKey: '', name: '', providerType: 'toapis', endpoint: 'https://toapis.com', apiKey: '',
})

const normalizeConfigFormValue = (item: ConfigItem): string | boolean => {
  if (item.key === 'ark_default_sync_enabled') {
    return item.value !== 'false'
  }

  if (item.key === 'oss_server_internal_enabled') {
    return item.value === 'true'
  }

  return item.value
}

const normalizeConfigSubmitValue = (item: ConfigItem, value: string | boolean): string => {
  if (item.key === 'ark_default_sync_enabled' || item.key === 'oss_server_internal_enabled') {
    return String(Boolean(value))
  }

  return String(value)
}

const buildConfigRules = (item: ConfigItem) => {
  if (
    item.key === 'system_logo_key' ||
    item.key === 'ark_default_group_id' ||
    item.key === 'ark_default_sync_enabled' ||
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
  const [arkGroups, setArkGroups] = useState<ConfigArkAssetGroupItem[]>([])
  const [arkGroupMode, setArkGroupMode] = useState<ArkGroupMode>('existing')
  const [arkGroupsLoaded, setArkGroupsLoaded] = useState(false)
  const [arkGroupsLoading, setArkGroupsLoading] = useState(false)
  const [creatingArkGroup, setCreatingArkGroup] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [pendingLogoPreviewUrl, setPendingLogoPreviewUrl] = useState<string | null>(null)
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null)
  const [videoProviders, setVideoProviders] = useState<VideoProviderAdmin[]>([])
  const [selectedVideoProviderId, setSelectedVideoProviderId] = useState<number | null>(null)
  const [videoProviderDraft, setVideoProviderDraft] = useState<VideoProviderDraft>(emptyVideoProviderDraft)
  const [videoProviderSaving, setVideoProviderSaving] = useState(false)
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

  const itemMap = useMemo(() => new Map(items.map((item) => [item.key, item])), [items])
  const groupedItems = useMemo(
    () => ({
      brand: items.filter((item) => brandKeys.has(item.key)),
      ark: items.filter((item) => arkKeys.has(item.key)),
      oss: items.filter((item) => item.key.startsWith('oss_')),
    }),
    [items]
  )
  const watchedDefaultGroupId = Form.useWatch('ark_default_group_id', form)
  const watchedProjectNameMode =
    (Form.useWatch('ark_project_name_mode', form) as ArkProjectNameMode | undefined) ?? 'project_code'
  const selectedArkGroup = useMemo(
    () => arkGroups.find((item) => item.id === watchedDefaultGroupId) ?? null,
    [arkGroups, watchedDefaultGroupId]
  )

  const getArkCredentialOverrides = (values: ConfigFormValues) => {
    const accessKeyItem = itemMap.get('ark_access_key')
    const secretKeyItem = itemMap.get('ark_secret_key')
    const accessValue = typeof values.ark_access_key === 'string' ? values.ark_access_key.trim() : ''
    const secretValue = typeof values.ark_secret_key === 'string' ? values.ark_secret_key.trim() : ''

    return {
      accessKey: accessValue && accessValue !== accessKeyItem?.value ? accessValue : undefined,
      secretKey: secretValue && secretValue !== secretKeyItem?.value ? secretValue : undefined,
    }
  }

  const loadArkGroups = async (values: ConfigFormValues, options: { keepSelection?: boolean } = {}) => {
    setArkGroupsLoading(true)
    try {
      const result = await listConfigArkAssetGroups(getArkCredentialOverrides(values))
      setArkGroups(result.items)
      setArkGroupsLoaded(true)

      const currentGroupId = typeof values.ark_default_group_id === 'string' ? values.ark_default_group_id : ''
      const matchedCurrent = result.items.find((item) => item.id === currentGroupId)
      if (!matchedCurrent && result.items.length > 0) {
        form.setFieldValue('ark_default_group_id', result.items[0].id)
      }

      if (result.items.length === 0) {
        setArkGroupMode('create')
      } else if (!options.keepSelection || !matchedCurrent) {
        setArkGroupMode('existing')
      }

      void messageApi.success(`已加载 ${result.items.length} 个火山素材组`)
      return result.items
    } finally {
      setArkGroupsLoading(false)
    }
  }

  const createArkGroup = async (values: ConfigFormValues) => {
    setCreatingArkGroup(true)
    try {
      const created = await createConfigArkAssetGroup({
        ...getArkCredentialOverrides(values),
        name: String(values.ark_new_group_name ?? '').trim(),
        description: String(values.ark_new_group_description ?? '').trim() || undefined,
      })
      setArkGroups((current) => {
        const next = [...current.filter((item) => item.id !== created.id), created]
        next.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
        return next
      })
      setArkGroupsLoaded(true)
      setArkGroupMode('existing')
      form.setFieldValue('ark_default_group_id', created.id)
      void messageApi.success(`已创建素材组「${created.name}」并设为默认组`)
      return created.id
    } finally {
      setCreatingArkGroup(false)
    }
  }

  const ensureArkDefaultGroupReady = async (values: ConfigFormValues) => {
    if (!groupedItems.ark.length) {
      return typeof values.ark_default_group_id === 'string' ? values.ark_default_group_id : ''
    }

    if (arkGroupMode === 'existing') {
      const result = await form.validateFields(['ark_default_group_id'])
      return result.ark_default_group_id as string
    }

    const result = await form.validateFields(['ark_new_group_name', 'ark_new_group_description'])
    return await createArkGroup({ ...values, ...result })
  }

  const handleSave = async (values: ConfigFormValues) => {
    if (logoUploadTaskRef.current) {
      await logoUploadTaskRef.current
    }

    const nextValues: ConfigFormValues = {
      ...form.getFieldsValue(),
      ...values,
    }
    const resolvedGroupId = await ensureArkDefaultGroupReady(nextValues)
    if (resolvedGroupId) {
      nextValues.ark_default_group_id = resolvedGroupId
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

  const renderSection = (title: string, sectionItems: ConfigItem[]) => (
    <Card title={title} style={{ borderRadius: 20 }}>
      {sectionItems.map((item) => renderInputItem(item))}
    </Card>
  )

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

  const renderArkSection = (sectionItems: ConfigItem[]) => {
    if (sectionItems.length === 0) {
      return null
    }

    const inputItems = sectionItems.filter(
      (item) =>
        ![
          'ark_default_group_id',
          'ark_default_sync_enabled',
          'ark_project_name_mode',
          'ark_project_name_default_value',
        ].includes(item.key)
    )
    const hasDefaultSync = sectionItems.some((item) => item.key === 'ark_default_sync_enabled')
    const hasProjectNameMode = sectionItems.some((item) => item.key === 'ark_project_name_mode')

    return (
      <Card title="火山引擎配置" style={{ borderRadius: 20 }}>
        {inputItems.map((item) => renderInputItem(item))}

        {hasProjectNameMode ? (
          <>
            <Form.Item
              label="火山素材 ProjectName 来源"
              name="ark_project_name_mode"
              tooltip="决定素材同步到火山时，ProjectName 取当前项目编码还是固定默认值。"
            >
              <Radio.Group>
                <Radio.Button value="project_code">使用项目编码</Radio.Button>
                <Radio.Button value="default_value">固定默认值</Radio.Button>
              </Radio.Group>
            </Form.Item>

            {watchedProjectNameMode === 'default_value' ? (
              <Form.Item
                label="ProjectName 默认值"
                name="ark_project_name_default_value"
                rules={[{ required: true, message: '请输入 ProjectName 默认值' }]}
              >
                <Input aria-label="ProjectName 默认值" placeholder="例如 xcyj" />
              </Form.Item>
            ) : null}
          </>
        ) : null}

        {hasDefaultSync ? (
          <Form.Item
            label="默认同步策略"
            name="ark_default_sync_enabled"
            valuePropName="checked"
            tooltip="开启后，新建素材组默认同步火山；关闭后默认仅保留本地 OSS 素材。"
          >
            <Switch checkedChildren="默认同步" unCheckedChildren="默认不同步" />
          </Form.Item>
        ) : null}

        <div
          style={{
            marginBottom: 16,
            borderRadius: 18,
            border: '1px solid #e7dcc7',
            background: 'linear-gradient(135deg, #fffaf0 0%, #f8f4ea 100%)',
            padding: '14px 16px',
          }}
        >
          <Typography.Text strong style={{ color: '#92400e' }}>
            素材组配置说明
          </Typography.Text>
          <Typography.Paragraph style={{ margin: '6px 0 0', color: '#7c5a1f' }}>
            运行态配置页不再手工维护裸 GroupId。你可以直接校验并加载现有火山素材组，或现场新建一个默认素材组。
          </Typography.Paragraph>
        </div>

        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Button
              loading={arkGroupsLoading}
              onClick={async () => {
                const values = form.getFieldsValue()
                await loadArkGroups(values)
              }}
            >
              校验 AK/SK 并加载素材组
            </Button>
            {selectedArkGroup ? (
              <Typography.Text type="secondary">
                当前默认组：{selectedArkGroup.name}（{selectedArkGroup.id}）
              </Typography.Text>
            ) : null}
          </Space>

          {(arkGroupsLoaded || watchedDefaultGroupId) ? (
            <>
              <Radio.Group
                value={arkGroupMode}
                onChange={(event) => setArkGroupMode(event.target.value as ArkGroupMode)}
              >
                <Radio.Button value="existing">选择已有素材组</Radio.Button>
                <Radio.Button value="create">新建素材组</Radio.Button>
              </Radio.Group>

              {arkGroupMode === 'existing' ? (
                <Form.Item
                  label="默认素材组"
                  name="ark_default_group_id"
                  rules={[{ required: true, message: '请选择默认素材组' }]}
                >
                  <Select
                    aria-label="默认素材组"
                    placeholder={arkGroups.length > 0 ? '请选择默认素材组' : '当前未加载到素材组，可切换到新建模式'}
                    disabled={arkGroups.length === 0}
                    options={arkGroups.map((item) => ({
                      label: item.description ? `${item.name} · ${item.description}` : item.name,
                      value: item.id,
                    }))}
                  />
                </Form.Item>
              ) : (
                <>
                  <Form.Item
                    label="新素材组名称"
                    name="ark_new_group_name"
                    rules={[{ required: true, message: '请输入新素材组名称' }]}
                  >
                    <Input
                      aria-label="新素材组名称"
                      placeholder="例如 默认角色图库"
                      onChange={() => form.setFieldValue('ark_default_group_id', '')}
                    />
                  </Form.Item>
                  <Form.Item label="素材组说明" name="ark_new_group_description">
                    <Input
                      aria-label="素材组说明"
                      placeholder="例如 系统默认同步组"
                      onChange={() => form.setFieldValue('ark_default_group_id', '')}
                    />
                  </Form.Item>
                  <Button
                    type="primary"
                    loading={creatingArkGroup}
                    onClick={async () => {
                      const values = form.getFieldsValue()
                      await form.validateFields(['ark_new_group_name', 'ark_new_group_description'])
                      await createArkGroup(values)
                    }}
                  >
                    新建并设为默认组
                  </Button>
                </>
              )}
            </>
          ) : (
            <Typography.Text type="secondary">
              请先使用当前页面里的 AK/SK 校验并加载素材组，再设置默认组。
            </Typography.Text>
          )}
        </Space>
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

  return (
    <>
      {contextHolder}
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <PageHeader
          title="系统配置"
          description="所有配置更新后立即生效，密文字段默认展示脱敏值。素材组默认配置会严格作用于当前项目下的新建素材组与素材同步策略。"
        />

        <Form form={form} layout="vertical" onFinish={handleSave} disabled={loading}>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {renderBrandSection(groupedItems.brand)}
            {renderVideoProviderSection()}
            <div
              data-testid="config-provider-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
                gap: 20,
                width: '100%',
                alignItems: 'start',
              }}
            >
              {renderArkSection(groupedItems.ark)}
              {renderSection('阿里云 OSS 配置', groupedItems.oss)}
            </div>
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
