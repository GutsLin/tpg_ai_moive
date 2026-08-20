import { ConfigProvider } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SetupPage } from '.'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../api/setup', () => ({
  initializeSetup: vi.fn(),
  validateSetupOss: vi.fn(),
  validateSetupArkBearer: vi.fn(),
  validateSetupArkAksk: vi.fn(),
  listSetupArkAssetGroups: vi.fn(),
  createSetupArkAssetGroup: vi.fn(),
}))

const baseStatus = {
  initialized: false as const,
  environment: 'dev',
  version: '1.0.0',
  installMode: 'self_hosted' as const,
  initializedAt: null,
  branding: {
    systemName: 'Narrix',
  },
  health: {
    database: true,
    redis: true,
  },
}

const renderSetupPage = (refreshStatus = vi.fn().mockResolvedValue(baseStatus)) =>
  render(
    <MemoryRouter initialEntries={['/setup']}>
      <ConfigProvider>
        <SetupPage status={baseStatus} refreshStatus={refreshStatus} />
      </ConfigProvider>
    </MemoryRouter>
  )

describe('SetupPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    document.title = ''
  })

  it('环境检查通过后可以进入管理员创建步骤', async () => {
    renderSetupPage()

    expect(await screen.findByText('数据库连接正常')).toBeInTheDocument()
    expect(screen.getByText('Redis 连接正常')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '进入下一步' }))

    expect(await screen.findByRole('heading', { level: 4, name: '系统名称' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: '管理员信息' })).toBeInTheDocument()
    expect(await screen.findByLabelText('管理员用户名')).toBeInTheDocument()
    expect(screen.getByLabelText('管理员密码')).toBeInTheDocument()
  })

  it('基础配置步骤会自动填充默认 TTL 和火山视频 Endpoint', async () => {
    renderSetupPage()

    await userEvent.click(screen.getByRole('button', { name: '进入下一步' }))
    await userEvent.type(await screen.findByLabelText('管理员用户名'), 'narrix-admin')
    await userEvent.type(screen.getByLabelText('管理员密码'), 'pass12345')
    await userEvent.type(screen.getByLabelText('确认管理员密码'), 'pass12345')
    await userEvent.click(screen.getByRole('button', { name: '保存管理员信息' }))

    expect(await screen.findByLabelText('签名 URL TTL（秒）')).toHaveValue('3600')
    expect(screen.getByLabelText('火山视频 Endpoint')).toHaveValue('https://ark.cn-beijing.volces.com/api/v3')
    expect(
      screen.queryByText(
        '安装流程不再要求手工填写裸 GroupId。AK/SK 校验通过后，系统会直接加载火山已有素材组，或允许你现场新建默认素材组。'
      )
    ).not.toBeInTheDocument()
  })

  it('基础配置必填项为空时不能进入安装摘要', async () => {
    renderSetupPage()

    await userEvent.click(screen.getByRole('button', { name: '进入下一步' }))
    await userEvent.type(await screen.findByLabelText('管理员用户名'), 'narrix-admin')
    await userEvent.type(screen.getByLabelText('管理员密码'), 'pass12345')
    await userEvent.type(screen.getByLabelText('确认管理员密码'), 'pass12345')
    await userEvent.click(screen.getByRole('button', { name: '保存管理员信息' }))
    await userEvent.click(await screen.findByRole('button', { name: '保存基础配置' }))

    expect(screen.queryByText('安装摘要')).not.toBeInTheDocument()
    expect(await screen.findByText('请输入 OSS Access Key ID')).toBeInTheDocument()
    expect(screen.getByText('请输入火山 Bearer Token')).toBeInTheDocument()
  })

  it(
    '联通性校验结果会展示在配置步骤中',
    async () => {
      const { validateSetupOss, validateSetupArkBearer, validateSetupArkAksk, listSetupArkAssetGroups } = await import('../../api/setup')

      vi.mocked(validateSetupOss).mockResolvedValue({
        key: 'oss',
        valid: true,
        canContinue: true,
        message: 'OSS 配置校验通过',
      })
      vi.mocked(validateSetupArkBearer).mockResolvedValue({
        key: 'arkBearer',
        valid: false,
        canContinue: true,
        message: '火山视频配置校验失败，请检查 Bearer Token 与 Endpoint 是否正确',
      })
      vi.mocked(validateSetupArkAksk).mockResolvedValue({
        key: 'arkAksk',
        valid: true,
        canContinue: true,
        message: '火山素材资产库配置校验通过',
      })
      vi.mocked(listSetupArkAssetGroups).mockResolvedValue({
        items: [{ id: 'group-1', name: '默认角色组', description: '系统默认组' }],
      })

      renderSetupPage()

      await userEvent.click(screen.getByRole('button', { name: '进入下一步' }))
      await userEvent.type(await screen.findByLabelText('管理员用户名'), 'narrix-admin')
      await userEvent.type(screen.getByLabelText('管理员密码'), 'pass12345')
      await userEvent.type(screen.getByLabelText('确认管理员密码'), 'pass12345')
      await userEvent.click(screen.getByRole('button', { name: '保存管理员信息' }))

      await userEvent.type(await screen.findByLabelText('OSS Access Key ID'), 'oss-ak')
      await userEvent.type(screen.getByLabelText('OSS Access Key Secret'), 'oss-sk')
      await userEvent.type(screen.getByLabelText('OSS Bucket'), 'narrix-assets')
      await userEvent.type(screen.getByLabelText('OSS Region'), 'oss-cn-shanghai')
      await userEvent.type(screen.getByLabelText('OSS STS Role ARN'), 'acs:ram::123:role/narrix')
      await userEvent.clear(screen.getByLabelText('签名 URL TTL（秒）'))
      await userEvent.type(screen.getByLabelText('签名 URL TTL（秒）'), '3600')
      await userEvent.type(screen.getByLabelText('火山 Bearer Token'), 'sk-ark')
      await userEvent.clear(screen.getByLabelText('火山视频 Endpoint'))
      await userEvent.type(screen.getByLabelText('火山视频 Endpoint'), 'https://ark.example.com/api/v3')
      await userEvent.type(screen.getByLabelText('火山素材 Access Key'), 'ak-001')
      await userEvent.type(screen.getByLabelText('火山素材 Secret Key'), 'sk-001')

      await userEvent.click(screen.getByRole('button', { name: '校验 OSS 配置' }))
      await userEvent.click(screen.getByRole('button', { name: '校验火山视频配置' }))
      await userEvent.click(screen.getByRole('button', { name: '校验 AK/SK 并加载素材组' }))

      expect(await screen.findByText('OSS 配置校验通过')).toBeInTheDocument()
      expect(screen.getByText('火山视频配置校验失败，请检查 Bearer Token 与 Endpoint 是否正确')).toBeInTheDocument()
      expect(screen.getByText('火山素材资产库配置校验通过')).toBeInTheDocument()
      expect(screen.getByText('默认素材组设置')).toBeInTheDocument()
      expect(screen.getByText(/当前默认组：默认角色组/)).toBeInTheDocument()
    },
    15_000
  )

  it(
    '火山 AK/SK 校验失败时允许填写已有素材组 ID，并在步骤切换后提交该值',
    async () => {
      const refreshStatus = vi.fn().mockResolvedValue({
        ...baseStatus,
        initialized: true,
        initializedAt: '2026-04-04T10:00:00.000Z',
      })
      const { initializeSetup, validateSetupArkAksk, listSetupArkAssetGroups } = await import('../../api/setup')

      vi.mocked(initializeSetup).mockResolvedValue({ success: true })
      vi.mocked(validateSetupArkAksk).mockResolvedValue({
        key: 'arkAksk',
        valid: false,
        canContinue: true,
        message: '火山素材资产库配置校验失败，请检查 Access Key 与 Secret Key 是否正确',
      })

      renderSetupPage(refreshStatus)

      await userEvent.click(screen.getByRole('button', { name: '进入下一步' }))
      await userEvent.type(await screen.findByLabelText('管理员用户名'), 'narrix-admin')
      await userEvent.type(screen.getByLabelText('管理员密码'), 'pass12345')
      await userEvent.type(screen.getByLabelText('确认管理员密码'), 'pass12345')
      await userEvent.click(screen.getByRole('button', { name: '保存管理员信息' }))

      await userEvent.type(await screen.findByLabelText('OSS Access Key ID'), 'oss-ak')
      await userEvent.type(screen.getByLabelText('OSS Access Key Secret'), 'oss-sk')
      await userEvent.type(screen.getByLabelText('OSS Bucket'), 'narrix-assets')
      await userEvent.type(screen.getByLabelText('OSS Region'), 'oss-cn-shanghai')
      await userEvent.type(screen.getByLabelText('OSS STS Role ARN'), 'acs:ram::123:role/narrix')
      await userEvent.clear(screen.getByLabelText('签名 URL TTL（秒）'))
      await userEvent.type(screen.getByLabelText('签名 URL TTL（秒）'), '3600')
      await userEvent.type(screen.getByLabelText('火山 Bearer Token'), 'sk-ark')
      await userEvent.clear(screen.getByLabelText('火山视频 Endpoint'))
      await userEvent.type(screen.getByLabelText('火山视频 Endpoint'), 'https://ark.example.com/api/v3')
      await userEvent.type(screen.getByLabelText('火山素材 Access Key'), 'ak-001')
      await userEvent.type(screen.getByLabelText('火山素材 Secret Key'), 'sk-001')

      await userEvent.click(screen.getByRole('button', { name: '校验 AK/SK 并加载素材组' }))

      expect(await screen.findByText('AK/SK 校验未通过，可填写确认有效的已有素材组 ID 后继续')).toBeInTheDocument()
      expect(listSetupArkAssetGroups).not.toHaveBeenCalled()

      await userEvent.click(screen.getByRole('button', { name: '保存基础配置' }))
      expect(screen.queryByText('安装摘要')).not.toBeInTheDocument()
      expect(
        (await screen.findAllByText('请选择默认素材组；AK/SK 校验失败时可填写已有素材组 ID')).length
      ).toBeGreaterThan(0)

      await userEvent.type(screen.getByLabelText('已有默认素材组 ID'), 'group-20260416162956-2k56n')
      await userEvent.click(screen.getByRole('button', { name: '保存基础配置' }))
      expect(await screen.findByText('安装摘要')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: '开始初始化' }))
      await waitFor(() => {
        expect(initializeSetup).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              arkDefaultGroupId: 'group-20260416162956-2k56n',
            }),
          })
        )
      })
    },
    30_000
  )

  it('基础配置步骤会提供系统内帮助入口', async () => {
    renderSetupPage()

    await userEvent.click(screen.getByRole('button', { name: '进入下一步' }))
    await userEvent.type(await screen.findByLabelText('管理员用户名'), 'narrix-admin')
    await userEvent.type(screen.getByLabelText('管理员密码'), 'pass12345')
    await userEvent.type(screen.getByLabelText('确认管理员密码'), 'pass12345')
    await userEvent.click(screen.getByRole('button', { name: '保存管理员信息' }))

    expect(await screen.findByRole('link', { name: '查看完整配置教程' })).toHaveAttribute(
      'href',
      '/setup/help/configuration'
    )
    expect(screen.getByRole('link', { name: '查看 OSS STS Role ARN 详细教程' })).toHaveAttribute(
      'href',
      '/setup/help/configuration#oss-role-arn'
    )
  })

  it('完成四步后会提交初始化并跳转到登录页', async () => {
    const refreshStatus = vi.fn().mockResolvedValue({
      ...baseStatus,
      initialized: true,
      initializedAt: '2026-04-04T10:00:00.000Z',
    })
    const { initializeSetup } = await import('../../api/setup')
    const { validateSetupArkAksk, listSetupArkAssetGroups } = await import('../../api/setup')

    vi.mocked(initializeSetup).mockResolvedValue({ success: true })
    vi.mocked(validateSetupArkAksk).mockResolvedValue({
      key: 'arkAksk',
      valid: true,
      canContinue: true,
      message: '火山素材资产库配置校验通过',
    })
    vi.mocked(listSetupArkAssetGroups).mockResolvedValue({
      items: [{ id: 'group-20260416162956-2k56n', name: '默认角色组', description: null }],
    })

    renderSetupPage(refreshStatus)

    await userEvent.click(screen.getByRole('button', { name: '进入下一步' }))
    const systemNameInput = await screen.findByLabelText('系统名称')
    fireEvent.change(systemNameInput, { target: { value: '成都 Propigo' } })
    await userEvent.type(await screen.findByLabelText('管理员用户名'), 'narrix-admin')
    await userEvent.type(screen.getByLabelText('管理员密码'), 'pass12345')
    await userEvent.type(screen.getByLabelText('确认管理员密码'), 'pass12345')
    await userEvent.click(screen.getByRole('button', { name: '保存管理员信息' }))

    await userEvent.type(await screen.findByLabelText('OSS Access Key ID'), 'oss-ak')
    await userEvent.type(screen.getByLabelText('OSS Access Key Secret'), 'oss-sk')
    await userEvent.type(screen.getByLabelText('OSS Bucket'), 'narrix-assets')
    await userEvent.type(screen.getByLabelText('OSS Region'), 'oss-cn-shanghai')
    await userEvent.type(screen.getByLabelText('OSS STS Role ARN'), 'acs:ram::123:role/narrix')
    await userEvent.clear(screen.getByLabelText('签名 URL TTL（秒）'))
    await userEvent.type(screen.getByLabelText('签名 URL TTL（秒）'), '3600')
    await userEvent.type(screen.getByLabelText('火山 Bearer Token'), 'sk-ark')
    await userEvent.clear(screen.getByLabelText('火山视频 Endpoint'))
    await userEvent.type(screen.getByLabelText('火山视频 Endpoint'), 'https://ark.example.com/api/v3')
    await userEvent.type(screen.getByLabelText('火山素材 Access Key'), 'ak-001')
    await userEvent.type(screen.getByLabelText('火山素材 Secret Key'), 'sk-001')
    await userEvent.click(screen.getByRole('button', { name: '校验 AK/SK 并加载素材组' }))
    await userEvent.click(screen.getByRole('button', { name: '保存基础配置' }))

    expect(await screen.findByText('安装摘要')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '开始初始化' }))

    await waitFor(() => {
      expect(initializeSetup).toHaveBeenCalledWith({
        admin: {
          username: 'narrix-admin',
          password: 'pass12345',
        },
        config: {
          systemName: '成都 Propigo',
          arkApiKey: 'sk-ark',
          arkAccessKey: 'ak-001',
          arkSecretKey: 'sk-001',
          arkEndpoint: 'https://ark.example.com/api/v3',
          arkDefaultGroupId: 'group-20260416162956-2k56n',
          arkDefaultSyncEnabled: true,
          ossAccessKeyId: 'oss-ak',
          ossAccessKeySecret: 'oss-sk',
          ossStsRoleArn: 'acs:ram::123:role/narrix',
          ossBucket: 'narrix-assets',
          ossRegion: 'oss-cn-shanghai',
          ossSignedUrlTtl: 3600,
        },
      })
    })

    await waitFor(() => {
      expect(refreshStatus).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
    })
  }, 30_000)

  it('会使用安装态返回的系统名称渲染标题', async () => {
    render(
      <MemoryRouter initialEntries={['/setup']}>
        <ConfigProvider>
          <SetupPage
            status={{
              ...baseStatus,
              branding: {
                systemName: '成都 Propigo',
              },
            }}
            refreshStatus={vi.fn().mockResolvedValue(baseStatus)}
          />
        </ConfigProvider>
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: '初始化 成都 Propigo' })).toBeInTheDocument()
  })
})
