# Sacred Focus 全系统生产级安全加固、鉴权与多端协同防护方案 (v2.0)

> **系统定位**：个人自控工程学与心流契约数字管理中枢（国策树与神圣座位）  
> **方案目标**：在将应用部署至公网云端或局域网私有云时，构建**工业级防御纵深（Defense-in-Depth）**与**多端原子级数据一致性协同体系**。彻底阻断未授权访问、自动化爬虫扫描、暴力撞库与恶意数据清空；同时保障本机/内网开发免检、日光/极夜双主题统一视觉、长效无感免登以及跨端（PC + 移动端 PWA）并发防覆写。

---

## 目录索引
1. [威胁建模与安全边界全景](#一-威胁建模与安全边界全景)
2. [第一道防线：单用户身份核验与双轨会话治理 (Auth System)](#二-第一道防线单用户身份核验与双轨会话治理-auth-system)
3. [第二道防线：智能边界分流与多梯级速率限制 (Traffic & Anti-Crawler)](#三-第二道防线智能边界分流与多梯级速率限制-traffic--anti-crawler)
4. [第三道防线：HTTP 安全头与传输层加固 (Helmet & CORS)](#四-第三道防线http-安全头与传输层加固-helmet--cors)
5. [第四道防线：静默自动同步与双层版本并发控制 (Silent Sync & OCC)](#五-第四道防线静默自动同步与双层版本并发控制-silent-sync--occ)
6. [第五道防线：宿主机与网络基线防御 (Host & Infrastructure Hardening)](#六-第五道防线宿主机与网络基线防御-host--infrastructure-hardening)
7. [第六道防线：数据持久性安全与灾备恢复 (Backup & Data Integrity)](#七-第六道防线数据持久性安全与灾备恢复-backup--data-integrity)
8. [前端视觉与交互：极夜深色与日光浅色双主题无缝认证](#八-前端视觉与交互极夜深色与日光浅色双主题无缝认证)
9. [全系统详细配置清单与代码实现蓝图](#九-全系统详细配置清单与代码实现蓝图)

---

## 一、 威胁建模与安全边界全景

### 1. 公网威胁面与防御纵深模型

```
                                  【公网威胁拦截与防御纵深】
                                               │
┌──────────────────────────────────────────────▼──────────────────────────────────────────────┐
│  第 5 道防线：宿主机与网络基线 (Localhost 127.0.0.1 隔离 + UFW 防火墙 + Nginx SSL 终结 + Fail2ban) │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │ (仅放行 443 HTTPS，反向代理转发)
┌──────────────────────────────────────────────▼──────────────────────────────────────────────┐
│  第 3 道防线：传输层与 HTTP 安全头 (Helmet CSP + 严格 CORS 域名锁定 + 隐藏 Express 指纹)       │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
┌──────────────────────────────────────────────▼──────────────────────────────────────────────┐
│  第 2 道防线：智能边界分流与动态频控 (本机/内网规则免检 + 导出15次/10分 + 导入10次/时 + 蜜罐诱捕)│
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
┌──────────────────────────────────────────────▼──────────────────────────────────────────────┐
│  第 1 道防线：身份核验与会话生命周期 (双轨 JWT/HttpOnly + bcrypt加盐哈希 + 30天免登 + 二次密码核验) │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
┌──────────────────────────────────────────────▼──────────────────────────────────────────────┐
│  第 4 道防线：静默自动同步与乐观版本锁 (探针探测 <100B + 唤醒静默重拉 + system_revision CAS 锁) │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │ (合法业务数据持久化)
┌──────────────────────────────────────────────▼──────────────────────────────────────────────┐
│  第 6 道防线：数据持久性与容灾底线 (高危导入自动 Pre-Import 快照 + SQLite 在线热备 + 异地冷备)  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2. 多运行拓扑支持与核心资产保护矩阵

| 部署形态 | 访问来源 | 安全策略与体验 |
| :--- | :--- | :--- |
| **本地开发机** | `127.0.0.1` / `::1` | 开启【规则免检模式】：无频控限制、免爬虫特征检测，保障 `npm run dev` 极致丝滑 |
| **家庭局域网 / NAS / Tailscale** | `192.168.x.x` / `10.x.x.x` / `100.x.x.x` | 自动识别为可信内网：免通用频控拦截，支持多设备在内网流畅联动 |
| **公网云服务器** | 公网 IP (未知客户端) | 开启【分级防御模式】：未认证严苛限流与防爬；已认证放宽至 600~1200次/分 |

**核心保护资产**：
- **神圣专注流水日志 (`focus_session_logs`)**：绝对私密的个人心流反思与时长记录；
- **主链连胜计数器与神圣座位状态**：自控契约的严肃性核心，杜绝非法清零与篡改；
- **国策树全景拓扑与规范卡**：个人中长期发展蓝图，含深层心理机制与战略步骤；
- **下必为例判例法典**：终身执行判罚准则，需防范越权删除或恶意覆写。

---

## 二、 第一道防线：单用户身份核验与双轨会话治理 (Auth System)

本项目为**私有专属自控中枢**，采用**“单用户专属管理员模型”（Private Single-Admin Model）**，兼顾轻量化、极高安全边界与移动端无感免登。

### 1. 密码学安全存储规范
- **算法选择**：采用工业标准 `bcrypt` 或纯 JavaScript 跨平台零编译依赖的 `bcryptjs`（加盐轮数 `rounds = 12`）；
- **加盐哈希（Salted Hash）**：绝对防御彩虹表反查；
- **存储介质**：
  - 密码散列值存放在服务端生产环境配置 `ADMIN_PASSWORD_HASH` 中；
  - 严禁在源码仓库、前端 Bundle 或日志中硬编码明文密码。

### 2. 双轨凭证分发机制（Web 浏览器 + 移动端 PWA 兼容）

```
  [客户端 Client]                                    [服务端 Express Server]
         │                                                      │
         │─── 1. POST /api/auth/login { password } ────────────►│ 校验 bcrypt 哈希
         │                                                      │
         │◄── 2. 返回 HttpOnly Cookie + 响应体 Bearer Token ────│ 签发 30 天有效 JWT
         │                                                      │
         │─── 3. 业务请求 (Web 自动带 Cookie; PWA 带 Header) ──►│ 统一中间件校验签名
```

- **双轨存储优势**：
  - **PC 桌面浏览器**：默认采用 **`HttpOnly; Secure; SameSite=Strict` Cookie**。JavaScript 脚本无法通过 `document.cookie` 读取，彻底免疫 XSS 盗取凭证；
  - **手机移动端 PWA（独立视口 Standalone 模式）**：部分移动浏览器在添加到主屏幕后可能存在 Cookie 沙盒隔离问题，因此服务端在登录成功响应体中同时附带 `token` 字符串，前端 Pinia 持久化在 `localStorage`，并在请求头中附加 `Authorization: Bearer <token>`；
  - **后端统一提取**：鉴权中间件优先从 `Authorization: Bearer` 提取，未附带时自动回退提取 Cookie，双端无缝兼容。
- **长效免登会话（消除心智摩擦）**：
  - Token 有效期设置为 **30 天**。自控工具的核心在于“随手即开、零启动阻力”，杜绝用户每日输入复杂密码的心理损耗。

### 3. 高危接口二次核验与自动预热备
针对以下两类高危破坏性接口：
1. `POST /api/system/import`（全量清空并覆写整机数据）
2. `POST /api/sacred-seat/reset-streak`（清空主链连胜天数）
- **二次核验机制**：请求 Header 必须显式携带 `X-Admin-Password` 进行当前密码核验；
- **自动快照防线**：在执行 `DELETE FROM ...` 之前，服务端自动触发 SQLite 内存级 `.backup` 生成预导入时间戳备份文件，即使误传空文件亦可瞬间回滚。

---

## 三、 第二道防线：智能边界分流与多梯级速率限制 (Traffic & Anti-Crawler)

### 1. 客户端 IP 感知与“规则模式”判定器
通过中间件自动识别客户端 IP 属性：
- **本机回环**：`127.0.0.1`, `::1`, `::ffff:127.0.0.1`；
- **私有局域网网段**：`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`；
- **用户自选可信 IP**：环境变量 `TRUSTED_IPS`（例如您的家宽/手机固定公网 IP）。

```typescript
// backend/src/middleware/ipRules.ts
import { Request } from 'express';

const trustedList = (process.env.TRUSTED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);

export function isLocalOrTrusted(req: Request): boolean {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket.remoteAddress) || '';
  const ip = rawIp.replace(/^::ffff:/i, '').trim();

  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  return trustedList.includes(ip);
}
```

### 2. 差异化速率限制矩阵 (Rate Limiting Matrix)

针对不同访问角色与操作危险度，配置非对称限流器：

| 访问者身份 | 请求目标接口 | 速率配额 (Rate Limit) | 策略说明 |
| :--- | :--- | :---: | :--- |
| **本机 / 可信内网** | 全部接口 | **完全免限 (Bypass)** | 本地调试、健康检查与 NAS 局域网访问零阻碍 |
| **公网已认证管理员** | 常规业务 API | **600 ~ 1200 次 / 分钟**<br>(支持 5s 突发 50 次) | 从容支撑画布批量拖拽、快速连续点亮与多组件并发拉取 |
| **公网已认证管理员** | 全量整机导出 (`/api/system/export`) | **15 次 / 10 分钟**<br>(平均 40s/次) | 满足多端换机与导出验证需求，彻底遏制高频序列化拖库 DoS 风险 |
| **公网已认证管理员** | 全量整机导入 (`/api/system/import`) | **10 次 / 小时** | 极低频容错，严格防范误触刷爆磁盘 I/O |
| **公网未认证/未知 IP** | 登录接口 (`/api/auth/login`) | **5 次 / 15 分钟** | 密码错误超限立即封锁 15 分钟，阻断字典撞库 |
| **公网未认证/未知 IP** | 未授权探测接口 | **30 次 / 分钟** | 限制未知公网请求频次，降低服务器资源消耗 |

### 3. 爬虫特征过滤与蜜罐诱捕 (Anti-Crawler & Honeypot)
- **User-Agent 过滤**：针对公网未认证请求，凡带 `python-requests`、`Scrapy`、`Go-http-client`、`curl/`、`zgrab` 等脚本特征的，直接响应 `403 Forbidden` 并阻断继续查询；
- **蜜罐诱捕陷阱**：在 Express 顶层注册黑客常见扫描探测路径（如 `/.env`、`/.git/config`、`/wp-login.php`、`/admin.php`、`/phpmyadmin`、`/actuator`）。一旦有外部 IP 访问这些路径，立即记录至黑名单缓存，**直接拉黑该 IP 72 小时**。

---

## 四、 第三道防线：HTTP 安全头与传输层加固 (Helmet & CORS)

### 1. 工业级安全响应头 (`helmet`)
自动装配完备的 HTTP 响应防护头：
- **内容安全策略 (CSP)**：限制脚本与样式仅加载 `'self'`（以及生产静态打包资源），禁止非受信任外部脚本注入执行；
- **防点击劫持 (Frameguard)**：`X-Frame-Options: DENY`，绝对禁止任何第三方网页将系统以 `<iframe>` 嵌套进行诱骗点击；
- **禁止 MIME 嗅探**：`X-Content-Type-Options: nosniff`，杜绝恶意脚本伪装成静态图片被解析；
- **隐藏服务端标识**：自动剥离 `X-Powered-By: Express`，避免暴露底层技术栈及版本号；
- **强制 HTTPS (HSTS)**：`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`，强制浏览器全周期采用 HTTPS 通信。

### 2. 严格的 CORS 同源闭环
- **生产环境**：前端与后端统一汇聚在 Nginx 443 端口之下，CORS 配置仅允许专属个人域名；彻底禁止外部未知源发起跨站凭证请求；
- **开发环境**：允许 `localhost:5180` 发起代理请求，确保本地热更新调试体验顺畅。

---

## 五、 第四道防线：静默自动同步与双层版本并发控制 (Silent Sync & OCC)

在多端场景（手机移动端 PWA + 桌面电脑浏览器）下，若电脑端滞留了未关闭的历史页面，直接保存会导致手机上的最新修改被覆盖（**脏写 / Lost Update**）。系统采用“双层解耦版本体系”彻底消灭并发覆盖。

### 1. 宏观演化版本 vs 底层系统原子纪元版本（双层解耦）

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  第一层：宏观业务演化版本 (Macro Evolution Version)                                       │
│  - 标识规范：v1.0, v1.1, v2.0 (由 5 槽位版本环持久化)                                    │
│  - 领域范围：仅国策树 (Focus Tree)                                                         │
│  - 触发机制：用户在画布上深思熟虑后，手动归档新版本、输入更新日志（Changelog）           │
│  - 业务价值：防策略震荡，作为个人自控长周期演化里程碑，支持版本指针安全回滚              │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                           │ (完全解耦，互不干扰)
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  第二层：底层系统原子纪元版本 (System Atomic Revision)                                     │
│  - 标识规范：单调自增纯整数 (例如 revision: 1048)                                        │
│  - 领域范围：全域数据（国策树 + 神圣座位 + 专注流水 + 判例法典）                           │
│  - 触发机制：全自动透明触发。底层任一表发生有效写事务，原子累加 revision + 1             │
│  - 业务价值：驱动页面唤醒静默同步 (Silent Auto-Sync) 与 乐观并发锁 (OCC 409 Conflict)   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2. 极轻量探针接口 (`GET /api/sync/status`)
- 接口响应体体积 **< 100 字节**，消耗流量微乎其微：
  ```json
  {
    "revision": 1048,
    "evolutionVersion": "v1.2",
    "updatedAt": "2026-09-08T11:30:00.000Z"
  }
  ```

### 3. 客户端静默自动同步 (Silent Auto-Sync)
前端在全局生命周期中监听以下三个时机，发起轻量探针探测：
1. **页面唤醒/切回前台**：`document.addEventListener('visibilitychange')`（手机从后台切回，或电脑切回当前浏览器标签页）；
2. **窗口重新获得焦点**：`window.addEventListener('focus')`；
3. **低频心跳探针**：每 60 秒轮询一次探针接口（极低频，耗能可忽略）。

**自愈同步判定逻辑**：
- 当探针返回 `serverRevision > localRevision` 时：
  - **干净态（本地无未保存的拖拽排版或表单草稿）**：**100% 静默更新**，Pinia Store 在后台重新拉取数据，界面平滑无感过渡，右下角展示极简微光小点或淡入 1 秒提示：“已同步最新演化状态”；
  - **脏草稿态（本地正在连线或修改国策属性）**：不强行刷新打断用户操作，但在保存按钮上泛起温和提示，进入乐观锁校验通道。

### 4. 乐观并发锁 (Optimistic Concurrency Control, OCC)
- 前端所有持久化写操作（保存国策树、修改神圣座位参数等）在请求中携带 `expectedRevision: number`；
- 后端在开启 SQLite 事务时进行原子校验：
  - 若 `expectedRevision === currentRevision`：正常写入并递增 `revision`，返回成功；
  - 若版本不匹配：事务立即回滚，抛出 **`409 Conflict`** 状态码，附带服务端最新快照；
- **前端冲突处理**：
  捕获 `409 Conflict` 后，弹出极简磨砂冲突裁决抽屉，提供明确自主决策权：
  1. **【以当前修改为准】**：拉取最新 `revision` 后强制覆盖写入；
  2. **【拉取云端最新数据】**：放弃本地草稿，重置为服务端最新状态，杜绝自控数据被静默覆灭。

---

## 六、 第五道防线：宿主机与网络基线防御 (Host & Infrastructure Hardening)

### 1. 服务端强制本地回环绑定 (Localhost Loopback Only)
- **核心逻辑**：修改 `backend/src/server.ts` 监听地址，生产环境仅绑定 `127.0.0.1`：
  ```typescript
  const HOST = process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`[Sacred Focus] Server running on http://${HOST}:${PORT}`);
  });
  ```
- **核心效果**：即使云服务器在控制台安全组误放行了 3000 端口，公网外部也绝对无法绕过 Nginx 直接探测或发起 API 访问。

### 2. Linux UFW 极简防火墙策略
在 Ubuntu 服务器上只放行极简安全管道：
```bash
# 1. 默认拒绝所有传入连接
sudo ufw default deny incoming
# 2. 默认允许所有传出连接
sudo ufw default allow outgoing
# 3. 开放 Web 服务标准端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# 4. 开放自定义的非标高位 SSH 端口 (如 22222)
sudo ufw allow 22222/tcp
# 5. 启动防火墙
sudo ufw enable
```

### 3. SSH 安全加固与 Fail2ban 防爆破
1. **修改 SSH 默认端口**：编辑 `/etc/ssh/sshd_config`，将 `Port 22` 改为自定义高位端口（如 `22222`），规避 99% 的公网盲扫脚本；
2. **禁用 Root 远程密码登录**：设置 `PermitRootLogin prohibit-password` 与 `PasswordAuthentication no`（仅允许 SSH 私钥对登录）；
3. **部署 Fail2ban**：安装 `fail2ban` 监控 `/var/log/auth.log`，凡是在 5 分钟内 SSH 认证失败超过 3 次的 IP，iptables 自动将其拉黑封禁 24 小时。

---

## 七、 第六道防线：数据持久性安全与灾备恢复 (Backup & Data Integrity)

### 1. 数据库底层权限隔离
```bash
# 限制 SQLite 数据库文件权限：仅运行 Node 服务的专属系统用户可读写
chmod 600 /var/www/sacred-focus/backend/data/app.db
chmod 700 /var/www/sacred-focus/backend/data
```

### 2. 导入前强制自动生成 Pre-Import 热备
在 `/api/system/import` 路由处理逻辑中，接收到数据后、执行事务擦除前，强制调用 SQLite 原生备份：
```typescript
const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const preImportBackupPath = path.join(config.dataDir, `app_pre_import_${backupTimestamp}.db`);
await db.backup(preImportBackupPath);
```

### 3. 每日系统级自动热备脚本 (`backup-db.sh`)
利用 SQLite 自带的 WAL 安全热备指令 `.backup`（不阻塞任何业务读写）：
```bash
#!/bin/bash
# /opt/scripts/sacred-focus-backup.sh

BACKUP_DIR="/var/backups/sacred-focus"
SOURCE_DB="/var/www/sacred-focus/backend/data/app.db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TARGET_FILE="${BACKUP_DIR}/sacred_focus_${TIMESTAMP}.db"

mkdir -p ${BACKUP_DIR}

# 执行安全在线热备 (WAL 模式无锁安全复制)
sqlite3 ${SOURCE_DB} ".backup '${TARGET_FILE}'"
chmod 400 ${TARGET_FILE}

# 自动清理 30 天以前的历史备份，防磁盘写满
find ${BACKUP_DIR} -type f -name "sacred_focus_*.db" -mtime +30 -delete

echo "[$(date)] Backup successful: ${TARGET_FILE}" >> /var/log/sacred_focus_backup.log
```
在系统定时任务 `crontab -e` 中添加：
```cron
# 每天凌晨 03:30 自动执行数据库热备
30 3 * * * /bin/bash /opt/scripts/sacred-focus-backup.sh
```

---

## 八、 前端视觉与交互：极夜深色与日光浅色双主题无缝认证

安全与登录界面严禁只做深色模式，必须**100% 深度复用全系统现有 CSS 变量体系**，支持根据用户喜好或系统设置秒级平滑转场。

### 1. 双主题配色规范矩阵

| UI 视觉要素 | 极夜 OLED 深色模式 (`data-theme="dark"`) | 日光极简浅色模式 (`data-theme="light"`) |
| :--- | :--- | :--- |
| **全屏底色** | `--bg-primary` (`#0A0A0C` 极深纯黑) | `--bg-primary` (`#F8F9FA` 纸感冷灰) |
| **卡片背景** | `--bg-card` (`rgba(18, 18, 22, 0.85)` 黑曜石毛玻璃) | `--bg-card` (`rgba(255, 255, 255, 0.90)` 象牙白毛玻璃) |
| **边框线条** | `--border-color` (`#26262F` 幽微灰边) | `--border-color` (`#E2E4E8` 精致浅灰边) |
| **主标题字** | `--text-primary` (`#EDEDED` 冷银白) | `--text-primary` (`#111827` 墨黑高对比) |
| **副标题字** | `--text-secondary` (`#94949E` 哑光灰) | `--text-secondary` (`#4B5563` 深石板灰) |
| **纯 SVG 锁图标** | 冷银白描边 (`#EDEDED`)，科技肃穆感 | 墨黑描边 (`#111827`)，极简现代感 |
| **输入聚焦微光** | `--color-lit` (`#00F0FF` 天青色科技微光) | `--color-lit` (`#0284C7` 蔚蓝色柔光) |
| **密码错误震颤** | `--color-danger` (`#F43F5E` 警示猩红) | `--color-danger` (`#E11D48` 珊瑚赤红) |
| **卡片环境阴影** | `0 20px 40px -15px rgba(0, 0, 0, 0.7)` | `0 20px 40px -15px rgba(0, 0, 0, 0.08)` |

### 2. 双主题登录卡片效果示意

```
  【极夜深色 (OLED Dark)】                   【日光浅色 (Daylight Light)】
┌───────────────────────────────┐       ┌───────────────────────────────┐
│      [ ⚿ 极简纯白矢量锁 ]     │       │      [ ⚿ 极简墨黑矢量锁 ]     │
│        SACRED FOCUS           │       │        SACRED FOCUS           │
│   神 圣 契 约 访 问 核 验     │       │   神 圣 契 约 访 问 核 验     │
│                               │       │                               │
│ ┌───────────────────────────┐ │       │ ┌───────────────────────────┐ │
│ │ ••••••••••••••••  (天青边)│ │       │ │ ••••••••••••••••  (蔚蓝边)│ │
│ └───────────────────────────┘ │       │ └───────────────────────────┘ │
│                               │       │                               │
│ [ 进 入 自 控 中 枢 (Enter) ] │       │ [ 进 入 自 控 中 枢 (Enter) ] │
└───────────────────────────────┘       └───────────────────────────────┘
 (纯黑背景 + 纳米毛玻璃 + 幽微荧光)        (象牙白背景 + 纸感毛玻璃 + 极轻弥散阴影)
```

- **交互体验特质**：
  - 100% 杜绝幼稚 Emoji，统一采用精细几何 SVG 锁形徽标；
  - 密码输入错误触发轻量级的弹性横向抖动动效（`shake`）；
  - 支持移动端软键盘“回车即提交”与长按显示密码；
  - 登录成功后自动无缝回跳至用户原先尝试访问的目标路由。

---

## 九、 全系统详细配置清单与代码实现蓝图

### 1. 后端依赖清单 (`backend/package.json`)
```bash
npm install bcryptjs jsonwebtoken express-rate-limit helmet cookie-parser
npm install --save-dev @types/bcryptjs @types/jsonwebtoken @types/cookie-parser
```

### 2. 后端服务端环境变量配置 (`backend/.env.production`)
```ini
NODE_ENV=production
PORT=3000
DATA_DIR=/var/www/sacred-focus/backend/data

# 64 位高熵 JWT 签名私钥 (可通过 openssl rand -base64 48 生成)
JWT_SECRET=your_super_secret_high_entropy_jwt_signing_key_64_bytes_sacred_focus

# 管理员密码加盐哈希 (通过 bcrypt.hashSync('YourSecurePassword', 12) 生成)
ADMIN_PASSWORD_HASH=$2a$12$e8x...your_bcrypt_hashed_admin_password_here...

# 可选：受信任的固定 IP 白名单 (免通用限流，多个用逗号分隔)
TRUSTED_IPS=
```

### 3. IP 规则与限流中间件核心实现

#### (1) `backend/src/middleware/ipRules.ts`
```typescript
import { Request } from 'express';

const trustedList = (process.env.TRUSTED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);

export function isLocalOrTrusted(req: Request): boolean {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket.remoteAddress) || '';
  const ip = rawIp.replace(/^::ffff:/i, '').trim();

  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  return trustedList.includes(ip);
}
```

#### (2) `backend/src/middleware/rateLimiter.ts`
```typescript
import rateLimit from 'express-rate-limit';
import { isLocalOrTrusted } from './ipRules.js';

// 1. 登录防爆破限流器 (15 分钟限 5 次，公网生效，本机豁免)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: (req) => isLocalOrTrusted(req),
  message: { error: 'TOO_MANY_ATTEMPTS', message: '触发安全防爆破保护：连续错误尝试过多，请 15 分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

// 2. 通用业务 API 限流器 (已认证放宽至 1000次/分，未认证 60次/分，本机完全豁免)
export const apiGeneralLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => ((req as any).user ? 1000 : 60),
  skip: (req) => isLocalOrTrusted(req),
  message: { error: 'RATE_LIMIT_EXCEEDED', message: '请求过于频繁，触发系统心流节流保护' },
  standardHeaders: true,
  legacyHeaders: false
});

// 3. 全量导出限流器 (15 次 / 10 分钟，防批量拖库与内存打满)
export const exportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  skip: (req) => isLocalOrTrusted(req),
  message: { error: 'EXPORT_LIMIT_EXCEEDED', message: '系统全量导出频次超限，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

// 4. 全量导入限流器 (10 次 / 小时，极低频容错)
export const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  skip: (req) => isLocalOrTrusted(req),
  message: { error: 'IMPORT_LIMIT_EXCEEDED', message: '整机数据导入频次达到上限，请稍后再试' }
});
```

### 4. 鉴权与安全中间件实现

#### (1) `backend/src/middleware/auth.ts`
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { isLocalOrTrusted } from './ipRules.js';

const PUBLIC_PATHS = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/status',
  '/api/sync/status'
];

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. 公开路径直接放行
  if (PUBLIC_PATHS.some(path => req.path === path)) {
    return next();
  }

  // 2. 提取 Token (优先 Authorization Bearer 头，备选 HttpOnly Cookie)
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace(/^Bearer\s+/i, '') || (req.cookies && req.cookies['sf_token']);

  if (!token) {
    return res.status(401).json({ 
      error: 'UNAUTHORIZED', 
      message: '神圣契约拒绝未授权访问，请先验证身份' 
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ 
      error: 'TOKEN_EXPIRED_OR_INVALID', 
      message: '访问凭证已过期或无效，请重新登录' 
    });
  }
}
```

#### (2) `backend/src/middleware/security.ts` (爬虫过滤与蜜罐诱捕)
```typescript
import { Request, Response, NextFunction } from 'express';
import { isLocalOrTrusted } from './ipRules.js';

const HONEYPOT_PATHS = [
  '/.env',
  '/.git/config',
  '/wp-login.php',
  '/admin.php',
  '/phpmyadmin',
  '/actuator'
];

const BANNED_UA_PATTERNS = [
  /python-requests/i,
  /Scrapy/i,
  /Go-http-client/i,
  /zgrab/i
];

const ipBlacklist = new Set<string>();

export function securityFilter(req: Request, res: Response, next: NextFunction) {
  if (isLocalOrTrusted(req)) return next();

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || '';

  // 1. 黑名单直接阻断
  if (ipBlacklist.has(clientIp)) {
    return res.status(403).json({ error: 'ACCESS_DENIED' });
  }

  // 2. 蜜罐路径诱捕
  if (HONEYPOT_PATHS.some(p => req.path.toLowerCase().startsWith(p))) {
    console.warn(`[Honeypot Triggered] IP: ${clientIp} accessed: ${req.path}`);
    ipBlacklist.add(clientIp);
    setTimeout(() => ipBlacklist.delete(clientIp), 72 * 60 * 60 * 1000); // 封禁 72 小时
    return res.status(403).json({ error: 'SECURITY_TRAP_TRIGGERED' });
  }

  // 3. 爬虫 User-Agent 过滤
  const ua = req.headers['user-agent'] || '';
  if (BANNED_UA_PATTERNS.some(regex => regex.test(ua))) {
    return res.status(403).json({ error: 'CRAWLER_BLOCKED' });
  }

  next();
}
```

### 5. 探针与乐观锁路由 (`backend/src/routes/sync.ts`)
```typescript
import { Router, Request, Response } from 'express';
import { db } from '../db.js';

const router = Router();

// 轻量同步探针 (响应 < 100 字节)
router.get('/status', (_req: Request, res: Response) => {
  const revRow = db.prepare("SELECT value FROM system_meta WHERE key = 'system_revision'").get() as any;
  const timeRow = db.prepare("SELECT value FROM system_meta WHERE key = 'last_sync_timestamp'").get() as any;
  const activeSnapRow = db.prepare(`
    SELECT s.version FROM evolution_snapshots s 
    JOIN evolution_state e ON s.slotIndex = e.activePointerIndex 
    WHERE e.id = 1
  `).get() as any;

  res.json({
    revision: parseInt(revRow?.value || '1', 10),
    evolutionVersion: activeSnapRow?.version || 'v1.0',
    updatedAt: timeRow?.value || new Date().toISOString()
  });
});

export default router;
```

### 6. 前端统一 API 客户端 (`frontend/src/utils/api.ts`)
```typescript
import { router } from '../router';

interface ApiRequestOptions extends RequestInit {
  expectedRevision?: number;
}

export async function apiFetch<T = any>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = localStorage.getItem('sf_auth_token');
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include' // 自动携带 HttpOnly Cookie
  });

  // 1. 拦截 401 未授权：清空凭证，重定向至 /login
  if (res.status === 401) {
    localStorage.removeItem('sf_auth_token');
    const currentPath = router.currentRoute.value.fullPath;
    if (currentPath !== '/login') {
      router.push({ path: '/login', query: { redirect: currentPath } });
    }
    throw new Error('UNAUTHORIZED');
  }

  // 2. 拦截 409 版本冲突：抛出并发异常供组件处理
  if (res.status === 409) {
    const errorData = await res.json().catch(() => ({}));
    const conflictError: any = new Error('VERSION_CONFLICT');
    conflictError.details = errorData;
    throw conflictError;
  }

  // 3. 拦截 429 请求超限
  if (res.status === 429) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || '请求过于频繁，请稍后再试');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP Error ${res.status}`);
  }

  return res.json();
}
```

