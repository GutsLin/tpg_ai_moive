import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Steps,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  createSetupArkAssetGroup,
  initializeSetup,
  listSetupArkAssetGroups,
  type SetupArkAssetGroupItem,
  type SetupStatus,
  type SetupValidationResult,
  validateSetupArkAksk,
  validateSetupArkBearer,
  validateSetupOss,
} from '../../api/setup'
import { useBrand } from '../../stores/brand'
import { resolveSystemName } from '../../utils/branding'

interface SetupPageProps {
  status: SetupStatus
  refreshStatus: () => Promise<SetupStatus>
}

interface SetupFormValues {
  systemName: string
  adminUsername: string
  adminPassword: string
  adminPasswordConfirm: string
  ossAccessKeyId: string
  ossAccessKeySecret: string
  ossBucket: string
  ossRegion: string
  ossStsRoleArn: string
  ossSignedUrlTtl: string
  arkApiKey: string
  arkEndpoint: string
  arkAccessKey: string
  arkSecretKey: string
  arkDefaultGroupId: string
  arkDefaultSyncEnabled: boolean
  arkNewGroupName?: string
  arkNewGroupDescription?: string
}

const pageShellStyle: CSSProperties = {
  minHeight: '100vh',
  padding: 'clamp(20px, 4vw, 40px)',
  background:
    'radial-gradient(circle at top left, rgba(15,118,110,0.18), transparent 28%), radial-gradient(circle at bottom right, rgba(180,83,9,0.14), transparent 30%), linear-gradient(160deg, #f7f4ee 0%, #f3efe6 35%, #ebe5d8 100%)',
}

const surfaceStyle: CSSProperties = {
  maxWidth: 1160,
  margin: '0 auto',
  borderRadius: 28,
  border: '1px solid rgba(15, 23, 42, 0.08)',
  boxShadow: '0 30px 80px rgba(15, 23, 42, 0.10)',
  background: 'rgba(252, 250, 245, 0.94)',
  overflow: 'hidden',
}

const sectionCardStyle: CSSProperties = {
  borderRadius: 24,
  border: '1px solid rgba(15, 23, 42, 0.08)',
  background: 'rgba(255, 255, 255, 0.72)',
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.06)',
}

const maskSecret = (value: string): string => {
  if (!value) {
    return '未填写'
  }

  if (value.length <= 4) {
    return '****'
  }

  return `${value.slice(0, 2)}****${value.slice(-2)}`
}

