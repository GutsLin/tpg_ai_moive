import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Empty, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography, message } from 'antd'
import { useEffect, useState } from 'react'

import {
  createAssetCategory,
  deleteAssetCategory,
  updateAssetCategory,
  type AssetCategoryItem,
} from '../../api/asset-categories'

export const CategoryManagerModal = ({
  open,
  categories,
  onClose,
  onChanged,
}: {
  open: boolean
  categories: AssetCategoryItem[]
  onClose: () => void
  onChanged: () => Promise<void> | void
}) => {
  const [messageApi, contextHolder] = message.useMessage()
  const [newForm] = Form.useForm<{ name: string; sortOrder: number; syncEnabled: boolean }>()
  const [rows, setRows] = useState(categories)
  const [submitting, setSubmitting] = useState(false)
  const [deletingCategory, setDeletingCategory] = useState<AssetCategoryItem | null>(null)
  const [deleteTargetCategoryId, setDeleteTargetCategoryId] = useState<number | 'uncategorized' | undefined>(undefined)

  useEffect(() => {
    setRows(categories)
  }, [categories])

  const refresh = async () => {
    await onChanged()
  }

  const handleCreate = async (values: { name: string; sortOrder: number; syncEnabled: boolean }) => {
    setSubmitting(true)
    try {
      await createAssetCategory(values)
      void messageApi.success('素材组已创建')
      newForm.resetFields()
      newForm.setFieldValue('syncEnabled', true)
      await refresh()
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '创建素材组失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (category: AssetCategoryItem) => {
    setSubmitting(true)
    try {
      await updateAssetCategory(category.id, {
        name: category.name,
        sortOrder: category.sortOrder,
        syncEnabled: category.syncEnabled,
      })
      void messageApi.success('素材组已更新')
      await refresh()
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '更新素材组失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (category: AssetCategoryItem) => {
    setDeletingCategory(category)
    setDeleteTargetCategoryId(undefined)
  }

  const handleConfirmDelete = async () => {
    if (!deletingCategory) {
      return
    }

    if (deletingCategory.assetCount > 0 && deleteTargetCategoryId === undefined) {
      void messageApi.warning('请先选择迁移目标')
      return
    }

    setSubmitting(true)
    try {
      const targetCategoryId = deleteTargetCategoryId === 'uncategorized' ? null : deleteTargetCategoryId
      await deleteAssetCategory(
        deletingCategory.id,
        deletingCategory.assetCount > 0 ? { targetCategoryId } : undefined
      )
      void messageApi.success('素材组已删除')
      setDeletingCategory(null)
      setDeleteTargetCategoryId(undefined)
      await refresh()
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '删除素材组失败')
    } finally {
      setSubmitting(false)
    }
  }

  const deleteTargetOptions = deletingCategory
    ? [
        ...rows
          .filter((item) => item.id !== deletingCategory.id)
          .map((item) => ({
            label: `${item.name}${item.assetCount > 0 ? ` (${item.assetCount})` : ''}`,
            value: item.id,
          })),
        { label: '转为未分类', value: 'uncategorized' as const },
      ]
    : []

  if (!open) {
    return (
      <>
        {contextHolder}
        <Modal
          open={Boolean(deletingCategory)}
          title="删除素材组"
          okText="确认删除"
          cancelText="取消"
          confirmLoading={submitting}
          onOk={() => void handleConfirmDelete()}
          onCancel={() => {
            setDeletingCategory(null)
            setDeleteTargetCategoryId(undefined)
          }}
          destroyOnHidden
        >
          <Space orientation="vertical" size={14} style={{ width: '100%' }}>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              {deletingCategory?.assetCount
                ? `素材组「${deletingCategory.name}」下还有 ${deletingCategory.assetCount} 个素材，删除前需要先迁移。`
                : `确认删除素材组「${deletingCategory?.name}」？`}
            </Typography.Paragraph>

            {deletingCategory && deletingCategory.assetCount > 0 ? (
              <div>
                <Typography.Text>迁移组内素材</Typography.Text>
                <Select
                  aria-label="迁移目标素材组"
                  placeholder="请选择迁移目标"
                  style={{ width: '100%', marginTop: 8 }}
                  value={deleteTargetCategoryId}
                  options={deleteTargetOptions}
                  onChange={(value) => setDeleteTargetCategoryId(value)}
                />
              </div>
            ) : null}
          </Space>
        </Modal>
      </>
    )
  }

  return (
    <>
      {contextHolder}
      <Modal open={open} title="素材组管理" footer={null} width={760} onCancel={onClose} destroyOnHidden>
        <Space orientation="vertical" size={18} style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            素材组决定默认同步策略。组级关闭同步后，组内素材全部固定为仅本地素材；删除非空素材组时，必须先为组内素材选择迁移目标。
          </Typography.Paragraph>

          <Form
            form={newForm}
            layout="inline"
            onFinish={handleCreate}
            initialValues={{ sortOrder: rows.length + 1, syncEnabled: true }}
          >
            <Form.Item
              name="name"
              rules={[{ required: true, message: '请输入素材组名称' }]}
              style={{ flex: 1, minWidth: 220 }}
            >
              <Input placeholder="新增素材组名称" />
            </Form.Item>
            <Form.Item name="sortOrder" rules={[{ required: true, message: '请输入排序值' }]}>
              <InputNumber min={0} placeholder="排序" />
            </Form.Item>
            <Form.Item name="syncEnabled" valuePropName="checked">
              <Switch checkedChildren="同步火山" unCheckedChildren="仅本地" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={submitting}>
                新增素材组
              </Button>
            </Form.Item>
          </Form>

          {rows.length === 0 ? (
            <div
              style={{
                borderRadius: 20,
                border: '1px dashed #cbd5e1',
                background: '#f8fafc',
                padding: '32px 16px',
              }}
            >
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无素材组" />
            </div>
          ) : (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              {rows.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    borderRadius: 18,
                    border: '1px solid #e2e8f0',
                    background: '#fbfdff',
                    padding: 16,
                  }}
                >
                  <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                    <Space align="center" wrap>
                      <Input
                        value={item.name}
                        aria-label={`素材组名称-${item.id}`}
                        style={{ width: 220 }}
                        onChange={(event) => {
                          const next = [...rows]
                          next[index] = { ...item, name: event.target.value }
                          setRows(next)
                        }}
                      />
                      <InputNumber
                        min={0}
                        value={item.sortOrder}
                        aria-label={`素材组排序-${item.id}`}
                        onChange={(value) => {
                          const next = [...rows]
                          next[index] = { ...item, sortOrder: Number(value ?? 0) }
                          setRows(next)
                        }}
                      />
                      <Switch
                        checked={item.syncEnabled !== false}
                        checkedChildren="同步火山"
                        unCheckedChildren="仅本地"
                        onChange={(checked) => {
                          const next = [...rows]
                          next[index] = { ...item, syncEnabled: checked }
                          setRows(next)
                        }}
                      />
                      <Typography.Text type="secondary">素材数：{item.assetCount}</Typography.Text>
                    </Space>
                    <Space>
                      <Button icon={<SaveOutlined />} onClick={() => void handleUpdate(item)} loading={submitting}>
                        保存
                      </Button>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={`删除素材组-${item.id}`}
                        onClick={() => void handleDelete(item)}
                      >
                        删除
                      </Button>
                    </Space>
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </Space>
      </Modal>

      <Modal
        open={Boolean(deletingCategory)}
        title="删除素材组"
        okText="确认删除"
        cancelText="取消"
        confirmLoading={submitting}
        onOk={() => void handleConfirmDelete()}
        onCancel={() => {
          setDeletingCategory(null)
          setDeleteTargetCategoryId(undefined)
        }}
        destroyOnHidden
      >
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {deletingCategory?.assetCount
              ? `素材组「${deletingCategory.name}」下还有 ${deletingCategory.assetCount} 个素材，删除前需要先迁移。`
              : `确认删除素材组「${deletingCategory?.name}」？`}
          </Typography.Paragraph>

          {deletingCategory && deletingCategory.assetCount > 0 ? (
            <div>
              <Typography.Text>迁移组内素材</Typography.Text>
              <Select
                aria-label="迁移目标素材组"
                placeholder="请选择迁移目标"
                style={{ width: '100%', marginTop: 8 }}
                value={deleteTargetCategoryId}
                options={deleteTargetOptions}
                onChange={(value) => setDeleteTargetCategoryId(value)}
              />
            </div>
          ) : null}
        </Space>
      </Modal>
    </>
  )
}
