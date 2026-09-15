# ========================================================
# Sacred Focus 企业级生产多阶段构建 Dockerfile
# Stage 1: 构建前后端产物
# Stage 2: 独立安装纯净生产依赖
# Stage 3: 轻量安全运行时 (非 root 用户 + 健康检查)
# ========================================================

# --------------------------------------------------------
# 阶段 1：构建器 (编译前端 Vue 3 + Vite 和 后端 TypeScript)
# --------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# 安装 C++ 原生编译工具链 (better-sqlite3 编译支持)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 复制根目录及工作区依赖定义
COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

# 执行依赖安装 (包含 devDependencies 用于构建)。
# npm 在 Windows 生成的 workspace lockfile 可能遗漏 Rollup 的 Linux 原生可选包；
# 在 Linux 构建器中显式补齐当前 x64 GNU 运行时所需二进制，避免 Vite 构建失败。
RUN npm ci \
    && npm install --no-save --no-package-lock --ignore-scripts @rollup/rollup-linux-x64-gnu@4.63.1

# 复制工程源代码与构建验证所依赖的脚本资源
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY scripts/ ./scripts/
# 自动化验证会检查证书生成脚本；私钥与证书已由 .dockerignore 排除。
COPY nginx/ssl/ ./nginx/ssl/

# 执行全量构建 (tsc + vue-tsc + vite build)
RUN npm run build

# --------------------------------------------------------
# 阶段 2：后端纯净生产依赖构建器
# --------------------------------------------------------
FROM node:22-bookworm-slim AS prod-deps

WORKDIR /app

# 安装编译工具用于编译生产版 better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 生产依赖必须使用根工作区锁文件。backend/package-lock.json 是历史独立锁文件，
# 不能代表当前 backend/package.json 的完整依赖集。
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev --workspace=backend

# --------------------------------------------------------
# 阶段 3：轻量生产运行时镜像 (Minimal Production Runner)
# --------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# 安装 curl 用于健康状态探测，安装 tzdata 支持业务日时区精确对齐 (P2-004)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# 生产级默认环境变量
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data \
    FRONTEND_DIST=/app/frontend/dist

# npm workspace 可能将依赖分别保留在 backend/node_modules 和根
# node_modules（提升安装）。Node 会依次查找这两个层级，因此运行时均需保留。
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/package.json

# 拷贝前端静态产物
COPY --from=builder /app/frontend/dist ./frontend/dist

# 创建持久化数据目录并赋予非特权账号 node 属权
RUN mkdir -p /app/data && chown -R node:node /app

# 切换为安全非特权用户
USER node

# 持久化挂载点与服务端口
VOLUME ["/app/data"]
EXPOSE 3000

# 容器健康检查：每 30 秒探测一次 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/api/health || exit 1

# 启动 Sacred Focus 自控中枢 API 与静态服务
CMD ["node", "backend/dist/server.js"]
