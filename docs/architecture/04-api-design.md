# Narrix API 接口设计说明书

| 项目 | 说明 |
| --- | --- |
| 文档编号 | NARRIX-API-04 |
| 文档版本 | V1.0 |
| 适用系统 | Narrix 自部署交付版本 |
| 编制依据 | `backend/src/routes/*`、`backend/src/schemas/*`、`frontend/src/api/*` |

## 1. 通用约定

### 1.1 基础路径

后端接口以 `/api` 为业务接口前缀，健康检查接口为 `/health`。

### 1.2 认证方式

除安装接口、登录接口、公开品牌接口、健康检查接口外，其余接口需要登录认证。

```text
Authorization: Bearer <token>
```

### 1.3 项目上下文

素材组、素材、视频任务等项目内业务接口需要项目上下文。

```text
X-Project-Id: <projectId>
```

### 1.4 响应格式

接口返回由后端工具方法统一组装。前端 `src/api/*` 直接读取响应体中的业务数据。

错误由全局错误处理中间件统一返回，参数校验失败时返回校验错误信息。

## 2. 健康检查接口

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/health` | 否 | 返回服务状态和当前时间 |

响应数据：

```json
{
  "code": 0,
  "data": {
    "status": "ok",
    "timestamp": "2026-06-15T00:00:00.000Z"
  },
  "message": "ok"
}
```

## 3. 安装接口

### 3.1 获取安装状态

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/setup/status` | 否 | 获取系统是否完成初始化、运行环境和健康状态 |

响应字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `initialized` | boolean | 是否已初始化 |
| `environment` | string | 运行环境 |
| `version` | string | 系统版本 |
| `installMode` | string | 安装模式，当前为 `self_hosted` |
| `initializedAt` | string/null | 初始化完成时间 |
| `health.database` | boolean | 数据库健康状态 |
| `health.redis` | boolean | Redis 健康状态 |
| `branding.systemName` | string/null | 系统名称 |

### 3.2 完成初始化

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/setup/initialize` | 否 | 创建管理员并保存基础配置 |

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `admin.username` | string | 是 | 管理员用户名 |
| `admin.password` | string | 是 | 管理员密码，至少 8 位 |
| `config.systemName` | string | 是 | 系统显示名称 |
| `config.arkApiKey` | string | 是 | 火山视频 Bearer Token |
| `config.arkAccessKey` | string | 是 | 火山素材资产库 Access Key |
| `config.arkSecretKey` | string | 是 | 火山素材资产库 Secret Key |
| `config.arkEndpoint` | string | 是 | 火山视频接口 Endpoint |
| `config.arkDefaultGroupId` | string | 是 | 默认火山素材组 ID |
| `config.arkDefaultSyncEnabled` | boolean | 是 | 默认是否同步火山 |
| `config.ossAccessKeyId` | string | 是 | OSS Access Key ID |
| `config.ossAccessKeySecret` | string | 是 | OSS Access Key Secret |
| `config.ossStsRoleArn` | string | 是 | OSS STS Role ARN |
| `config.ossBucket` | string | 是 | OSS Bucket |
| `config.ossRegion` | string | 是 | OSS Region |
| `config.ossSignedUrlTtl` | number | 是 | 签名 URL 有效期，单位秒 |

### 3.3 配置校验接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/setup/validate/oss` | 校验 OSS 配置 |
| POST | `/api/setup/validate/ark-bearer` | 校验火山视频接口配置 |
| POST | `/api/setup/validate/ark-aksk` | 校验火山素材资产库 AK/SK |
| POST | `/api/setup/ark/asset-groups/list` | 查询火山素材组 |
| POST | `/api/setup/ark/asset-groups` | 创建火山素材组 |

火山素材组创建请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `accessKey` | string | 是 | Access Key |
| `secretKey` | string | 是 | Secret Key |
| `name` | string | 是 | 素材组名称，最长 64 |
| `description` | string | 否 | 素材组说明，最长 255 |

## 4. 认证接口

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | 否 | 登录 |
| POST | `/api/auth/logout` | 是 | 退出登录 |
| GET | `/api/auth/session` | 是 | 获取当前会话 |
| PATCH | `/api/auth/password` | 是 | 修改密码 |

登录请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `username` | string | 是 | 用户名 |
| `password` | string | 是 | 密码 |

登录响应：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `token` | string | 登录 token |
| `user` | object | 当前用户 |
| `projects` | array | 可访问项目列表 |
| `activeProjectId` | number/null | 当前项目 ID |

修改密码请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `currentPassword` | string | 是 | 当前密码 |
| `newPassword` | string | 是 | 新密码，至少 8 位 |

## 5. 项目接口

项目接口均需要登录和管理员权限。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects` | 查询项目列表 |
| GET | `/api/projects/:id` | 查询项目详情 |
| POST | `/api/projects` | 创建项目 |
| PATCH | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 归档项目 |
| GET | `/api/projects/:id/members` | 查询项目成员 |
| PUT | `/api/projects/:id/members` | 替换项目成员 |

创建项目请求体：

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `name` | string | 是 | 1-128 字符 |
| `description` | string/null | 否 | 最长 1000 字符 |
| `coverAssetId` | number/null | 否 | 正整数或 null |

替换项目成员请求体：

```json
{
  "members": [
    { "userId": 1, "projectRole": "manager" }
  ]
}
```

`projectRole` 可选值：`manager`、`member`、`viewer`。

## 6. 用户接口

用户接口均需要登录和管理员权限。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/users` | 分页查询用户 |
| POST | `/api/users` | 创建用户 |
| PATCH | `/api/users/:id` | 更新用户 |
| DELETE | `/api/users/:id` | 删除用户 |

