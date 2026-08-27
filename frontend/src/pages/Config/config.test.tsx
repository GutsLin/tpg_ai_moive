import { ConfigProvider } from 'antd'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRouter } from '../../router'
import { AuthProvider } from '../../stores/auth'
import { buildChangedConfigItems } from '.'

vi.mock('../../api/config', () => ({
  getConfigItems: vi.fn(),
  updateConfigItems: vi.fn(),
  getApiKeyMode: vi.fn(),
  setApiKeyMode: vi.fn(),
  getPublicBranding: vi.fn(),
}))

vi.mock('../../api/video-providers', () => ({
  getVideoProviders: vi.fn(),
  createVideoProvider: vi.fn(),
  updateVideoProvider: vi.fn(),
  activateVideoProvider: vi.fn(),
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
    const { getVideoProviders } = await import('../../api/video-providers')
    const { getApiKeyMode } = await import('../../api/config')

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
        { key: 'oss_access_key_id', value: 'ak-****8abc', isSecret: true, description: 'OSS Access Key ID' },
        { key: 'oss_bucket', value: 'narrix-assets', isSecret: false, description: 'OSS Bucket' },
      ],
    })
    vi.mocked(getVideoProviders).mockResolvedValue({ items: [] })
    vi.mocked(getApiKeyMode).mockResolvedValue({ mode: 'global' })

    renderConfigPage()

    expect(await screen.findByDisplayValue('ak-****8abc')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('narrix-assets')).toBeInTheDocument()
  })

  it('未修改的密文字段保存时不提交，修改过的字段会提交', async () => {
    const { getConfigItems, updateConfigItems } = await import('../../api/config')
    const { getSetupStatus } = await import('../../api/setup')
    const { getVideoProviders } = await import('../../api/video-providers')
    const { getApiKeyMode } = await import('../../api/config')

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
        { key: 'oss_access_key_id', value: 'ak-****8abc', isSecret: true, description: 'OSS Access Key ID' },
        { key: 'oss_bucket', value: 'narrix-assets', isSecret: false, description: 'OSS Bucket' },
      ],
    })
    vi.mocked(updateConfigItems).mockResolvedValue(undefined)
    vi.mocked(getVideoProviders).mockResolvedValue({ items: [] })
    vi.mocked(getApiKeyMode).mockResolvedValue({ mode: 'global' })

    renderConfigPage()

    const bucketInput = await screen.findByDisplayValue('narrix-assets')
    await userEvent.clear(bucketInput)
    await userEvent.type(bucketInput, 'narrix-next')
    await userEvent.click(screen.getAllByRole('button', { name: '保存配置' })[0])

    await waitFor(() => {
      expect(updateConfigItems).toHaveBeenCalledWith([
        { key: 'oss_bucket', value: 'narrix-next' },
      ])
    })
  })

  it('构造更新 payload 时会忽略 undefined 字段，只保留真实修改项', () => {
    expect(
      buildChangedConfigItems(
        [
          { key: 'oss_access_key_id', value: 'ak-****8abc', isSecret: true, description: 'OSS Access Key ID' },
          { key: 'oss_bucket', value: 'narrix-assets', isSecret: false, description: 'OSS Bucket' },
          { key: 'oss_region', value: 'oss-cn-chengdu', isSecret: false, description: 'OSS Region' },
          { key: 'oss_signed_url_ttl', value: '3600', isSecret: false, description: 'OSS TTL' },
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
    const { getVideoProviders } = await import('../../api/video-providers')
    const { getApiKeyMode } = await import('../../api/config')

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
    vi.mocked(getVideoProviders).mockResolvedValue({ items: [] })
    vi.mocked(getApiKeyMode).mockResolvedValue({ mode: 'global' })

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

  it('配置页品牌配置展示 Logo 上传入口，并允许把上传后的 OSS Key 一起保存', async () => {
    const { getConfigItems } = await import('../../api/config')
    const { updateConfigItems } = await import('../../api/config')
    const { getSetupStatus } = await import('../../api/setup')
    const { uploadFileToOss } = await import('../../utils/oss-upload')
    const { getVideoProviders } = await import('../../api/video-providers')
    const { getApiKeyMode } = await import('../../api/config')
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
    vi.mocked(getVideoProviders).mockResolvedValue({ items: [] })
    vi.mocked(getApiKeyMode).mockResolvedValue({ mode: 'global' })

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

  it('配置页底部显示版本号与环境', async () => {
    const { getConfigItems } = await import('../../api/config')
    const { getSetupStatus } = await import('../../api/setup')
    const { getVideoProviders } = await import('../../api/video-providers')
    const { getApiKeyMode } = await import('../../api/config')

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
        { key: 'oss_bucket', value: 'narrix-assets', isSecret: false, description: 'OSS Bucket' },
      ],
    })
    vi.mocked(getVideoProviders).mockResolvedValue({ items: [] })
    vi.mocked(getApiKeyMode).mockResolvedValue({ mode: 'global' })

    renderConfigPage()

    expect(await screen.findByText('1.0.1 / dev')).toBeInTheDocument()
  })
})
