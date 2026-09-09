# 📐 Sacred Focus (国策树与神圣座位)

<p align="center">
  <img src="frontend/public/favicon.svg" alt="Sacred Focus Logo" width="80" height="80" />
</p>

<p align="center">
  <strong>基于自控工程学体系构建的跨端个人自控与全域效能管理中枢</strong><br>
  融汇 <strong>CTDP（链式时延协议）</strong> 与 <strong>RSIP（递归稳态迭代协议）</strong> 双核心引擎
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-42b883.svg?style=flat-square&logo=vue.js" alt="Vue 3" />
  <img src="https://img.shields.io/badge/Vite-6.0-646cff.svg?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6.svg?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-Express-339933.svg?style=flat-square&logo=node.js" alt="Node.js Express" />
  <img src="https://img.shields.io/badge/SQLite-WAL-003B57.svg?style=flat-square&logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/PWA-Ready-f05032.svg?style=flat-square&logo=pwa" alt="PWA Ready" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT License" />
</p>

---

## 📖 系统定位与核心哲学

**Sacred Focus** 是为了解决个人效能系统在面对意志力波动、认知负荷与心魔侵蚀时容易崩溃、衰减或形同虚设而设计的数字化效能工程系统。

系统将微观行为控制与宏观体系演化深度解耦，由两大核心工程协议驱动：

1. **神圣座位 (Sacred Seat) · CTDP 链式时延协议 (Chain Time Delay Protocol)**:
   - **物理隔离与信物契约**：通过「神圣信物」与「启动信号」建立严格的心流仪式屏障，隔绝无序冲动。
   - **30 秒无痛后悔药**：启动 30 秒内允许无感撤退，杜绝沉没成本绑架，守护主链连胜完整性。
   - **零打扰心流归零**：倒计时归零绝不触发刺耳闹铃，保持专注沉浸，直到用户首次主动交互才进行延时结算。
   - **52 周全景热力图**：全年度效能追踪与连胜分析（Streak），量化稳态习惯沉淀。
2. **国策树中枢 (Focus Tree) · RSIP 递归稳态迭代协议 (Recursive Steady-state Iteration Protocol)**:
   - **全天候时空流转拓扑**：利用可视化节点、智能分组外框、正交避障连线与极简说明标签构建全天候行为指引。
   - **双模交互与沙盒排版**：展示模式（单击极速点亮、双击四维规范）与编辑排版模式（零脏数据内存沙盒、差异审计、快捷键撤回/重做）彻底分离。
   - **5 槽位防震荡环形快照**：支持版本演化日志（重大里程碑/日常微调）与任意槽位原子级无损回滚。
   - **下必为例判例法典**：针对灰色地带与模糊行为实施「允许 / 禁止」法典化判例裁决，以法治防心魔。

---

## 🌟 核心功能模块

### 1. 🪑 神圣座位 (Sacred Seat)
- **仪式化启动**：输入启动信号与神圣信物（可自定义），设置专注时长并开启神圣专注。
- **30 秒反悔机制**：30 秒内点击放弃仅作为预备试探退出，不记为破戒，不中断当前连胜天数。
- **三重结算归因**：
  - `SUCCESS`（完满完成）：达成专注时长，正向累加总时长与连续点亮积分。
  - `REGRET`（反悔退出）：自律觉察后的主动策略性撤离，记录反思日志。
  - `FAILED`（破戒中断）：意外中断记录详细诱因与阻断经验，形成防御资产。
- **52 周效能热力图 (Heatmap)**：GitHub 风格的 52 周专注热力矩阵，清晰洞察各周期的专注密度与节律。

### 2. 🗺️ 国策树画布中枢 (Focus Canvas)
- **展示模式 (View Mode, 默认)**：
  - 单击节点：快速切换【点亮 / 熄灭】，基于凌晨 4 点业务日状态机与连续点亮自动维护等级与状态。
  - 双击节点：弹出沉浸式【详细规范卡】（查看操作指令、破戒条件、效益机制与补充说明）。
  - 防误触机制：悬停节点时智能锁定画布平移，避免手势抖动与误操作。
- **编辑模式 (Edit Mode)**：
  - **草稿沙盒隔离**：编辑过程全量运行于前端内存沙盒，未保存前绝不污染持久化数据库。
  - **正交避障连线**：自动寻径正交避障连接线，支持 Click-to-Connect 两步点击精准连桩。
  - **分组外框框架**：可视化外框节点，支持 8 向尺寸缩放、主题色彩定制与批量包裹。
  - **极简说明标签 (`FocusLabelCard`)**：支持在画布任意流转节点间悬浮添加说明标签（如 `"专注间歇"`、`"缓冲流转"`），双击编辑、一键删除。
  - **极速快捷键**：内置 `Ctrl+Z`（撤销）与 `Ctrl+Y` / `Ctrl+Shift+Z`（重做）画布级历史栈，支持 `Delete`/`Backspace` 快速删除。
  - **集中级联审计**：点击「保存排版」时自动执行前置 Diff 审计，检测并提示孤儿节点与级联受影响的连线。

