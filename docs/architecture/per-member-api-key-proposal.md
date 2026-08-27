# 成员独立 API Key — 按人统计 Token 消耗方案

## 1. 背景与痛点

### 当前架构

```text
用户发起视频生成
  → 后端从 video_providers 表取默认平台的 api_key（全局共享）
  → worker 用全局 Key 调 ToAPIs 创建任务
  → 平台返回成功（但不返回 token 用量）
  → 所有用户的消耗混在一个 Key 下，无法按人拆分
```

### 痛点

- ToAPIs 中转平台接口**不返回单任务 Token 消耗数据**
- 所有成员共用一个系统级 API Key，ToAPIs 后台只能看到**总用量**，无法按成员拆分
- 财务核算、成员配额管理、异常用量追踪均无法实现

### 解决思路

ToAPIs 后台支持**按 API Key 查看用量统计**。如果每个成员使用独立的 API Key 发起生成请求，就能在 ToAPIs 后台按 Key 拆分用量。因此：

> **给每个成员配一把独立的 ToAPIs API Key，生成视频时优先使用成员个人 Key。**

## 2. 整体设计

### 2.1 双模式架构

```text
┌─────────────────────────────────────────────────────┐
│                   管理员切换开关                       │
│            system_config.api_key_mode                │
│                                                     │
│    ┌─────────────────┐     ┌─────────────────────┐  │
│    │  global（默认）   │     │  per_member        │  │
│    │  使用全局 Key     │     │  使用成员个人 Key    │  │
│    │  无回退需求       │     │  无个人 Key 回退全局  │  │
│    └─────────────────┘     └─────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

| 模式 | 行为 | 适用场景 |
| --- | --- | --- |
| `global`（当前默认） | 所有视频生成使用 `video_providers.api_key` | 无需按人统计、快速上线 |
| `per_member` | 优先用成员个人 API Key，未配置则**拒绝生成并提示** | 需要按人统计 Token 消耗 |

### 2.2 Key 解析优先级（per_member 模式）

```text
用户发起视频生成
  │
  ▼
检查 system_config.api_key_mode
  │
  ├── global → 使用 video_providers 表的全局 Key
  │
  └── per_member
        │
        ▼
      查询 user_api_keys 表（user_id + provider_key）
        │
        ├── 有个人 Key → 解密 → 使用个人 Key 创建任务
        │
        └── 无个人 Key → 返回 422：「您尚未配置个人 API Key，
                         请联系管理员在用户管理中配置，
                         或切换回全局模式」
```

### 2.3 任务存储与轮询

创建任务时，`video_tasks` 表**不存储实际 Key**（安全考虑），只存储 `provider_snapshot`（平台信息）和 `user_id`。轮询时通过 `user_id + provider_key` 重新解析 Key：

```text
轮询任务状态
  │
  ▼
从 video_tasks 取 user_id + provider_snapshot.providerKey
  │
  ▼
按当前 api_key_mode 解析 Key
  │
  ├── global → video_providers 表全局 Key
  │
  └── per_member → user_api_keys 表个人 Key（若无则回退全局，保证已创建任务可轮询）
```

> **关键设计**：任务创建后即使切换模式或删除个人 Key，轮询仍可通过回退全局 Key 完成，不会导致已提交任务卡死。

## 3. 数据库变更

### 3.1 新增表：`user_api_keys`

```sql
CREATE TABLE user_api_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_key VARCHAR(64) NOT NULL,
  api_key_encrypted VARCHAR(512) NOT NULL,   -- AES-256-GCM 加密存储
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_key)
);
```

- `api_key_encrypted`：使用现有 `CONFIG_ENCRYPTION_KEY` 加密（复用 `ConfigService.encryptSecret` / `decryptSecret`）
- 一个用户在一个平台下只能有一把 Key（UNIQUE 约束）
- 用户删除时级联清理

### 3.2 新增配置项：`system_config`

```sql
INSERT INTO system_config (key, value, is_secret, description) VALUES
  ('api_key_mode', 'global', false, 'API Key 模式：global=全局共享 / per_member=成员独立');
```

### 3.3 迁移文件

```text
backend/src/db/migrations/20260821000000_create_user_api_keys.ts
```

## 4. 后端接口设计

### 4.1 用户 API Key 管理（管理员操作）

| 端点 | 方法 | 权限 | 说明 |
| --- | --- | --- | --- |
| `/api/users/:id/api-keys` | GET | admin | 列出用户的所有平台 Key（脱敏） |
| `/api/users/:id/api-keys` | PUT | admin | 批量设置用户的平台 Key（覆盖式） |
| `/api/users/:id/api-keys/:providerKey` | DELETE | admin | 删除用户某平台的 Key |

**GET 响应示例**：

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "providerKey": "toapis",
        "providerName": "ToAPIs",
        "apiKeyMasked": "sk-uzD****...Wxm",
        "enabled": true,
        "updatedAt": "2026-08-21T10:00:00Z"
      }
    ]
  }
}
```

