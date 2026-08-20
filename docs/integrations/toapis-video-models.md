> ## Documentation Index
> Fetch the complete documentation index at: https://docs.toapis.com/llms.txt
> Use this file to discover all available pages before exploring further.

# 快速开始

> 使用 ToAPIs 调用文本、图像和视频模型

# 快速开始

ToAPIs 提供 OpenAI 兼容的文本接口，以及统一的异步图像、视频生成接口。本指南使用当前可用的模型完成第一次调用。

## 第一步：获取 API 密钥

1. 访问 [API 密钥管理页面](https://toapis.com/console/token)
2. 登录账户并创建 API 密钥
3. 立即安全保存密钥；密钥只显示一次

## 第二步：选择模型

| 类型 | 推荐入门模型          | 说明                              |
| -- | --------------- | ------------------------------- |
| 文本 | `gpt-5.6-terra` | 性能与成本均衡，适合通用对话和 Agent 工作流       |
| 图像 | `gpt-image-2`   | 支持文生图和 `reference_images` 参考图生成 |
| 视频 | `sora-2-vvip`   | 支持文生视频、图生视频和角色引用                |

完整可用型号以 [模型列表接口](./api-reference/chat/list-models) 和各模型文档为准。

## 第三步：发送请求

### 文本生成

```bash theme={null}
curl --request POST \
  --url https://toapis.com/v1/chat/completions \
  --header "Authorization: Bearer YOUR_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "model": "gpt-5.6-terra",
    "messages": [
      {"role": "user", "content": "你好，请介绍一下你自己"}
    ]
  }'
```

### 图像生成

```bash theme={null}
curl --request POST \
  --url https://toapis.com/v1/images/generations \
  --header "Authorization: Bearer YOUR_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "model": "gpt-image-2",
    "prompt": "一只可爱的熊猫，电影感光线",
    "size": "1:1",
    "resolution": "1k",
    "n": 1
  }'
```

### 视频生成

```bash theme={null}
curl --request POST \
  --url https://toapis.com/v1/videos/generations \
  --header "Authorization: Bearer YOUR_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
     "model": "seedance-2",
    "prompt": "海浪拍打着海岸，电影感镜头",
    "duration": 12,
    "aspect_ratio": "16:9"
  }'
```

## 第四步：查询异步任务

文本请求会直接返回结果；图像和视频请求会返回任务 ID。请按任务类型使用对应查询接口：

```bash theme={null}
# 图像任务
curl https://toapis.com/v1/images/generations/YOUR_TASK_ID \
  -H "Authorization: Bearer YOUR_API_KEY"

# 视频任务
curl https://toapis.com/v1/videos/generations/YOUR_TASK_ID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 配置任务 Webhook

在 Token 编辑页配置默认 HTTPS callback URL 并生成签名密钥。提交异步任务时可携带同源 `callback_url`。接收端按 `X-ToAPIs-Webhook-*` 对原始请求体做 HMAC-SHA256 验签，并按 event ID 幂等处理；轮询仅作为兜底。遇到 `429` 时读取 `Retry-After`，不要固定高频重试。参阅 [任务 Webhook](/docs/cn/api-reference/webhooks/task-webhooks)。

## 下一步

<CardGroup cols={2}>
  <Card title="查看 API 文档" icon="book" href="./index">
    查看全部接口、模型和参数。
  </Card>

  <Card title="Claude Code 集成" icon="code" href="./integrations/claude-code">
    在 Claude Code 中使用 ToAPIs。
  </Card>

  <Card title="Codex 集成" icon="terminal" href="./integrations/codex">
    通过 CC Switch 在 Codex 中使用 ToAPIs。
  </Card>
</CardGroup>



