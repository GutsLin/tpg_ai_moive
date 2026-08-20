# Narrix 概要设计说明书

| 项目 | 说明 |
| --- | --- |
| 文档编号 | NARRIX-HLD-02 |
| 文档版本 | V1.0 |
| 适用系统 | Narrix 自部署交付版本 |
| 编制依据 | 当前交付源码、路由、数据库迁移、前端页面结构 |

## 1. 总体架构

Narrix 采用前后端分离架构，后端提供统一 REST 接口，前端管理台通过 HTTP 调用后端。后台任务由独立 worker 处理，数据库和队列服务分别由 PostgreSQL 和 Redis 提供。

```text
浏览器
  |
  | HTTP
  v
前端管理台 React/Vite
  |
  | /api/*
  v
后端服务 Koa2/TypeScript
  |-- PostgreSQL：业务数据、配置、任务状态
  |-- Redis：BullMQ 队列
  |-- worker-video：视频任务提交与轮询
  |-- worker-asset-sync：素材同步
  |-- OSS：素材文件存储
  |-- 火山素材资产库：素材组与素材同步
  |-- 火山视频接口：视频生成
```

## 2. 后端逻辑架构

后端入口为 `backend/src/app.ts`，按以下顺序注册中间件和路由：

1. 全局错误处理。
2. 请求日志。
3. CORS。
4. body parser。
5. 安装状态守卫。
6. setup、auth、asset-categories、assets、videos、config、users、projects、health 路由。

后端分层如下：

| 层 | 目录 | 说明 |
| --- | --- | --- |
| 路由层 | `src/routes` | 注册 URL、HTTP 方法和中间件 |
| 控制器层 | `src/controllers` | 接收已校验参数并组装响应 |
| 服务层 | `src/services` | 业务逻辑、数据库访问、外部服务编排 |
| Schema 层 | `src/schemas` | Zod 入参校验 |
| 数据层 | `src/db` | Kysely 类型、连接、迁移 |
| 中间件 | `src/middleware` | 鉴权、项目上下文、安装守卫、错误处理 |
| 外部客户端 | `src/lib` | 火山接口封装 |
| 后台任务 | `src/workers` | 素材同步和视频轮询 |

## 3. 前端逻辑架构

前端入口为 `frontend/src/main.tsx`，路由集中在 `frontend/src/router/index.tsx`。

| 层 | 目录 | 说明 |
| --- | --- | --- |
| 路由 | `src/router` | 路由表、权限守卫、默认跳转 |
| 接口 | `src/api` | 后端接口封装和类型定义 |
| 页面 | `src/pages` | Login、Setup、Projects、Users、Assets、Videos、Analytics、Config 等页面 |
| 布局 | `src/components/Layout` | 主体布局、项目切换、导航菜单 |
| 状态 | `src/stores` | 登录态、品牌配置、当前项目 |
| 工具 | `src/utils` | 请求封装、OSS 上传、视频草稿、格式化 |

## 4. 模块划分

| 模块 | 后端文件 | 前端文件 | 说明 |
| --- | --- | --- | --- |
| 安装向导 | `setup.routes.ts`、`setup.service.ts` | `pages/Setup`、`api/setup.ts` | 首次初始化和外部配置校验 |
| 认证会话 | `auth.routes.ts`、`user.service.ts` | `pages/Login`、`stores/auth.ts` | 登录、会话、密码修改 |
| 项目管理 | `projects.routes.ts`、`project.service.ts` | `pages/Projects`、`api/projects.ts` | 项目、成员、项目角色 |
| 用户管理 | `users.routes.ts`、`user.service.ts` | `pages/Users`、`api/users.ts` | 用户、菜单权限、项目授权 |
| 素材组 | `asset-categories.routes.ts`、`asset-category.service.ts` | `pages/Assets/CategoryManagerModal.tsx` | 素材组增删改查和同步策略 |
| 素材 | `assets.routes.ts`、`asset.service.ts` | `pages/Assets`、`api/assets.ts` | 素材上传、列表、同步、关联项目 |
| 视频任务 | `videos.routes.ts`、`video.service.ts` | `pages/Videos`、`api/videos.ts` | 视频任务创建、列表、详情、同步 |
| 统计分析 | `videos.routes.ts` | `pages/Analytics`、`api/videos.ts` | 视频任务统计 |
| 系统配置 | `config.routes.ts`、`config.service.ts` | `pages/Config`、`api/config.ts` | 运行态配置和品牌配置 |

## 5. 核心业务流程

### 5.1 初始化流程

1. 前端访问系统，调用 `/api/setup/status`。
2. 后端返回初始化状态、环境、版本、数据库和 Redis 健康状态。
3. 未初始化时进入 `/setup`。
4. 用户填写管理员账号、OSS 配置、火山配置和默认素材组。
5. 前端调用配置校验接口。
6. 校验通过后调用 `/api/setup/initialize`。
7. 后端创建管理员、写入配置、标记系统已初始化。
8. 前端跳转登录页。

### 5.2 登录与权限流程

1. 用户调用 `/api/auth/login` 登录。
2. 后端校验密码，返回 token、用户信息、项目列表和当前项目。
3. 前端保存 token 和项目上下文。
4. 受保护路由检查登录态、菜单权限、管理员页面限制和项目上下文。
5. 业务接口通过 `Authorization` 和 `X-Project-Id` 进行权限校验。

### 5.3 素材上传与同步流程

1. 前端调用 `/api/assets/sts-token` 获取上传凭证。
2. 前端直传素材到 OSS。
3. 前端调用 `/api/assets` 创建素材记录。
4. 后端根据素材组和素材同步模式判断是否同步火山。
5. 需要同步时写入素材同步队列。
6. `worker-asset-sync` 调用火山素材资产库接口并更新素材状态。

### 5.4 视频生成流程

1. 前端选择素材并提交 `/api/videos`。
2. 后端校验项目权限、素材引用和参数。
3. 后端创建 `video_tasks` 和 `video_task_assets` 记录。
4. `worker-video` 解析素材引用，生成可访问 URL。
5. worker 调用火山视频接口创建外部任务。
6. worker 根据 `next_poll_at` 轮询任务结果。
7. 成功后写入结果地址，失败时写入错误信息。

## 6. 部署架构

部署目录提供 Docker Compose 编排，服务包括：

- `frontend`
- `backend`
- `postgres`
- `redis`
- `migrate`
- `worker-video`
- `worker-asset-sync`

生产环境通过 `deploy/env/prod/stack.env` 设置端口、数据库、Redis、镜像、密钥和网络。测试环境通过 `deploy/env/dev/stack.env` 设置。
