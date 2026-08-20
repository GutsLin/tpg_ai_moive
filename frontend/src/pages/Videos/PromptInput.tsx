import { Input, Space, Tag, Typography } from 'antd'

export const PromptInput = ({
  value,
  onChange,
  availableMentions,
}: {
  value: string
  onChange: (value: string) => void
  availableMentions: string[]
}) => {
  return (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      <Input.TextArea
        aria-label="创意提示词"
        value={value}
        rows={5}
        maxLength={5000}
        showCount
        placeholder="输入创意描述，可使用 @素材名 引用已选素材"
        onChange={(event) => onChange(event.target.value)}
      />
      {availableMentions.length > 0 ? (
        <Space size={[8, 8]} wrap>
          {availableMentions.map((name) => (
            <Tag key={name} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
              @{name}
            </Tag>
          ))}
        </Space>
      ) : (
        <Typography.Text type="secondary">选中参考素材后，可在提示词中输入 @素材名 进行引用。</Typography.Text>
      )}
    </Space>
  )
}
