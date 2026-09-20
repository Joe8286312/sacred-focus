# API 与数据模型

所有业务接口位于 `/api` 下，除健康检查与明确公共的认证/同步端点外均经过认证中间件。浏览器客户端应通过 `frontend/src/application/` 的 gateway 调用，而非在视图中手写请求。

## HTTP 路由

| 前缀 | 主要操作 | 说明 |
|---|---|---|
| `/api/health` | `GET` | 返回服务状态、交付版本和时间戳。 |
| `/api/auth` | `POST /login`、`GET /status`、`POST /logout` | 管理员会话和 Cookie 生命周期。 |
| `/api/sync` | `GET /status` | 返回 revision、演化版本和更新时间，供多端同步协调器使用。 |
| `/api/sacred-seat` | 配置、连胜重置、日志 CRUD 式记录、日志导入导出、热力图 | 会话记录是幂等的；热力图支持 `days` 查询。 |
| `/api/cases` | 列表、创建、更新、删除、导入导出 | `verdict` 仅为 `ALLOW` 或 `FORBID`。 |
| `/api/focus-tree` | 树读取/全量保存、日结审计、节点和分组操作 | 全量保存需 `expectedRevision`；节点点亮采用业务日规则。 |
| `/api/evolution` | 状态、快照、回滚、架构导入导出 | 写操作需 `expectedRevision`，快照固定为五槽位。 |
| `/api/system` | 完整备份导出与导入 | 导入需 `expectedRevision`，会在恢复前热备并使用维护租约。 |

常见写冲突响应为 HTTP 409、`error: "VERSION_CONFLICT"`，并带有 `currentRevision`。客户端收到后应拉取最新状态，不能盲目重放旧快照。

## 共享领域对象

`contracts/domain.d.ts` 是跨端对象的唯一来源，主要对象包括：

- `SacredSeatConfig`：专注默认时长、后悔窗口与当前/历史连胜。
- `FocusSessionLog`：专注或预约会话，状态为 `SUCCESS`、`FAIL` 或 `REGRET`。
- `PrecedentCase`：行为、裁定（`ALLOW`/`FORBID`）和边界条件。
- `FocusTreeData`：节点、边、分组和标签；节点含层级、点亮状态、触发条件和规格卡。
- `EvolutionSnapshot` / `EvolutionState`：国策架构的版本快照及活跃指针。

SQLite 行、JWT 载荷、Express 请求对象及 Vue 响应式状态不是共享契约，不能加入该文件。

## SQLite 持久化

数据库路径由 `DATA_DIR` 决定，默认文件是 `DATA_DIR/app.db`。核心表为：

| 表 | 业务数据 |
|---|---|
| `sacred_seat_config` | 单例座位配置与连胜计数。 |
| `focus_session_logs` | 专注/预约会话日志。 |
| `precedent_cases` | 判例库。 |
| `focus_groups`、`focus_nodes`、`focus_edges`、`focus_labels` | 国策树图结构。 |
| `evolution_snapshots`、`evolution_state` | 五槽位版本快照与当前指针。 |
| `system_meta` | system revision、同步时间、维护与审计标记。 |

写入应通过对应 repository 和 service 完成。`system_meta.system_revision` 是共享写入的乐观并发控制来源；维护租约生效时普通写请求会被拒绝，以保护整机恢复。

## 备份边界

- **架构备份**：`/api/evolution/export` 只包含国策树和演化快照，不影响会话与判例。
- **整机备份**：`/api/system/export` 包含树、座位、判例、演化和会话日志。
- **导入校验**：备份先经 `domain/backupValidation` 清洗并校验数组、白名单、容量和拓扑引用，再交给 service/repository 处理。
