#!/usr/bin/env bash
# ========================================================
# Sacred Focus Docker 一键打包与版本化封装脚本 (Linux / macOS)
# 用法:
#   ./scripts/docker-pack.sh [版本号, 默认 1.0.0] [可选仓库前缀]
# 示例:
#   ./scripts/docker-pack.sh 1.0.0
#   ./scripts/docker-pack.sh 1.1.0 registry.cn-hangzhou.aliyuncs.com/myorg
# ========================================================

set -e

VERSION="${1:-1.0.0}"
REGISTRY="${2:-}"
OUTPUT_DIR="./release"
IMAGE_TAG="sacred-focus:v${VERSION}"
LATEST_TAG="sacred-focus:latest"

echo "=========================================================="
echo "📦 Sacred Focus Docker 镜像封装工具 (v${VERSION})"
echo "=========================================================="

# 1. 检查 Docker 环境
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未检测到 docker 命令，请先安装并启动 Docker 服务。"
    exit 1
fi

# 2. 执行多阶段构建
echo ""
echo "🚀 开始多阶段构建镜像 [${IMAGE_TAG}] ..."
docker build -t "${IMAGE_TAG}" -t "${LATEST_TAG}" -f Dockerfile .
echo "✓ 镜像构建成功！"

# 3. 推送至远程仓库（可选）
if [ -n "${REGISTRY}" ]; then
    REMOTE_TAG="${REGISTRY}/sacred-focus:v${VERSION}"
    REMOTE_LATEST="${REGISTRY}/sacred-focus:latest"
    echo ""
    echo "📤 推送至远程镜像仓库: ${REMOTE_TAG} ..."
    docker tag "${IMAGE_TAG}" "${REMOTE_TAG}"
    docker tag "${LATEST_TAG}" "${REMOTE_LATEST}"
    docker push "${REMOTE_TAG}"
    docker push "${REMOTE_LATEST}"
    echo "✓ 远程镜像推送完毕！"
fi

# 4. 导出离线压缩包 (.tar.gz)
mkdir -p "${OUTPUT_DIR}"
TAR_FILE="${OUTPUT_DIR}/sacred-focus-v${VERSION}.tar.gz"

echo ""
echo "💾 正在压缩导出离线镜像包至 ${TAR_FILE} ..."
docker save "${IMAGE_TAG}" "${LATEST_TAG}" | gzip > "${TAR_FILE}"

if [ -f "${TAR_FILE}" ]; then
    SIZE=$(du -h "${TAR_FILE}" | cut -f1)
    echo "✓ 离线镜像压缩包导出完成！"
    echo "   - 文件路径: ${TAR_FILE}"
    echo "   - 压缩体积: ${SIZE}"
fi

echo ""
echo "🎉 打包交付流程完成！"
echo "👉 将 ${TAR_FILE} 传输至服务器/虚拟机后，执行: ./scripts/docker-update.sh ${TAR_FILE}"
