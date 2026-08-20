import { Empty, Space, Typography } from 'antd'

export const NoProjectPage = () => {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 180px)',
        borderRadius: 24,
        border: '1px dashed #cbd5e1',
        background: '#f8fafc',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Empty
        description={
          <Space orientation="vertical" size={6}>
            <Typography.Text strong>暂无可用项目</Typography.Text>
            <Typography.Text type="secondary">请联系管理员为当前账号分配项目后再继续操作。</Typography.Text>
          </Space>
        }
      />
    </div>
  )
}