**PUT 请求示例**：

```json
{
  "keys": [
    { "providerKey": "toapis", "apiKey": "sk-uzDBr全新Keyxxxxx" }
  ]
}
```

### 4.2 当前用户查看自己的 Key

| 端点 | 方法 | 权限 | 说明 |
| --- | --- | --- | --- |
| `/api/me/api-keys` | GET | 已登录 | 查看自己的 Key（脱敏，确认是否已配置） |

### 4.3 模式切换

| 端点 | 方法 | 权限 | 说明 |
| --- | --- | --- | --- |
| `/api/config/api-key-mode` | GET | 已登录 | 查看当前模式（前端用于决定是否提示用户配置 Key） |
| `/api/config/api-key-mode` | PUT | admin | 切换模式 `global` / `per_member` |

### 4.4 Zod 校验

```typescript
// schemas/user-api-keys.schema.ts
const upsertUserApiKeysSchema = z.object({
  keys: z.array(z.object({
    providerKey: z.string().trim().min(1).max(64),
    apiKey: z.string().trim().min(1).max(256),
  })).min(1).max(10),
})

const apiKeyModeSchema = z.object({
  mode: z.enum(['global', 'per_member']),
})
```

## 5. 核心代码变更点

### 5.1 新增 Service：`UserApiKeyService`

```text
backend/src/services/user-api-key.service.ts
```

职责：
- `getByUser(userId, providerKey)` → 解密返回明文 Key
- `getMaskedByUser(userId)` → 脱敏列表
- `upsert(userId, keys[])` → 加密写入
- `delete(userId, providerKey)` → 删除
- `resolveApiKey(userId, providerKey, mode)` → 按模式解析最终 Key

### 5.2 修改 `VideoProviderService.getClientConfiguration`

```text
当前：
  getClientConfiguration(snapshot) → { endpoint, apiKey }
  apiKey 来自 video_providers 表

改后：
  getClientConfiguration(snapshot, userId?) → { endpoint, apiKey }
  - 若 userId 存在且 mode=per_member：
    查 user_api_keys 表 → 有则用个人 Key
    无则抛 ValidationAppError（创建时）或回退全局（轮询时）
  - 否则用全局 Key
```

### 5.3 修改 `video.worker.ts` 的 `resolveClient`

```text
当前：
  resolveClient(task) →
    providerService.getClientConfiguration(task.providerSnapshot)
    → new ArkBearerClient({ getApiKey: () => connection.apiKey })

改后：
  resolveClient(task) →
    providerService.getClientConfiguration(task.providerSnapshot, task.userId)
    → new ArkBearerClient({ getApiKey: () => connection.apiKey })
```

只需在调用时传入 `task.userId`，`getClientConfiguration` 内部按模式解析。

### 5.4 修改 `VideoService.createVideoTask`

创建任务前检查 Key 可用性：

```typescript
if (mode === 'per_member') {
  const userKey = await userApiKeyService.getByUser(userId, providerKey)
  if (!userKey) {
    throw new ValidationAppError('当前为成员独立 Key 模式，您尚未配置个人 API Key，请联系管理员配置')
  }
}
```

### 5.5 新增 Controller + Route

```text
backend/src/controllers/user-api-keys.controller.ts
backend/src/routes/user-api-keys.routes.ts
```

挂载到 `app.ts`：
- `/api/users/:id/api-keys` → 复用 users 路由前缀
- `/api/me/api-keys` → 独立路由
- `/api/config/api-key-mode` → 复用 config 路由前缀

## 6. 前端变更

### 6.1 用户管理页新增 API Key 配置

在 `pages/Users/index.tsx` 的用户列表操作中，每行增加 **「API Key」按钮**，点击弹出抽屉/弹窗：

```text
┌─────────────────────────────────────────────────┐
│  用户 API Key 配置 - 苏名扬                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  ToAPIs API Key                                 │
│  ┌───────────────────────────────┬──────────┐   │
│  │ sk-uzD****...Wxm（已配置）    │ 修改     │   │
│  └───────────────────────────────┴──────────┘   │
│                                                 │
│  [保存]                          [取消]          │
│                                                 │
│  说明：                                         │
│  · Key 加密存储，管理员设置后用户无法查看明文    │
│  · 当系统切换为「成员独立 Key」模式后生效       │
│  · 在 ToAPIs 后台可按此 Key 查看 Token 用量    │
└─────────────────────────────────────────────────┘
```

### 6.2 系统配置页新增模式切换

在 `pages/Config/index.tsx` 新增一个配置区块：

