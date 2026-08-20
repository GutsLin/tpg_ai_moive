import { Button, Card, Form, Input, Typography, message } from 'antd'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { login as loginApi } from '../../api/auth'
import { getDefaultRouteForUser } from '../../router/permissions'
import { useAuth } from '../../stores/auth'
import { useBrand } from '../../stores/brand'
import { resolveSystemName } from '../../utils/branding'

export const LoginPage = ({ brandingName }: { brandingName?: string }) => {
  const [form] = Form.useForm<{ username: string; password: string }>()
  const navigate = useNavigate()
  const { login } = useAuth()
  const { state: brand } = useBrand()
  const [messageApi, contextHolder] = message.useMessage()
  const systemName = resolveSystemName(brandingName ?? brand.systemName)

  useEffect(() => {
    document.title = `${systemName} 登录`
  }, [systemName])

  const handleSubmit = async (values: { username: string; password: string }) => {
    try {
      const result = await loginApi(values)
      login(result)
      navigate(getDefaultRouteForUser(result.user), { replace: true })
    } catch {
      void messageApi.error('用户名或密码错误')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at top left, rgba(14,116,144,0.16), transparent 32%), linear-gradient(135deg, #f8fafc 0%, #eef2f7 55%, #e2e8f0 100%)',
        padding: 24,
      }}
    >
      {contextHolder}
      <Card style={{ width: 420, borderRadius: 24, boxShadow: '0 28px 80px rgba(15, 23, 42, 0.12)' }}>
        {brand.logoUrl ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <img
              src={brand.logoUrl}
              alt={`${systemName} Logo`}
              style={{ maxHeight: 56, maxWidth: 220, objectFit: 'contain' }}
            />
          </div>
        ) : null}
        <Typography.Title level={3} style={{ marginBottom: 8 }}>
          {systemName}
        </Typography.Title>
        <Typography.Paragraph style={{ color: '#9a3412', letterSpacing: '0.12em', marginBottom: 8 }}>
          登录管理后台
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          使用管理员或已分配菜单权限的账号进入系统。
        </Typography.Paragraph>

        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input id="username" placeholder="请输入用户名" size="large" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password id="password" placeholder="请输入密码" size="large" />
          </Form.Item>

          <Button type="primary" htmlType="submit" size="large" block>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
