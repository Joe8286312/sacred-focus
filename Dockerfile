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

# 执行依赖安装 (包含 devDependencies 用于构建)
RUN npm ci

# 复制工程源代码
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# 执行全量构建 (tsc + vue-tsc + vite build)
RUN npm run build

# --------------------------------------------------------
# 阶段 2：后端纯净生产依赖构建器
# --------------------------------------------------------
FROM node:22-bookworm-slim AS prod-deps

WORKDIR /app/backend

# 安装编译工具用于编译生产版 better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# --------------------------------------------------------
# 阶段 3：轻量生产运行时镜像 (Minimal Production Runner)
# --------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# 安装 curl 用于健康状态探测
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 生产级默认环境变量
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data \
    FRONTEND_DIST=/app/frontend/dist

# 拷贝后端生产依赖与编译产物
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
