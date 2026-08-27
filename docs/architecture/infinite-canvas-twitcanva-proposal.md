# 基于 TwitCanva 二次开发无限画布 — 技术方案

## 1. TwitCanva 原始架构分析

### 1.1 技术栈

| 层面 | TwitCanva 原始方案 | 问题 |
| --- | --- | --- |
| 前端框架 | React 19 + TypeScript + Vite | ✅ 可用 |
| UI 库 | Tailwind CSS + Lucide Icons | 需评估是否保留或换 Ant Design |
| 画布引擎 | **自研**（非 React Flow） | 核心资产，需保留 |
| 后端框架 | Express 5（单文件 `server/index.js`，44KB） | ❌ 需重构为模块化 |
| 数据库 | **无**（本地文件系统 `library/` 目录） | ❌ 需替换为 PostgreSQL |
| 认证 | **无** | ❌ 需新增 |
| 项目隔离 | **无** | ❌ 需新增 |
| AI 对接 | OpenAI / Gemini / Kling / MiniMax / Fal.ai | ❌ 需改为 ToAPIs |
| 状态管理 | 30+ 自定义 React Hooks | ✅ 可复用 |
| 许可证 | Apache 2.0 | ✅ 可商用 |

### 1.2 源码结构

```text
TwitCanva/
├── src/                          # 前端
│   ├── App.tsx                   # 主应用 (49KB，画布编排核心)
│   ├── types.ts                  # 类型定义
│   ├── components/
│   │   ├── canvas/               # 画布组件（核心资产）
│   │   │   ├── CanvasNode.tsx        # 节点组件 (42KB)
│   │   │   ├── NodeControls.tsx     # 节点操作面板 (90KB)
│   │   │   ├── NodeContent.tsx       # 节点内容渲染 (15KB)
│   │   │   ├── ConnectionsLayer.tsx  # 连线层 (10KB)
│   │   │   ├── NodeConnectors.tsx    # 连接点 (1.7KB)
│   │   │   ├── SelectionBoundingBox.tsx # 选区框 (20KB)
│   │   │   └── ChangeAnglePanel.tsx  # 角度控制面板 (5.8KB)
│   │   ├── modals/               # 弹窗（图片编辑器、分镜生成器等）
│   │   ├── AssetLibraryPanel.tsx # 素材库面板
│   │   ├── ChatPanel.tsx          # AI 聊天面板
│   │   ├── ContextMenu.tsx       # 右键菜单
│   │   ├── HistoryPanel.tsx      # 历史面板
│   │   ├── Toolbar.tsx           # 工具栏
│   │   └── TopBar.tsx            # 顶栏
│   ├── hooks/                    # 30+ 自定义 Hooks（核心逻辑）
│   │   ├── useCanvasNavigation.ts   # 画布平移缩放
│   │   ├── useNodeDragging.ts       # 节点拖拽
│   │   ├── useConnectionDragging.ts # 连线拖拽
│   │   ├── useGeneration.ts         # AI 生成 (17KB)
│   │   ├── useAutoSave.ts           # 自动保存
│   │   ├── useKeyboardShortcuts.ts  # 键盘快捷键
│   │   ├── useContextMenu.ts        # 右键菜单
│   │   ├── useWorkflow.ts           # 工作流保存/加载
│   │   └── ...                      # 更多
│   ├── services/                  # 前端服务层
│   │   ├── generationService.ts     # 生成请求
│   │   ├── assetService.ts          # 素材管理
│   │   └── cameraAngleService.ts    # 相机角度
│   └── utils/                     # 工具函数
│       ├── connectionHelpers.ts     # 连线校验
│       └── videoHelpers.ts          # 视频处理
├── server/                       # 后端（需重构）
│   ├── index.js                  # Express 主入口 (44KB 单文件)
│   ├── routes/                   # API 路由
│   │   ├── generation.js          # 生成接口 (17KB)
│   │   ├── storyboard.js         # 分镜接口 (38KB)
│   │   ├── local-models.js       # 本地模型 (16KB)
│   │   ├── tiktok-post.js        # TikTok 发布
│   │   └── twitter.js            # Twitter 发布
│   ├── services/                 # AI 服务适配器
│   │   ├── kling.js              # Kling AI (27KB)
│   │   ├── gemini.js             # Google Gemini (8.7KB)
│   │   ├── hailuo.js             # MiniMax/Hailuo (11KB)
│   │   ├── openai.js             # OpenAI (5KB)
│   │   └── fal.js                # Fal.ai (14KB)
│   └── agent/                    # LangGraph AI Agent
│       ├── index.js              # Agent 主入口
│       ├── graph/chatGraph.js    # 聊天图
│       └── prompts/system.js     # 系统提示词
├── config/
│   └── model-registry.json       # 模型注册表
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### 1.3 可直接复用的资产

| 模块 | 文件 | 价值 | 复用度 |
| --- | --- | --- | --- |
| **画布渲染引擎** | `src/components/canvas/*` | 自研无限画布，含平移/缩放/选区/连线 | ★★★★★ 核心资产 |
| **30+ 自定义 Hooks** | `src/hooks/*` | 画布交互逻辑全部解耦在 hooks 中 | ★★★★★ 核心资产 |
| **节点系统** | `src/components/canvas/CanvasNode.tsx` | 图片/视频/文本节点组件 | ★★★★☆ 需适配 |
| **连线系统** | `ConnectionsLayer.tsx` + `useConnectionDragging.ts` | 类型感知连线 | ★★★★☆ 需适配 |
| **右键菜单** | `ContextMenu.tsx` + `useContextMenu*.ts` | 画布右键操作 | ★★★★☆ 需适配 |
| **工作流保存** | `useWorkflow.ts` + `WorkflowPanel.tsx` | 画布保存/加载 | ★★★☆☆ 需改为数据库 |
| **模型注册表** | `config/model-registry.json` | 模型能力矩阵 | ★★★☆☆ 需改为 ToAPIs 模型 |
| **工具函数** | `src/utils/*` | 连线校验、视频处理 | ★★★★☆ 直接复用 |

### 1.4 需要重写的模块

| 模块 | 原始实现 | 重写为 | 参考来源 |
| --- | --- | --- | --- |
| **后端框架** | Express 5 单文件 | Koa + 模块化路由 | Narrix `backend/src/app.ts` |
| **数据库** | 本地文件系统 | PostgreSQL + Kysely | Narrix `backend/src/db/` |
| **认证系统** | 无 | JWT + bcrypt | Narrix `backend/src/middleware/auth.ts` |
| **项目隔离** | 无 | project_members + 权限 | Narrix `backend/src/services/project-access.service.ts` |
| **AI 对接** | Kling/Gemini/OpenAI/Fal | ToAPIs (Seedance 系列) | Narrix `backend/src/lib/ark-bearer.ts` |
| **素材存储** | 本地 `library/` | 阿里云 OSS | Narrix `backend/src/services/oss.service.ts` |
| **视频任务** | 直接调用 AI API | 异步队列 + 轮询 | Narrix `backend/src/workers/video.worker.ts` |
| **用户管理** | 无 | 用户/角色/权限 | Narrix `backend/src/services/user.service.ts` |

## 2. 目标技术栈

| 层面 | 选型 | 说明 |
| --- | --- | --- |
| 前端框架 | React 19 + TypeScript + Vite | 保留 TwitCanva 原始 |
| UI 库 | **Tailwind CSS + Ant Design 混用** | 画布区域用 Tailwind（TwitCanva 原有），管理页面用 Ant Design（参考 Narrix） |
| 画布引擎 | TwitCanva 自研引擎 | 保留，不换 React Flow |
| 后端框架 | **Koa 3** + 模块化路由 | 参考 Narrix 架构 |
| 数据库 | **PostgreSQL 16** + Kysely | 参考 Narrix 架构 |
| 缓存/队列 | **Redis** + BullMQ | 异步视频生成任务 |
| 对象存储 | **阿里云 OSS** | 素材和生成结果存储 |
| AI 平台 | **ToAPIs** | Seedance 2.0/2.5 视频生成 + 图片生成 |
| 认证 | JWT + bcrypt | 参考 Narrix |
| 部署 | Docker Compose | 参考 Narrix `deploy/` |

## 3. 改造路线图

### 3.1 整体策略

```
TwitCanva 源码
    │
    ├── 前端 src/ → 保留画布引擎，新增认证/项目/管理页面
    │
    └── 后端 server/ → 完全重写为 Koa + Kysely + PostgreSQL
         │
         ├── 参考 Narrix 的 app.ts / middleware / services 架构
         ├── 新增 canvas.service.ts（画布 CRUD）
         ├── 新增 toapis.service.ts（替换 kling/gemini/openai）
         └── 复用 Narrix 的 video.worker.ts 异步轮询模式
```

### 3.2 分阶段计划

#### 阶段 1：项目初始化 + 后端骨架（3 天）

**目标**：搭好后端框架，能跑通健康检查

```text
新建项目仓库
├── backend/
│   ├── src/
│   │   ├── app.ts                    # Koa 入口
│   │   ├── db/
│   │   │   ├── kysely.ts            # 数据库类型
│   │   │   ├── migrate.ts           # 迁移脚本
│   │   │   └── migrations/
│   │   │       ├── 001_create_users.ts
│   │   │       ├── 002_create_projects.ts
│   │   │       ├── 003_create_canvases.ts
│   │   │       ├── 004_create_assets.ts
│   │   │       └── 005_create_video_tasks.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts              # JWT 认证
│   │   │   └── project-context.ts   # 项目上下文
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── canvas.routes.ts
│   │   │   ├── asset.routes.ts
│   │   │   └── generation.routes.ts
│   │   ├── services/
│   │   │   ├── user.service.ts
│   │   │   ├── canvas.service.ts
│   │   │   ├── asset.service.ts
│   │   │   └── toapis.service.ts    # ToAPIs 适配器
│   │   ├── schemas/                  # Zod 校验
│   │   ├── utils/
│   │   └── workers/
│   │       └── video.worker.ts      # 异步视频生成
│   ├── Dockerfile
│   └── package.json
├── deploy/
│   ├── docker-compose.yml
│   └── env/
│       └── prod/stack.env
└── frontend/                         # 从 TwitCanva 拷贝
    └── ...（阶段 2 处理）
```

数据库设计：
```sql
-- 用户 + 项目 + 权限（参考 Narrix）
CREATE TABLE users (...);
CREATE TABLE projects (...);
CREATE TABLE project_members (...);

-- 画布（新增）
CREATE TABLE canvases (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  canvas_type VARCHAR(32) NOT NULL,  -- 'image' | 'video'
  viewport JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 画布节点（新增）
CREATE TABLE canvas_nodes (
  id BIGSERIAL PRIMARY KEY,
  canvas_id BIGINT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  node_type VARCHAR(32) NOT NULL,       -- 'image_gen' | 'video_gen' | 'asset' | 'text' | 'group'
  position JSONB NOT NULL,
  size JSONB,
  data JSONB NOT NULL DEFAULT '{}',
  source_asset_id BIGINT,
  source_task_id BIGINT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 画布连线（新增）
CREATE TABLE canvas_edges (
  id BIGSERIAL PRIMARY KEY,
  canvas_id BIGINT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  source_node_id BIGINT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  target_node_id BIGINT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  source_handle VARCHAR(64),
  target_handle VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 素材（参考 Narrix）
CREATE TABLE assets (...);

-- 视频任务（参考 Narrix）
CREATE TABLE video_tasks (...);
```

#### 阶段 2：前端移植 + 适配（3 天）

**目标**：TwitCanva 前端能跑起来，接入新后端 API

改动清单：
| 文件 | 改动内容 |
| --- | --- |
| `src/App.tsx` | 拆分路由：画布编辑器作为 `/canvas/:id` 路由，新增登录页/列表页 |
| `src/services/generationService.ts` | 改为调用新后端 `/api/generation/*` |
| `src/hooks/useAutoSave.ts` | 从本地存储改为调用 `/api/canvases/:id` 自动保存 |
| `src/hooks/useWorkflow.ts` | 从本地文件改为调用画布 CRUD API |
| `src/hooks/useGeneration.ts` | 改为对接 ToAPIs via 后端代理 |
| `src/components/AssetLibraryPanel.tsx` | 对接新后端素材 API |
| `src/types.ts` | 新增 Canvas/Project/User 类型 |
| 新增 `src/pages/Login.tsx` | 登录页 |
| 新增 `src/pages/CanvasList.tsx` | 画布列表页 |
| 新增 `src/stores/auth.tsx` | 认证状态管理 |

#### 阶段 3：AI 对接改造（2 天）

**目标**：ToAPIs 替换所有原始 AI 服务

```typescript
// backend/src/services/toapis.service.ts

export class ToApisService {
  constructor(
    private readonly endpoint: string,    // https://toapis.com/v1
    private readonly apiKey: string,
  ) {}

  // 图片生成
  async generateImage(input: {
    prompt: string
    model: string          // 'gpt-image-2' 等
    size?: string           // '1024x1024'
    referenceImages?: string[]  // 图生图引用
  }): Promise<{ url: string }> {
    const response = await fetch(`${this.endpoint}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        size: input.size ?? '1024x1024',
      }),
    })
    const result = await response.json()
    return { url: result.data[0].url }
  }

  // 视频生成（异步任务）
  async createVideoTask(input: {
    prompt: string
    model: string          // 'seedance-2' | 'seedance-2-5'
    duration?: number
    ratio?: string
    resolution?: string
    generateAudio?: boolean
    content: unknown[]     // 参考素材
  }): Promise<{ taskId: string }> {
    const response = await fetch(`${this.endpoint}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(input),
    })
    const result = await response.json()
    return { taskId: result.id }
  }

  // 查询视频任务状态
  async getVideoTask(taskId: string): Promise<{
    status: string
    videoUrl?: string
    errorMessage?: string
  }> {
    const response = await fetch(
      `${this.endpoint}/contents/generations/tasks/${taskId}`,
      {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      }
    )
    return response.json()
  }
}
```

删除原始 AI 服务文件：
- `server/services/kling.js`
- `server/services/gemini.js`
- `server/services/hailuo.js`
- `server/services/openai.js`
- `server/services/fal.js`

#### 阶段 4：认证 + 项目隔离（2 天）

参考 Narrix 实现：
- JWT 认证中间件
- 项目上下文中间件（`X-Project-Id` header）
- 画布/素材/任务按 `project_id` 隔离
- 用户角色：admin / user
- 菜单权限控制

#### 阶段 5：素材管理 + OSS 集成（2 天）

- 上传素材到阿里云 OSS
- 签名 URL 生成
- 素材 CRUD + 分类
- 画布节点拖入已有素材

#### 阶段 6：视频生成异步队列（2 天）

参考 Narrix 的 worker 模式：
- BullMQ + Redis 异步队列
- 视频生成任务创建 → 落库 → worker 消费 → 轮询状态 → 下载结果 → OSS 上传
- 画布节点状态自动更新

#### 阶段 7：测试 + 部署（2 天）

- Docker Compose 部署配置
- 数据库迁移验证
- 端到端功能测试

## 4. 模型注册表适配

```json
// config/model-registry.json（改为 ToAPIs 模型）

{
  "imageModels": [
    {
      "id": "gpt-image-2",
      "label": "GPT Image 2",
      "provider": "toapis",
      "capabilities": {
        "textToImage": true,
        "imageToImage": true,
        "maxReferenceImages": 5
      },
      "sizes": ["1024x1024", "1536x1024", "1024x1536"]
    }
  ],
  "videoModels": [
    {
      "id": "seedance-2",
      "label": "Seedance 2.0",
      "provider": "toapis",
      "capabilities": {
        "textToVideo": true,
        "imageToVideo": true,
        "firstLastFrame": true,
        "generateAudio": true
      },
      "durations": [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      "resolutions": ["480p", "720p", "1080p", "4k"],
      "aspectRatios": ["16:9", "9:16", "1:1"]
    },
    {
      "id": "seedance-2-fast",
      "label": "Seedance 2.0 Fast",
      "provider": "toapis",
      "capabilities": {
        "textToVideo": true,
        "imageToVideo": true,
        "firstLastFrame": true,
        "generateAudio": true
      },
      "durations": [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      "resolutions": ["480p", "720p"],
      "aspectRatios": ["16:9", "9:16", "1:1"]
    },
    {
      "id": "seedance-2-5",
      "label": "Seedance 2.5",
      "provider": "toapis",
      "capabilities": {
        "textToVideo": true,
        "imageToVideo": true,
        "firstLastFrame": true,
        "referenceVideo": true,
        "referenceAudio": true,
        "generateAudio": true
      },
      "durations": [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "resolutions": ["480p", "720p"],
      "aspectRatios": ["16:9", "9:16", "1:1", "adaptive"]
    }
  ]
}
```

## 5. 删除清单

以下 TwitCanva 功能在二次开发中删除（与你的业务无关）：

| 功能 | 涉及文件 | 删除原因 |
| --- | --- | --- |
| TikTok 导入 | `useTikTokImport.ts` + `TikTokImportModal.tsx` + `server/tools/tiktok.js` | 无需求 |
| Twitter/X 发布 | `TwitterPostModal.tsx` + `server/routes/twitter.js` + `server/services/twitter.js` | 无需求 |
| TikTok 发布 | `TikTokPostModal.tsx` + `server/routes/tiktok-post.js` + `server/services/tiktok-post.js` | 无需求 |
| 本地模型 | `useLocalModelNodeHandlers.ts` + `server/routes/local-models.js` + `server/services/local-inference.js` + `scripts/inference.py` | 无 GPU 需求 |
| 相机角度控制 | `OrbitCameraControl.tsx` + `ChangeAnglePanel.tsx` + `cameraAngleService.ts` + `server/python/camera-angle/` + `modal/camera_angle.py` | 无需求 |
| LangGraph Agent | `server/agent/*` | 暂不需要 AI 聊天 |
| face-api.js | `useFaceDetection.ts` + `face-api.js` 依赖 | 无需求 |
| Three.js | `@react-three/fiber` + `@react-three/drei` + `three` 依赖 | 3D 需求暂不需要 |

## 6. 工时估算

| 阶段 | 内容 | 工时 |
| --- | --- | --- |
| 1 | 后端骨架 + 数据库 + 认证 | 3 天 |
| 2 | 前端移植 + API 适配 | 3 天 |
| 3 | ToAPIs AI 对接 | 2 天 |
| 4 | 认证 + 项目隔离 | 2 天 |
| 5 | 素材管理 + OSS | 2 天 |
| 6 | 视频异步队列 | 2 天 |
| 7 | 测试 + 部署 | 2 天 |
| **合计** | | **16 个工作日（约 3.5 周）** |

## 7. 与 Narrix 的关系

| 维度 | 说明 |
| --- | --- |
| 代码 | 完全独立新仓库，不共享代码 |
| 数据库 | 独立 PostgreSQL 实例（或同实例不同 database） |
| 部署 | 独立 Docker Compose，独立端口 |
| API Key | 独立的 ToAPIs API Key（或共享 per-member 体系） |
| 用户体系 | 独立用户表（未来可考虑 SSO 打通） |
| 参考 | 参考 Narrix 的架构模式，不直接复制代码 |
