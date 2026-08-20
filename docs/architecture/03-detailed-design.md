# Narrix 详细设计说明书

| 项目 | 说明 |
| --- | --- |
| 文档编号 | NARRIX-LLD-03 |
| 文档版本 | V1.0 |
| 适用系统 | Narrix 自部署交付版本 |
| 编制依据 | 后端 service、controller、worker、前端页面与 API 封装 |

## 1. 安装向导模块

### 1.1 相关文件

| 类型 | 文件 |
| --- | --- |
| 后端路由 | `backend/src/routes/setup.routes.ts` |
| 后端控制器 | `backend/src/controllers/setup.controller.ts` |
| 后端服务 | `backend/src/services/setup.service.ts` |
| 入参 Schema | `backend/src/schemas/setup.schema.ts` |
| 前端页面 | `frontend/src/pages/Setup/index.tsx` |
| 前端接口 | `frontend/src/api/setup.ts` |

### 1.2 功能设计

安装向导负责系统首次初始化。安装前，`setupGuard` 允许访问 setup 相关接口并限制其他业务接口。安装完成后，系统进入正常登录态。

安装内容包括：

- 管理员账号创建。
- 系统名称保存。
- OSS 配置保存。
- 火山视频接口配置保存。
- 火山素材资产库配置保存。
- 默认素材组保存。
- 默认同步策略保存。
- 初始化状态写入 `system_config`。

### 1.3 校验规则

- 管理员用户名不能为空。
- 管理员密码至少 8 位。
- 系统名称不能为空且最长 64 字符。
- 火山视频 Endpoint 必须为合法 URL。
- 默认素材组 ID 必须符合 `group-xxx-xxx` 格式。
- OSS 签名 URL TTL 必须为正整数。

## 2. 认证与用户模块

### 2.1 相关文件

| 类型 | 文件 |
| --- | --- |
| 路由 | `auth.routes.ts`、`users.routes.ts` |
| 控制器 | `auth.controller.ts`、`users.controller.ts` |
| 服务 | `user.service.ts` |
| Schema | `auth.schema.ts`、`users.schema.ts` |
| 前端 | `pages/Login`、`pages/Users`、`stores/auth.ts` |

### 2.2 认证设计

登录接口校验用户名和密码，成功后返回 token。前端保存 token，并在后续请求中通过请求头携带。

会话接口返回：

- 当前用户信息。
- 用户可访问项目列表。
- 当前默认项目 ID。

### 2.3 用户管理设计

管理员可创建和维护用户。用户字段包括用户名、密码、角色、菜单权限、状态和项目授权。用户角色包括 `admin` 和 `user`。项目授权包括项目 ID 与项目角色。

菜单权限由字符串数组保存，前端根据权限控制页面访问。

## 3. 项目工作区模块

### 3.1 相关文件

| 类型 | 文件 |
| --- | --- |
| 路由 | `projects.routes.ts` |
| 控制器 | `projects.controller.ts` |
| 服务 | `project.service.ts`、`project-access.service.ts` |
| Schema | `projects.schema.ts` |
| 前端 | `pages/Projects`、`api/projects.ts` |

### 3.2 项目设计

项目是系统内业务数据隔离边界。项目拥有名称、编码、状态、说明、封面素材、创建人等字段。

项目编码由服务层自动生成，格式为 `PRJ-YYYYMM-000001`。项目归档后状态变为 `archived`。

### 3.3 项目成员设计

`project_members` 保存用户与项目的多对多关系，项目角色包括：

| 角色 | 说明 |
| --- | --- |
| `manager` | 项目管理员 |
| `member` | 项目成员 |
| `viewer` | 项目查看者 |

项目成员列表更新采用整体替换方式，入参中不允许重复 userId。

## 4. 素材组模块

### 4.1 相关文件

| 类型 | 文件 |
| --- | --- |
| 路由 | `asset-categories.routes.ts` |
| 控制器 | `asset-categories.controller.ts` |
| 服务 | `asset-category.service.ts` |
| Schema | `asset-categories.schema.ts` |
| 前端 | `CategoryManagerModal.tsx`、`api/asset-categories.ts` |

