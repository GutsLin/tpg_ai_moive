# Narrix 项目架构与技术栈文档

> 用于二次开发参考——结合无限画布（Infinite Canvas）场景的架构梳理。

## 1. 系统定位

Narrix 是调皮狗传媒漫剧平台的自部署交付版本，核心能力：

- **项目工作区**：多项目隔离，用户可被授权到多个项目并切换当前上下文
- **素材管理**：图片/视频/音频上传到 OSS，可选同步到素材库（ToAPIs 虚拟人像 / 火山方舟）
- **视频生成**：对接 ToAPIs / 火山方舟 Seedance 模型，支持文生视频、图生视频、首尾帧、全能参考
- **生成日志**：全链路追踪每个视频任务的创建→提交→轮询→下载→入库过程

## 2. 技术栈

### 2.1 后端

| 类别 | 技术 | 版本 | 用途 |
| --- | --- | --- | --- |
| 运行时 | Node.js | ≥20 | 服务端运行时 |
| 框架 | Koa 3 | 3.2 | HTTP 服务 |
| 语言 | TypeScript | 6.0 | 类型安全 |
| ORM | Kysely | 0.28 | SQL 构建器 + 类型推导 |
| 数据库 | PostgreSQL | 16 | 业务数据 |
| 队列 | BullMQ + Redis | 5.73 / 7 | 异步任务（素材同步、视频轮询） |
| 校验 | Zod | 4.3 | 请求体校验 |
| 日志 | Pino | 10.3 | 结构化日志 |
| 鉴权 | JSON Web Token | 9.0 | 无状态认证 |
| 密码 | bcryptjs | 3.0 | 密码哈希 |
| OSS SDK | ali-oss | 6.23 | 阿里云 OSS 操作 |
| STS SDK | @alicloud/sts20150401 | 1.2 | 临时凭证签发 |
| 测试 | Vitest | 4.1 | 单元/集成测试 |

### 2.2 前端

| 类别 | 技术 | 版本 | 用途 |
| --- | --- | --- | --- |
| 框架 | React | 19.2 | UI 框架 |
| 构建 | Vite | 8.0 | 开发服务器 + 打包 |
| 语言 | TypeScript | 6.0 | 类型安全 |
| UI 库 | Ant Design | 6.3 | 组件库 |
| 图标 | @ant-design/icons | 6.1 | 图标 |
| 路由 | react-router-dom | 7.14 | 客户端路由 |
| HTTP | axios | 1.14 | API 请求 |
| OSS 直传 | ali-oss | 6.23 | 浏览器端 STS 直传 |
| 状态 | React Context | — | auth / brand |
| 测试 | Vitest + Testing Library | 4.1 / 16.3 | 组件测试 |
| E2E | Playwright | 1.59 | 端到端测试 |

### 2.3 基础设施

| 类别 | 技术 | 用途 |
| --- | --- | --- |
| 容器 | Docker / Docker Compose | 服务编排 |
| 反向代理 | Nginx | 前端静态文件 + API 代理 |
| 部署 | Shell 脚本 + 版本目录 | release 目录 + 软链切换 |

## 3. 目录结构

