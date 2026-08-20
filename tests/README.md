# 测试目录

- `backend/`：后端 Vitest 单元测试、路由测试、服务测试和 worker 测试。
- `e2e/`：前端 Playwright 端到端测试。

业务源码仍位于 `backend/src` 和 `frontend/src`。测试通过各应用现有 npm/pnpm 脚本运行：

```bash
pnpm -C backend test
pnpm -C frontend test -- --run
pnpm -C frontend test:e2e
```