查询参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `page` | number | 1 | 页码 |
| `pageSize` | number | 10 | 每页数量，最大 100 |
| `status` | 0/1 | 无 | 用户状态 |

创建用户请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `username` | string | 是 | 3-64 字符 |
| `password` | string | 是 | 8-128 字符 |
| `role` | string | 是 | `admin` 或 `user` |
| `menuPerms` | string[] | 否 | 菜单权限 |
| `projects` | array | 否 | 项目授权列表 |

## 7. 素材组接口

素材组接口需要登录和项目上下文，创建、更新、删除需要管理员权限。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/asset-categories` | 查询当前项目素材组 |
| POST | `/api/asset-categories` | 创建素材组 |
| PATCH | `/api/asset-categories/:id` | 更新素材组 |
| DELETE | `/api/asset-categories/:id` | 删除素材组 |
| POST | `/api/assets/sts-token` | 获取素材上传临时凭证 |

创建素材组请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 1-64 字符 |
| `sortOrder` | number | 否 | 0-32767，默认 0 |
| `syncEnabled` | boolean | 否 | 是否同步火山 |

删除素材组请求体或 query：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `targetCategoryId` | number/null | 否 | 删除后素材迁移目标，null 表示未分类 |

## 8. 素材接口

素材接口需要登录和项目上下文。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/assets` | 查询素材列表 |
| GET | `/api/assets/name-available` | 检查素材名称是否可用 |
| GET | `/api/assets/:id` | 查询素材详情 |
| POST | `/api/assets` | 创建素材记录 |
| PATCH | `/api/assets/:id` | 更新素材 |
| DELETE | `/api/assets/:id` | 删除素材或解除项目关联 |
| POST | `/api/assets/:id/projects` | 关联素材到项目，需管理员权限 |
| DELETE | `/api/assets/:id/projects/:projectId` | 解除素材项目关联，需管理员权限 |
| POST | `/api/assets/sync` | 手动触发素材同步，需管理员权限 |

创建素材请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `projectId` | number | 否 | 项目 ID，默认使用请求头项目 |
| `name` | string | 是 | 1-128 字符 |
| `assetType` | string | 是 | `Image`、`Video`、`Audio` |
| `categoryId` | number/null | 否 | 素材组 ID |
| `syncMode` | string | 否 | `inherit`、`enabled`、`disabled` |
| `ossKey` | string | 是 | OSS 对象 key |
| `tags` | string[] | 否 | 标签 |
| `linkProjectIds` | number[] | 否 | 关联项目 ID 列表 |

查询素材参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `scope` | `project`/`global` | 查询范围 |
| `status` | string | 素材状态 |
| `keyword` | string | 关键词 |
| `uploader` | string | 上传人 |
| `assetType` | string | 素材类型 |
| `categoryId` | number | 素材组 |
| `page` | number | 页码 |
| `pageSize` | number | 每页数量 |

## 9. 视频接口

视频接口需要登录和项目上下文。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/videos` | 创建视频任务 |
| GET | `/api/videos` | 查询视频任务列表 |
| GET | `/api/videos/analytics` | 查询视频统计 |
| GET | `/api/videos/:id` | 查询视频任务详情 |
| POST | `/api/videos/:id/sync` | 手动同步任务状态 |

创建视频任务请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `mode` | string | 是 | `frames` 或 `omni` |
| `model` | string | 是 | 模型名称，最长 64 |
| `prompt` | string | 是 | 提示词，最长 2000 |
| `promptRaw` | string | 是 | 原始提示词，最长 2000 |
| `duration` | number | 是 | 4-15 秒 |
| `ratio` | string | 是 | 画面比例，最长 16 |
| `resolution` | string | 是 | 分辨率，最长 8 |
| `generateAudio` | boolean | 否 | 是否生成音频，默认 true |
| `content` | array | 是 | 内容数组，1-16 项 |

content 支持类型：

| 类型 | 字段 | 说明 |
| --- | --- | --- |
| `text` | `text` | 文本内容 |
| `image_url` | `image_url.url`、`assetId`、`role` | 图片素材 |
| `video_url` | `video_url.url`、`assetId`、`role` | 视频素材 |
| `audio_url` | `audio_url.url`、`assetId`、`role` | 音频素材 |

`frames` 模式不支持音频或视频素材，也不支持 `reference_image` 图片角色。

视频查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `mine` | boolean | 仅看本人任务 |
| `status` | string | `pending`、`processing`、`succeeded`、`failed` |
| `mode` | string | `frames` 或 `omni` |
| `q` | string | 关键词 |
| `dateFrom` | datetime | 开始时间 |
| `dateTo` | datetime | 结束时间 |
| `page` | number | 页码 |
| `pageSize` | number | 每页数量 |

## 10. 配置接口

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/config/branding` | 否 | 获取公开品牌配置 |
| GET | `/api/config` | 管理员 | 查询配置项 |
| PUT | `/api/config` | 管理员 | 更新配置项 |
| POST | `/api/config/ark/asset-groups/list` | 管理员 | 查询火山素材组 |
| POST | `/api/config/ark/asset-groups` | 管理员 | 创建火山素材组 |

更新配置请求体：

```json
{
  "items": [
    { "key": "system_name", "value": "Narrix" }
  ]
}
```

特殊校验：

- `ark_default_group_id` 必须符合 `group-xxx-xxx` 格式。
- `ark_default_sync_enabled` 只能为字符串 `true` 或 `false`。
- `ark_project_name_mode` 只能为 `project_code` 或 `default_value`。
