# Narrix Frontend

Narrix 前端管理台用于项目工作区切换、素材组与素材管理、视频生成、系统配置和安装流程。

## 技术栈

- React 18
- TypeScript
- Vite
- Ant Design

## 本地启动

```bash
pnpm install
pnpm dev
```

类型检查与测试：

```bash
pnpm exec tsc --noEmit
pnpm test -- --run
```

E2E 回归测试：

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## 页面结构

- `src/pages/Setup`：初始化向导
- `src/pages/Projects`：项目管理
- `src/pages/Users`：用户与项目授权管理
- `src/pages/Assets`：素材组、素材上传、同步状态维护
- `src/pages/Videos`：视频生成与任务历史
- `src/pages/Config`：运行态系统配置

## 交互约束

### 项目工作区

- 用户登录后根据可访问项目列表初始化当前项目。
- 头部项目切换器切换后，素材、视频与配置视图立即刷新到当前项目。
- 前端不提供跨项目总览入口，避免弱化项目隔离。

### 素材页

- “素材分类”统一展示为“素材组”。
- 素材组管理可设置“同步火山”或“仅本地”。
- 组级关闭同步后，素材卡片上的“立即同步火山”选项禁用。
- 素材卡片展示“火山已同步 / 火山同步中 / 火山同步失败 / 未同步火山”。

### 视频页

- 素材选择器展示当前项目内可用素材。
- 已同步素材标记为“火山已同步”。
- 未同步素材标记为“未同步火山，直接走 OSS”。
- 提交 payload 时，已同步素材写成 `asset://<arkAssetId>`，未同步素材保留签名 URL。

### 安装与配置

- 页面不暴露裸 `GroupId` 输入框。
- 必须先校验火山 AK/SK。
- 校验通过后可加载已有素材组。
- 支持现场新建素材组并设为默认组。
- `OSS 签名 URL TTL` 默认值为 `3600`。
- `火山视频 Endpoint` 默认值为 `https://ark.cn-beijing.volces.com/api/v3`。
- 默认同步策略由 `Switch` 统一维护。
