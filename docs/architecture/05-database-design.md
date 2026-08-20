# Narrix 数据库设计说明书

| 项目 | 说明 |
| --- | --- |
| 文档编号 | NARRIX-DB-05 |
| 文档版本 | V1.0 |
| 数据库 | PostgreSQL |
| 编制依据 | `backend/src/db/kysely.ts`、`backend/src/db/migrations/*` |

## 1. 数据库概述

Narrix 使用 PostgreSQL 存储用户、系统配置、项目、项目成员、素材组、素材、视频任务和任务素材关系。后端使用 Kysely 访问数据库，迁移文件位于 `backend/src/db/migrations/`。

## 2. 表关系概览

```text
users 1 --- n assets
users 1 --- n video_tasks
users 1 --- n project_members
projects 1 --- n project_members
projects 1 --- n asset_categories
projects 1 --- n project_assets
projects 1 --- n video_tasks
asset_categories 1 --- n assets
assets 1 --- n project_assets
video_tasks 1 --- n video_task_assets
assets 1 --- n video_task_assets
system_config 独立保存系统配置
```

## 3. users 用户表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | bigserial | 主键 | 用户 ID |
| `username` | varchar(64) | 非空，唯一 | 登录名 |
| `password_hash` | varchar(128) | 非空 | 密码哈希 |
| `role` | varchar(16) | 非空，默认 `user` | 角色，`admin` 或 `user` |
| `menu_perms` | jsonb | 非空，默认 `[]` | 菜单权限 |
| `status` | smallint | 非空，默认 1 | 用户状态 |
| `created_at` | timestamptz | 非空 | 创建时间 |
| `updated_at` | timestamptz | 非空 | 更新时间 |

## 4. system_config 系统配置表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `key` | varchar(64) | 主键 | 配置键 |
| `value` | text | 非空 | 配置值 |
| `is_secret` | boolean | 非空，默认 false | 是否敏感配置 |
| `description` | varchar(256) | 可空 | 配置说明 |
| `created_at` | timestamptz | 非空 | 创建时间 |
| `updated_at` | timestamptz | 非空 | 更新时间 |

主要配置项：

| key | 说明 | 是否敏感 |
| --- | --- | --- |
| `ark_api_key` | 火山视频 Bearer Token | 是 |
| `ark_access_key` | 火山素材资产库 Access Key | 是 |
| `ark_secret_key` | 火山素材资产库 Secret Key | 是 |
| `ark_endpoint` | 火山视频接口地址 | 否 |
| `ark_default_group_id` | 默认素材组 ID | 否 |
| `ark_default_sync_enabled` | 默认同步策略 | 否 |
| `ark_project_name_mode` | 火山 ProjectName 来源 | 否 |
| `ark_project_name_default_value` | 火山 ProjectName 默认值 | 否 |
| `oss_access_key_id` | OSS Access Key ID | 是 |
| `oss_access_key_secret` | OSS Access Key Secret | 是 |
| `oss_sts_role_arn` | OSS STS Role ARN | 否 |
| `oss_bucket` | OSS Bucket | 否 |
| `oss_region` | OSS 区域 | 否 |
| `oss_signed_url_ttl` | 签名 URL 有效期 | 否 |
| `system_initialized` | 是否已初始化 | 否 |
| `system_initialized_at` | 初始化时间 | 否 |
| `system_version` | 系统版本 | 否 |
| `system_install_mode` | 安装模式 | 否 |
| `system_name` | 系统名称 | 否 |
| `system_logo_key` | 系统 Logo OSS Key | 否 |

## 5. projects 项目表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | bigserial | 主键 | 项目 ID |
| `name` | varchar(128) | 非空 | 项目名称 |
| `code` | varchar(64) | 非空，唯一 | 项目编码 |
| `status` | varchar(16) | 非空，默认 `active` | 状态，`active` 或 `archived` |
| `description` | text | 可空 | 项目说明 |
| `cover_asset_id` | bigint | 外键，可空 | 封面素材 |
| `created_by` | bigint | 外键，可空 | 创建人 |
| `created_at` | timestamptz | 非空 | 创建时间 |
| `updated_at` | timestamptz | 非空 | 更新时间 |

