import { Space, Typography } from 'antd'

export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) => (
  <Space className="page-header" align="start" wrap>
    <div className="page-header-copy">
      <Typography.Title level={5} className="page-header-title">
        {title}
      </Typography.Title>
      {description ? <Typography.Paragraph className="page-header-description">{description}</Typography.Paragraph> : null}
    </div>
    {actions ? <div className="page-header-actions">{actions}</div> : null}
  </Space>
)
