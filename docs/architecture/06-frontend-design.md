# Narrix 前端页面设计说明书

| 项目 | 说明 |
| --- | --- |
| 文档编号 | NARRIX-FE-06 |
| 文档版本 | V1.0 |
| 适用系统 | Narrix 自部署交付版本 |
| 编制依据 | `frontend/src/router`、`frontend/src/pages`、`frontend/src/api`、`frontend/src/stores` |

## 1. 前端总体设计

Narrix 前端为 React + TypeScript + Vite 管理台应用，使用 Ant Design 组件构建业务页面。前端通过 `src/api/` 访问后端接口，通过 `src/stores/` 维护登录态、品牌信息和项目上下文。

## 2. 路由设计

| 路由 | 页面 | 权限标识 | 说明 |
| --- | --- | --- | --- |
| `/setup` | SetupPage | 无 | 系统初始化向导 |
| `/setup/help/configuration` | SetupHelpPage | 无 | 初始化配置帮助 |
| `/login` | LoginPage | 无 | 登录页 |
| `/assets` | AssetsPage | `assets` | 素材管理 |
| `/videos` | VideosPage | `videos` | 视频生成与任务历史 |
| `/analytics` | AnalyticsPage | `analytics` | 视频任务统计 |
| `/projects` | ProjectsPage | `projects` | 项目管理，管理员页面 |
| `/users` | UsersPage | `users` | 用户管理，管理员页面 |
| `/config` | ConfigPage | `config` | 系统配置，管理员页面 |
| `/no-access` | NoAccessPage | 无 | 无权限提示 |
| `*` | NotFoundPage | 无 | 未匹配页面 |

默认路由 `/` 根据用户权限跳转到首个可访问页面。

## 3. 路由守卫设计

路由守卫逻辑位于 `src/router/index.tsx`：

1. 应用启动后调用 `/api/setup/status` 判断安装状态。
2. 未初始化时，除安装相关页面外跳转 `/setup`。
3. 已初始化后访问 `/login` 进入登录页。
4. 访问受保护页面时检查登录态。
5. 管理员页面要求用户角色为 `admin`。
6. 项目内页面要求存在当前项目上下文。
7. 菜单权限不足时进入未找到页面。

## 4. 全局状态设计

### 4.1 登录状态

登录状态包含：

- token。
- 当前用户。
- 可访问项目列表。
- 当前项目 ID。
- 项目刷新标记。
- hydration 状态。

登录成功后保存 token 和用户信息，后续请求自动携带 token 和项目上下文。

### 4.2 品牌状态

品牌状态来自公开品牌接口 `/api/config/branding`，用于登录页、安装状态错误页和整体布局展示系统名称和 Logo。

## 5. 页面设计

### 5.1 安装页

页面文件：`src/pages/Setup/index.tsx`

功能：

- 展示环境检查、管理员账号、基础配置、完成安装步骤。
- 校验 OSS 配置。
- 校验火山视频接口配置。
- 校验火山素材资产库 AK/SK。
- 查询或创建火山素材组。
- 提交初始化配置。

### 5.2 登录页

页面文件：`src/pages/Login/index.tsx`

功能：

- 输入用户名和密码。
- 调用登录接口。
- 登录成功后根据权限进入默认页面。
- 登录失败展示错误提示。

### 5.3 项目管理页

页面文件：`src/pages/Projects/index.tsx`

功能：

- 查询项目列表。
- 创建项目。
- 编辑项目名称、说明、封面素材。
- 归档项目。
- 维护项目成员和项目角色。

### 5.4 用户管理页

页面文件：`src/pages/Users/index.tsx`

功能：

- 查询用户列表。
- 按状态筛选。
- 创建用户。
- 更新用户角色、菜单权限、状态、密码。
- 维护用户项目授权。

### 5.5 素材管理页

页面文件：`src/pages/Assets/index.tsx`

相关组件：

- `UploadModal.tsx`：素材上传弹窗。
- `CategoryManagerModal.tsx`：素材组管理弹窗。
- `AssetCard.tsx`：素材卡片。

功能：

- 查询素材列表。
- 按素材类型、状态、关键词、素材组筛选。
- 创建素材组。
- 上传素材。
- 编辑素材同步模式。
- 删除素材或解除项目关联。
- 展示素材火山同步状态。
- 管理素材预览。

### 5.6 视频生成页

页面文件：`src/pages/Videos/index.tsx`

相关组件：

- `GeneratePanel.tsx`：视频生成表单。
- `PromptInput.tsx`：提示词输入。
- `AssetPickerModal.tsx`：素材选择器。
- `TaskCard.tsx`：任务卡片。
- `AssetMediaPreview.tsx`：素材预览。

功能：

- 选择生成模式、模型、比例、分辨率、时长。
- 输入提示词。
- 选择图片、视频、音频素材。
- 提交视频任务。
- 查看任务列表、状态和结果。
- 支持任务回放草稿。

### 5.7 视频统计页

页面文件：`src/pages/Analytics/index.tsx`

功能：

- 展示请求总数、成功率、平均耗时、token 消耗等概览。
- 展示状态分布、模型分布、用户 token 分布。
- 支持按时间、模型、状态筛选。

### 5.8 系统配置页

页面文件：`src/pages/Config/index.tsx`

功能：

- 查询运行态配置。
- 保存系统名称、OSS、火山接口、默认素材组等配置。
- 查询火山素材组。
- 创建火山素材组。
- 校验配置格式。

## 6. 接口封装设计

前端接口封装位于 `src/api/`：

| 文件 | 说明 |
| --- | --- |
| `auth.ts` | 登录、退出、会话、改密 |
| `setup.ts` | 安装状态、初始化、配置校验 |
| `projects.ts` | 项目和项目成员 |
| `users.ts` | 用户管理 |
| `asset-categories.ts` | 素材组管理 |
| `assets.ts` | 素材管理和上传凭证 |
| `videos.ts` | 视频任务和统计 |
| `config.ts` | 系统配置和公开品牌 |

页面不得直接调用 axios，应通过上述模块调用接口。

## 7. 交互状态设计

页面应至少处理以下状态：

- 加载中。
- 空数据。
- 请求失败。
- 提交中。
- 操作成功。
- 权限不足。
- 当前项目缺失。

## 8. 安全设计

- token 由登录状态统一管理。
- 请求封装统一注入 token 和当前项目 ID。
- 前端不展示 OSS 私有桶原始地址。
- 预览地址使用后端签名 URL。
- 管理员页面在路由层和后端接口层双重限制。