## 6. project_members 项目成员表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | bigserial | 主键 | 记录 ID |
| `project_id` | bigint | 外键，非空 | 项目 ID |
| `user_id` | bigint | 外键，非空 | 用户 ID |
| `project_role` | varchar(16) | 非空，默认 `member` | 项目角色 |
| `status` | varchar(16) | 非空，默认 `active` | 成员状态 |
| `created_by` | bigint | 外键，可空 | 创建人 |
| `created_at` | timestamptz | 非空 | 创建时间 |
| `updated_at` | timestamptz | 非空 | 更新时间 |

索引：

| 索引 | 字段 | 说明 |
| --- | --- | --- |
| `idx_project_members_project_user` | `project_id,user_id` | 唯一，避免重复授权 |
| `idx_project_members_user_id` | `user_id` | 按用户查询项目 |

## 7. asset_categories 素材组表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | bigserial | 主键 | 素材组 ID |
| `project_id` | bigint | 外键，非空 | 所属项目 |
| `name` | varchar(64) | 非空 | 素材组名称 |
| `sort_order` | smallint | 非空，默认 0 | 排序 |
| `sync_enabled` | boolean | 非空，默认 false | 是否同步火山 |
| `ark_group_id` | varchar(128) | 可空 | 火山素材组 ID |
| `created_at` | timestamptz | 非空 | 创建时间 |
| `updated_at` | timestamptz | 非空 | 更新时间 |

索引：

| 索引 | 字段 | 说明 |
| --- | --- | --- |
| `idx_asset_categories_project_id` | `project_id` | 按项目查询 |
| `idx_asset_categories_project_name` | `project_id,name` | 同项目名称唯一 |
| `idx_asset_categories_project_id_id` | `project_id,id` | 项目内外键约束辅助 |

## 8. assets 素材表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | bigserial | 主键 | 素材 ID |
| `user_id` | bigint | 外键，非空 | 上传用户 |
| `created_by_user_id` | bigint | 外键，非空 | 创建用户 |
| `source_project_id` | bigint | 外键，可空 | 来源项目 |
| `name` | varchar(128) | 非空 | 素材名称 |
| `asset_type` | varchar(16) | 非空 | `Image`、`Video`、`Audio` |
| `category_id` | bigint | 外键，可空 | 素材组 ID |
| `sync_mode` | varchar(16) | 非空，默认 `inherit` | 同步模式 |
| `oss_key` | varchar(512) | 非空 | OSS 对象 key |
| `ark_group_id` | varchar(128) | 可空 | 火山素材组 ID |
| `ark_asset_id` | varchar(128) | 可空 | 火山素材 ID |
| `ark_status` | varchar(32) | 非空，默认 `pending` | 火山同步状态 |
| `ark_error` | text | 可空 | 同步错误 |
| `tags` | jsonb | 非空，默认 `[]` | 标签 |
| `created_at` | timestamptz | 非空 | 创建时间 |
| `updated_at` | timestamptz | 非空 | 更新时间 |

索引：

| 索引 | 字段 | 说明 |
| --- | --- | --- |
| `idx_assets_user_id` | `user_id` | 按上传人查询 |
| `idx_assets_ark_status` | `ark_status` | 按同步状态查询 |
| `idx_assets_ark_asset_id` | `ark_asset_id` | 按火山素材 ID 查询 |
| `idx_assets_category_id` | `category_id` | 按素材组查询 |
| `idx_assets_created_by_user_id` | `created_by_user_id` | 按创建人查询 |
| `idx_assets_source_project_id` | `source_project_id` | 按来源项目查询 |

## 9. project_assets 项目素材关系表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | bigserial | 主键 | 记录 ID |
| `project_id` | bigint | 外键，非空 | 项目 ID |
| `asset_id` | bigint | 外键，非空 | 素材 ID |
| `category_id` | bigint | 外键，可空 | 项目内素材组 ID |
| `relation_type` | varchar(16) | 非空，默认 `linked` | `primary` 或 `linked` |
| `created_by` | bigint | 外键，可空 | 创建人 |
| `created_at` | timestamptz | 非空 | 创建时间 |

