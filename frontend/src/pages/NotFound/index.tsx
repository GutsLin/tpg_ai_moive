import { Button, Result } from 'antd'
import { Link } from 'react-router-dom'

export const NotFoundPage = () => {
  return (
    <Result
      status="404"
      title="页面不存在或无权访问"
      subTitle="请检查当前账号的菜单权限，或返回素材管理页继续操作。"
      extra={
        <Button type="primary">
          <Link to="/assets">返回素材管理</Link>
        </Button>
      }
    />
  )
}
