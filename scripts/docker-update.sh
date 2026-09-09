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

# 2. 检查 .env 配置文件
if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        cp .env.production .env
        echo "✓ 自动复制 .env.production 为 .env"
    elif [ -f ".env.production.example" ]; then
        cp .env.production.example .env
        echo "⚠️ 检测到缺少 .env 文件，已自动基于 .env.production.example 初始化，请核对密钥配置！"
    else
        echo "❌ 错误: 未找到 .env 配置文件。"
        exit 1
    fi
fi

# 3. 核心资产自动前置热备（零风险兜底）
DATA_DIR="./data"
if [ -f "${DATA_DIR}/app.db" ]; then
    BACKUP_DIR="${DATA_DIR}/backup"
    mkdir -p "${BACKUP_DIR}"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="${BACKUP_DIR}/app_pre_update_${TIMESTAMP}.db"
    echo "🛡️ 正在执行升级前数据库原子冷备 -> ${BACKUP_FILE} ..."
    cp "${DATA_DIR}/app.db" "${BACKUP_FILE}"
    # 若存在 WAL 临时文件一并备份
    [ -f "${DATA_DIR}/app.db-wal" ] && cp "${DATA_DIR}/app.db-wal" "${BACKUP_DIR}/app_pre_update_${TIMESTAMP}.db-wal"
    echo "✓ 数据备份完毕，安全防线已就绪！"
fi

# 4. 镜像加载 / 拉取处理
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
    # 临时覆盖 APP_VERSION 触发 pull
    APP_VERSION="${NEW_VERSION}" docker compose pull || true
else
    echo ""
    echo "ℹ️ 未指定参数，将拉取当前配置版本的最新镜像 ..."
    docker compose pull || true
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

# 6. 健康检查探测
echo ""
echo "🩺 等待容器启动并进行健康状态探测..."
PORT=$(grep -E "^PORT=" .env | cut -d '=' -f2 || echo "3000")
PORT=${PORT:-3000}

MAX_RETRIES=12
SUCCESS=0
for i in $(seq 1 ${MAX_RETRIES}); do
    sleep 2
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || true)
    if [ "${HTTP_CODE}" = "200" ]; then
        SUCCESS=1
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
    echo "   - 持久数据: 完好保留于 ./data 目录"
    echo "=========================================================="
else
    echo ""
    echo "⚠️ 警告: 健康检查未能获得 200 响应，容器可能仍在初始化或存在配置异常。"
    echo "请执行以下命令查看实时排错日志:"
    echo "  docker compose logs -f sacred-focus"
fi
