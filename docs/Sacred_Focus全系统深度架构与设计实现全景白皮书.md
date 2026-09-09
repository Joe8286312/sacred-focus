# 🏛️ Sacred Focus（神圣座位与国策树）全系统深度架构与设计实现全景白皮书

> **文档定位**：Sacred Focus 系统的权威级全景技术设计与架构实现白皮书。全面涵盖系统底层哲学、宏微观交互状态机、前后端模块架构、高对比度双主题设计规范、Better-SQLite3 WAL 持久化设计及灾备演化体系。  
> **工程版本**：v2.0.0 (Milestone 1 ~ Milestone 9 闭环与生产级安全版)  
> **基准日期**：2026年9月9日  

---

## 目录索引

- [一、 系统定位与自控工程学哲学体系](#一-系统定位与自控工程学哲学体系)
  - [1.1 核心理论：双曲贴现与自控系统闭环](#11-核心理论双曲贴现与自控系统闭环)
  - [1.2 CTDP 链式时延协议与 RSIP 递归稳态协议](#12-ctdp-链式时延协议与-rsip-递归稳态协议)
  - [1.3 极简无扰工程原则：为什么杜绝 Emoji 与白噪音](#13-极简无扰工程原则为什么杜绝-emoji-与白噪音)
  - [1.4 系统核心四大业务域全景矩阵](#14-系统核心四大业务域全景矩阵)
- [二、 系统总体技术架构与技术栈选型](#二-系统总体技术架构与技术栈选型)
  - [2.1 前后端技术选型矩阵](#21-前后端技术选型矩阵)
  - [2.2 单机本地优先（Local-First）与分层通信架构](#22-单机本地优先local-first与分层通信架构)
  - [2.3 全局目录与代码工程布局](#23-全局目录与代码工程布局)
- [三、 数据库与持久化中枢深度设计](#三-数据库与持久化中枢深度设计)
  - [3.1 SQLite WAL 模式与并发事务安全性](#31-sqlite-wal-模式与并发事务安全性)
  - [3.2 十大核心数据表 DDL 规范与关联语义](#32-十大核心数据表-ddl-规范与关联语义)
  - [3.3 数据库平滑升级机制（Schema Migration）](#33-数据库平滑升级机制schema-migration)
  - [3.4 演化快照与全系统整机热备恢复机制](#34-演化快照与全系统整机热备恢复机制)
- [四、 核心模块交互逻辑与状态机实现拆解](#四-核心模块交互逻辑与状态机实现拆解)
  - [4.1 模块一：神圣座位（CTDP 微观专注防御引擎）](#41-模块一神圣座位ctdp-微观专注防御引擎)
    - [4.1.1 核心五态运行状态机](#411-核心五态运行状态机)
    - [4.1.2 预约平移链（动态线性时延突破启动阻抗）](#412-预约平移链动态线性时延突破启动阻抗)
    - [4.1.3 30 秒后悔药保护 vs 违规中断严正清零](#413-30-秒后悔药保护-vs-违规中断严正清零)
    - [4.1.4 顺水推舟超时深潜与物理时钟毫秒级保真](#414-顺水推舟超时深潜与物理时钟毫秒级保真)
    - [4.1.5 顺水推舟紧凑时长格式化算法（5m / 5m12s / 1h2s）](#415-顺水推舟紧凑时长格式化算法5m--5m12s--1h2s)
    - [4.1.6 专注态沉浸隔离：顶栏隐藏、自动全屏与路由守卫](#416-专注态沉浸隔离顶栏隐藏自动全屏与路由守卫)
    - [4.1.7 神圣专注历史档案模态框（FocusHistoryModal）](#417-神圣专注历史档案模态框focushistorymodal)
  - [4.2 模块二：国策树画布（RSIP 宏观拓扑网络）](#42-模块二国策树画布rsip-宏观拓扑网络)
    - [4.2.1 展示模式（只读防护）与编辑模式（排版沙箱）双模隔离](#421-展示模式只读防护与编辑模式排版沙箱双模隔离)
    - [4.2.2 节点分组外框（FocusGroupFrame）与空间直接调整](#422-节点分组外框focusgroupframe与空间直接调整)
    - [4.2.3 曼哈顿正交避障连线算法（OrthogonalEdge）](#423-曼哈顿正交避障连线算法orthogonaledge)
    - [4.2.4 连续点亮升级体系（Lv1~Lv5）与断签清零](#424-连续点亮升级体系lv1lv5与断签清零)
    - [4.2.5 凌晨 04:00 跨日业务结算与国策树重构引导](#425-凌晨-0400-跨日业务结算与国策树重构引导)
    - [4.2.6 集中删除审计拦截机制（DeletionAuditModal）](#426-集中删除审计拦截机制deletionauditmodal)
    - [4.2.7 演化变更日志与 5 槽位环形快照回滚（EvolutionModal）](#427-演化变更日志与-5-槽位环形快照回滚evolutionmodal)
  - [4.3 模块三：国策列表管理与双态排序器（FocusListView）](#43-模块三国策列表管理与双态排序器focuslistview)
    - [4.3.1 基准排版态 vs 临时浏览态双模体系](#431-基准排版态-vs-临时浏览态双模体系)
    - [4.3.2 触发时间与触发场景彻底解耦](#432-触发时间与触发场景彻底解耦)
    - [4.3.3 类 Excel 复合排序机制（无时间智能沉底）](#433-类-excel-复合排序机制无时间智能沉底)
    - [4.3.4 列表项全生命周期操作与画布对齐](#434-列表项全生命周期操作与画布对齐)
  - [4.4 模块四：判例法典（下必为例司法体系）](#44-模块四判例法典下必为例司法体系)
    - [4.4.1 自控判例法的实体法理](#441-自控判例法的实体法理)
    - [4.4.2 灰色地带争议裁决与边界条件录入](#442-灰色地带争议裁决与边界条件录入)
- [五、 网页视觉系统与 UI/UX 规范](#五-网页视觉系统与-uiux-规范)
  - [5.1 纯粹 Vanilla CSS 模块化架构](#51-纯粹-vanilla-css-模块化架构)
  - [5.2 极夜深色与日光浅色双模高对比色彩系统](#52-极夜深色与日光浅色双模高对比色彩系统)
  - [5.3 拓扑引线色彩反转规范](#53-拓扑引线色彩反转规范)
  - [5.4 Typography 排版规范（JetBrains Mono + Plus Jakarta Sans）](#54-typography-排版规范jetbrains-mono--plus-jakarta-sans)
  - [5.5 状态胶囊药丸与微动效规范](#55-状态胶囊药丸与微动效规范)
- [六、 系统可靠性、构建与未来演化展望](#六-系统可靠性构建与未来演化展望)

---

## 一、 系统定位与自控工程学哲学体系

### 1.1 核心理论：双曲贴现与自控系统闭环

人类大脑的前额皮质与边缘系统在面对即时奖赏与长远价值时，遵循**双曲贴现函数（Hyperbolic Discounting）**：

$$V(\tau) = \frac{V_0}{1 + k\tau}$$

在当前时刻 $\tau = 0$ 处，双曲贴现曲线的斜率趋于负无穷大。这意味着，**任何在“当前瞬间”要求立刻开启高心理阻抗任务的指令，都会遭遇意志力引擎的最剧烈抗拒**。而一旦将任务推迟哪怕 10~15 分钟（$\tau > 0$），边际贴现率便会断崖式下降，理性规划即可重新接管决策。

```
价值折现 V
 ▲
 │ █  (极高阻抗区：在 τ=0 强迫启动，往往直接触发刷手机/逃避)
 │ █
 │  █
 │   ▀▄
 │     ▀▀▄▄_   (理性规划区：通过预约链平移起始时间，阻抗平缓)
 │          ▀▀▀▀▄▄▄▄▄▄▄____
 └──────────────────────────────► 时间时延 τ
   τ=0 (当下)   τ=15m (预约就位)
```

Sacred Focus 并非一款普通的待办工具或番茄钟，而是一套**基于自控工程学与行为经济学建立的个人稳态防御与进化操作系统**。

---

### 1.2 CTDP 链式时延协议与 RSIP 递归稳态协议

系统底层由两大核心协议驱动：

```
┌────────────────────────────────────────────────────────────────────────┐
│                   RSIP 宏观递归稳态 (Recursive Steady-State)           │
│                                                                        │
│   ┌──────────────┐     点亮升级     ┌──────────────┐   04:00业务结算   │
│   │  国策树画布   │ ─────────────► │ 5 槽位环形快照 │ ─────────────► 重构引导
│   │ (拓扑有向图)  │                │  (防震荡版本)  │                │
│   └──────────────┘                └──────────────┘                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 派生行动国策与执行规范
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CTDP 链式时延协议 (Chained Time-Delay)                │
│                                                                        │
│   【预约平移链】                   【神圣专注】              【判例法典】    │
│  线性时延避开阻抗 ──就地清脆鸣响──► 物理时钟毫秒级沉淀 ──超时唤醒──► 下必为例定性 │
│  (5m~30m 预约倒计)                 (全屏沉浸防打断)          (终身放行裁决) │
└────────────────────────────────────────────────────────────────────────┘
```

1. **CTDP (Chained Time-Delay Protocol)**：聚焦微观行动启动与阻抗防御：
   - **神圣信物（物理隔离）**：主力机开启免打扰、佩戴降噪耳机或特定物理就位，构建不可侵犯的心流结界；
   - **预约平移链（线性时延）**：避开 $\tau=0$ 处的无穷大阻抗，利用倒计时平滑接入心流；
   - **后悔药（免责启动）**：30 秒内允许无心理负罪感退出，极大降低启动心理摩擦力；
   - **下必为例（判例定性）**：用“一旦放行则往后终身永久放行”的判例约束消灭侥幸试探心理。
2. **RSIP (Recursive Steady-State Iteration Protocol)**：聚焦宏观全域稳态与演化：
   - **国策拓扑有向图**：将一整天的作息攻坚建立为可点亮、可升级、可追溯的逻辑依赖树；
   - **凌晨 04:00 业务日结算**：建立统一作息结算分界线，对断签节点无情清零，倒逼系统性重构反思；
   - **5 槽位防震荡版本演化**：支持安全试错与版本秒级回滚，防止系统因冲动改动而陷入震荡崩塌。

---

### 1.3 极简无扰工程原则：为什么杜绝 Emoji 与白噪音

为了捍卫用户在极端注意力匮乏与高对抗自控场景下的注意力资产，本系统确立了冷峻、理性的工程底线：

1. **全站彻底杜绝 Emoji**：
   - **认知阻抗**：Emoji 色彩驳杂、各平台渲染不一致，容易在严肃决策场景中注入琐碎浮躁的玩具感；
   - **视觉对齐**：全站统一采用高精度 SVG 矢量线性图标、几何纯色微指示点（Dot）与状态药丸（Pill Badge），视觉层次极度严整；
2. **坚决不内置白噪音与环境声**：
   - **决策耗竭防范**：避免用户将宝贵的自控启动能量耗费在“挑选雨声、篝火声或咖啡厅音效”等无关琐事上；
   - **系统正交解耦**：音频播放属于操作系统或专业音频软件的职责，系统仅提供专注结算与点火提示的单次纯净 Chime 鸣响。

---

### 1.4 系统核心四大业务域全景矩阵

| 业务领域 | 核心载体 | 核心能力 | 关键组件与视图 |
| :--- | :--- | :--- | :--- |
| **微观专注域** | 神圣座位 (Sacred Seat) | 倒计时锁定、预约平移、后悔药、顺水推舟超时深潜、全屏防打扰、全量秒级流水沉淀 | `SacredSeatView.vue`<br/>`FocusHistoryModal.vue`<br/>`StreakWarningModal.vue` |
| **宏观拓扑域** | 国策画布 (Policy Canvas) | Vue Flow 拓扑有向图、正交避障连线、分组外框拖拽缩放、连续点亮等级、04:00 断签结算审计、演化快照回滚 | `FocusCanvasView.vue`<br/>`FocusGroupFrame.vue`<br/>`OrthogonalEdge.vue`<br/>`EvolutionModal.vue`<br/>`ReconstructPromptModal.vue` |
| **列表治理域** | 国策列表 (Policy List) | 双态排序器（基准排版 / 临时多维）、时间与场景分离、类 Excel 复合排序、分组筛选、列表画布操作对齐 | `FocusListView.vue`<br/>`NodeSpecModal.vue` |
| **司法裁决域** | 判例法典 (Case Law) | 灰色行为裁决、浅绿允许/浅红禁止卡片、执行边界条件约束、专注结算增量录入 | `CaseLawView.vue`<br/>`PrecedentCaseModal.vue` |

---

## 二、 系统总体技术架构与技术栈选型

### 2.1 前后端技术选型矩阵

```
┌────────────────────────────────────────────────────────────────────────┐
│                        前端展现层 (Frontend SPA)                        │
│                                                                        │
│   Vue 3.5+ (Composition API <script setup>)                            │
│   ├─ 状态管理: Pinia 2.3+ (模块化 Store: focusTree, sacredSeat)        │
│   ├─ 路由中枢: Vue Router 4.5+ (带专注态防误触路由守卫)                  │
│   ├─ 拓扑引擎: @vue-flow/core 1.46+ (定制节点卡片、正交引线、外框)       │
│   ├─ 样式底座: 纯粹 Vanilla CSS Variables (双模自适应高对比度系统)     │
│   └─ 离线渐进: Vite PWA (Service Worker 预缓存，支持独立视窗沉浸运行)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST API (JSON Payload)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        后端服务层 (Backend Service)                     │
│                                                                        │
│   Node.js (LTS) + TypeScript 5.7+ (Express 4.21+)                      │
│   ├─ 生产安全防护: Helmet CSP 标头 + 细粒度分级限流 (Rate Limiter)      │
│   ├─ 身份鉴权中枢: JWT 双轨验证 (HttpOnly Cookie + Bearer) + bcryptjs    │
│   ├─ 智能边界分流: isLocalTrustedIP 本地与局域网免检通道                │
│   ├─ 核心业务算法: 04:00 跨日判定引擎、SemVer 语义推演、5槽位环形缓冲  │
│   └─ 数据库驱动: better-sqlite3 11.8+ (C++ 原生绑定，极速同步执行)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Direct Sync Native Bindings
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        持久化存储层 (SQLite WAL)                       │
│                                                                        │
│   嵌入式 SQLite 3 (backend/data/app.db)                                 │
│   ├─ 运行模式: PRAGMA journal_mode = WAL (读写完全并发零锁死)          │
│   ├─ 完整性约束: PRAGMA foreign_keys = ON (外键级联与置空保护)         │
│   ├─ 乐观并发锁: system_meta 表维护 system_revision 原子自增版本号     │
│   └─ 迁移中枢: PRAGMA table_info 启动时动态增量平滑迁移               │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 单机本地优先（Local-First）与分层通信架构

1. **零外部网络依赖**：全站所有业务逻辑、数据持久化与静态资产均可在本地环境独立运行。没有第三方云服务登录或远程验证，即便断网也能秒级响应；
2. **0ms 乐观更新（Optimistic UI）**：对于预约切换、后悔药退出、节点点亮等高频操作，前端在触发瞬间即同步切换内存状态更新界面，随后通过异步非阻塞 HTTP 请求与 SQLite 同步，主线程体验极为流畅；
3. **PWA 离线视窗**：配备 Manifest 与 Service Worker，支持“安装”至桌面或手机主屏，剥离浏览器地址栏与标签页外壳，实现类似原生桌面应用的专注质感；
4. **生产级六道纵深安全防线**：在暴露于局域网或公网时，全面启用 Helmet CSP、JWT 双轨鉴权、细粒度分级限流、可信内网免检白名单与全系统整机热备（详见 [Sacred_Focus全系统生产级安全加固与鉴权防护方案.md](file:///d:/Codes/Projects/sacred-focus/docs/Sacred_Focus全系统生产级安全加固与鉴权防护方案.md)）。

---

### 2.3 全局目录与代码工程布局

```
sacred-focus/
├── backend/                         # 后端服务工程
│   ├── data/                        # SQLite 物理数据库目录 (app.db)
│   ├── src/
│   │   ├── middleware/              # 生产级安全防护中间件管道
│   │   │   ├── auth.ts              # JWT 鉴权与管理员会话守卫
│   │   │   ├── ipRules.ts           # 本地/局域网受信任网段智能免检
│   │   │   ├── rateLimiter.ts       # 细粒度分级请求限流 (登录/导出/导入/通用)
│   │   │   └── security.ts          # Helmet 响应头与爬虫蜜罐诱捕
│   │   ├── routes/
│   │   │   ├── auth.ts              # 身份核验、Cookie/Token 签发与登出
│   │   │   ├── cases.ts             # 判例法典 REST API
│   │   │   ├── evolution.ts         # 演化日志、快照回滚与架构独立导出导入
│   │   │   ├── focusTree.ts         # 国策树节点/连线/分组/标签 CRUD 与 04:00 结算审计
│   │   │   ├── sacredSeat.ts        # 神圣座位配置、专注流水日志与连胜计算
│   │   │   ├── sync.ts              # 原子系统版本号与静默协同探针
│   │   │   └── system.ts            # 全系统整机镜像导出与预热备灾备恢复
│   │   ├── config.ts                # 服务端口、JWT密钥、安全哈希与数据路径配置
│   │   ├── db.ts                    # Better-SQLite3 初始化、建表与增量迁移脚本
│   │   ├── server.ts                # Express 生产级服务端入口
│   │   └── types.ts                 # 后端全量 TypeScript 核心接口声明
│   ├── .env.example                 # 环境变量模板
│   ├── package.json
│   └── tsconfig.json
├── frontend/                        # 前端单页面工程
│   ├── src/
│   │   ├── components/
│   │   │   ├── canvas/              # 国策树画布核心子组件
│   │   │   │   ├── DeletionAuditModal.vue     # 集中删除影响审计弹窗
│   │   │   │   ├── EvolutionModal.vue         # 5 槽位版本演化与回滚模态框
│   │   │   │   ├── FocusGroupFrame.vue        # 画布分组外框容器组件
│   │   │   │   ├── FocusLabelCard.vue         # 画布极简流转说明标签
│   │   │   │   ├── FocusNodeCard.vue          # 画布国策节点卡片
│   │   │   │   ├── GroupEditModal.vue         # 分组创建/编辑模态框
│   │   │   │   ├── LabelEditModal.vue         # 说明标签创建/编辑模态框
│   │   │   │   ├── NodeEditModal.vue          # 节点创建/编辑模态框
│   │   │   │   ├── NodeSpecModal.vue          # 节点执行规范详情卡
│   │   │   │   ├── OrthogonalEdge.vue         # 曼哈顿正交避障有向引线
│   │   │   │   └── ReconstructPromptModal.vue # 04:00 结算断签重构引导弹窗
│   │   │   ├── common/              # 全局通用模态框
│   │   │   │   ├── ResetConfirmModal.vue      # 系统重置安全口令门禁
│   │   │   │   └── SystemMigrationModal.vue   # 跨设备全系统数据迁移中枢
│   │   │   └── seat/                # 神圣座位核心子组件
│   │   │       ├── FocusHeatmap.vue           # 52 周全周期专注效能热力图
│   │   │       ├── FocusHistoryModal.vue      # 专注全量历史档案模态框
│   │   │       ├── FocusSessionLogCard.vue    # 历史流水单卡详情
│   │   │       ├── PrecedentCaseModal.vue     # 专注完成/下必为例结算弹窗
│   │   │       ├── SeatSettingsModal.vue      # 神圣座位个性化设置弹窗
│   │   │       └── StreakWarningModal.vue     # 违规中断清零严正警告弹窗
│   │   ├── router/index.ts          # 路由映射表、专注态隔离与身份前置守卫
│   │   ├── stores/
│   │   │   ├── focusTree.ts         # 国策树核心 Pinia Store
│   │   │   └── sacredSeat.ts        # 神圣座位与全屏沉浸 Pinia Store
│   │   ├── styles/
│   │   │   ├── base.css             # 基础排版、盒模型与通用类
│   │   │   └── variables.css        # 双主题高对比 CSS 变量与设计令牌
│   │   ├── types/index.ts           # 前端 TypeScript 接口类型定义
│   │   ├── utils/
│   │   │   ├── api.ts               # Axios/Fetch 统一封装与 Bearer Token 注入
│   │   │   ├── audio.ts             # 极简纯净 Chime 鸣响合成器
│   │   │   └── time.ts              # 紧凑时长 formatCompactDuration 算法
│   │   ├── views/
│   │   │   ├── CaseLawView.vue      # 判例法典主视图 (行内二次确认)
│   │   │   ├── FocusCanvasView.vue  # 国策树画布主视图 (展示/编辑双模)
│   │   │   ├── FocusListView.vue    # 国策列表主视图 (复合排序/智能沉底)
│   │   │   ├── LoginView.vue        # 管理员极简双模身份认证页
│   │   │   └── SacredSeatView.vue   # 神圣座位主视图 (全屏沉浸/热力图)
│   │   ├── App.vue                  # 全局顶栏（专注隔离）、主题中枢
│   │   └── main.ts                  # 前端启动挂载入口
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts               # Vite 6 与 PWA 配置
├── docs/                            # 权威技术架构与运维规范库
├── scratch/                         # 自动化数据重置与验证脚本
├── package.json                     # 根目录并发联调与编译脚本
└── README.md
```

---

## 三、 数据库与持久化中枢深度设计

### 3.1 SQLite WAL 模式与并发事务安全性

本系统底层采用 `better-sqlite3` 直连本地数据库 `backend/data/app.db`。初始化阶段强制配置两大 PRAGMA：

```typescript
export const db: DatabaseType = new Database(config.dbPath);

// 开启 WAL 日志模式（并发读写零锁死）
db.pragma('journal_mode = WAL');

// 强制开启外键完整性约束
db.pragma('foreign_keys = ON');
```

- **WAL (Write-Ahead Logging)**：在专注高频倒计时、节点状态瞬间多并发读写、版本快照瞬间打包的场景下，读者读最新镜像、写者顺序写入 WAL 文件，**读操作永不阻塞写操作，写操作永不阻塞读操作**；
- **外键级联与置空**：国策节点绑定分组时声明 `ON DELETE SET NULL`，即使分组外框被删除，内部国策节点安全保留坐标，绝不发生意外级联湮灭。

---

### 3.2 十大核心数据表 DDL 规范与关联语义

```sql
-- 1. 神圣座位全局配置表 (单行固定记录)
CREATE TABLE IF NOT EXISTS sacred_seat_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sacredToken TEXT NOT NULL,                   -- 物理信物说明 (如: "主力机开启专注模式")
  reservationSignal TEXT NOT NULL,             -- 启动信号动作 (如: "反手拍手轻声说换人")
  defaultFocusDuration INTEGER NOT NULL DEFAULT 60, -- 默认专注时长(分钟)
  regretWindowSeconds INTEGER NOT NULL DEFAULT 30,  -- 后悔药免责保护窗口(秒)
  currentStreak INTEGER NOT NULL DEFAULT 0,    -- 当前主链连续完成轮次
  maxStreak INTEGER NOT NULL DEFAULT 0,        -- 历史最高主链连续轮次
  updatedAt TEXT NOT NULL
);

-- 2. 专注全量流水日志表 (记录每一次心流深潜)
CREATE TABLE IF NOT EXISTS focus_session_logs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('FOCUS', 'RESERVATION')),
  startTime TEXT NOT NULL,                     -- 会话物理开始时间 (ISO 8601)
  endTime TEXT NOT NULL,                       -- 会话物理结束时间 (ISO 8601)
  targetDurationMinutes INTEGER NOT NULL,      -- 设定预设时长(分钟)
  actualDurationSeconds INTEGER NOT NULL,      -- 真实物理耗时(秒，含顺水推舟)
  status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAIL', 'REGRET')),
  focusContent TEXT,                           -- 本次专注的核心目标/内容描述
  failureReason TEXT,                          -- 违规中断时的强制归因与反思
  note TEXT                                    -- 系统补充备注 (判例录入关联等)
);

-- 3. 下必为例判例库表 (自控行为司法库)
CREATE TABLE IF NOT EXISTS precedent_cases (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,                          -- 判例裁定发生日期 (YYYY-MM-DD)
  behavior TEXT NOT NULL,                      -- 涉案行为具体描述
  verdict TEXT NOT NULL CHECK(verdict IN ('ALLOW', 'FORBID')), -- 终身放行 / 绝对禁止
  boundaryCondition TEXT NOT NULL,             -- 精确执行边界与防滑坡约束
  createdAt TEXT NOT NULL
);

-- 4. 国策树分组外框表 (空间拓扑父级容器)
CREATE TABLE IF NOT EXISTS focus_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                          -- 分组名称 (如: "晨间唤醒体系")
  themeColor TEXT NOT NULL,                    -- 主题微光色相 (Hex)
  positionX REAL NOT NULL DEFAULT 0,          -- 画布绝对 X 坐标
  positionY REAL NOT NULL DEFAULT 0,          -- 画布绝对 Y 坐标
  width REAL NOT NULL DEFAULT 300,             -- 外框宽度
  height REAL NOT NULL DEFAULT 200             -- 外框高度
);

-- 5. 国策节点表 (宏观稳态核心原子)
CREATE TABLE IF NOT EXISTS focus_nodes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,                          -- 节点唯一编码 (如: "N1", "N7")
  name TEXT NOT NULL,                          -- 节点名称 (如: "晨间深度工作流")
  groupId TEXT,                                -- 所属分组外框 ID
  triggerTime TEXT,                            -- 触发时间 (HH:mm，如 "07:00")
  triggerScene TEXT NOT NULL DEFAULT '全天候',  -- 触发场景 (如 "晨起时", "攻坚时")
  hasExactTime INTEGER NOT NULL DEFAULT 0,     -- 是否具备严格固定物理时刻
  timeValueMinutes INTEGER,                    -- 触发时间分钟绝对值 (用于智能排序)
  level INTEGER NOT NULL DEFAULT 1,            -- 当前连续升级等级 (Lv1~Lv5)
  maxLevel INTEGER NOT NULL DEFAULT 3,         -- 该节点支持的最高上限等级
  isLit INTEGER NOT NULL DEFAULT 0,            -- 今日是否点亮
  isFrozen INTEGER NOT NULL DEFAULT 0,         -- 是否处于冰蓝冻结保全态
  lastLitDate TEXT,                            -- 最近一次点亮的业务日期 (YYYY-MM-DD)
  previousLevel INTEGER DEFAULT 1,             -- 升级前历史基准等级 (用于审计对账)
  positionX REAL NOT NULL DEFAULT 0,          -- 画布绝对 X 坐标
  positionY REAL NOT NULL DEFAULT 0,          -- 画布绝对 Y 坐标
  specInstruction TEXT NOT NULL DEFAULT '',    -- 节点规范卡：操作指令
  specFailCondition TEXT NOT NULL DEFAULT '',  -- 节点规范卡：失败判定
  specBenefitMechanism TEXT NOT NULL DEFAULT '',-- 节点规范卡：受益机制
  specNotes TEXT,                              -- 节点规范卡：补充附注
  sortOrder INTEGER NOT NULL DEFAULT 0,        -- 列表基准物理排布次序
  FOREIGN KEY (groupId) REFERENCES focus_groups (id) ON DELETE SET NULL
);

-- 6. 拓扑有向连线表 (曼哈顿有向依赖流)
CREATE TABLE IF NOT EXISTS focus_edges (
  id TEXT PRIMARY KEY,
  sourceId TEXT NOT NULL,                      -- 起始节点/分组 ID
  sourceType TEXT NOT NULL CHECK(sourceType IN ('NODE', 'GROUP')),
  targetId TEXT NOT NULL,                      -- 目标节点/分组 ID
  targetType TEXT NOT NULL CHECK(targetType IN ('NODE', 'GROUP')),
  sourceAnchor TEXT NOT NULL CHECK(sourceAnchor IN ('TOP', 'BOTTOM', 'LEFT', 'RIGHT')),
  targetAnchor TEXT NOT NULL CHECK(targetAnchor IN ('TOP', 'BOTTOM', 'LEFT', 'RIGHT')),
  style TEXT NOT NULL CHECK(style IN ('SOLID', 'DASHED')) -- 实线强依赖 / 虚线弱参考
);

-- 7. 纯文本说明标签表 (画布极简流转文字说明)
CREATE TABLE IF NOT EXISTS focus_labels (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,                          -- 说明文本 (如: "专注间歇 15m")
  positionX REAL NOT NULL DEFAULT 0,          -- 画布绝对 X 坐标
  positionY REAL NOT NULL DEFAULT 0           -- 画布绝对 Y 坐标
);

-- 8. 5 槽位版本演化快照表 (防震荡环形缓冲区)
CREATE TABLE IF NOT EXISTS evolution_snapshots (
  slotIndex INTEGER PRIMARY KEY CHECK (slotIndex >= 0 AND slotIndex <= 4),
  id TEXT NOT NULL,                            -- 快照 UUID
  version TEXT NOT NULL,                       -- 语义版本号 (如 "v1.2.0")
  timestamp TEXT NOT NULL,                     -- 产生时间
  changelogNotes TEXT NOT NULL,                -- 演化变更日志内容
  isMajor INTEGER NOT NULL DEFAULT 0,          -- 是否重大版本变更
  dataJson TEXT NOT NULL                       -- 包含 groups, nodes, edges, labels 的全景 JSON
);

-- 9. 演化活跃指针状态表 (单行记录游标)
CREATE TABLE IF NOT EXISTS evolution_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  activePointerIndex INTEGER NOT NULL DEFAULT 0 -- 当前生效的 Slot 索引 (0~4)
);

-- 10. 系统全局元数据与协同版本控制表
CREATE TABLE IF NOT EXISTS system_meta (
  key TEXT PRIMARY KEY,                        -- 如 "system_revision", "last_sync_timestamp", "lastDailySettlementDate"
  value TEXT NOT NULL
);
```

---

### 3.3 数据库平滑升级机制（Schema Migration）

为了确保老用户无缝平滑迭代而不丢失本地数据，在 [backend/src/db.ts](file:///d:/Codes/Projects/sacred-focus/backend/src/db.ts) 启动时，使用原生 `PRAGMA table_info` 自动探测并安全执行增量 `ALTER TABLE`：

```typescript
// 1. 节点升级字段动态平滑增补
const nodeCols = (db.prepare('PRAGMA table_info(focus_nodes)').all() as Array<{ name: string }>).map(c => c.name);
if (!nodeCols.includes('lastLitDate')) db.prepare('ALTER TABLE focus_nodes ADD COLUMN lastLitDate TEXT').run();
if (!nodeCols.includes('previousLevel')) db.prepare('ALTER TABLE focus_nodes ADD COLUMN previousLevel INTEGER NOT NULL DEFAULT 0').run();
if (!nodeCols.includes('triggerScene')) db.prepare("ALTER TABLE focus_nodes ADD COLUMN triggerScene TEXT NOT NULL DEFAULT '全天候'").run();

// 2. 专注日志归因字段增补
const sessionLogCols = (db.prepare('PRAGMA table_info(focus_session_logs)').all() as Array<{ name: string }>).map(c => c.name);
if (!sessionLogCols.includes('focusContent')) db.prepare('ALTER TABLE focus_session_logs ADD COLUMN focusContent TEXT').run();
if (!sessionLogCols.includes('failureReason')) db.prepare('ALTER TABLE focus_session_logs ADD COLUMN failureReason TEXT').run();

// 3. 历史时间与场景拆分自动回填算法
// 智能将 "07:00" 规整为标准时刻，将非纯时刻场景字符串迁移至 triggerScene，彻底解决列表排序问题
```

任何历史版本的数据库均能在毫秒内自动对齐到最新模式，绝无手工迁移门槛。

---

### 3.4 演化快照与全系统整机热备恢复机制

针对意外崩溃或跨设备迁移，系统提供两级数据容灾体系：
1. **国策树演化快照 (`/api/evolution/*`)**：支持 5 槽位环形无损回滚与拓扑架构单独导出/导入；
2. **全系统整机冷备与预热备导入 (`/api/system/*`)**：
   - **镜像导出 (`GET /api/system/export`)**：将 `config`, `sessionLogs`, `precedents`, `treeData`（含 nodes/groups/edges/labels）, `snapshots`, `evolutionState`, `systemMeta` 整体打包为结构化 JSON；
   - **安全导入与 Pre-Import 预热备 (`POST /api/system/import`)**：在执行清空覆盖前，系统**强制自动在 Slot 4 建立紧急安全冷备快照**，并配合原子事务 `db.transaction()` 全量写入。一旦发生任何约束冲突，全自动无损回滚，实现零数据损毁风险；
3. **乐观并发版本协同 (`GET /api/sync/version`)**：基于 `system_revision` 原子自增计数器，支持多端与静默探针检测，发现服务端版本更新时前端温和提示刷新，防止覆盖。

---

## 四、 核心模块交互逻辑与状态机实现拆解

### 4.1 模块一：神圣座位（CTDP 微观专注防御引擎）

#### 4.1.1 核心五态运行状态机

神圣座位以严格确定性的有限状态机运行：

```
                    ┌─────────────────────────┐
                    │          IDLE           │ ◄────────────────────────┐
                    │       (待命就位态)       │                          │
                    └────────────┬────────────┘                          │
                                 │                                       │
            ┌────────────────────┼────────────────────┐                  │
            │ startReservation() │                    │ startFocus()     │
            ▼                    │                    ▼                  │
┌───────────────────────┐        │        ┌───────────────────────┐      │
│       RESERVING       │        │        │       FOCUSING        │      │
│      (预约倒计时中)     │        │        │     (神圣专注中/全屏)   │      │
└───────────┬───────────┘        │        └───────────┬───────────┘      │
            │ 预约倒计到 0        │                    │ 倒计时满         │
            ▼                    │                    ▼                  │
┌───────────────────────┐        │        ┌───────────────────────┐      │
│ RESERVATION_TRIGGERED │        │        │      OVER_FOCUS       │      │
│      (预约时间已到)     │        │        │   (静默顺水推舟超额态)   │      │
└───────────┬───────────┘        │        └───────────┬───────────┘      │
            │ confirmReady()     │                    │ wakeUp()         │
            └────────────────────┘                    ▼                  │
                                              ┌───────────────┐          │
                                              │   SETTLEMENT  ├──────────┘
                                              │   (判例结算)   │
                                              └───────────────┘
```

#### 4.1.2 预约平移链（动态线性时延突破启动阻抗）
- **交互逻辑**：当面临极大的当下心理启动阻抗时，用户选择 `+5m`、`+10m`、`+15m`、`+30m` 步长平移起始时刻，点击“点火预约倒计时”；
- **0ms 原位响应**：预约倒计时直接在主卡片内无缝切换呈现，无需跳页或弹窗，DOM 结构极其稳定；
- **清脆鸣响点火**：倒计时归零时触发 Web Audio 合成的纯净 Chime 鸣响，展示物理信物检查点，点击“确认就位”瞬时接入专注。

#### 4.1.3 30 秒后悔药保护 vs 违规中断严正清零
- **30 秒后悔药保护期 (`elapsedSeconds < 30`)**：
  - 点击“放弃退出”触发免责撤回；
  - **主链连胜不扣分**，状态标记为 `REGRET`，0ms 乐观响应返回待命，免去填写任何归因，无心理负罪感；
- **超过 30 秒中途违规放弃 (`elapsedSeconds >= 30`)**：
  - 弹出红底警示的 `StreakWarningModal`；
  - **强制要求如实输入中断原因与反思**，否则禁止确认；
  - 确认放弃后，**当前主链连胜强制清零至 `#0`**，状态记录为 `FAIL`。

#### 4.1.4 顺水推舟超时深潜与物理时钟毫秒级保真
- **顺水推舟模式**：预设 60 分钟倒计时结束后，系统**不发出任何蜂鸣或弹窗打断**，而是静默切入正向计时（`OVER_FOCUS`），允许心流自然延展；
- **物理时钟毫秒保真算法**：
  ```typescript
  function calculateActualSeconds(): number {
    if (sessionStartTime.value) {
      const diff = Math.round((new Date().getTime() - sessionStartTime.value.getTime()) / 1000);
      return Math.max(1, diff);
    }
    return Math.max(1, elapsedSeconds.value);
  }
  ```
  在退出心流的首次点击/触控唤醒瞬间，基于真实系统 Wall-Clock 时间戳差值冻结秒数，**彻底免疫浏览器后台休眠节流导致的少计漏计**。

#### 4.1.5 顺水推舟紧凑时长格式化算法（5m / 5m12s / 1h2s）
- 依据用户直觉标准定制紧凑时长函数 [frontend/src/utils/time.ts](file:///d:/Codes/Projects/sacred-focus/frontend/src/utils/time.ts)：
  - `300s` $\rightarrow$ `5m`（整分无冗余）
  - `312s` $\rightarrow$ `5m12s`
  - `3602s` $\rightarrow$ `1h2s`（自动省略 0m）
  - `18s` $\rightarrow$ `18s`（不再粗暴截断为 `+0m`）
- 贯通应用至历史档案卡片徽章、结算弹窗超额说明及主界面实时提示。

#### 4.1.6 专注态沉浸隔离：顶栏隐藏、自动全屏与路由守卫
- **顶栏导航彻底隐藏**：专注时 [App.vue](file:///d:/Codes/Projects/sacred-focus/frontend/src/App.vue) 移除「神圣座位、国策画布、国策列表、判例法典」全部链接，顶栏左侧展示带有翠绿呼吸动效的 `● 心流深潜中` 徽章，禁止点击跳转；
- **保留主题与全屏切换**：右上角保留高对比度深浅切换与全屏切换按钮；
- **调用全屏 API**：进入专注时自动触发 `document.documentElement.requestFullscreen()`（实现类似于按下 F11 的纯粹无界全屏），结算退出时自动退出全屏；
- **意外跳出防护网**：集成 `onBeforeRouteLeave` 与 `beforeunload` 双层守卫，尝试离开页面强制二次确认拦截。

#### 4.1.7 神圣专注历史档案模态框（FocusHistoryModal）
- **四大核心数据看板**：
  1. 累计专注时长（全量物理秒数转换为精确到一位小数的小时）；
  2. 专注完成率（圆满达成占比与成功/中断统计）；
  3. 当前主链连胜次数；
  4. 历史最高主链连胜峰值；
- **分段式胶囊药丸筛选**：
  - 针对 `全部`、`圆满达成`、`后悔药免责`、`违规中断` 提供语义高亮胶囊与实时计数；
  - 采用独立弹性容器配置 `flex-shrink: 0`，根治列表滚动时顶部药丸被压缩截断的缺陷；
- **流水卡片明细**：
  - 加粗目标标题，未填时优雅降级为浅灰斜体占位；
  - 呈现实际心流 / 预设目标比例；
  - 对超额自动附带 `+X 顺水推舟` 勋章；
  - 违规中断记录展开红色反思警示框。

---

### 4.2 模块二：国策树画布（RSIP 宏观拓扑网络）

#### 4.2.1 展示模式（只读防护）与编辑模式（排版沙箱）双模隔离
- **痛点**：用户在日常使用画布点亮国策时，极易误触拖拽导致排版错乱；
- **隔离方案**：
  - **展示模式（默认）**：所有节点位置锁定（`nodesDraggable = false`）、连线创建禁用、外框手柄隐藏，仅响应节点点击点亮与规范卡查看；
  - **编辑模式（沙箱）**：开启节点与外框自由拖拽排版，支持锚点引线连接，右上角提供“保存排版”与“取消变动”。

#### 4.2.2 节点分组外框（FocusGroupFrame）与空间直接调整
- 外框直接嵌入 Vue Flow 拓扑层，内部节点坐标基于画布绝对坐标系统对齐；
- 外框具备自适应微光边框（依据 `themeColor` 呈现），右下角提供物理手柄，支持直接拖拽调整外框宽高等空间尺寸。

#### 4.2.3 曼哈顿正交避障连线算法（OrthogonalEdge）
- 自定义 SVG 路径生成器：根据起点（Source）与终点（Target）及其四向锚点位置（`TOP` / `BOTTOM` / `LEFT` / `RIGHT`），自动计算曼哈顿正交折线与转角平滑圆角；
- 实线（SOLID）表达强依赖，虚线（DASHED）表达弱参考；深浅主题自动反转引线对比度。

#### 4.2.4 连续点亮升级体系（Lv1~Lv5）与断签清零
- **升级机制**：每个节点具备当前等级与上限（`maxLevel`），在当前业务日完成时点亮升级；
- **断签清零机制**：连续点亮中断后，等级将跌落清零回基准等级，以制度硬约束捍卫自控连续性；
- **冰蓝冻结态 (`isFrozen`)**：对于因外出、生病等不可抗力场景，支持开启冻结态保全等级，不触发断签惩罚。

#### 4.2.5 凌晨 04:00 跨日业务结算与国策树重构引导
- **04:00 业务分界线**：系统不以自然日 00:00 截断，而是以凌晨 04:00 为业务日切分点，契合人类生理作息周期；
- **自动审计巡检**：每日首登时自动比对 `lastAuditBusinessDate`，对断签国策执行清零审计；
- **重构弹窗 (`ReconstructPromptModal`)**：若发生国策树断签崩溃，主动弹出反思审计模态框，列出损毁节点，引导用户进行系统重构反思。

#### 4.2.6 集中删除审计拦截机制（DeletionAuditModal）
- 删除节点或分组前，进行系统级拓扑影响评估：
  - 探测关联连线、孤儿节点；
  - 强制弹出影响评估对话框，标红关联影响，要求用户输入二次确认，杜绝误操作导致拓扑瘫塌。

#### 4.2.7 演化变更日志与 5 槽位环形快照回滚（EvolutionModal）
- **5 槽位防震荡环形缓冲（Slot 0~4）**：
  - 每次保存国策树版本变更时，写入环形槽位并覆盖最老记录；
  - 自动推演 SemVer 语义版本号（小修小补推演 Patch，重大重构推演 Major）；
- **秒级无损回滚**：任意历史快照卡片均支持一键回滚，瞬间将画布数据重置回指定历史状态。

---

### 4.3 模块三：国策列表管理与双态排序器（FocusListView）

#### 4.3.1 基准排版态 vs 临时浏览态双模体系
- **基准排版态**：列表次序与画布物理排版完全一致，支持通过色块手柄上下拖拽直接物理调序，离开页面自动持久化；
- **临时浏览态**：支持按触发时间、场景、等级多维临时排序浏览。离开列表页面时，**系统自动静默恢复为基准物理排布**，绝不破坏底层主秩序。

#### 4.3.2 触发时间与触发场景彻底解耦
- 过去将“07:00 晨起”混合在一个字段导致排序混乱；
- 彻底拆分为 **触发时间 (`triggerTime`)**（精确物理时刻，如 `07:30`）与 **触发场景 (`triggerScene`)**（如 `攻坚时`、`极夜复盘`），使日程计划与场景化条件触发清晰分流。

#### 4.3.3 类 Excel 复合排序机制（无时间智能沉底）
- 针对触发时间排序进行系统级优化：
  - 具备物理时刻的节点按绝对时间升序排列；
  - 未指定具体物理时刻（全天候或场景触发）的节点，**自动智能沉底**排至尾部，彻底解决空值排在最前干扰视线的痛点。

#### 4.3.4 列表项全生命周期操作与画布对齐
- 列表中每一张国策卡片均完整对齐画布能力：直接点亮/熄灭、冻结、查看规范卡、编辑参数、删除确认。

---

### 4.4 模块四：判例法典（下必为例司法体系）

#### 4.4.1 自控判例法的实体法理
- 面对自控过程中的灰色诱惑（例如：“今天太累能否破例看30分钟短视频？”），人往往抱有“仅此一次”的侥幸心理；
- 自控判例法确立硬核法则：**“今日之破例，即为往后终身永久之法典许可；今日之禁止，往后绝无借口再行试探”**。通过将决策摩擦力放大至终身维度，瞬间剿灭逃避借口。

#### 4.4.2 灰色地带争议裁决与边界条件录入
- **涉案行为描述 (`behavior`)**：记录具体争议行为；
- **司法裁决 (`verdict`)**：
  - `ALLOW`（浅绿微光卡片）：终身放行；
  - `FORBID`（浅红微光卡片）：绝对禁止；
- **执行边界硬约束 (`boundaryCondition`)**：必须严格写明允许或禁止的苛刻触发条件，防止滑坡效应。

---

## 五、 网页视觉系统与 UI/UX 规范

### 5.1 纯粹 Vanilla CSS 模块化架构

系统放弃笨重的 CSS 框架，完全采用现代化标准 **Vanilla CSS Design Tokens**。所有样式均汇聚于 `variables.css` 与组件 scoped 样式中，实现最高级别的视觉定制自由度与极致渲染性能。

---

### 5.2 极夜深色与日光浅色双模高对比色彩系统

```
==========================================================================
 视觉变量 Token          极夜深色 (data-theme="dark")   日光浅色 (data-theme="light")
==========================================================================
 --bg-primary           #0A0A0C (OLED 纯黑)           #F8F9FA (极简纸感浅灰)
 --bg-secondary         #121216 (深邃灰黑底板)        #FFFFFF (纯净白底)
 --bg-tertiary          #1A1A20 (卡片与控件底盘)      #EEF0F2 (柔和功能底灰)
 --border-color         #26262F                       #E2E4E8
 --text-primary         #EDEDED (高对比暖白)          #111827 (高对比墨黑)
 --text-secondary       #94949E                       #4B5563
 --color-lit            #00F0FF (天青科技微光)        #0284C7 (沉稳湛蓝)
 --color-gold           #F59E0B (胜利金黄)            #D97706 (深琥珀金)
 --color-success        #10B981 (纯净翠绿)            #059669 (翠绿)
 --color-danger         #F43F5E (警示猩红)            #E11D48 (深玫瑰红)
 --color-frozen         #38BDF8 (冰蓝冻结)            #0284C7 (冰蓝)
==========================================================================
```

无论用户处于暗光夜间工作环境，还是高光白昼户外，均能保持阅读极度清晰，杜绝文字发虚或对比度不足。

---

### 5.3 拓扑引线色彩反转规范

针对拓扑图在深浅模式下常见的高对比冲突，系统设计了专用引线反转色阶：
- **深色模式**：`--edge-stroke: #A1A1AA`（高对比亮浅灰，在黑底下清晰醒目）；
- **浅色模式**：`--edge-stroke: #334155`（高对比深石墨灰，在白底上利落刚劲）。

---

### 5.4 Typography 排版规范（JetBrains Mono + Plus Jakarta Sans）

- **UI 文本与标题**：采用 `Plus Jakarta Sans`，字形几何感强，排版现代克制；
- **数字、时钟、等级与时戳**：全量强制挂载 `JetBrains Mono` 等宽字体（`font-mono`），确保倒计时数字跳动时**字符宽度恒定零抖动**，营造精密机械仪表的稳重感。

---

### 5.5 状态胶囊药丸与微动效规范

1. **状态胶囊药丸（Segmented Pill Badge）**：
   - 采用 `border-radius: 9999px` 全圆角胶囊构型；
   - 背景色采用对应语义色（翠绿、金黄、玫瑰红）的 `12%` 低透明度微光填充，辅以 `25%` 透明度细边框，既具辨识度又克制温润；
2. **微动效规范**：
   - 全局微交互控制在 `0.15s ~ 0.25s`，曲线采用 `cubic-bezier(0.4, 0, 0.2, 1)`；
   - 专注进行中加入呼吸微动效 `pulse-dot`（6px 翠绿微点，1.8s 周期缩放微光），低耗平稳呈现系统生命力。

---

## 六、 系统可靠性、构建与未来演化展望

### 6.1 研发质量与构建表现
- **全栈类型安全**：前后端实现全量 TypeScript 覆盖，编译开启严格类型检查模式；
- **前端工程构建**：通过 `vue-tsc -b && vite build` 生产构建打包，构建耗时仅约 4.6 秒，PWA 资源预缓存无差错，移动端触控与响应式（Milestone 8）全面达标；
- **后端安全与稳定性**：Node.js Express + Better-SQLite3 WAL 极速响应，落地生产级六道防御纵深（Milestone 9）；
- **自动化测试覆盖**：覆盖 04:00 分界线、首次点亮、后悔药回滚、断签清零、时间场景字段拆分、时间沉底算法、复合排序、5 槽位环形快照推演、系统全量冷备导入导出与预热备灾备机制全部通过。

### 6.2 后续演化路线图 (Roadmap)
1. **多端本地中继同步**：基于局域网 WebRTC / LAN WebSocket 探索无云端中心节点的多机点对点同步；
2. **离线冲突 CRDT 演算**：未来跨端多活编辑时，引入 CRDT 有向无环图实现零锁冲突自愈合并；
3. **原生跨平台打包**：结合 Tauri 探索零外部运行时的超轻量本地原生安装包（< 15MB）。

---

> 🎯 **结语**：Sacred Focus 是一次将行为科学、认知心理学与现代前沿软件工程深度融合的架构实践。系统以代码为结界，化自控为法典，为每一个在注意力稀缺时代追求极度专注与心智进化的个体，筑起一座稳如磐石的数字理性堡垒。
