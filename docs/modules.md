# 模块说明

## 共享契约与基础层

| 模块 | 位置 | 责任 |
|---|---|---|
| 跨端领域契约 | `contracts/domain.d.ts` | 神圣座位、会话日志、判例、国策树和演化快照的共享类型源。 |
| 业务日策略 | `backend/src/domain/calendar/businessDay.ts` | 凌晨 04:00 日界、前一业务日计算。 |
| 备份校验 | `backend/src/domain/backupValidation/` | 非信任备份输入的结构、白名单、数量和引用完整性校验。 |
| 前端纯能力 | `frontend/src/shared/` | 时长格式化、节点排序、主题规则、错误显示等可独立测试逻辑。 |

## 前端模块

| 模块 | 主要位置 | 责任 |
|---|---|---|
| 应用组合根 | `main.ts`、`App.vue`、`router/` | Vue/Pinia/router 装配、主题、导航、全局同步和受保护页面守卫。 |
| 认证 | `stores/auth.ts`、`application/auth/`、`platform/browser/auth.ts` | 登录、Cookie 会话检查、登出和登录失败提示。 |
| 神圣座位 | `views/SacredSeatView.vue`、`stores/sacredSeat.ts`、`components/seat/` | 专注会话、配置、连胜、历史、热力图、日志导入导出和全屏体验。 |
| 国策树 | `views/FocusCanvasView.vue`、`views/FocusListView.vue`、`stores/focusTree.ts`、`components/canvas/` | 树画布、列表、节点/组/边/标签编辑、日结反馈、同步冲突与演化快照。 |
| 判例库 | `views/CaseLawView.vue`、`components/case/` | 判例的查询、编辑、导入和导出。 |
| 应用网关 | `application/*/*Gateway.ts` | 将领域操作映射为稳定的 API 调用，不泄漏 fetch 细节给视图。 |
| 浏览器适配器 | `platform/browser/` | fetch client、全屏、音频、主题、下载、浏览器事件和 gateway 实例化。 |

## 后端模块

| 模块 | 主要位置 | 责任 |
|---|---|---|
| 组合与生命周期 | `app.ts`、`server.ts`、`config.ts` | 创建 Express、挂载安全链/路由/静态资源、初始化数据库及优雅关闭。 |
| HTTP 路由 | `routes/` | `/api` 协议校验、状态码和 JSON 映射；不直接承载 SQL。 |
| 安全中间件 | `middleware/` | Cookie/JWT 鉴权、吊销检查、IP/UA 防护、限流及维护期写保护。 |
| 国策树服务 | `services/focusTreeService.ts` | 日结、点亮/反悔、树与分组操作、revision 编排。 |
| 神圣座位服务 | `services/sacredSeatService.ts` | 配置、会话日志、连胜、热力图和日志迁移。 |
| 判例服务 | `services/precedentCaseService.ts` | 判例 CRUD、导入导出与 revision 更新。 |
| 演化服务 | `services/evolutionService.ts` | 快照、回滚、架构导入导出和版本冲突处理。 |
| 整机备份服务 | `services/systemBackupService.ts` | 维护租约、导入前热备、整机恢复与释放顺序。 |
| 同步与认证服务 | `services/syncStatusService.ts`、`authService.ts` | 跨端同步状态、会话和 JTI 吊销用例。 |
| Repositories | `repositories/` | 按领域封装 SQLite 查询、写入、事务与数据变换。 |
| SQLite 基础设施 | `db/` | 连接、表/索引、迁移、种子、兼容门面和维护工具。 |

## 交付模块

| 模块 | 位置 | 责任 |
|---|---|---|
| 容器镜像 | `Dockerfile`、`.dockerignore` | 多阶段构建、生产依赖、非 root runner、健康检查和 OCI 追溯信息。 |
| 编排与网关 | `docker-compose*.yml`、`nginx/conf.d/` | 回环直连模式或 TLS 网关模式、数据卷、日志与可信代理。 |
| 运维工具 | `scripts/` | 镜像打包、数据库备份、事务性更新/回滚、静态交付预检。 |

运维的完整操作步骤见 [scripts/README.md](../scripts/README.md)。
