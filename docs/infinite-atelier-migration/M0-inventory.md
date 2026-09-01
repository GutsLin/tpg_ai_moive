# Infinite Atelier 迁移整合 M0 盘点报告

## 1. 盘点范围与结论

- 主项目：`Narrix-customer-delivery`，仅盘点现有代码与配置来源。
- 源项目：`Narrix-Infinite-Atelier`，只读盘点，未修改任何文件及参考文档。
- 参考文档：`docs/后端管理需求文档.md` v0.9、`docs/实施计划.md` v1.2。
- 结论：用户和项目可以安全映射。新增画布域表应直接以主项目 BIGINT `users.id`、`projects.id` 为外键，不能复制源项目 UUID 用户、项目或成员表。
- 结论：源项目的 NestJS/Prisma 后端不能整包迁入。画布、提示词、任务和对象引用的领域规则应按主项目 Koa/Kysely 的路由、服务、仓储和迁移模式实现。
- 结论：主项目已有 JWT、项目成员、服务端加密配置、AI 视频渠道、用户 API Key、OSS、BullMQ 和资产删除队列，可作为唯一基础设施；图像和音频生成尚无与视频同等级的主项目公共适配器，需要在 M1 设计为主项目 AI 平台的扩展接口，而不是复制源项目渠道管理。

## 2. 技术栈与目录

| 项目 | 前端 | 后端 | 数据与队列 | 部署 |
|---|---|---|---|---|
| 主项目 | React 19、Vite 8、TypeScript 6、Ant Design 6、React Router 7、Axios、Vitest、Playwright | Koa 3、`@koa/router`、Zod、Kysely | PostgreSQL 17、Redis 7、BullMQ、阿里云 OSS | pnpm、Docker Compose；frontend/backend/video worker/asset worker |
| 源项目 | React 19、Vite 7、TypeScript 5、Ant Design 6、Zustand、TanStack Query、i18next、localforage、lucide-react | NestJS 11、Prisma 6、class-validator | PostgreSQL、Redis、BullMQ、OSS/COS；画布本地缓存使用 IndexedDB | npm workspaces、Docker Compose；按 image/video/audio/maintenance 拆分 worker |

主项目关键目录：

- `frontend/src/router`：路由、菜单权限和项目级路由判断。
- `frontend/src/components/Layout`：主布局、菜单入口、项目切换。
- `frontend/src/stores/auth.tsx`：当前 JWT、用户、项目和项目角色。
- `backend/src/middleware`：JWT、项目上下文、管理员校验。
- `backend/src/services`：项目访问、资产、OSS、AI 视频渠道、用户 API Key。
- `backend/src/db/migrations`：Kysely 可回滚迁移。
- `backend/src/workers`：视频和资产同步/删除 BullMQ worker。

源项目可迁移关注目录：

- `web/src/components/canvas`、`web/src/lib/canvas`、`web/src/stores/canvas`、`web/src/types/canvas.ts`：画布编辑器和节点领域。
- `web/src/pages/canvas`：画布列表与编辑页。
- `web/src/services/api/{canvases,prompts,backend-generation,assets,tasks}.ts`：可参考的前端契约。
- `server/src/modules/{canvases,prompts,generate,adapters,storage}`：领域规则参考，不直接复制框架代码。
- `server/prisma/schema.prisma`：画布、提示词、对象引用和任务模型参考。

明确排除：源项目 `auth`、`users`、`projects`、`members`、`channels` 管理、`user_channel_keys`、`storage_configs`、`storage_credentials`、登录页、项目切换器和管理后台。

## 3. 认证、用户与项目模型

### 主项目

- JWT：浏览器从主项目登录获得 Bearer token；Axios 请求拦截器统一附加 token。
- 用户：`users.id BIGSERIAL`，平台角色为 `admin | user`。
- 项目：`projects.id BIGSERIAL`；成员关系 `project_members(project_id, user_id)`，角色为 `manager | member | viewer`，状态为 `active | inactive`。
- 项目上下文：前端保存 `activeProjectId`，请求通过 `X-Project-Id` 传递；后端 `projectContextMiddleware` 只接受有效、活跃成员。
- 平台管理员没有项目成员记录时也不能进入项目上下文，符合“管理员不可越过项目成员关系”的边界。

### 源项目

- 使用自有 access token、refresh cookie、用户、会话、项目和成员表，ID 全部为 UUID。
- API 使用路径参数 `/projects/:projectId/...`，守卫查询源项目 `project_members`。
- 画布服务所有查询均同时限定 `projectId + createdByUserId + status`，项目管理员没有所有者旁路。

### 映射决定

