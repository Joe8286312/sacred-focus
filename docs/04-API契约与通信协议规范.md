# 04-API契约与通信协议规范

本文档详尽规范 **Sacred Focus（神圣自控中枢）** 的 RESTful API 通信契约、双轨认证协议、乐观锁协同协议及全部 7 大路由模块端点。所有入参与出参格式均严格源自后端真实代码实现。

---

## 1. 通信基础规范

* **基准前缀 (Base URL)**：`/api`
* **传输编码与格式**：`application/json; charset=utf-8`
* **报文大小上限**：系统支持最大 **15MB** 的 JSON 载荷（由 `express.json({ limit: '15mb' })` 约束，以支持包含海量历史流水与快照的整机导入）。
* **公共免检白名单端点**（由 [`backend/src/middleware/auth.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/middleware/auth.ts) 约定）：
  - `/api/health`（系统健康检查）
  - `/api/auth/login`（管理员登录）
  - `/api/auth/status`（会话状态嗅探）
  - `/api/sync/status`（轻量同步探针）
* **通用标准错误响应格式**：
  ```json
  {
    "error": "ERROR_CODE_STRING",
    "message": "人类可读的错误解释文案",
    "details": "可选的错误明细或上下文"
  }
  ```

---

## 2. 身份认证与凭据传输协议

系统部署了兼顾**浏览器高安全防 XSS** 与**脚本/多端离线调用灵活性**的 JWT 双轨凭据传输模型：

### 2.1 轨道一：安全 HttpOnly Cookie（浏览器默认）
* 登录成功后，服务端在响应头中下发 `Set-Cookie: sf_token=<JWT>`：
  - `httpOnly: true`：禁止客户端 JavaScript 读取，杜绝 XSS 窃密；
  - `secure`：动态自适应判定（当请求来自 HTTPS 或反向代理携带 `X-Forwarded-Proto: https` 时为 `true`，明文 HTTP 调试时为 `false`，防范登录死循环）；
  - `sameSite`：HTTPS 下为 `'strict'`，HTTP 下为 `'lax'`；
  - `maxAge`：30 天（`30 * 24 * 60 * 60 * 1000` 毫秒）。
* 客户端发起的每次 `apiFetch` 请求必须声明 `credentials: 'include'`。

### 2.2 轨道二：Authorization Bearer Header（外部调用）
* 客户端可通过标准 HTTP 请求头传递凭据：
  ```http
  Authorization: Bearer <JWT_TOKEN>
  ```
  亦向下兼容 `X-Access-Token: <token>` 请求头。

### 2.3 静态通行凭证降级 (Static App Access Token)
* 若在环境变量中配置了 `APP_ACCESS_TOKEN`，系统允许以该静态令牌作为 Bearer Token 直接鉴权。
* 内部使用 `crypto.timingSafeEqual` 实施常量时间比对（`safeCompare`），防御侧信道时序探测。

### 2.4 JTI 吊销黑名单机制
* 签发的 JWT Payload 结构：`{ role: 'admin', jti: '<uuid>', timestamp: number }`；
* 登出接口（`POST /api/auth/logout`）会将该 Token 的 `jti` 写入 `system_meta`（键为 `revoked_jti:<jti>`，值为到期时间戳）；
* 鉴权中间件自动核验 `jti` 是否存在于黑名单中，若已吊销则返回 `401 TOKEN_REVOKED`。系统空闲检查点定时执行物理清理（`purgeExpiredRevokedJtis`）。

---

## 3. 全量 API 路由端点契约

### 3.1 认证模块 (`/api/auth`)
源码文件：[`backend/src/routes/auth.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/auth.ts)

#### (1) 管理员登录
* **端点**：`POST /api/auth/login`
* **限流**：`loginLimiter`（15 分钟内最多 5 次）
* **请求入参**：
  ```json
  {
    "password": "StrongPassword123!"
  }
  ```