### 3. 📋 国策列表 (Policy List)
- **多维度时空排序**：按照全天候时机（晨曦唤醒、白昼蓄力、暮色收拢等）及关联分组清晰陈列。
- **规范等级状态机**：支持最大等级限制与连续点亮升星状态机，自动更新当前等级进度条。
- **居中优雅排版**：对触发时机与归属分组进行垂直居中排布，阅读体验清爽直观。

### 4. ⚖️ 判例法典 (Precedent Case Law)
- **下必为例法治体系**：针对日常行为中的模糊地带进行定性裁决（✅ 允许施行 / 🚫 绝对禁止）。
- **边界条件严格定义**：记录裁决生效的严格前置条件与判词解析，彻底堵死认知失调与自我借口。
- **实时跨端事件广播**：支持无感刷新与行内二次防误触删除。

### 5. 🔄 演化快照与跨设备迁移 (Evolution & Migration)
- **5 槽位环形快照 (Slot 0 ~ 4)**：
  - 自动递增语义化版本号（如 `v1.0` -> `v1.1` 或重大里程碑 `v2.0`），记录演化日志。
  - 支持锁定任意历史快照一键无损原子回滚。
- **三模块自治独立归档**：
  - 国策架构与拓扑独立 JSON 备份（含节点、分组、连线、说明标签与演化快照）。
  - 专注流水记录独立导出与导入。
  - 判例法典独立导出与恢复。
- **全系统整机镜像搬家 (`/api/system/export` / `/api/system/import`)**：
  - 一键生成整机全量加密 JSON 归档包。
  - 导入恢复时自动触发预热备机制（`app_pre_import_*.db`），确保灾难恢复 100% 数据安全。

### 6. 🛡️ 生产级安全防护体系 (Production Security)
- **动态 JWT 身份鉴权**：支持基于 HttpOnly Cookie 与 Bearer Token 的无感状态保持。
- **智能安全白名单**：本地回环与受信任网段免密放行，保障单机开箱即用的流畅度。
- **分级频率限制保护 (`express-rate-limit`)**：
  - 登录防爆破（10 次 / 15 分钟）。
  - 整机冷备导出频控（15 次 / 10 分钟，杜绝拖库 DoS 风险）。
  - 恢复导入频控（10 次 / 小时，防止恶意磁盘擦写）。
- **企业级安全标头**：集成 `helmet` 策略，强化跨站防护与 CSP 沙盒。

---

## 🛠️ 技术栈

| 领域 | 核心技术 | 说明 |
| :--- | :--- | :--- |
| **前端架构** | Vue 3.5 + TypeScript 5.7 + Vite 6.0 | `<script setup>` 组合式 API，单向数据流与强类型保障 |
| **画布引擎** | `@vue-flow/core` | 定制正交折线避障、两步点击连线、自定义分组与极简标签 |
| **状态管理** | Pinia 2.3 | 模块化响应式状态树，状态持久化与快照暂存 |
| **样式体系** | Vanilla CSS + CSS Variables | 极简双主题（日间高对比 / 夜间 OLED 纯黑），响应式栅格 |
| **离线与移动端** | `vite-plugin-pwa` (Workbox) | 渐进式 Web 应用，支持全平台一键安装至桌面与手机主屏 |
| **后端运行时** | Node.js (LTS) + Express 4.21 | RESTful API 架构，严格中间件管道与全链路异常捕获 |
| **数据持久化** | SQLite 3 (`better-sqlite3`) | 单文件本地存储 (`./data/app.db`)，WAL 高性能并发写入模式 |
| **安全加固** | JWT + bcryptjs + helmet + rate-limit | 细粒度接口频控、密码哈希与生产级网络防护 |

---

## 📂 项目目录结构