### 7. 前端多端唤醒静默同步管理器 (`frontend/src/utils/syncManager.ts`)
```typescript
import { apiFetch } from './api';
import { useFocusTreeStore } from '../stores/focusTree';
import { useSacredSeatStore } from '../stores/sacredSeat';

let currentKnownRevision = 0;
let syncTimer: any = null;

export function initSyncManager() {
  // 1. 探针比对核心方法
  async function probeAndSync() {
    try {
      const data = await apiFetch<{ revision: number; updatedAt: string }>('/api/sync/status');
      if (currentKnownRevision === 0) {
        currentKnownRevision = data.revision;
        return;
      }

      if (data.revision > currentKnownRevision) {
        currentKnownRevision = data.revision;
        const focusTreeStore = useFocusTreeStore();
        const sacredSeatStore = useSacredSeatStore();

        // 仅当本地没有未保存的草稿时静默刷新
        if (!focusTreeStore.isDirty) {
          await Promise.all([
            focusTreeStore.fetchTreeData(),
            sacredSeatStore.fetchConfig(),
            sacredSeatStore.fetchLogs()
          ]);
          console.log('[SyncManager] Silently synced to latest revision:', currentKnownRevision);
        }
      }
    } catch (e) {
      // 探针失败不打扰正常使用
    }
  }

  // 2. 页面可见性与焦点监听 (手机切回前台/电脑切回标签页)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') probeAndSync();
    });
    window.addEventListener('focus', () => probeAndSync());
  }

  // 3. 60 秒低频心跳定时器
  syncTimer = setInterval(probeAndSync, 60000);
}
```

