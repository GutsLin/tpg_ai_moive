# 无限画布平台 — 开发人员技术方案

## 1. 项目定位

基于 TwitCanva 开源项目（Apache 2.0）二次开发，构建全新的 AI 创意画布平台。保留 TwitCanva 成熟的自研画布引擎和 30+ 交互 Hooks，重写后端为 Koa + PostgreSQL 模块化架构，AI 对接层抽象为 Provider 适配器模式，支持通过增加配置快速切换 AI 平台。同时内置**技能（Skill）中心**和**提示词（Prompt）中心**，所有用户可上传、浏览和使用技能与提示词模板，提示词可一键填充到画布节点的描述输入框中并二次编辑。此外内置**创意助手**对话面板，AI 帮用户写/优化提示词、拆解分镜、分析构图，结果可一键发送到画布节点。

## 2. 技术栈

| 层面 | 选型 | 来源 |
| --- | --- | --- |
| 前端框架 | React 19 + TypeScript + Vite | TwitCanva 原有 |
| 画布引擎 | TwitCanva 自研引擎 | 复用 |
| UI 库 | Tailwind CSS + Lucide Icons | TwitCanva 原有 |
| 后端框架 | Koa 3 + 模块化路由 | 参考 Narrix |
| 数据库 | PostgreSQL 16 + Kysely | 参考 Narrix |
| 缓存/队列 | Redis + BullMQ | 参考 Narrix |
| 对象存储 | 阿里云 OSS | 参考 Narrix |
| AI 对接 | **Provider 适配器模式**（详见第 6 节） | 新设计 |
| 部署 | Docker Compose | 参考 Narrix |

## 3. 项目结构

```text
canvas-platform/
├── backend/
│   ├── src/
│   │   ├── app.ts                          # Koa 入口
│   │   ├── db/
│   │   │   ├── kysely.ts                   # 数据库类型定义
│   │   │   ├── migrate.ts                  # 迁移脚本
│   │   │   └── migrations/
│   │   │       ├── 001_create_users_and_projects.ts
│   │   │       ├── 002_create_canvases.ts
│   │   │       ├── 003_create_assets.ts
│   │   │       ├── 004_create_video_tasks.ts
│   │   │       ├── 005_create_ai_providers.ts
│   │   │       └── 006_create_skills_and_prompts.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts                     # JWT 认证
│   │   │   ├── require-admin.ts           # 管理员校验
│   │   │   └── project-context.ts         # 项目上下文隔离
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── canvas.routes.ts
│   │   │   ├── asset.routes.ts
│   │   │   ├── generation.routes.ts       # AI 生成（图片+视频）
│   │   │   ├── provider.routes.ts         # AI 平台管理
│   │   │   ├── skill.routes.ts            # 技能中心
│   │   │   ├── prompt.routes.ts           # 提示词中心
│   │   │   ├── category.routes.ts         # 分类管理
│   │   │   └── chat.routes.ts            # 创意助手对话
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── canvas.controller.ts
│   │   │   ├── asset.controller.ts
│   │   │   ├── generation.controller.ts
│   │   │   ├── skill.controller.ts        # 技能 CRUD + 应用
│   │   │   ├── prompt.controller.ts       # 提示词 CRUD + 应用
│   │   │   ├── category.controller.ts     # 分类管理
│   │   │   └── chat.controller.ts         # 创意助手对话
│   │   ├── services/
│   │   │   ├── user.service.ts
│   │   │   ├── canvas.service.ts
│   │   │   ├── asset.service.ts
│   │   │   ├── oss.service.ts
│   │   │   ├── config.service.ts
│   │   │   ├── provider-registry.service.ts  # AI Provider 注册中心
│   │   │   ├── skill.service.ts             # 技能管理
│   │   │   ├── prompt.service.ts            # 提示词管理
│   │   │   ├── category.service.ts          # 分类管理
│   │   │   └── chat.service.ts              # 创意助手对话管理
│   │   ├── providers/                      # AI 平台适配器（核心抽象）
│   │   │   ├── types.ts                   # 接口定义
│   │   │   ├── base-provider.ts            # 抽象基类
│   │   │   ├── toapis-provider.ts          # ToAPIs 适配器
│   │   │   ├── kling-provider.ts           # Kling AI 适配器（预留）
│   │   │   ├── gemini-provider.ts          # Google Gemini 适配器（预留）
│   │   │   └── factory.ts                  # Provider 工厂
│   │   ├── schemas/                        # Zod 校验
│   │   │   ├── auth.schema.ts
│   │   │   ├── canvas.schema.ts
│   │   │   ├── asset.schema.ts
│   │   │   └── generation.schema.ts
│   │   ├── utils/
│   │   │   ├── errors.ts
│   │   │   ├── http.ts
│   │   │   └── logger.ts
│   │   └── workers/
│   │       └── video.worker.ts             # 异步视频生成+轮询
│   ├── Dockerfile
│   └── package.json
├── frontend/                               # 从 TwitCanva 移植
│   ├── src/
│   │   ├── App.tsx                         # 改造：新增路由
│   │   ├── types.ts                        # 改造：新增类型
│   │   ├── components/
│   │   │   ├── canvas/                     # ✅ 直接复用
│   │   │   ├── modals/                     # ✅ 复用，删除无用弹窗
│   │   │   ├── ContextMenu.tsx             # ✅ 复用
│   │   │   ├── Toolbar.tsx                 # ✅ 复用
│   │   │   └── TopBar.tsx                  # ✅ 改造
│   │   ├── hooks/                          # ✅ 复用 30+ Hooks
│   │   ├── pages/                          # 新增
│   │   │   ├── Login.tsx
│   │   │   ├── CanvasList.tsx
│   │   │   └── Admin.tsx                   # 用户/Provider 管理
│   │   ├── stores/
│   │   │   ├── auth.tsx                    # 新增
│   │   │   └── canvas.tsx                  # 新增
│   │   ├── services/                       # 改造
│   │   │   ├── api.ts                      # 统一请求层
│   │   │   ├── generationService.ts        # 对接新后端
│   │   │   └── assetService.ts            # 对接新后端
│   │   └── utils/
│   ├── Dockerfile
│   └── package.json
├── config/
│   └── model-registry.json                 # 模型能力矩阵
├── deploy/
│   ├── docker-compose.yml
│   └── env/
│       └── prod/stack.env
└── docs/
```

## 4. 数据库设计

