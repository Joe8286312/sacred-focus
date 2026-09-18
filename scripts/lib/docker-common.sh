#!/usr/bin/env bash
# 交付脚本共享契约：路径、Docker/Compose 前置检查、镜像标签和数据目录解析。

SF_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SF_ROOT_DIR="$(cd "${SF_COMMON_DIR}/../.." && pwd)"

sf_log() { printf '%s\n' "$*"; }

sf_die() {
    sf_log "❌ 错误: $*" >&2
    exit 1
}

sf_require_command() {
    command -v "$1" >/dev/null 2>&1 || sf_die "未检测到 $1 命令。"
}

sf_require_docker() {
    sf_require_command docker
    docker info >/dev/null 2>&1 || sf_die "Docker daemon 不可用，请确认 Docker Desktop 或 Docker 服务已启动。"
}

sf_require_compose() {
    sf_require_docker
    docker compose version >/dev/null 2>&1 || sf_die "未检测到 docker compose 插件。"
}

sf_compose() { docker compose "$@"; }

sf_require_semver() {
    [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || sf_die "版本必须是 x.y.z 形式，收到：$1"
}

sf_image_tag() { printf 'sacred-focus:v%s\n' "$1"; }

sf_read_env_value() {
    local env_file="$1"
    local key="$2"
    local line
    [ -f "${env_file}" ] || return 1
    line="$(grep -E "^[[:space:]]*${key}=" "${env_file}" | tail -n 1 || true)"
    [ -n "${line}" ] || return 1
    line="${line#*=}"
    line="${line%$'\r'}"
    line="${line#\"}"
    line="${line%\"}"
    printf '%s\n' "${line}"
}

sf_host_data_dir() {
    local configured_path
    configured_path="$(sf_read_env_value "${SF_ROOT_DIR}/.env" HOST_DATA_DIR || true)"
    configured_path="${configured_path:-./data}"
    if [[ "${configured_path}" = /* ]]; then
        printf '%s\n' "${configured_path}"
    else
        printf '%s\n' "${SF_ROOT_DIR}/${configured_path#./}"
    fi
}
