# Code Review Report

## 1. 审查信息

- **审查日期：** 2026-09-10
- **项目：** Sacred Focus (个人自控与效能系统 — 国策树与神圣座位)
- **技术栈：** 
  - **后端：** Node.js 22, Express 4, TypeScript 5, SQLite (better-sqlite3 13 WAL 模式), JWT (jsonwebtoken), bcryptjs, express-rate-limit, helmet
  - **前端：** Vue 3 (Composition API), Vite, Pinia, Vue Router, Vue Flow, Vanilla CSS
  - **容器与网关：** Docker (多阶段构建), Docker Compose, Nginx 1.27
- **审查范围：** 后端服务架构（API 路由、中间件、数据库层、校验器）、前端核心视图与状态管理（Pinia stores、Views、Components、Utils）、容器化编排配置（Dockerfile、docker-compose、Nginx 配置、更新脚本）、测试套件与安全策略。
- **审查目标：** 全面排查生产安全性漏洞、并发与数据一致性隐患、核心自控状态机边界缺陷、性能瓶颈、工程质量与可维护性短板，并出具具有明确落地指导价值的加固方案。

---

## 2. 项目概览

Sacred Focus 是一套融合严谨“自控工程学”的个人效能中枢，其核心架构包含三大支柱系统：

1. **神圣座位 (Sacred Seat)：**
   以极高摩擦力保护核心生产力。包含 30 秒后悔药免责退出保护机制、违规主动清零主链连胜惩罚机制、全屏心流沉浸态以及基于 SQLite 聚合的全生命周期专注热力图。
2. **国策树架构 (Focus Tree Canvas & List)：**
   基于 Vue Flow 的有向无环拓扑画布与类 Excel 复合排序列表。核心逻辑为“凌晨 04:00 跨天业务日结算”，支持连续打卡升级、历史最高等级保全、不可抗力“冰蓝冻结态”保全以及断签归零重置。
3. **下必为例判例法典 (Precedent Cases) 与演化引擎 (Evolution)：**
   提供严密的反破窗判例存证法典，以及支持 5 槽位环形缓存与指针回滚的版本演化快照体系。

系统以轻量单体全栈架构实现，数据持久化完全收口于本地轻量高性能嵌入式 SQLite 数据库，结合 CAS 乐观版本号 (`system_revision`) 驱动多设备间无感同步探针。

---

## 3. 问题统计

| 严重程度 | 数量 |
|---|---:|
| **P0 (致命问题)** | 3 |
| **P1 (严重问题)** | 5 |
| **P2 (一般问题)** | 6 |
| **P3 (改进建议)** | 4 |

---

## 4. P0 - 致命问题

### P0-001 客户端可通过伪造 X-Forwarded-For 标头完全绕过安全蜜罐与防爆破限流

- **位置：** `backend/src/middleware/ipRules.ts:5-8`, `backend/src/middleware/rateLimiter.ts:8,21,35,48`, `backend/src/middleware/security.ts:64`, `nginx/conf.d/default.conf:27`
- **类型：** 安全防御绕过 / IP 伪造 / 暴力破解风险
- **置信度：** 高

#### 问题描述
在 `backend/src/middleware/ipRules.ts` 中，获取客户端 IP 的函数 `getClientIp` 实现如下：
```ts
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket.remoteAddress) || '';
  return rawIp.replace(/^::ffff:/i, '').trim();
}
```
该函数盲目信任并提取了客户端请求中 `X-Forwarded-For` 标头的**最左侧第一个 IP**。在结合 `nginx/conf.d/default.conf`（采用 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` 会把用户端原始伪造的 IP 放在最前面）或直接暴露端口的生产部署中，公网攻击者只需在 HTTP 请求中附加 `X-Forwarded-For: 127.0.0.1`，即可让系统将请求识别为本机回环地址。

#### 触发条件
任何未经认证的公网客户端，在发起 HTTP 请求时添加标头：
`X-Forwarded-For: 127.0.0.1`

#### 技术分析
当攻击者注入 `X-Forwarded-For: 127.0.0.1` 后：
1. `isLocalOrTrusted(req)` 判断 `ip === '127.0.0.1'` 返回 `true`。
2. `backend/src/middleware/rateLimiter.ts` 中所有的 `loginLimiter`、`apiGeneralLimiter`、`exportLimiter`、`importLimiter` 均配置了 `skip: (req) => isLocalOrTrusted(req)`，全部被静默跳过！
3. `backend/src/middleware/security.ts` 中的 `securityFilter` 第一行即为 `if (isLocalOrTrusted(req)) return next();`，蜜罐路径拦截、已知爬虫拦截及恶意 IP 黑名单封禁机制全部失效。

#### 影响
- **管理员密码暴力破解门槛归零：** `POST /api/auth/login` 的 15 分钟 5 次限流保护完全失效，攻击者可进行超高速多线程弱口令字典爆破。
- **爬虫与探测免疫：** 恶意扫描与自动化攻击工具可通过伪造标头免受 72 小时蜜罐封禁。
- **拖库与资源耗尽：** 全量整机导出与导入接口限流被跳过，攻击者可反复导出或灌入超大数据。

#### 修复建议
废弃手动解析 `req.headers['x-forwarded-for'].split(',')[0]`。因为在 `server.ts` 中已经正确配置了 `app.set('trust proxy', 1)`，Express 已经基于上游受信任的反向代理跳数，从右至左提取了真实的客户端 IP，直接使用 `req.ip`：
```ts
export function getClientIp(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip.replace(/^::ffff:/i, '').trim();
}
```

#### 建议测试
1. 使用 `curl -H "X-Forwarded-For: 127.0.0.1" -X POST http://<server>/api/auth/login` 连续错误尝试 10 次，验证是否依然受到 5 次限流拦截。
2. 访问蜜罐路径 `/.env` 并附带该伪造标头，确认客户端真实 IP 依然被加入封禁列表并阻断。

