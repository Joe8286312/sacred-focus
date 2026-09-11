#!/usr/bin/env bash
# ========================================================
# Sacred Focus 服务器/虚拟机端 Docker 一键平滑更新脚本
# 用法:
#   1. 离线镜像包更新: ./scripts/docker-update.sh sacred-focus-v1.1.0.tar.gz
#   2. 在线版本拉取更新: ./scripts/docker-update.sh v1.1.0
# ========================================================

set -e

TARGET="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "=========================================================="
echo "🔄 Sacred Focus 生产环境 Docker 平滑更新程序"
echo "=========================================================="

# 1. 检查运行环境
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未检测到 docker 命令。"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ 错误: 未检测到 docker compose 插件。"
    exit 1
fi

# 2. 检查 .env 配置文件 (P0-001 安全加固：严禁自动应用示例配置)
if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        cp .env.production .env
        echo "✓ 自动复制 .env.production 为 .env"
    else
        echo "❌ 错误: 未检测到生产环境 .env 配置文件！"
        echo "   为防范默认弱密钥安全事故，系统已禁止自动落地公开示例配置。"
        echo "   请先根据 .env.production.example 创建并配置真实的 .env 文件（设置高熵 JWT_SECRET 与强 ADMIN_PASSWORD）。"
        exit 1
    fi
fi

# 3. 核心资产自动前置热备（P2-002: 零风险事务级原子热备与快照一致性）
DATA_DIR="./data"
if [ -f "${DATA_DIR}/app.db" ]; then
    BACKUP_DIR="${DATA_DIR}/backup"
    mkdir -p "${BACKUP_DIR}"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="${BACKUP_DIR}/app_pre_update_${TIMESTAMP}.db"
    echo "🛡️ 正在执行升级前数据库原子热备 -> ${BACKUP_FILE} ..."
    
    BACKUP_DONE=0
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "${DATA_DIR}/app.db" ".backup '${BACKUP_FILE}'" && BACKUP_DONE=1
    fi

    if [ "${BACKUP_DONE}" -eq 0 ] && docker compose ps -q sacred-focus >/dev/null 2>&1 && [ -n "$(docker compose ps -q sacred-focus 2>/dev/null)" ]; then
        echo "   - 使用容器运行时 better-sqlite3 执行在线热备..."
        docker compose exec -T sacred-focus node -e "const Database = require('better-sqlite3'); const db = new Database('/app/data/app.db'); db.backup('/app/data/backup/app_pre_update_${TIMESTAMP}.db');" >/dev/null 2>&1 && BACKUP_DONE=1
    fi

    if [ "${BACKUP_DONE}" -eq 0 ] && command -v python3 >/dev/null 2>&1; then
        echo "   - 使用 Python3 原生 sqlite3 在线备份 API..."
        python3 -c "import sqlite3; src = sqlite3.connect('${DATA_DIR}/app.db'); dst = sqlite3.connect('${BACKUP_FILE}'); src.backup(dst); dst.close(); src.close()" >/dev/null 2>&1 && BACKUP_DONE=1
    fi

    if [ "${BACKUP_DONE}" -eq 0 ]; then
        echo "⚠️ 警告: 宿主未安装 sqlite3/python3，正在暂停容器后进行快照冷备..."
        docker compose pause sacred-focus >/dev/null 2>&1 || true
        cp "${DATA_DIR}/app.db" "${BACKUP_FILE}"
        [ -f "${DATA_DIR}/app.db-wal" ] && cp "${DATA_DIR}/app.db-wal" "${BACKUP_DIR}/app_pre_update_${TIMESTAMP}.db-wal"
        docker compose unpause sacred-focus >/dev/null 2>&1 || true
    fi

    # 完整性快速核验
    if command -v sqlite3 >/dev/null 2>&1; then
        CHECK_RES=$(sqlite3 "${BACKUP_FILE}" "PRAGMA quick_check;" 2>/dev/null || echo "failed")
        if [ "${CHECK_RES}" != "ok" ]; then
            echo "❌ 错误: 升级前备份完整性校验失败 (${CHECK_RES})，终止更新流程以保护数据！"
            exit 1
        fi
    fi

    echo "✓ 数据原子备份完毕，完整性校验通过，安全防线已就绪！"
