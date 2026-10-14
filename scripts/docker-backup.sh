#!/usr/bin/env bash
# Sacred Focus SQLite 数据库备份（支持宿主直备与容器内原子热备）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/docker-common.sh"
source "${SCRIPT_DIR}/lib/database-backup.sh"
cd "${SF_ROOT_DIR}"

DATA_DIR="$(sf_host_data_dir)"
BACKUP_DIR="${DATA_DIR}/backup"
mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_TARGET="${BACKUP_DIR}/app_backup_${TIMESTAMP}.db"

sf_log "📦 正在执行 Sacred Focus 数据库原子快照备份..."

if [ -f "${DATA_DIR}/app.db" ]; then
    sf_backup_databases "${DATA_DIR}" "$(basename "${BACKUP_TARGET}")" || sf_die '全账号数据库备份失败，未生成完整备份。'

    sf_log "✓ 备份完成：${BACKUP_TARGET}"
    # 保留两周；账号目录及清单与同名管理员快照一并清理。
    while IFS= read -r -d '' old_backup; do
        old_name="$(basename "${old_backup}")"
        [[ "${old_name}" =~ ^app_backup_[0-9]{8}_[0-9]{6}\.db$ ]] || continue
        rm -f -- "${old_backup}" "${old_backup}-wal" "${old_backup}-shm" "${old_backup}.manifest.json"
        rm -rf -- "${BACKUP_DIR}/${old_name%.db}_accounts"
    done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name "app_backup_*.db" -mtime +14 -print0)
else
    sf_log "ℹ️ 暂未检测到 ${DATA_DIR}/app.db，跳过备份。"
fi