---

### P0-002 docker-compose.yml 生产配置兜底硬编码已知强口令密钥，产生默认认证旁路

- **位置：** `docker-compose.yml:16-17`, `backend/src/config.ts:10-14`
- **类型：** 硬编码密钥 / 预置后门风险
- **置信度：** 高

#### 问题描述
在 `backend/src/config.ts` 中，为防御弱口令设置了启动熔断：
```ts
if (isProduction) {
  if (!rawJwtSecret || rawJwtSecret.length < 32 || rawJwtSecret.includes('change_in_production')) {
    throw new Error('[FATAL] JWT_SECRET 未配置、包含弱口令标识或长度不足 32 位，生产模式拒绝启动');
  }
}
```
然而在 `docker-compose.yml` 中，环境变量默认配置如下：
```yaml
environment:
  - JWT_SECRET=${JWT_SECRET:-sacred_focus_super_secret_jwt_key_32chars_2026}
  - ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123456}
```
该默认兜底值 `sacred_focus_super_secret_jwt_key_32chars_2026` 长度达到 44 字符，且**不包含** `change_in_production` 子串！

#### 触发条件
运维人员或用户拉取镜像后，直接执行 `docker compose up -d` 启动，未在外部 `.env` 中显式设置 `JWT_SECRET`。

#### 技术分析
系统在容器内以 `NODE_ENV=production` 模式正常启动，不仅没有任何报错警告，反而以公开在 Git 仓库中的固定已知密钥运行。

#### 影响
任何知晓该开源代码的公网攻击者，可以在自己的电脑上使用该固定密钥 `sacred_focus_super_secret_jwt_key_32chars_2026` 离线签发任意包含 `{ role: 'admin' }` 的 JWT Token。利用该 Token 发起请求，可绕过密码验证，获取系统的全部控制权。

#### 修复建议
1. 移除 `docker-compose.yml` 中的硬编码默认值，要求必须从环境变量注入：
   ```yaml
   - JWT_SECRET=${JWT_SECRET}
   - ADMIN_PASSWORD=${ADMIN_PASSWORD}
   ```
2. 在 `config.ts` 中，针对生产环境将硬编码白名单彻底禁止，如果未配置合法的非默认密钥，直接拒绝启动：
   ```ts
   const BANNED_SECRETS = [
     'sacred_focus_super_secret_jwt_key_32chars_2026',
     'sacred_focus_default_jwt_secret_change_in_production_2026'
   ];
   if (isProduction) {
     if (!rawJwtSecret || rawJwtSecret.length < 32 || BANNED_SECRETS.includes(rawJwtSecret)) {
       throw new Error('[FATAL] JWT_SECRET 必须在生产环境中显式配置高强度随机密钥！');
     }
   }
   ```

#### 建议测试
1. 不指定 `.env` 执行容器启动，验证容器在没有密钥时是否能够主动阻断退出。
2. 验证使用伪造默认密钥签发的 Token 无法通过自定义安全部署实例的鉴权。

---

### P0-003 每日首次上线结算未原子递增系统版本号，导致画布全量保存时静默覆写并逆转断签清零

- **位置：** `backend/src/db/queries/settlement.ts:20-57`, `backend/src/routes/focusTree.ts:34-52`, `frontend/src/stores/focusTree.ts:137-168`
- **类型：** 数据一致性损坏 / 乐观锁旁路失效 / 核心自控契约破坏
- **置信度：** 高

#### 问题描述
`settleFocusTreeDailyState()` 负责在用户每日首次上线时检测断签并将等级清零 (`UPDATE focus_nodes SET level = 0, previousLevel = 0, isLit = 0 WHERE id = ?`)。但是，整个结算事务完成之后，**完全没有调用** `incrementSystemRevision()`。

#### 触发条件
1. 用户多端登录（例如手机与 PC 端）。
2. 用户昨日发生断签。
3. 设备 A 打开触发了结算（数据库中各节点 level 被重置为 0），但系统全局 `system_revision` 保持不变（例如仍为 15）。
4. 设备 B 上保留着前天的旧数据（node.level = 5，本地记录 revision = 15）。
5. 用户在设备 B 上微调画布排版并点击保存。

#### 技术分析
1. 设备 B 发起 `PUT /api/focus-tree`，请求体包含旧节点数据及 `expectedRevision = 15`。
2. 后端服务端比对版本号：`currentRev = getSystemRevision()`（仍为 15），因此比对通过！
3. 后端执行 `DELETE FROM focus_nodes`，随后把设备 B 提交的旧数据（`node.level = 5`）原封不动插入数据库。
4. 数据库中刚刚完成的断签清零被完全推翻，断签节点“死而复生”。

#### 影响
严重破坏了系统自控契约的威慑力。用户只要利用另一端或者刷新时差在画布上微调并保存，即可无痕撤销系统的断签惩罚，导致断签惩罚机制名存实亡。

#### 修复建议
在 `backend/src/db/queries/settlement.ts` 的结算事务 `settleTx` 内部，若有实际发生节点重置（`resetNodes.length > 0`），必须原子调用 `incrementSystemRevision()`：
```ts
if (resetNodes.length > 0) {
  incrementSystemRevision();
}
```

#### 建议测试
1. 将本地时间调整跨过 04:00 模拟断签结算，检查 `/api/sync/status` 返回的 `revision` 是否自增。
2. 模拟旧版本客户端提交 `expectedRevision`，验证系统是否准确返回 `409 Conflict` 阻断旧状态覆写。

---

## 5. P1 - 严重问题

