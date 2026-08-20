import { ConfigProvider } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRouter } from '../../router'
import { AuthProvider } from '../../stores/auth'
import { buildChangedConfigItems } from '.'

const validArkGroupId = 'group-1712300000000-abcd1234'

vi.mock('../../api/config', () => ({
  getConfigItems: vi.fn(),
  updateConfigItems: vi.fn(),
  listConfigArkAssetGroups: vi.fn(),
  createConfigArkAssetGroup: vi.fn(),
}))

vi.mock('../../utils/oss-upload', () => ({
  uploadFileToOss: vi.fn(),
}))

vi.mock('../../api/setup', () => ({
  getSetupStatus: vi.fn(),
  initializeSetup: vi.fn(),
  validateSetupOss: vi.fn(),
  validateSetupArkBearer: vi.fn(),
  validateSetupArkAksk: vi.fn(),
}))

const renderConfigPage = () =>
  render(
    <ConfigProvider>
      <AuthProvider>
        <AppRouter initialEntries={['/config']} />
      </AuthProvider>
    </ConfigProvider>
  )

describe('ConfigPage', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('token', 'admin-token')
    localStorage.setItem(
      'auth-user',
      JSON.stringify({
        id: 1,
        username: 'admin',
        role: 'admin',
        menuPerms: ['assets', 'users', 'config'],
        status: 1,
      })
    )
    vi.resetAllMocks()
  })

  it('加载后显示脱敏 secret 字段与普通配置字段', async () => {
    const { getConfigItems } = await import('../../api/config')
    const { getSetupStatus } = await import('../../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })
    vi.mocked(getConfigItems).mockResolvedValue({
      items: [
        { key: 'ark_api_key', value: 'sk-****8abc', isSecret: true, description: 'Ark API Key' },
        { key: 'ark_endpoint', value: 'https://ark.example.com', isSecret: false, description: 'Ark endpoint' },
      ],
    })

    renderConfigPage()

    expect(await screen.findByDisplayValue('sk-****8abc')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('https://ark.example.com')).toBeInTheDocument()
  })

  it('未修改的密文字段保存时不提交，修改过的字段会提交', async () => {
    const { getConfigItems, updateConfigItems } = await import('../../api/config')
    const { getSetupStatus } = await import('../../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })
    vi.mocked(getConfigItems).mockResolvedValue({
      items: [
        { key: 'ark_api_key', value: 'sk-****8abc', isSecret: true, description: 'Ark API Key' },
        { key: 'ark_endpoint', value: 'https://ark.example.com', isSecret: false, description: 'Ark endpoint' },
      ],
    })
    vi.mocked(updateConfigItems).mockResolvedValue(undefined)

    renderConfigPage()

    const endpointInput = await screen.findByDisplayValue('https://ark.example.com')
    await userEvent.clear(endpointInput)
    await userEvent.type(endpointInput, 'https://ark-next.example.com')
    await userEvent.click(screen.getAllByRole('button', { name: '保存配置' })[0])

    await waitFor(() => {
      expect(updateConfigItems).toHaveBeenCalledWith([
        { key: 'ark_endpoint', value: 'https://ark-next.example.com' },
      ])
    })
  })

  it('构造更新 payload 时会忽略 undefined 字段，只保留真实修改项', () => {
    expect(
      buildChangedConfigItems(
        [
          { key: 'ark_api_key', value: 'sk-****8abc', isSecret: true, description: 'Ark API Key' },
          { key: 'ark_endpoint', value: 'https://ark.example.com', isSecret: false, description: 'Ark endpoint' },
          { key: 'oss_bucket', value: 'tiaopigouycloud', isSecret: false, description: 'OSS bucket' },
          { key: 'oss_region', value: 'oss-cn-chengdu', isSecret: false, description: 'OSS region' },
          { key: 'oss_signed_url_ttl', value: '3600', isSecret: false, description: 'OSS ttl' },
        ],
        {
          oss_signed_url_ttl: '3601',
        }
      )
    ).toEqual([{ key: 'oss_signed_url_ttl', value: '3601' }])
  })

  it('配置页可切换服务端 OSS 内网模式，浏览器侧配置不受影响', async () => {
    const { getConfigItems, updateConfigItems } = await import('../../api/config')
    const { getSetupStatus } = await import('../../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'prod',
      version: '1.0.1',
      installMode: 'self_hosted',
      initializedAt: '2026-08-19T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })
    vi.mocked(getConfigItems).mockResolvedValue({
      items: [
        {
          key: 'oss_server_internal_enabled',
          value: 'false',
          isSecret: false,
          description: '服务端 OSS 是否使用内网 Endpoint',
        },
      ],
    })
    vi.mocked(updateConfigItems).mockResolvedValue(undefined)

    renderConfigPage()

    const networkSwitch = await screen.findByRole('switch', { name: '服务端 OSS 访问网络' })
    expect(networkSwitch).not.toBeChecked()

    await userEvent.click(networkSwitch)
    await userEvent.click(screen.getAllByRole('button', { name: '保存配置' })[0])

    await waitFor(() => {
      expect(updateConfigItems).toHaveBeenCalledWith([
        { key: 'oss_server_internal_enabled', value: 'true' },
      ])
    })
  })

  it('配置页可加载火山素材组并把默认同步策略一起保存', async () => {
    const { getConfigItems, updateConfigItems, listConfigArkAssetGroups } = await import('../../api/config')
    const { getSetupStatus } = await import('../../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })
    vi.mocked(getConfigItems).mockResolvedValue({
      items: [
        { key: 'ark_access_key', value: 'ak-****0001', isSecret: true, description: 'Access Key' },
        { key: 'ark_secret_key', value: 'sk-****0001', isSecret: true, description: 'Secret Key' },
        { key: 'ark_default_group_id', value: validArkGroupId, isSecret: false, description: '默认素材组 ID' },
        { key: 'ark_default_sync_enabled', value: 'true', isSecret: false, description: '默认同步策略' },
      ],
    })
    vi.mocked(listConfigArkAssetGroups).mockResolvedValue({
      items: [
        { id: validArkGroupId, name: '默认角色组', description: '系统默认组' },
        { id: 'group-1712300000000-efgh5678', name: '视频公共组', description: null },
      ],
    })
    vi.mocked(updateConfigItems).mockResolvedValue(undefined)

    renderConfigPage()

    await userEvent.click(await screen.findByRole('button', { name: '校验 AK/SK 并加载素材组' }))
    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(screen.getAllByRole('button', { name: '保存配置' })[0])

    await waitFor(() => {
      expect(updateConfigItems).toHaveBeenCalledWith([
        { key: 'ark_default_sync_enabled', value: 'false' },
      ])
    })
  })

  it('配置页品牌配置展示 Logo 上传入口，并允许把上传后的 OSS Key 一起保存', async () => {
    const { getConfigItems } = await import('../../api/config')
    const { updateConfigItems } = await import('../../api/config')
    const { getSetupStatus } = await import('../../api/setup')
    const { uploadFileToOss } = await import('../../utils/oss-upload')
    const createObjectUrl = vi.fn(() => 'blob:logo-preview')
    const revokeObjectUrl = vi.fn()

    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      value: revokeObjectUrl,
    })

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.0',
      installMode: 'self_hosted',
      initializedAt: '2026-04-04T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })
    vi.mocked(getConfigItems).mockResolvedValue({
      items: [
        { key: 'system_name', value: '调皮狗云创', isSecret: false, description: '系统名称' },
        { key: 'system_logo_key', value: 'assets/branding/logo.png', isSecret: false, description: '系统 Logo OSS Key' },
      ],
    })
    vi.mocked(uploadFileToOss).mockResolvedValue({
      ossKey: 'assets/branding/logo-next.png',
    })
    vi.mocked(updateConfigItems).mockResolvedValue(undefined)

    renderConfigPage()

    expect(await screen.findByDisplayValue('调皮狗云创')).toBeInTheDocument()
    expect(screen.getByText('系统 Logo')).toBeInTheDocument()
    await userEvent.upload(
      screen.getByLabelText('上传 Logo'),
      new File(['logo'], 'brand-logo.png', { type: 'image/png' })
    )
    expect(await screen.findByAltText('当前系统 Logo')).toHaveAttribute('src', 'blob:logo-preview')
    await userEvent.click(screen.getAllByRole('button', { name: '保存配置' })[0])

    await waitFor(() => {
      expect(updateConfigItems).toHaveBeenCalledWith([
        { key: 'system_logo_key', value: 'assets/branding/logo-next.png' },
      ])
    })
  })

  it('配置页支持火山素材 ProjectName 来源切换，并在底部显示版本号与环境', async () => {
    const { getConfigItems, updateConfigItems } = await import('../../api/config')
    const { getSetupStatus } = await import('../../api/setup')

    vi.mocked(getSetupStatus).mockResolvedValue({
      initialized: true,
      environment: 'dev',
      version: '1.0.1',
      installMode: 'self_hosted',
      initializedAt: '2026-04-07T10:00:00.000Z',
      health: {
        database: true,
        redis: true,
      },
    })
    vi.mocked(getConfigItems).mockResolvedValue({
      items: [
        { key: 'ark_access_key', value: 'ak-****0001', isSecret: true, description: 'Access Key' },
        { key: 'ark_secret_key', value: 'sk-****0001', isSecret: true, description: 'Secret Key' },
        { key: 'ark_default_group_id', value: validArkGroupId, isSecret: false, description: '默认素材组 ID' },
        { key: 'ark_default_sync_enabled', value: 'true', isSecret: false, description: '默认同步策略' },
        { key: 'ark_project_name_mode', value: 'project_code', isSecret: false, description: '火山素材 ProjectName 来源' },
        { key: 'ark_project_name_default_value', value: 'xcyj', isSecret: false, description: '火山素材 ProjectName 默认值' },
        { key: 'oss_bucket', value: 'narrix-assets', isSecret: false, description: 'OSS Bucket' },
      ],
    })
    vi.mocked(updateConfigItems).mockResolvedValue(undefined)

    renderConfigPage()

    expect(await screen.findByTestId('config-provider-grid')).toBeInTheDocument()
    expect(await screen.findByText('1.0.1 / dev')).toBeInTheDocument()
    expect(screen.queryByText('发布上线时请同步更新版本号，避免线上显示停留在旧版本。')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('ProjectName 默认值')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('固定默认值'))

    const defaultValueInput = await screen.findByLabelText('ProjectName 默认值')
    expect(defaultValueInput).toHaveValue('xcyj')
    expect(screen.queryByText('调皮狗客户当前默认值为 xcyj。保存后，素材创建、查询与删除都会复用这个 ProjectName。')).not.toBeInTheDocument()

    await userEvent.clear(defaultValueInput)
    await userEvent.type(defaultValueInput, 'xcyj-next')
    await userEvent.click(screen.getAllByRole('button', { name: '保存配置' })[0])

    await waitFor(() => {
      expect(updateConfigItems).toHaveBeenCalledWith([
        { key: 'ark_project_name_mode', value: 'default_value' },
        { key: 'ark_project_name_default_value', value: 'xcyj-next' },
      ])
    })
  })
})