```text
Narrix/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── app.ts              # Koa 应用入口（中间件挂载、路由注册、DI 容器）
│   │   ├── controllers/        # 控制器（接收请求、组装响应）
│   │   ├── routes/             # 路由定义（URL → 中间件 → 控制器）
│   │   ├── services/           # 业务逻辑层（数据库访问、外部服务编排）
│   │   ├── schemas/            # Zod 请求体校验
│   │   ├── db/                 # 数据库连接 + Kysely 类型 + 迁移
│   │   │   ├── kysely.ts       # 表类型定义（Database 接口）
│   │   │   ├── migrate.ts      # 迁移执行器
│   │   │   └── migrations/     # 18 个迁移文件（时间线见下文）
│   │   ├── lib/                # 外部服务客户端
│   │   │   ├── ark-bearer.ts   # 火山方舟 Bearer 客户端（视频生成 + 错误翻译）
│   │   │   ├── ark-aksk.ts     # 火山素材库 AK/SK 客户端
│   │   │   └── toapis-avatar.ts # ToAPIs 虚拟人像素材库客户端 + 平台感知包装器
│   │   ├── middleware/         # 鉴权、项目上下文、安装守卫、错误处理、请求日志
│   │   ├── workers/            # 后台 Worker
│   │   │   ├── video.worker.ts # 视频任务创建 + 状态轮询
│   │   │   ├── asset-sync.worker.ts # 素材同步 + 删除
│   │   │   └── worker-runtime.ts    # 错误分类、日志辅助
│   │   ├── types/              # 类型声明
│   │   └── utils/              # 工具函数（logger、errors、http、权限）
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
│
├── frontend/                   # 前端管理台
│   ├── src/
│   │   ├── main.tsx            # 入口（ConfigProvider 主题 + AuthProvider + BrandProvider + Router）
│   │   ├── router/             # 路由配置 + 权限守卫
│   │   │   ├── index.tsx       # 路由表 + ProtectedRoute + ensureInitialized
│   │   │   └── permissions.ts  # 路由权限映射（adminOnly / projectScoped）
│   │   ├── pages/              # 页面组件
│   │   │   ├── Assets/         # 素材管理（AssetCard / UploadModal / CategoryManagerModal）
│   │   │   ├── Videos/         # 视频生成（GeneratePanel / TaskCard / AssetPickerModal）
│   │   │   ├── Analytics/      # 数据统计
│   │   │   ├── Projects/       # 项目管理
│   │   │   ├── Users/          # 用户管理
│   │   │   ├── Config/         # 系统配置
│   │   │   ├── Logs/           # 生成日志
│   │   │   ├── Setup/          # 安装向导
│   │   │   ├── Login/         # 登录
│   │   │   ├── NoAccess/       # 无权限
│   │   │   ├── NoProject/      # 无项目
│   │   │   └── NotFound/       # 404
│   │   ├── components/         # 公共组件（AppLayout / PageHeader）
│   │   ├── stores/             # 状态管理（React Context）
│   │   │   ├── auth.tsx        # 认证状态 + localStorage 持久化
│   │   │   └── brand.tsx       # 品牌信息
│   │   ├── api/                # API 请求层
│   │   │   ├── auth.ts          # 登录/会话/改密
│   │   │   ├── assets.ts       # 素材 CRUD + STS 上传
│   │   │   ├── asset-categories.ts # 素材组 CRUD
│   │   │   ├── videos.ts       # 视频任务 + 分析
│   │   │   ├── video-provider.ts # 视频平台能力
│   │   │   ├── video-providers.ts # 视频平台管理
│   │   │   ├── video-generation-logs.ts # 生成日志
│   │   │   ├── config.ts       # 系统配置
│   │   │   ├── projects.ts     # 项目 CRUD + 成员
│   │   │   ├── users.ts        # 用户管理
│   │   │   └── setup.ts        # 安装向导
│   │   ├── hooks/              # useDocumentTitle / usePolling
│   │   ├── utils/              # request / oss-upload / branding / analytics-format / video-draft-storage
│   │   ├── types/              # ali-oss.d.ts
│   │   └── styles/             # global.css
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── vitest.config.ts
│
├── tests/                      # 测试
│   ├── backend/                # 后端单元/集成测试（28 文件）
│   └── e2e/                    # Playwright E2E 测试
│
├── deploy/                     # 部署
│   ├── docker-compose.yml      # 服务编排
│   ├── runtime-compose.yml     # 运行时配置
│   ├── deployment-profiles.cjs # 部署环境配置
│   ├── scripts/deploy.sh       # 部署脚本
│   ├── env/                    # 环境变量
│   │   ├── prod/stack.env      # 生产环境
│   │   ├── dev/                # 开发环境
│   │   └── uat/                # UAT 环境
│   └── nginx/                  # Nginx 配置
│
├── config/                     # 脱敏配置示例
├── docs/                       # 项目文档（10 份）
└── scripts/                    # 诊断与运维脚本
```