### P1-001 核心自控“冰蓝冻结态 (isFrozen)”被跨天结算引擎完全忽视，导致不可抗力保全节点被错误清零

- **位置：** `backend/src/db/queries/settlement.ts:27-52`
- **类型：** 核心业务逻辑缺陷
- **置信度：** 高

#### 问题描述
架构白皮书与前端均设计了“冰蓝冻结态 (`isFrozen`)”，明确约定：“对于因外出、生病等不可抗力场景，支持开启冻结态保全等级，不触发断签惩罚”。
然而在后端的每日结算引擎 `settleFocusTreeDailyState()` 中，查询语句为：
```ts
const allNodes = db.prepare('SELECT id, code, name, level, maxLevel, isLit, lastLitDate FROM focus_nodes').all();
```
查询既没有提取 `isFrozen` 字段，后续断签判定也完全没有针对 `isFrozen === 1` 的排他跳过逻辑。

#### 触发条件
用户将某国策节点设置为冰蓝冻结态，次日凌晨 04:00 后首次打开系统。

#### 技术分析
无论节点 `isFrozen` 是否为 1，只要 `!isLitToday && !isLitYesterday` 成立，结算逻辑就会无条件将该节点作为断签节点压入 `resetNodes`，并执行 `UPDATE focus_nodes SET level = 0, previousLevel = 0, isLit = 0 WHERE id = ?`。

#### 影响
用户因生病或正当事由开启冻结保全的努力付诸东流，节点等级被无情清空，造成不可挽回的误惩罚，严重打击自控积极性。

#### 修复建议
在 `settlement.ts` 中将 `isFrozen` 字段加入查询，并在循环首部进行排他拦截：
```ts
const allNodes = db.prepare('SELECT id, code, name, level, maxLevel, isLit, isFrozen, lastLitDate FROM focus_nodes').all();
for (const node of allNodes) {
  if (node.isFrozen) {
    // 处于冰蓝冻结态的节点不受断签影响，完整保全等级
    continue;
  }
  ...
}
```

#### 建议测试
1. 创建节点并升级至 3 级，开启冻结态。
2. 调用 `/api/focus-tree/reset-settlement-audit` 重置结算标记，随后请求 `GET /api/focus-tree` 触发结算。
3. 验证该节点 level 依然保持为 3 级且不出现在 `resetSummary` 中。

---

### P1-002 国策树大量单个变更端点未触发版本递增，导致多端同步探针失效并引发数据覆写丢失

- **位置：** `backend/src/routes/focusTree.ts:129-216, 220-235, 238-249, 251-335, 337-353, 356-441`, `backend/src/routes/evolution.ts:334`
- **类型：** 状态同步机制缺陷 / 数据静默丢失
- **置信度：** 高

#### 问题描述
系统依赖 `syncManager.ts` 在前台或每 60 秒轮询 `/api/sync/status` 检测 `data.revision > currentKnownRevision` 以实现跨终端无感自动拉取更新。
然而，在 `backend/src/routes/focusTree.ts` 中，除了 `PUT /`（全量覆盖保存）外，以下**所有局部操作**均未调用 `incrementSystemRevision()`：
- `PATCH /nodes/:id/toggle-lit`（每日最核心的点亮打卡/反悔）
- `PUT /nodes/reorder`（列表基准重排）
- `POST /nodes`（新增单节点）
- `PUT /nodes/:id`（修改单节点属性与规范卡）
- `DELETE /nodes/:id`（删除单节点）
- `POST /groups`、`PUT /groups/:id`、`DELETE /groups/:id`（分组增删改）
- `POST /api/evolution/import`（架构单独导入）

#### 影响
1. 当用户在设备 A 上打卡点亮了节点，设备 B 的同步探针因 `system_revision` 未变而完全无知无觉。
2. 若设备 B 随后在画布上调整布局并点击保存，因设备 B 的 `expectedRevision` 与后端仍然相同，直接覆盖提交，导致设备 A 上刚刚点亮的状态被彻底冲掉。

#### 修复建议
在上述所有对 `focus_nodes`、`focus_groups`、`focus_edges` 进行增删改的路由处理函数末尾，必须统一调用 `incrementSystemRevision()`。

#### 建议测试
多浏览器标签页测试：标签页 A 点亮一个节点，观察标签页 B 的 Console 是否在切回时输出 `[Sacred Focus Sync] 云端检测到更新: rev X -> Y` 并自动刷新。

---

### P1-003 列表视图在筛选状态下拖拽排序会导致未匹配节点被永久从本地工作区丢弃

- **位置：** `frontend/src/views/FocusListView.vue:209-231, 173-178`
- **类型：** 前端状态丢失 / 数据一致性损坏
- **置信度：** 高

#### 问题描述
在 `FocusListView.vue` 中，`displayNodes` 是一个经过 `searchQuery` 和 `selectedGroupFilter` 过滤的计算属性。
当用户在搜索状态或分组过滤状态下拖拽行时，`onRowDrop` 函数实现如下：
```ts
function onRowDrop(index: number) {
  ...
  const currentArr = [...displayNodes.value];
  const itemToMove = currentArr.splice(draggedIndex.value, 1)[0];
  ...
  currentArr.splice(targetIdx, 0, itemToMove);
  localNodeList.value = currentArr; // 致命赋值！
  ...
}
```
`localNodeList` 是管理页面所有节点的主数据源。此赋值将 `localNodeList` 强行缩减为只有当前搜索结果中的几个节点！

#### 触发条件
1. 在国策列表页搜索框输入关键字（例如“晨间”，匹配出 2 个节点）。
2. 在搜索结果中用手柄上下微调拖拽其中一个节点。
3. 点击“保存排序”按钮。