索引：

| 索引 | 字段 | 说明 |
| --- | --- | --- |
| `idx_project_assets_project_asset` | `project_id,asset_id` | 唯一，避免重复关联 |
| `idx_project_assets_asset_id` | `asset_id` | 查询素材关联项目 |

## 10. video_tasks 视频任务表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | bigserial | 主键 | 任务 ID |
| `user_id` | bigint | 外键，非空 | 创建用户 |
| `project_id` | bigint | 外键，非空 | 所属项目 |
| `ark_task_id` | varchar(128) | 可空 | 火山任务 ID |
| `idempotency_key` | varchar(128) | 非空，唯一 | 幂等键 |
| `status` | varchar(32) | 非空，默认 `pending` | 任务状态 |
| `model` | varchar(64) | 非空 | 模型 |
| `prompt` | text | 可空 | 提示词 |
| `prompt_raw` | text | 可空 | 原始提示词 |
| `duration` | smallint | 可空 | 时长 |
| `ratio` | varchar(16) | 可空 | 比例 |
| `resolution` | varchar(8) | 可空 | 分辨率 |
| `generate_audio` | boolean | 非空，默认 true | 是否生成音频 |
| `request_snapshot` | jsonb | 非空，默认 `{}` | 请求快照 |
| `ark_video_url` | text | 可空 | 火山返回视频 URL |
| `video_oss_key` | text | 可空 | 结果视频 OSS key |
| `completion_tokens` | integer | 可空 | 输出 token |
| `total_tokens` | integer | 可空 | 总 token |
| `error_message` | text | 可空 | 错误信息 |
| `next_poll_at` | timestamptz | 可空 | 下次轮询时间 |
| `last_ark_status` | varchar(64) | 可空 | 最近火山状态 |
| `last_ark_status_changed_at` | timestamptz | 可空 | 火山状态变化时间 |
| `last_polled_at` | timestamptz | 可空 | 最近轮询时间 |
| `created_at` | timestamptz | 非空 | 创建时间 |
| `updated_at` | timestamptz | 非空 | 更新时间 |

索引：

| 索引 | 字段 | 说明 |
| --- | --- | --- |
| `idx_video_tasks_user_id` | `user_id` | 按用户查询 |
| `idx_video_tasks_status` | `status` | 按状态查询 |
| `idx_video_tasks_ark_task_id` | `ark_task_id` | 按外部任务 ID 查询 |
| `idx_video_tasks_project_id` | `project_id` | 按项目查询 |
| `idx_video_tasks_next_poll_at` | `next_poll_at` | worker 轮询调度 |

## 11. video_task_assets 视频任务素材关系表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | bigserial | 主键 | 记录 ID |
| `video_task_id` | bigint | 外键，非空 | 视频任务 ID |
| `asset_id` | bigint | 外键，非空 | 素材 ID |
| `role` | varchar(32) | 非空 | 素材角色 |
| `created_at` | timestamptz | 非空 | 创建时间 |

索引：

| 索引 | 字段 | 说明 |
| --- | --- | --- |
| `idx_video_task_assets_task_asset_role` | `video_task_id,asset_id,role` | 唯一，避免重复关联 |

素材角色可选：`first_frame`、`last_frame`、`reference_image`、`reference_video`、`reference_audio`。

## 12. 序列

| 序列 | 说明 |
| --- | --- |
| `project_code_global_seq` | 项目编码全局递增序列，用于生成 `PRJ-YYYYMM-000001` 格式编码 |

## 13. 设计注意事项

- 项目数据隔离主要依赖 `project_id` 和关系表。
- 素材表保存全局素材实体，`project_assets` 保存项目可见关系。
- 任务素材关系通过 `video_task_assets` 固化，便于任务回放和审计。
- 系统配置中的敏感项应在服务层做加密或脱敏处理。
- 删除素材组时需处理素材迁移，避免素材引用断裂。
