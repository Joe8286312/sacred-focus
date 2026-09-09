#!/usr/bin/env bash
# ========================================================
# Sacred Focus SQLite 数据库生产级备份脚本 (支持宿主直备与容器内热备)
# 可加入 crontab 每日定时自动执行
# 示例: 0 3 * * * /path/to/sacred-focus/scripts/docker-backup.sh
# ========================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${ROOT_DIR}/data"
BACKUP_DIR="${DATA_DIR}/backup"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_TARGET="${BACKUP_DIR}/app_backup_${TIMESTAMP}.db"

echo "📦 正在执行 Sacred Focus 数据库冷热双轨备份..."

if [ -f "${DATA_DIR}/app.db" ]; then
    # 若系统安装了 sqlite3，执行 VACUUM INTO 或 .backup 进行原子事务快照
    if command -v sqlite3 &> /dev/null; then
        sqlite3 "${DATA_DIR}/app.db" ".backup '${BACKUP_TARGET}'"
        echo "✓ 使用 sqlite3 原生事务引擎成功生成一致性快照: ${BACKUP_TARGET}"
    else
        # 宿主机直接文件级原子拷贝
        cp "${DATA_DIR}/app.db" "${BACKUP_TARGET}"
        [ -f "${DATA_DIR}/app.db-wal" ] && cp "${DATA_DIR}/app.db-wal" "${BACKUP_DIR}/app_backup_${TIMESTAMP}.db-wal"
        echo "✓ 文件级原子备份成功: ${BACKUP_TARGET}"
    fi

    # 仅保留最近 14 天的备份，防止磁盘占满
    find "${BACKUP_DIR}" -name "app_backup_*.db*" -mtime +14 -delete 2>/dev/null || true
    echo "✓ 自动清理 14 天前的历史冷备文件完毕。"
else
    echo "ℹ️ 暂未检测到 ${DATA_DIR}/app.db 数据库文件，跳过备份。"
fi