#### 影响
原本不在搜索结果内的其余二十多个国策节点从 `localNodeList` 中被物理剔除。用户若保存排序，后端仅接收这 2 个节点的 ID 进行重排，其余节点的排版位序错乱；若用户后续跳转到其他页面触发同步，未匹配节点甚至面临被级联丢失的巨大风险。

#### 修复建议
1. 在非基准状态（即存在搜索关键字或分组过滤时），应当禁用拖拽排序手柄，或者给出“当前处于筛选模式，请先清除筛选再进行物理排序”的友好禁用提示。
2. 若支持局部拖拽，应该更新整表数据中的位置，而非直接用过滤后的子数组覆盖全量数组：
   ```ts
   const isFiltered = computed(() => Boolean(searchQuery.value.trim() || selectedGroupFilter.value));
   // 在 template 中当 isFiltered 为 true 时隐藏或禁用 drag handle
   ```

#### 建议测试
1. 在列表页搜索过滤出部分数据，拖拽排序后清空搜索框，验证未匹配节点是否完好保留。
2. 保存排序后刷新页面，检查总节点数量是否减少。

---

### P1-004 反悔取消点亮状态机未保全打卡前真实历史日期，允许通过反悔操作恶意刷级与免责续签

- **位置：** `backend/src/routes/focusTree.ts:171-191`
- **类型：** 业务状态机逻辑漏洞 / 契约绕过
- **置信度：** 高

#### 问题描述
在 `PATCH /nodes/:id/toggle-lit` 中，用户反悔取消打卡时，系统回退业务日期的逻辑为：
```ts
if (nextLevel > 0) {
  nextLastLitDate = yesterday;
} else {
  nextLastLitDate = null;
}
```
系统假设“取消打卡后的前一天必然是昨天”。但这忽略了一个关键场景：**断签后的首次打卡与反悔**。

#### 触发条件与攻击路径
1. 某节点原本为 3 级，但已经断签了 3 天（`lastLitDate` 是 3 天前）。
2. 今天用户点击点亮该节点：系统识别到非连续天数打卡，将该节点降级为 1 级，并记录 `previousLevel = 3`，`lastLitDate = today`。
3. 用户立刻再次点击反悔：系统执行反悔逻辑，将等级回退为 `previousLevel = 3`。然而，由于 `nextLevel > 0`，代码将 `nextLastLitDate` 无条件改写为 `yesterday`！
4. 此时，数据库中的 `lastLitDate` 变成了昨天！
5. 用户紧接着第三次点击点亮：系统判定 `current.lastLitDate === yesterday`，触发“昨日已点亮，今日连续打卡，等级 +1”，节点升级为 4 级！

#### 影响
用户利用该反悔漏洞，只需在断签节点上双击“点亮-反悔-再点亮”，不仅不需要承受断签降级惩罚，还能凭空将历史等级往上加 1 级。

#### 修复建议
在节点表结构中增加 `previousLastLitDate` 字段，或者在执行今日首次点亮时，将点亮前的真实历史日期备份到 `previousLastLitDate` 中。反悔时精确回退为 `current.previousLastLitDate`，绝不能主观臆断写死为 `yesterday`。

#### 建议测试
1. 将一个节点的 `lastLitDate` 手动改为 3 天前，`level` 设为 3。
2. 连续调用两次 `toggle-lit`（点亮后反悔），检查其 `lastLitDate` 是否保持为 3 天前，确认再次点亮不会升级为 4 级。

---

### P1-005 专注进行中意外离开页面未记入违规清零，存在绕过惩罚的破窗通道

- **位置：** `frontend/src/views/SacredSeatView.vue:301-315`
- **类型：** 核心履约约束绕过
- **置信度：** 高

#### 问题描述
在 `SacredSeatView.vue` 的 `onBeforeRouteLeave` 路由离开守卫中：
```ts
onBeforeRouteLeave((_to, _from, next) => {
  if (currentState.value === 'FOCUSING' || currentState.value === 'OVER_FOCUS') {
    const confirmLeave = window.confirm('神圣专注正在进行中，离开页面将中断本次专注。确认要离开吗？');
    if (confirmLeave) {
      clearTimer();
      store.isFocusMode = false;
      store.exitFullscreen();
      next();
    } else {
      next(false);
    }
  } else {
    next();
  }
});
```
当专注已经超过 30 秒后悔药窗口（例如进行了 45 分钟），用户若想违规放弃，只需点击导航栏去其他页面（如“判例法典”），在原生确认框点击“确定”，页面便直接跳转！
在此过程中，既没有调用 `recordSession` 记录 `FAIL` 状态日志，也没有调用 `resetStreak` 重置主链连胜！

#### 影响
神圣座位的“主链不可断、违规必清零”防线出现致命盲区。用户可以完全免除惩罚，破窗逃离专注约束。

#### 修复建议
在用户确认离开时，判断是否已超出后悔药窗口；若超出，必须在跳转前强制上报 `FAIL` 违规日志并重置连胜：
```ts
if (confirmLeave) {
  if (!isInsideRegretWindow.value) {
    const actualSec = calculateActualSeconds();
    store.recordSession({
      id: `log-${Date.now()}`,
      type: 'FOCUS',
      startTime: sessionStartTime.value?.toISOString() || new Date().toISOString(),
      endTime: new Date().toISOString(),
      targetDurationMinutes: Math.round(targetDurationSeconds.value / 60),
      actualDurationSeconds: actualSec,
      status: 'FAIL',
      failureReason: '导航离开页面违规中断专注',
      note: '在专注过程中切出页面，主链连胜清零'
    }).catch(console.error);
  }
  clearTimer();
  store.isFocusMode = false;
  store.exitFullscreen();
  next();
}
```

