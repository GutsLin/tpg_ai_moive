# Infinite Atelier 迁移整合 M9 验证记录

## 已通过

- 后端 lint：`pnpm run lint`
- 前端 lint：`pnpm run lint`
- 后端 TypeScript：`pnpm exec tsc --noEmit -p tsconfig.json`
- 前端 TypeScript/生产构建：`pnpm run build`
- 后端全量单元/集成测试：33 个测试文件、218/218 通过
- Atelier 权限、资产生命周期、迁移、AI 能力和主项目资产链路专项：7 个测试文件、45/45 通过
- 前端 Infinite Atelier 模型、主路由和主布局入口专项：3 个测试文件、29/29 通过
- Docker Compose 静态交付契约：`pnpm exec vitest run ../tests/backend/docker-compose.test.ts`，5/5 通过
- Atelier 迁移 up/down、已有 `prompt_content` 保留：3 项测试文件全部通过
- Atelier 画布 owner-only、项目管理员无旁路、viewer 禁止写入：权限测试通过
- 画布资产引用同步、解除引用后重新入队删除、worker 待清理再清理：目标后端测试 39/39 通过
- M7 提示词权限测试：7 项通过；覆盖同项目成员读取、创建者编辑/删除、manager 管理全部提示词。
- M4/M6 共享资产链路已接入：项目资产侧栏读取、远程状态展示、插入画布、`assetId` 引用持久化、本地 IndexedDB 节点清理。
- 源项目工作树保持干净

## 环境限制或既存失败

- 前端全量测试为 133/136；仍有 3 个既存失败（视频草稿清空、素材状态文案、用户分页参数），失败文件不涉及 Infinite Atelier。
- 本机没有 Docker 命令；Compose 文件和交付资产的静态契约已验证，容器构建、启动和健康检查未运行。
- M5 尚未启用：主项目没有覆盖图像/视频/音频的统一安全 adapter；按边界要求未复制源项目 provider 或 API Key，也未让浏览器直连。
- M5 安全能力门面测试通过：默认关闭，视频只读取主项目脱敏能力，响应不含 endpoint/API Key/secret；图像和音频实际生成仍受主项目能力缺口阻塞。

## 必测权限与生命周期场景

1. 用户 A 不能读取、修改或删除用户 B 画布：通过。
2. 项目管理员不能接管成员画布：通过。
3. 同项目成员可读取提示词和项目资产：接口按 `projectContextMiddleware` 限定。
4. 无引用 Atelier 资产进入删除队列；仍被活动画布引用时保持 `deleting`：通过 worker 契约测试。
5. 解除引用后再次处理删除任务会清理 OSS 和数据库记录：通过 worker 契约测试。
6. 资产名称与提示词使用独立字段：通过契约测试和前端上传表单检查。
7. JWT/API Key 不在画布前端配置中：通过代码审查；生成能力保持关闭。
8. 从主项目菜单进入 `/infinite-atelier` 不需要第二次登录：路由使用主项目 `ProtectedRoute`/`AuthProvider`。
