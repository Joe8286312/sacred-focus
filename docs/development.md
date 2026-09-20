# 开发与验证

## 环境与配置

- Node.js 22+、npm；Docker Desktop 仅在容器验证或交付时需要。
- 后端使用 `better-sqlite3`。如果依赖安装后原生绑定缺失，先重新安装锁定依赖并做内存 SQLite 自检，再判断业务测试是否失败。
- 本地开发可按需创建 `.env`；生产变量及其含义以 `.env.production.example` 为准。真实密钥、数据库和证书不得提交。

## 常用工作流

```bash
npm install
npm run dev:backend
npm run dev:frontend

npm test
npm run build
npm run verify:delivery
```

`npm test` 先校验共享类型，再运行后端的可执行回归测试。`npm run build` 会构建后端和前端，后端构建期间同样运行验证。验证文件会检查架构边界，也可能生成/验证 PWA 图标；不要把生成的临时运行数据当作业务改动提交。

## 修改边界

1. 先补或确认可执行测试，再移动实现。
2. 新业务用例写入 `backend/src/services/`；SQLite 访问写入相应 `repositories/`；route 只保留 HTTP 转换。
3. 新的跨端字段先更新 `contracts/domain.d.ts`，再由前后端 type re-export 消费。
4. 前端视图通过 gateway/store 调用领域能力；浏览器 API 放入 `platform/browser/`。
5. 修改完成后至少运行 `npm test` 和 `npm run build`。涉及容器配置时再运行 `npm run verify:delivery` 与 Compose 配置解析。

## 文档维护

- `README.md` 面向项目使用者，保持能力概览、快速开始与文档入口正确。
- `docs/architecture.md` 记录稳定分层和依赖方向；目录移动或边界调整时同步更新。
- `docs/modules.md` 记录模块职责和物理位置；添加或删除模块时同步更新。
- `docs/api-and-data.md` 记录公开 API、共享对象和持久化边界；变更请求/响应或表结构时同步更新。
- 部署、证书、备份与回滚流程只维护在 `scripts/README.md`，避免多份操作手册漂移。
