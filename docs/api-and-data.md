# API 与数据模型

所有业务接口位于 `/api` 下，经过身份解析与账号数据库隔离。无凭据时使用公用账号；个人账号凭据失效时返回 401，状态接口回退公用账号并清理失效 Cookie。浏览器客户端应通过 `frontend/src/application/` 的 gateway 调用，而非在视图中手写请求。

## HTTP 路由

| 前缀 | 主要操作 | 说明 |
|---|---|---|
| `/api/health` | `GET` | 返回服务状态、交付版本和时间戳。 |
| `/api/auth` | `POST /login`、`GET /status`、`POST /logout` | 登录接收 `username/password`（省略用户名兼容 admin）；状态及登录返回 `user: {id, username, role}`。 |
| `/api/sync` | `GET /status` | 返回 revision、演化版本和更新时间，供多端同步协调器使用。 |
| `/api/sacred-seat` | 配置、连胜重置、日志 CRUD 式记录、日志导入导出、热力图 | 会话记录是幂等的；热力图支持 `days` 查询。 |
| `/api/cases` | 列表、创建、更新、删除、导入导出 | `verdict` 仅为 `ALLOW` 或 `FORBID`。 |
| `/api/focus-tree` | 树读取/全量保存、日结审计、节点和分组操作 | 全量保存需 `expectedRevision`；节点点亮采用业务日规则。 |
| `/api/evolution` | 状态、快照、回滚、架构导入导出 | 写操作需 `expectedRevision`，快照固定为五槽位。 |
| `/api/system` | 当前账号完整备份导出与导入 | 导入需 `expectedRevision`，会在恢复前热备并使用账号维护租约；公用账号禁止完整导入。 |

常见写冲突响应为 HTTP 409、`error: "VERSION_CONFLICT"`，并带有 `currentRevision`。客户端收到后应拉取最新状态，不能盲目重放旧快照。

没有 HTTP 注册或创建账号接口。账号通过服务器 CLI 创建。浏览器业务请求携带 `X-SF-Account-Id` 表示页面已核验的账号；若与当前 Cookie 身份不符，返回 401 `ACCOUNT_CHANGED`，避免旧标签页写入新账号。它不能用来选择数据库。所有 API 响应使用 `Cache-Control: no-store`。

## 共享领域对象

`contracts/domain.d.ts` 是跨端对象的唯一来源，主要对象包括：

- `SacredSeatConfig`：专注默认时长、后悔窗口与当前/历史连胜。
- `AccountIdentity`：公用、管理员或个人工作区的公开身份，不包含凭据。
- `FocusSessionLog`：专注或预约会话，状态为 `SUCCESS`、`FAIL` 或 `REGRET`。
- `PrecedentCase`：行为、裁定（`ALLOW`/`FORBID`）和边界条件。
- `FocusTreeData`：节点、边、分组和标签；节点含层级、点亮状态、触发条件和规格卡。
- `EvolutionSnapshot` / `EvolutionState`：国策架构的版本快照及活跃指针。

SQLite 行、JWT 载荷、Express 请求对象及 Vue 响应式状态不是共享契约，不能加入该文件。

## SQLite 持久化

数据库路径由 `DATA_DIR` 决定：`app.db` 保留原管理员数据与账号注册表，`accounts/public/app.db` 为共享体验工作区，`accounts/<UUID>/app.db` 为个人工作区。每个业务数据库的核心表为：

| 表 | 业务数据 |
|---|---|
| `sacred_seat_config` | 单例座位配置与连胜计数。 |
| `focus_session_logs` | 专注/预约会话日志。 |
| `precedent_cases` | 判例库。 |
| `focus_groups`、`focus_nodes`、`focus_edges`、`focus_labels` | 国策树图结构。 |
| `evolution_snapshots`、`evolution_state` | 五槽位版本快照与当前指针。 |
| `system_meta` | system revision、同步时间、维护与审计标记。 |

写入应通过对应 repository 和 service 完成。`system_meta.system_revision` 是共享写入的乐观并发控制来源；维护租约生效时普通写请求会被拒绝，以保护整机恢复。

根数据库额外包含 `accounts`（唯一用户名、bcrypt 哈希、停用状态和 sessionVersion），同时保存管理员密码哈希、JTI 吊销及 IP 封禁。账号管理和认证始终使用根数据库；每个账号的业务 revision、维护锁和日结审计只保存在自己的数据库。

## 备份边界

- **架构备份**：`/api/evolution/export` 只包含国策树和演化快照，不影响会话与判例。
- **账号完整备份**：`/api/system/export` 包含当前账号的树、座位、判例、演化和会话日志，不导出注册表和凭据。
- **服务器全账号备份**：运维脚本快照根数据库和各账号数据库，详情见 [运维手册](../scripts/README.md)。
- **导入校验**：备份先经 `domain/backupValidation` 清洗并校验数组、白名单、容量和拓扑引用，再交给 service/repository 处理。