```text
sacred-focus/
├── backend/                             # Node.js + Express + SQLite 服务端
│   ├── data/                            # 数据库持久化目录 (app.db)
│   ├── src/
│   │   ├── config.ts                    # 全局服务配置与环境变量解析
│   │   ├── db.ts                        # 数据库初始化、建表、种子数据与全量查询
│   │   ├── middleware/                  # 生产级安全与防护中间件
│   │   │   ├── auth.ts                  # JWT 鉴权与管理员会话守卫
│   │   │   ├── ipRules.ts               # 本地受信任网段智能放行
│   │   │   ├── rateLimiter.ts           # 细粒度多级请求限流
│   │   │   └── security.ts              # Helmet 安全头与防注入保护
│   │   ├── routes/                      # RESTful 领域业务路由
│   │   │   ├── auth.ts                  # 身份登录与令牌刷新
│   │   │   ├── cases.ts                 # 判例法典增删查改
│   │   │   ├── evolution.ts             # 5 槽位演化快照、版本回滚与架构导出导入
│   │   │   ├── focusTree.ts             # 国策节点、分组、连线与标签状态机
│   │   │   ├── sacredSeat.ts            # 神圣座位专注流、热力图统计与复盘
│   │   │   ├── sync.ts                  # 版本增量与协同校验
│   │   │   └── system.ts                # 全系统整机跨设备镜像导出与恢复
│   │   ├── types.ts                     # 领域核心强类型契约
│   │   └── server.ts                    # HTTP 服务入口
│   ├── .env.example                     # 环境变量模板
│   ├── package.json
│   └── tsconfig.json
├── frontend/                            # Vue 3 + Vite 前端工程
│   ├── src/
│   │   ├── components/                  # 业务交互组件
│   │   │   ├── canvas/                  # 画布专属组件 (国策卡片、分组框、说明标签、正交连线、各类弹窗)
│   │   │   └── common/                  # 通用模态框 (系统迁移看板、重置确认)
│   │   ├── router/                      # 路由守卫与视图路由
│   │   ├── stores/                      # Pinia 状态树 (focusTree, sacredSeat)
│   │   ├── styles/                      # 双主题调色板与全局动效设计
│   │   ├── types/                       # 前端强类型契约
│   │   ├── utils/                       # API 封装与网络通信
│   │   ├── views/                       # 核心业务视图 (神圣座位、国策画布、国策列表、判例法典、登录页)
│   │   ├── App.vue                      # 根应用框架
│   │   └── main.ts                      # 前端挂载入口
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docs/                                # 系统全生命周期设计方案与深度白皮书
├── scratch/                             # 数据重置与验证脚本
├── package.json                         # 根目录并发联调与构建脚本
└── README.md
```

---

## 🚀 快速启动

### 1. 环境准备
- **Node.js**: `>= 18.0.0` (推荐 LTS 20+)
- **npm**: `>= 9.0.0`

### 2. 依赖安装

在项目根目录下，执行一键依赖安装（利用 npm workspace 同时安装前端与后端）：

```bash
# 根目录下安装所有子工程依赖
npm install
```

### 3. 配置环境变量

复制后端配置模板并按需修改：

```bash
cd backend
cp .env.example .env
```

`.env` 关键参数说明：
```env
PORT=3000
DATA_DIR=./data
JWT_SECRET=your_super_secret_jwt_key_here
ADMIN_PASSWORD=your_secure_admin_password
```

### 4. 启动本地联调

返回项目根目录，一条命令并发拉起后端 API 服务与前端 Vite 调试服务：

```bash
# 在根目录下执行
npm run dev
```

- **前端访问地址**：`http://localhost:5180`（支持热更新与自动 API 代理）
- **后端 API 服务**：`http://localhost:3000`
- **默认管理员密码**：`admin123456`（本机访问自动智能免密登录，公网环境须凭密码登录）

---

## 📦 生产构建与部署

### 1. 编译打包

在根目录下执行全量编译：

```bash
npm run build
```
- 后端将通过 `tsc` 编译生成输出至 `backend/dist`。
- 前端将通过 `vue-tsc` 进行严格类型校验并由 `vite build` 生成产物至 `frontend/dist`。

### 2. 本地生产模式启动

```bash
npm start
```

### 3. 部署方案

系统支持单机部署、虚拟机挂载及云服务器生产级部署（Nginx 反代 + SSL 证书）。详细方案可参阅以下系统白皮书与教程：
- [Sacred_Focus从VMware虚拟机到云服务器全流程部署实战教程](docs/Sacred_Focus从VMware虚拟机到云服务器全流程部署实战教程.md)
- [Sacred_Focus全系统生产级安全加固与鉴权防护方案](docs/Sacred_Focus全系统生产级安全加固与鉴权防护方案.md)

---

## 📚 深度文档索引

项目包含完备的架构设计、自控力工程推导与运维部署文档，存放于 `docs/` 目录：

| 文档名称 | 核心内容 |
| :--- | :--- |
| 📘 [全系统深度架构与设计实现全景白皮书](docs/Sacred_Focus全系统深度架构与设计实现全景白皮书.md) | 涵盖 CTDP / RSIP 哲学推导、状态机定义、数据库范式与完整架构设计 |
| 🛡️ [全系统生产级安全加固与鉴权防护方案](docs/Sacred_Focus全系统生产级安全加固与鉴权防护方案.md) | 鉴权设计、多级 Rate-Limit 频控、IP 规则防火墙与数据加密 |
| ☁️ [从本地到云端：开发历程全景与上云部署落地指南](docs/从本地到云端：开发历程全景与上云部署落地指南.md) | 开发迭代路径回顾、系统部署规划与运维踩坑经验 |
| 📜 [国策树 v1.0 架构基线](docs/国策树_v1.0.md) | 初始国策树全集规范、触发时机、分组规划与四维规范卡参考 |
| 📊 [神圣座位专注记录与沉浸交互重构总结](docs/神圣座位专注记录与沉浸交互重构总结.md) | 专注计时结算机制、归因复盘与年度 52 周热力图实现剖析 |
| 🧪 [本地使用全链路验证与全系统优化评估报告](docs/本地使用全链路验证与全系统优化评估报告.md) | 全链路数据持久化、断网/异常恢复与并发容灾验证报告 |

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 协议开源。
