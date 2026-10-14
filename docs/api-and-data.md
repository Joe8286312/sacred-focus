# API 与数据模型

所有接口位于 `/api` 下。浏览器通过 `frontend/src/application/` 的 gateway 与 `platform/browser/` 适配器调用，视图不应直接拼装 fetch。HTTP 输入必须运行时校验，不能仅依赖共享 TypeScript 类型。

## 身份与请求约定

- 无凭据时进入共享公用工作区 `{ id: "public", username: "public", role: "public" }`。
- 登录接收 `username/password`，省略 `username` 兼容 `admin`；登录响应返回 `user` 与 `expiresInDays: 30`，JWT 放在 HttpOnly Cookie `sf_token` 中，不在响应体或 localStorage 中保存。
- `GET /api/auth/status` 对公用账号也返回 `isAuthenticated: true`；是否为个人会话应判断 `user.role`，不能仅判断该布尔值。携带失效凭据查询状态时会回退公用身份并清理 Cookie。
- 携带失效凭据访问业务接口返回 401；`/health` 与认证接口允许查询状态或切换账号。兼容的 `Authorization: Bearer`、`X-Access-Token` 优先于 Cookie；已配置 `APP_ACCESS_TOKEN` 映射为 `admin`。
- 浏览器业务请求附加 `X-SF-Account-Id`，后端与已核验身份比较，不一致返回 401 `ACCOUNT_CHANGED`。请求头不能授予账号权限或选择数据库。
- 所有 `/api` 响应设置 `Cache-Control: no-store`；JSON body 上限 15 MB。生产登录 Cookie 使用 Secure 与 SameSite Strict，因此登录需要 HTTPS。
- 没有 HTTP 注册、账号创建或账号管理端点。服务器 CLI 的管理方法见 [多人使用指南](multiuser.md)。

