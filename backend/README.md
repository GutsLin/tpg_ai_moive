# Narrix Backend

Narrix 后端负责项目工作区、素材组、素材同步、视频任务、系统配置与安装流程。

## 技术栈

- Node.js 22+
- Koa2 + TypeScript
- PostgreSQL + Kysely
- Zod
- BullMQ
- pino

## 本地启动

```bash
pnpm install
cp ../config/examples/backend.env.example .env
pnpm migrate
pnpm dev
```

worker 可分别启动：

```bash
pnpm worker:asset-sync:dev
pnpm worker:video:dev
```

## 数据模型重点

### 项目

- `projects` 保存项目实体与只读项目编码。
- `project_members` 维护用户与项目的多对多授权关系。
- `project_assets` 维护素材与项目的可见关系。
- `video_tasks.project_id` 绑定任务所属项目。

### 素材组与素材

- 数据库历史表名保留 `asset_categories`，业务语义统一视为“素材组”。
- 素材组记录 `project_id`、`sync_enabled`、`ark_group_id`。
- 素材记录 `sync_mode`、`ark_group_id`、`ark_asset_id`、`ark_status`。
- `sync_mode` 支持 `inherit | enabled | disabled`。

同步规则：

1. 组不同步时，素材一定不同步。
2. 素材 `enabled` 时立即同步。
3. 素材 `disabled` 时仅本地使用。
4. 素材 `inherit` 时优先继承素材组，否则回落到系统默认同步策略。

## 关键接口

### 项目工作区

- `GET /api/projects`
- `POST /api/projects`
- `PATCH /api/projects/:id`
- `PUT /api/projects/:id/members`

需要项目上下文的业务接口要求 `X-Project-Id`，并通过 `project-access.service.ts` 做权限校验。

### 安装流程

- `POST /api/setup/validate/ark-aksk`
- `POST /api/setup/ark/asset-groups/list`
- `POST /api/setup/ark/asset-groups`

流程为校验 AK/SK 后加载或创建火山素材组，再保存默认组和默认同步策略。

### 运行态配置

- `GET /api/config`
- `PUT /api/config`
- `POST /api/config/ark/asset-groups/list`
- `POST /api/config/ark/asset-groups`

### 视频任务

- `POST /api/videos`
- `GET /api/videos`
- `GET /api/videos/:id`

接口允许同时接收两类素材引用：

- 已同步素材：`asset://<arkAssetId>`
- 未同步素材：OSS 签名地址，并带 `assetId`

## 测试

```bash
pnpm test
pnpm exec tsc --noEmit
```

## 开发约束

- controller 层只做请求解析和响应组装。
- 禁止在 controller 层直接写 SQL。
- 禁止修改已执行 migration。
- 禁止暴露 OSS 私有桶原始 URL。
- 火山素材库必须使用 AK/SK V4 签名，不得误用视频生成 Bearer Token。
