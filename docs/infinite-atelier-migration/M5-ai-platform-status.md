# Infinite Atelier M5 AI 平台接入状态

## 当前范围

- 本阶段按业务确认，仅启用图像生成；视频和音频继续保持关闭。
- 图像生成使用主项目 `user_api_keys` 中当前登录用户的个人 Key。未配置个人 Key 时拒绝请求，不回退到平台全局 Key。
- endpoint 复用主项目当前启用 provider 的服务端配置；画布前端只提交模型、提示词和参数。
- 适配器为服务端 OpenAI-compatible 图像 adapter，创建/轮询分别调用 `/v1/images/generations` 及对应任务接口。

## 已完成的安全边界

- 新增主项目服务端 `AtelierAiService` 能力门面，不复制源项目渠道、用户 Key 或存储凭证。
- `GET /api/infinite-atelier/ai/capabilities` 复用主项目 JWT、项目成员上下文和 `VideoProviderService`。
- 返回值只包含媒体类型、启用状态、provider 标识、模型和能力，不包含 endpoint、API Key、密钥掩码或凭证字段。
- `infinite_atelier_video_enabled` 使用主项目 `system_config`，默认 `false`，并提供可回滚迁移；预先存在的同名配置不会被覆盖或回滚删除。
- 图像能力按当前用户是否存在个人 Key 动态启用；视频开关仍默认关闭，音频保持关闭。

## 尚未满足的能力

- 图像已通过最小服务端 adapter 接入；当前只实现 `image.generate`，参考图编辑和音频仍未启用。
- 主项目没有音频生成 provider/adapter，不能安全实现 `audio.generate`。
- 当前只提供视频能力声明；尚未把 Atelier 生成任务映射到主项目视频任务创建接口。

继续扩展参考图编辑、视频或音频能力时，必须继续使用现有 `video_providers`、`user_api_keys`、加密配置和服务端 Key 解析。不得从源项目复制 OpenAI、Gemini、ToAPIs 或其他渠道密钥配置。
