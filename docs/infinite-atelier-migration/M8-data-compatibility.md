# Infinite Atelier 迁移整合 M8 数据兼容方案

## 当前策略

- 运行时只创建和读取主项目数据库中的新 `atelier_*` 记录，以及主项目既有 `assets` / `project_assets` 记录。
- 不自动导入 `Narrix-Infinite-Atelier` 的用户、登录、项目成员或旧资产数据。
- 主项目用户 ID、项目 ID 直接使用 BIGINT 外键，不建立影子用户或影子项目。

## 只读映射方案（未来显式导入时使用）

| 源字段 | 主项目字段 | 规则 |
|---|---|---|
| source user id | `users.id` | 仅允许通过人工确认的外部映射表匹配；不按名称自动匹配 |
| source project id | `projects.id` | 仅允许人工确认的外部映射表匹配；项目不存在则拒绝导入 |
| source canvas id | `atelier_canvases.client_stable_id` | 以 `source:{sourceProjectId}:{sourceCanvasId}` 作为幂等键 |
| source prompt id | `atelier_prompts.client_stable_id` | 以 `source:{sourceProjectId}:{sourcePromptId}` 作为幂等键 |
| source asset id | `assets` + `atelier_storage_objects` | 不覆盖同名记录；对象 Key 必须重新生成项目隔离前缀 |

未来导入脚本必须先执行 dry-run，输出冲突和缺失映射；正式执行需在事务中写入，失败回滚，且不得删除或更新主项目存量用户、项目和资产。

## 回滚

当前迁移的 `down` 仅删除本次新增 `atelier_*` 对象，并依据 `atelier_migration_metadata` 保留迁移前已存在的 `assets.prompt_content` 列及其数据。未执行任何源项目数据导入。
