import { Alert, Button, Input, Modal, Space, Typography, message } from 'antd'
import { useEffect, useState } from 'react'

import { deleteUserApiKey, getUserApiKeys, upsertUserApiKeys, type UserApiKeyItem } from '../../api/user-api-keys'

export interface ApiKeyModalProps {
  open: boolean
  userId: number | null
  username: string
  onClose: () => void
}

export const ApiKeyModal = ({ open, userId, username, onClose }: ApiKeyModalProps) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keys, setKeys] = useState<UserApiKeyItem[]>([])
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [messageApi, contextHolder] = message.useMessage()

  const providerKey = 'toapis'
  const providerName = 'ToAPIs'

  useEffect(() => {
    if (!open || userId === null) {
      return
    }

    const load = async () => {
      setLoading(true)
      try {
        const result = await getUserApiKeys(userId)
        setKeys(result.items)
      } catch {
        void messageApi.error('加载 API Key 失败')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [open, userId, messageApi])

  const existingKey = keys.find((item) => item.providerKey === providerKey)

  const handleSave = async () => {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) {
      void messageApi.warning('请输入 API Key')
      return
    }

    if (userId === null) {
      return
    }

    setSaving(true)
    try {
      const result = await upsertUserApiKeys(userId, [{ providerKey, apiKey: trimmed }])
      setKeys(result.items)
      setApiKeyInput('')
      void messageApi.success('API Key 已保存')
    } catch (error: any) {
      void messageApi.error(error?.response?.data?.message ?? '保存 API Key 失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {contextHolder}
      <Modal
        open={open}
        title={`API Key 配置 · ${username}`}
        okText="保存"
        cancelText="关闭"
        confirmLoading={saving}
        onCancel={onClose}
        onOk={() => void handleSave()}
        okButtonProps={{ disabled: !apiKeyInput.trim() }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Key 加密存储，管理员设置后用户无法查看明文"
            description="当系统切换为「成员独立 Key」模式后，该用户视频生成将使用此 Key。在 ToAPIs 后台可按此 Key 查看 Token 用量。"
          />

          <div>
            <Typography.Text strong>{providerName} API Key</Typography.Text>
            {existingKey ? (
              <Space align="center" style={{ width: '100%', justifyContent: 'space-between', marginTop: 8 }}>
                <Typography.Text type="secondary">
                  {existingKey.apiKeyMasked}（已配置）
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  更新于 {new Date(existingKey.updatedAt).toLocaleString('zh-CN')}
                </Typography.Text>
              </Space>
            ) : (
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                尚未配置
              </Typography.Text>
            )}
          </div>

          <Input.Password
            aria-label="API Key 输入"
            placeholder={existingKey ? '输入新 Key 以替换' : '请输入 ToAPIs API Key'}
            value={apiKeyInput}
            onChange={(event) => setApiKeyInput(event.target.value)}
            disabled={loading}
          />

          {existingKey ? (
            <Button
              danger
              size="small"
              onClick={async () => {
                if (userId === null) return
                try {
                  await deleteUserApiKey(userId, providerKey)
                  setKeys((current) => current.filter((item) => item.providerKey !== providerKey))
                  void messageApi.success('API Key 已删除')
                } catch (error: any) {
                  void messageApi.error(error?.response?.data?.message ?? '删除 API Key 失败')
                }
              }}
            >
              删除当前 Key
            </Button>
          ) : null}
        </Space>
      </Modal>
    </>
  )
}