#### 建议测试
1. 开启 60 分钟专注，等待超过 30 秒。
2. 点击页面顶部导航切换至国策列表，确认离开。
3. 检查控制台与神圣座位面板，验证主链连胜是否准确归零，流水中是否成功记录 `FAIL` 日志。

---

## 6. P2 - 一般问题

### P2-001 数据库全表缺乏索引，随日志与节点累积将引发全表扫描与性能劣化

- **位置：** `backend/src/db/schema.ts:4-118`
- **类型：** 数据库设计 / 查询性能风险
- **置信度：** 高

#### 问题描述
`backend/src/db/schema.ts` 中定义的 9 张核心表，除了主键自动生成的索引外，没有创建任何自定义索引。
高频查询字段包括：
1. `focus_session_logs(startTime)`：热力图聚合查询 `WHERE type = 'FOCUS' AND substr(startTime, 1, 10) >= ...` 以及列表查询 `ORDER BY startTime DESC` 每次都触发磁盘临时文件排序和全表扫描。
2. `precedent_cases(verdict, date, createdAt)`：列表页按 `verdict` 过滤及时间排序全表扫描。
3. `focus_nodes(groupId)`：作为外键，在 SQLite 级联删除或检查时缺乏索引支撑。
4. `focus_edges(sourceId, targetId)`：在删除节点时，执行 `DELETE FROM focus_edges WHERE sourceId = ? OR targetId = ?` 需要扫描整张连线表。

#### 影响
初期数据量较小时不明显，一旦系统运行数月累积上千条专注流水日志与判例后，每次 API 响应耗时与 CPU 负载将成倍增长。

#### 修复建议
在 `schema.ts` 建表语句后补充关键索引：
```sql
CREATE INDEX IF NOT EXISTS idx_logs_type_starttime ON focus_session_logs(type, startTime);
CREATE INDEX IF NOT EXISTS idx_cases_verdict_date ON precedent_cases(verdict, date DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_group ON focus_nodes(groupId);
CREATE INDEX IF NOT EXISTS idx_edges_source ON focus_edges(sourceId);
CREATE INDEX IF NOT EXISTS idx_edges_target ON focus_edges(targetId);
```

#### 建议测试
使用 `EXPLAIN QUERY PLAN SELECT ...` 确认各高频查询全部命中 `USING INDEX` 而非 `SCAN TABLE`。

---

### P2-002 服务端每次启动均无事务、无版本拦截地全量循环回填节点数据

- **位置：** `backend/src/db/migrations.ts:26-43`
- **类型：** 数据库迁移逻辑不规范 / 冗余 I/O
- **置信度：** 高

#### 问题描述
`backend/src/db/migrations.ts` 中的迁移代码：
```ts
const existingNodes = db.prepare('SELECT id, triggerTime, triggerScene FROM focus_nodes').all();
const updateStmt = db.prepare('UPDATE focus_nodes SET triggerScene = ?, triggerTime = ?, hasExactTime = ?, timeValueMinutes = ? WHERE id = ?');
for (const n of existingNodes) {
  ...
  updateStmt.run(...);
}
```
该迁移没有任何执行标记（Flag）。这意味着每次容器启动或进程重启，它都会对表中全部节点执行一次 `UPDATE` 操作，且没有使用 `db.transaction` 包裹。

#### 影响
每次启动都会对 SQLite 生成大量无意义的 WAL 脏页与磁盘写操作，拉长容器启动时间，若在更新过程中进程被强杀可能破坏中间态数据。

#### 修复建议
在 `system_meta` 表中持久化记录迁移版本号（如 `migration_trigger_scene_v1`），已执行则跳过；如需执行，必须使用事务包裹。

#### 建议测试
重启服务，通过日志确认该迁移逻辑仅在首次执行一次，后续启动直接跳过。

---

### P2-003 认证登录接口使用同步 bcrypt.compareSync 阻塞 Node.js 事件循环

- **位置：** `backend/src/routes/auth.ts:43`
- **类型：** 并发性能瓶颈 / 拒绝服务风险
- **置信度：** 高

#### 问题描述
在 `backend/src/routes/auth.ts` 中：
```ts
const hash = getAdminPasswordHash();
const isValid = bcrypt.compareSync(password, hash);
```
`bcrypt` 的计算因子为 12，单次比对需要消耗单核 CPU 约 150ms~300ms 的纯运算时间。使用同步的 `compareSync` 会直接冻结整个 Node.js 主线程事件循环。

#### 影响
如果有多个并发请求尝试登录，或者恶意客户端并发轰炸 `/api/auth/login`，会导致整个 Sacred Focus 服务端彻底失去响应，正常用户的探针同步、热力图查询全部卡死。

#### 修复建议
将路由改造为 `async` 处理函数，并使用非阻塞的异步方法：
```ts
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  ...
  const isValid = await bcrypt.compare(password, hash);
  ...
});
```

#### 建议测试
使用自动化工具发起并发登录请求，同时请求 `/api/health`，验证健康检查接口是否能在 5ms 内瞬时返回。

---

### P2-004 Docker 容器缺少默认时区配置，导致国内用户凌晨 04:00 业务日计算偏差 8 小时

- **位置：** `Dockerfile:66-72`, `docker-compose.yml:11-19`, `backend/src/db/dateUtils.ts:6-12`
- **类型：** 容器化环境时区兼容性
- **置信度：** 高

#### 问题描述
在 `backend/src/db/dateUtils.ts` 中，业务日判定依赖 JavaScript 原生 `Date` 对象的本地时间（`shifted.getFullYear()`, `getMonth()`, `getDate()`）。
然而，`Dockerfile` 基础镜像 `node:22-bookworm-slim` 默认时区为 UTC（零时区），且 `docker-compose.yml` 中并未注入 `TZ=Asia/Shanghai` 环境变量。

