# Narrix 部署与运维说明书

| 项目 | 说明 |
| --- | --- |
| 文档编号 | NARRIX-OPS-08 |
| 文档版本 | V1.0 |
| 适用系统 | Narrix 自部署交付版本 |
| 编制依据 | `deploy/docker-compose.yml`、`deploy/runtime-compose.yml`、`deploy/env/*` |

## 1. 部署架构

Narrix 使用 Docker Compose 编排部署，前后端应用镜像在目标服务器上从源码构建，不依赖远程应用镜像仓库。运行服务包括：

| 服务 | 说明 |
| --- | --- |
| `frontend` | 前端管理台 |
| `backend` | 后端接口服务 |
| `postgres` | PostgreSQL 数据库 |
| `redis` | Redis 队列服务 |
| `migrate` | 数据库迁移任务 |
| `worker-video` | 视频任务 worker |
| `worker-asset-sync` | 素材同步 worker |

## 2. 环境文件

环境模板：

```text
deploy/env/dev/stack.env.example
deploy/env/prod/stack.env.example
```

生产环境准备：

```bash
cp deploy/env/prod/stack.env.example deploy/env/prod/stack.env
```

## 3. 核心环境变量

| 变量 | 说明 |
| --- | --- |
| `NARRIX_PROFILE` | 环境标识 |
| `NARRIX_COMPOSE_PROJECT_NAME` | Compose 项目名称 |
| `NARRIX_FRONTEND_PORT` | 前端端口 |
| `NARRIX_BACKEND_PORT` | 后端端口 |
| `NARRIX_DB_NAME` | 数据库名 |
| `NARRIX_DB_USER` | 数据库用户 |
| `NARRIX_DB_PASSWORD` | 数据库密码 |
| `NARRIX_DB_VOLUME` | 数据库数据卷 |
| `NARRIX_REDIS_VOLUME` | Redis 数据卷 |
| `NARRIX_NETWORK_NAME` | Docker 网络名称 |
| `NARRIX_JWT_SECRET` | token 签名密钥 |
| `NARRIX_CONFIG_ENCRYPTION_KEY` | 配置加密密钥 |
| `NARRIX_IMAGE_TAG` | 本地源码构建镜像版本 |

生产环境必须替换默认密码和默认密钥。应用镜像固定使用本地名称 `narrix-backend` 与 `narrix-frontend`，环境文件不再配置远程镜像仓库。

## 4. 启动命令

测试环境：

```bash
docker compose   -f deploy/docker-compose.yml   --env-file deploy/env/dev/stack.env   up -d --build
```

生产环境：

```bash
docker compose   -f deploy/docker-compose.yml   --env-file deploy/env/prod/stack.env   up -d --build
```

## 5. 状态检查

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env ps
```

查看日志：

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env logs backend --tail=100
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env logs worker-video --tail=100
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env logs worker-asset-sync --tail=100
```

健康检查：

```bash
curl http://localhost:3000/health
```

## 6. 数据备份

### 6.1 PostgreSQL

建议每日备份，升级前必须备份。

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env exec postgres   pg_dump -U "$NARRIX_DB_USER" "$NARRIX_DB_NAME" > narrix_backup.sql
```

### 6.2 Redis

如启用持久化，升级前保留 Redis 数据卷快照。

### 6.3 OSS

OSS 数据由客户侧对象存储策略保障，建议开启生命周期、备份和访问控制策略。

## 7. 升级流程

1. 确认维护窗口。
2. 备份 PostgreSQL、Redis 和环境配置。
3. 更新源码发布包。
4. 执行带 `--build` 的 Compose 启动命令。
5. 检查 `migrate` 是否成功执行。
6. 检查后端和两个 worker 日志。
7. 登录前端执行主流程冒烟测试。

## 8. 回退流程

1. 停止当前服务。
2. 恢复上一版本源码发布包并重新构建。
3. 如数据库已发生不兼容变更，使用备份恢复数据库。
4. 重新启动服务。
5. 执行登录、素材、视频主流程验证。

## 9. 常见问题处理

### 9.1 前端无法打开

检查前端容器、端口、防火墙和反向代理配置。

### 9.2 后端健康检查失败

检查后端日志、数据库连接、Redis 连接和环境变量是否完整。

### 9.3 安装向导提交失败

检查 OSS 配置、火山配置、数据库迁移状态和后端错误日志。

### 9.4 素材上传失败

检查 STS 配置、OSS Bucket、Region、Role ARN 和浏览器 Network。

### 9.5 视频任务长时间处理中

检查 `worker-video` 是否运行、Redis 队列是否正常、火山视频接口配置是否正确。

### 9.6 素材同步失败

检查 `worker-asset-sync` 是否运行、火山素材资产库 AK/SK 是否正确、素材组配置是否有效。

## 10. 运维巡检清单

| 检查项 | 标准 |
| --- | --- |
| 前端服务 | 页面可访问 |
| 后端服务 | `/health` 返回 ok |
| 数据库 | 容器运行，连接正常 |
| Redis | 容器运行，队列正常 |
| worker-video | 容器运行，无持续错误 |
| worker-asset-sync | 容器运行，无持续错误 |
| 磁盘空间 | 数据卷空间充足 |
| 备份 | 数据库备份按计划生成 |
| 日志 | 无持续 5xx 或外部服务异常 |