### 4.1 用户与项目

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(256) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user',   -- 'admin' | 'user'
  status SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project_members (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_role VARCHAR(16) NOT NULL DEFAULT 'member',  -- 'manager' | 'member' | 'viewer'
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  UNIQUE(project_id, user_id)
);
```

### 4.2 画布

```sql
CREATE TABLE canvases (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  canvas_type VARCHAR(32) NOT NULL,            -- 'image' | 'video'
  viewport JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active' | 'archived'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE canvas_nodes (
  id BIGSERIAL PRIMARY KEY,
  canvas_id BIGINT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  node_type VARCHAR(32) NOT NULL,              -- 'image_gen' | 'video_gen' | 'asset' | 'text' | 'group'
  position JSONB NOT NULL,                       -- {"x":100,"y":200}
  size JSONB,                                    -- {"width":240,"height":180}
  data JSONB NOT NULL DEFAULT '{}',              -- 节点业务数据
  source_asset_id BIGINT,                       -- 关联素材 ID
  source_task_id BIGINT,                        -- 关联生成任务 ID
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_canvas_nodes_canvas_id ON canvas_nodes(canvas_id);

CREATE TABLE canvas_edges (
  id BIGSERIAL PRIMARY KEY,
  canvas_id BIGINT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  source_node_id BIGINT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  target_node_id BIGINT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  source_handle VARCHAR(64),
  target_handle VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_canvas_edges_canvas_id ON canvas_edges(canvas_id);
```

### 4.3 AI 平台 Provider（核心）

```sql
CREATE TABLE ai_providers (
  id BIGSERIAL PRIMARY KEY,
  provider_key VARCHAR(64) NOT NULL UNIQUE,    -- 'toapis' | 'kling' | 'gemini' | 'openai'
  name VARCHAR(128) NOT NULL,                    -- 'ToAPIs' | 'Kling AI' | 'Google Gemini'
  provider_type VARCHAR(32) NOT NULL,            -- 'openai_compatible' | 'kling_native' | 'gemini_native'
  endpoint TEXT NOT NULL,                        -- API 地址
  api_key_encrypted TEXT NOT NULL,               -- AES-256-GCM 加密
  capabilities JSONB NOT NULL DEFAULT '{}',      -- 模型能力矩阵
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.4 素材与任务

```sql
CREATE TABLE assets (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(256) NOT NULL,
  asset_type VARCHAR(16) NOT NULL,              -- 'Image' | 'Video' | 'Audio'
  oss_key TEXT NOT NULL,
  source_provider VARCHAR(64),                   -- 来源平台
  source_url TEXT,
  tags JSONB DEFAULT '[]',
  status VARCHAR(16) NOT NULL DEFAULT 'active',  -- 'active' | 'orphaned'
  orphaned_at TIMESTAMPTZ,                       -- 标记为孤立的时间（定时清理用）
  ref_count INTEGER NOT NULL DEFAULT 0,          -- 引用计数（被画布节点/素材库引用的次数）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_project_id ON assets(project_id);

CREATE TABLE generation_tasks (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canvas_id BIGINT REFERENCES canvases(id) ON DELETE SET NULL,
  canvas_node_id BIGINT REFERENCES canvas_nodes(id) ON DELETE SET NULL,
  provider_id BIGINT NOT NULL REFERENCES ai_providers(id),
  task_type VARCHAR(16) NOT NULL,                -- 'image' | 'video'
  model VARCHAR(64) NOT NULL,
  prompt TEXT NOT NULL,
  prompt_raw TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending'|'processing'|'succeeded'|'failed'
  provider_task_id VARCHAR(256),                -- AI 平台返回的任务 ID
  result_url TEXT,                               -- 生成结果 URL
  result_oss_key TEXT,                          -- 存入 OSS 后的 key
  error_message TEXT,
  request_snapshot JSONB,                        -- 完整请求参数
  next_poll_at TIMESTAMPTZ,
  last_polled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gen_tasks_status ON generation_tasks(status);
CREATE INDEX idx_gen_tasks_canvas_node ON generation_tasks(canvas_node_id);
```

### 4.5 技能与提示词中心

```sql
-- 预设分类（管理员可增删）
CREATE TABLE skill_categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,              -- '图片生成' | '视频生成' | '分镜编排' | '风格变换' | '角色动画'
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 提示词（纯文本模板，全局共享）
CREATE TABLE prompts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES skill_categories(id) ON DELETE SET NULL,
  title VARCHAR(128) NOT NULL,
  content TEXT NOT NULL,                           -- 提示词正文
  content_type VARCHAR(16) NOT NULL DEFAULT 'image', -- 'image' | 'video'
  variables JSONB NOT NULL DEFAULT '[]',           -- 变量占位符列表 [{"name":"角色描述","key":"{角色描述}","required":true}]
  preview_image_url TEXT,                          -- 可选示例图
  use_count INTEGER NOT NULL DEFAULT 0,            -- 使用次数
  like_count INTEGER NOT NULL DEFAULT 0,           -- 点赞数
  status VARCHAR(16) NOT NULL DEFAULT 'active',    -- 'active' | 'hidden'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prompts_category ON prompts(category_id);
CREATE INDEX idx_prompts_content_type ON prompts(content_type);

-- 技能（参数预设包 = 提示词 + 模型 + 参数，全局共享）
CREATE TABLE skills (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES skill_categories(id) ON DELETE SET NULL,
  title VARCHAR(128) NOT NULL,
  description TEXT,
  skill_type VARCHAR(16) NOT NULL,                  -- 'image' | 'video'
  -- 提示词模板（可含变量占位符）
  prompt_template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',            -- [{"name":"角色描述","key":"{角色描述}","required":true}]
  -- 模型与参数预设
  model VARCHAR(64) NOT NULL,                       -- 'seedance-2' | 'gpt-image-2' 等
  params JSONB NOT NULL DEFAULT '{}',               -- {"duration":5,"ratio":"16:9","resolution":"720p","generateAudio":true,"mode":"omni"}
  preview_image_url TEXT,                           -- 可选效果预览图
  use_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_skills_category ON skills(category_id);
CREATE INDEX idx_skills_skill_type ON skills(skill_type);

-- 用户点赞记录
CREATE TABLE user_likes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(16) NOT NULL,                 -- 'prompt' | 'skill'
  target_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, target_type, target_id)
);

-- 创意助手对话
CREATE TABLE chat_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canvas_id BIGINT REFERENCES canvases(id) ON DELETE SET NULL,  -- 关联画布（可选）
  title VARCHAR(128) NOT NULL DEFAULT '新对话',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);

CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL,                    -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  model VARCHAR(64),                             -- 使用的模型
  tokens_used INTEGER,                          -- Token 消耗
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
```

## 5. 后端 API 设计

### 5.1 认证

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/auth/login` | POST | 登录，返回 JWT |
| `/api/auth/session` | GET | 获取当前用户信息 |

### 5.2 画布

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/canvases` | GET | 列出当前项目画布 |
| `/api/canvases` | POST | 创建画布 |
| `/api/canvases/:id` | GET | 获取画布详情（含节点+连线） |
| `/api/canvases/:id` | PATCH | 更新画布（名称/viewport/状态） |
| `/api/canvases/:id` | DELETE | 删除画布 |
| `/api/canvases/:id/nodes` | POST | 新增节点 |
| `/api/canvases/:id/nodes/:nodeId` | PATCH | 更新节点 |
| `/api/canvases/:id/nodes/:nodeId` | DELETE | 删除节点 |
| `/api/canvases/:id/nodes/batch` | PUT | 批量更新节点位置 |
| `/api/canvases/:id/edges` | POST | 新增连线 |
| `/api/canvases/:id/edges/:edgeId` | DELETE | 删除连线 |

### 5.3 AI 生成

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/generation/image` | POST | 图片生成 |
| `/api/generation/video` | POST | 视频生成（异步，返回 taskId） |
| `/api/generation/tasks/:id` | GET | 查询任务状态 |
| `/api/generation/tasks/:id/sync` | POST | 手动触发状态同步 |

### 5.4 AI 平台管理

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/providers` | GET | 列出所有 AI 平台 |
| `/api/providers` | POST | 新增 AI 平台 |
| `/api/providers/:id` | PATCH | 更新平台配置 |
| `/api/providers/:id/activate` | POST | 设为默认平台 |
| `/api/providers/:id/test` | POST | 测试连通性 |

### 5.5 素材

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/assets` | GET | 列出素材 |
| `/api/assets` | POST | 上传素材 |
| `/api/assets/:id` | DELETE | 删除素材 |
| `/api/assets/sts-token` | POST | 获取 OSS STS Token（浏览器直传） |

### 5.6 提示词中心

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/prompts` | GET | 列出提示词（支持分类筛选、关键词搜索、排序） |
| `/api/prompts` | POST | 上传提示词 |
| `/api/prompts/:id` | GET | 获取提示词详情 |
| `/api/prompts/:id` | PATCH | 更新提示词（仅上传者） |
| `/api/prompts/:id` | DELETE | 删除提示词（仅上传者） |
| `/api/prompts/:id/apply` | POST | 应用提示词（记录使用次数 +1，返回完整内容） |
| `/api/prompts/:id/like` | POST | 点赞 |
| `/api/prompts/:id/like` | DELETE | 取消点赞 |

### 5.7 技能中心

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/skills` | GET | 列出技能（支持分类筛选、关键词搜索、排序） |
| `/api/skills` | POST | 上传技能 |
| `/api/skills/:id` | GET | 获取技能详情（含模型+参数+提示词模板+变量定义） |
| `/api/skills/:id` | PATCH | 更新技能（仅上传者） |
| `/api/skills/:id` | DELETE | 删除技能（仅上传者） |
| `/api/skills/:id/apply` | POST | 应用技能（记录使用次数 +1，返回完整参数） |
| `/api/skills/:id/like` | POST | 点赞 |
| `/api/skills/:id/like` | DELETE | 取消点赞 |

### 5.8 分类管理

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/categories` | GET | 列出所有分类 |
| `/api/categories` | POST | 新增分类（仅管理员） |
| `/api/categories/:id` | PATCH | 更新分类（仅管理员） |
| `/api/categories/:id` | DELETE | 删除分类（仅管理员） |

### 5.9 创意助手

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/chat/sessions` | GET | 列出当前用户的对话 |
| `/api/chat/sessions` | POST | 创建新对话 |
| `/api/chat/sessions/:id` | DELETE | 删除对话 |
| `/api/chat/sessions/:id/messages` | GET | 获取对话消息历史 |
| `/api/chat/sessions/:id/send` | POST | 发送消息（流式返回 AI 回复） |

## 6. AI 对接抽象层（核心设计）

### 6.1 设计目标

> 新增一个 AI 平台只需要：1 个适配器文件 + 1 条数据库配置，不改动任何业务代码。

### 6.2 接口定义

```typescript
// backend/src/providers/types.ts

/** AI 平台统一接口 */
export interface AIProvider {
  /** 平台标识 */
  readonly providerKey: string

  /** 平台名称 */
  readonly name: string

  /** 平台类型 */
  readonly providerType: ProviderType

  /** 初始化 */
  initialize(config: ProviderConfig): void

  /** 测试连通性 */
  testConnection(): Promise<{ ok: boolean; message: string; latencyMs?: number }>

  /** 获取支持的模型列表 */
  listModels(): ProviderModel[]

  // ========== 图片生成 ==========

  /** 同步生成图片 */
  generateImage(input: ImageGenInput): Promise<ImageGenResult>

  // ========== 视频生成 ==========

  /** 创建视频生成任务（异步） */
  createVideoTask(input: VideoGenInput): Promise<{ providerTaskId: string }>

  /** 查询视频任务状态 */
  getVideoTaskStatus(providerTaskId: string): Promise<VideoTaskStatus>

  /** 下载视频结果 */
  downloadVideoResult(resultUrl: string): Promise<Buffer>

  // ========== 文本对话（创意助手） ==========

  /** 对话补全（支持流式） */
  chatCompletion(input: ChatInput): Promise<ChatResult>
}

export type ProviderType = 'openai_compatible' | 'kling_native' | 'gemini_native' | 'custom'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatInput {
  model: string                    // 'gpt-4o' | 'gemini-2.0-flash' 等
  messages: ChatMessage[]          // 对话历史
  temperature?: number
  maxTokens?: number
  stream?: boolean                 // 是否流式返回
}

export interface ChatResult {
  content: string                  // AI 回复内容
  model: string
  tokensUsed?: number
}

export interface ProviderConfig {
  endpoint: string
  apiKey: string
  capabilities: Record<string, unknown>  // 模型能力矩阵 JSON
}

export interface ProviderModel {
  id: string
  label: string
  type: 'image' | 'video'
  capabilities: ModelCapabilities
}

export interface ModelCapabilities {
  // 图片
  textToImage?: boolean
  imageToImage?: boolean
  maxReferenceImages?: number
  sizes?: string[]
  // 视频
  textToVideo?: boolean
  imageToVideo?: boolean
  firstLastFrame?: boolean
  referenceVideo?: boolean
  referenceAudio?: boolean
  generateAudio?: boolean
  durations?: number[]
  resolutions?: string[]
  aspectRatios?: string[]
}

export interface ImageGenInput {
  prompt: string
  model: string
  size?: string
  referenceImages?: Array<{ url: string; role?: string }>
}

export interface ImageGenResult {
  imageUrl: string
  revisedPrompt?: string
}

export interface VideoGenInput {
  prompt: string
  model: string
  duration?: number
  ratio?: string
  resolution?: string
  generateAudio?: boolean
  mode?: 'frames' | 'omni'
  content: Array<{
    type: 'text' | 'image_url' | 'video_url' | 'audio_url'
    text?: string
    url?: string
    assetId?: number
    role?: string
  }>
}

export interface VideoTaskStatus {
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  videoUrl?: string
  errorMessage?: string
  completionTokens?: number | null
  totalTokens?: number | null
}
```

### 6.3 抽象基类

```typescript
// backend/src/providers/base-provider.ts

import type { AIProvider, ProviderConfig, ProviderModel } from './types'

export abstract class BaseProvider implements AIProvider {
  public abstract readonly providerKey: string
  public abstract readonly name: string
  public abstract readonly providerType: string

  protected endpoint!: string
  protected apiKey!: string
  protected capabilities!: Record<string, unknown>

  public initialize(config: ProviderConfig): void {
    this.endpoint = config.endpoint.replace(/\/+$/, '')
    this.apiKey = config.apiKey
    this.capabilities = config.capabilities
  }

  public abstract testConnection(): Promise<{ ok: boolean; message: string; latencyMs?: number }>
  public abstract listModels(): ProviderModel[]
  public abstract generateImage(input: ImageGenInput): Promise<ImageGenResult>
  public abstract createVideoTask(input: VideoGenInput): Promise<{ providerTaskId: string }>
  public abstract getVideoTaskStatus(providerTaskId: string): Promise<VideoTaskStatus>
  public abstract downloadVideoResult(resultUrl: string): Promise<Buffer>
  public abstract chatCompletion(input: ChatInput): Promise<ChatResult>

  /** 通用 HTTP 请求封装 */
  protected async request(path: string, options: RequestInit): Promise<Response> {
    const url = `${this.endpoint}${path}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    })
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Provider API error ${response.status}: ${errorBody}`)
    }
    return response
  }
}
```

### 6.4 ToAPIs 适配器实现

```typescript
// backend/src/providers/toapis-provider.ts

import { BaseProvider } from './base-provider'
import type {
  ProviderModel, ImageGenInput, ImageGenResult,
  VideoGenInput, VideoTaskStatus,
} from './types'

export class ToApisProvider extends BaseProvider {
  public readonly providerKey = 'toapis'
  public readonly name = 'ToAPIs'
  public readonly providerType = 'openai_compatible'

  public async testConnection() {
    const start = Date.now()
    try {
      const response = await this.request('/models', { method: 'GET' })
      return { ok: response.ok, message: '连接正常', latencyMs: Date.now() - start }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  }

  public listModels(): ProviderModel[] {
    // 从 capabilities JSONB 读取模型列表
    return (this.capabilities as { models: ProviderModel[] }).models ?? []
  }

  // ========== 图片生成 ==========

  public async generateImage(input: ImageGenInput): Promise<ImageGenResult> {
    const response = await this.request('/images/generations', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        size: input.size ?? '1024x1024',
      }),
    })
    const result = await response.json()
    return {
      imageUrl: result.data[0].url,
      revisedPrompt: result.data[0].revised_prompt,
    }
  }

  // ========== 视频生成 ==========

  public async createVideoTask(input: VideoGenInput): Promise<{ providerTaskId: string }> {
    const response = await this.request('/contents/generations/tasks', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        content: input.content,
        duration: input.duration,
        ratio: input.ratio,
        resolution: input.resolution,
        generate_audio: input.generateAudio,
      }),
    })
    const result = await response.json()
    return { providerTaskId: result.id }
  }

  public async getVideoTaskStatus(providerTaskId: string): Promise<VideoTaskStatus> {
    const response = await this.request(
      `/contents/generations/tasks/${providerTaskId}`,
      { method: 'GET' }
    )
    const result = await response.json()
    const statusMap: Record<string, VideoTaskStatus['status']> = {
      queued: 'pending', pending: 'pending',
      running: 'processing', processing: 'processing',
      succeeded: 'succeeded', completed: 'succeeded',
      failed: 'failed', cancelled: 'failed',
    }
    return {
      status: statusMap[result.status] ?? 'processing',
      videoUrl: result.output?.video_url,
      errorMessage: result.error?.message,
      completionTokens: result.usage?.completion_tokens ?? null,
      totalTokens: result.usage?.total_tokens ?? null,
    }
  }

  public async downloadVideoResult(resultUrl: string): Promise<Buffer> {
    const response = await fetch(resultUrl)
    return Buffer.from(await response.arrayBuffer())
  }

  // ========== 文本对话（创意助手） ==========

  public async chatCompletion(input: ChatInput): Promise<ChatResult> {
    const response = await this.request('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 2000,
        stream: false,
      }),
    })
    const result = await response.json()
    return {
      content: result.choices[0].message.content,
      model: result.model,
      tokensUsed: result.usage?.total_tokens,
    }
  }
}
```

### 6.5 Provider 工厂与注册中心

```typescript
// backend/src/providers/factory.ts

