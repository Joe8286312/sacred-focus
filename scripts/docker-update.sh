#!/usr/bin/env bash
# Sacred Focus Docker 更新事务：备份 -> 获取镜像 -> 切换 -> 健康检查 -> 必要时回滚。
# 用法：./scripts/docker-update.sh [sacred-focus-vX.Y.Z.tar|vX.Y.Z]

set -euo pipefail

TARGET="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/docker-common.sh"
source "${SCRIPT_DIR}/lib/update-transaction.sh"

cd "${SF_ROOT_DIR}"
sf_require_compose

ENV_FILE="${SF_ROOT_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
    if [ -f "${SF_ROOT_DIR}/.env.production" ]; then
        cp "${SF_ROOT_DIR}/.env.production" "${ENV_FILE}"
        sf_log "✓ 自动复制 .env.production 为 .env"
    else
        sf_die "未检测到生产环境 .env 配置文件；请先配置真实密钥。"
    fi
fi

PREVIOUS_APP_VERSION="$(sf_read_env_value "${ENV_FILE}" APP_VERSION || true)"
HAD_PREVIOUS_APP_VERSION=0
[ -z "${PREVIOUS_APP_VERSION}" ] || HAD_PREVIOUS_APP_VERSION=1
PORT="$(sf_read_env_value "${ENV_FILE}" PORT || true)"
PORT="${PORT:-3000}"

sf_log "🔄 Sacred Focus 生产环境 Docker 更新程序"
if ! sf_backup_before_update "$(sf_host_data_dir)"; then
    sf_die "升级前备份或完整性校验失败，未拉取镜像、未修改配置、未替换容器。"
fi

NEW_VERSION=""
if [ -f "${TARGET}" ]; then
    sf_log "📥 检测到离线镜像包：${TARGET}，正在加载至 Docker..."
    LOAD_OUTPUT="$(docker load -i "${TARGET}")" || sf_die "离线镜像包加载失败，当前服务未变更。"
    sf_log "${LOAD_OUTPUT}"
    if [[ "${TARGET}" =~ sacred-focus-v([0-9]+\.[0-9]+\.[0-9]+) ]]; then
        NEW_VERSION="v${BASH_REMATCH[1]}"
    elif [[ "${LOAD_OUTPUT}" =~ Loaded\ image:\ sacred-focus:(v?[0-9]+\.[0-9]+\.[0-9]+) ]]; then
        NEW_VERSION="$(sf_normalize_app_version "${BASH_REMATCH[1]}")"
    fi
elif [ -n "${TARGET}" ]; then
    NEW_VERSION="$(sf_normalize_app_version "${TARGET}")"
    sf_log "🌐 指定更新版本：${NEW_VERSION}，正在拉取镜像..."
    APP_VERSION="${NEW_VERSION}" sf_compose pull || sf_die "镜像拉取失败，当前服务未变更。"
else
    sf_log "ℹ️ 未指定参数，将拉取当前配置版本的最新镜像..."
    sf_compose pull || sf_die "镜像拉取失败，当前服务未变更。"
fi

if [ -n "${NEW_VERSION}" ]; then
    sf_set_env_value "${ENV_FILE}" APP_VERSION "${NEW_VERSION}"
    sf_log "✓ 已切换 APP_VERSION=${NEW_VERSION}，正在启动新容器..."
else
    sf_log "🚀 正在按当前 APP_VERSION 启动容器..."
fi

if ! sf_compose up -d --remove-orphans; then
    sf_log "❌ 新容器启动失败，保留容器日志并执行回滚。"
    sf_compose logs --tail=100 sacred-focus >&2 || true
    if sf_rollback_update "${ENV_FILE}" "${HAD_PREVIOUS_APP_VERSION}" "${PREVIOUS_APP_VERSION}" "${PORT}"; then
        exit 1
    fi
    exit 2
fi

sf_log "🩺 正在进行健康检查..."
if ! sf_wait_for_health "${PORT}"; then
    sf_log "❌ 新容器未通过健康检查，保留容器日志并执行回滚。"
    sf_compose logs --tail=100 sacred-focus >&2 || true
    if sf_rollback_update "${ENV_FILE}" "${HAD_PREVIOUS_APP_VERSION}" "${PREVIOUS_APP_VERSION}" "${PORT}"; then
        exit 1
    fi
    exit 2
fi

sf_log "🎉 Sacred Focus 容器更新成功：${NEW_VERSION:-${PREVIOUS_APP_VERSION:-当前配置版本}}"
