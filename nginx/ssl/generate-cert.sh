#!/usr/bin/env bash
# ========================================================
# Sacred Focus SSL 自签名测试/内网证书一键生成脚本
# ========================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

DAYS=3650
DOMAIN="${1:-localhost}"
if [[ "${DOMAIN}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  SUBJECT_ALT_NAME="IP:${DOMAIN},DNS:localhost,IP:127.0.0.1"
else
  SUBJECT_ALT_NAME="DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1"
fi

echo "🔐 正在为 [${DOMAIN}] 生成 RSA 2048 位自签名 SSL 证书..."

openssl req -x509 -nodes -days ${DAYS} -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=SacredFocus/OU=Engineering/CN=${DOMAIN}" \
  -addext "subjectAltName=${SUBJECT_ALT_NAME}"

chmod 600 server.key
chmod 644 server.crt

echo "✓ SSL 证书生成完毕:"
echo "   - 私钥: ${SCRIPT_DIR}/server.key"
echo "   - 证书: ${SCRIPT_DIR}/server.crt"
echo "   - 有效期: ${DAYS} 天"