import { ToApisProvider } from './toapis-provider'
import { KlingProvider } from './kling-provider'      // 预留
import { GeminiProvider } from './gemini-provider'      // 预留
import type { AIProvider, ProviderType } from './types'

const providerRegistry = new Map<string, () => AIProvider>()

/** 注册 Provider（新增平台时在这里加一行） */
export function registerProvider(key: string, factory: () => AIProvider) {
  providerRegistry.set(key, factory)
}

// 默认注册
registerProvider('toapis', () => new ToApisProvider())
registerProvider('kling', () => new KlingProvider())
registerProvider('gemini', () => new GeminiProvider())

/** 根据 providerKey 创建 Provider 实例 */
export function createProvider(key: string): AIProvider {
  const factory = providerRegistry.get(key)
  if (!factory) {
    throw new Error(`未注册的 AI 平台: ${key}。请在 factory.ts 中注册。`)
  }
  return factory()
}
```

```typescript
// backend/src/services/provider-registry.service.ts

import { db } from '../db/kysely'
import { ConfigService } from './config.service'
import { createProvider } from '../providers/factory'
import type { AIProvider, ProviderConfig } from '../providers/types'

export class ProviderRegistryService {
  private cache = new Map<number, AIProvider>()
  private readonly configService = new ConfigService()

  /** 获取默认启用的 Provider */
  public async getDefaultProvider(): Promise<AIProvider> {
    const row = await db
      .selectFrom('ai_providers')
      .selectAll()
      .where('is_default', '=', true)
      .where('enabled', '=', true)
      .executeTakeFirstOrThrow()

    return this.getOrCreateProvider(row)
  }

  /** 根据 ID 获取 Provider */
  public async getProvider(providerId: number): Promise<AIProvider> {
    if (this.cache.has(providerId)) {
      return this.cache.get(providerId)!
    }

    const row = await db
      .selectFrom('ai_providers')
      .selectAll()
      .where('id', '=', providerId)
      .executeTakeFirstOrThrow()

    return this.getOrCreateProvider(row)
  }

  /** 列出所有已启用的 Provider（前端选择用） */
  public async listEnabledProviders() {
    const rows = await db
      .selectFrom('ai_providers')
      .select(['id', 'provider_key', 'name', 'provider_type', 'capabilities', 'is_default'])
      .where('enabled', '=', true)
      .orderBy('is_default', 'desc')
      .execute()

    return rows.map((row) => ({
      id: row.id,
      providerKey: row.provider_key,
      name: row.name,
      providerType: row.provider_type,
      isDefault: row.is_default,
      models: (row.capabilities as { models: unknown[] }).models ?? [],
    }))
  }

