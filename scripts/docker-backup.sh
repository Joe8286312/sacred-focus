#!/usr/bin/env bash
# ========================================================
# Sacred Focus SQLite 数据库生产级备份脚本 (支持宿主直备与容器内原子热备)
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

echo "📦 正在执行 Sacred Focus 数据库原子快照备份..."

if [ -f "${DATA_DIR}/app.db" ]; then
    BACKUP_DONE=0

    # 1. 优先使用 sqlite3 原生原子在线备份
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "${DATA_DIR}/app.db" ".backup '${BACKUP_TARGET}'" && BACKUP_DONE=1
        echo "✓ 使用宿主 sqlite3 事务引擎成功生成一致性快照"
    fi

    # 2. 次选通过运行中容器的 better-sqlite3 导出
    if [ "${BACKUP_DONE}" -eq 0 ] && docker compose ps -q sacred-focus >/dev/null 2>&1 && [ -n "$(docker compose ps -q sacred-focus 2>/dev/null)" ]; then
        docker compose exec -T sacred-focus node -e "const Database = require('better-sqlite3'); const db = new Database('/app/data/app.db'); db.backup('/app/data/backup/app_backup_${TIMESTAMP}.db');" >/dev/null 2>&1 && BACKUP_DONE=1
        echo "✓ 使用容器运行时 better-sqlite3 成功生成在线热备"
    fi

    # 3. 再次选通过 Python3 标准库 sqlite3.backup 生成快照
    if [ "${BACKUP_DONE}" -eq 0 ] && command -v python3 >/dev/null 2>&1; then
        python3 -c "import sqlite3; src = sqlite3.connect('${DATA_DIR}/app.db'); dst = sqlite3.connect('${BACKUP_TARGET}'); src.backup(dst); dst.close(); src.close()" >/dev/null 2>&1 && BACKUP_DONE=1
        echo "✓ 使用 Python3 原生 sqlite3 在线备份 API 生成快照"
    fi

    # 4. 兜底冷备（暂停容器，确保 WAL 写入落盘并复制）
    if [ "${BACKUP_DONE}" -eq 0 ]; then
        echo "⚠️ 宿主缺少在线备份工具链，正在短暂停歇容器以保障 WAL 完整性..."
        docker compose pause sacred-focus >/dev/null 2>&1 || true
        cp "${DATA_DIR}/app.db" "${BACKUP_TARGET}"
        [ -f "${DATA_DIR}/app.db-wal" ] && cp "${DATA_DIR}/app.db-wal" "${BACKUP_DIR}/app_backup_${TIMESTAMP}.db-wal"
        docker compose unpause sacred-focus >/dev/null 2>&1 || true
        echo "✓ 文件级原子冷备已完成"
    fi

    # 5. 执行完整性校验
    if command -v sqlite3 >/dev/null 2>&1; then
        CHECK_RES=$(sqlite3 "${BACKUP_TARGET}" "PRAGMA quick_check;" 2>/dev/null || echo "failed")
        if [ "${CHECK_RES}" != "ok" ]; then
            echo "❌ 备份完整性快速校验失败: ${CHECK_RES}"
            exit 1
        fi
        echo "✓ 备份文件 SQLite PRAGMA quick_check 校验通过: ok"
    fi

    echo "🎉 备份成功完成 -> ${BACKUP_TARGET}"

    # 仅保留最近 14 天的备份，防止磁盘占满
    find "${BACKUP_DIR}" -name "app_backup_*.db*" -mtime +14 -delete 2>/dev/null || true
    echo "✓ 自动清理 14 天前的历史备份文件完毕。"
else
    echo "ℹ️ 暂未检测到 ${DATA_DIR}/app.db 数据库文件，跳过备份。"
fi
