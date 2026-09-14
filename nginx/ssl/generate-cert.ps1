# ========================================================
# Sacred Focus SSL 自签名测试/内网证书一键生成脚本 (Windows PowerShell)
# ========================================================

param (
    [string]$Domain = "localhost"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "🔐 正在为 [$Domain] 生成 RSA 2048 位自签名 SSL 证书..." -ForegroundColor Cyan

$Days = 3650
$KeyPath = Join-Path $ScriptDir "server.key"
$CrtPath = Join-Path $ScriptDir "server.crt"

openssl req -x509 -nodes -days $Days -newkey rsa:2048 `
  -keyout $KeyPath `
  -out $CrtPath `
  -subj "/C=CN/ST=Beijing/L=Beijing/O=SacredFocus/OU=Engineering/CN=$Domain" `
  -addext "subjectAltName=DNS:$Domain,DNS:localhost,IP:127.0.0.1"

Write-Host "✓ SSL 证书生成完毕:" -ForegroundColor Green
Write-Host "   - 私钥: $KeyPath" -ForegroundColor Gray
Write-Host "   - 证书: $CrtPath" -ForegroundColor Gray
Write-Host "   - 有效期: $Days 天" -ForegroundColor Gray
