#!/usr/bin/env bash
# 更新事务辅助：只处理版本切换、备份、健康检查与回滚，不包含镜像获取策略。

sf_normalize_app_version() {
    local version="$1"
    if [[ "${version}" =~ ^v?([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
        printf 'v%s\n' "${BASH_REMATCH[1]}"
    else
        sf_die "镜像版本必须是 vX.Y.Z 或 X.Y.Z，收到：${version}"
    fi
}

sf_backup_before_update() {
    local data_dir="$1"
    local backup_dir backup_file timestamp backup_done=0 paused=0 check_result

    [ -f "${data_dir}/app.db" ] || return 0

    backup_dir="${data_dir}/backup"
    mkdir -p "${backup_dir}"
    timestamp="$(date +%Y%m%d_%H%M%S)"
    backup_file="${backup_dir}/app_pre_update_${timestamp}.db"
    sf_log "🛡️ 正在执行升级前数据库原子热备 -> ${backup_file} ..."

    if command -v sqlite3 >/dev/null 2>&1; then
        if sqlite3 "${data_dir}/app.db" ".backup '${backup_file}'"; then
            backup_done=1
        fi
    fi

    if [ "${backup_done}" -eq 0 ] && sf_compose ps -q sacred-focus >/dev/null 2>&1 && [ -n "$(sf_compose ps -q sacred-focus 2>/dev/null)" ]; then
        sf_log "   - 使用容器运行时 better-sqlite3 执行在线热备..."
        if sf_compose exec -T sacred-focus node -e "const Database = require('better-sqlite3'); const db = new Database('/app/data/app.db'); db.backup('/app/data/backup/app_pre_update_${timestamp}.db');" >/dev/null 2>&1; then
            backup_done=1
        fi
    fi

    if [ "${backup_done}" -eq 0 ] && command -v python3 >/dev/null 2>&1; then
        sf_log "   - 使用 Python3 原生 sqlite3 在线备份 API..."
        if python3 -c "import sqlite3; src = sqlite3.connect('${data_dir}/app.db'); dst = sqlite3.connect('${backup_file}'); src.backup(dst); dst.close(); src.close()" >/dev/null 2>&1; then
            backup_done=1
        fi
    fi

    if [ "${backup_done}" -eq 0 ]; then
        sf_log "⚠️ 警告: 在线热备不可用，正在暂停容器后进行快照冷备..."
        if sf_compose pause sacred-focus >/dev/null 2>&1; then
            paused=1
        fi
        if ! cp "${data_dir}/app.db" "${backup_file}"; then
            [ "${paused}" -eq 0 ] || sf_compose unpause sacred-focus >/dev/null 2>&1 || true
            return 1
        fi
        if [ -f "${data_dir}/app.db-wal" ] && ! cp "${data_dir}/app.db-wal" "${backup_dir}/app_pre_update_${timestamp}.db-wal"; then
            [ "${paused}" -eq 0 ] || sf_compose unpause sacred-focus >/dev/null 2>&1 || true
            return 1
        fi
        [ "${paused}" -eq 0 ] || sf_compose unpause sacred-focus >/dev/null 2>&1 || true
        backup_done=1
    fi

    [ "${backup_done}" -eq 1 ] || return 1
    if command -v sqlite3 >/dev/null 2>&1; then
        check_result="$(sqlite3 "${backup_file}" "PRAGMA quick_check;" 2>/dev/null || true)"
        [ "${check_result}" = "ok" ] || return 1
    fi
    sf_log "✓ 数据原子备份完毕，完整性校验通过。"
}

sf_wait_for_health() {
    local port="$1"
    local retries="${SACRED_FOCUS_HEALTH_RETRIES:-15}"
    local interval="${SACRED_FOCUS_HEALTH_INTERVAL_SECONDS:-2}"
    local attempt http_code

    for attempt in $(seq 1 "${retries}"); do
        sleep "${interval}"
        http_code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/api/health" 2>/dev/null || true)"
        [ "${http_code}" = "200" ] && return 0
        sf_log "   - 探测中... (${attempt}/${retries})"
    done
    return 1
}

sf_restore_app_version() {
    local env_file="$1"
    local had_previous="$2"
    local previous_version="$3"

    if [ "${had_previous}" = "1" ]; then
        sf_set_env_value "${env_file}" APP_VERSION "${previous_version}"
    else
        sf_remove_env_value "${env_file}" APP_VERSION
    fi
}

sf_rollback_update() {
    local env_file="$1"
    local had_previous="$2"
    local previous_version="$3"
    local port="$4"

    sf_log "↩️ 正在恢复更新前 APP_VERSION 与容器..."
    sf_restore_app_version "${env_file}" "${had_previous}" "${previous_version}"
    if ! sf_compose up -d --remove-orphans; then
        sf_log "❌ 回滚失败：旧容器无法重新启动。"
        return 1
    fi
    if ! sf_wait_for_health "${port}"; then
        sf_log "❌ 回滚失败：旧容器未通过健康检查。"
        return 1
    fi
    sf_log "✓ 已恢复至更新前版本：${previous_version:-未设置 APP_VERSION}"
}