  /** 创建/获取 Provider 实例 */
  private async getOrCreateProvider(row: any): Promise<AIProvider> {
    if (this.cache.has(row.id)) {
      return this.cache.get(row.id)!
    }

    const config: ProviderConfig = {
      endpoint: row.endpoint,
      apiKey: this.configService.decryptSecret(row.api_key_encrypted),
      capabilities: row.capabilities,
    }

    const provider = createProvider(row.provider_key)
    provider.initialize(config)
    this.cache.set(row.id, provider)
    return provider
  }
}
```

### 6.6 新增 AI 平台的完整步骤

以新增「Kling AI」为例：

**步骤 1**：编写适配器文件

```typescript
// backend/src/providers/kling-provider.ts

import { BaseProvider } from './base-provider'

export class KlingProvider extends BaseProvider {
  public readonly providerKey = 'kling'
  public readonly name = 'Kling AI'
  public readonly providerType = 'kling_native'

  public async testConnection() { /* ... */ }
  public listModels() { /* ... */ }
  public async generateImage(input) { /* Kling 图片生成 API */ }
  public async createVideoTask(input) { /* Kling 视频生成 API */ }
  public async getVideoTaskStatus(taskId) { /* Kling 查询 API */ }
  public async downloadVideoResult(url) { /* ... */ }
}
```

**步骤 2**：在工厂中注册

```typescript
// backend/src/providers/factory.ts
import { KlingProvider } from './kling-provider'

registerProvider('kling', () => new KlingProvider())
```

**步骤 3**：在数据库中添加配置（通过管理后台或 API）

```sql
INSERT INTO ai_providers (provider_key, name, provider_type, endpoint, api_key_encrypted, capabilities, enabled, is_default)
VALUES ('kling', 'Kling AI', 'kling_native', 'https://api.klingai.com/v1', '<encrypted>', '<capabilities_json>', true, false);
```

**完成。** 业务代码（Canvas Service、Generation Service）零改动。

### 6.7 生成服务调用流程

```typescript
// backend/src/services/generation.service.ts

export class GenerationService {
  public constructor(
    private readonly providerRegistry: ProviderRegistryService = new ProviderRegistryService(),
    private readonly ossService: OssService,
  ) {}