- 画布 `created_by_user_id` 直接引用主项目 `users.id`。
- 画布、提示词、任务和对象引用的 `project_id` 直接引用主项目 `projects.id`。
- 项目访问统一复用 `projectContextMiddleware`；`viewer` 只读，`manager/member` 在项目 active 时可写。
- 不创建任何用户、登录、会话、项目、成员或用户 Key 映射表。
- 源数据若以后导入，UUID 只允许存在于幂等导入批次的 `legacy_source_id`/映射文件中，不得成为运行时身份。

## 4. AI 与存储现状

### 主项目 AI

- 已有服务端 `video_providers`、`VideoProviderService` 和 `VideoProviderSnapshot`，支持 ToAPIs/Volcano Ark；平台 Key 服务端加密，管理接口只返回掩码。
- 已有 `user_api_keys` 和全局/成员 Key 模式，Key 解析只发生在服务端。
- 已有视频任务、请求快照、BullMQ 创建/轮询/下载流程及幂等键。
- 缺口：没有统一覆盖 image/video/audio/text 的公共 `AIProviderAdapter` 契约；现有生产能力以视频为中心。

### 源项目 AI

- `AIProviderAdapter` 定义媒体创建、异步轮询、取消、虚拟资产同步和文本流式调用。
- `backend-generation.ts` 已将画布调用收敛到服务端项目 API，浏览器不读取真实 Key。
- 视频有环境开关；图像同步结果可先保留临时输出，用户明确上传后才进入对象存储。

### 主项目存储

- `OssService` 从主项目 `system_config` 读取唯一 OSS 配置；前端仅获取短期 STS，长期凭证不下发。
- 主项目资产已有 `oss_key`、项目关联、同步状态和异步物理删除流程。
- 当前没有通用 `storage_objects` 引用计数表，也没有 COS provider；本次应复用 OSS，不复制源项目第二套 storage config/credentials。
- 新对象 Key 必须使用 `projects/{projectId}/infinite-atelier/...` 前缀。

## 5. 数据库与路由现状

### 主项目已有对象

- 身份与配置：`users`、`system_config`、`user_api_keys`。
- 项目：`projects`、`project_members`。
- 资产：`asset_categories`、`assets`、`project_assets`。
- AI：`video_providers`、`video_tasks`、`video_task_assets`、`video_generation_logs`。
- 迁移机制：按时间戳排序的 Kysely `up/down`，迁移记录在同一 PostgreSQL 数据库。

### 主项目路由

- 前端项目级页面：`/assets`、`/videos`、`/analytics`、`/logs`。
- 菜单由 `menuPerms` 和平台管理员限制共同决定；项目级请求由全局 Axios 拦截器附加 `X-Project-Id`。
- 后端路由为 `/api/*`，项目上下文由请求头传递。

### 源项目画布路由

- 页面：`/canvas`、`/canvas/:id`。
- API：`/projects/:projectId/canvases`、`/prompts`、`/assets`、`/generate/*`、`/generate/tasks/*`。
- 目标主入口：`/infinite-atelier`；编辑页建议 `/infinite-atelier/:canvasId`。

## 6. 模块映射表

| 源项目模块 | 主项目对应模块 | 复用方式 | 需要改造的接口 | 数据库迁移 |
|---|---|---|---|---|
| `web/components/canvas` 编辑器与节点 | 无 | 复制必要 UI/领域代码，改为主项目目录、主题和 API | 路由基址、状态注入、资产/生成调用、CSS 依赖 | 否 |
| `web/pages/canvas` 列表/编辑页 | `frontend/src/router`、`AppLayout` | 接入主项目 ProtectedRoute、菜单和 active project | `/infinite-atelier`、`/:canvasId` | 否 |
| `web/stores/canvas`、本地图片存储 | 无；主项目已有草稿 localStorage 模式 | 保留仅本地草稿/Blob，云画布走 API | 禁止 document JSON 内嵌 base64；保存乐观锁版本 | 否 |
| `server/modules/canvases` | Koa route/service/repository 模式 | 按主项目模式重写，保留所有者限定和乐观锁 | `X-Project-Id` + 当前 JWT user；CRUD | 是：`atelier_canvases`、对象引用 |
| `server/modules/prompts` | 无 | 按主项目模式重写；项目成员共享，创建者/manager 管理 | 列表搜索、CRUD、版本 | 是：提示词及版本表 |
| `server/modules/assets` | 主项目 `assets`、`project_assets`、`AssetService` | 复用主项目资产记录和项目共享关系，扩展字段/引用生命周期 | 名称与提示词分字段、加入资产库、引用状态 | 是：增列或 Atelier 元数据/引用表 |
| `server/modules/storage` | `OssService`、STS、资产删除 worker | 只复用主项目 OSS 服务和配置 | 项目命名空间、上传确认、待清理与维护任务 | 是：通用对象/引用记录或等价表 |
| `server/modules/adapters` | `VideoProviderService`、`UserApiKeyService`、视频 worker | 抽取/扩展主项目 AI adapter，不迁渠道或 Key 表 | image/video/audio 统一能力查询、创建、轮询 | 是：AI 任务/输出表；不迁 Key 表 |
| `server/modules/generate/tasks/workers` | `VideoService`、video worker、BullMQ | 复用 DB 事实源、幂等和 worker 约定；视频沿用现有服务 | 画布任务 API、图片/音频 adapter、输出暂存/入库 | 是 |
| `server/auth/users/projects/members` | 主项目同名领域 | 完全不复制 | 删除源登录依赖，使用当前会话和主项目项目上下文 | 否 |
| `server/channels/key-config` | 主项目视频渠道、用户 Key、system config | 完全不复制表和管理页；扩展既有接口 | 公共能力描述不得返回 endpoint/Key | 视 AI 扩展而定；不新建 Key 配置 |
| `web/assets/shared-library` | 主项目素材管理与项目资产 | 复用主项目项目资产查询，迁移侧栏交互 | 预览、搜索、命名、提示词、远程状态 | 可能增列 |
| `web/prompt-library` | 无 | 迁移侧栏和项目共享 API | 搜索、使用、创建者/manager 管理 | 是 |
| 源项目导入模块 | 无 | M8 前不执行；仅保留只读映射设计 | 幂等批次与 legacy ID | 仅确需旧数据时 |