### 4.2 素材组设计

素材组表名为 `asset_categories`，业务显示为“素材组”。素材组属于项目，支持排序、是否同步火山、火山素材组 ID。

同一项目内素材组名称唯一。素材组删除时可指定 `targetCategoryId`，将组内素材迁移到目标组；也可传 `null` 迁移到未分类。

## 5. 素材模块

### 5.1 相关文件

| 类型 | 文件 |
| --- | --- |
| 路由 | `assets.routes.ts` |
| 控制器 | `assets.controller.ts` |
| 服务 | `asset.service.ts`、`oss.service.ts` |
| Schema | `assets.schema.ts` |
| worker | `asset-sync.worker.ts` |
| 前端 | `pages/Assets`、`api/assets.ts`、`utils/oss-upload.ts` |

### 5.2 素材设计

素材支持图片、视频和音频三类。素材文件存储在 OSS，数据库保存 `oss_key`。素材可属于一个素材组，可关联一个或多个项目。

素材同步模式包括：

| 模式 | 说明 |
| --- | --- |
| `inherit` | 继承素材组或系统默认同步策略 |
| `enabled` | 强制同步火山 |
| `disabled` | 仅本地使用 |

素材同步状态保存在 `ark_status`，火山侧 ID 保存在 `ark_asset_id`。

### 5.3 上传流程

1. 前端调用 `/api/assets/sts-token` 获取临时凭证。
2. 前端使用临时凭证上传到 OSS。
3. 前端提交素材记录。
4. 后端保存素材和项目关联。
5. 需要同步时写入同步任务。

## 6. 视频任务模块

### 6.1 相关文件

| 类型 | 文件 |
| --- | --- |
| 路由 | `videos.routes.ts` |
| 控制器 | `videos.controller.ts` |
| 服务 | `video.service.ts` |
| Schema | `videos.schema.ts` |
| worker | `video.worker.ts` |
| 前端 | `pages/Videos`、`api/videos.ts` |

### 6.2 视频任务设计

视频任务属于项目和创建用户。任务保存模型、提示词、时长、比例、分辨率、是否生成音频、请求快照、外部任务 ID、任务状态、结果 URL、失败原因、token 用量和轮询状态。

任务模式包括：

| 模式 | 说明 |
| --- | --- |
| `frames` | 首尾帧模式，仅支持图片素材作为首帧或尾帧 |
| `omni` | 综合素材模式，支持图片、视频、音频等引用素材 |

### 6.3 轮询设计

`video_tasks` 中的轮询字段：

- `next_poll_at`：下次轮询时间。
- `last_ark_status`：上次外部任务状态。
- `last_ark_status_changed_at`：外部状态变化时间。
- `last_polled_at`：最近轮询时间。

worker 根据任务状态和轮询字段判断是否继续查询外部任务。

## 7. 配置模块

### 7.1 相关文件

| 类型 | 文件 |
| --- | --- |
| 路由 | `config.routes.ts` |
| 控制器 | `config.controller.ts` |
| 服务 | `config.service.ts` |
| Schema | `config.schema.ts` |
| 前端 | `pages/Config`、`api/config.ts` |

### 7.2 配置设计

配置存储在 `system_config` 表。字段 `is_secret` 标记敏感配置。配置项包括系统名称、Logo、OSS、火山视频接口、火山素材资产库、默认素材组、默认同步策略和 ProjectName 策略。

配置服务带缓存能力，减少频繁读取数据库。配置更新后可在短时间内生效。

## 8. 前端权限设计

前端路由权限定义在 `router/permissions.ts`：

| 路由 | 权限标识 | 管理员限制 |
| --- | --- | --- |
| `/assets` | `assets` | 否 |
| `/videos` | `videos` | 否 |
| `/analytics` | `analytics` | 否 |
| `/projects` | `projects` | 是 |
| `/users` | `users` | 是 |
| `/config` | `config` | 是 |

若用户未登录，跳转登录页。若未完成初始化，跳转安装页。若缺少项目上下文，进入无项目提示页。
