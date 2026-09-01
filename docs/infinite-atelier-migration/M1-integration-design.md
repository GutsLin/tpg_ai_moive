# Infinite Atelier 迁移整合 M1 设计

## 1. 设计原则与边界

1. 主项目是唯一身份、项目、AI 渠道、API Key 和对象存储来源；Infinite Atelier 只新增画布领域能力。
2. 运行时身份全部来自主项目 JWT：`ctx.state.user.sub` 为主项目 `users.id`，不接受前端自报 `user_id`。
3. 所有项目 API 通过 `X-Project-Id` 进入主项目 `projectContextMiddleware`；项目成员关系是唯一项目访问依据。
4. 画布资源严格 owner-only：列表、读取、更新、删除 SQL 同时限定 `project_id + created_by_user_id + active`。项目管理员不能旁路读取、接管或删除成员画布。
5. 项目资产和项目提示词是共享资源：活跃成员可读/使用；资产和提示词的写权限按既有项目角色及资源创建者规则校验。
6. 主项目迁移采用 Kysely `up/down`；所有删除默认软删除或进入待清理状态，严禁破坏已有表数据。

## 2. 前端路由、菜单与会话

### 路由

- `/infinite-atelier`：画布列表/新建入口。
- `/infinite-atelier/:canvasId`：画布编辑器。
- 不保留源项目 `/login`、`/admin`、`/project-admin`、`/config` 等独立入口。

### 菜单

- 在主项目 `AppLayout` 的 `menuConfig` 增加“无限画布” `/infinite-atelier`。
- 初期沿用主项目 `assets` 菜单权限作为可见性门槛；服务端不以菜单权限代替项目成员/资源校验。
- 路由加入 `routePermMap`；`isProjectScopedRoute('/infinite-atelier') === true`。

### 会话传递

- 主项目 `AuthProvider` 已从 localStorage 恢复 JWT、当前用户和 `activeProjectId`；画布页面直接使用 `useAuth()`。
- 画布 API 使用主项目 Axios `request`，自动携带 Bearer token、刷新 cookie 和 `X-Project-Id`。
- 不复制源项目 access/refresh token、cookie、AuthProvider 或登录页。
- 无项目时复用主项目 `NoProjectPage`；切换项目触发画布列表重新加载。

## 3. ID 与项目映射

| 领域 | 运行时字段 | 来源与约束 |
|---|---|---|
| 用户 | `created_by_user_id BIGINT` | 直接 FK `users.id`，来自 JWT `sub` |
| 项目 | `project_id BIGINT` | 直接 FK `projects.id`，来自 `X-Project-Id` |
| 成员角色 | `project_members.project_role` | `manager/member/viewer`；由后端项目上下文注入 |
| 画布/提示词/任务/对象 | `BIGSERIAL` | 主项目数据库内独立命名空间；不使用源 UUID |
| 源数据 | 不参与运行时 | 如未来导入，只在显式、幂等迁移脚本中保留 legacy ID 映射 |

## 4. 数据表设计（M2 实施）

表名前缀统一为 `atelier_`，避免与主项目已有对象冲突。

### `atelier_canvases`

- `id BIGSERIAL PK`
- `project_id BIGINT NOT NULL FK projects.id ON DELETE RESTRICT`
- `created_by_user_id BIGINT NOT NULL FK users.id ON DELETE RESTRICT`
- `title VARCHAR(300) NOT NULL`
- `document_json JSONB NOT NULL`
- `version INTEGER NOT NULL DEFAULT 1`
- `status VARCHAR(16) NOT NULL DEFAULT 'active'`（active/deleted）
- `client_stable_id VARCHAR(200) NULL`
- `created_at/updated_at TIMESTAMPTZ NOT NULL`
- `deleted_at TIMESTAMPTZ NULL`
- 索引：`(project_id, created_by_user_id, updated_at)`；唯一 `(project_id, created_by_user_id, client_stable_id)`（client id 非空时由应用保证）。

### `atelier_prompts` 与 `atelier_prompt_versions`

- prompt：`id/project_id/title/tags/current_version/created_by_user_id/updated_by_user_id/status/timestamps/client_stable_id`。
- version：`project_id/prompt_id/version/content/updated_by_user_id/created_at`，复合 PK `(project_id,prompt_id,version)`。
- 正文 `content` 独立于资产名称；查询只按项目和 active 状态过滤。
- 活跃成员可读和搜索；创建者可编辑/删除；`manager` 可管理项目内全部提示词；`viewer` 只读。

### `atelier_storage_objects` 与 `atelier_canvas_object_links`

- storage object：`id BIGSERIAL PK`、`project_id`、`created_by_user_id`、`object_key`、`category`、`content_type`、`bytes`、`etag`、`state(active/pending_delete/deleted)`、`metadata JSONB`、时间戳。
- link：`project_id/canvas_id/object_id/role/sequence_no`，复合 PK；FK 均 `ON DELETE RESTRICT`。
- `object_key` 强制 `projects/{project_id}/infinite-atelier/{category}/{object_id}/...`，后端生成，前端不能指定任意 key。
- 若对象仍被画布、任务或主项目资产引用，删除只标记 `pending_delete`；引用归零后维护任务删除 OSS 对象、索引和本地缓存通知。

### `atelier_generation_tasks` 与 `atelier_generation_outputs`

