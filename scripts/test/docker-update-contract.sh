#!/usr/bin/env bash
# 无 Docker daemon 合约测试：使用替身命令验证更新事务的故障语义。
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_ROOT="$(mktemp -d)"
trap 'rm -rf "${WORK_ROOT}"' EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
assert_contains() { grep -q -- "$2" "$1" || fail "未找到 $2"; }
assert_not_contains() { ! grep -q -- "$2" "$1" || fail "不应出现 $2"; }
assert_version() { [ "$(grep '^APP_VERSION=' "$1/.env")" = "APP_VERSION=$2" ] || fail "APP_VERSION 不为 $2"; }

make_project() {
    local name="$1"
    local project="${WORK_ROOT}/${name}/project"
    local fake="${WORK_ROOT}/${name}/fake"
    mkdir -p "${project}" "${fake}"
    cp -R "${SCRIPT_ROOT}" "${project}/scripts"
    printf 'APP_VERSION=v1.0.0\nPORT=3000\nHOST_DATA_DIR=./data\n' > "${project}/.env"
    printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail' 'printf "%s\n" "$*" >> "$FAKE_CALL_LOG"' 'case "$1 ${2:-}" in' '  "info ") exit 0 ;;' '  "compose version") exit 0 ;;' '  "compose pull") [ "${FAKE_PULL_FAIL:-0}" = "1" ] && exit 1; exit 0 ;;' '  "compose ps") exit 1 ;;' '  "compose up") count=0; [ -f "$FAKE_UP_COUNT" ] && count=$(cat "$FAKE_UP_COUNT"); count=$((count + 1)); printf "%s" "$count" > "$FAKE_UP_COUNT"; [ "${FAKE_UP_FAIL_ON:-0}" = "$count" ] && exit 1; exit 0 ;;' '  "compose logs") printf "failed-container-evidence\n" >&2; exit 0 ;;' '  "compose pause"|"compose unpause") exit 0 ;;' '  *) exit 0 ;;' 'esac' > "${fake}/docker"
    printf '%s\n' '#!/usr/bin/env bash' 'count=0; [ -f "$FAKE_UP_COUNT" ] && count=$(cat "$FAKE_UP_COUNT")' 'if [ "${FAKE_HEALTH_RECOVER_ON_UP:-0}" -gt 0 ] && [ "${FAKE_HEALTH_RECOVER_ON_UP}" -le "$count" ]; then printf 200; elif [ "${FAKE_HEALTH_CODE:-200}" = "200" ]; then printf 200; else printf 500; fi' > "${fake}/curl"
    printf '%s\n' '#!/usr/bin/env bash' 'exit 1' > "${fake}/sqlite3"
    printf '%s\n' '#!/usr/bin/env bash' 'exit 1' > "${fake}/python3"
    printf '%s\n' '#!/usr/bin/env bash' 'exit 1' > "${fake}/cp"
    chmod +x "${fake}"/*
    printf '%s\n' "${project}|${fake}"
}

run_update() {
    local project="$1" fake="$2"
    shift 2
    PATH="${fake}:${PATH}" FAKE_CALL_LOG="${project}/calls.log" FAKE_UP_COUNT="${project}/up-count" SACRED_FOCUS_HEALTH_RETRIES=1 SACRED_FOCUS_HEALTH_INTERVAL_SECONDS=0 "$@" "${project}/scripts/docker-update.sh" v1.1.0
}

IFS='|' read -r project fake <<< "$(make_project success)"
run_update "${project}" "${fake}" env FAKE_HEALTH_CODE=200
assert_version "${project}" v1.1.0
assert_contains "${project}/calls.log" 'compose pull'
[ "$(grep -c 'compose up' "${project}/calls.log")" -eq 1 ] || fail '成功路径不应回滚'

IFS='|' read -r project fake <<< "$(make_project pull-failure)"
if run_update "${project}" "${fake}" env FAKE_PULL_FAIL=1; then fail '拉取失败应退出'; fi
assert_version "${project}" v1.0.0
assert_not_contains "${project}/calls.log" 'compose up'

IFS='|' read -r project fake <<< "$(make_project health-failure)"
if run_update "${project}" "${fake}" env FAKE_HEALTH_CODE=500 FAKE_HEALTH_RECOVER_ON_UP=2; then fail '健康失败应退出'; fi
assert_version "${project}" v1.0.0
[ "$(grep -c 'compose up' "${project}/calls.log")" -eq 2 ] || fail '健康失败应重启旧容器'
assert_contains "${project}/calls.log" 'compose logs'

IFS='|' read -r project fake <<< "$(make_project rollback-failure)"
set +e
run_update "${project}" "${fake}" env FAKE_HEALTH_CODE=500 FAKE_UP_FAIL_ON=2
status=$?
set -e
[ "${status}" -eq 2 ] || fail '回滚启动失败必须以状态码 2 退出'
assert_version "${project}" v1.0.0

IFS='|' read -r project fake <<< "$(make_project backup-failure)"
mkdir -p "${project}/data"
printf 'original-database' > "${project}/data/app.db"
if run_update "${project}" "${fake}" env FAKE_HEALTH_CODE=200; then fail '备份失败应退出'; fi
assert_version "${project}" v1.0.0
[ "$(cat "${project}/data/app.db")" = 'original-database' ] || fail '备份失败不得修改数据库'
assert_not_contains "${project}/calls.log" 'compose pull'
assert_contains "${project}/calls.log" 'compose pause'
assert_contains "${project}/calls.log" 'compose unpause'

printf 'PASS: docker update transactional contract\n'
