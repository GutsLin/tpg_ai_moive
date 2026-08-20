import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')

const readUtf8 = (filePath: string) => readFileSync(filePath, 'utf8')

describe('Narrix docker compose delivery assets', () => {
  it('提供 frontend/backend 生产 Dockerfile 与前端 SPA nginx 配置', () => {
    const backendDockerfilePath = path.join(repoRoot, 'backend', 'Dockerfile')
    const frontendDockerfilePath = path.join(repoRoot, 'frontend', 'Dockerfile')
    const frontendNginxConfigPath = path.join(repoRoot, 'deploy', 'nginx', 'frontend.conf')

    expect(existsSync(backendDockerfilePath)).toBe(true)
    expect(existsSync(frontendDockerfilePath)).toBe(true)
    expect(existsSync(frontendNginxConfigPath)).toBe(true)

    const backendDockerfile = readUtf8(backendDockerfilePath)
    const frontendDockerfile = readUtf8(frontendDockerfilePath)
    const frontendNginxConfig = readUtf8(frontendNginxConfigPath)

    expect(backendDockerfile).toContain('FROM node:24-bookworm-slim AS build')
    expect(backendDockerfile).toContain('RUN corepack enable')
    expect(backendDockerfile).toContain('COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml backend/tsconfig.json ./')
    expect(backendDockerfile).toContain('COREPACK_NPM_REGISTRY=https://registry.npmjs.org/')
    expect(backendDockerfile).toContain('pnpm config set registry https://registry.npmjs.org/')
    expect(backendDockerfile).toContain('pnpm install --frozen-lockfile')
    expect(backendDockerfile).toContain('RUN pnpm build')
    expect(backendDockerfile).toContain('RUN pnpm prune --prod')
    expect(backendDockerfile).toContain('CMD ["node", "dist/app.js"]')

    expect(frontendDockerfile).toContain('FROM node:24-bookworm-slim AS build')
    expect(frontendDockerfile).toContain('ARG VITE_API_BASE_URL')
    expect(frontendDockerfile).toContain('COREPACK_NPM_REGISTRY=https://registry.npmjs.org/')
    expect(frontendDockerfile).toContain('pnpm config set registry https://registry.npmjs.org/')
    expect(frontendDockerfile).toContain('pnpm install --frozen-lockfile')
    expect(frontendDockerfile).toContain('RUN pnpm build')
    expect(frontendDockerfile).toContain('FROM nginx:1.27-alpine')
    expect(frontendDockerfile).toContain('COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf')

    expect(frontendNginxConfig).toContain('resolver 127.0.0.11 ipv6=off valid=10s;')
    expect(frontendNginxConfig).toContain('location /api/')
    expect(frontendNginxConfig).toContain('set $backend_upstream backend:3000;')
    expect(frontendNginxConfig).toContain('proxy_pass http://$backend_upstream$request_uri;')
    expect(frontendNginxConfig).toContain('location / {')
    expect(frontendNginxConfig).toContain('try_files $uri /index.html;')
    expect(frontendNginxConfig).not.toContain('try_files $uri $uri/ /index.html;')
    expect(frontendNginxConfig).toContain('location = /health {')
    expect(frontendNginxConfig).toContain('return 200')
  })

  it('后端 pnpm 配置允许已审查的依赖构建脚本', () => {
    const pnpmWorkspacePath = path.join(repoRoot, 'backend', 'pnpm-workspace.yaml')

    expect(existsSync(pnpmWorkspacePath)).toBe(true)

    const pnpmWorkspace = readUtf8(pnpmWorkspacePath)

    expect(pnpmWorkspace).toContain('allowBuilds:')
    expect(pnpmWorkspace).toContain("'@alicloud/openapi-core': true")
    expect(pnpmWorkspace).toContain('msgpackr-extract: true')
  })

  it('提供包含 build 配置的本地 compose 编排', () => {
    const composePath = path.join(repoRoot, 'deploy', 'docker-compose.yml')

    expect(existsSync(composePath)).toBe(true)

    const composeContent = readUtf8(composePath)

    expect(composeContent).toContain('frontend:')
    expect(composeContent).toContain('backend:')
    expect(composeContent).toContain('postgres:')
    expect(composeContent).toContain('redis:')
    expect(composeContent).toContain('migrate:')

    expect(composeContent).toContain('image: narrix-frontend:${NARRIX_IMAGE_TAG:-local}')
    expect(composeContent).toContain('image: narrix-backend:${NARRIX_IMAGE_TAG:-local}')
    expect(composeContent).toContain('ports:')
    expect(composeContent).toContain('- ${NARRIX_FRONTEND_PORT}:80')
    expect(composeContent).toContain('- ${NARRIX_BACKEND_PORT}:3000')
    expect(composeContent).toContain("VITE_API_BASE_URL: ''")
    expect(composeContent).not.toContain('VITE_API_BASE_URL: /api')
    expect(composeContent).not.toContain('VITE_API_BASE_URL: http://localhost:${NARRIX_BACKEND_PORT}')
    expect(composeContent).toContain('NARRIX_COMPOSE_PROJECT_NAME')
    expect(composeContent.match(/NARRIX_PROFILE: \$\{NARRIX_PROFILE\}/g)).toHaveLength(3)
    expect(composeContent).toContain('DB_HOST: postgres')
    expect(composeContent).toContain('REDIS_HOST: redis')
    expect(composeContent).toContain('command: ["node", "dist/db/migrate.js"]')
    expect(composeContent).toContain('depends_on:')
    expect(composeContent).toContain('condition: service_completed_successfully')
    expect(composeContent).toContain('NARRIX_DB_VOLUME')
    expect(composeContent).toContain('NARRIX_REDIS_VOLUME')
    expect(composeContent).toContain('NARRIX_NETWORK_NAME')
    expect(composeContent).not.toContain('NARRIX_FRONTEND_IMAGE')
    expect(composeContent).not.toContain('NARRIX_BACKEND_IMAGE')
    expect(composeContent).toContain('pull_policy: never')
    expect(composeContent).toContain('build:')
    expect(composeContent).toContain('dockerfile: backend/Dockerfile')
    expect(composeContent).toContain('dockerfile: frontend/Dockerfile')
  })

  it('提供面向 ECS 源码发布包的 runtime compose 编排', () => {
    const runtimeComposePath = path.join(repoRoot, 'deploy', 'runtime-compose.yml')

    expect(existsSync(runtimeComposePath)).toBe(true)

    const runtimeComposeContent = readUtf8(runtimeComposePath)

    expect(runtimeComposeContent).toContain('frontend:')
    expect(runtimeComposeContent).toContain('backend:')
    expect(runtimeComposeContent).toContain('postgres:')
    expect(runtimeComposeContent).toContain('redis:')
    expect(runtimeComposeContent).toContain('migrate:')
    expect(runtimeComposeContent).toContain('image: narrix-frontend:${NARRIX_IMAGE_TAG:-local}')
    expect(runtimeComposeContent).toContain('image: narrix-backend:${NARRIX_IMAGE_TAG:-local}')
    expect(runtimeComposeContent).toContain('command: ["node", "dist/db/migrate.js"]')
    expect(runtimeComposeContent).toContain('NARRIX_NETWORK_NAME')
    expect(runtimeComposeContent).toContain('NARRIX_DB_VOLUME')
    expect(runtimeComposeContent).toContain('NARRIX_REDIS_VOLUME')
    expect(runtimeComposeContent.match(/NARRIX_PROFILE: \$\{NARRIX_PROFILE\}/g)).toHaveLength(3)
    expect(runtimeComposeContent).toContain('build:')
    expect(runtimeComposeContent).toContain('dockerfile: backend/Dockerfile')
    expect(runtimeComposeContent).toContain('dockerfile: frontend/Dockerfile')
    expect(runtimeComposeContent).not.toContain('NARRIX_FRONTEND_IMAGE')
    expect(runtimeComposeContent).not.toContain('NARRIX_BACKEND_IMAGE')
  })

  it('源码发布脚本不会从远程仓库拉取应用镜像', () => {
    const deployScript = readUtf8(path.join(repoRoot, 'deploy', 'scripts', 'deploy.sh'))

    expect(deployScript).toContain('compose build backend frontend')
    expect(deployScript).toContain('rollback_compose build backend frontend')
    expect(deployScript).not.toContain('compose pull')
  })
})
