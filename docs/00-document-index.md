# Narrix 软件开发项目文档目录

| 项目 | 说明 |
| --- | --- |
| 文档版本 | V1.0 |
| 适用系统 | Narrix 自部署交付版本 |
| 文档依据 | 当前交付源码、数据库迁移、前端接口封装、部署编排文件 |
| 适用对象 | 客户项目负责人、研发负责人、后端开发、前端开发、测试人员、运维人员 |
| 更新时间 | 2026-06-15 |

## 1. 文档说明

本文档包依据当前交付代码反向整理，覆盖 Narrix 的业务范围、系统设计、详细模块设计、接口设计、数据库设计、前端页面设计、测试验收和部署运维。文档用于客户验收、后续维护、二次开发和团队交接。

## 2. 文档清单

| 编号 | 文件 | 文档名称 | 内容 |
| --- | --- | --- | --- |
| 00 | `00-document-index.md` | 文档目录 | 文档清单、适用范围、阅读建议 |
| 01 | `product/01-requirements-specification.md` | 软件需求规格说明书 | 业务目标、角色、功能需求、非功能需求 |
| 02 | `architecture/02-overall-design.md` | 概要设计说明书 | 总体架构、技术架构、模块划分、核心流程 |
| 03 | `architecture/03-detailed-design.md` | 详细设计说明书 | 后端模块、前端模块、后台任务、权限与配置设计 |
| 04 | `architecture/04-api-design.md` | API 接口设计说明书 | 接口清单、认证方式、请求参数、响应结构 |
| 05 | `architecture/05-database-design.md` | 数据库设计说明书 | 表结构、字段、索引、关系、配置项 |
| 06 | `architecture/06-frontend-design.md` | 前端页面设计说明书 | 路由、页面、状态、交互、权限控制 |
| 07 | `quality/07-test-and-acceptance.md` | 测试与验收说明书 | 测试范围、测试用例、验收标准 |
| 08 | `deployment/08-deployment-operations.md` | 部署与运维说明书 | 环境变量、部署步骤、备份、升级、排障 |
| 09 | `delivery/09-modification-delivery-plan.md` | 修改与交付方案 | 修改内容、时间安排、交付标准 |
| - | `integrations/toapis-video-models.md` | ToAPIs 集成说明 | 文本、图像和视频模型调用说明 |
| - | `engineering/instructions.md` | 工程约束说明 | 开发规范与目录约定 |

## 3. 推荐阅读顺序

1. 项目负责人：01、02、07、08、09。
2. 后端开发：02、03、04、05、08、engineering。
3. 前端开发：02、04、06、07。
4. 测试人员：01、04、06、07。
5. 运维人员：02、05、08、integrations。

## 4. 工程范围

交付工程包含：

```text
Narrix/
├── backend/      # 后端接口服务、数据库迁移、后台任务
├── frontend/     # 前端管理台、页面、接口封装、端到端测试
├── deploy/       # Docker Compose 编排、环境模板、Nginx 配置
├── docs/         # 软件开发项目文档（按产品、架构、质量、部署分类）
├── scripts/      # 诊断与本地运维脚本
├── tests/        # 后端单元/集成测试与前端 E2E 测试
├── config/       # 脱敏配置示例
└── README.md     # 项目入口说明
```

交付包不包含依赖目录和构建产物，客户应在目标环境重新安装依赖和构建。
