<div align="center">

# 🏛️ SACRED FOCUS (神圣自控中枢)

**基于认知科学与行为工程学的个人全域自控与效能决策系统**

[![Vue 3.5](https://img.shields.io/badge/Vue-3.5.13-42b883?style=flat-square&logo=vuedotjs)](https://vuejs.org/)
[![Vite 6](https://img.shields.io/badge/Vite-6.0.7-646cff?style=flat-square&logo=vite)](https://vitejs.dev/)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7.2-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Express 4.21](https://img.shields.io/badge/Express-4.21.2-000000?style=flat-square&logo=express)](https://expressjs.com/)
[![better--sqlite3 13](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?style=flat-square&logo=sqlite)](https://github.com/WiseLibs/better-sqlite3)
[![Docker Ready](https://img.shields.io/badge/Docker-Node_22_Bookworm_Slim-2496ed?style=flat-square&logo=docker)](https://www.docker.com/)
[![License MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

<p align="center">
  <b>条件反射重构 (CTDP)</b> · <b>战略激励管线 (RSIP)</b> · <b>判例法典定性</b> · <b>水密隔舱容灾</b>
</p>

</div>

---

## 📖 核心哲学与自控工程学落地

Sacred Focus 并非普通的待办清单 (To-Do) 或番茄钟应用，而是一套严密遵循**经典条件反射理论**与**防习惯性退行机制**构建的自控工程系统。系统核心由两大权威协议驱动：

### 1. 神圣座位协议 (CTDP, Classical Temptation Decoupling Protocol)
* **物理信物与条件反射锁定**：专注状态必须绑定唯一物理信物（如：主力机开启专注模式），将环境场景与高专注神经通路强关联，杜绝伪专注与环境污染。
* **30 秒物理时钟后悔药**：彻底打破“因抗拒开始而拖延”的心智阻抗。启动后 30 秒内（基于物理时钟毫秒级差值精确核验，防后台息屏漂移）允许无负罪感退出，主链连胜完整保全。
* **静默顺水推舟态**：倒计时归零后绝不以突兀闹铃惊扰心流，而是静默转入 `OVER_FOCUS` 顺水推舟超额累加态，直至用户主动唤醒结算。
* **违规放弃严正清零**：超过 30 秒后的主动违规中断，强制要求记录中断归因并将主链连胜天数清零，建立铁律约束。

### 2. 国策树协议 (RSIP, Real-time Strategic Incentive Protocol)
* **行为正交流转管线**：借鉴现代战略国策树模型，将日常习惯拆解为具备上下游依赖关系的拓扑节点网络（早起破晓、心流专注、储备充能、极夜寝域）。
* **时空锚点双轨判定**：支持严格时间触发（如 `09:05`，分钟级量化基准）与场景触发（如 `起床后5分钟内`、`全天候`），兼顾固定习惯与弹性行动。
* **东八区 04:00 业务日状态机**：以 UTC+8 凌晨 04:00 作为业务日分界线，每日首次上线执行原子级断签审计：昨日未点亮且非冻结节点等级清零；当日点亮等级递增；支持当日反悔精准回退历史等级与日期。
* **水密隔舱 (Water-tight Bulkhead) 保全态**：在突发生病或不可抗力时，可将节点置为冰蓝冻结态，彻底豁免跨天断签归零惩罚，保护长期心智资本。
* **5 槽位版本演化回滚**：支持国策拓扑结构的架构演进与版本管理（`vMajor.Minor`），提供 5 槽位防震荡快照环形缓冲区与一键原子回滚。

---

## 🛠️ 当前技术栈架构

| 领域 | 核心技术 / 组件 | 选型考量与工程优势 |
| :--- | :--- | :--- |
| **前端视图** | **Vue 3.5.13** + **TypeScript 5.7** | Composition API、`<script setup>` 极致性能与严格类型系统 |
| **构建工具** | **Vite 6.0.7** + **vue-tsc 2.2** | 毫秒级 HMR 热更新、现代 ESM 打包 |
| **状态治理** | **Pinia 2.3.0** | 模块化响应式 Store（`auth`, `focusTree`, `sacredSeat`） |
| **拓扑画布** | **@vue-flow/core 1.42.1** | 高性能虚拟化节点与连线渲染、正交连线算法、缩放平移交互 |
| **后端运行时** | **Node.js 22 LTS** + **Express 4.21.2** | 跨平台稳定生态、极简中间件拓扑、支持 15MB 整机镜像吞吐 |
| **存储引擎** | **better-sqlite3 13.0.3** | 嵌入式 C++ 原生绑定、WAL (Write-Ahead Logging) 模式、外键强制约束 |
| **安全加固** | **Helmet 8.3** + **bcryptjs 3.0** + **JWT 9.0** | CSP 安全头、防点击劫持、异步非阻塞密码比对、JTI 吊销黑名单 |
| **网络网关** | **Nginx 1.27 Alpine** | TLS 1.2/1.3 加密代理、HTTP 强制升级 HTTPS、Gzip 压缩、健康探测豁免 |
| **容器运行时** | **Docker (Debian Bookworm Slim)** | 三阶段多阶段构建，非 root 用户 (`node`) 运行，最小特权安全模型 |

---

## 📂 真实系统全景目录树

```text
sacred-focus/
├── .env.production.example          # 生产环境配置模板
├── Dockerfile                       # Node 22 Bookworm Slim 三阶段安全构建 Dockerfile
├── docker-compose.yml               # 应用容器主编排定义（挂载卷、日志滚动与健康检查）
├── docker-compose.nginx.yml         # 企业级反向代理与 TLS 网关组合编排
├── package.json                     # 根目录 npm workspaces 编排脚本
├── nginx/
│   ├── conf.d/
│   │   └── default.conf             # Nginx 反向代理配置（TLS 加固、80->443 重定向、WebSocket）
│   └── ssl/                         # SSL 证书与密钥挂载目录 (server.crt, server.key)
├── backend/                         # 后端服务工程 (Express + better-sqlite3)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── config.ts                # 统一环境配置、高熵 JWT 密钥校验与弱口令拦截器
│       ├── server.ts                # 服务入口、安全头、优雅关机与空闲 WAL Checkpoint
│       ├── types.ts                 # 后端全局核心 TypeScript 数据模型契约
│       ├── db.ts                    # 持久层统一导出门面
│       ├── db/                      # 高内聚单职责数据库拆分模块
│       │   ├── connection.ts        # SQLite 数据库实例、WAL 模式与外键级联配置
│       │   ├── schema.ts            # 9 大核心业务表 DDL、系统元数据表与 5 大高性能索引
│       │   ├── migrations.ts        # 数据库平滑升级与场景字段幂等迁移事务
│       │   ├── seed.ts              # 种子国策树拓扑、初始分组与 v1.0 基准快照
│       │   ├── dateUtils.ts         # 东八区 UTC+8 凌晨 04:00 业务日计算算法
│       │   ├── revision.ts          # 全局原子系统版本号与最后同步时间戳推进
│       │   ├── maintenance.ts       # 排他维护租约锁 (15分钟 TTL) 与外键完整性核验
│       │   ├── index.ts             # 数据库初始化入口与子模块聚合导出
│       │   └── queries/
│       │       ├── focusTree.ts     # 国策节点 Upsert 与全景数据读取
│       │       └── settlement.ts    # 每日首次上线跨天断签结算状态机引擎
│       ├── middleware/              # 安全与业务流转中间件
│       │   ├── auth.ts              # JWT 身份鉴权、双轨凭据提取与 JTI 吊销黑名单清理
│       │   ├── ipRules.ts           # 反向代理真实 IP 提取与可信白名单判定
│       │   ├── maintenance.ts       # 维护租约排他守卫 (整机恢复期间全局 503 阻断写)
│       │   ├── rateLimiter.ts       # 防爆破登录、通用业务、整机导出与整机导入限流器
│       │   └── security.ts          # 蜜罐诱捕拦截 (72h 自动封禁)、恶意爬虫 UA 过滤
│       ├── routes/                  # RESTful API 业务路由
│       │   ├── auth.ts              # 登录认证、状态嗅探与主动注销
│       │   ├── cases.ts             # 判例法典增删改查与全量导入导出
│       │   ├── evolution.ts         # 5 槽位版本快照归档、版本回滚与架构独立导入导出
│       │   ├── focusTree.ts         # 国策树全景、节点点亮/反悔状态机、基准排序与组外框
│       │   ├── sacredSeat.ts        # 座位配置、连胜清零、流水提交与日级热力图聚合
│       │   ├── sync.ts              # 极轻量同步探针 (<100 字节，高频心跳探测)
│       │   └── system.ts            # 全系统整机冷备导出、预热备容灾与覆写恢复
│       └── utils/
│           └── validators.ts        # 零外部依赖输入防御校验器 (数据包结构严密校验)
├── frontend/                        # 前端应用工程 (Vue 3 + Vite + Pinia)
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.vue                  # 顶栏导航、全局主题切换、心流沉浸响应与移动端 TabBar
│       ├── main.ts                  # 前端启动装配入口
│       ├── router/                  # 路由定义与基于 HttpOnly Cookie 的异步路由守卫
│       ├── stores/                  # Pinia 状态中枢
│       │   ├── auth.ts              # 会话鉴权凭据与登入/登出流
│       │   ├── focusTree.ts         # 国策树三版本分离 (Synced/Remote/Draft) 与草稿沙盒
│       │   └── sacredSeat.ts        # 专注计时器状态机、全屏沉浸与流水记录
│       ├── views/                   # 5 大核心业务视图
│       │   ├── SacredSeatView.vue   # 神圣座位主界面 (信物启动、30s 后悔药、顺水推舟、结算)
│       │   ├── FocusCanvasView.vue  # 国策树 Vue Flow 拓扑画布 (展示打卡 / 沙盒编辑 / 差异保存)
│       │   ├── FocusListView.vue    # 国策树多维数据矩阵列表 (场景过滤、复合排序、行内点亮)
│       │   ├── CaseLawView.vue      # 判例法典主视图 (定性裁决、边界条件、检索与独立备份)
│       │   └── LoginView.vue        # 管理员安全访问核验与错误弹性震颤反馈
│       ├── components/              # 细粒度业务组件库
│       │   ├── canvas/              # 节点卡片、外框分组、正交连线、规范卡与演化弹窗
│       │   ├── seat/                # 专注热力图、历史流水卡片、连胜告警与判例记录弹窗
│       │   ├── case/                # 判例增改弹窗
│       │   └── common/              # 跨设备全系统冷备迁移与导入弹窗
│       └── utils/                   # 客户端工具库
│           ├── api.ts               # fetch 封装 (自动凭证、401 跳转、409 冲突与 429 节流)
│           ├── audio.ts             # Web Audio API 原生合成双音调水晶磬音 (离线零依赖)
│           ├── syncManager.ts       # 60s 心跳探针与页面前台唤醒静默同步管理器
│           └── time.ts              # 紧凑时间单位格式化工具
└── docs/                            # 权威系统架构与规范文档体系 (详见下表)
```

---

## ⚡ 极速启动与常用命令

### 1. 本地全栈开发模式 (Dev)

系统使用 npm workspaces 统一编排，单条命令即可联动前后端热重载开发：

```bash
# 1. 根目录安装工作区全量依赖
npm install

# 2. 一键启动前后端联合热重载 (开发模式)
# 后端启动在 http://localhost:3000 (tsx 监听)
# 前端启动在 http://localhost:5173 (Vite 6 HMR)
npm run dev
```

* 仅调试后端：`npm run dev:backend`
* 仅调试前端：`npm run dev:frontend`
* 执行全栈静态检查与验证：`npm test`

### 2. Docker 企业级生产容器化交付 (Production)

#### 单机标准容器部署 (暴露 3000 端口)
```bash
# 复制环境变量配置
cp .env.production.example .env

# 编辑 .env 配置高熵密钥（强制要求：JWT_SECRET >= 32位，ADMIN_PASSWORD >= 8位非默认口令）
# 启动生产容器
docker compose up -d --build
```

#### 企业级反向代理部署 (Nginx + TLS 加密网关，监听 80 / 443)
```bash
# 确保证书文件就绪：./nginx/ssl/server.crt 与 ./nginx/ssl/server.key
# 组合编排启动
docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d --build
```

---

## 📚 权威工程文档索引

为了杜绝碎片化，系统全景设计与规范沉淀为 `docs/` 目录下的 5 篇权威架构文档：

| 规范文档 | 核心主题与技术覆盖 |
| :--- | :--- |
| **[01-系统全景与架构设计](docs/01-系统全景与架构设计.md)** | 自控工程学哲学落地 (CTDP / RSIP)、全栈系统架构拓扑、跨端协同探针 (Sync Probe) 机制、多级纵深安全防护模型（JWT 双轨、IP 规则、接口限流、蜜罐防御）。 |
| **[02-数据库模型与状态机](docs/02-数据库模型与状态机.md)** | SQLite WAL 存储引擎与外键约束、9 大核心业务表与元数据表真实 DDL、5 大高性能复合索引、东八区 UTC+8 04:00 业务日状态机、维护租约锁机制、5 槽位版本快照机制。 |
| **[03-全链路业务流转与核心时序](docs/03-全链路业务流转与核心时序.md)** | 包含 4 套高精 Mermaid 交互时序图：神圣座位专注流（信物启动 -> 30s 物理时钟后悔药 -> 顺水推舟 -> 唤醒结算）、国策树拓扑流（展示打卡 -> 沙盒编辑 -> Diff 校验保存）、判例法典裁决流、整机冷备导入与预热备容灾时序。 |
| **[04-API契约与通信协议规范](docs/04-API契约与通信协议规范.md)** | 后端 7 大路由模块全部真实端点规范（方法、路径、鉴权、限流、请求入参与响应契约）、JWT 双轨传输协议、多端协同探针心跳与 revision 乐观并发版本冲突拦截协议。 |
| **[05-容器化部署与运维交付规范](docs/05-容器化部署与运维交付规范.md)** | Node 22 Bookworm Slim 多阶段构建原理、非特权运行账户与目录权限隔离、Docker Compose 挂载卷与日志滚动加固、Nginx 反向代理与 TLS 加密实践、健康检查与冷备恢复手册。 |

---

<div align="center">
  <b>Sacred Focus Engineering Team</b> · 遵循最高严谨度的认知科学与软件工程实践
</div>