## 4. 后端分层架构

### 4.1 请求处理链路

```text
HTTP 请求
  │
  ▼
errorHandler          ← 全局错误捕获
  │
  ▼
requestLogger         ← 结构化访问日志
  │
  ▼
cors()                ← 跨域
  │
  ▼
bodyParser()          ← JSON 解析
  │
  ▼
setupGuard            ← 未初始化时仅允许 /api/setup/*
  │
  ▼
路由 (routes/)        ← URL 匹配 + 中间件链
  │  ├── authMiddleware()          ← JWT 验证
  │  ├── projectContextMiddleware()  ← X-Project-Id 解析 + 权限校验
  │  └── requireAdmin()            ← 管理员守卫
  │
  ▼
控制器 (controllers/) ← 参数组装、调用 service
  │
  ▼
服务层 (services/)    ← 业务逻辑、数据库操作、外部服务调用
  │
  ▼
数据层 (db/kysely.ts) ← Kysely 类型化 SQL
```

### 4.2 依赖注入

`app.ts` 的 `createApp(dependencies)` 支持注入自定义 Repository / Dispatcher / Service，测试时替换为内存实现：

```typescript
interface AppDependencies {
  userRepository?: UserRepository
  configStore?: ConfigStore
  projectRepository?: ProjectRepository
  assetRepository?: AssetRepository
  assetDispatcher?: AssetDispatcher
  videoRepository?: VideoRepository
  videoDispatcher?: VideoDispatcher
  ossService?: OssServiceContract
  // ...
}
```

### 4.3 API 路由清单

