import { InboxOutlined } from '@ant-design/icons'
import { Button, Form, Input, Modal, Progress, Select, Space, Typography, message } from 'antd'
import { useEffect, useState } from 'react'

import type { AssetCategoryItem } from '../../api/asset-categories'
import { checkAssetNameAvailable, createAsset, type AssetItem, type AssetSyncMode, type AssetType } from '../../api/assets'
import { uploadFileToOss } from '../../utils/oss-upload'

const MIN_IMAGE_EDGE = 300
const MAX_IMAGE_EDGE = 6000
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm', '.m4v', '.mp3', '.wav', '.m4a', '.aac', '.ogg']
const ACCEPTED_EXTENSIONS_SET = new Set(ACCEPTED_EXTENSIONS)
const ACCEPTED_FILE_TYPES = ACCEPTED_EXTENSIONS.join(',')

const resolveFileExtension = (fileName: string) => {
  const matched = /\.[^.]+$/.exec(fileName.toLowerCase())
  return matched?.[0] ?? ''
}

const inferAssetType = (file: File): AssetType => {
  const extension = resolveFileExtension(file.name)

  if (file.type.startsWith('video/')) {
    return 'Video'
  }
  if (file.type.startsWith('audio/')) {
    return 'Audio'
  }
  if (['.mp4', '.mov', '.webm', '.m4v'].includes(extension)) {
    return 'Video'
  }
  if (['.mp3', '.wav', '.m4a', '.aac', '.ogg'].includes(extension)) {
    return 'Audio'
  }
  return 'Image'
}

const readImageDimensions = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('无法读取图片尺寸，请更换文件后重试'))
    }

    image.src = objectUrl
  })

const validateUploadFile = async (file: File) => {
  const extension = resolveFileExtension(file.name)
  if (!ACCEPTED_EXTENSIONS_SET.has(extension)) {
    throw new Error('仅支持 jpg、jpeg、png、webp、mp4、mov、webm、m4v、mp3、wav、m4a、aac、ogg 格式')
  }

  if (!file.type.startsWith('image/')) {
    return
  }

  const { width, height } = await readImageDimensions(file)

  if (
    width < MIN_IMAGE_EDGE ||
    width > MAX_IMAGE_EDGE ||
    height < MIN_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE
  ) {
    throw new Error(`图片宽高需在 ${MIN_IMAGE_EDGE}px 到 ${MAX_IMAGE_EDGE}px 之间`)
  }
}

