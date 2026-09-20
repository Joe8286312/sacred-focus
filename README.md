# Sacred Focus

Sacred Focus 是一个本地优先的个人专注与效能系统。它将专注会话、习惯连续天数、可视化目标树、行为判例和系统备份放在同一套 Web/PWA 应用中，并使用 SQLite 保存全部业务数据。

## 能力概览

- **神圣座位**：记录专注/预约会话、维护连续天数、查看日志和专注热力图。
- **国策树**：在画布和列表中管理目标节点、分组、标签和拓扑关系；节点按凌晨 04:00 业务日结算。
- **演化快照**：维护国策树的 5 槽位环形快照，可导出、导入或回滚。
- **判例库**：维护允许/禁止行为及其边界条件，支持导入导出。
- **整机迁移**：导出或导入完整业务数据；导入前创建 SQLite 热备，并用维护租约保护写入。
- **安全与交付**：HttpOnly Cookie 会话、请求防护、Docker 镜像、可选 Nginx TLS 网关、数据库备份及可回滚更新。

## 技术栈

- 前端：Vue 3、TypeScript、Pinia、Vue Router、Vue Flow、Vite PWA。
- 后端：Node.js、Express、TypeScript、better-sqlite3。
- 部署：Docker Compose；可选 Nginx HTTPS 网关。

## 快速开始

要求：Node.js 22+ 与 npm。首次安装依赖后，使用两个终端启动开发服务：

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

前端开发服务器会把 `/api` 请求代理至后端。默认后端端口由 `PORT` 决定（默认 3000）；前端由 Vite 输出实际访问地址。

常用命令：

```bash
npm test                 # 跨端契约检查与后端回归测试
npm run build            # 后端、前端构建，并执行后端验证
npm run verify:delivery  # 无 Docker daemon 的交付静态预检（需要 Bash）
npm start                # 启动已构建的生产后端
```

## 项目结构

```text
contracts/       前后端共享的纯类型契约
frontend/src/    Vue 页面、Pinia 状态、应用网关与浏览器适配器
backend/src/     Express 接入、服务、repository、SQLite 基础设施与安全中间件
scripts/         构建、备份、更新、交付预检和运维手册
nginx/           可选 TLS 网关配置与本地证书辅助脚本
docs/            当前架构、模块、API/数据与开发说明
```

## 文档

- [文档索引](docs/README.md)
- [系统架构](docs/architecture.md)
- [模块说明](docs/modules.md)
- [API 与数据模型](docs/api-and-data.md)
- [开发与验证](docs/development.md)
- [部署与运维手册](scripts/README.md)

生产部署需要真实的 `.env`、密钥和（TLS 模式下）仓库外的证书目录。请遵循 [部署与运维手册](scripts/README.md)，不要将 `.env`、SQLite 数据库或私钥提交到仓库。
