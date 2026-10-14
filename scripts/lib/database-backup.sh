#!/usr/bin/env bash
# 全账号备份共享入口：每个 SQLite 使用在线快照；无运行时时仅在容器暂停成功后冷备。
SF_BACKUP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sf_cold_backup_databases() (
    local data_dir="$1" filename="$2" output_dir="$1/backup" stage accounts_name source account_id account_folder status=0 target check_result paused=0
    local -a databases=("app.db") targets=("$2") account_ids=("admin")
    accounts_name="${filename%.db}_accounts"
    stage="$(mktemp -d "${output_dir}/.${filename}.tmp.XXXXXX")" || return 1
    trap 'if [ "${paused}" -eq 1 ]; then sf_compose unpause sacred-focus >/dev/null 2>&1 || true; fi; rm -rf -- "${stage}"' EXIT
    trap 'exit 1' INT TERM
    sf_log "⚠️ 在线备份不可用，暂停容器后备份全部账号数据库..."
    if ! sf_compose pause sacred-focus >/dev/null 2>&1; then
        rm -rf -- "${stage}"
        sf_log "❌ 容器暂停失败，已拒绝不一致的冷备。" >&2
        return 1
    fi
    paused=1
    if [ -L "${data_dir}/accounts" ] || [ -L "${data_dir}/app.db" ]; then status=1; fi
    if [ -d "${data_dir}/accounts" ] && ! find "${data_dir}/accounts" -mindepth 1 -maxdepth 1 -print0 > "${stage}/sources"; then status=1; fi
    [ -f "${stage}/sources" ] || : > "${stage}/sources"
    while IFS= read -r -d '' account_folder; do
        source="${account_folder}/app.db"
        if [ ! -e "${source}" ] && [ ! -L "${source}" ]; then continue; fi
        account_id="$(basename "${account_folder}")"
        if [[ ! "${account_id}" =~ ^(public|[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})$ ]] || [ -L "${source}" ] || [ -L "$(dirname "${source}")" ]; then
            status=1
            break
        fi
        databases+=("accounts/${account_id}/app.db")
        targets+=("${accounts_name}/${account_id}/app.db")
        account_ids+=("${account_id}")
    done < "${stage}/sources"
    local index
    for index in "${!databases[@]}"; do
        [ "${status}" -eq 0 ] || break
        source="${data_dir}/${databases[index]}"
        target="${stage}/${targets[index]}"
        if ! mkdir -p "$(dirname "${target}")" || ! cp -- "${source}" "${target}" || ! chmod 600 "${target}"; then status=1; break; fi
        if [ -f "${source}-wal" ] && { ! cp -- "${source}-wal" "${target}-wal" || ! chmod 600 "${target}-wal"; }; then status=1; break; fi
    done
    # 即使复制失败也必须尝试恢复服务；恢复失败本身也判定整次备份失败。
    if sf_compose unpause sacred-focus >/dev/null 2>&1; then paused=0; else status=1; fi
    if [ "${status}" -eq 0 ] && command -v sqlite3 >/dev/null 2>&1; then
        for target in "${targets[@]}"; do
            check_result="$(sqlite3 "${stage}/${target}" 'PRAGMA quick_check;' 2>/dev/null || true)"
            if [ "${check_result}" != 'ok' ]; then status=1; break; fi
        done
    fi
    if [ "${status}" -eq 0 ]; then
        {
            printf '{"formatVersion":1,"createdAt":"%s","consistency":"paused-copy-with-wal","method":"cold-copy","databases":[' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
            for index in "${!databases[@]}"; do
                [ "${index}" -eq 0 ] || printf ','
                printf '{"accountId":"%s","source":"%s","snapshot":"%s"}' "${account_ids[index]}" "${databases[index]}" "${targets[index]}"
            done
            printf ']}\n'
        } > "${stage}/${filename}.manifest.json" || status=1
    fi
    if [ "${status}" -eq 0 ]; then
        if [ -d "${stage}/${accounts_name}" ]; then mv -- "${stage}/${accounts_name}" "${output_dir}/${accounts_name}" || status=1; fi
        mv -- "${stage}/${filename}.manifest.json" "${output_dir}/${filename}.manifest.json" || status=1
        if [ -f "${stage}/${filename}-wal" ]; then mv -- "${stage}/${filename}-wal" "${output_dir}/${filename}-wal" || status=1; fi
        [ "${status}" -ne 0 ] || mv -- "${stage}/${filename}" "${output_dir}/${filename}" || status=1
    fi
    rm -rf -- "${stage}"
    return "${status}"
)

sf_backup_databases() {
    local data_dir="$1" filename="$2" container_id result
    [[ "${filename}" =~ ^app_(backup|pre_update)_[0-9]{8}_[0-9]{6}\.db$ ]] || return 1
    mkdir -p "${data_dir}/backup" || return 1
    if [ -e "${data_dir}/backup/${filename}" ] || [ -e "${data_dir}/backup/${filename%.db}_accounts" ] || [ -e "${data_dir}/backup/${filename}.manifest.json" ]; then
        sf_log '❌ 备份目标已存在，请稍后重试。' >&2
        return 1
    fi
    if command -v python3 >/dev/null 2>&1; then
        if python3 "${SF_BACKUP_LIB_DIR}/backup-databases.py" "${data_dir}" "${filename}"; then
            sf_log '✓ 使用 Python SQLite 在线快照备份全部账号并校验完整性。'
            return 0
        else
            result=$?
            [ "${result}" -ne 2 ] || return 1
        fi
    fi
    container_id="$(sf_compose ps -q sacred-focus 2>/dev/null || true)"
    if [ -n "${container_id}" ]; then
        if sf_compose exec -T --user 0 sacred-focus node - /app/data "${filename}" < "${SF_BACKUP_LIB_DIR}/backup-databases.cjs"; then
            sf_log '✓ 使用容器 SQLite 在线快照备份全部账号并校验完整性。'
            return 0
        else
            result=$?
            [ "${result}" -ne 2 ] || return 1
        fi
    fi
    sf_cold_backup_databases "${data_dir}" "${filename}"
}
