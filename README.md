# 📐 Sacred Focus (国策树与神圣座位)

> 基于自控工程学体系（CTDP 链式时延协议与 RSIP 递归稳态迭代协议）构建的跨端（移动端 + 桌面端）个人自控与效能系统。
> 实现 **「神圣座位（微观专注与判例法）」** 与 **「国策树（宏观全域稳态与演化系统）」** 的数字化、可视化与半自动化。

---

## 🛠️ 技术栈

- **前端 (Frontend)**:
  - 框架：Vue 3 (Composition API, `<script setup>`) + TypeScript + Vite
  - 状态管理：Pinia
  - 路由：Vue Router
  - 画布引擎：`@vue-flow/core`（支持正交折线避障布线、双指缩放、自定义纯净节点卡片）
  - 样式体系：Vanilla CSS + CSS Variables（极夜 OLED 纯黑 / 日光高对比白 双主题）
  - 移动端：PWA (`vite-plugin-pwa`)
- **后端 (Backend)**:
  - 运行时：Node.js (LTS) + Express + TypeScript
  - 数据库：SQLite (`better-sqlite3`)，WAL 模式，单文件持久化 (`./data/app.db`)
- **部署 (Deployment)**:
  - Docker + Docker Compose + Nginx 反向代理与 SSL 自动化

---

## 📂 项目目录结构

```text
sacred-focus/
├── backend/                       # Node.js + Express + SQLite 服务端
│   ├── data/                      # SQLite 数据库持久化目录 (app.db)
│   ├── src/
│   │   ├── config.ts              # 服务配置与鉴权
│   │   ├── db.ts                  # better-sqlite3 初始化、表定义与种子数据
│   │   ├── routes/                # RESTful API 路由模块
│   │   │   ├── sacredSeat.ts      # 神圣座位与流水日志
│   │   │   ├── cases.ts           # 下必为例判例法典
│   │   │   ├── focusTree.ts       # 国策树节点/分组/连线
│   │   │   └── evolution.ts       # 5 槽位版本快照与回滚
│   │   ├── types.ts               # 强类型数据契约
│   │   └── server.ts              # 服务入口
│   ├── package.json
│   └── tsconfig.json
├── frontend/                      # Vue 3 + Vite 前端工程
│   ├── src/
│   │   ├── router/                # 视图路由配置
│   │   ├── stores/                # Pinia 状态管理
│   │   ├── styles/                # 极简双主题 CSS 变量与基础样式
│   │   ├── types/                 # 前端强类型定义
│   │   └── views/                 # 核心视图（神圣座位、国策画布、国策列表、判例法典）
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docs/                          # 系统详细设计方案与架构文档
├── package.json                   # 根项目启动与编译快捷脚本
└── .gitignore                     # Git 忽略规则
```

---

## 🚀 快速启动

### 1. 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 2. 本地开发启动

```bash
# 启动后端 API 服务（端口 3000）
cd backend
npm run dev

# 启动前端开发服务器（端口 5173，自动代理 API 请求至 3000）
cd frontend
npm run dev
```

---

## 📜 核心理念与机制

1. **神圣座位 (CTDP 引擎)**：
   - 物理隔离：神圣信物（开启专注）与启动信号（线性时延预约）；
   - 30 秒后悔药：启动 30 秒内允许无感撤退退出，不损毁主链连胜记录；
   - 零打扰归零：倒计时归零不发出剧烈闹铃，保持心流安宁，首次交互延时结算；
   - 下必为例判例法典：针对模糊行为记录允许/禁止裁决，捍卫底线。
2. **国策树 (RSIP 引擎)**：
   - 全天候流程图：节点、分组外框与正交折线避障连线；
   - 双击点亮与长按三击规范卡：零多余认知负担手势交互；
   - 5 槽位防震荡环形快照：支持安全演化记录与版本指针无损回滚。