* **成功响应 (200 OK)**：
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresInDays": 30,
    "message": "契约核验通过，欢迎进入 Sacred Focus"
  }
  ```
  *(响应头同时写入 `Set-Cookie: sf_token=...`)*

#### (2) 会话状态嗅探
* **端点**：`GET /api/auth/status`
* **鉴权**：免检
* **成功响应 (200 OK)**：
  ```json
  {
    "isAuthenticated": true,
    "user": {
      "role": "admin",
      "jti": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": 1726300000000
    }
  }
  ```

#### (3) 安全登出
* **端点**：`POST /api/auth/logout`
* **成功响应 (200 OK)**：
  ```json
  {
    "success": true,
    "message": "已安全登出自控中枢"
  }
  ```
  *(清除 Cookie 并将当前 JTI 记入吊销黑名单)*

---

### 3.2 同步探针模块 (`/api/sync`)
源码文件：[`backend/src/routes/sync.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/sync.ts)

#### (1) 获取轻量协同状态
* **端点**：`GET /api/sync/status`
* **鉴权**：免检
* **性能特征**：响应极小（< 100B），纯索引直读，供全平台高频心跳轮询。
* **成功响应 (200 OK)**：
  ```json
  {
    "revision": 28,
    "evolutionVersion": "v1.1",
    "updatedAt": "2026-09-14T08:30:00.000Z"
  }
  ```

---

### 3.3 神圣座位模块 (`/api/sacred-seat`)
源码文件：[`backend/src/routes/sacredSeat.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/sacredSeat.ts)

#### (1) 读取座位全局配置
* **端点**：`GET /api/sacred-seat/config`
* **成功响应 (200 OK)**：
  ```json
  {
    "sacredToken": "主力机开启专注模式",
    "reservationSignal": "反手拍手轻声说换人",
    "defaultFocusDuration": 60,
    "regretWindowSeconds": 30,
    "currentStreak": 12,
    "maxStreak": 35
  }
  ```

#### (2) 修改座位全局配置
* **端点**：`PUT /api/sacred-seat/config`
* **请求入参 (支持局部更新与严格边界校验)**：
  ```json
  {
    "sacredToken": "主力机开启专注模式",
    "reservationSignal": "反手拍手轻声说换人",
    "defaultFocusDuration": 45,
    "regretWindowSeconds": 30,
    "currentStreak": 12,
    "maxStreak": 35
  }
  ```

#### (3) 违规连胜手动清零
* **端点**：`POST /api/sacred-seat/reset-streak`
* **成功响应 (200 OK)**：
  ```json
  {
    "currentStreak": 0,
    "maxStreak": 35
  }
  ```

#### (4) 提交专注/预约实践流水日志
* **端点**：`POST /api/sacred-seat/logs`
* **功能**：写入流水并原子结算更新 `currentStreak` 与 `maxStreak`。支持根据 `id` 幂等去重（已存在直接返回 200）。
* **请求入参**：
  ```json
  {
    "id": "log-uuid-12345",
    "type": "FOCUS",
    "startTime": "2026-09-14T01:00:00.000Z",
    "endTime": "2026-09-14T02:15:00.000Z",
    "targetDurationMinutes": 60,
    "actualDurationSeconds": 4500,
    "status": "SUCCESS",
    "focusContent": "完成国策树架构设计文档",
    "failureReason": null,
    "note": "进入深度心流，顺水推舟超额15分钟"
  }
  ```
* **成功响应 (201 Created)**：
  ```json
  {
    "logId": "log-uuid-12345",
    "status": "SUCCESS",
    "currentStreak": 13,
    "maxStreak": 35
  }
  ```

#### (5) 获取全周期日级聚合专注热力图数据
* **端点**：`GET /api/sacred-seat/heatmap?days=365`
* **查询参数**：`days`（整数，`0` 或 `'all'` 代表获取全部历史）
* **成功响应 (200 OK)**：
  ```json
  [
    {
      "date": "2026-09-13",
      "totalSessions": 3,
      "successCount": 2,
      "regretCount": 1,
      "failCount": 0,
      "totalSeconds": 7200
    }
  ]
  ```

#### (6) 专注流水列表、导入与导出
* `GET /api/sacred-seat/logs?limit=50`：分页读取流水（最大 500 条）；
* `GET /api/sacred-seat/logs/export`：导出全部专注流水备份 JSON；
* `POST /api/sacred-seat/logs/import`：增量合并或覆盖导入流水数据。

---

### 3.4 国策树核心模块 (`/api/focus-tree`)
源码文件：[`backend/src/routes/focusTree.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/focusTree.ts)

