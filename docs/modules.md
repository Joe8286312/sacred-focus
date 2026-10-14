# 模块说明

本页用于按功能找到代码位置。总体依赖方向见 [系统架构](architecture.md)，运行入口与文档导航见 [架构概览](ARCHITECTURE_OVERVIEW.md)。下表前端位置默认相对 `frontend/src/`，后端位置默认相对 `backend/src/`。

## 共享契约与领域基础

| 模块 | 位置 | 责任 |
|---|---|---|
| 跨端领域契约 | `contracts/domain.d.ts`、`contracts/contract-compatibility.ts` | 身份、座位、日志、热力图、判例、国策树与演化类型的唯一来源；编译期校验两端类型入口一致。 |
| 业务日策略 | `backend/src/domain/calendar/businessDay.ts` | 默认 UTC+8 凌晨 04:00 日界与前一业务日计算。 |
| 备份校验 | `backend/src/domain/backupValidation/` | 外部备份的结构、字段白名单、数量和拓扑引用校验。 |
| 前端纯能力 | `frontend/src/shared/` | 时长格式化、节点排序、主题规则和错误显示。 |

## 前端模块

| 模块 | 主要位置 | 责任 |
|---|---|---|
| 组合根与导航 | `main.ts`、`App.vue`、`router/index.ts` | Vue/Pinia/router 装配，主题、顶部导航、公用提示、同步协调及首次身份核验。 |
| 认证 | `stores/auth.ts`、`views/LoginView.vue`、`application/auth/`、`platform/browser/auth.ts` | 公用入口、用户名/密码登录、Cookie 状态查询及登出。 |
| 账号会话隔离 | `platform/browser/accountSession.ts`、`platform/browser/api.ts` | 固定页面身份，附加账号请求头，取消旧会话请求，跨标签页账号切换与按账号构造浏览器存储键。 |
| 神圣座位 | `views/SacredSeatView.vue`、`stores/sacredSeat.ts`、`components/seat/` | 专注与预约状态机、配置、连胜、历史、热力图、日志导入导出与全屏；本次目标默认为空。 |
| 国策树 | `views/FocusCanvasView.vue`、`views/FocusListView.vue`、`stores/focusTree.ts`、`components/canvas/` | 画布、列表、节点/组/边/标签编辑、日结反馈、草稿冲突与演化快照。 |
| 判例法典 | `views/CaseLawView.vue`、`components/case/` | 行为裁定的查询、编辑、导入与导出。 |
| 账号完整迁移 | `components/common/SystemMigrationModal.vue`、`application/systemBackup/`、`platform/browser/systemBackup.ts` | 当前账号业务备份导出与恢复；公用入口不提供完整恢复。 |
| 应用网关与 HTTP | `application/*/*Gateway.ts`、`application/http/apiClient.ts` | 领域操作与 API 协议映射，Cookie 请求、结构化 HTTP 错误；视图不直接手写 fetch。 |
| 同步协调 | `application/sync/syncCoordinator.ts`、`platform/browser/syncManager.ts` | 当前账号 revision 探针、编辑草稿保护、定时和唤醒刷新。 |
| 浏览器能力 | `platform/browser/` | 全屏、音频、主题、下载与浏览器事件适配。 |