| 模块 | 前缀 | 主要端点 |
| --- | --- | --- |
| 认证 | `/api/auth` | POST /login · GET /session · POST /logout · POST /change-password |
| 素材 | `/api/assets` | GET / · GET /:id · POST / · PATCH /:id · DELETE /:id · POST /sts-token · POST /:id/sync |
| 素材组 | `/api/asset-categories` | GET / · POST / · PATCH /:id · DELETE /:id |
| 视频 | `/api/videos` | GET / · GET /:id · POST / · POST /:id/sync · GET /analytics · GET /analytics/export |
| 视频日志 | `/api/video-generation-logs` | GET / · DELETE / |
| 配置 | `/api/config` | GET / · PUT / · GET /branding |
| 项目 | `/api/projects` | GET / · POST / · PATCH /:id · GET /:id/members · PUT /:id/members |
| 用户 | `/api/users` | GET / · POST / · PATCH /:id · DELETE /:id |
| 安装 | `/api/setup` | GET /status · POST / · POST /validate/* |
| 健康 | `/health` | GET / |

## 5. 数据库设计

### 5.1 表结构总览

```text
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   users      │     │   projects       │     │  asset_categories │
│──────────────│     │──────────────────│     │───────────────────│
│ id (PK)      │◄──┐ │ id (PK)          │◄──┐ │ id (PK)           │
│ username     │   │ │ name             │   │ │ project_id (FK)   │
│ password_hash│   │ │ code (unique)    │   │ │ name              │
│ role         │   │ │ status           │   │ │ sync_enabled      │
│ menu_perms   │   │ │ created_by (FK)──┘   │ │ ark_group_id      │
│ status       │   │ └──────────────────┘   │ └───────────────────┘
└──────────────┘   │          ▲                     ▲
     ▲              │          │                     │
     │              │ ┌────────┴───────┐     ┌───────┴────────┐
     │              │ │project_members │     │    assets       │
     │              │ │────────────────│     │─────────────────│
     │              │ │ project_id(FK) │     │ id (PK)         │
     │              │ │ user_id (FK)───┘     │ user_id (FK)    │
     │              │ │ project_role   │     │ source_project_id│
     │              │ │ status         │     │ name            │
     │              │ └────────────────┘     │ asset_type      │
     │              │                        │ category_id(FK) │
     │              │ ┌────────────────┐     │ oss_key         │
     │              │ │ project_assets │     │ ark_asset_id   │
     │              │ │────────────────│     │ ark_status      │
     └──────────────┤│ project_id(FK) │     │ sync_mode       │
                    ││ asset_id (FK)──┼─────│ tags            │
                    ││ relation_type  │     └─────────────────┘
                    │└────────────────┘            ▲
                    │                             │
                    │     ┌───────────────────────┘
                    │     │
                    │ ┌───┴──────────────┐     ┌─────────────────────┐
                    │ │ video_tasks       │     │ video_task_assets   │
                    │ │──────────────────│     │─────────────────────│
                    │ │ id (PK)           │◄───│ video_task_id (FK)  │
                    └─│ user_id (FK)      │     │ asset_id (FK)       │
                      │ project_id (FK)   │     │ role               │
                      │ ark_task_id       │     └─────────────────────┘
                      │ status            │
                      │ model             │     ┌─────────────────────┐
                      │ provider_key      │     │video_generation_logs│
                      │ provider_snapshot │     │─────────────────────│
                      │ request_snapshot  │     │ id (PK)             │
                      │ video_oss_key     │     │ video_task_id (FK)  │
                      │ next_poll_at      │     │ project_id (FK)     │
                      │ last_ark_status   │     │ trace_id            │
                      └──────────────────┘     │ stage / action       │
                                               │ status               │
                      ┌──────────────────┐     │ request_payload      │
                      │ video_providers   │     │ response_payload     │
                      │──────────────────│     │ duration_ms          │
                      │ id (PK)           │     └─────────────────────┘
                      │ provider_key      │
                      │ provider_type     │     ┌──────────────────┐
                      │ endpoint          │     │  system_config   │
                      │ api_key (加密)    │     │──────────────────│
                      │ capabilities      │     │ key (PK)         │
                      │ is_default        │     │ value            │
                      └──────────────────┘     │ is_secret        │
                                               │ description      │
                                               └──────────────────┘
```

### 5.2 核心表字段

**users**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint PK | 自增 |
| username | varchar(64) | 唯一 |
| password_hash | varchar(128) | bcrypt |
| role | varchar(16) | admin / user |
| menu_perms | jsonb | 菜单权限数组（如 `["assets","videos"]`） |
| status | smallint | 1=启用 0=禁用 |

**projects**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint PK | |
| name | varchar | 项目名 |
| code | varchar unique | 自动生成 `PRJ-YYYYMM-000001` |
| status | varchar | active / archived |

**project_members**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| project_id | bigint FK | |
| user_id | bigint FK | |
| project_role | varchar | manager / member / viewer |
| status | varchar | active / inactive |

**assets**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint PK | |
| user_id / created_by_user_id | bigint FK | 上传人 |
| source_project_id | bigint | 原始项目 |
| name | varchar | 素材名（项目内唯一） |
| asset_type | varchar | Image / Video / Audio |
| category_id | bigint FK | 素材组 |
| oss_key | varchar | OSS 存储路径 |
| ark_group_id | varchar | 素材库组 ID（`pg_` = ToAPIs / `group-` = 火山） |
| ark_asset_id | varchar | 素材库素材 ID（`pa_` = ToAPIs / `asset-` = 火山） |
| ark_status | varchar | pending / processing / active / failed / deleting |
| sync_mode | varchar | inherit / enabled / disabled |
| tags | jsonb | 标签数组 |

**video_tasks**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint PK | |
| ark_task_id | varchar | 平台任务 ID |
| status | varchar | pending / processing / succeeded / failed |
| model | varchar | 模型 ID |
| prompt / prompt_raw | text | 提示词 |
| provider_key | varchar | 视频平台标识 |
| provider_snapshot | jsonb | 平台快照（endpoint、类型、能力） |
| request_snapshot | jsonb | 生成请求快照（含 content 数组） |
| video_oss_key | varchar | 结果视频 OSS 路径 |
| next_poll_at | timestamptz | 下次轮询时间 |
| last_ark_status | varchar | 最近平台状态 |

### 5.3 迁移时间线

| 时间戳 | 内容 |
| --- | --- |
| 20260404030000 | 创建 users + system_config |
| 20260404042000 | 种子系统配置 |
| 20260404050000 | 创建 asset_categories + assets |
| 20260404083000 | 创建 video_tasks |
| 20260404113000 | 项目工作区基础（projects + project_members + project_assets） |
| 20260404152000 | 项目级素材隔离 |
| 20260404190000 | 种子安装状态 |
| 20260404234500 | 创建 projects 表并关联资产 |
| 20260405190000 | 种子品牌配置 |
| 20260406010000 | 工作区素材组双通道（同步策略） |
| 20260406123000 | 清理引导默认项目 |
| 20260407130500 | 添加 Ark 项目名配置 |
| 20260407184500 | 项目角色 owner → manager |
| 20260602093000 | 视频任务轮询字段 |
| 20260818193000 | 视频生成日志表 |
| 20260819123000 | 视频平台表（video_providers） |
| 20260819170000 | OSS 服务器网络模式 |
| 20260819174500 | 修正遗留视频平台 |

## 6. Worker 架构

### 6.1 视频任务 Worker

| 队列 | 职责 | 并发 |
| --- | --- | --- |
| `create-and-sync-video` | 创建视频任务 → 提交到平台 → 保存 ark_task_id | 2 |
| `sync-video-status` | 30 秒定时轮询到期任务状态 → 下载视频 → 上传 OSS | 定时器 |
| `reconcile` | 60 秒定时补偿卡住的处理中任务（重新入队创建） | 定时器 |

**任务状态机**：

```text
用户发起 → pending（等待创建）
  │
  ▼ createWorker
processing → 提交到平台 → 保存 ark_task_id → 设置 next_poll_at
  │
  ▼ syncTimer（每 30s）
轮询平台状态：
  ├── queued/pending → 保持 pending，安排下次轮询
  ├── running → processing，安排下次轮询
  ├── succeeded → 下载视频 → 上传 OSS → succeeded
  └── failed → failed（写入 errorMessage）
```

**错误隔离**：每个任务的轮询错误相互独立，认证失败仅终止该任务，不毒化同批其他任务。

### 6.2 素材同步 Worker

| 队列 | 职责 | 并发 |
| --- | --- | --- |
| `sync-asset-status` | 上传素材到素材库 → 轮询审核状态 → active/failed | 3 |
| `delete-asset` | 删除 OSS 文件 + 删除素材库远端素材 | 2 |

**平台感知**：`ProviderAssetClient` 按当前默认视频平台自动选择素材库客户端：
- toapis → `ToApisAvatarClient`（private-avatar API，Bearer 认证）
- volcano_ark → `ArkAkskClient`（AK/SK 签名）

## 7. 外部服务集成

### 7.1 视频生成平台

```text
video_providers 表
  ├── toapis（ToAPIs）
  │     端点: https://toapis.com/v1
  │     认证: Bearer API Key
  │     素材引用: OSS 签名 URL 或 asset://pa_xxx
  │     模型: seedance-2 / seedance-2-fast / seedance-2-5
  │
  └── volcano_ark（火山方舟 / 中转站）
        端点: models.kapon.cloud/volcark/api/v3
        认证: Bearer API Key
        素材引用: asset://arkAssetId（需素材已同步火山）
        模型: doubao-seedance-2-0-*
```

### 7.2 素材库平台

```text
ProviderAssetClient（平台感知包装器）
  ├── ToApisAvatarClient（虚拟人像素材库）
  │     端点: /v1/videos/doubao-seedance-2-0/private-avatar/*
  │     认证: Bearer（复用视频平台 API Key）
  │     组 ID: pg_ 前缀
  │     素材 ID: pa_ 前缀
  │     支持类型: Image / Video / Audio
  │
  └── ArkAkskClient（火山素材库）
        端点: open.volcengineapi.com
        认证: AK/SK HMAC-SHA256 V4 签名
        组 ID: group- 前缀
        素材 ID: asset- 前缀
        支持类型: Image
```

### 7.3 OSS（阿里云对象存储）

```text
素材上传链路：
  浏览器 → POST /api/assets/sts-token → 获取 STS 临时凭证
  浏览器 → ali-oss V1 直传到 OSS（assets/YYYY/MM/DD/uuid-filename）
  浏览器 → POST /api/assets（携带 ossKey）→ 后端创建素材记录 → 入队同步

视频结果存储：
  worker 下载平台生成的视频 → putObject 到 OSS（videos/arkTaskId.mp4）
```

## 8. 前端架构

### 8.1 路由与权限

```text
AppRouter
  ├── ensureInitialized     ← 未初始化 → /setup
  ├── ProtectedRoute         ← 未登录 → /login
  │     ├── adminOnlyRoutes  ← 非 admin → /no-access（/projects /users /logs /config）
  │     └── projectScopedRoutes ← 需 X-Project-Id（/assets /videos /analytics /logs）
  └── 路由表
        /setup, /login, /no-access, /no-project, /404
        /assets, /videos, /analytics, /logs, /config, /users, /projects
```

### 8.2 状态管理

| Store | 方式 | 职责 |
| --- | --- | --- |
| AuthProvider | React Context + localStorage | token、用户信息、菜单权限、当前项目 |
| BrandProvider | React Context | 系统名称、Logo |

### 8.3 权限模型

| 平台角色 | 菜单权限 | 项目角色 | 项目内权限 |
| --- | --- | --- | --- |
| admin | 全部菜单 | — | 全部项目 |
| user | menu_perms 指定 | manager | 管理项目素材/视频/成员 |
| | | member | 查看全部素材、编辑自己的、不能删除 |
| | | viewer | 仅查看 |

## 9. 部署架构

### 9.1 Docker Compose 服务

```text
┌─────────────────────────────────────────┐
│           Docker Network: narrix         │
│                                         │
│  ┌──────────┐    ┌──────────────────┐   │
│  │ frontend  │───▶│ backend (Koa)    │   │
│  │ (Nginx)   │    │ :3000            │   │
│  └──────────┘    └──────┬───────────┘   │
│     :8080               │               │
│                         ▼               │
│  ┌──────────┐    ┌──────────────────┐   │
│  │ postgres  │◀───│ worker-video     │   │
│  │ :5432     │    │ worker-asset-sync│   │
│  └──────────┘    └──────┬───────────┘   │
│     ▲                    │               │
│     │              ┌─────▼──────┐        │
│     └──────────────│ redis :6379│        │
│                    └────────────┘        │
└─────────────────────────────────────────┘
         │
         ▼ 外部服务
  ┌─────────────┐  ┌──────────────┐  ┌────────────┐
  │ 阿里云 OSS  │  │ ToAPIs API   │  │ 火山引擎 API│
  └─────────────┘  └──────────────┘  └────────────┘
```

### 9.2 版本化部署

```text
/opt/narrix/
  ├── releases/
  │     ├── 20260820-provider-labels-v6/   ← 完整源码 + deploy/
  │     └── （历史版本...）
  ├── env/prod/stack.env                    ← NARRIX_IMAGE_TAG 控制当前版本
  └── current/prod → releases/xxx           ← 软链指向当前版本
```

**部署流程**：
1. 复制现有 release 目录
2. 替换差异文件
3. 更新 `NARRIX_IMAGE_TAG`
4. `docker compose build` → `up -d`
5. 更新 `current/prod` 软链

## 10. 二次开发指引：集成无限画布

### 10.1 接入点建议

| 画布需求 | 对接 Narrix 能力 | 接入方式 |
| --- | --- | --- |
| 画布上的素材节点 | 素材管理 API | GET /api/assets → 在画布渲染素材缩略图 |
| 拖拽素材到视频生成 | 视频生成 API | POST /api/videos（携带 assetId） |
| 节点间连线 = 生成关系 | video_task_assets | 查询素材被哪些任务引用 |
| 画布状态持久化 | 新增 canvas 表 | 迁移 + Kysely 类型 + CRUD API |
| 实时同步 | WebSocket / SSE | 在 backend 新增 ws 路由 |

### 10.2 推荐扩展路径

**第一步：只读画布**（最小可用）
- 前端引入无限画布库（如 React Flow / Excalidraw / tldraw）
- 调用 `GET /api/assets` 渲染素材节点
- 调用 `GET /api/videos` 渲染视频任务节点
- 不修改后端

**第二步：交互生成**
- 画布上选素材 → 拖到生成区 → `POST /api/videos`
- 轮询任务状态（`usePolling` hook 已有）
- 生成完成后在画布上显示结果视频节点

**第三步：画布持久化**
- 新增数据库表 `canvases`（id, project_id, name, data jsonb）
- 新增 `/api/canvases` CRUD 路由
- 前端新增画布编辑器页面

**第四步：协同编辑**
- 后端加 WebSocket（Koa ws 或独立 ws 服务）
- 画布操作通过 ws 广播到同项目成员
- 利用现有 `project_members` 权限模型控制协作范围

### 10.3 技术选型建议

| 无限画布方案 | 适配度 | 理由 |
| --- | --- | --- |
| **React Flow** | ⭐⭐⭐⭐⭐ | React 原生、节点自定义能力强、与 Ant Design 兼容 |
| tldraw | ⭐⭐⭐⭐ | 开箱即用、支持协同、但 UI 风格独立 |
| Excalidraw | ⭐⭐⭐ | 手绘风格、适合白板但定制性弱 |
| 自研 Canvas | ⭐⭐ | 完全可控但成本极高 |

**推荐 React Flow**——与现有 React 19 + TypeScript + Ant Design 技术栈无缝集成，节点可用现有 AssetCard / TaskCard 组件。

### 10.4 数据模型扩展示例

```sql
-- 画布表
CREATE TABLE canvases (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',  -- React Flow 节点与边
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 画布节点与素材/任务的关联表（可选，用于反向查询）
CREATE TABLE canvas_nodes (
  id BIGSERIAL PRIMARY KEY,
  canvas_id BIGINT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  node_id VARCHAR(64) NOT NULL,      -- React Flow 节点 ID
  ref_type VARCHAR(16) NOT NULL,       -- asset / video_task
  ref_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 10.5 后端扩展代码结构

```text
backend/src/
  ├── controllers/canvas.controller.ts      # 画布 CRUD
  ├── routes/canvas.routes.ts               # /api/canvases
  ├── services/canvas.service.ts            # 画布业务逻辑
  ├── schemas/canvas.schema.ts              # Zod 校验
  └── db/migrations/20260821000000_create_canvases.ts
```

### 10.6 前端扩展代码结构

```text
frontend/src/
  ├── pages/Canvas/
  │     ├── index.tsx                       # 画布编辑器页面
  │     ├── nodes/
  │     │     ├── AssetNode.tsx             # 素材节点（复用 AssetCard 逻辑）
  │     │     ├── TaskNode.tsx              # 视频任务节点（复用 TaskCard 逻辑）
  │     │     └── GenerateNode.tsx          # 生成操作节点
  │     ├── edges/
  │     │     └── ReferenceEdge.tsx          # 素材引用关系连线
  │     └── canvas-state.ts                 # 画布状态管理
  ├── api/canvas.ts                         # 画布 API 请求层
  └── router/index.tsx                      # 新增 /canvas 路由
```

## 11. 当前部署版本

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| prod-20260820-provider-labels-v6 | 2026-08-20 | ToAPIs 素材库接入 + 平台标识 + 错误翻译 + 素材可见性 + 轮询隔离 |
| prod-20260820-toapis-asset-library-v5 | 2026-08-20 | ToAPIs 虚拟人像素材库接入 |
| prod-20260820-error-translation-v4 | 2026-08-20 | 平台错误中文翻译 |
| prod-20260820-asset-visibility-v3 | 2026-08-20 | member 可见全项目素材 |
| prod-20260819-poll-isolation-v2 | 2026-08-19 | 视频轮询错误隔离 |
| prod-20260819-local-source-v1 | 2026-08-19 | 初始部署 |