```text
┌─────────────────────────────────────────────────┐
│  API Key 模式                                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ○ 全局共享 Key（默认）                          │
│    所有用户使用系统统一 Key，无法按人统计用量     │
│                                                 │
│  ○ 成员独立 Key                                  │
│    每个成员使用独立 API Key，可在 ToAPIs 后台    │
│    按 Key 查看 Token 消耗。未配置个人 Key 的     │
│    用户将无法生成视频。                          │
│                                                 │
│                          [切换模式]             │
└─────────────────────────────────────────────────┘
```

### 6.3 视频生成页提示

当 `api_key_mode = per_member` 且当前用户未配置个人 Key 时，生成面板顶部显示 Alert：

```text
⚠ 您尚未配置个人 API Key，当前无法生成视频。
请联系管理员在「用户管理」中为您配置 ToAPIs API Key。
```

### 6.4 前端 API 层

```text
frontend/src/api/user-api-keys.ts   # 新增
```

## 7. 安全设计

| 风险 | 措施 |
| --- | --- |
| 个人 Key 泄露 | AES-256-GCM 加密存储（复用 CONFIG_ENCRYPTION_KEY） |
| 接口返回明文 | 所有 GET 接口只返回脱敏值（`sk-uzD****...Wxm`） |
| 用户自行查看他人 Key | 仅 admin 可查看/设置其他用户的 Key |
| 轮询时 Key 失效 | 回退全局 Key（保证已创建任务可完成轮询） |
| 日志泄露 | Key 不写入任何日志、不存入 video_tasks 表 |

## 8. 改动清单

### 后端

| 文件 | 操作 | 说明 |
| --- | --- | --- |
| `db/migrations/20260821000000_create_user_api_keys.ts` | 新增 | 建表 + 种子配置项 |
| `db/kysely.ts` | 修改 | 新增 UserApiKeysTable 类型 |
| `services/user-api-key.service.ts` | 新增 | Key CRUD + 加解密 + 解析 |
| `services/video-provider.service.ts` | 修改 | `getClientConfiguration` 增加 userId 参数 |
| `services/video.service.ts` | 修改 | 创建任务前检查个人 Key |
| `workers/video.worker.ts` | 修改 | `resolveClient` 传入 `task.userId` |
| `controllers/user-api-keys.controller.ts` | 新增 | |
| `routes/user-api-keys.routes.ts` | 新增 | |
| `routes/users.routes.ts` | 修改 | 挂载子路由 |
| `routes/config.routes.ts` | 修改 | 新增 api-key-mode 端点 |
| `schemas/user-api-keys.schema.ts` | 新增 | Zod 校验 |
| `app.ts` | 修改 | 注册新路由 |

### 前端

| 文件 | 操作 | 说明 |
| --- | --- | --- |
| `api/user-api-keys.ts` | 新增 | API 请求层 |
| `api/config.ts` | 修改 | 新增 getApiKeyMode / setApiKeyMode |
| `pages/Users/index.tsx` | 修改 | 用户行新增「API Key」操作按钮 |
| `pages/Users/ApiKeyModal.tsx` | 新增 | Key 配置弹窗 |
| `pages/Config/index.tsx` | 修改 | 新增模式切换区块 |
| `pages/Videos/GeneratePanel.tsx` | 修改 | per_member 模式下未配置 Key 的提示 |
| `stores/auth.tsx` | 修改 | 登录后拉取 api_key_mode |

## 9. 使用流程

### 管理员配置流程

```text
1. 管理员在 ToAPIs 后台为每个成员创建独立 API Key
2. 进入 Narrix「用户管理」→ 点击成员的「API Key」按钮 → 输入 Key → 保存
3. 进入「系统配置」→ 将 API Key 模式切换为「成员独立 Key」
4. 完成。之后所有视频生成自动使用成员个人 Key
```

### 用户使用流程

```text
1. 用户打开视频生成页
2. 若已配置个人 Key → 正常生成（使用个人 Key 提交）
3. 若未配置 → 看到「未配置 API Key」提示，无法生成
4. 联系管理员配置后即可正常使用
```

### Token 用量查看

```text
1. 管理员登录 ToAPIs 后台
2. 在「API Key 管理」页面，每个 Key 对应一个成员
3. 查看各 Key 的用量统计 = 对应成员的 Token 消耗
```

## 10. 风险与注意事项

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| 切换模式后旧任务轮询 | 已创建的任务用的可能是旧 Key | 轮询时按当前模式解析，无个人 Key 则回退全局 |
| 成员 Key 被封禁/过期 | 该成员无法生成新视频 | 前端提示具体错误，管理员可切换回 global 模式 |
| 个人 Key 与全局 Key 属于不同 ToAPIs 账号 | 素材库引用可能跨账号失效 | 建议所有 Key 在同一 ToAPIs 账号下创建 |
| 并发安全 | 多个 worker 同时解析同一用户的 Key | Key 读取走数据库 + 30s 缓存，无写冲突 |
