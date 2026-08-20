# Narrix

Narrix 是调皮狗传媒成都漫剧平台的自部署交付版本，负责统一管理项目工作区、素材组、视频生成任务与基础设施配置。

## 核心能力

- 项目工作区模型，用户可被授权到多个项目，并可切换当前项目。
- 素材组与素材的项目隔离，视频任务和配置视图跟随当前项目上下文。
- 素材组与素材双层火山同步策略，支持同步到火山或仅本地保存。
- 视频生成支持已同步素材与 OSS 签名 URL 两种素材来源。
- 安装向导与配置页支持 AK/SK 校验后加载或新建火山素材组。

## 目录结构

```text
Narrix/
├── backend/      # Koa2 + TypeScript + Kysely + PostgreSQL
├── frontend/     # React + TypeScript + Vite + Ant Design
├── deploy/       # Docker Compose 与部署模板
├── config/       # 脱敏配置示例
├── scripts/      # 诊断与本地运维脚本
├── tests/        # 后端单元/集成测试与前端 E2E 测试
├── CHANGELOG.md
└── README.md
```

## 快速开始

### 后端

```bash
cd backend
pnpm install
cp ../config/examples/backend.env.example .env
pnpm migrate
pnpm dev
```

### 前端

```bash
cd frontend
pnpm install
pnpm dev
```

### 常用验证

```bash
pnpm -C backend exec tsc --noEmit
pnpm -C frontend exec tsc --noEmit
pnpm -C backend test
pnpm -C frontend test -- --run
```

## 关键业务规则

### 项目工作区

- 项目编码由系统自动生成，格式为 `PRJ-YYYYMM-000001`。
- 火山素材库侧的 `ProjectName` 使用系统项目编码。
- 创建项目本身不会触发火山资源创建。
- 用户登录后必须在当前项目上下文下访问素材、视频与配置相关能力。

### 素材组与素材同步

- “素材组”映射火山 `Asset Group`。
- 本地素材映射火山 `Asset`。
- 素材组可设置“同步火山”或“仅本地”。
- 组级不同步时，组内素材全部固定为本地素材。
- 组级同步时，素材默认跟随组策略，也允许单素材改为不同步。
- 素材从不同步改成同步时，会立即补推火山同步。

### 视频双通道

- 视频创建请求允许混用已同步素材与未同步素材。
- 已同步素材在 payload 中写为 `asset://<arkAssetId>`。
- 未同步素材使用后端签发的 OSS 签名 URL。
- 视频 worker 会逐素材解析引用来源，再统一向火山提交可访问的签名 URL。

## 文档位置

正式软件开发项目文档位于 `docs/` 目录：

| 文档 | 说明 |
| --- | --- |
| `docs/00-document-index.md` | 软件开发项目文档目录 |
| `docs/product/01-requirements-specification.md` | 软件需求规格说明书 |
| `docs/architecture/02-overall-design.md` | 概要设计说明书 |
| `docs/architecture/03-detailed-design.md` | 详细设计说明书 |
| `docs/architecture/04-api-design.md` | API 接口设计说明书 |
| `docs/architecture/05-database-design.md` | 数据库设计说明书 |
| `docs/architecture/06-frontend-design.md` | 前端页面设计说明书 |
| `docs/quality/07-test-and-acceptance.md` | 测试与验收说明书 |
| `docs/deployment/08-deployment-operations.md` | 部署与运维说明书 |
| `docs/delivery/09-modification-delivery-plan.md` | 修改与交付方案 |

其他说明文件：

| 文件 | 说明 |
| --- | --- |
| `docs/engineering/instructions.md` | 工程约束说明 |
| `backend/README.md` | 后端快速说明 |
| `frontend/README.md` | 前端快速说明 |
| `deploy/README.md` | 部署快速说明 |
| `CHANGELOG.md` | 版本变更记录 |
