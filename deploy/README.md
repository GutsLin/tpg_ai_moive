# Narrix Deployment Guide

本目录承载 Narrix 自部署版本的部署与运维资产，适用于测试环境与生产环境部署。前后端应用镜像均在目标服务器上从源码构建，不依赖远程应用镜像仓库。

## 环境约定

| Profile | Compose Project | Frontend | Backend | DB Name | DB User | Network |
| --- | --- | --- | --- | --- | --- | --- |
| `prod` | `narrix-prod` | `8080` | `3000` | `narrix_prod` | `narrix_prod` | `narrix_prod_net` |
| `dev` | `narrix-dev` | `18080` | `13000` | `narrix_dev` | `narrix_dev` | `narrix_dev_net` |

compose 基础编排包含：

- `frontend`
- `backend`
- `postgres`
- `redis`
- `migrate`
- `worker-video`
- `worker-asset-sync`

两个 worker 使用独立服务运行，便于单独重启、单独查看日志和后续扩展。

## 部署前准备

部署前请确认：

1. 宿主机已安装 Docker Engine 与 Docker Compose Plugin。
2. 已预留前端、后端端口，并确认未被其他服务占用。
3. 已准备 PostgreSQL 与 Redis 持久化磁盘空间。
4. 目标服务器可访问 npm 官方仓库，或已准备完整的离线依赖缓存。
5. 已生成高强度的 `NARRIX_JWT_SECRET` 与 `NARRIX_CONFIG_ENCRYPTION_KEY`。
6. 已准备 OSS、火山视频、火山素材资产库所需账号与密钥。
7. 如启用主机防火墙，请放通 Docker bridge 网络中的容器互通规则。

应用镜像固定使用本地名称 `narrix-backend` 和 `narrix-frontend`。`NARRIX_IMAGE_TAG` 仅用于区分本地构建版本，环境文件中不再配置远程镜像仓库。

变量模板：

- `deploy/env/prod/stack.env.example`
- `deploy/env/dev/stack.env.example`

## 首次部署流程

1. 复制环境模板并填写真实值。

```bash
cp deploy/env/prod/stack.env.example deploy/env/prod/stack.env
cp deploy/env/dev/stack.env.example deploy/env/dev/stack.env
```

2. 从源码构建并启动测试环境。

```bash
docker compose   -f deploy/docker-compose.yml   --env-file deploy/env/dev/stack.env   up -d --build
```

3. 从源码构建并启动生产环境。

```bash
docker compose   -f deploy/docker-compose.yml   --env-file deploy/env/prod/stack.env   up -d --build
```

4. 查看服务状态。

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env ps
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env logs backend --tail=100
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env logs worker-video --tail=100
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env logs worker-asset-sync --tail=100
```

## 升级流程

1. 停止当前服务或确认业务低峰。
2. 备份 PostgreSQL 与 Redis 数据。
3. 更新后端、前端源码包。
4. 重新执行带 `--build` 的 compose 启动命令。
5. 检查 `migrate`、`backend`、`worker-video`、`worker-asset-sync` 日志。
6. 登录前端完成核心业务冒烟测试。

## 备份建议

- PostgreSQL：每日全量备份，升级前额外备份一次。
- Redis：如启用持久化，升级前保留数据卷快照。
- OSS：客户侧按对象存储策略启用生命周期与备份。

## 常用命令

```bash
# 查看服务
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env ps

# 查看日志
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env logs backend --tail=100

# 重启后端
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env restart backend

# 停止环境
docker compose -f deploy/docker-compose.yml --env-file deploy/env/prod/stack.env down
```

源码发布脚本会先执行 `docker compose build backend frontend`，再启动数据库、迁移和应用服务，不会执行 `docker compose pull`：

```bash
sudo bash deploy/scripts/deploy.sh prod manual prod-local
```