#### (1) 读取完整国策树（触发跨天断签审计）
* **端点**：`GET /api/focus-tree`
* **业务逻辑**：内部自动触发执行 `settleFocusTreeDailyState()`。若是当天首次访问，将跨天未点亮节点扣级/归零并在 `resetSummary` 中汇报。
* **成功响应 (200 OK)**：
  ```json
  {
    "nodes": [...],
    "groups": [...],
    "edges": [...],
    "labels": [...],
    "revision": 28,
    "resetSummary": {
      "settlementDate": "2026-09-14",
      "resetNodes": [
        { "id": "node-m1", "code": "M1", "name": "破晓离床", "lostLevel": 3, "maxLevel": 14 }
      ]
    }
  }
  ```

#### (2) 全量覆盖保存国策树（带 OCC 乐观并发版本锁）
* **端点**：`PUT /api/focus-tree`
* **请求入参**：
  ```json
  {
    "nodes": [...],
    "groups": [...],
    "edges": [...],
    "labels": [...],
    "expectedRevision": 28
  }
  ```
* **并发冲突响应 (409 Conflict)**：
  ```json
  {
    "error": "VERSION_CONFLICT",
    "message": "检测到其他设备已提交新版本，请先同步最新状态后再保存",
    "currentRevision": 29
  }
  ```
* **保存成功响应 (200 OK)**：
  ```json
  {
    "message": "Focus tree synchronized successfully",
    "revision": 29,
    "data": { ... }
  }
  ```

#### (3) 点亮 / 反悔取消节点打卡
* **端点**：`PATCH /api/focus-tree/nodes/:id/toggle-lit`
* **成功响应 (200 OK)**：
  ```json
  {
    "id": "node-m1",
    "isLit": true,
    "level": 4,
    "maxLevel": 14,
    "lastLitDate": "2026-09-14"
  }
  ```

#### (4) 节点细粒度维护端点
* `POST /api/focus-tree/nodes`：新增单个节点；
* `PUT /api/focus-tree/nodes/:id`：修改单个节点详情（规范卡、触发场景、冻结态等）；
* `DELETE /api/focus-tree/nodes/:id`：物理删除节点，并级联清理关联连线；
* `PUT /api/focus-tree/nodes/reorder`：保存矩阵列表基准排序（入参 `{ "nodeIds": ["..."] }`）。

#### (5) 分组外框维护端点
* `POST /api/focus-tree/groups`：新增分组外框；
* `PUT /api/focus-tree/groups/:id`：更新分组名称、主题色、坐标尺寸；
* `DELETE /api/focus-tree/groups/:id?deleteChildren=true`：删除分组（`deleteChildren=true` 连带删除组内国策；`false` 仅将组内国策解绑为独立国策）。

---

