#!/usr/bin/env bash
# Sacred Focus SQLite 数据库备份（支持宿主直备与容器内原子热备）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/docker-common.sh"
cd "${SF_ROOT_DIR}"

DATA_DIR="$(sf_host_data_dir)"
BACKUP_DIR="${DATA_DIR}/backup"
mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_TARGET="${BACKUP_DIR}/app_backup_${TIMESTAMP}.db"

sf_log "📦 正在执行 Sacred Focus 数据库原子快照备份..."

if [ -f "${DATA_DIR}/app.db" ]; then
    BACKUP_DONE=0

    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "${DATA_DIR}/app.db" ".backup '${BACKUP_TARGET}'" && BACKUP_DONE=1
        sf_log "✓ 使用宿主 sqlite3 事务引擎生成一致性快照"
    fi

    if [ "${BACKUP_DONE}" -eq 0 ] && sf_compose ps -q sacred-focus >/dev/null 2>&1 && [ -n "$(sf_compose ps -q sacred-focus 2>/dev/null)" ]; then
        sf_compose exec -T sacred-focus node -e "const Database = require('better-sqlite3'); const db = new Database('/app/data/app.db'); db.backup('/app/data/backup/app_backup_${TIMESTAMP}.db');" >/dev/null 2>&1 && BACKUP_DONE=1
        sf_log "✓ 使用容器运行时 better-sqlite3 生成在线热备"
    fi

    if [ "${BACKUP_DONE}" -eq 0 ] && command -v python3 >/dev/null 2>&1; then
        python3 -c "import sqlite3; src = sqlite3.connect('${DATA_DIR}/app.db'); dst = sqlite3.connect('${BACKUP_TARGET}'); src.backup(dst); dst.close(); src.close()" >/dev/null 2>&1 && BACKUP_DONE=1
        sf_log "✓ 使用 Python sqlite3 生成在线热备"
    fi

    if [ "${BACKUP_DONE}" -eq 0 ]; then
        sf_log "⚠️ 缺少在线备份工具链，短暂停歇容器后执行冷备..."
        sf_compose pause sacred-focus >/dev/null 2>&1 || true
        cp "${DATA_DIR}/app.db" "${BACKUP_TARGET}"
        [ -f "${DATA_DIR}/app.db-wal" ] && cp "${DATA_DIR}/app.db-wal" "${BACKUP_DIR}/app_backup_${TIMESTAMP}.db-wal"
        sf_compose unpause sacred-focus >/dev/null 2>&1 || true
    fi

    if command -v sqlite3 >/dev/null 2>&1; then
        CHECK_RES="$(sqlite3 "${BACKUP_TARGET}" "PRAGMA quick_check;" 2>/dev/null || printf 'failed')"
        [ "${CHECK_RES}" = "ok" ] || sf_die "备份完整性快速校验失败：${CHECK_RES}"
    fi

    sf_log "✓ 备份完成：${BACKUP_TARGET}"
    find "${BACKUP_DIR}" -name "app_backup_*.db*" -mtime +14 -delete 2>/dev/null || true
else
    sf_log "ℹ️ 暂未检测到 ${DATA_DIR}/app.db，跳过备份。"
fi