const HealthBadge = ({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) => (
  <div
    style={{
      padding: 18,
      borderRadius: 20,
      border: `1px solid ${ok ? 'rgba(15,118,110,0.24)' : 'rgba(220,38,38,0.18)'}`,
      background: ok ? 'rgba(240, 253, 250, 0.92)' : 'rgba(254, 242, 242, 0.92)',
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <Typography.Text strong>{ok ? okText : badText}</Typography.Text>
      <Tag color={ok ? 'success' : 'error'}>{ok ? 'Ready' : 'Blocked'}</Tag>
    </div>
  </div>
)

const CONFIG_FIELD_NAMES: Array<keyof SetupFormValues> = [
  'ossAccessKeyId',
  'ossAccessKeySecret',
  'ossBucket',
  'ossRegion',
  'ossStsRoleArn',
  'ossSignedUrlTtl',
  'arkApiKey',
  'arkEndpoint',
  'arkAccessKey',
  'arkSecretKey',
  'arkDefaultSyncEnabled',
]

type ArkGroupMode = 'existing' | 'create'

const DEFAULT_OSS_SIGNED_URL_TTL = '3600'
const DEFAULT_ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3'
const ARK_DEFAULT_GROUP_ID_PATTERN = /^group-[^-]+-.+$/

export const SetupPage = ({ status, refreshStatus }: SetupPageProps) => {
  const [form] = Form.useForm<SetupFormValues>()
  const navigate = useNavigate()
  const { state: brand } = useBrand()
  const [messageApi, contextHolder] = message.useMessage()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [validatingKey, setValidatingKey] = useState<SetupValidationResult['key'] | null>(null)
  const [validationResults, setValidationResults] = useState<
    Partial<Record<SetupValidationResult['key'], SetupValidationResult>>
  >({})
  const [arkGroups, setArkGroups] = useState<SetupArkAssetGroupItem[]>([])
  const [arkGroupMode, setArkGroupMode] = useState<ArkGroupMode>('existing')
  const [arkGroupsLoaded, setArkGroupsLoaded] = useState(false)
  const [arkGroupsLoading, setArkGroupsLoading] = useState(false)
  const [creatingArkGroup, setCreatingArkGroup] = useState(false)

  const watchedSystemName = Form.useWatch('systemName', form)
  const watchedGroupId = Form.useWatch('arkDefaultGroupId', form)
  const watchedDefaultSyncEnabled = Form.useWatch('arkDefaultSyncEnabled', form)
  const systemName = resolveSystemName(watchedSystemName ?? status.branding?.systemName ?? brand.systemName)

  useEffect(() => {
    const nextValues: Partial<SetupFormValues> = {}

    if (!form.getFieldValue('systemName')) {
      nextValues.systemName = status.branding?.systemName ?? 'Narrix'
    }
    if (form.getFieldValue('ossSignedUrlTtl') === undefined) {
      nextValues.ossSignedUrlTtl = DEFAULT_OSS_SIGNED_URL_TTL
    }
    if (form.getFieldValue('arkEndpoint') === undefined) {
      nextValues.arkEndpoint = DEFAULT_ARK_ENDPOINT
    }
    if (form.getFieldValue('arkDefaultSyncEnabled') === undefined) {
      nextValues.arkDefaultSyncEnabled = true
    }

    if (Object.keys(nextValues).length > 0) {
      form.setFieldsValue(nextValues)
    }
  }, [form, status.branding?.systemName])

  useEffect(() => {
    document.title = `${systemName} 安装向导`
  }, [systemName])

  const selectedArkGroup = useMemo(
    () => arkGroups.find((item) => item.id === watchedGroupId) ?? null,
    [arkGroups, watchedGroupId]
  )

  const loadArkGroups = async (
    credentials: Pick<SetupFormValues, 'arkAccessKey' | 'arkSecretKey'>,
    options: { keepSelection?: boolean } = {}
  ) => {
    setArkGroupsLoading(true)

    try {
      const result = await listSetupArkAssetGroups({
        accessKey: credentials.arkAccessKey,
        secretKey: credentials.arkSecretKey,
      })

      setArkGroups(result.items)
      setArkGroupsLoaded(true)

      const currentGroupId = form.getFieldValue('arkDefaultGroupId')
      const matchedCurrent = result.items.find((item) => item.id === currentGroupId)
      if (!matchedCurrent && result.items.length > 0) {
        form.setFieldValue('arkDefaultGroupId', result.items[0].id)
      }

      if (result.items.length === 0) {
        setArkGroupMode('create')
      } else if (!options.keepSelection || !matchedCurrent) {
        setArkGroupMode('existing')
      }

      return result.items
    } finally {
      setArkGroupsLoading(false)
    }
  }

  const createArkGroup = async (
    values: Pick<SetupFormValues, 'arkAccessKey' | 'arkSecretKey' | 'arkNewGroupName' | 'arkNewGroupDescription'>
  ) => {
    setCreatingArkGroup(true)
    try {
      const created = await createSetupArkAssetGroup({
        accessKey: values.arkAccessKey,
        secretKey: values.arkSecretKey,
        name: values.arkNewGroupName?.trim() ?? '',
        description: values.arkNewGroupDescription?.trim() || undefined,
      })
      setArkGroups((current) => {
        const next = [...current.filter((item) => item.id !== created.id), created]
        next.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
        return next
      })
      setArkGroupsLoaded(true)
      setArkGroupMode('existing')
      form.setFieldValue('arkDefaultGroupId', created.id)
      void messageApi.success(`已创建素材组「${created.name}」并设为默认组`)
      return created.id
    } finally {
      setCreatingArkGroup(false)
    }
  }

  const ensureArkDefaultGroupReady = async (): Promise<string> => {
    if (arkGroupMode === 'create') {
      const values = await form.validateFields([
        'arkAccessKey',
        'arkSecretKey',
        'arkNewGroupName',
        'arkNewGroupDescription',
      ])
      return await createArkGroup(values)
    }

    const groupId = String(form.getFieldValue('arkDefaultGroupId') ?? '').trim()
    if (!groupId || !ARK_DEFAULT_GROUP_ID_PATTERN.test(groupId)) {
      const error = groupId
        ? '素材组 ID 格式不正确，应类似 group-20260416162956-2k56n'
        : '请选择默认素材组；AK/SK 校验失败时可填写已有素材组 ID'
      form.setFields([{ name: 'arkDefaultGroupId', errors: [error] }])
      if (step !== 2) {
        setStep(2)
      }
      void messageApi.error(error)
      throw new Error(error)
    }

    form.setFieldValue('arkDefaultGroupId', groupId)
    return groupId
  }

  const goToAdminStep = async () => {
    if (!status.health.database || !status.health.redis) {
      void messageApi.error('基础环境尚未就绪，请先处理数据库或 Redis 健康检查')
      return
    }

    setStep(1)
  }

  const saveAdmin = async () => {
    try {
      const values = await form.validateFields(['systemName', 'adminUsername', 'adminPassword', 'adminPasswordConfirm'])
      if (values.adminPassword !== values.adminPasswordConfirm) {
        form.setFields([
          {
            name: 'adminPasswordConfirm',
            errors: ['两次输入的管理员密码不一致'],
          },
        ])
        return
      }

      setStep(2)
    } catch {
      return
    }
  }

  const validateOssConfig = async () => {
    const values = await form.validateFields([
      'ossAccessKeyId',
      'ossAccessKeySecret',
      'ossBucket',
      'ossRegion',
      'ossStsRoleArn',
    ])

    setValidatingKey('oss')
    try {
      const result = await validateSetupOss({
        accessKeyId: values.ossAccessKeyId,
        accessKeySecret: values.ossAccessKeySecret,
        bucket: values.ossBucket,
        region: values.ossRegion,
        stsRoleArn: values.ossStsRoleArn,
      })
      setValidationResults((current) => ({ ...current, oss: result }))
    } finally {
      setValidatingKey(null)
    }
  }

  const validateArkBearerConfig = async () => {
    const values = await form.validateFields(['arkApiKey', 'arkEndpoint'])

    setValidatingKey('arkBearer')
    try {
      const result = await validateSetupArkBearer({
        apiKey: values.arkApiKey,
        endpoint: values.arkEndpoint,
      })
      setValidationResults((current) => ({ ...current, arkBearer: result }))
    } finally {
      setValidatingKey(null)
    }
  }

  const validateArkAkskConfig = async () => {
    const values = await form.validateFields(['arkAccessKey', 'arkSecretKey'])

    setValidatingKey('arkAksk')
    try {
      const result = await validateSetupArkAksk({
        accessKey: values.arkAccessKey,
        secretKey: values.arkSecretKey,
      })
      setValidationResults((current) => ({ ...current, arkAksk: result }))

      if (result.valid) {
        await loadArkGroups(values)
      }
    } finally {
      setValidatingKey(null)
    }
  }

  const saveConfig = async () => {
    try {
      await form.validateFields(CONFIG_FIELD_NAMES)
      await ensureArkDefaultGroupReady()
      setStep(3)
    } catch {
      return
    }
  }

  const submitInitialization = async () => {
    try {
      const values = await form.validateFields([
        'adminUsername',
        'adminPassword',
        'adminPasswordConfirm',
        ...CONFIG_FIELD_NAMES,
      ])
      const submittedSystemName = resolveSystemName(form.getFieldValue('systemName'))

      if (values.adminPassword !== values.adminPasswordConfirm) {
        form.setFields([
          {
            name: 'adminPasswordConfirm',
            errors: ['两次输入的管理员密码不一致'],
          },
        ])
        return
      }

      const arkDefaultGroupId = await ensureArkDefaultGroupReady()

      setSubmitting(true)
      await initializeSetup({
        admin: {
          username: values.adminUsername,
          password: values.adminPassword,
        },
        config: {
          systemName: submittedSystemName,
          arkApiKey: values.arkApiKey,
          arkAccessKey: values.arkAccessKey,
          arkSecretKey: values.arkSecretKey,
          arkEndpoint: values.arkEndpoint,
          arkDefaultGroupId,
          arkDefaultSyncEnabled: Boolean(values.arkDefaultSyncEnabled),
          ossAccessKeyId: values.ossAccessKeyId,
          ossAccessKeySecret: values.ossAccessKeySecret,
          ossStsRoleArn: values.ossStsRoleArn,
          ossBucket: values.ossBucket,
          ossRegion: values.ossRegion,
          ossSignedUrlTtl: Number(values.ossSignedUrlTtl),
        },
      })

      const nextStatus = await refreshStatus()
      if (nextStatus.initialized) {
        navigate('/login', { replace: true })
        return
      }

      void messageApi.error(`${systemName} 初始化未成功切换到运行态，请检查后端日志`)
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      void messageApi.error(error?.response?.data?.message ?? `${systemName} 初始化失败，请检查管理员信息和第三方配置`)
    } finally {
      setSubmitting(false)
    }
  }

  const values = form.getFieldsValue()

  return (
    <div style={pageShellStyle}>
      {contextHolder}
      <div style={surfaceStyle}>
        <div
          style={{
            padding: 'clamp(24px, 4vw, 40px)',
            borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.88) 0%, rgba(249,246,240,0.94) 60%, rgba(241,243,242,0.96) 100%)',
          }}
        >
          {brand.logoUrl ? (
            <div style={{ marginBottom: 18 }}>
              <img
                src={brand.logoUrl}
                alt={`${systemName} Logo`}
                style={{ maxWidth: 240, maxHeight: 64, objectFit: 'contain' }}
              />
            </div>
          ) : null}
          <Typography.Text
            style={{
              display: 'inline-flex',
              padding: '6px 12px',
              borderRadius: 999,
              background: 'rgba(15,118,110,0.10)',
              color: '#0f766e',
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            {systemName} · 首次安装向导
          </Typography.Text>
          <Typography.Title level={2} style={{ margin: 0 }}>
            初始化 {systemName}
          </Typography.Title>
          <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0, maxWidth: 680, color: '#475569' }}>
            这是一套面向客户自部署交付的叙事内容生产平台。请先确认运行环境，再创建超级管理员并完成第三方配置录入。
          </Typography.Paragraph>
        </div>

        <div style={{ padding: 'clamp(24px, 4vw, 36px)' }}>
          <Steps
            current={step}
            responsive
            items={[
              { title: '环境检查', content: `确认 ${systemName} 当前实例已进入安装态` },
              { title: '管理员账号', content: '创建首次登录使用的超级管理员' },
              { title: '基础配置', content: '录入 OSS 与火山能力配置，并选择默认素材组' },
              { title: '完成安装', content: '确认摘要并提交初始化事务' },
            ]}
          />

          <Form form={form} layout="vertical" style={{ marginTop: 28 }}>
            {step === 0 ? (
              <div style={{ display: 'grid', gap: 18 }}>
                <Card style={sectionCardStyle}>
                  <Typography.Title level={4}>环境检查</Typography.Title>
                  <Typography.Paragraph type="secondary">
                    未安装阶段必须先确认数据库与 Redis 已可用。只有基础环境正常，后续初始化事务才有意义。
                  </Typography.Paragraph>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                    <HealthBadge
                      ok={status.health.database}
                      okText="数据库连接正常"
                      badText="数据库连接异常"
                    />
                    <HealthBadge ok={status.health.redis} okText="Redis 连接正常" badText="Redis 连接异常" />
                  </div>
                  <div
                    style={{
                      marginTop: 20,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 12,
                    }}
                  >
                    <div>
                      <Typography.Text type="secondary">运行环境</Typography.Text>
                      <div>{status.environment}</div>
                    </div>
                    <div>
                      <Typography.Text type="secondary">产品版本</Typography.Text>
                      <div>{status.version}</div>
                    </div>
                    <div>
                      <Typography.Text type="secondary">安装模式</Typography.Text>
                      <div>{status.installMode}</div>
                    </div>
                  </div>
                  {(!status.health.database || !status.health.redis) && (
                    <Alert
                      style={{ marginTop: 20 }}
                      type="error"
                      showIcon
                      message="基础依赖尚未准备完成"
                      description="请先检查 Docker Compose、数据库迁移和 Redis 服务状态，再继续 Narrix 安装流程。"
                    />
                  )}
                </Card>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="primary" size="large" onClick={goToAdminStep}>
                    进入下一步
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div style={{ display: 'grid', gap: 18 }}>
                <Card style={sectionCardStyle}>
                  <Typography.Title level={4}>系统名称</Typography.Title>
                  <Typography.Paragraph type="secondary">
                    安装向导会把这个名称写入品牌配置，并用于登录页、浏览器标题和初始化摘要展示。
                  </Typography.Paragraph>
                  <Form.Item
                    label="系统名称"
                    name="systemName"
                    rules={[{ required: true, message: '请输入系统名称' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input id="systemName" aria-label="系统名称" placeholder="例如 成都 Propigo" size="large" />
                  </Form.Item>
                </Card>

                <Card style={sectionCardStyle}>
                  <Typography.Title level={4}>管理员信息</Typography.Title>
                  <Typography.Paragraph type="secondary">
                    首个管理员将拥有 {systemName} 的全部菜单权限。安装完成后，后续账号仍通过常规用户管理页维护。
                  </Typography.Paragraph>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                    <Form.Item
                      label="管理员用户名"
                      name="adminUsername"
                      rules={[{ required: true, message: '请输入管理员用户名' }]}
                    >
                      <Input id="adminUsername" placeholder="例如 narrix-admin" size="large" />
                    </Form.Item>
                    <Form.Item
                      label="管理员密码"
                      name="adminPassword"
                      rules={[{ required: true, message: '请输入管理员密码' }, { min: 8, message: '管理员密码至少 8 位' }]}
                    >
                      <Input.Password id="adminPassword" placeholder="请输入管理员密码" size="large" />
                    </Form.Item>
                    <Form.Item
                      label="确认管理员密码"
                      name="adminPasswordConfirm"
                      rules={[{ required: true, message: '请再次输入管理员密码' }]}
                    >
                      <Input.Password id="adminPasswordConfirm" placeholder="再次输入管理员密码" size="large" />
                    </Form.Item>
                  </div>
                </Card>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <Button size="large" onClick={() => setStep(0)}>
                    返回环境检查
                  </Button>
                  <Button type="primary" size="large" onClick={saveAdmin}>
                    保存管理员信息
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div style={{ display: 'grid', gap: 18 }}>
                <Card style={sectionCardStyle}>
                  <Typography.Title level={4}>配置基础服务</Typography.Title>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 10 }}>
                    必填项为空时禁止提交。联通性校验失败会明确提示，但你仍可以在必要时先完成安装，再回到 {systemName} 后台调整配置。
                  </Typography.Paragraph>
                  <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <Typography.Text type="secondary" style={{ lineHeight: 1.35 }}>
                      配置项较多时，建议先打开系统内教程页，边看边填。
                    </Typography.Text>
                    <Button type="link" href="/setup/help/configuration" target="_blank">
                      查看完整配置教程
                    </Button>
                  </div>

                  <div style={{ display: 'grid', gap: 20 }}>
                    <div>
                      <Typography.Title level={5}>OSS 配置</Typography.Title>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                        <Form.Item label="OSS Access Key ID" name="ossAccessKeyId" rules={[{ required: true, message: '请输入 OSS Access Key ID' }]}>
                          <Input id="ossAccessKeyId" size="large" />
                        </Form.Item>
                        <Form.Item label="OSS Access Key Secret" name="ossAccessKeySecret" rules={[{ required: true, message: '请输入 OSS Access Key Secret' }]}>
                          <Input.Password id="ossAccessKeySecret" size="large" />
                        </Form.Item>
                        <Form.Item label="OSS Bucket" name="ossBucket" rules={[{ required: true, message: '请输入 OSS Bucket' }]}>
                          <Input id="ossBucket" size="large" />
                        </Form.Item>
                        <Form.Item label="OSS Region" name="ossRegion" rules={[{ required: true, message: '请输入 OSS Region' }]}>
                          <Input id="ossRegion" size="large" />
                        </Form.Item>
                        <Form.Item
                          label="OSS STS Role ARN"
                          extra={
                            <Typography.Link href="/setup/help/configuration#oss-role-arn" target="_blank">
                              查看 OSS STS Role ARN 详细教程
                            </Typography.Link>
                          }
                          name="ossStsRoleArn"
                          rules={[{ required: true, message: '请输入 OSS STS Role ARN' }]}
                        >
                          <Input id="ossStsRoleArn" size="large" />
                        </Form.Item>
                        <Form.Item
                          label="签名 URL TTL（秒）"
                          name="ossSignedUrlTtl"
                          rules={[{ required: true, message: '请输入签名 URL TTL' }]}
                        >
                          <Input id="ossSignedUrlTtl" size="large" />
                        </Form.Item>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Button loading={validatingKey === 'oss'} onClick={validateOssConfig}>
                          校验 OSS 配置
                        </Button>
                        {validationResults.oss ? (
                          <Alert
                            type={validationResults.oss.valid ? 'success' : 'warning'}
                            showIcon
                            message={validationResults.oss.message}
                          />
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <Typography.Title level={5}>火山视频配置</Typography.Title>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                        <Form.Item label="火山 Bearer Token" name="arkApiKey" rules={[{ required: true, message: '请输入火山 Bearer Token' }]}>
                          <Input.Password id="arkApiKey" size="large" />
                        </Form.Item>
                        <Form.Item
                          label="火山视频 Endpoint"
                          name="arkEndpoint"
                          rules={[{ required: true, message: '请输入火山视频 Endpoint' }]}
                        >
                          <Input id="arkEndpoint" size="large" />
                        </Form.Item>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Button loading={validatingKey === 'arkBearer'} onClick={validateArkBearerConfig}>
                          校验火山视频配置
                        </Button>
                        {validationResults.arkBearer ? (
                          <Alert
                            type={validationResults.arkBearer.valid ? 'success' : 'warning'}
                            showIcon
                            message={validationResults.arkBearer.message}
                          />
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <Typography.Title level={5}>火山素材配置</Typography.Title>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                        <Form.Item label="火山素材 Access Key" name="arkAccessKey" rules={[{ required: true, message: '请输入火山素材 Access Key' }]}>
                          <Input id="arkAccessKey" size="large" />
                        </Form.Item>
                        <Form.Item label="火山素材 Secret Key" name="arkSecretKey" rules={[{ required: true, message: '请输入火山素材 Secret Key' }]}>
                          <Input.Password id="arkSecretKey" size="large" />
                        </Form.Item>
                        <Form.Item
                          label="默认同步策略"
                          name="arkDefaultSyncEnabled"
                          valuePropName="checked"
                          tooltip="开启后，新建素材组默认同步火山；关闭后默认仅保留本地 OSS 素材。"
                        >
                          <Switch checkedChildren="默认同步" unCheckedChildren="默认不同步" />
                        </Form.Item>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Button loading={validatingKey === 'arkAksk' || arkGroupsLoading} onClick={validateArkAkskConfig}>
                          校验 AK/SK 并加载素材组
                        </Button>
                        {validationResults.arkAksk ? (
                          <Alert
                            type={validationResults.arkAksk.valid ? 'success' : 'warning'}
                            showIcon
                            message={validationResults.arkAksk.message}
                          />
                        ) : null}
                      </div>
                      {validationResults.arkAksk?.valid && (arkGroupsLoaded || watchedGroupId !== undefined) ? (
                        <div
                          style={{
                            marginTop: 18,
                            borderRadius: 18,
                            border: '1px solid #dbe4ea',
                            background: '#f8fafc',
                            padding: 18,
                          }}
                        >
                          <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            <div>
                              <Typography.Text strong>默认素材组设置</Typography.Text>
                              <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                                当前共加载 {arkGroups.length} 个火山素材组。你可以直接选择已有素材组，也可以先新建一个再作为系统默认组。
                              </Typography.Paragraph>
                            </div>

                            <Radio.Group
                              value={arkGroupMode}
                              onChange={(event) => setArkGroupMode(event.target.value as ArkGroupMode)}
                            >
                              <Radio.Button value="existing">选择已有素材组</Radio.Button>
                              <Radio.Button value="create">新建素材组</Radio.Button>
                            </Radio.Group>

                            {arkGroupMode === 'existing' ? (
                              <>
                                <Form.Item
                                  label="默认素材组"
                                  name="arkDefaultGroupId"
                                  rules={[{ required: true, message: '请选择默认素材组' }]}
                                >
                                  <Select
                                    aria-label="默认素材组"
                                    placeholder={arkGroups.length > 0 ? '请选择默认素材组' : '当前火山下暂无素材组，请切换为新建'}
                                    disabled={arkGroups.length === 0}
                                    options={arkGroups.map((item) => ({
                                      label: item.description ? `${item.name} · ${item.description}` : item.name,
                                      value: item.id,
                                    }))}
                                  />
                                </Form.Item>
                                <Space size={12} wrap>
                                  <Button
                                    onClick={() => {
                                      const values = form.getFieldsValue(['arkAccessKey', 'arkSecretKey'])
                                      void loadArkGroups(values, { keepSelection: true })
                                    }}
                                    loading={arkGroupsLoading}
                                  >
                                    重新加载素材组列表
                                  </Button>
                                  {selectedArkGroup ? (
                                    <Typography.Text type="secondary">
                                      当前默认组：{selectedArkGroup.name}（{selectedArkGroup.id}）
                                    </Typography.Text>
                                  ) : null}
                                </Space>
                              </>
                            ) : (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                                  <Form.Item
                                    label="新素材组名称"
                                    name="arkNewGroupName"
                                    rules={[{ required: true, message: '请输入新素材组名称' }]}
                                  >
                                    <Input
                                      id="arkNewGroupName"
                                      aria-label="新素材组名称"
                                      placeholder="例如 默认角色图库"
                                      onChange={() => form.setFieldValue('arkDefaultGroupId', '')}
                                    />
                                  </Form.Item>
                                  <Form.Item
                                    label="素材组说明"
                                    name="arkNewGroupDescription"
                                  >
                                    <Input
                                      id="arkNewGroupDescription"
                                      aria-label="素材组说明"
                                      placeholder="例如 系统默认同步组"
                                      onChange={() => form.setFieldValue('arkDefaultGroupId', '')}
                                    />
                                  </Form.Item>
                                </div>
                                <Space size={12} wrap>
                                  <Button
                                    type="primary"
                                    loading={creatingArkGroup}
                                    onClick={async () => {
                                      const values = await form.validateFields([
                                        'arkAccessKey',
                                        'arkSecretKey',
                                        'arkNewGroupName',
                                        'arkNewGroupDescription',
                                      ])
                                      await createArkGroup(values)
                                    }}
                                  >
                                    新建并设为默认组
                                  </Button>
                                  {watchedGroupId ? (
                                    <Typography.Text type="secondary">
                                      已绑定默认素材组 ID：{watchedGroupId}
                                    </Typography.Text>
                                  ) : (
                                    <Typography.Text type="secondary">
                                      未创建前不会保存默认素材组，请先完成新建。
                                    </Typography.Text>
                                  )}
                                </Space>
                              </>
                            )}
                          </Space>
                        </div>
                      ) : null}
                      {validationResults.arkAksk &&
                      !arkGroupsLoading &&
                      (!validationResults.arkAksk.valid || !arkGroupsLoaded) ? (
                        <div
                          style={{
                            marginTop: 18,
                            borderRadius: 18,
                            border: '1px solid #f5c26b',
                            background: '#fffbeb',
                            padding: 18,
                          }}
                        >
                          <Alert
                            type="warning"
                            showIcon
                            message={
                              validationResults.arkAksk.valid
                                ? '素材组列表加载失败，可填写已有素材组 ID 后继续'
                                : 'AK/SK 校验未通过，可填写确认有效的已有素材组 ID 后继续'
                            }
                            style={{ marginBottom: 16 }}
                          />
                          <Form.Item
                            label="已有默认素材组 ID"
                            name="arkDefaultGroupId"
                            extra="仅作为火山接口暂时不可用时的兜底；格式应类似 group-20260416162956-2k56n。"
                            rules={[
                              { required: true, message: '请输入已有默认素材组 ID' },
                              {
                                pattern: ARK_DEFAULT_GROUP_ID_PATTERN,
                                message: '素材组 ID 格式不正确，应类似 group-20260416162956-2k56n',
                              },
                            ]}
                          >
                            <Input
                              id="arkDefaultGroupIdFallback"
                              aria-label="已有默认素材组 ID"
                              placeholder="group-20260416162956-2k56n"
                            />
                          </Form.Item>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Card>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <Button size="large" onClick={() => setStep(1)}>
                    返回管理员信息
                  </Button>
                  <Button type="primary" size="large" onClick={saveConfig}>
                    保存基础配置
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div style={{ display: 'grid', gap: 18 }}>
                <Card style={sectionCardStyle}>
                  <Typography.Title level={4}>安装摘要</Typography.Title>
                  <Typography.Paragraph type="secondary">
                    最终提交前，请确认 {systemName} 将写入的初始化信息。敏感配置不会在摘要中回显明文。
                  </Typography.Paragraph>

                  <Descriptions column={1} bordered size="middle">
                    <Descriptions.Item label="系统名称">{systemName}</Descriptions.Item>
                    <Descriptions.Item label="超级管理员">{values.adminUsername || '未填写'}</Descriptions.Item>
                    <Descriptions.Item label="运行环境">{status.environment}</Descriptions.Item>
                    <Descriptions.Item label="OSS 配置摘要">
                      {values.ossBucket || '未填写'} / {values.ossRegion || '未填写'} / {maskSecret(values.ossAccessKeyId || '')}
                    </Descriptions.Item>
                    <Descriptions.Item label="火山配置摘要">
                      {maskSecret(values.arkApiKey || '')} / {maskSecret(values.arkAccessKey || '')}
                    </Descriptions.Item>
                    <Descriptions.Item label="默认素材组">
                      {selectedArkGroup ? `${selectedArkGroup.name}（${selectedArkGroup.id}）` : values.arkDefaultGroupId || '未选择'}
                    </Descriptions.Item>
                    <Descriptions.Item label="默认同步策略">
                      {watchedDefaultSyncEnabled ? '默认同步火山' : '默认不同步，仅保留本地素材'}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <Button size="large" onClick={() => setStep(2)}>
                    返回基础配置
                  </Button>
                  <Button type="primary" size="large" loading={submitting} onClick={submitInitialization}>
                    开始初始化
                  </Button>
                </div>
              </div>
            ) : null}
          </Form>
        </div>
      </div>
    </div>
  )
}
