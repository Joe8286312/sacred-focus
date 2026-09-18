#!/usr/bin/env bash
# Sacred Focus Docker 镜像打包（Linux / macOS）。
# 用法：./scripts/docker-pack.sh [x.y.z，默认 1.0.0] [可选仓库前缀]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/docker-common.sh"

VERSION="${1:-1.0.0}"
REGISTRY="${2:-}"
OUTPUT_DIR="${OUTPUT_DIR:-${SF_ROOT_DIR}/release}"
VCS_REF="${VCS_REF:-$(git -C "${SF_ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || printf 'unknown')}"

sf_require_semver "${VERSION}"
sf_require_docker
cd "${SF_ROOT_DIR}"

IMAGE_TAG="$(sf_image_tag "${VERSION}")"
LATEST_TAG="sacred-focus:latest"
TAR_FILE="${OUTPUT_DIR}/sacred-focus-v${VERSION}.tar"

sf_log "📦 Sacred Focus Docker 镜像封装工具 (${IMAGE_TAG})"
sf_log "🚀 开始多阶段构建镜像 [${IMAGE_TAG}] ..."
docker build \
    --build-arg "APP_VERSION=v${VERSION}" \
    --build-arg "VCS_REF=${VCS_REF}" \
    -t "${IMAGE_TAG}" \
    -t "${LATEST_TAG}" \
    -f Dockerfile .
sf_log "✓ 镜像构建成功"

if [ -n "${REGISTRY}" ]; then
    REMOTE_TAG="${REGISTRY}/${IMAGE_TAG}"
    REMOTE_LATEST="${REGISTRY}/${LATEST_TAG}"
    sf_log "📤 推送镜像：${REMOTE_TAG}"
    docker tag "${IMAGE_TAG}" "${REMOTE_TAG}"
    docker tag "${LATEST_TAG}" "${REMOTE_LATEST}"
    docker push "${REMOTE_TAG}"
    docker push "${REMOTE_LATEST}"
fi

mkdir -p "${OUTPUT_DIR}"
sf_log "💾 导出离线镜像包：${TAR_FILE}"
docker save -o "${TAR_FILE}" "${IMAGE_TAG}" "${LATEST_TAG}"
test -s "${TAR_FILE}" || sf_die "离线镜像包未生成或为空。"

sf_log "✓ 打包完成：${TAR_FILE}"
sf_log "👉 服务器更新：./scripts/docker-update.sh ${TAR_FILE}"
