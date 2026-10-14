# 开发与验证

本页面向修改源码或文档的维护者。模块职责见 [模块说明](modules.md)，部署和已有服务器更新分别见 [生产部署](cloud-production-deployment.md) 与 [云服务器更新步骤](cloud-server-update.md)。

## 环境与配置

- Node.js 22+、npm；镜像构建/容器验收另需 Docker Engine 或 Docker Desktop。使用项目 TLS overlay 时，Compose 需为 2.24.4 或以上以支持 `!override`，详见 [部署条件](cloud-production-deployment.md#1-确认部署条件)。
- 从根目录安装 workspace 依赖；已有锁文件时使用 `npm ci`，需要有意更新依赖时再使用 `npm install` 并审阅 lockfile。
- 后端配置由 `backend/src/config.ts` 读取。开发模式可使用本地默认配置，生产模式要求真实高熵 `JWT_SECRET` 及有效管理员密码配置；变量说明以 `.env.production.example`、Compose 和配置源码为准。
- `dotenv.config()` 从进程当前工作目录加载 `.env`。根脚本通过 `npm --prefix backend run ...` 启动后端，npm 生命周期命令的工作目录是 `backend/`，因此默认读取 `backend/.env`；在仓库根目录直接执行 `node backend/dist/server.js` 则读取根 `.env`。从其他目录运行或显式提供环境变量时，以实际工作目录和环境为准；开发服务、账号 CLI 与构建产物必须使用同一个预期 `DATA_DIR`。
- `better-sqlite3` 含原生绑定。如果更换 Node.js 版本或安装中断导致绑定缺失，重新安装锁定依赖，并先确认内存 SQLite 可以打开，再排查业务测试。
- 真实 `.env`、数据库、证书私钥、运行日志与 `release/` 镜像包均不应纳入 Git。运行测试时不能将 `DATA_DIR` 指向生产数据；回归入口导入应用模块时也可能打开配置指定的根数据库。

配置与数据路径源码见 [backend/src/config.ts:4](../backend/src/config.ts#L4)、[backend/src/config.ts:76](../backend/src/config.ts#L76) 与 [backend/src/db/connection.ts:27](../backend/src/db/connection.ts#L27)。

## 本地启动

在项目根目录安装：

```bash
npm ci
```

分别在两个终端运行：

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

后端默认为 `http://localhost:3000`。前端 Vite 默认从 `http://localhost:5180` 启动，端口占用时可自动递增，以终端实际地址为准；`/api` 代理到后端。若地址递增超出默认来源白名单，配置对应 `ALLOWED_ORIGINS`。默认进入公用工作区，`/login` 登录管理员或已创建个人账号，没有网页注册。

如需测试个人账号，使用与开发服务相同的配置与 `DATA_DIR`：

```bash
npm --prefix backend run accounts -- create friend01
npm --prefix backend run accounts -- list
```

创建命令隐藏读取密码；用户名、密码和配额要求见 [多人使用指南](multiuser.md)。源码入口为 [backend/src/cli/accounts.ts:50](../backend/src/cli/accounts.ts#L50)。

## 验证命令与覆盖范围

根目录命令由 [package.json](../package.json) 统一入口，实际子工程脚本见 [backend/package.json](../backend/package.json) 与 [frontend/package.json](../frontend/package.json)。

| 命令 | 覆盖 |
|---|---|
| `npm run test:contracts` | `contracts/contract-compatibility.ts` 的两端类型等价断言。 |
| `npm test` | 共享类型检查，再执行 `verify.ts`、`multiuser.ts` 和 `accountSession.ts`。 |
| `npm run build:backend` | TypeScript 后端构建，随后运行后端全部回归；产物在 `backend/dist/`。 |
| `npm run build:frontend` | `vue-tsc` 类型检查与 Vite/PWA 生产构建；产物在 `frontend/dist/`。 |
| `npm run build` | 顺序执行后端与前端构建，包含后端回归。 |
| `npm run verify:delivery` | Bash 静态交付检查，不需要 Docker daemon。 |
| `bash scripts/test/docker-update-contract.sh` | 容器更新、健康检查与失败回滚契约，使用模拟 Docker。 |
| `bash scripts/test/database-backup-contract.sh` | 全账号冷备、容器暂停失败与清单发布边界。 |
| `python3 scripts/test/database-backup.test.py` | Python/Node 全账号快照、活跃 WAL、路径引用及部分失败行为。 |

Windows 的 Bash 命令可在 Git Bash 或 WSL 中运行；Python 命令使用环境中可用的 `python3` 或 `python`。静态交付预检不能代替真实 Compose/Nginx/HTTPS 验收。

修改应用代码的常用完整验证组合：

```bash
npm run test:contracts
npm run build
```

这已包含后端回归和前端类型/生产构建；刚通过 `npm test` 后再次完整构建会重复后端测试，只有新增变化或失败问题需要时才重复。涉及镜像、Compose、备份或更新脚本时，再选择交付预检、对应脚本契约与实际部署验收。纯文档改动检查相对链接、命令来源和 `git diff --check` 即可，不需要重复运行应用构建。

`verify.ts` 覆盖领域、架构边界和前端纯能力；`multiuser.ts` 使用临时目录及真实 HTTP 验证账号隔离和吊销；`accountSession.ts` 验证浏览器账号生命周期。部分验证会生成/校验 PWA 图标，临时数据不应当作业务改动提交。测试数量随实现变化，不在文档中维护固定数字。

## 修改边界

1. 先核验真实实现与适用的回归，不为单纯文案修改增加镜像实现的测试。
2. 新用例进入 `backend/src/services/`，SQLite 查询和事务进入 `repositories/`；route 保留协议校验和 HTTP 映射。
3. 跨端字段先更新 `contracts/domain.d.ts`，两端从各自类型入口重新导出；持久化行与 JWT 字段留在后端内部。
4. 前端视图通过 store/gateway 使用领域能力，浏览器全局能力放入 `platform/browser/`。
5. 业务 repository 使用当前账号 `db` 代理，认证、账号管理和封禁使用固定 `rootDb`；不能跨账号上下文缓存 Statement。
6. 迁移必须可重复运行且保留用户数据。已有默认文案的一次性迁移示例见 [backend/src/db/migrations.ts:60](../backend/src/db/migrations.ts#L60)。

共享类型对齐见 [contracts/contract-compatibility.ts:14](../contracts/contract-compatibility.ts#L14)，账号上下文边界见 [backend/src/db/connection.ts:77](../backend/src/db/connection.ts#L77)。

## 文档维护分工

| 文档 | 维护内容 |
|---|---|
| `README.md`、`docs/README.md` | 能力概览、快速开始、各文档入口；不重复完整操作流程。 |
| `docs/ARCHITECTURE_OVERVIEW.md` | 阅读导航与简洁系统图；具体边界链接详细文档。 |
| `docs/architecture.md` | 稳定分层、身份隔离、同步和恢复一致性。 |
| `docs/modules.md` | 功能职责与物理位置。 |
| `docs/api-and-data.md` | 公开接口、共享对象、默认值/迁移与持久化/备份范围。 |
| `docs/multiuser.md` | 公用体验、个人账号 CLI、配额、会话与多用户数据规则。 |
| `docs/deployment-beginner-guide.md` | 首次部署的初学者引导。 |
| `docs/cloud-production-deployment.md` | 云服务器首次生产部署、来源与 HTTPS 配置。 |
| `docs/cloud-server-update.md` | 已部署服务器的具体更新顺序、版本确认、验证与故障处理。 |
| `scripts/README.md` | 镜像和运维脚本参数、Compose 使用约定、备份文件组成与恢复/回滚边界。 |
| `nginx/ssl/README.md` | 外部证书目录约定与私钥放置要求。 |

按用途更新对应主文档，并同步索引及关联链接。涉及脚本行为变动时，操作指南和 `scripts/README.md` 一起核对；部署指南负责首次搭建，更新指南负责已有服务升级，避免把不同阶段写成互相矛盾的步骤。文档使用仓库相对链接，源码引用附文件与行号，避免本机 `file://` 地址或承诺未经实现的零停机更新。