### 8. Nginx 生产反向代理配置 (`/etc/nginx/sites-available/sacred-focus.conf`)
```nginx
server {
    listen 80;
    server_name focus.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name focus.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/focus.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/focus.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 静态资源由 Nginx 直接高效托管
    root /var/www/sacred-focus/frontend/dist;
    index index.html;

    # 前端路由重写
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 反向代理至本地回环 3000
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 十、 落地执行清单与实施路线图

```
 [Step 1: 安装依赖]
 npm install bcryptjs jsonwebtoken express-rate-limit helmet cookie-parser
 npm install --save-dev @types/bcryptjs @types/jsonwebtoken @types/cookie-parser
        │
        ▼
 [Step 2: 环境变量与密钥配置]
 配置 backend/.env (JWT_SECRET, ADMIN_PASSWORD_HASH)
        │
        ▼
 [Step 3: 后端中间件装配]
 接入 ipRules (规则免检), rateLimiter (差异化频控), security (蜜罐防爬), authMiddleware (双轨验签)
        │
        ▼
 [Step 4: 探针与高危接口强化]
 接入 /api/sync/status 探针路由，/import 前自动 pre-import 热备
        │
        ▼
 [Step 5: 前端网络层与双主题登录页]
 创建 api.ts 拦截器、syncManager.ts 静默同步管理器、LoginView.vue 双主题登录视图与路由守卫
        │
        ▼
 [Step 6: 本地与生产环境验证]
 验证内网访问免限流畅度、公网撞库 429 拦截、切回前台静默同步及 409 冲突锁机制
```

---

## 结语

本方案不仅是一套防范黑客渗透的坚固盾牌，更是为个人自控中枢量身定制的**高可用数据稳态体系**。通过**智能边界分流**、**双轨无感会话**、**极夜/日光双主题统一审美**与**静默同步/乐观并发锁**，Sacred Focus 将真正具备工业级的自愈力与韧性，从容应对公网全天候环境，捍卫终身心流自控契约。