const UploadModalContent = ({
  open,
  categories,
  onCancel,
  onUploaded,
}: {
  open: boolean
  categories: AssetCategoryItem[]
  onCancel: () => void
  onUploaded: (asset: AssetItem) => Promise<void> | void
}) => {
  const [form] = Form.useForm<{
    name: string
    categoryId?: number
    syncMode: AssetSyncMode
    tags?: string[]
  }>()
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [checkingName, setCheckingName] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    if (!open) {
      return
    }
    form.setFieldsValue({
      categoryId: undefined,
      syncMode: undefined,
    })
  }, [form, open])

  const reset = () => {
    form.resetFields()
    setFile(null)
    setProgress(0)
  }

  const forceClose = () => {
    reset()
    onCancel()
  }

  const handleClose = () => {
    if (!uploading && !checkingName) {
      forceClose()
    }
  }

  const handleSubmit = async (values: { name: string; categoryId?: number; syncMode: AssetSyncMode; tags?: string[] }) => {
    if (!file) {
      void messageApi.error('请先选择素材文件')
      return
    }

    try {
      setCheckingName(true)
      const normalizedName = values.name.trim()
      const nameCheck = await checkAssetNameAvailable(normalizedName)

      if (!nameCheck.available) {
        void messageApi.error('素材名称已存在')
        return
      }

      setCheckingName(false)
      setUploading(true)
      setProgress(8)
      await validateUploadFile(file)
      const { ossKey } = await uploadFileToOss(file, setProgress)
      const asset = await createAsset({
        name: normalizedName,
        categoryId: values.categoryId ?? null,
        assetType: inferAssetType(file),
        syncMode: values.syncMode,
        ossKey,
        tags: (values.tags ?? []).map((item) => item.trim()).filter(Boolean),
      })

      await onUploaded({
        ...asset,
        thumbnailUrl: '',
      })
      void messageApi.success(asset.effectiveSync === false ? '素材已入库，仅保留本地素材' : '素材已入库，正在同步火山审核')
      forceClose()
    } catch (error: any) {
      void messageApi.error(
        error?.response?.data?.message ?? (error instanceof Error ? error.message : '上传失败，请稍后重试')
      )
    } finally {
      setCheckingName(false)
      setUploading(false)
    }
  }

  const busy = uploading || checkingName

  return (
    <Modal
      open={open}
      title="上传素材"
      onCancel={handleClose}
      footer={null}
      destroyOnHidden
      width={560}
    >
      {contextHolder}
      <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ syncMode: 'inherit' }}>
        <Space orientation="vertical" size={18} style={{ width: '100%' }}>
          <Form.Item
            label="素材名称"
            name="name"
            rules={[{ required: true, message: '请输入素材名称' }]}
          >
            <Input aria-label="素材名称" placeholder="例如：角色A正面立绘" size="large" />
          </Form.Item>

          <Form.Item
            label="素材组"
            name="categoryId"
            rules={[{ required: true, message: '请选择素材组' }]}
          >
            <Select
              aria-label="素材组"
              placeholder="选择素材组"
              size="large"
              options={categories.map((item) => ({
                label: item.syncEnabled === false ? `${item.name} · 仅本地` : `${item.name} · 可同步火山`,
                value: item.id,
              }))}
              onChange={(value) => {
                const category = categories.find((item) => item.id === value)
                form.setFieldValue('syncMode', category?.syncEnabled === false ? 'disabled' : 'inherit')
              }}
            />
          </Form.Item>

          <Form.Item
            shouldUpdate={(prevValues, nextValues) =>
              prevValues.categoryId !== nextValues.categoryId || prevValues.syncMode !== nextValues.syncMode
            }
            noStyle
          >
            {() => {
              const categoryId = form.getFieldValue('categoryId')
              const category = categories.find((item) => item.id === categoryId)
              const categoryForcedLocal = category?.syncEnabled === false

              return (
                <Form.Item label="素材同步策略">
                  <Form.Item
                    name="syncMode"
                    rules={[{ required: true, message: '请选择素材同步策略' }]}
                    style={{ marginBottom: 8 }}
                  >
                    <Select
                      aria-label="素材同步策略"
                      size="large"
                      options={[
                        { label: '跟随素材组默认策略', value: 'inherit', disabled: categoryForcedLocal },
                        { label: '立即同步到火山', value: 'enabled', disabled: categoryForcedLocal },
                        { label: '仅保留本地 OSS 素材', value: 'disabled' },
                      ]}
                    />
                  </Form.Item>
                  <Typography.Text type="secondary">
                    {categoryForcedLocal
                      ? '当前素材组未开启火山同步，组内素材只能保留为本地素材。'
                      : '选择“立即同步到火山”后，素材上传入库后会直接进入火山素材审核流程。'}
                  </Typography.Text>
                </Form.Item>
              )
            }}
          </Form.Item>

          <Form.Item label="标签" name="tags">
            <Select
              mode="tags"
              tokenSeparators={[',', '，']}
              placeholder="输入标签后回车"
              size="large"
              open={false}
            />
          </Form.Item>

          <Form.Item label="选择素材" required>
            <label
              htmlFor="asset-upload-file"
              style={{
                display: 'block',
                border: '1px dashed #94a3b8',
                borderRadius: 20,
                padding: '22px 18px',
                background: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              <Space orientation="vertical" size={8} style={{ width: '100%', textAlign: 'center' }}>
                <InboxOutlined style={{ fontSize: 28, color: '#0f766e' }} />
                <Typography.Text strong>{file ? file.name : '点击选择文件'}</Typography.Text>
                <Typography.Text type="secondary">支持图片 / 视频 / 音频，上传后将走 OSS 私有桶直传</Typography.Text>
              </Space>
            </label>
            <input
              id="asset-upload-file"
              aria-label="选择素材"
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              style={{ display: 'none' }}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null
                setFile(nextFile)
                if (nextFile && !form.getFieldValue('name')) {
                  form.setFieldValue('name', nextFile.name.replace(/\.[^.]+$/, ''))
                }
              }}
            />
          </Form.Item>

          {progress > 0 ? (
            <Progress percent={progress} strokeColor="#0f766e" showInfo={false} />
          ) : null}

          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleClose} disabled={busy}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={busy}>
              开始上传
            </Button>
          </Space>
        </Space>
      </Form>
    </Modal>
  )
}

export const UploadModal = ({
  open,
  categories,
  onCancel,
  onUploaded,
}: {
  open: boolean
  categories: AssetCategoryItem[]
  onCancel: () => void
  onUploaded: (asset: AssetItem) => Promise<void> | void
}) => {
  if (!open) {
    return null
  }

  return <UploadModalContent open={open} categories={categories} onCancel={onCancel} onUploaded={onUploaded} />
}
