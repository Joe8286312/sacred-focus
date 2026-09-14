# 08-网关代理与容器运维模块 逻辑流程与时序架构详细设计 (Draft)

> **文档定位：** 模块 08 真实源代码逻辑执行流深度审计与工程实现草案  
> **对齐版本：** v1.1 (基于 `nginx/conf.d/default.conf`、`Dockerfile`、`docker-compose.yml`、`backend/src/server.ts`、`middleware/security.ts`、`middleware/ipRules.ts` 等实际源码)  
> **审查基准：** 全量网络入口校验、内部时序链路、反代与容器生命周期、异常吞咽审计、四大边界条件（空值/幂等防御/超时探针/并发与IP防伪造）

---

## 1. 入口与路由全量矩阵（API & 校验规则审计）

模块 08 负责处理**系统网络边界、前置流量过滤、网关反代、健康自愈及全栈静态托管**。  
全模块核心由两层防线构成：
1. **外层网关与容器调度层**：Nginx 1.27 + Docker 容器健康探针；
2. **应用入口与安全防御层**：挂载于 [`backend/src/server.ts`](file:///d:/Codes/Projects/sacred-focus/backend/src/server.ts) 的全局中间件管道（`securityFilter`, `ipRules`, `cors`, `rateLimiter`, `healthCheck`, `spaFallback`）。

经逐行源码核对，本模块**【未引入 Zod 等 Schema 校验库】**，全部依托 Nginx 核心指令、Express 原生网络解析及纯原生正则表达式进行规则判定。

### 1.1 全局网络入口与安全中间件全景表

| 序号 | 入口 / 中间件 / API | 协议 / 方法 / 路径 | 接收参数 / 网络标头 | 校验类型 | 实际生效的校验规则与边界约束 | 风险与缺陷标注 |
|---|---|---|---|---|---|---|
| 1 | Nginx HTTP 入口 | `HTTP:80` `/*` | Host / Request-URI | 原生路径分流 | 1. 路径匹配 `/api/health`：放行反代后端，短超时 5s<br>2. 其余所有路径：`return 301 https://$host$request_uri` 强制 HTTPS。 | **【未做 Zod 校验】**（Nginx 规则）。 |
| 2 | Nginx HTTPS 入口 | `HTTPS:443` `/*` | TLS SNI / HTTP 标头 | TLS 密码套件与上传配额 | 1. 协议限制：`TLSv1.2 TLSv1.3`<br>2. 密码套件：`HIGH:!aNULL:!MD5`<br>3. 体积限制：`client_max_body_size 20M`。 | **【未做 Zod 校验】**<br>限制最大请求体 20MB，超过返回 Nginx `413 Request Entity Too Large`。 |
| 3 | 安全过滤器 `securityFilter` | 全局中间件 `app.use` | Client-IP / User-Agent / Request-Path | 原生白名单 / 正则 / 数据库黑名单 | 1. 内网豁免：`isLocalOrTrusted(req)` 直接放行<br>2. 封禁拦截：`isIpBanned(clientIp)` -> `403 ACCESS_DENIED`<br>3. 蜜罐路径：命中 `HONEYPOT_PATHS` -> 封禁 72h，返回 `403 SECURITY_TRAP_TRIGGERED`<br>4. 爬虫拦截：命中 `BANNED_UA_PATTERNS` -> `403 CRAWLER_BLOCKED`。 | **【未做 Zod 校验】**<br>蜜罐拦截大小写不敏感（`toLowerCase().startsWith()`），直接硬编码封禁 72 小时。 |
| 4 | IP 规则过滤器 `ipRules` | 内部函数 `isLocalOrTrusted` | `req.ip` / `TRUSTED_IPS` | 原生字符串匹配 | 1. 真实 IP 提取：`req.ip.replace(/^::ffff:/i, '').trim()`<br>2. 回环放行：`127.0.0.1`、`::1`、`localhost`、`''`<br>3. 环境变量白名单：`config.trustedIps.includes(ip)`。 | **【未做 Zod 校验】**<br>P1-SEC-01 治理：杜绝盲目信任所有内网网段，必须显式声明。 |
| 5 | 健康检查接口 | `GET /api/health` | 无 | 无 | 无入参校验。直接响应服务状态、版本号与当前 ISO 时间戳。处于免鉴权白名单。 | **【未做参数校验】**。 |
| 6 | SPA 静态托管与兜底 | `GET /*` | Request-Path | 文件系统存在性 | 1. 静态产物托管：`express.static(frontendDist)`<br>2. 兜底 fallback：`res.sendFile(index.html)`。 | **【未做参数校验】**。 |
| 7 | 全局异常拦截器 | 全局错误中间件 `(err, req, res, next)` | Error 对象 | 原生类型判断 | 1. 防重复写标头：`if (res.headersSent) return`<br>2. 生产环境错误脱敏：非生产回显 `err.message`，生产回显友好中文。 | - |

---

## 2. 内部执行时序与生命周期审计

### 2.1 全链路执行时序模型

从外部流量打入容器宿主机，到最终完成响应或拦截，执行链路经历**两层网络代理**与**五道应用安全门禁**：

```mermaid
sequenceDiagram
    autonumber
    actor Client as 外部客户端 / 爬虫探针
    participant Nginx80 as Nginx :80 (HTTP)
    participant Nginx443 as Nginx :443 (HTTPS/TLS)
    participant SecFilter as securityFilter (Express)
    participant AuthMid as authMiddleware (Express)
    participant RateMid as apiGeneralLimiter (Express)
    participant BizAPI as 业务路由 / /api/health
    participant ErrorHandler as 全局未捕获异常中间件

    alt 走 HTTP 明文端口
        Client->>Nginx80: 发起请求
        alt 路径为 /api/health (容器拨测放行)
            Nginx80->>BizAPI: proxy_pass :3000/api/health (5s 短超时)
            BizAPI-->>Client: 200 OK {"status": "ok"}
        else 其余所有路径
            Nginx80-->>Client: HTTP 301 强制跳转 https://$host$request_uri
        end
    else 走 HTTPS 加密端口
        Client->>Nginx443: TLS 握手 (TLS 1.2/1.3)
        Note over Nginx443: 1. 校验 client_max_body_size (<= 20M)<br/>2. 注入 X-Forwarded-Proto https<br/>3. 注入真实 X-Real-IP
        Nginx443->>SecFilter: proxy_pass http://sacred-focus:3000

        Note over SecFilter: 2. 安全过滤管线 (securityFilter)<br/>提取真实 IP: app.set('trust proxy', 1)
        alt 属于本机或 TRUSTED_IPS 白名单
            SecFilter->>AuthMid: 直接豁免放行
        else 非白名单外部公网 IP
            alt IP 已被拉黑 (isIpBanned)
                SecFilter-->>Client: HTTP 403 (ACCESS_DENIED)
            else 命中蜜罐路径 (/.env, /wp-login.php 等)
                Note over SecFilter: 触发蜜罐封禁 72h: banIp(clientIp)
                SecFilter-->>Client: HTTP 403 (SECURITY_TRAP_TRIGGERED)
            else 命中恶意爬虫 UA (python-requests/Scrapy/zgrab)
                SecFilter-->>Client: HTTP 403 (CRAWLER_BLOCKED)
            else 正常安全流量
                SecFilter->>AuthMid: 放行进入鉴权管线
            end
        end

        Note over AuthMid: 3. 身份验证管线<br/>白名单豁免 (/health, /login, /sync/status)
        AuthMid->>RateMid: 交付限流管线 (apiGeneralLimiter)
        alt 超过限流阈值 (已登录 1000次/分，未登录 60次/分)
            RateMid-->>Client: HTTP 429 (RATE_LIMIT_EXCEEDED)
        else 限流通过
            RateMid->>BizAPI: 交付具体业务路由处理器
            alt 业务执行过程中发生未捕获异常 (throw err)
                BizAPI->>ErrorHandler: 抛出至错误中间件
                Note over ErrorHandler: if (res.headersSent) return;<br/>脱敏处理后返回状态码
                ErrorHandler-->>Client: HTTP 500 (INTERNAL_SERVER_ERROR)
            else 正常执行
                BizAPI-->>Client: HTTP 200 / 201 业务 JSON
            end
        end
    end
```

### 2.2 核心环节详细剖析

#### 1. Nginx 代理标头与真实 IP 透传
在 [`nginx/conf.d/default.conf:L55-L73`](file:///d:/Codes/Projects/sacred-focus/nginx/conf.d/default.conf#L55-L73) 中：
```nginx
proxy_pass http://sacred-focus:3000;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
```
- **关键细节**：
  - 显式透传 `X-Forwarded-Proto https`，触发 Express 内部将 `req.secure` 识别为 `true`，使得 `auth.ts` 颁发 JWT Cookie 时能够安全开启 `secure: true, sameSite: 'strict'`，防止 Cookie 被中间人窥探；
  - Node.js 应用层在 [`backend/src/server.ts:L45`](file:///d:/Codes/Projects/sacred-focus/backend/src/server.ts#L45) 开启了 `app.set('trust proxy', 1)`，严格只信任第一层反代（即 Nginx 容器），彻底根绝黑客自行在 Header 伪造 `X-Forwarded-For: 127.0.0.1` 绕过限流的重大漏洞（`P0-001` 治理项）。

#### 2. 蜜罐诱捕与多级封禁管线
在 [`backend/src/middleware/security.ts:L22-L82`](file:///d:/Codes/Projects/sacred-focus/backend/src/middleware/security.ts#L22-L82) 中：
- **蜜罐特征路径**：`'/.env'`, `'/.git'`, `'/wp-login.php'`, `'/admin.php'`, `'/phpmyadmin'`, `'/actuator'`；
- **双层缓存架构**：
  1. 内存层：`ipBlacklist = new Map<string, number>()` 提供微秒级快速拦截；
  2. 持久层：写入 SQLite `system_meta` 表中 `key = 'ip_ban:<ip>'`，保证 Node.js 进程重启或容器重建后封禁依然生效；
  3. 封禁惩罚时长：硬编码封禁 **72 小时**（`72 * 60 * 60 * 1000 ms`）。

#### 3. 爬虫特征过滤
- **黑名单正则**：
  ```ts
  const BANNED_UA_PATTERNS = [
    /python-requests/i,
    /Scrapy/i,
    /Go-http-client/i,
    /zgrab/i
  ];
  ```
  拦截常见的脚本扫描器与漏洞探测探针，降低无意义的服务器并发与日志噪音。

#### 4. 全局未捕获异常处理与堆栈脱敏
在 [`backend/src/server.ts:L110-L119`](file:///d:/Codes/Projects/sacred-focus/backend/src/server.ts#L110-L119) 中：
```ts
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Sacred Focus Server] Unhandled internal error:', err);
  if (res.headersSent) {
    return; // 防止上游已开始流式输出时二次写响应头导致进程崩溃 (ERR_HTTP_HEADERS_SENT)
  }
  res.status(err.status || 500).json({
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: config.isProduction ? '服务器自控中枢发生内部异常，请稍后重试' : (err.message || 'Unknown Server Error')
  });
});
```
- **生产脱敏机制**：在生产环境（`config.isProduction === true`）下隐藏底层物理路径与代码堆栈，防御信息泄漏。

### 2.3 异常吞咽审计（是否存在 Try-Catch 吞异常？）

1. **`banIp` 持久化异常处理**：
   ```ts
   try {
     db.prepare("INSERT OR REPLACE INTO system_meta ...").run(...);
   } catch (e) {
     console.error('[Sacred Focus Security] Failed to persist IP ban:', e);
   }
   ```
   - **审计结论**：捕获持久化错误后记录日志，不阻断内存封禁逻辑与 `403` 拦截。属于预期的容灾降级，**未吞掉阻断行为**。
2. **`isIpBanned` 读取异常处理**：
   ```ts
   try {
     const row = db.prepare("SELECT value FROM system_meta WHERE key = ?").get(...);
     // ...
   } catch (e) {
     // 降级使用内存状态
   }
   ```
   - **审计结论**：数据库只读失败时静默降级依托内存 Map，保障核心接口的高可用性。
3. **全局异常拦截器**：
   - 明确返回标准 JSON 结构并记录完整的 `console.error`，**未吞掉任何异常**。

### 2.4 HTTP 状态码与业务错误码速查表

| HTTP 状态码 | 业务错误代码 (`error`) | 触发代码位置 | 场景说明 |
|---|---|---|---|
| `301 Moved Permanently` | 无 (HTTP 协议跳转) | `nginx/conf.d/default.conf:L23` | 用户尝试通过 HTTP:80 访问受保护页面，自动重定向至 HTTPS |
| `400 Bad Request` | `SyntaxError` | `express.json()` | 客户端发送畸形或未闭合的非法 JSON 报文 |
| `403 Forbidden` | `ACCESS_DENIED` | `security.ts:L72` | 来源 IP 曾触发攻击特征，处于 72 小时封禁期内 |
| `403 Forbidden` | `SECURITY_TRAP_TRIGGERED` | `security.ts:L80` | 客户端访问敏感蜜罐路径（如 `/.env`, `/wp-login.php` 等） |
| `403 Forbidden` | `CRAWLER_BLOCKED` | `security.ts:L87` | 客户端 User-Agent 命中自动化爬虫黑名单 |
| `403 Forbidden` | `Error: Not allowed by CORS` | `server.ts:L55` | 跨域来源不在 `ALLOWED_ORIGINS` 配置白名单中 |
| `413 Payload Too Large` | `PayloadTooLargeError` | Nginx 或 `express.json` | 导入备份文件大小超过 15MB/20MB 阈值限制 |
| `429 Too Many Requests` | `RATE_LIMIT_EXCEEDED` | `rateLimiter.ts:L24` | 触发通用 API 限流保护（未认证 > 60次/分，已认证 > 1000次/分） |
| `500 Internal Server Error` | `INTERNAL_SERVER_ERROR` | `server.ts:L116` | 应用内部未捕获的未处理异常（如数据库文件死锁） |
| `502 Bad Gateway` | 无 (Nginx 生成) | Nginx 网关 | Node.js 应用容器正在启动、崩溃重启或连接被拒 |
| `504 Gateway Timeout` | 无 (Nginx 生成) | Nginx 网关 | 后端应用单次处理超过 Nginx 设定的 60 秒读超时 |

---

## 3. 边界处理专项深度审计

依据实际源代码，严密复核**空值**、**幂等防御**、**超时探针**、**并发与IP防伪造**四大边界。凡代码未做判断的，显式标注为 `【未做判断】`。

### 3.1 空值处理 (Null / Undefined / Empty)

#### (1) 客户端真实 IP 提取空值
- 源码位置：[`backend/src/middleware/ipRules.ts:L7-L9`](file:///d:/Codes/Projects/sacred-focus/backend/src/middleware/ipRules.ts#L7-L9)
  ```ts
  const rawIp = req.ip || req.socket.remoteAddress || '';
  return rawIp.replace(/^::ffff:/i, '').trim();
  ```
- **审计结论**：若底层 socket 未提供地址，保底为空字符串 `''`；在 `isLocalOrTrusted` 中将 `ip === ''` 视为空白本地请求安全放行，避免空指针崩溃。

#### (2) `TRUSTED_IPS` 环境变量空值
- 源码位置：[`backend/src/middleware/ipRules.ts:L21`](file:///d:/Codes/Projects/sacred-focus/backend/src/middleware/ipRules.ts#L21)
  ```ts
  if (config.trustedIps && config.trustedIps.length > 0 && config.trustedIps.includes(ip)) {
    return true;
  }
  ```
- **审计结论**：三重条件链保护，未配置该环境变量时安全跳过，杜绝 `undefined.includes()` 异常。

#### (3) User-Agent 缺失空值
- 源码位置：[`backend/src/middleware/security.ts:L85`](file:///d:/Codes/Projects/sacred-focus/backend/src/middleware/security.ts#L85)
  ```ts
  const ua = req.headers['user-agent'] || '';
  ```
- **审计结论**：若客户端不带 UA 头，保底为空字符串，正则安全校验不崩溃。

#### (4) 静态托管目录 fallback 空值
- 源码位置：[`backend/src/server.ts:L102-L107`](file:///d:/Codes/Projects/sacred-focus/backend/src/server.ts#L102-L107)
  ```ts
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
  }
  ```
- **审计结论**：若静态资源目录不存在（如开发模式未先 build），不会抛出文件找不到错误挂死服务，仅作为纯 API 服务运行。

---

### 3.2 幂等防御与黑名单淘汰 (Idempotency & Cache Expiry)

#### (1) IP 封禁的幂等覆写与自动淘汰
- 封禁入库：`INSERT OR REPLACE INTO system_meta (key, value) VALUES (?, ?)`，相同恶意 IP 连续触发蜜罐仅刷新最晚解封时间，不产生冗余数据；
- 内存缓存自动过期：
  ```ts
  if (cachedTime !== undefined) {
    if (now < cachedTime) return true;
    ipBlacklist.delete(ip); // 超时内存自动逐出
  }
  ```
- 数据库过期淘汰：
  ```ts
  if (isNaN(dbUnban) || now >= dbUnban) {
    db.prepare("DELETE FROM system_meta WHERE key = ?").run(`ip_ban:${ip}`);
  }
  ```
  保证 `system_meta` 表绝不会因长期运行产生黑名单垃圾膨胀。

#### (2) 健康探针的幂等性
- `GET /api/health` 为纯粹的只读无副作用探针，无论并发还是高频拨测，输出与系统状态均严格幂等。

---

### 3.3 超时处理与健康自愈 (Timeout & Self-healing)

#### (1) Nginx 网关超时配置
在 [`nginx/conf.d/default.conf:L70-L72`](file:///d:/Codes/Projects/sacred-focus/nginx/conf.d/default.conf#L70-L72) 中：
```nginx
proxy_connect_timeout 60s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;
```
- 针对全量整机大备份导入，配置了 **60 秒**宽裕超时，避免长事务未完成前被网关提前切断；
- 针对健康探针则配置了短平快的 **5 秒**超时（`proxy_read_timeout 5s;`），防止故障容器拖垮网关。

#### (2) Docker 容器健康探测与自愈 (Docker Self-healing)
在 [`Dockerfile:L94-L95`](file:///d:/Codes/Projects/sacred-focus/Dockerfile#L94-L95) 与 [`docker-compose.yml:L30-L35`](file:///d:/Codes/Projects/sacred-focus/docker-compose.yml#L30-L35) 中：
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/api/health || exit 1
```
- 探测周期：每 **30 秒**一次；超时时间：**5 秒**；启动宽限期：**10 秒**；连续容错重试：**3 次**；
- 若 Node.js 进程发生死锁或阻塞，Docker 将标记容器状态为 `unhealthy`，供自动化监控或 Swarm/K8s 编排器执行自动杀进程拉起。

---

### 3.4 并发与真实 IP 防伪造 (Concurrency & Anti-Spoofing)

#### (1) 真实 IP 防伪造与限流绕过防御 (`P0-001` 治理项)
- **风险模型**：若直接读取 `req.headers['x-forwarded-for'].split(',')[0]`，反编译攻击者可在 HTTP 头部随意伪造 `X-Forwarded-For: 127.0.0.1`，使公网攻击流量被误判为“本机调用”而完全豁免限流与蜜罐；
- **防线落地**：
  1. Nginx 网关重写并强制覆盖：`proxy_set_header X-Real-IP $remote_addr;`；
  2. Express 显式声明：`app.set('trust proxy', 1)`；
  3. `getClientIp(req)` 使用官方经过验证的 `req.ip`，彻底杜绝任意伪造。

#### (2) 高频并发探测下的性能保护
- 蜜罐与封禁核查通过 `ipBlacklist` 本地内存 Map 提供 **$O(1)$ 极速查询**，在高并发 DDOS 或暴力扫描时，绝大部分拦截流量无需访问 SQLite 磁盘文件，保护底层数据库 I/O 资源。

---

## 4. 架构改进建议与演化待办 (Actionable Backlog)

1. **Nginx 增加反爬虫与速率硬限流 (Limit Req)**：
   - 在 Nginx 网关层配置 `limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;`，在流量进入 Node.js 容器前由 C 语言层完成第一道削峰填谷；
2. **支持证书自动续签 (Let's Encrypt / Certbot)**：
   - 当前主要提供自签名证书生成脚本（`generate-cert.sh` / `.ps1`），后续可补充 Certbot 自动化 ACME 续订 sidecar 容器；
3. **日志输出规范化为结构化 JSON**：
   - 将 `console.error` 与中间件日志接入类似 Pino 或 Winston 的结构化日志库，便于集中导入 ELK / Loki 进行安全审计可视化。
