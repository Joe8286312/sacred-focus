#!/usr/bin/env bash
# No Docker daemon: lock full-account cold backup and pause failure behavior.
set -euo pipefail
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_ROOT="$(mktemp -d)"
trap 'rm -rf -- "${WORK_ROOT}"' EXIT
source "${SCRIPT_ROOT}/lib/docker-common.sh"
source "${SCRIPT_ROOT}/lib/database-backup.sh"
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

sf_compose() {
    printf '%s\n' "$*" >> "${WORK_ROOT}/calls"
    case "$1" in
        pause) [ "${PAUSE_FAIL:-0}" -eq 0 ] ;;
        unpause) [ "${UNPAUSE_FAIL:-0}" -eq 0 ] ;;
        ps) return 1 ;;
        *) return 0 ;;
    esac
}
sqlite3() { printf 'ok\n'; }
python3() { return "${PYTHON_STATUS:-1}"; }
make_data() {
    local directory="$1"
    mkdir -p "${directory}/backup" "${directory}/accounts/public" "${directory}/accounts/12345678-1234-4234-8234-123456789abc"
    printf 'administrator' > "${directory}/app.db"
    printf 'administrator-wal' > "${directory}/app.db-wal"
    printf 'public' > "${directory}/accounts/public/app.db"
    printf 'friend' > "${directory}/accounts/12345678-1234-4234-8234-123456789abc/app.db"
}
filename='app_backup_20261014_120000.db'

make_data "${WORK_ROOT}/success"
sf_backup_databases "${WORK_ROOT}/success" "${filename}" || fail 'cold backup should succeed after successful pause'
[ "$(cat "${WORK_ROOT}/success/backup/${filename}")" = 'administrator' ] || fail 'administrator missing'
[ "$(cat "${WORK_ROOT}/success/backup/${filename}-wal")" = 'administrator-wal' ] || fail 'WAL missing'
[ "$(cat "${WORK_ROOT}/success/backup/${filename%.db}_accounts/public/app.db")" = 'public' ] || fail 'public missing'
[ "$(cat "${WORK_ROOT}/success/backup/${filename%.db}_accounts/12345678-1234-4234-8234-123456789abc/app.db")" = 'friend' ] || fail 'friend missing'
[ -f "${WORK_ROOT}/success/backup/${filename}.manifest.json" ] || fail 'manifest missing'
grep -q '^pause sacred-focus$' "${WORK_ROOT}/calls" || fail 'pause missing'
grep -q '^unpause sacred-focus$' "${WORK_ROOT}/calls" || fail 'unpause missing'

make_data "${WORK_ROOT}/pause-failure"
if PAUSE_FAIL=1 sf_backup_databases "${WORK_ROOT}/pause-failure" "${filename}"; then fail 'pause failure must abort'; fi
[ ! -f "${WORK_ROOT}/pause-failure/backup/${filename}" ] || fail 'failed pause published a backup'

make_data "${WORK_ROOT}/unpause-failure"
if UNPAUSE_FAIL=1 sf_backup_databases "${WORK_ROOT}/unpause-failure" "${filename}"; then fail 'unpause failure must abort'; fi
[ ! -f "${WORK_ROOT}/unpause-failure/backup/${filename}" ] || fail 'failed unpause published a backup'

make_data "${WORK_ROOT}/online-source-failure"
: > "${WORK_ROOT}/calls"
if PYTHON_STATUS=2 sf_backup_databases "${WORK_ROOT}/online-source-failure" "${filename}"; then fail 'online snapshot failure must abort'; fi
! grep -q '^pause ' "${WORK_ROOT}/calls" || fail 'corrupt online snapshot must not fall back to unchecked cold copy'

printf 'PASS: full-account backup contract\n'
