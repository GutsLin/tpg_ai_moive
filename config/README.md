# 配置文件说明

本目录只存放脱敏配置示例，不存放生产密码、API Key、OSS 密钥或数据库真实连接信息。

- `examples/backend.env.example`：后端本地开发配置示例。
- `../deploy/env/dev/stack.env.example`：Docker 开发环境配置模板。
- `../deploy/env/prod/stack.env.example`：Docker 生产环境配置模板。

实际配置文件应保留在本地或服务器受限目录，并通过 `.gitignore` 排除。
