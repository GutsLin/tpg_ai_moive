# Narrix 项目说明

## 项目基本信息

- 产品名称：Narrix
- 客户交付上下文：成都漫剧平台
- 客户：调皮狗传媒
- 后端：Node.js 22 + Koa2 + TypeScript + Kysely + PostgreSQL
- 前端：React 18 + TypeScript + Vite + Ant Design + Axios

## 业务背景

Narrix 是视频生成管理平台，核心功能包括：

1. 火山资产库接入：素材上传到火山引擎即梦私域素材库，管理素材审核状态，生成视频时从资产库选择素材。
2. 用户体系：登录、JWT 认证、菜单级权限控制，账号由管理员手动创建。
3. 素材存储安全：阿里云 OSS 私有桶，所有访问经后端签发临时 URL，上传使用 STS 临时凭证。
4. 可配置化基础架构：服务商配置后台支持 API Key、Endpoint、OSS 配置，并支持配置热加载。

## 后端规范

### 外部服务集成

#### 火山引擎即梦 - 视频生成接口

- 接口：`POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`
- 认证：HTTP Header `Authorization: Bearer $ARK_API_KEY`
- 注意：异步接口，需轮询任务状态，使用 BullMQ 队列驱动轮询。

#### 火山引擎即梦 - 素材资产库接口

- 认证：AK/SK 鉴权，使用 HMAC-SHA256 V4 签名。
- 接口域名：`open.volcengineapi.com`
- 与视频生成接口的 Bearer Token 认证方式不同，不能混用。

### 目录约定

```text
backend/src/
├── app.ts
├── middleware/
├── routes/
├── controllers/
├── services/
├── workers/
├── db/
└── schemas/
```

### 后端禁止事项

- controller 层只做请求解析和响应组装，业务逻辑放在 service 层。
- 禁止在 controller 层直接写数据库查询。
- 禁止修改已执行的 migration 文件。
- 禁止引入 Prisma、Sequelize、TypeORM 等重 ORM。
- 禁止绕过 OSS 后端签名，将私有桶 URL 直接暴露给前端。
- 禁止在代码中硬编码 API Key、密码等敏感信息。

## 前端规范

- 后端服务本地地址默认使用 `http://localhost:3000`，开发环境通过 `VITE_API_BASE_URL` 配置。
- 文件上传使用后端签发的 STS 临时凭证直传阿里云 OSS。
- 所有页面图片和视频 URL 从后端接口获取动态签名 URL。
- 页面组件禁止直接调用 axios，必须通过 `src/api/` 层封装。
- API 地址统一从环境变量读取。
- 禁止在前端存储或展示原始 OSS 私有 URL。
