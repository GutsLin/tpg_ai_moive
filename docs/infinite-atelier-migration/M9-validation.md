# Infinite Atelier 迁移整合 M9 验证记录

## 已通过

- 后端 lint：`pnpm run lint`
- 前端 lint：`pnpm run lint`
- 后端 TypeScript：`pnpm exec tsc --noEmit -p tsconfig.json`
- 前端 TypeScript/生产构建：`pnpm run build`
- 后端全量单元/集成测试：35 个测试文件、224/224 通过
- Atelier 权限、资产生命周期、迁移、AI 能力和主项目资产链路专项：7 个测试文件、45/45 通过
- 前端 Infinite Atelier 模型、主路由和主布局入口专项：3 个测试文件、29/29 通过
- Docker Compose 静态交付契约：`pnpm exec vitest run ../tests/backend/docker-compose.test.ts`，5/5 通过
- 图像 adapter 与用户级 Key 任务服务专项：4 个测试文件、11/11 通过
- Atelier 迁移 up/down、已有 `prompt_content` 保留：3 项测试文件全部通过
- Atelier 画布 owner-only、项目管理员无旁路、viewer 禁止写入：权限测试通过
- 画布资产引用同步、解除引用后重新入队删除、worker 待清理再清理：目标后端测试 39/39 通过
- M7 提示词权限测试：7 项通过；覆盖同项目成员读取、创建者编辑/删除、manager 管理全部提示词。
- M4/M6 共享资产链路已接入：项目资产侧栏读取、远程状态展示、插入画布、`assetId` 引用持久化、本地 IndexedDB 节点清理。
- 源项目工作树保持干净

## 环境限制或既存失败

- 前端全量测试为 133/136；仍有 3 个既存失败（视频草稿清空、素材状态文案、用户分页参数），失败文件不涉及 Infinite Atelier。
- 本机没有 Docker 命令；Compose 文件和交付资产的静态契约已验证，容器构建、启动和健康检查未运行。
- M5 图像已启用：仅使用当前用户在主项目 `user_api_keys` 中配置的个人 Key；服务端 adapter 调用 OpenAI-compatible 图像接口，浏览器不读取或打印 Key。
- M5 视频和音频仍关闭；视频继续读取主项目脱敏能力门面，音频尚无安全 adapter。

## 必测权限与生命周期场景

1. 用户 A 不能读取、修改或删除用户 B 画布：通过。
2. 项目管理员不能接管成员画布：通过。
3. 同项目成员可读取提示词和项目资产：接口按 `projectContextMiddleware` 限定。
4. 无引用 Atelier 资产进入删除队列；仍被活动画布引用时保持 `deleting`：通过 worker 契约测试。
5. 解除引用后再次处理删除任务会清理 OSS 和数据库记录：通过 worker 契约测试。
6. 资产名称与提示词使用独立字段：通过契约测试和前端上传表单检查。
7. JWT/API Key 不在画布前端配置中：通过代码审查；图像 Key 仅由服务端按当前用户解析。
8. 从主项目菜单进入 `/infinite-atelier` 不需要第二次登录：路由使用主项目 `ProtectedRoute`/`AuthProvider`。