源码：[backend/src/middleware/auth.ts:34](../backend/src/middleware/auth.ts#L34)、[backend/src/routes/auth.ts:30](../backend/src/routes/auth.ts#L30)、[backend/src/routes/auth.ts:79](../backend/src/routes/auth.ts#L79) 与 [backend/src/app.ts:66](../backend/src/app.ts#L66)。

## HTTP 路由

下表路径在对应前缀后拼接；`/` 表示前缀自身。

| 前缀 | 方法与路径 | 数据与约束 | 路由源码 |
|---|---|---|---|
| `/api/health` | `GET` | `{ status, version, timestamp, service }`；用于服务探针，不进入账号数据库上下文。 | [app.ts:77](../backend/src/app.ts#L77) |
| `/api/auth` | `POST /login`、`GET /status`、`POST /logout` | 用户名/密码登录、当前公开身份、清 Cookie 并吊销可验证 JWT 的 JTI。 | [auth.ts:30](../backend/src/routes/auth.ts#L30) |
| `/api/sync` | `GET /status` | 当前账号 `{ revision, evolutionVersion, updatedAt }`。 | [sync.ts:15](../backend/src/routes/sync.ts#L15) |
| `/api/sacred-seat` | `GET /config`、`PUT /config`、`POST /reset-streak` | 配置更新支持部分字段；文本 1–128 字符，时长 1–1440 分钟，后悔窗口 5–300 秒。 | [sacredSeat.ts:15](../backend/src/routes/sacredSeat.ts#L15) |
| `/api/sacred-seat` | `GET /logs`、`POST /logs` | 读取默认 50 条、最多 500 条；同 ID 重复会话返回 200，新会话返回 201，避免重复结算。 | [sacredSeat.ts:93](../backend/src/routes/sacredSeat.ts#L93)、[sacredSeat.ts:143](../backend/src/routes/sacredSeat.ts#L143) |
| `/api/sacred-seat` | `GET /logs/export`、`POST /logs/import` | 全日志导出；导入接受日志数组或 `{ logs: [...] }`，按 ID 增量合并/更新。 | [sacredSeat.ts:101](../backend/src/routes/sacredSeat.ts#L101) |
| `/api/sacred-seat` | `GET /heatmap` | `days` 默认 365、数字最多 3650；`all` 或 `0` 表示全部；只聚合 `FOCUS` 日志。 | [sacredSeat.ts:127](../backend/src/routes/sacredSeat.ts#L127) |
| `/api/cases` | `GET /`、`POST /`、`PUT /:id`、`DELETE /:id`、`GET /export`、`POST /import` | 判例 CRUD 与导入导出；`verdict` 为 `ALLOW` 或 `FORBID`。 | [cases.ts:15](../backend/src/routes/cases.ts#L15) |
| `/api/focus-tree` | `GET /`、`PUT /`、`POST /reset-settlement-audit` | 读取触发当前账号日结并返回 revision；全量覆盖需要 `expectedRevision`；重置日结审计。 | [focusTree.ts:18](../backend/src/routes/focusTree.ts#L18) |
| `/api/focus-tree` | `POST /nodes`、`PUT /nodes/:id`、`DELETE /nodes/:id`、`PUT /nodes/reorder`、`PATCH /nodes/:id/toggle-lit` | 节点 CRUD、排序、点亮/反悔；按 UTC+8 凌晨 04:00 业务日结算。 | [focusTree.ts:75](../backend/src/routes/focusTree.ts#L75) |
| `/api/focus-tree` | `POST /groups`、`PUT /groups/:id`、`DELETE /groups/:id` | 分组 CRUD；边与标签随国策树全量保存。 | [focusTree.ts:126](../backend/src/routes/focusTree.ts#L126) |
| `/api/evolution` | `GET /`、`POST /snapshot`、`POST /rollback`、`GET /export`、`POST /import` | 状态、五槽位快照、回滚与架构导入导出；三个写端点均需 `expectedRevision`。 | [evolution.ts:37](../backend/src/routes/evolution.ts#L37) |
| `/api/system` | `GET /export`、`POST /import` | 当前账号完整业务备份；导入需 `expectedRevision`，使用当前账号维护租约与预导入热备；公用账号禁止完整导入。 | [system.ts:17](../backend/src/routes/system.ts#L17) |

同步与业务日规则见 [系统架构](architecture.md#关键一致性边界)。热力图日期取日志 `startTime` 字符串的前 10 位，它与国策的 04:00 业务日规则不同；见 [backend/src/repositories/sacredSeatRepository.ts:125](../backend/src/repositories/sacredSeatRepository.ts#L125)。

## 版本冲突与运行限制

`expectedRevision` 是当前账号的正整数版本前提，用于国策树全量保存、演化写操作和账号完整恢复；单项节点、判例和座位操作没有统一要求它。覆盖写遇到冲突时先获取最新状态并处理本地草稿，不能盲目重放旧快照。常见响应如下：

| HTTP 状态 | `error` 示例 | 含义与处理 |
|---|---|---|
| 400 | `EXPECTED_REVISION_REQUIRED`、`INVALID_BACKUP_SCHEMA` | 修正版本字段或输入结构。 |
| 401 | `TOKEN_EXPIRED_OR_INVALID`、`TOKEN_REVOKED`、`ACCOUNT_CHANGED` | 会话失效或账号已变化，重新核验身份并重建页面状态。 |
| 403 | `PERSONAL_ACCOUNT_REQUIRED` | 公用账号不能覆盖整个工作区，先登录个人账号。 |
| 409 | `VERSION_CONFLICT` | 带 `currentRevision`；同步后处理冲突。 |
| 429 | `RATE_LIMIT_EXCEEDED` 等 | 等待限流窗口结束后重试。 |
| 503 | `MAINTENANCE_IN_PROGRESS` | 当前账号恢复中；参考 `Retry-After`，稍后再提交写入。 |
| 507 | `ACCOUNT_STORAGE_LIMIT` | 主数据库页数预检查已达上限，联系服务器管理员处理容量。 |

容量写保护是预检查；单次写入触及 SQLite 硬页数上限时，也可能通过具体路由错误分支返回失败，不保证所有容量错误都为 507。实现见 [backend/src/middleware/accountLimits.ts:6](../backend/src/middleware/accountLimits.ts#L6)。

公网按 IP 限流：公用通用 API 60 次/分钟，个人或 `admin` 1000 次/分钟，登录 5 次/15 分钟，完整导出 15 次/10 分钟，完整导入 10 次/小时。仅回环地址与显式配置的 `TRUSTED_IPS` 豁免，普通局域网地址不会自动跳过；限流不是账号注册配额。实现见 [backend/src/middleware/rateLimiter.ts:5](../backend/src/middleware/rateLimiter.ts#L5) 与 [backend/src/middleware/ipRules.ts:12](../backend/src/middleware/ipRules.ts#L12)。

## 共享领域对象

[contracts/domain.d.ts](../contracts/domain.d.ts) 是跨端领域对象的唯一类型来源：

| 对象 | 关键字段或语义 |
|---|---|
| `AccountIdentity` | `id`、`username`、`role: public/admin/user`；不包含密码或 Token。 |
| `SacredSeatConfig` | 信物、启动信号、默认时长、后悔窗口、当前/历史连胜。 |
| `FocusSessionLog` | `id`；`type: FOCUS/RESERVATION`；`status: SUCCESS/FAIL/REGRET`；起止时间、时长和可选 `focusContent/failureReason/note`。 |
| `DailyFocusHeatmapItem` | 日期、会话数、成功/后悔/失败计数及实际总秒数。 |
| `PrecedentCase` | 行为、裁定 `ALLOW/FORBID`、边界条件及时间字段。 |
| `FocusTreeData` | `nodes/edges/groups/labels` 与可选日结 `resetSummary`。 |
| `EvolutionSnapshot` / `EvolutionState` | 架构快照、槽位和活跃指针。 |

前端 `types/index.ts` 和后端 `types.ts` 重新导出契约，`contracts/contract-compatibility.ts` 检查等价。SQLite 行、JWT 载荷、Express 请求对象和 Vue 响应式状态属于内部模型；数据库行由 repository 转换为领域对象。类型检查命令见 [开发与验证](development.md)。

## 默认值与兼容迁移

| 项目 | 新工作区/新页面默认值 | 保存位置 |
|---|---|---|
| 神圣信物 `sacredToken` | 图书馆坐上特定座位 | 当前账号 `sacred_seat_config` |
| 启动信号 `reservationSignal` | 打响指 | 当前账号 `sacred_seat_config` |
| 默认专注时长 | 60 分钟 | 当前账号配置 |
| 后悔窗口 | 30 秒 | 当前账号配置 |
| 当前/最高连胜 | 0 / 0 | 当前账号配置 |
| 本次心流目标 | 空字符串；提示“输入本次心流目标（例如：学习红黑树）” | 页面输入，提交时作为日志的可选 `focusContent` |

新工作区仅初始化最小座位配置，国策节点、分组、边和标签均为空。已有账号使用一次性标记 `migration:sacred_seat_defaults_v1`：旧信物“开始专注”或“主力机开启专注模式”替换为新信物，旧信号“轻拍双手，切换状态”或“反手拍手轻声说换人”替换为“打响指”；其他自定义值、时长、后悔窗口和连胜保留。只有实际替换文案时推进该账号 revision，不将心流目标填入历史日志。

源码：[backend/src/db/seed.ts:10](../backend/src/db/seed.ts#L10)、[backend/src/db/migrations.ts:60](../backend/src/db/migrations.ts#L60)、[frontend/src/views/SacredSeatView.vue:75](../frontend/src/views/SacredSeatView.vue#L75) 和 [SacredSeatView.vue:559](../frontend/src/views/SacredSeatView.vue#L559)。

## SQLite 持久化

`DATA_DIR` 是容器或后端进程的数据目录。Docker 的 `HOST_DATA_DIR` 指定宿主机挂载位置，二者不是两个独立数据源。

```text
DATA_DIR/
├── app.db                     # admin 业务 + 账号注册表 + 认证/封禁
├── accounts/
│   ├── public/app.db           # 所有访客共享
│   └── <UUID>/app.db           # 每个个人账号独立
└── backup/                    # 服务器运维备份与清单
```

公用与个人数据库按首次访问创建；创建账号只写注册表，不复制管理员或公用数据。各账号业务数据库包含以下核心表，根数据库另有账号注册表：

| 表 | 数据 |
|---|---|
| `sacred_seat_config` | 单例座位配置与连胜。 |
| `focus_session_logs` | 专注/预约日志。 |
| `precedent_cases` | 判例。 |
| `focus_groups`、`focus_nodes`、`focus_edges`、`focus_labels` | 国策图结构。 |
| `evolution_snapshots`、`evolution_state` | 五槽位快照与当前指针。 |
| `system_meta` | 当前账号 revision、同步时间、迁移/日结标记与维护租约；根库还存认证与封禁元数据。 |
| `accounts`（仅根数据库） | 唯一用户名、bcrypt 哈希、停用状态、`sessionVersion`、创建时间。 |

业务访问使用上下文 `db`；认证、账号管理与 IP 封禁固定使用 `rootDb`。默认最多 20 个个人账号，含停用；公用主数据库 50 MiB、个人及根数据库 256 MiB。容量通过 SQLite 页数执行，不含 WAL 与备份。配置和隔离实现见 [backend/src/config.ts:84](../backend/src/config.ts#L84)、[backend/src/db/connection.ts:15](../backend/src/db/connection.ts#L15) 与 [系统架构](architecture.md#受控账号与数据库隔离)。

## 备份边界

| 类型 | 范围 | 用途 |
|---|---|---|
| 架构 JSON：`/api/evolution/export` | 当前账号国策树、标签和演化快照。 | 迁移目标结构；导入不覆盖会话或判例。 |
| 完整业务 JSON：`/api/system/export` | 当前账号国策、座位、判例、演化和会话日志。 | 单账号迁移；不含账号注册表、凭据、封禁、服务器环境或证书。 |
| 预导入物理热备 | 当前账号数据库；`admin` 的物理根库快照含注册表/安全元数据。 | `/api/system/import` 前自动生成 `app_pre_import_*.db`，在该账号目录保留最近 5 份。 |
| 服务器全账号快照 | 根数据库及所有已存在公用/个人数据库，配合 manifest 与账号快照目录。 | 运维更新与服务器恢复；必须保留整套文件，不能只复制根 `app.db`。 |

完整业务导出格式为 `version: 1`、`dataType: SACRED_FOCUS_FULL_SYSTEM`，包含 `exportedAt`、`summary`、`focusTree/liveTree`、`sacredSeatConfig`、`precedentCases`、`evolution` 和 `sessionLogs`。导入使用备份校验模块清洗字段并检查引用完整性，再取得账号维护租约、热备和事务恢复；公用账号完整导入被禁止。恢复并不修改账号注册表或认证状态。

源码：[backend/src/repositories/systemBackupRepository.ts:85](../backend/src/repositories/systemBackupRepository.ts#L85)、[systemBackupRepository.ts:102](../backend/src/repositories/systemBackupRepository.ts#L102) 与 [backend/src/services/systemBackupService.ts:43](../backend/src/services/systemBackupService.ts#L43)。服务器快照的文件组成和恢复操作见 [交付与运维手册](../scripts/README.md)；部署配置与日常更新分别见 [云服务器生产部署](cloud-production-deployment.md) 和 [云服务器项目更新步骤](cloud-server-update.md)。
