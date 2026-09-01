# Infinite Atelier M5 AI 平台接入状态

## 已完成的安全边界

- 新增主项目服务端 `AtelierAiService` 能力门面，不复制源项目渠道、用户 Key 或存储凭证。
- `GET /api/infinite-atelier/ai/capabilities` 复用主项目 JWT、项目成员上下文和 `VideoProviderService`。
- 返回值只包含媒体类型、启用状态、provider 标识、模型和能力，不包含 endpoint、API Key、密钥掩码或凭证字段。
- `infinite_atelier_video_enabled` 使用主项目 `system_config`，默认 `false`，并提供可回滚迁移；预先存在的同名配置不会被覆盖或回滚删除。
- 图像和音频能力默认关闭；视频开关开启但主项目没有有效视频 provider 时仍返回关闭。

## 尚未满足的能力

- 主项目没有图像生成 provider/adapter，不能安全实现 `image.generate` 或 `image.edit`。
- 主项目没有音频生成 provider/adapter，不能安全实现 `audio.generate`。
- 当前只提供视频能力声明；尚未把 Atelier 生成任务映射到主项目视频任务创建接口。

继续实现上述能力需要扩展主项目现有 AI 平台接口，并继续使用现有 `video_providers`、`user_api_keys`、加密配置和服务端 Key 解析。不得从源项目复制 OpenAI、Gemini、ToAPIs 或其他渠道密钥配置。