  public async generateImage(input: {
    userId: number
    projectId: number
    canvasId?: number
    canvasNodeId?: number
    providerId?: number    // 指定平台，不传则用默认
    prompt: string
    model: string
    size?: string
  }) {
    // 1. 获取 Provider（默认或指定）
    const provider = input.providerId
      ? await this.providerRegistry.getProvider(input.providerId)
      : await this.providerRegistry.getDefaultProvider()

    // 2. 调用 Provider 生成图片
    const result = await provider.generateImage({
      prompt: input.prompt,
      model: input.model,
      size: input.size,
    })

    // 3. 下载图片 → 上传 OSS → 创建 asset 记录
    const imageBuffer = Buffer.from(await (await fetch(result.imageUrl)).arrayBuffer())
    const ossKey = `generated/${Date.now()}-${randomUUID()}.png`
    await this.ossService.putObject(ossKey, imageBuffer, 'image/png')
    const signedUrl = await this.ossService.getSignedUrl(ossKey)

    // 4. 落库
    const asset = await db.insertInto('assets')
      .values({
        project_id: input.projectId,
        user_id: input.userId,
        name: input.prompt.slice(0, 32),
        asset_type: 'Image',
        oss_key: ossKey,
        source_provider: provider.providerKey,
        source_url: result.imageUrl,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    // 5. 如果关联画布节点，更新节点
    if (input.canvasNodeId) {
      await db.updateTable('canvas_nodes')
        .set({
          data: { status: 'succeeded', resultUrl: signedUrl, assetId: asset.id },
          source_asset_id: asset.id,
          updated_at: new Date(),
        })
        .where('id', '=', input.canvasNodeId)
        .execute()
    }

    return { assetId: asset.id, url: signedUrl }
  }

  public async createVideoTask(input: {
    userId: number
    projectId: number
    canvasId?: number
    canvasNodeId?: number
    providerId?: number
    prompt: string
    model: string
    duration?: number
    ratio?: string
    resolution?: string
    generateAudio?: boolean
    content: unknown[]
  }) {
    // 1. 获取 Provider
    const provider = input.providerId
      ? await this.providerRegistry.getProvider(input.providerId)
      : await this.providerRegistry.getDefaultProvider()

    // 2. 创建落库记录
    const task = await db.insertInto('generation_tasks')
      .values({
        project_id: input.projectId,
        user_id: input.userId,
        canvas_id: input.canvasId ?? null,
        canvas_node_id: input.canvasNodeId ?? null,
        provider_id: provider.providerId,
        task_type: 'video',
        model: input.model,
        prompt: input.prompt,
        status: 'pending',
        request_snapshot: input,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    // 3. 调用 Provider 创建任务
    const { providerTaskId } = await provider.createVideoTask({
      prompt: input.prompt,
      model: input.model,
      duration: input.duration,
      ratio: input.ratio,
      resolution: input.resolution,
      generateAudio: input.generateAudio,
      content: input.content,
    })

    // 4. 更新任务 ID
    await db.updateTable('generation_tasks')
      .set({
        provider_task_id: providerTaskId,
        status: 'processing',
        next_poll_at: new Date(Date.now() + 10_000),
      })
      .where('id', '=', task.id)
      .execute()

    // 5. 入队异步轮询
    await this.dispatcher.enqueueSync(task.id)

    return { taskId: task.id }
  }
}
```

## 7. 视频异步队列

### 7.1 架构设计：BullMQ 延迟队列 + 指数退避

放弃 `setInterval` 批量轮询，改为 **每个生成任务一个独立的 BullMQ Delayed Job**，利用 BullMQ 内置的延迟调度和指数退避重试机制。

#### 对比

| 维度 | setInterval 批量轮询 | BullMQ 延迟队列 |
| --- | --- | --- |
| **调度方式** | 每 30 秒扫一次数据库，取出所有待轮询任务 | 每个任务一个独立 Job，到时间自动触发 |
| **数据库压力** | 每次扫描 `WHERE next_poll_at <= now()`，任务多时查询慢 | 无需轮询查询，Job 到期直接触发 |
| **API 限流（429）** | 手写 try/catch，失败后简单重试 | BullMQ 内置指数退避，自动延迟重试 |
| **API 错误（502）** | 同上 | 同上，重试次数和间隔可配置 |
| **内存占用** | 所有任务在一个 tick 内并发请求 AI API | 每个任务独立调度，可控制并发数 |
| **任务隔离** | 一个任务异常可能影响整批 | Job 级别隔离，互不干扰 |
| **延迟精度** | 最少 30 秒延迟（取决于扫描间隔） | 可精确到秒级延迟 |

### 7.2 核心实现

```typescript
// backend/src/workers/video.worker.ts

import { Queue, Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'

const connection = new IORedis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
})

// 轮询队列：每个 Job 对应一个生成任务的状态查询
const pollQueue = new Queue('video-poll', { connection })

// 创建任务时入队
export const enqueuePoll = async (taskId: number, delayMs: number = 10_000) => {
  await pollQueue.add(
    'poll-task',
    { taskId },
    {
      jobId: `poll-${taskId}`,
      delay: delayMs,
      attempts: 5,                // 最多重试 5 次
      backoff: {
        type: 'exponential',       // 指数退避
        delay: 5_000,              // 初始退避 5 秒
      },
      removeOnComplete: true,
      removeOnFail: 100,
    }
  )
}

// Worker 处理单个任务的轮询
const worker = new Worker(
  'video-poll',
  async (job: Job<{ taskId: number }>) => {
    const { taskId } = job.data

    // 1. 查询任务
    const task = await db
      .selectFrom('generation_tasks')
      .selectAll()
      .where('id', '=', taskId)
      .executeTakeFirst()

    if (!task || task.status === 'succeeded' || task.status === 'failed') {
      return // 任务已结束，不再轮询
    }

    // 2. 调用 Provider 查询状态
    const provider = await providerRegistry.getProvider(task.provider_id)
    const status = await provider.getVideoTaskStatus(task.provider_task_id!)

    // 3. 根据状态处理
    if (status.status === 'succeeded' && status.videoUrl) {
      // 下载视频 → OSS → 更新数据库 + 画布节点
      const buffer = await provider.downloadVideoResult(status.videoUrl)
      const ossKey = `generated/videos/${task.id}.mp4`
      await ossService.putObject(ossKey, buffer, 'video/mp4')
      const signedUrl = await ossService.getSignedUrl(ossKey)

      await db.updateTable('generation_tasks')
        .set({
          status: 'succeeded',
          result_url: status.videoUrl,
          result_oss_key: ossKey,
          next_poll_at: null,
          last_polled_at: new Date(),
        })
        .where('id', '=', taskId)
        .execute()

      if (task.canvas_node_id) {
        await db.updateTable('canvas_nodes')
          .set({ data: { status: 'succeeded', videoUrl: signedUrl } })
          .where('id', '=', task.canvas_node_id)
          .execute()
      }

      // 任务完成，不再重新入队
      return
    }

    if (status.status === 'failed') {
      await db.updateTable('generation_tasks')
        .set({
          status: 'failed',
          error_message: status.errorMessage,
          next_poll_at: null,
          last_polled_at: new Date(),
        })
        .where('id', '=', taskId)
        .execute()

      if (task.canvas_node_id) {
        await db.updateTable('canvas_nodes')
          .set({ data: { status: 'failed', errorMessage: status.errorMessage } })
          .where('id', '=', task.canvas_node_id)
          .execute()
      }

      return
    }

    // 4. 仍在处理中 → 更新最后轮询时间 → 重新入队（延迟递增）
    const nextDelay = calculateNextDelay(job.attemptsMade)

    await db.updateTable('generation_tasks')
      .set({
        last_polled_at: new Date(),
        next_poll_at: new Date(Date.now() + nextDelay),
      })
      .where('id', '=', taskId)
      .execute()

    // 重新入队
    await enqueuePoll(taskId, nextDelay)
  },
  {
    connection,
    concurrency: 5,  // 最多同时处理 5 个轮询请求，控制对 AI API 的并发压力
  }
)

// Worker 失败处理（API 返回 429/502 时 BullMQ 自动指数退避重试）
worker.on('failed', (job, error) => {
  logger.warn(
    { jobId: job?.id, taskId: job?.data.taskId, error: error.message, attempts: job?.attemptsMade },
    'video poll job failed, BullMQ will retry with exponential backoff'
  )

  // 如果超过最大重试次数，标记任务为超时失败
  if (job && job.attemptsMade >= (job.opts.attempts ?? 5)) {
    void markTaskAsFailed(job.data.taskId, `轮询超时：${error.message}`)
  }
})
```

### 7.3 轮询延迟策略

不固定 30 秒，根据任务已等待时长逐步拉长间隔：

```typescript
// backend/src/workers/video.worker.ts

const calculateNextDelay = (attemptsMade: number): number => {
  // 轮次越靠后，间隔越长，减少对 AI API 的无效请求
  const delays = [
    10_000,   // 第 1 次重查：10 秒后
    15_000,   // 第 2 次：15 秒
    30_000,   // 第 3 次：30 秒
    60_000,   // 第 4 次：1 分钟
    120_000,  // 第 5 次起：2 分钟
    180_000,  // 第 6 次起：3 分钟
    300_000,  // 第 7 次起：5 分钟
  ]
  return delays[Math.min(attemptsMade, delays.length - 1)]
}
```

### 7.4 GenerationService 中入队

```typescript
// backend/src/services/generation.service.ts（节选）

public async createVideoTask(input: VideoGenInput) {
  // 1. 获取 Provider
  const provider = input.providerId
    ? await this.providerRegistry.getProvider(input.providerId)
    : await this.providerRegistry.getDefaultProvider()

  // 2. 落库
  const task = await db.insertInto('generation_tasks')
    .values({ /* ... */ })
    .returningAll()
    .executeTakeFirstOrThrow()

  // 3. 调用 Provider 创建任务
  const { providerTaskId } = await provider.createVideoTask({ /* ... */ })

  // 4. 更新任务 ID
  await db.updateTable('generation_tasks')
    .set({ provider_task_id: providerTaskId, status: 'processing' })
    .where('id', '=', task.id)
    .execute()

  // 5. 入队延迟轮询（首次 10 秒后查询）
  await enqueuePoll(task.id, 10_000)

  return { taskId: task.id }
}
```

### 7.5 创建任务流程也走队列

视频生成任务创建本身也通过 BullMQ 队列，避免前端等待：

```typescript
// backend/src/workers/video-create.worker.ts

const createQueue = new Queue('video-create', { connection })

export const enqueueCreate = async (taskId: number) => {
  await createQueue.add('create-task', { taskId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3_000 },
    removeOnComplete: true,
  })
}

new Worker('video-create', async (job: Job<{ taskId: number }>) => {
  const { taskId } = job.data
  // 1. 从数据库取任务参数
  // 2. 调用 Provider.createVideoTask
  // 3. 落库 provider_task_id
  // 4. 入队轮询
  await enqueuePoll(taskId, 10_000)
}, { connection, concurrency: 3 })
```

### 7.6 容错与超时

| 场景 | 处理方式 |
| --- | --- |
| AI API 返回 429（限流） | BullMQ 自动指数退避重试，5 秒后第一次重试，逐步增加间隔 |
| AI API 返回 502（网关错误） | 同上，BullMQ 自动重试 |
| 轮询超过最大次数（默认 5 次） | 标记任务 `status='failed'`，错误信息「轮询超时」 |
| Worker 进程重启 | BullMQ 从 Redis 恢复 Job 状态，未完成的 Job 自动恢复执行 |
| 任务已结束但 Job 仍在 | Worker 检查 `status`，已完成/失败的任务直接 return，不重复处理 |
| 超时任务清理 | 每日凌晨检查 `last_polled_at` 超过 24 小时的 processing 任务，标记失败 |

## 8. 前端改造清单

### 8.1 直接复用（不改动）

| 文件 | 说明 |
| --- | --- |
| `src/components/canvas/CanvasNode.tsx` | 节点组件 |
| `src/components/canvas/NodeControls.tsx` | 节点操作面板 |
| `src/components/canvas/NodeContent.tsx` | 节点内容渲染 |
| `src/components/canvas/ConnectionsLayer.tsx` | 连线层 |
| `src/components/canvas/NodeConnectors.tsx` | 连接点 |
| `src/components/canvas/SelectionBoundingBox.tsx` | 选区框 |
| `src/hooks/useCanvasNavigation.ts` | 画布平移缩放 |
| `src/hooks/useNodeDragging.ts` | 节点拖拽 |
| `src/hooks/useConnectionDragging.ts` | 连线拖拽 |
| `src/hooks/useContextMenu*.ts` | 右键菜单 |
| `src/hooks/useKeyboardShortcuts.ts` | 键盘快捷键 |
| `src/hooks/useSelectionBox.ts` | 选区框 |
| `src/hooks/usePointerHandlers.ts` | 指针事件 |
| `src/hooks/useCanvasEffects.ts` | 画布特效 |
| `src/utils/connectionHelpers.ts` | 连线校验 |
| `src/utils/videoHelpers.ts` | 视频处理 |

### 8.2 改造适配

| 文件 | 改动内容 |
| --- | --- |
| `src/App.tsx` | 拆分为路由：登录页 / 画布列表页 / 画布编辑器 |
| `src/types.ts` | 新增 Canvas / Project / User / Provider 类型 |
| `src/hooks/useGeneration.ts` | 改为调用新后端 `/api/generation/*` |
| `src/hooks/useAutoSave.ts` | 从 localStorage 改为调用 `/api/canvases/:id` |
| `src/hooks/useWorkflow.ts` | 从本地文件改为调用画布 CRUD API |
| `src/services/generationService.ts` | 对接新后端生成 API |
| `src/services/assetService.ts` | 对接新后端素材 API |
| `src/components/TopBar.tsx` | 新增用户信息 / 退出登录 |
| `src/components/Toolbar.tsx` | 新增平台选择下拉框 |
| `src/components/AssetLibraryPanel.tsx` | 对接新后端素材库 |

### 8.3 新增

| 文件 | 说明 |
| --- | --- |
| `src/pages/Login.tsx` | 登录页 |
| `src/pages/CanvasList.tsx` | 画布列表页 |
| `src/pages/Admin.tsx` | 管理页面（用户/Provider 管理） |
| `src/pages/PromptCenter.tsx` | 提示词中心（浏览/搜索/上传/应用） |
| `src/pages/SkillCenter.tsx` | 技能中心（浏览/搜索/上传/应用） |
| `src/components/PromptPicker.tsx` | 画布内提示词选择面板（侧边抽屉） |
| `src/components/SkillPicker.tsx` | 画布内技能选择面板（侧边抽屉） |
| `src/components/VariableFillModal.tsx` | 变量占位符填充弹窗 |
| `src/components/SaveAsPromptModal.tsx` | 画布右键「保存为提示词」弹窗 |
| `src/components/SaveAsSkillModal.tsx` | 画布右键「保存为技能」弹窗 |
| `src/stores/auth.tsx` | 认证状态管理 |
| `src/stores/canvas.tsx` | 画布状态管理 |
| `src/services/api.ts` | 统一 axios 请求层（带 JWT） |
| `src/services/promptService.ts` | 提示词 API 请求层 |
| `src/services/skillService.ts` | 技能 API 请求层 |

### 8.4 删除

| 文件/功能 | 原因 |
| --- | --- |
| `TikTokImportModal.tsx` + `useTikTokImport.ts` | 无需求 |
| `TwitterPostModal.tsx` + `server/routes/twitter.js` | 无需求 |
| `TikTokPostModal.tsx` + `server/routes/tiktok-post.js` | 无需求 |
| `useLocalModelNodeHandlers.ts` + `server/routes/local-models.js` | 无 GPU |
| `OrbitCameraControl.tsx` + `ChangeAnglePanel.tsx` + `cameraAngleService.ts` | 无需求 |
| `server/agent/*` (LangGraph) | 暂不需要 |
| `useFaceDetection.ts` + `face-api.js` | 无需求 |
| `@react-three/*` + `three` | 不需要 3D |

## 9. 自动保存策略

| 操作 | 触发 | 保存方式 |
| --- | --- | --- |
| 节点拖拽 | `onNodeDragStop` | 防抖 1s → `PUT /nodes/batch` |
| 节点数据修改 | 输入框失焦 | 立即 → `PATCH /nodes/:id` |
| 新增/删除节点 | 即时 | 立即 → `POST` / `DELETE` |
| 连线操作 | 即时 | 立即 → `POST` / `DELETE` |
| viewport 变化 | 平移/缩放结束 | 防抖 2s → `PATCH /canvases/:id` |

## 10. 技能中心与提示词中心

### 10.1 模块定位

| 模块 | 定义 | 用户操作 |
| --- | --- | --- |
| **提示词中心** | 纯文本提示词模板，按用途分类，全局共享 | 浏览 → 选中 → 一键填充到节点描述框 → 可修改后生成 |
| **技能中心** | 参数预设包（提示词模板 + 模型 + 参数），全局共享 | 浏览 → 选中 → 填变量 → 一键应用到节点所有字段 → 可微调后生成 |

### 10.2 提示词应用流程

```
画布节点 → 点击「提示词库」按钮
    │
    ▼
弹出 PromptPicker 侧边抽屉（支持搜索/分类筛选）
    │
    ├── 选中一条提示词
    │       │
    │       ▼
    │   检测是否含变量占位符（如 {角色描述}）
    │       │
    │       ├── 有变量 → 弹出 VariableFillModal 表单 → 用户逐个填写 → 拼接完整
    │       │
    │       └── 无变量 → 直接使用原文
    │       │
    │       ▼
    │   填充到当前节点的描述输入框（替换或追加）
    │       │
    │       ▼
    │   用户可自由修改文本 → 点击生成
    │
    └── 后端记录 use_count +1
```

### 10.3 技能应用流程

```
画布节点 → 点击「技能库」按钮
    │
    ▼
弹出 SkillPicker 侧边抽屉（支持搜索/分类筛选/按类型过滤）
    │
    ├── 选中一个技能
    │       │
    │       ▼
    │   返回完整技能数据（提示词模板 + 模型 + 参数 + 变量定义）
    │       │
    │       ▼
    │   检测提示词模板中的变量占位符
    │       │
    │       ├── 有变量 → 弹出 VariableFillModal 表单 → 用户填写
    │       │
    │       └── 无变量 → 直接使用
    │       │
    │       ▼
    │   一键应用到当前节点：
    │     • 填充提示词到描述框
    │     • 设置模型选择
    │     • 设置分辨率/时长/比例/音频等参数
    │     • 设置生成模式（首尾帧/全能参考）
    │       │
    │       ▼
    │   用户可微调任意参数 → 点击生成
    │
    └── 后端记录 use_count +1
```

### 10.4 画布内保存为提示词/技能

```
画布节点生成成功后 → 右键菜单
    │
    ├── 「保存为提示词」
    │       │
    │       ▼
    │   弹出 SaveAsPromptModal
    │     • 标题（默认取提示词前 20 字）
    │     • 分类（下拉选择）
    │     • 内容（默认填入当前提示词，可编辑）
    │     • 变量提取（自动检测 {xxx} 格式，用户可标记哪些是变量）
    │     • 可选预览图（从当前生成结果选取）
    │       │
    │       ▼
    │   保存到 prompts 表 → 全局可见
    │
    └── 「保存为技能」
            │
            ▼
        弹出 SaveAsSkillModal
          • 标题
          • 分类
          • 提示词模板（默认填入当前提示词）
          • 变量提取
          • 模型（默认填入当前节点使用的模型）
          • 参数（默认填入当前节点的所有参数：分辨率/时长/比例/音频/模式）
          • 可选预览图
            │
            ▼
        保存到 skills 表 → 全局可见
```

### 10.5 变量占位符机制

提示词和技能的提示词模板中支持 `{变量名}` 格式的占位符：

```
提示词模板: "{角色描述}站在{场景}中，{氛围}色调，电影级光影"

variables JSONB:
[
  { "name": "角色描述", "key": "{角色描述}", "required": true },
  { "name": "场景", "key": "{场景}", "required": true },
  { "name": "氛围", "key": "{氛围}", "required": false }
]
```

应用时弹出表单：
```
┌─────────────────────────────┐
│  填写变量                    │
├─────────────────────────────┤
│  角色描述 *                  │
│  ┌─────────────────────────┐│
│  │ 古风少女，红衣            ││
│  └─────────────────────────┘│
│  场景 *                      │
│  ┌─────────────────────────┐│
│  │ 竹林                     ││
│  └─────────────────────────┘│
│  氛围                       │
│  ┌─────────────────────────┐│
│  │ 暖色                     ││
│  └─────────────────────────┘│
│         [取消]  [确认填充]   │
└─────────────────────────────┘
```

### 10.6 预设分类

| 分类名 | 适用类型 | 说明 |
| --- | --- | --- |
| 图片生成 | 提示词 + 技能 | 文生图、图生图的提示词和参数预设 |
| 视频生成 | 提示词 + 技能 | 文生视频、图生视频的提示词和参数预设 |
| 分镜编排 | 提示词 + 技能 | 分镜描述、镜头语言模板 |
| 风格变换 | 提示词 + 技能 | 特定风格（赛博朋克、水彩、油画等） |
| 角色动画 | 技能 | 角色动作、运镜方式预设 |

管理员可在管理页面增删分类，用户上传时只能选择已有分类。

### 10.7 XSS 防护（安全设计）

#### 问题

提示词和技能由用户上传，全局共享。如果用户在 `content` / `prompt_template` / `title` / `description` 字段中注入恶意脚本（如 `<script>alert('xss')</script>`），在其他用户浏览或应用时可能被触发。

#### 防护策略：后端存原文、前端渲染必转义

| 层面 | 措施 | 说明 |
| --- | --- | --- |
| **后端存储** | 不清洗，存原文 | 保留用户输入的完整内容，不破坏提示词中的合法特殊字符 |
| **后端 API 返回** | 不转义，返回原文 | 保持 API 数据的原始性，转义是前端职责 |
| **前端列表渲染** | React 默认转义 | React 的 `{variable}` 语法自动 HTML 转义，不会执行 `<script>` |
| **前端填充到输入框** | textarea / input 的 value 属性 | 表单元素的 value 不会解析 HTML，天然安全 |
| **前端富文本展示** | 禁用 `dangerouslySetInnerHTML` | 全项目禁止使用 `dangerouslySetInnerHTML`，如需渲染换行用 `white-space: pre-wrap` |

#### 前端渲染规则

```typescript
// ✅ 安全：React 自动转义
<p>{prompt.title}</p>
<p>{prompt.content}</p>

// ✅ 安全：textarea 的 value 不解析 HTML
<textarea value={prompt.content} readOnly />

// ✅ 安全：需要换行展示时用 CSS，不用 innerHTML
<p style={{ whiteSpace: 'pre-wrap' }}>{prompt.content}</p>

// ❌ 禁止：绝对不能这样写
<div dangerouslySetInnerHTML={{ __html: prompt.content }} />
```

#### Zod 后端校验

上传提示词/技能时，后端对关键字段做长度限制和内容校验：

```typescript
// backend/src/schemas/prompt.schema.ts

export const createPromptSchema = z.object({
  title: z.string().trim().min(1).max(128),       // 标题最长 128 字符
  content: z.string().trim().min(1).max(5000),      // 内容最长 5000 字符
  categoryId: z.number().int().positive().optional(),
  contentType: z.enum(['image', 'video']),
  variables: z.array(z.object({
    name: z.string().trim().max(64),
    key: z.string().trim().max(64).regex(/^\{[^}]+\}$/),  // 必须是 {xxx} 格式
    required: z.boolean(),
  })).max(20),                                       // 最多 20 个变量
  previewImageUrl: z.string().url().optional(),
})
```

```typescript
// backend/src/schemas/skill.schema.ts

export const createSkillSchema = z.object({
  title: z.string().trim().min(1).max(128),
  description: z.string().trim().max(500).optional(),
  skillType: z.enum(['image', 'video']),
  promptTemplate: z.string().trim().min(1).max(5000),
  variables: z.array(z.object({
    name: z.string().trim().max(64),
    key: z.string().trim().max(64).regex(/^\{[^}]+\}$/),
    required: z.boolean(),
  })).max(20),
  model: z.string().trim().min(1).max(64),
  params: z.record(z.unknown()).refine(
    (val) => JSON.stringify(val).length <= 2000,
    '参数 JSON 不能超过 2000 字符'
  ),
  previewImageUrl: z.string().url().optional(),
})
```

#### 补充措施

| 措施 | 说明 |
| --- | --- |
| **举报机制** | 提示词/技能列表页每条内容可「举报」，管理员后台审核处理 |
| **管理员下架** | 管理员可将 `status` 设为 `hidden`，列表不展示但数据保留 |
| **预览图白名单** | `previewImageUrl` 只接受 HTTPS URL，且后端代理加载（不直接在前端 `<img src>` 用户可控 URL，防止 SSRF） |
| **CSP 头** | 后端设置 `Content-Security-Policy: default-src 'self'`，即使有 XSS 也无法加载外部脚本 |

## 11. 生成耗时展示

### 11.1 需求

用户点击生成后，节点上显示实时计时器；生成完成后展示总耗时。

### 11.2 节点状态与计时

| 节点状态 | 展示内容 |
| --- | --- |
| `idle` | 无计时（未生成） |
| `generating` | 实时跳动的计时器 `00:12`（从点击生成开始计时） |
| `succeeded` | 总耗时 `耗时 1分23秒` |
| `failed` | 总耗时 + 错误信息 |

### 11.3 前端实现

```typescript
// frontend/src/hooks/useGenerationTimer.ts

import { useEffect, useRef, useState } from 'react'

/**
 * 生成计时器 Hook
 * generating 为 true 时开始计时，false 时停止
 */
export const useGenerationTimer = (generating: boolean) => {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (generating) {
      startRef.current = Date.now()
      setElapsed(0)
      intervalRef.current = setInterval(() => {
        if (startRef.current) {
          setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
        }
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [generating])

  return elapsed
}

/** 格式化秒数为 mm:ss */
export const formatElapsed = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
```

### 11.4 节点组件中使用

```typescript
// frontend/src/components/canvas/CanvasNode.tsx（节选）

const VideoGenNode = ({ data }: NodeProps) => {
  const { status, startedAt, completedAt } = data as VideoGenNodeData
  const isGenerating = status === 'generating' || status === 'pending'
  const elapsed = useGenerationTimer(isGenerating)

  // 已完成的任务用后端返回的时间差
  const totalTime = status === 'succeeded' || status === 'failed'
    ? completedAt && startedAt
      ? Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      : 0
    : elapsed

  return (
    <div>
      {/* 节点头部 */}
      {isGenerating ? (
        <div className="flex items-center gap-2 text-blue-500">
          <Spinner />
          <span className="font-mono text-sm">{formatElapsed(elapsed)}</span>
        </div>
      ) : status === 'succeeded' ? (
        <span className="text-green-500 text-xs">
          ✓ 耗时 {formatElapsed(totalTime)}
        </span>
      ) : status === 'failed' ? (
        <span className="text-red-500 text-xs">
          ✗ 失败（{formatElapsed(totalTime)}）
        </span>
      ) : null}
    </div>
  )
}
```

### 11.5 后端返回时间字段

`generation_tasks` 表已有 `created_at` 和 `updated_at`，前端请求任务状态时后端返回这两个时间戳：

```typescript
// API 返回的任务状态中包含时间
interface GenerationTaskStatus {
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  startedAt: string    // = created_at（任务创建时间 = 开始时间）
  completedAt: string | null  // = updated_at（状态变更时间 = 完成时间）
  // ... 其他字段
}
```

### 11.6 计时器销毁

- 节点状态变为 `succeeded` 或 `failed` 时，Hook 自动停止计时
- 节点被删除时，React 卸载组件，`useEffect` 清理函数清除 `setInterval`
- 页面刷新后重新加载画布，已完成节点直接从后端时间戳计算总耗时，不重新计时

## 12. 创意助手

### 11.1 模块定位

画布右侧内置 AI 对话面板，帮助用户写/优化提示词、拆解分镜、分析构图。AI 回复的提示词可一键发送到当前选中的画布节点或保存到提示词中心。

### 11.2 交互流程

```
画布（左侧）                    创意助手（右侧面板）
┌──────────────────────┐    ┌─────────────────────────────┐
│                      │    │ 💬 对话区                    │
│  [图片节点] [视频节点] │    │                             │
│                      │    │ 用户: 帮我写3个赛博朋克      │
│  [文本节点]           │    │ 风格的角色视频提示词         │
│                      │    │                             │
│                      │    │ AI: 1. 霓虹灯光下的少女...   │
│                      │    │    2. 雨夜城市追逐...        │
│                      │    │    3. 全息广告牌前的对决...   │
│                      │    │    [发送到节点 ↓] [保存为提示词]│
│                      │    └─────────────────────────────┘
└──────────────────────┘
```

### 11.3 对话操作

| 操作 | 说明 |
| --- | --- |
| 发送消息 | 用户输入 → 后端调用 Provider `chatCompletion` → 返回 AI 回复 |
| 发送到节点 | AI 回复中的一段文字 → 一键填充到当前选中的画布节点描述框 |
| 保存为提示词 | AI 回复中的一段文字 → 保存到提示词中心供其他用户使用 |
| 对话历史 | 按 session 存储在数据库，刷新不丢失，可创建多个对话 |
| 系统提示词 | 内置创意助手 system prompt（角色：专业提示词工程师） |

### 11.4 系统提示词

```text
你是一个专业的 AI 创意助手，擅长：
1. 撰写和优化图片/视频生成的提示词
2. 将故事/剧本拆解为分镜描述
3. 分析画面构图、风格、色调，给出专业提示词建议
4. 根据用户需求推荐合适的模型和参数

回复要求：
- 提示词用代码块包裹，方便用户复制
- 每条提示词独立编号，方便用户选择
- 如需变量，用 {变量名} 格式标注
- 简洁专业，不废话
```

### 11.5 并发与限流

| 机制 | 说明 |
| --- | --- |
| 后端异步 | Koa 非阻塞，多用户并发请求互不干扰 |
| 数据库隔离 | 对话按 `user_id` 隔离，写入不冲突 |
| API 限流 | 后端对 `/api/chat/sessions/:id/send` 加速率限制（如 10 次/分钟/用户） |
| 重试机制 | ToAPIs 返回 429 时自动指数退避重试（Provider 层处理） |

### 11.6 复用 TwitCanva 组件

- `src/components/ChatPanel.tsx`（25KB）— TwitCanva 已有完整聊天面板 UI，改造 API 对接即可
- `src/components/ChatMessage.tsx`（6.7KB）— 消息渲染组件，直接复用

## 13. OSS 流量优化（图片/音频/视频）

### 13.1 问题

素材包含三种类型，访问模式完全不同：

| 类型 | 文件大小 | 访问频率 | 特点 |
| --- | --- | --- | --- |
| 图片 | 几 KB ~ 几 MB | 高（列表缩略图 + 画布节点预览） | 频繁全量加载 |
| 音频 | 几 MB ~ 几十 MB | 中（画布节点预览 + 生成参考） | 需流式播放 |
| 视频 | 几十 MB ~ 几百 MB | 中（画布节点预览 + 生成参考） | 体积最大，不能全量加载 |

当前每次打开素材列表，所有素材都重新拉取签名 URL + 全量加载预览，导致流量浪费。

### 13.2 按类型分层优化

#### 图片：缩略图 + 懒加载 + CDN 缓存

```
素材列表（50 张图片）
    │
    ├── 列表页只加载缩略图（OSS 图片处理参数 ?x-oss-process=image/resize,w_200）
    │   └── 不加载原图，流量降低 90%
    │
    ├── 懒加载：只加载视口内的 8-10 张
    │   └── 其余滚动到才加载
    │
    └── 点击查看大图 / 拖入画布时才加载原图
```

```typescript
// backend/src/services/oss.service.ts

public getThumbnailUrl(ossKey: string): string {
  // OSS 图片处理：生成 200px 宽的缩略图 URL
  // 不走签名，用公共读 bucket 或 CDN 加速
  return `${this.publicBucketUrl}/${ossKey}?x-oss-process=image/resize,w_200/quality,q_80`
}

public getSignedUrl(ossKey: string, ttlSeconds?: number): Promise<string> {
  // 原图走签名 URL（大图可能有权限控制）
  return this.generateSignedUrl(ossKey, ttlSeconds)
}
```

```typescript
// frontend/src/components/AssetThumbnail.tsx

import { useInView } from 'react-intersection-observer'

export const AssetThumbnail = ({ asset }: { asset: AssetItem }) => {
  const { ref, inView } = useInView({ threshold: 0.1 })

  if (asset.assetType !== 'Image') return null

  return (
    <div ref={ref} className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
      {inView ? (
        <img
          src={asset.thumbnailUrl}    // 缩略图 URL（轻量）
          alt={asset.name}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full animate-pulse bg-gray-200" />
      )}
    </div>
  )
}
```

#### 音频：签名 URL + 预加载控制

```
素材列表中的音频
    │
    ├── 列表页：只显示文件名 + 时长 + 播放按钮（不加载音频数据）
    │
    ├── 点击播放：请求签名 URL → <audio> 标签流式播放
    │   └── 浏览器只下载播放头附近的数据，不全量加载
    │
    └── 拖入画布：传入签名 URL，不预加载
```

```typescript
// frontend/src/components/AssetAudioItem.tsx

export const AssetAudioItem = ({ asset }: { asset: AssetItem }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  const handlePlay = async () => {
    if (!signedUrl) {
      // 点击播放时才请求签名 URL
      const url = await getAssetSignedUrl(asset.id)
      setSignedUrl(url)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{asset.name}</span>
      <span className="text-xs text-gray-400">{asset.duration}s</span>
      <button onClick={handlePlay}>▶</button>
      {signedUrl && <audio src={signedUrl} controls />}
    </div>
  )
}
```

#### 视频：签名 URL + 不自动加载

```
素材列表中的视频
    │
    ├── 列表页：显示第一帧缩略图 + 时长（不加载视频文件）
    │   └── 视频第一帧通过 OSS 视频截帧 ?x-oss-process=video/snapshot,t_0,f_jpg,w_200
    │
    ├── 点击预览：请求签名 URL → <video> 标签流式播放
    │   └── preload="none"，不预加载任何数据
    │
    └── 拖入画布：传入签名 URL，画布节点内按需播放
```

```typescript
// backend/src/services/oss.service.ts

public getVideoPosterUrl(ossKey: string): string {
  // OSS 视频截帧：取第 0 秒画面作为缩略图
  return `${this.publicBucketUrl}/${ossKey}?x-oss-process=video/snapshot,t_0,f_jpg,w_300,h_200`
}
```

```typescript
// frontend/src/components/AssetVideoItem.tsx

export const AssetVideoItem = ({ asset }: { asset: AssetItem }) => {
  const { ref, inView } = useInView({ threshold: 0.1 })
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  const handlePreview = async () => {
    if (!signedUrl) {
      const url = await getAssetSignedUrl(asset.id)
      setSignedUrl(url)
    }
  }

  return (
    <div ref={ref} className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
      {inView && (
        <img
          src={asset.videoPosterUrl}    // 视频截帧图（轻量）
          alt={asset.name}
          className="w-full h-full object-cover"
        />
      )}
      <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1 rounded">
        {formatDuration(asset.duration)}
      </div>
      <button
        onClick={handlePreview}
        className="absolute inset-0 flex items-center justify-center"
      >
        <PlayIcon className="w-8 h-8 text-white/80" />
      </button>
      {signedUrl && (
        <video src={signedUrl} controls preload="none" className="w-full h-full" />
      )}
    </div>
  )
}
```

### 13.3 后端签名 URL 缓存（三种类型通用）

无论图片、音频、视频，签名 URL 在有效期内不变，后端缓存避免重复生成：

```typescript
// backend/src/services/oss.service.ts

// 签名 URL 内存缓存
private signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

public async getSignedUrl(ossKey: string, ttlSeconds?: number): Promise<string> {
  const ttl = ttlSeconds ?? 3600
  const now = Date.now()

  const cached = this.signedUrlCache.get(ossKey)
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.url    // 缓存命中，直接返回
  }

  const url = await this.ossClient.signatureUrl(ossKey, { expire: ttl })
  this.signedUrlCache.set(ossKey, { url, expiresAt: now + ttl * 1000 })
  return url
}
```

### 13.4 前端素材列表缓存

```typescript
// frontend/src/stores/asset.tsx

let cachedAssets: AssetItem[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 30_000  // 30 秒内不重复请求

export const useAssets = () => {
  const [assets, setAssets] = useState<AssetItem[]>(cachedAssets ?? [])

  const fetchAssets = async (force = false) => {
    if (!force && cachedAssets && Date.now() - cacheTimestamp < CACHE_TTL) {
      setAssets(cachedAssets)  // 直接用缓存
      return
    }
    const result = await getAssets()
    cachedAssets = result.items
    cacheTimestamp = Date.now()
    setAssets(result.items)
  }

  return { assets, fetchAssets, refresh: () => fetchAssets(true) }
}
```

### 13.5 流量优化效果

| 场景 | 优化前 | 优化后 | 节省 |
| --- | --- | --- | --- |
| 素材列表 50 张图片缩略图 | 50 次原图请求（~200MB） | 50 次缩略图请求（~5MB）+ 懒加载仅 8-10 张（~1MB） | **95%** |
| 素材列表 20 个视频预览 | 20 次视频文件请求（~2GB） | 20 次截帧图请求（~2MB）+ 点击才加载视频 | **99%** |
| 素材列表 10 个音频 | 10 次音频文件预加载（~100MB） | 0 次预加载（点击播放才请求） | **100%** |
| 30 秒内重复打开素材页 | 全量重新请求 | 0 次请求（前端缓存） | **100%** |
| 签名 URL 有效期内重复请求 | 每次重新生成签名 | 后端缓存直接返回 | **100%** |

## 14. 存储治理（OSS 成本控制）

### 12.1 问题

用户在画布上频繁创建生成节点 → 生成结果存入 OSS → 删除节点 → OSS 文件残留。长期积累导致存储成本持续飙升。

### 12.2 解决方案：引用计数 + 延迟清理

```
用户删除画布节点
    │
    ▼
后端检查该节点关联的 asset（source_asset_id）
    │
    ├── asset 被其他节点 / 素材库引用 → ref_count > 0 → 保留 OSS 文件
    │
    └── asset 无其他引用 → ref_count = 0
            │
            ▼
        标记 status='orphaned'，记录 orphaned_at = now()
            │
            ▼
        定时任务（每天凌晨 3 点执行）
            │
            ├── orphaned 且 orphaned_at 超过 24 小时
            │       │
            │       ▼
            │   删除 OSS 文件 → 删除 assets 记录
            │
            └── 不到 24 小时 → 跳过（给用户反悔时间）
```

### 12.3 数据库支持

`assets` 表新增字段（已在第 4.4 节更新）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `status` | VARCHAR(16) | `active`（正常）/ `orphaned`（孤立，待清理） |
| `orphaned_at` | TIMESTAMPTZ | 标记为孤立的时间戳，定时任务按此判断是否清理 |
| `ref_count` | INTEGER | 引用计数，每次被画布节点引用 +1，解除引用 -1 |

### 12.4 引用计数维护

| 事件 | 操作 |
| --- | --- |
| 生成节点创建并关联 asset | `ref_count + 1` |
| 画布节点被删除 | `ref_count - 1`，若 `ref_count = 0` 则标记 `orphaned` |
| 素材从素材库删除 | `ref_count - 1`，若 `ref_count = 0` 则标记 `orphaned` |
| 用户手动恢复孤立素材 | `status` 改回 `active`，`orphaned_at` 置空 |
| 画布整体删除 | 遍历画布所有节点 → 逐个 `ref_count - 1` |

### 12.5 定时清理任务

```typescript
// backend/src/workers/storage-cleanup.worker.ts

// 每天凌晨 3 点执行
const CLEANUP_HOUR = 3
const ORPHAN_GRACE_HOURS = 24  // 孤立超过 24 小时才清理

const runCleanup = async () => {
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_HOURS * 60 * 60 * 1000)

  // 1. 查询待清理的孤立素材
  const orphans = await db
    .selectFrom('assets')
    .select(['id', 'oss_key'])
    .where('status', '=', 'orphaned')
    .where('orphaned_at', '<=', cutoff)
    .where('ref_count', '=', 0)
    .limit(100)  // 每次最多清理 100 个，避免单次耗时过长
    .execute()

  // 2. 逐个删除 OSS 文件 + 数据库记录
  for (const orphan of orphans) {
    try {
      await ossService.deleteObject(orphan.oss_key)
      await db.deleteFrom('assets').where('id', '=', orphan.id).execute()
    } catch {
      // OSS 删除失败不阻断流程，下次重试
    }
  }

  logger.info({ count: orphans.length }, 'storage cleanup completed')
}

// 定时触发
setInterval(() => {
  const now = new Date()
  if (now.getHours() === CLEANUP_HOUR && now.getMinutes() === 0) {
    void runCleanup()
  }
}, 60_000)
```

### 12.6 成本影响

| 场景 | 不做治理 | 做治理后 |
| --- | --- | --- |
| 用户每天创建删除 50 个生成节点 | OSS 每天新增 50 个文件，永久残留 | 最多留存 24 小时，之后自动清理 |
| 月累计 | ~1500 个文件残留，存储成本线性增长 | 残留文件不超过当天生成量，存储成本可控 |
| 生成结果入素材库保留 | 全部保留 | 有引用的保留，无引用的清理 |

## 15. 开发里程碑

| 阶段 | 内容 | 工时 |
| --- | --- | --- |
| **P1** | 项目初始化 + 后端骨架 + 数据库建表 + 认证 | 3 天 |
| **P2** | AI Provider 抽象层 + ToAPIs 适配器 + 工厂注册 | 2 天 |
| **P3** | 画布 CRUD API + 节点/连线 API | 2 天 |
| **P4** | 前端移植 TwitCanva + 路由改造 + API 适配 | 3 天 |
| **P5** | 图片生成流程（Provider → OSS → 素材 → 节点更新） | 1.5 天 |
| **P6** | 视频异步队列（BullMQ + 轮询 + 节点状态同步） | 2 天 |
| **P7** | 素材管理 + OSS 直传 | 1.5 天 |
| **P8** | 技能中心 + 提示词中心（后端 CRUD + 前端列表/上传/搜索） | 2 天 |
| **P9** | 画布内应用交互（提示词填充 + 技能应用 + 变量填充弹窗 + 右键保存） | 1.5 天 |
| **P10** | 创意助手（ChatService + Provider chatCompletion + 前端面板 + 发送到节点） | 2 天 |
| **P11** | 管理页面（用户/Provider/分类 管理） | 1 天 |
| **P12** | 存储治理（引用计数 + 定时清理 + 孤立素材管理） | 1 天 |
| **P13** | 测试 + Docker 部署 | 1 天 |
| **合计** | | **23 个工作日（约 4.5 周）** |