#### 影响
对于中国区用户（UTC+8）：
北京时间凌晨 04:00 对应 UTC 时间的前一日 20:00。
容器内的系统以 UTC 时间运作时，真正的“04:00 业务日切换”会推迟到北京时间**中午 12:00**才发生！这导致清晨打卡的用户被判定归属于前一天，全套自控时间表严重紊乱。

#### 修复建议
1. 在 `docker-compose.yml` 的 `environment` 中默认注入时区：
   ```yaml
   - TZ=${TZ:-Asia/Shanghai}
   ```
2. 在 `Dockerfile` 运行阶段安装 `tzdata` 支持或预设环境变量。

#### 建议测试
在容器内执行 `date` 命令，确认返回的时间与宿主机北京时间完全一致。

---

### P2-005 单元测试用例构造虚假表结构与内联函数，未覆盖真实核心业务代码

- **位置：** `backend/test/verify.ts:167-198`
- **类型：** 测试有效性与工程质量
- **置信度：** 高

#### 问题描述
`backend/test/verify.ts` 中的 Suite 4 自建了内存数据库进行测试，但其编写的建表 SQL 中包含了真实数据库并不存在的字段（如 `category`, `color`），并且完全缺失了当前生产的 `specCard`、`isFrozen`、`focus_labels` 等核心结构。同时，Suite 2 的 `safeCompare` 和 Suite 5 的 `safeParseResponse` 是在测试文件内重新内联声明的独立代码，而非直接引用被测源码文件。

#### 影响
产生“测试绿灯通过、但生产代码可能潜藏漏洞”的假阳性虚假安全感，降低了自动化测试的回归保障价值。

#### 修复建议
重构 `verify.ts`，直接导入 `createTables`、`authMiddleware` 中的真实函数，并在标准测试库中执行真实验证。

#### 建议测试
修改源码故意制造断言失败，确认测试套件能够灵敏告警。

---

### P2-006 备份脚本使用操作系统级 cp 拷贝活跃 WAL 模式 SQLite 数据库存在损坏风险

- **位置：** `scripts/docker-update.sh:54-56`
- **类型：** 数据可靠性 / 灾备缺陷
- **置信度：** 高

#### 问题描述
在 `scripts/docker-update.sh` 的升级前备份逻辑中：
```bash
cp "${DATA_DIR}/app.db" "${BACKUP_FILE}"
[ -f "${DATA_DIR}/app.db-wal" ] && cp "${DATA_DIR}/app.db-wal" "${BACKUP_DIR}/app_pre_update_${TIMESTAMP}.db-wal"
```
当数据库处于活跃写入（特别是 WAL 模式下存在共享内存 `.db-shm` 和预写日志 `.db-wal`）时，直接使用操作系统命令分别拷贝两个文件，极易捕获到状态不一致的撕裂快照（Torn Read）。

#### 影响
若在升级过程中发生故障需要回退数据，此方式生成的备份文件恢复后可能出现 `disk I/O error` 或 `database disk image is malformed` 损坏报错。

#### 修复建议
利用 SQLite CLI 命令进行安全在线热备：
```bash
sqlite3 "${DATA_DIR}/app.db" ".backup '${BACKUP_FILE}'"
```
或者在容器停止后再行冷备。

#### 建议测试
在模拟高频写入日志的并发场景下执行备份脚本，并用 `sqlite3 <backup> "PRAGMA integrity_check;"` 校验备份镜像完整性。

---

## 7. P3 - 改进建议

### P3-001 专注流水日志生成 ID 采用 Date.now() 存在微秒级碰撞隐患

- **位置：** `frontend/src/views/SacredSeatView.vue:174, 206, 236`
- **类型：** 代码健壮性
- **置信度：** 高

#### 问题描述
前端在提交专注日志时，生成的 ID 格式为 `` `log-${Date.now()}` ``。若在自动化脚本测试或极短时间内连续触发（或网络重发），容易生成相同 ID 导致 SQLite 报主键冲突。建议在前端统一采用 `crypto.randomUUID()` 生成 RFC4122 唯一标识符。

---

### P3-002 专注会话缺少最小有效时长防御校验，允许 0 秒上报并抬升连胜

- **位置：** `backend/src/routes/sacredSeat.ts:257-320`
- **类型：** 防御性输入校验
- **置信度：** 中

#### 问题描述
后端 `POST /api/sacred-seat/logs` 仅校验了 `status === 'SUCCESS'` 即给连胜 `currentStreak += 1`，未对 `actualDurationSeconds` 设置最小门槛。恶意客户端可通过脚本发送 `actualDurationSeconds: 0, status: 'SUCCESS'` 快速虚假刷取连胜纪录。建议后端增加校验：若 `actualDurationSeconds < 60`，不允许标记为 `SUCCESS` 抬升连胜。

---

### P3-003 前端 FocusCanvasView 与 FocusListView 文件超千行，组件职责需进一步拆解

- **位置：** `frontend/src/views/FocusCanvasView.vue` (1557 行), `frontend/src/views/FocusListView.vue` (1333 行)
- **类型：** 可维护性与代码坏味道
- **置信度：** 高

#### 问题描述
两个主要视图体积庞大，不仅承载了页面布局，还混杂了拖拽重排引擎、复杂排序栈计算、快捷键分发、审计校验弹窗控制等大量细节。建议将排序栈逻辑、画布快捷键监听及拖拽状态机分别抽取为独立的 Vue Composable（如 `useListSort.ts`, `useCanvasHotkeys.ts`），以提升代码可读性与单测便利性。

---

### P3-004 system_revision 自增缺乏 SQL 级原子操作，存在微观并发竞争读写窗口

- **位置：** `backend/src/db/revision.ts:9-17`
- **类型：** 并发防范优化
- **置信度：** 高

