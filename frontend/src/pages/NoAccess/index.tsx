import { Button, Result } from 'antd'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../stores/auth'

export const NoAccessPage = () => {
  const navigate = useNavigate()
  const { logout } = useAuth()

  return (
    <Result
      status="403"
      title="当前账号尚未分配任何可见菜单"
      subTitle="请联系管理员为你分配至少一个菜单权限后再登录。"
      extra={
        <Button
          type="primary"
          onClick={() => {
            logout()
            navigate('/login', { replace: true })
          }}
        >
          退出当前账号
        </Button>
      }
    />
  )
}
