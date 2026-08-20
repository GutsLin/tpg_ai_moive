# 运维脚本

- `diagnostics/toapis/`：ToAPIs 连通性和协议诊断脚本及脱敏测试 payload。
- `diagnostics/legacy/`：历史诊断脚本归档，仅用于排查旧版本问题，不纳入日常运行流程。
- `local/`：仅限本机使用的运维文件，不进入项目交付包。

诊断脚本不得写入真实 API Key、密码或其他生产凭据。