源码入口示例：身份隔离见 [frontend/src/platform/browser/accountSession.ts:14](../frontend/src/platform/browser/accountSession.ts#L14)，专注默认配置见 [frontend/src/stores/sacredSeat.ts:12](../frontend/src/stores/sacredSeat.ts#L12)，同步装配见 [frontend/src/platform/browser/syncManager.ts:8](../frontend/src/platform/browser/syncManager.ts#L8)。

## 后端模块

| 模块 | 主要位置 | 责任 |
|---|---|---|
| HTTP 组合根 | `app.ts` | 安全链、账号身份、维护保护、容量限制、业务路由及生产静态产物装配。 |
| 生命周期入口 | `server.ts` | 初始化、监听、30 分钟 checkpoint/吊销清理，SIGTERM/SIGINT 关闭所有账号连接。 |
| 配置 | `config.ts` | 环境变量、生产密钥校验、个人账号数量与账号数据库容量默认值。 |
| HTTP 路由 | `routes/` | `/api` 请求校验、状态码与 JSON 映射；不直接承载 SQL。 |
| 身份与安全中间件 | `middleware/auth.ts`、`security.ts`、`rateLimiter.ts`、`ipRules.ts` | Cookie/兼容 Token 身份、吊销与停用核验、数据库上下文、IP/UA 防护及限流。 |
| 写保护与容量 | `middleware/maintenance.ts`、`accountLimits.ts` | 当前账号恢复期写保护、公用完整导入限制和 SQLite 页数上限预检查。 |
| 认证服务 | `services/authService.ts` | 管理员/个人密码验证、JWT、sessionVersion 与 JTI 吊销；始终使用根数据库。 |
| 国策树服务 | `services/focusTreeService.ts` | 读取与日结编排、点亮/反悔、树与分组操作、revision 推进。 |
| 神圣座位服务 | `services/sacredSeatService.ts` | 配置、会话幂等记录、连胜、热力图与日志迁移。 |
| 判例服务 | `services/precedentCaseService.ts` | 判例 CRUD、导入导出与 revision 更新。 |
| 演化服务 | `services/evolutionService.ts` | 五槽位快照、回滚、架构导入导出与版本前置校验。 |
| 账号完整备份服务 | `services/systemBackupService.ts` | 当前账号恢复的维护租约、预导入热备、事务恢复和 finally 释放顺序。 |
| 同步服务 | `services/syncStatusService.ts` | 当前账号 revision、演化版本与更新时间。 |
| Repository | `repositories/` | 各领域 SQL、事务和对象转换；`accountRepository`、`authRepository`、`securityBanRepository` 固定根数据库，业务 repository 使用账号 `db` 代理。 |
| 数据库连接 | `db/connection.ts` | rootDb、账号连接、AsyncLocalStorage、空闲连接淘汰、WAL checkpoint 与关闭。 |
| 初始化与迁移 | `db/index.ts`、`schema.ts`、`migrations.ts`、`seed.ts` | 根/账号建表与兼容迁移，只初始化最小配置；不注入演示国策数据。 |
| 日结实现 | `db/queries/settlement.ts` | 当前账号每日首次读取时事务结算，检查业务日、冻结豁免及断签归零。 |
| 服务器账号 CLI | `cli/accounts.ts` | 创建、列出、停用、启用和重置个人密码；没有网页注册，数量限制包含停用账号。 |

源码入口：HTTP 装配见 [backend/src/app.ts:37](../backend/src/app.ts#L37)，生命周期见 [backend/src/server.ts:41](../backend/src/server.ts#L41)，账号连接见 [backend/src/db/connection.ts:27](../backend/src/db/connection.ts#L27)，默认值迁移见 [backend/src/db/migrations.ts:60](../backend/src/db/migrations.ts#L60)。

`backend/src/db.ts` 与部分 `db/` 子文件、前端 `utils/` 保留历史导入路径。新逻辑依照 [系统架构的分层规则](architecture.md#分层与依赖规则) 落入真实职责层；尤其避免跨请求缓存 SQLite Statement。

## 交付与验证模块

| 模块 | 位置 | 责任 |
|---|---|---|
| 容器镜像 | `Dockerfile`、`.dockerignore` | 多阶段构建、生产依赖、非 root runner、健康检查及 OCI 追溯信息。 |
| 编排与网关 | `docker-compose*.yml`、`nginx/conf.d/` | 回环入口或 TLS 网关、持久化挂载、资源限制、日志与可信代理。 |
| 运维工具 | `scripts/docker-pack.*`、`docker-backup.sh`、`docker-update.sh`、`scripts/lib/` | 镜像包、全账号数据库快照与清单、更新前备份、容器切换与失败回滚。 |
| 交付验证 | `scripts/verify-delivery.sh`、`scripts/test/` | 交付配置静态审计及更新/备份契约测试。 |
| 应用回归 | `backend/test/verify.ts`、`multiuser.ts`、`accountSession.ts` | 领域与架构边界、真实 HTTP 账号隔离、旧会话吊销及浏览器请求生命周期回归。 |

首次部署见 [云服务器生产部署](cloud-production-deployment.md)，已有服务器更新见 [更新步骤](cloud-server-update.md)，脚本参数与备份恢复规则见 [交付与运维手册](../scripts/README.md)，验证命令见 [开发与验证](development.md)。