#### 问题描述
`incrementSystemRevision()` 先在 JS 内存中读取当前版本号，加 1 后再写回数据库。若在没有事务外包的情况下发生并发读写，可能产生写覆盖。建议改用纯 SQL 的单句原子自增：
```sql
UPDATE system_meta SET value = CAST((CAST(value AS INTEGER) + 1) AS TEXT) WHERE key = 'system_revision';
```

---

## 8. 待验证问题

### Q-001 跨域与反向代理环境下的 HttpOnly Cookie SameSite 策略在部分移动端内嵌容器中的持久性

- **位置：** `backend/src/routes/auth.ts:61-67`
- **状态：** 待在真实移动端设备验证
- **未确认原因：** 目前静态源码中，Cookie 设置了 `sameSite: config.isProduction ? 'strict' : 'lax'`。当用户将前端添加到手机主屏幕（PWA/WebClip 模式）或通过第三方 App 访问时，部分 WebKit 浏览器内核在跨协议或特定反向代理跳转时可能出现 strict 策略丢失 Cookie 的现象。需要部署到具体机型后验证会话是否能够维持 30 天免密。

### Q-002 移动端 Safari 息屏唤醒时 setInterval 挂起对专注倒计时剩余时间的漂移表现

- **位置：** `frontend/src/views/SacredSeatView.vue:112-121`
- **状态：** 待在真机休眠环境验证
- **未确认原因：** iOS Safari 在后台会彻底挂起 JavaScript 定时器。虽然代码中拥有 `calculateActualSeconds()` 用于在唤醒时基于真实时间戳校准最终采集总时长，但在唤醒的瞬间，界面上的 `remainingSeconds` 是否会出现视觉跳变或偶发延迟，受移动端浏览器进程冻结机制影响，无法通过静态代码确认。

---

## 9. 安全性审查

| 安全维度 | 审查结论 | 详细说明 |
|---|---|---|
| **认证 (Authentication)** | 发现严重漏洞 | 存在硬编码生产默认 JWT 密钥风险（P0-002）以及 `compareSync` 事件循环阻塞（P2-003）。已正确实现基于 jti 的 JWT 主动吊销黑名单机制与 HttpOnly Cookie 托管。 |
| **授权 (Authorization)** | 正常 | 单管理员契约模型，`authMiddleware` 统合拦截所有受保护业务端点，白名单严格限制在 `/health`, `/auth/login`, `/auth/status`, `/sync/status`。 |
| **输入验证 (Validation)** | 良好 | 已在 `validators.ts` 中针对全量整机导入实现了严格的字段截断、类型断言、Hex 颜色过滤与数组数量熔断限制（D-1 治理已落实）。 |
| **SQL 注入 (SQL Injection)** | 未发现 | 全量数据库操作均使用 `better-sqlite3` 参数化预编译语句（命名参数 `@param` 或 `?` 占位符），未发现任何动态字符串拼接 SQL。 |
| **跨站脚本 (XSS)** | 未发现 | 前端基于 Vue 3 模板引擎自动 HTML 转义渲染，且 JWT 令牌完全存储于后端下发的 `HttpOnly` Cookie 中，前端代码不读写敏感 Token。 |
| **跨站请求伪造 (CSRF)** | 基本受控 | CORS 严格限制了特定 Origin 来源，Cookie 开启了 SameSite 防护。建议针对敏感写操作增设自定义 Header（如 `X-Requested-With`）进行二次加固。 |
| **服务端请求伪造 (SSRF)** | 未发现 | 系统不包含任何抓取或请求外部远程 URL 的服务端业务。 |
| **文件操作安全** | 基本安全 | 仅在系统备份时向 `DATA_DIR` 写入固定命名规范的 `.db` 快照，不存在任意路径穿越漏洞。但脚本层面的备份手段存在冷备一致性隐患（P2-006）。 |
| **命令执行 (RCE)** | 未发现 | 服务端 Node.js 代码中完全没有使用 `child_process.exec` 或动态 `eval` 等危险调用。 |
| **敏感信息保护** | 良好 | Helmet 中已关闭 `hidePoweredBy`；生产模式下全局错误拦截器已屏蔽异常堆栈向客户端泄露。 |
| **密钥管理** | 需整改 | 参见 P0-002，生产编排文件存在预置弱口令 fallback。 |
| **权限控制** | 存在绕过 | 参见 P0-001，存在利用伪造 `X-Forwarded-For` 标头跳过 IP 规则检查与限流防护的致命漏洞。 |

---

## 10. 性能审查

1. **事件循环阻塞风险：**
   `backend/src/routes/auth.ts` 中使用 `bcrypt.compareSync` 导致单核主线程出现 150~300ms 冻结，高并发下极易引发雪崩（P2-003）。
2. **缺乏必要索引：**
   数据库日志表与判例表无时间及枚举索引，随使用周期累积必然引发查询吞吐骤降（P2-001）。
3. **前端热力图计算开销：**
   前端通过 SVG 动态渲染 365 天热力方块与浮动卡片，目前渲染性能优异；但在连续滚动日志列表时，若日志超过数千条建议增加虚拟滚动（Virtual List）。

---

## 11. 数据库与数据一致性

1. **事务完整性：**
   `better-sqlite3` 事务使用规范，全量覆盖 `PUT /`、快照回滚 `rollbackTx`、整机导入 `importTx` 均已采用 `db.transaction()` 包裹，保证了 ACID 原子性。
2. **并发控制与 OCC 乐观锁：**
   系统基于 `system_revision` 实现 CAS 版本锁，设计思路先进；但在落地时存在**断签结算与局部修改端点遗漏自增版本号**的关键缺陷（P0-003、P1-002），导致乐观锁在关键场景被旁路。
