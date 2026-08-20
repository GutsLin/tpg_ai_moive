import { ConfigProvider } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UploadModal } from './UploadModal'

vi.mock('../../api/assets', () => ({
  checkAssetNameAvailable: vi.fn(),
  createAsset: vi.fn(),
}))

vi.mock('../../utils/oss-upload', () => ({
  uploadFileToOss: vi.fn(),
}))

const renderUploadModal = () =>
  render(
    <ConfigProvider>
      <UploadModal
        open
        categories={[
          { id: 1, name: '角色', sortOrder: 1, syncEnabled: true, assetCount: 3 },
          { id: 2, name: '真人', sortOrder: 2, syncEnabled: false, assetCount: 1 },
        ]}
        onCancel={() => undefined}
        onUploaded={() => undefined}
      />
    </ConfigProvider>
  )

describe('UploadModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('选择素材组后会把 categoryId 正确提交给创建接口', async () => {
    const { checkAssetNameAvailable, createAsset } = await import('../../api/assets')
    const { uploadFileToOss } = await import('../../utils/oss-upload')

    vi.mocked(checkAssetNameAvailable).mockResolvedValue({ available: true })
    vi.mocked(uploadFileToOss).mockResolvedValue({ ossKey: 'assets/real.mp4' })
    vi.mocked(createAsset).mockResolvedValue({
      id: 21,
      name: '真人视频',
      assetType: 'Video',
      categoryId: 2,
      syncMode: 'disabled',
      effectiveSync: false,
      ossKey: 'assets/real.mp4',
      arkGroupId: null,
      arkAssetId: null,
      arkStatus: 'active',
      arkError: null,
      tags: ['真人'],
      createdAt: '2026-04-07T00:00:00.000Z',
      updatedAt: '2026-04-07T00:00:00.000Z',
    })

    renderUploadModal()

    await userEvent.type(screen.getByLabelText('素材名称'), '真人视频')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '素材组' }))
    await userEvent.click(await screen.findByText('真人 · 仅本地', { selector: '.ant-select-item-option-content' }))

    const fileInput = screen.getByLabelText('选择素材') as HTMLInputElement
    const file = new File(['video'], 'real.mp4', { type: 'video/mp4' })
    await userEvent.upload(fileInput, file)

    await userEvent.click(screen.getByRole('button', { name: '开始上传' }))

    await waitFor(() => {
      expect(createAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '真人视频',
          categoryId: 2,
          syncMode: 'disabled',
          assetType: 'Video',
        })
      )
    })
  })

  it('先触发表单校验后，再选择素材组会清除必填错误', async () => {
    renderUploadModal()

    await userEvent.click(screen.getByRole('button', { name: '开始上传' }))
    expect(await screen.findByText('请选择素材组')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '素材组' }))
    await userEvent.click(await screen.findByText('真人 · 仅本地', { selector: '.ant-select-item-option-content' }))

    await waitFor(() => {
      expect(screen.queryByText('请选择素材组')).not.toBeInTheDocument()
    })
  })
})