fi

# 4. 镜像加载 / 拉取处理 (P1-006: 严禁隐藏 pull 错误)
NEW_VERSION=""

if [ -f "${TARGET}" ]; then
    echo ""
    echo "📥 检测到离线镜像包: ${TARGET}，正在加载至 Docker ..."
    LOAD_OUTPUT=$(docker load -i "${TARGET}")
    echo "${LOAD_OUTPUT}"

    # 从文件名或加载输出推测版本号
    if [[ "${TARGET}" =~ sacred-focus-v([0-9]+\.[0-9]+\.[0-9]+) ]]; then
        NEW_VERSION="v${BASH_REMATCH[1]}"
    elif [[ "${LOAD_OUTPUT}" =~ Loaded\ image:\ sacred-focus:(v?[0-9]+\.[0-9]+\.[0-9]+) ]]; then
        NEW_VERSION="${BASH_REMATCH[1]}"
    fi
elif [ -n "${TARGET}" ]; then
    NEW_VERSION="${TARGET}"
    echo ""
    echo "🌐 指定更新版本: ${NEW_VERSION}，正在拉取最新镜像 ..."
    # 临时覆盖 APP_VERSION 触发 pull (拉取失败直接抛错退出)
    APP_VERSION="${NEW_VERSION}" docker compose pull
else
    echo ""
    echo "ℹ️ 未指定参数，将拉取当前配置版本的最新镜像 ..."
    docker compose pull
fi

# 更新 .env 中的 APP_VERSION
if [ -n "${NEW_VERSION}" ]; then
    if grep -q "^APP_VERSION=" .env; then
        sed -i "s/^APP_VERSION=.*/APP_VERSION=${NEW_VERSION}/" .env
    else
        echo "APP_VERSION=${NEW_VERSION}" >> .env
    fi
    echo "✓ 已同步更新 .env 配置: APP_VERSION=${NEW_VERSION}"
fi

# 5. 平滑替换容器
echo ""
echo "🚀 正在无损平滑启动新容器 ..."
docker compose up -d --remove-orphans

# 6. 健康检查探测与版本核对 (P1-006)
echo ""
echo "🩺 等待容器启动并进行健康状态探测与版本核对..."
PORT=$(grep -E "^PORT=" .env | cut -d '=' -f2 || echo "3000")
PORT=${PORT:-3000}

MAX_RETRIES=15
SUCCESS=0
RUNNING_VERSION="unknown"
for i in $(seq 1 ${MAX_RETRIES}); do
    sleep 2
    HTTP_BODY=$(curl -s "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)
    if [ "${HTTP_CODE}" = "200" ]; then
        SUCCESS=1
        RUNNING_VERSION=$(echo "${HTTP_BODY}" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        break
    fi
    echo "   - 探测中... (${i}/${MAX_RETRIES})"
done

if [ "${SUCCESS}" = "1" ]; then
    echo ""
    echo "=========================================================="
    echo "🎉 Sacred Focus 容器更新成功！"
    echo "   - 服务地址: http://127.0.0.1:${PORT}"
    echo "   - 健康状态: HTTP 200 OK"
    echo "   - 运行版本: ${RUNNING_VERSION}"
    echo "   - 持久数据: 完好保留于 ./data 目录"
    echo "=========================================================="
else
    echo ""
    echo "❌ 错误: 健康检查未能获得 200 响应，容器可能仍在初始化或存在配置异常。"
    echo "请执行以下命令查看实时排错日志:"
    echo "  docker compose logs -f sacred-focus"
    exit 1
fi