### 3.5 演化版本管理模块 (`/api/evolution`)
源码文件：[`backend/src/routes/evolution.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/evolution.ts)

#### (1) 获取当前演化状态
* **端点**：`GET /api/evolution`
* **成功响应 (200 OK)**：
  ```json
  {
    "activePointerIndex": 0,
    "snapshots": [
      {
        "slotIndex": 0,
        "id": "snap-v1-0",
        "version": "v1.0",
        "timestamp": "2026-09-02T00:00:00.000Z",
        "changelogNotes": "动能破晓：全域稳态与昼夜效能国策树 v1.0 正式基准版",
        "isMajor": true,
        "nodes": [...],
        "edges": [...],
        "groups": [...]
      }
    ],
    "revision": 29
  }
  ```

#### (2) 归档当前树为新版本快照
* **端点**：`POST /api/evolution/snapshot`
* **请求入参**：
  ```json
  {
    "changelogNotes": "重构夜间专注流水线，引入白噪音应急防御",
    "isMajor": false,
    "expectedRevision": 29
  }
  ```
* **成功响应 (201 Created)**：返回新版本号（如 `v1.1`）与目标槽位 `targetSlotIndex`。

#### (3) 版本快照原子回滚
* **端点**：`POST /api/evolution/rollback`
* **请求入参**：
  ```json
  {
    "targetSlotIndex": 0,
    "expectedRevision": 30
  }
  ```
* **成功响应 (200 OK)**：将槽位 0 的整棵树全量还原回当前活跃树，更新活跃指针 `activePointerIndex = 0`，推进 `revision`。

#### (4) 国策树独立架构备份与恢复
* `GET /api/evolution/export`：仅导出国策树与演化快照（不含专注流水日志与判例）；
* `POST /api/evolution/import`：仅导入国策树拓扑架构。

---

### 3.6 判例法典模块 (`/api/cases`)
源码文件：[`backend/src/routes/cases.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/cases.ts)

* `GET /api/cases`：获取全部判例法典（可选查询参数 `?verdict=ALLOW` 或 `?verdict=FORBID`）；
* `POST /api/cases`：新增定性判例；
* `PUT /api/cases/:id`：修改已有判例边界；
* `DELETE /api/cases/:id`：删除判例；
* `GET /api/cases/export`：导出全部判例法典 JSON；
* `POST /api/cases/import`：批量合并导入判例法典。

---

### 3.7 全系统整机运维模块 (`/api/system`)
源码文件：[`backend/src/routes/system.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/system.ts)

#### (1) 系统整机冷备全量导出
* **端点**：`GET /api/system/export`
* **限流**：`exportLimiter`（10 分钟内最多 15 次）
* **功能**：导出包含 9 大数据表（国策树、座位配置、流水、判例、演化快照与指针）的统一灾难恢复数据包。

#### (2) 系统整机全量导入（预热备容灾）
* **端点**：`POST /api/system/import`
* **限流**：`importLimiter`（1 小时内最多 10 次）
* **请求入参**：
  ```json
  {
    "expectedRevision": 32,
    "tree": { "nodes": [...], "groups": [...], "edges": [...], "labels": [...] },
    "sacredSeatConfig": { ... },
    "precedentCases": [ ... ],
    "evolution": { "state": { ... }, "snapshots": [ ... ] },
    "sessionLogs": [ ... ]
  }
  ```
* **错误拦截**：
  - `409 Conflict (VERSION_CONFLICT)`：前置版本不匹配；
  - `503 Service Unavailable (MAINTENANCE_IN_PROGRESS)`：已有维护任务执行中；
  - `500 BACKUP_FAILED_ABORT_IMPORT`：自动生成 SQLite 热备快照失败，熔断终止以保护现有数据。
* **成功响应 (200 OK)**：
  ```json
  {
    "success": true,
    "message": "全系统备份已彻底还原写入",
    "summary": {
      "nodesRestored": 24,
      "groupsRestored": 6,
      "edgesRestored": 21,
      "labelsRestored": 2,
      "snapshotsRestored": 1,
      "logsRestored": 158,
      "casesRestored": 12,
      "revision": 33
    }
  }
  ```

---

## 4. 本文档涉及的真实源码文件映射

* 认证路由：[`backend/src/routes/auth.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/auth.ts)
* 同步路由：[`backend/src/routes/sync.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/sync.ts)
* 座位路由：[`backend/src/routes/sacredSeat.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/sacredSeat.ts)
* 国策路由：[`backend/src/routes/focusTree.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/focusTree.ts)
* 演化路由：[`backend/src/routes/evolution.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/evolution.ts)
* 判例路由：[`backend/src/routes/cases.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/cases.ts)
* 整机运维路由：[`backend/src/routes/system.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/routes/system.ts)
* 客户端网络请求封装：[`frontend/src/utils/api.ts`](file:///d:/Codes/Projects/sacred-focus/frontend/src/utils/api.ts)