- task：`id BIGSERIAL`、`project_id`、`created_by_user_id`、`canvas_id/version`、`prompt_id/version`、`operation`、`media_type`、`channel_key`、`model`、`idempotency_key`、`request_json`、`status`、`progress`、`provider_task_id`、`error_code/message`、时间戳。
- output：`task_id/project_id/sequence_no/object_id/content_type/bytes/status`，用于异步结果与显式入库。
- 唯一 `(project_id,created_by_user_id,operation,idempotency_key)`，防止重复提交。
- 任务创建/轮询遵循主项目“DB 为准 + 幂等 + 丢队列可恢复”；队列只存 task id。

### 与主项目 `assets` 的关系

- 用户明确“加入资产库”时，优先复用主项目 `assets` + `project_assets`，名称写入 `assets.name`，提示词写入新增 `prompt_content`（或等价 Atelier 元数据字段），严禁复用同一字段。
- 若主项目现有资产表无法表达 Atelier 对象引用，不复制整张资产表，使用 `atelier_storage_objects` 与 `atelier_canvas_object_links` 做引用索引，并由适配器返回主项目资产 ID。

## 5. AI 适配器接入

### 服务端契约

在主项目 `backend/src/services/ai` 建立最小接口（名称可按现有规范调整）：

```ts
type MediaOperation = 'image.generate' | 'image.edit' | 'video.generate' | 'audio.generate'
interface AiProviderAdapter {
  readonly protocol: string
  create(input: { channel: ChannelSnapshot; operation: MediaOperation; model: string; prompt: string; params: Record<string, unknown>; references: ProviderReference[] }): Promise<CreateResult>
  poll?(input: { channel: ChannelSnapshot; providerTaskId: string; operation: MediaOperation }): Promise<PollResult>
  streamText?(...): Promise<void>
}
```

- `ChannelSnapshot` 由主项目 `ConfigService`/`VideoProviderService` 解析，包含脱敏能力描述；真实 Key 只在服务端 adapter 调用前注入。
- 画布组件只调用 `/api/infinite-atelier/projects/:projectId/generate/*`，不感知 ToAPIs/OpenAI/Gemini URL 或 Key。
- 第一阶段可接入主项目现有视频 provider；图像/音频若没有可用 adapter，保留受控 feature flag，默认返回 `FEATURE_DISABLED`，不得回退浏览器直连。
- 请求快照、错误日志和审计记录只允许记录 provider key、model、参数摘要和错误码，使用现有 logger redaction；禁止记录 Key。

### 参考图与素材库

- 仅在 adapter 声明支持时传入参考图；优先传主项目/Atelier 对象的短期签名 URL或服务端流。
- 需要外部素材库同步时调用主项目已有 provider asset client；不在前端保存外部 asset key。
- 生成输出默认本地/临时对象，不自动写入共享资产库；用户点击上传/加入资产库才持久化。

## 6. 存储命名空间与生命周期

- 统一 OSS：`projects/{projectId}/infinite-atelier/{category}/{objectId}/{safeName}`。
- 上传流程：前端上传到主项目受控接口 → 服务端校验成员/大小/MIME → OSS put → 写 `atelier_storage_objects`（或主项目资产表）→ 返回短期签名 URL。
- 下载/预览：服务端校验 project membership 与对象状态后签发限时 URL；前端可按 `projectId:objectId` 使用 IndexedDB 缓存。
- 删除：先统计 canvas/task/asset 引用；有引用则 `pending_delete`，无引用则事务内标记并调用 OSS 删除，失败进入维护队列重试。
- 维护任务按 `pending_delete`、历史孤儿对象和过期临时输出清理；任何清理都以数据库记录为准，不能按前端缓存直接删除远程对象。

## 7. 权限校验位置

1. 路由层：`authMiddleware()` + `projectContextMiddleware()`，校验 token、账户状态、活跃项目成员。
2. 服务层：所有查询和写入显式接收 `userId/projectId/projectRole`；禁止仅依赖前端按钮。
3. 画布：owner-only 条件写入每条 SQL；管理员和 manager 不能读取、修改或接管他人画布。
4. 资产：同项目 active 成员可读和使用；修改/删除按创建者或项目 `manager`；跨项目 ID 必须返回 403/404。
5. 提示词：同项目 active 成员可读/搜索/使用；创建者或 manager 可改删；viewer 只读。
6. 生成任务：只能读取/取消/删除自己创建的任务；引用的共享资产需通过项目范围校验。

## 8. 错误处理、事务与回滚

- 使用主项目 `error-handler` 和 `ValidationAppError/ForbiddenError` 语义；响应不回显 Key、数据库连接串或上游敏感头。
- 画布保存采用 `version` 乐观锁；冲突返回 409，前端提示重新加载，不覆盖他人版本。
- DB 事务只包围数据库状态变更；远程 OSS 删除失败时保留 `pending_delete` 并入队重试，不回滚成“已物理删除”。
- 迁移 `down` 只删除本次新增 `atelier_*` 表/索引；不删除主项目已有数据、不回滚或重写存量用户/项目/资产。
- AI 任务创建先落库再入队；入队失败由维护/重建命令依据 task 状态补投；不会因 Redis 丢失而丢任务事实。
- 所有阶段提交单独 commit；M2 迁移执行前先跑 `git diff --check`、迁移静态审查和 pg-mem/测试数据库验证。

## 9. 阶段门槛

- 若主项目 AI 平台无法提供至少一个安全的图像 adapter，M5 在实现前暂停并提问，不复制源项目 Key 配置。
- 若主项目 OSS 无法保证项目隔离前缀或服务端删除能力，M6 暂停并提问。
- 若发现现有表主键/约束无法增加非破坏性 Atelier 关系，改用全新 `atelier_*` 表而不是修改存量数据。
