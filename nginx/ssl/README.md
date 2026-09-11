# Sacred Focus Nginx SSL 证书管理

本目录挂载至 Nginx 容器的 `/etc/nginx/ssl` 目录，用于提供 HTTPS 加密传输。

## 证书文件约定

- **私钥文件**: `server.key`
- **公钥证书**: `server.crt`

## 证书管理指引

### 1. 快速生成本地测试/内网自签名证书
在 Linux/macOS 或 Git Bash 下执行：
```bash
./nginx/ssl/generate-cert.sh [域名或IP，默认 localhost]
```

### 2. 使用自签名证书的 Windows/PowerShell 生成方式
```powershell
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 `
  -keyout nginx/ssl/server.key `
  -out nginx/ssl/server.crt `
  -subj "/CN=localhost" `
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

### 3. 生产环境正式证书
将已签署的正式商业证书（如 Let's Encrypt / 阿里云 / 腾讯云）重命名或软链接为：
- `server.crt`（包含证书链 fullchain.pem）
- `server.key`（证书私钥 privkey.pem）