## 7. 主要差异与风险

| 风险 | 影响 | M1/M2 控制措施 |
|---|---|---|
| BIGINT 与 UUID 模型不兼容 | 直接复制 Prisma schema 会产生第二套身份并无法外键映射 | 全部 Atelier 新表使用 BIGINT 主项目外键；源 UUID 仅用于可选导入映射 |
| Koa/Kysely 与 NestJS/Prisma 不兼容 | 后端整包复制会引入第二框架、DI 和迁移体系 | 只迁领域规则和测试场景，按主项目架构重写 |
| 主项目 AI 当前偏视频 | 图像/音频无法直接复用现有 `VideoProviderService` 方法 | M1 定义主项目统一 adapter；不得要求浏览器 Key；缺能力时按强制边界暂停 |
| 主项目仅实现 OSS | 源项目 COS 逻辑不可直接使用 | 本阶段复用 OSS；保持 provider 接口但不复制 COS 凭证管理 |
| 主项目资产表无提示词字段和引用状态 | 名称误作 prompt、引用资产误删 | 单独 `prompt_content` 字段和对象引用表；删除改为 active/pending cleanup 生命周期 |
| 两边 React/Vite/TS 版本略有差异 | 直接复制依赖可能导致构建/类型冲突 | 以主项目 React 19/Antd 6 为准，最小引入 Zustand/localforage/lucide 等必要依赖 |
| 源画布 `project.tsx` 体量大且耦合多个 store | 一次复制难以验证、容易引入登录/配置入口 | 按 types/lib/store/components/page 分层迁移，小步测试与提交 |
| 菜单权限是显式 `menuPerms` | 新入口可能对存量用户不可见 | 设计兼容策略：Atelier 作为项目能力复用现有素材/视频权限或新增无破坏性默认权限迁移 |
| 管理员与项目管理员语义不同 | 错误复用平台 admin 会突破画布所有权 | 所有画布查询始终限定 current user；manager 只管理提示词/项目资产，绝不旁路画布 |
| 现有资产可关联多个项目 | 物理删除可能破坏其他项目或画布引用 | 先解除项目关联；零项目且零引用才删除远程对象，否则 pending cleanup |
| 源项目已有测试环境与独立数据库 | 误连会污染源数据或泄露配置 | 不运行源迁移，不读取/输出 secret 值，不连接生产域名或生产凭证 |

## 8. M0 停止条件检查

- 用户/项目模型可安全映射：是，直接使用主项目 BIGINT ID 和成员关系。
- 已发现会覆盖/删除主项目数据的必要迁移：否。
- 主项目存储能提供项目隔离：是，OSS object key 可由服务端强制加入项目前缀。
- 是否需要真实生产凭证或域名：否。
- AI 能力风险：主项目已有安全的服务端 Key/渠道与视频 adapter 基础，但图像、音频仍需在 M1/M5 扩展。若实现验证发现主项目渠道不能提供对应能力，将按要求暂停，不用源项目 Key 系统替代。

M0 未执行数据库连接、迁移、生成请求、对象上传或删除；未读取或记录任何真实密钥值。
