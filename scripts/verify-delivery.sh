#!/usr/bin/env bash
# 不需要 Docker daemon 的交付静态验收。适用于 CI 与交付包落地后的预检。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

fail() { printf '❌ 交付预检失败：%s\n' "$*" >&2; exit 1; }
require_file() { [ -f "${ROOT_DIR}/$1" ] || fail "缺少 $1"; }
require_text() { grep -q -- "$2" "${ROOT_DIR}/$1" || fail "$1 缺少契约：$2"; }

for file in Dockerfile .dockerignore docker-compose.yml docker-compose.nginx.yml .env.production.example scripts/docker-update.sh scripts/lib/update-transaction.sh scripts/docker-backup.sh scripts/README.md; do
    require_file "${file}"
done

require_text docker-compose.yml '127.0.0.1:'
require_text docker-compose.yml 'JWT_SECRET:?Set JWT_SECRET'
require_text docker-compose.yml 'ADMIN_PASSWORD:?Set ADMIN_PASSWORD'
require_text docker-compose.yml 'APP_MEMORY_LIMIT:-512m'
require_text docker-compose.yml 'NODE_HEAP_LIMIT_MB:-384'
require_text docker-compose.nginx.yml 'NGINX_SSL_DIR:?Set NGINX_SSL_DIR'
require_text docker-compose.nginx.yml 'TRUST_PROXY: "1"'
require_text docker-compose.nginx.yml 'NGINX_MEMORY_LIMIT:-128m'
require_text .dockerignore '.env.*'
require_text .dockerignore 'release'
require_text Dockerfile 'USER node'
require_text Dockerfile 'HEALTHCHECK'
require_text scripts/docker-update.sh 'sf_rollback_update'
require_text scripts/docker-update.sh 'sf_backup_before_update'
require_text scripts/lib/update-transaction.sh 'sf_restore_app_version'
require_text scripts/lib/update-transaction.sh 'sf_wait_for_health'
require_text scripts/README.md 'docker-compose.nginx.yml'
require_text scripts/README.md 'config --quiet'
require_text scripts/README.md './scripts/docker-backup.sh'
require_text scripts/README.md './scripts/docker-update.sh'

printf '✓ 交付静态预检通过；下一步可执行 Compose/Nginx 真实环境验收。\n'