3. **外键约束与级联删除：**
   虽然 `connection.ts` 开启了 `PRAGMA foreign_keys = ON`，但 `focus_edges` 连线表未设置外键约束，导致拓扑边缘存在孤儿悬挂风险；且在全量同步时先删除分组再删除节点，可能触发 `ON DELETE SET NULL` 的副作用干扰。

---

## 12. 测试覆盖情况

1. **当前测试情况：**
   - 现存单元测试集中在 `backend/test/verify.ts`，涵盖了业务日计算边界（`03:59:59` vs `04:00:00`）、静态令牌比对、导入 Schema 校验等基础算法。
2. **测试质量缺陷：**
   - 数据库相关测试使用内联假 Schema，未测试真实表；核心路由端点缺乏基于 Supertest 的集成接口自动化测试。
3. **建议补充的关键测试：**
   - **断签结算与并发版本冲突测试：** 模拟断签后提交旧版本请求，断言返回 409。
   - **X-Forwarded-For 伪造拦截测试：** 伪造不同代理头，断言限流器正常生效。
   - **冰蓝冻结节点保全测试：** 断言冻结节点在跨天后不降级。

---

## 13. 架构与工程质量

1. **解耦治理成效明显：**
   原 1089 行的 God Object `db.ts` 已被成功拆解为 `connection.ts`, `schema.ts`, `migrations.ts`, `queries/*` 等单职责模块，层次清晰。
2. **输入验证门禁坚固：**
   针对整机导入实现了原生、零依赖、强类型的 `validators.ts`，有效防御了畸形 JSON 和超长恶意数据灌入。
3. **前端视图过度庞大：**
   `FocusCanvasView.vue` 与 `FocusListView.vue` 承担了过多非 UI 渲染职责，耦合严重，亟待通过 Composition API 进行逻辑下沉提取。

---

## 14. 修复优先级

### 第一梯队：必须立即修复 (Emergency Fixes)
1. **[P0-001]** 修正 `ipRules.ts` 中的客户端 IP 提取逻辑，改用 `req.ip`，堵住公网伪造 IP 绕过限流的漏洞。
2. **[P0-002]** 清理 `docker-compose.yml` 中的硬编码默认 JWT 密钥与管理员口令。
3. **[P0-003]** 在每日首次上线结算 `settlement.ts` 事务中补充 `incrementSystemRevision()`。

### 第二梯队：应当修复 (High Priority)
4. **[P1-001]** 在跨天结算引擎中排除 `isFrozen === 1` 的冰蓝冻结态节点。
5. **[P1-002]** 在 `focusTree.ts` 的所有局部更新路由中补充调用 `incrementSystemRevision()`。
6. **[P1-003]** 在 `FocusListView.vue` 处于搜索或分组过滤状态时禁用行拖拽重排，防止丢弃未过滤节点。
7. **[P1-004]** 修复反悔取消点亮时将 `lastLitDate` 粗暴写死为 `yesterday` 造成的刷级漏洞。
8. **[P1-005]** 在神圣座位离开页面守卫中，对超时未反悔的离开强制上报 `FAIL` 违规日志。

### 第三梯队：建议修复 (Medium Priority)
9. **[P2-001]** 为数据库的日志表、判例表、节点外键及连线字段增加关键索引。
10. **[P2-002]** 为迁移逻辑增加版本标记，杜绝每次重启服务时的全量扫描写操作。
11. **[P2-003]** 将 `/api/auth/login` 中的 `compareSync` 改造为异步 `await bcrypt.compare`。
12. **[P2-004]** 在 Docker 编排中设置 `TZ=Asia/Shanghai` 环境变量。
13. **[P2-006]** 将更新脚本中的直接文件拷贝冷备升级为 SQLite 原生安全备份命令。

### 第四梯队：可选优化 (Low Priority / Code Quality)
14. **[P3-001]** 前端生成日志 ID 改用 `crypto.randomUUID()`。
15. **[P3-002]** 后端增加专注日志最短有效时长校验（防 0 秒刷榜）。
16. **[P3-003]** 拆分超千行的 Vue 视图组件，提炼通用 Composables。
17. **[P3-004]** 将版本号自增改造为单条原子递增 SQL 语句。

---

## 15. 总体结论

Sacred Focus 是一套设计哲学极佳、架构骨架清晰、业务针对性极强的个人效能自控中枢。项目成功落地了纯 HttpOnly Cookie 鉴权、轻量 SQLite WAL 引擎以及 CAS 乐观版本并发控制，展现了优秀的工程品味。

然而，审查发现了 **3 项 P0 致命安全与一致性漏洞**（IP 标头伪造绕过限流、生产编排硬编码兜底密钥、每日结算漏自增版本导致状态覆写）以及 **5 项 P1 核心业务缺陷**（冻结态被误清零、单点修改未通知多端同步、列表过滤拖拽丢数据、反悔刷级漏洞、离开页面逃脱惩罚）。这些缺陷直接动摇了系统的“自控权威性”和数据安全性。

在实施第一和第二梯队的加固修复之前，**不建议直接暴露于无保护的公网环境中进行多端协同生产使用**。完成修复后，该系统将成为一款极其坚固、优雅的生产力中枢。

---

## 16. 审查限制

1. **审查未覆盖部分：** 未针对音频文件播放的底层 Web Audio API 编解码兼容性进行多浏览器跨平台实机测试。
2. **静态分析局限性：** IP 标头伪造与限流绕过、OCC 乐观版本并发竞争窗口虽已通过代码静态语法追踪和逻辑链严密证实，但各物理代理设备在极端异常网络断流场景下的长连接保活表现需运行环境配合验证。
3. **外部环境依赖：** iOS Safari 息屏冻结机制对定时器剩余时间呈现的影响依赖真机调试环境。
