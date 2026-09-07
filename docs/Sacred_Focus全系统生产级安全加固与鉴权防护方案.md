# Sacred Focus 全系统生产级安全加固与鉴权防护方案

> **系统定位**：个人自控工程学与心流契约数字管理中枢  
> **方案目标**：在将本地单机应用迁移至公网云端时，构建**工业级防御纵深（Defense-in-Depth）**，彻底阻断未授权访问、自动化爬虫探测、暴力撞库破解与勒索攻击，保障个人自控契约数据的私密性与高稳态。

---

## 目录索引
1. [威胁建模与安全边界分析](#一-威胁建模与安全边界分析)
2. [第一道防线：用户身份认证与权限控制体系 (Auth System)](#二-第一道防线用户身份认证与权限控制体系-auth-system)
3. [第二道防线：API 速率限制与防爬虫防御 (Rate Limiting & Anti-Crawler)](#三-第二道防线api-速率限制与防爬虫防御-rate-limiting--anti-crawler)
4. [第三道防线：HTTP 安全头与传输层加固 (Helmet & CORS)](#四-第三道防线http-安全头与传输层加固-helmet--cors)
5. [第四道防线：操作系统与网络基线防御 (OS & Network Hardening)](#五-第四道防线操作系统与网络基线防御-os--network-hardening)
6. [第五道防线：数据持久性安全与灾备恢复 (Backup & Data Integrity)](#六-第五道防线数据持久性安全与灾备恢复-backup--data-integrity)
7. [分步实施落地路线图与代码清单](#七-分步实施落地路线图与代码清单)

---

## 一、 威胁建模与安全边界分析

本地开发环境与公网生产环境的核心差异在于**攻击面的彻底暴露**。一旦公网 IP 或域名上线，系统将面对全天候 7×24 小时的自动化网络扫描与嗅探。

```
                       【公网威胁面全景图】
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   未授权访问威胁 │    │   自动化爬虫扫描 │    │   端口与密码爆破 │
│ - 任意人篡改国策 │    │ - 遍历抓取 /api  │    │ - SSH 22 爆破    │
│ - 恶意清零主链   │    │ - 耗尽带宽与 I/O │    │ - 登录接口撞库   │
└──────────────────┘    └──────────────────┘    └──────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                     ┌───────────────────────┐
                     │ 工业级防御纵深加固体系│
                     │ (Defense-in-Depth)    │
                     └───────────────────────┘
```

### 1. 核心资产清单
- **神圣专注流水日志 (`focus_session_logs`)**：个人真实时间沉淀与反思记录，属高敏感个人隐私；
- **主链连胜计数器与神圣座位状态**：自控契约严肃性核心，绝不可被随意篡改或清空；
- **国策树全景拓扑与规范卡**：个人中长期发展蓝图，含深层心理机制；
- **下必为例判例法典**：终身执行判罚准则，需防范越权删除或恶意注入。

### 2. 威胁类型与防御手段矩阵

| 威胁场景 | 攻击手段 | 危害程度 | 针对性防御策略 |
| :--- | :--- | :---: | :--- |
| **未授权调用** | 直接向 `/api/*` 发起 POST/DELETE 请求 | **极高** | 全局 JWT Token 校验中间件 + 强身份认证 |
| **密码爆破** | 针对登录接口高频尝试弱口令字典 | **极高** | 速率限制（15分钟限5次） + `bcrypt` 强哈希延时 |
| **扫描器爬虫** | 自动化批量遍历 API，抓取全部私密数据 | **高** | User-Agent 过滤 + 接口全局频控 + 蜜罐路由封禁 |
| **接口越权擦除** | 误触或恶意调用 `/api/evolution/import` 覆写全量库 | **极高** | 导入冷备强制二次密码核验 + SQLite 热备机制 |
| **跨站请求伪造** | CSRF 钓鱼攻击、点击劫持（Clickjacking） | **中** | 严格同源策略（SameSite Cookie） + Helmet CSP |
| **主机层渗透** | SSH 22 默认端口暴力破解 | **极高** | 非标 SSH 端口 + 仅密钥登录 + Fail2ban 自动拉黑 |

---

## 二、 第一道防线：用户身份认证与权限控制体系 (Auth System)

本项目为**私有专属个人中枢系统**，最佳实践采用**“单用户专属管理员模式”（Private Single-Admin Model）**，兼顾轻量与绝对安全。

### 1. 密码安全存储方案
- **算法选择**：采用经过工业界长期检验的 **`bcrypt`**（加盐轮数 `rounds = 12`）或 `argon2id`；
- **加盐哈希（Salted Hash）**：即使不同系统密码相同，加盐后生成的 Hash 也完全不同，彻底防御彩虹表反查；
- **存储介质**：
  - 密码哈希仅存放在服务端安全环境变量 `ADMIN_PASSWORD_HASH`，或在 SQLite 用户专表中；
  - 绝对不在源码、前端或日志中硬编码明文密码。

### 2. JWT (JSON Web Token) 签发与验证机制

```
  [客户端 Client]                                    [服务端 Server]
        │                                                   │
        │─── 1. POST /api/auth/login { password } ─────────►│ 校验 bcrypt 哈希
        │                                                   │
        │◄── 2. 返回 HttpOnly Cookie 或 Bearer Token ───────│ 签发 JWT (有效期30天)
        │                                                   │
        │─── 3. 请求业务接口 (携带 Authorization 头) ──────►│ 校验 JWT 签名与有效期
        │                                                   │ 通过则放行，否则 401
```

- **Token 核心属性**：
  - **Payload**：`{ role: 'admin', iat: timestamp, exp: timestamp }`；
  - **签名算法**：`HS256`（搭配 64 位高熵伪随机密钥 `JWT_SECRET`）；
  - **有效期**：建议设置为 **30 天**（作为个人日常自控工具，兼顾手机端“长久免重复登录”的流畅体验）；
- **前端存储最佳实践**：
  - 首选：**`HttpOnly; Secure; SameSite=Strict` Cookie**，JavaScript 脚本无法通过 `document.cookie` 读取，从根源免疫 XSS 盗取 Token；
  - 移动端 PWA 兼容：同时支持请求头 `Authorization: Bearer <token>`，前端通过 Pinia 持久化在本地 `localStorage`，兼顾灵活性。

### 3. 后端统一鉴权拦截中间件 (`authMiddleware`)

```typescript
// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// 免鉴权白名单路径
const PUBLIC_PATHS = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/status'
];

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. 白名单直接放行
  if (PUBLIC_PATHS.some(path => req.path === path)) {
    return next();
  }

  // 2. 提取 Token (优先请求头，备选 Cookie)
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace(/^Bearer\s+/i, '') || (req.cookies && req.cookies['sf_token']);

  if (!token) {
    return res.status(401).json({ 
      error: 'UNAUTHORIZED', 
      message: '神圣契约拒绝未授权访问，请先完成身份核验' 
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ 
      error: 'TOKEN_EXPIRED_OR_INVALID', 
      message: '凭证已失效或伪造，请重新登录' 
    });
  }
}
```

### 4. 前端全局路由守卫与磨砂黑曜石登录页
- **Vue Router 前置守卫 (`router.beforeEach`)**：
  - 检查 Pinia 中是否存在登录凭据；
  - 若无凭据且访问非登录页，自动平滑重定向至 `/login`；
  - 登录成功后无缝跳转回上次访问的页面。
- **UI 设计规范**：
  - 延续整体极客硬核风格：黑曜石磨砂毛玻璃卡片、微光边框、纯 SVG 锁形图标、无 Emoji；
  - 支持手机端软键盘“回车即提交”，并在密码错误时激发柔和的红色微光震颤反馈。

---

## 三、 第二道防线：API 速率限制与防爬虫防御 (Rate Limiting & Anti-Crawler)

公网开放后，各种扫描机器人（如 Shodan、Censys 以及恶意抓取脚本）会持续向所有可见路径发起高频请求。必须配置梯度频率拦截。

### 1. 多梯级速率限制策略 (`express-rate-limit`)

```
                          【多梯级速率限制体系】
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   登录接口严控   │       │   通用数据读写   │       │   冷备导入高危   │
│ - 15分钟限 5 次  │       │ - 每分钟限 120次 │       │ - 每小时限 5 次  │
│ - 防暴力字典破解 │       │ - 防爬虫批量抓取 │       │ - 防数据库被刷爆 │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

#### 具体参数配置：
```typescript
import rateLimit from 'express-rate-limit';

// 1. 登录专用限流器（极严）
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟窗口
  max: 5,                   // 最多允许 5 次错误尝试
  message: { 
    error: 'TOO_MANY_ATTEMPTS', 
    message: '触发安全防爆破保护：密码连续错误次数过多，请 15 分钟后再试' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. 通用 API 限流器（适度）
export const apiGeneralLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 分钟窗口
  max: 120,                 // 单 IP 每分钟最多 120 次请求
  message: { error: 'RATE_LIMIT_EXCEEDED', message: '请求过于频繁，触发系统心流节流保护' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 3. 高危冷备导出/导入限流器（极低频）
export const migrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小时窗口
  max: 10,                  // 单 IP 每小时最多 10 次
  message: { error: 'BACKUP_LIMIT_EXCEEDED', message: '数据迁移频次达到上限，请稍后再试' }
});
```

### 2. 自动化爬虫特征过滤 (User-Agent Filter)
多数初级自动化脚本带有典型的默认 User-Agent。后端增设轻量过滤中间件：
- 阻断包含 `python-requests`、`curl`（除内部自测）、`Scrapy`、`Go-http-client`、`Java/` 等特征的抓取；
- 对疑似爬虫直接返回空响应或伪装的静态 HTML，不执行任何数据库查询，节省 CPU 算力。

### 3. 蜜罐诱捕与自动阻断 (Honeypot Trap)
在 Express 中注册几个常见的全网黑客扫描特征路由：
- 路径例如：`/admin.php`、`/wp-login.php`、`/phpmyadmin`、`/.env`、`/actuator/health`；
- **处理逻辑**：正常用户绝不会访问这些路径。一旦有 IP 触发这些请求，立即记录到系统黑名单缓存（或写入 Fail2ban 日志），**直接封禁该 IP 72 小时**。

---

## 四、 第三道防线：HTTP 安全头与传输层加固 (Helmet & CORS)

### 1. 安全头装配 (`helmet`)
引入工业级安全中间件 `helmet`，自动注入全套高标准 HTTP 安全响应头：

```typescript
import helmet from 'helmet';

app.use(helmet({
  // 1. 禁用 MIME 类型嗅探，防止恶意脚本伪装成静态图片被执行
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // 适配 Vite 静态打包
      styleSrc: ["'self'", "'unsafe-inline'"],  // 适配 CSS 变量动态注入
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    }
  },
  // 2. 杜绝点击劫持 (Clickjacking) - 严禁被任何第三方网站以 iframe 嵌套
  frameguard: { action: 'deny' },
  // 3. 开启严格 HSTS 强制 HTTPS (在取得正式证书后启用)
  hsts: {
    maxAge: 31536000, // 1 年
    includeSubDomains: true,
    preload: true
  },
  // 4. 隐藏 Express 驱动特征头 (默认移除 X-Powered-By)
  hidePoweredBy: true
}));
```

### 2. 严格的 CORS 同源收拢
在本地开发时，前端在 5180 端口，后端在 3000 端口，因此开启了宽松的 `cors()`。
上云后，前端和后端**统一汇聚在 Nginx 443 端口之下（同源）**：
- 可以直接配置为**仅允许当前专属域名**发起跨域请求；
- 杜绝任意外部恶意网页通过用户的浏览器向后端 API 发起静默请求。

---

## 五、 第四道防线：操作系统与网络基线防御 (OS & Network Hardening)

生产服务器的安全，80% 取决于宿主机操作系统的网络边界控制。

### 1. 服务端本地回环绑定 (Localhost Loopback Only)
- **核心措施**：修改后端 `server.ts` 监听逻辑：
  ```typescript
  // 生产环境绝对禁止监听 0.0.0.0 (所有公网网卡)
  const HOST = process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`Sacred Focus Backend running on http://${HOST}:${PORT}`);
  });
  ```
- **安全效果**：即使云服务器开放了端口，公网外部也根本连不上 3000 端口；所有请求**必须且只能通过配置了 SSL 和鉴权网关的 Nginx 代理**进入。

### 2. Linux UFW 极简防火墙策略
在 Ubuntu 系统中只放行绝对必要的通信管道：
```bash
# 1. 默认拒绝所有传入连接
sudo ufw default deny incoming
# 2. 默认允许所有传出连接
sudo ufw default allow outgoing
# 3. 开放 Web 服务标准端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# 4. 开放自定义的非标准 SSH 端口 (例如 22222)
sudo ufw allow 22222/tcp
# 5. 启动防火墙
sudo ufw enable
```

### 3. SSH 安全加固与 Fail2ban 防爆破
1. **修改默认 SSH 端口**：
   - 编辑 `/etc/ssh/sshd_config`，将 `Port 22` 改为高位非标端口（如 `Port 22222`）；
   - 彻底避开网络上 99% 的公网盲扫脚本；
2. **禁用 Root 远程密码登录**：
   - 设置 `PermitRootLogin prohibit-password`（仅允许 SSH 密钥登录）；
3. **安装配置 Fail2ban**：
   - `sudo apt install fail2ban`；
   - 监控 `/var/log/auth.log`，凡是在 5 分钟内认证失败超过 3 次的 IP，底层 iptables 自动拉黑封禁 24 小时。

---

## 六、 第五道防线：数据持久性安全与灾备恢复 (Backup & Data Integrity)

SQLite 具有极高的便携性（单文件即全量数据），但需防范误操作与硬件损毁。

### 1. 文件权限加固
```bash
# 限制 SQLite 数据库文件权限：仅运行 Node 服务的专属系统用户可读写
chmod 600 /var/www/sacred-focus/backend/sacred_focus.db
chmod 700 /var/www/sacred-focus/backend
```

### 2. 自动化热备份脚本 (`backup-db.sh`)
利用 SQLite 自带的在线安全热备命令 `.backup`（备份过程不阻塞任何业务读写）：

```bash
#!/bin/bash
# /opt/scripts/backup-db.sh

BACKUP_DIR="/var/backups/sacred-focus"
SOURCE_DB="/var/www/sacred-focus/backend/sacred_focus.db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TARGET_FILE="${BACKUP_DIR}/sacred_focus_${TIMESTAMP}.db"

mkdir -p ${BACKUP_DIR}

# 执行安全热备
sqlite3 ${SOURCE_DB} ".backup '${TARGET_FILE}'"

# 设置备份文件只读保护
chmod 400 ${TARGET_FILE}

# 自动清理保留最近 30 天的备份，防止磁盘溢满
find ${BACKUP_DIR} -type f -name "sacred_focus_*.db" -mtime +30 -delete

echo "[$(date)] Backup completed successfully: ${TARGET_FILE}" >> /var/log/sacred_focus_backup.log
```
在系统定时任务 `crontab -e` 中添加：
```cron
# 每天凌晨 03:30 自动执行数据库热备
30 3 * * * /bin/bash /opt/scripts/backup-db.sh
```

---

## 七、 分步实施落地路线图与代码清单

### 步骤清单（执行顺序）

```
 [Step 1: 安装依赖]
 npm install bcrypt jsonwebtoken express-rate-limit helmet cookie-parser
 npm install --save-dev @types/bcrypt @types/jsonwebtoken @types/cookie-parser
        │
        ▼
 [Step 2: 环境变量与密钥管理]
 创建 backend/.env.production (配置 JWT_SECRET, ADMIN_PASSWORD_HASH)
        │
        ▼
 [Step 3: 后端鉴权与安全中间件接入]
 编写 authMiddleware, rateLimiter, helmet 配置，挂载至 server.ts
        │
        ▼
 [Step 4: 后端登录与验签路由]
 新增 POST /api/auth/login, GET /api/auth/verify, POST /api/auth/logout
        │
        ▼
 [Step 5: 前端登录页面与路由守卫]
 创建 LoginView.vue，并在 router/index.ts 中设置 beforeEach 鉴权拦截
        │
        ▼
 [Step 6: 本地与虚拟机全链路压测]
 模拟暴力破解测试 429 拦截，模拟未授权请求测试 401 拦截
```

### 核心新增依赖说明

| 依赖包名称 | 核心用途 | 生产不可替代性 |
| :--- | :--- | :--- |
| **`bcrypt`** | 工业级密码加盐单向哈希比对 | 防止数据库泄漏时管理员密码反查 |
| **`jsonwebtoken`** | 签发与验证具有防伪签名的身份 Token | 无状态鉴权，免除维护 Redis Session 内存开销 |
| **`express-rate-limit`** | 基于 IP 的自适应请求限流中间件 | 核心防御爬虫批量抓取与暴力字典碰撞 |
| **`helmet`** | 自动化装配 11 项顶级安全响应头 | 防御 XSS 注入、Clickjacking 劫持与 MIME 嗅探 |
| **`cookie-parser`** | 解析加密 `HttpOnly` Cookie | 支撑最安全的免脚本接触凭据存储 |

---

## 总结

通过上述 **身份鉴权（JWT + bcrypt）**、**请求限流（Rate Limit）**、**安全头防御（Helmet）** 与 **主机加固（非标 SSH + 本地回环 + UFW + 备份）** 五位一体的安全矩阵，Sacred Focus 将从一个单机自控软件，真正升格为**无惧公网风浪、具备高可靠防御能力与个人数据主权的云端私有化中枢**。
