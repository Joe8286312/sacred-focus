# Nginx TLS 证书管理

本目录保存证书生成脚本。生产 TLS overlay 挂载的是 `.env` 中 `NGINX_SSL_DIR` 指定的**仓库外目录**，容器路径为 `/etc/nginx/ssl`；该目录需包含：

- `server.crt`：PEM 格式完整证书链，例如 Let's Encrypt 的 `fullchain.pem`。
- `server.key`：与证书匹配的 PEM 格式私钥，例如 `privkey.pem`。

Nginx 同时配置 HTTP 和 HTTPS，启动时就需要两个有效文件。不能在证书缺失时先启动同一配置的 HTTP 网关。

项目 TLS overlay 使用 `ports: !override []`，需要 Docker Compose 2.24.4 或以上。[Docker 合并规则](https://docs.docker.com/reference/compose-file/merge/)

## 局域网演练用自签名证书

Linux / macOS / Git Bash 中，在项目根目录执行：

```bash
bash ./nginx/ssl/generate-cert.sh 192.168.1.50
```

替换为自己的虚拟机局域网 IPv4，或传入测试域名；不传参数时使用 `localhost`。脚本把 IPv4 写为 `IP` SAN、域名写为 `DNS` SAN，并在本目录生成证书和私钥。自签名证书仍会显示“不受信任”警告，仅在确认是自己的测试服务器时继续访问。

Windows 的 `generate-cert.ps1` 当前将 `Domain` 写成 DNS SAN；可用于域名 / `localhost`，访问 IPv4 时使用下面的显式命令以生成正确的 IP SAN。需要已安装并可从终端调用 OpenSSL：

```powershell
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 `
  -keyout nginx/ssl/server.key `
  -out nginx/ssl/server.crt `
  -subj "/CN=192.168.1.50" `
  -addext "subjectAltName=IP:192.168.1.50,DNS:localhost,IP:127.0.0.1"
```

本地产生的证书不要作为开发机发布包上传到云服务器。VMware 中可在虚拟机上生成，再复制到实际挂载目录：

```bash
sudo install -d -m 700 /etc/sacred-focus/tls
sudo install -m 644 nginx/ssl/server.crt /etc/sacred-focus/tls/server.crt
sudo install -m 600 nginx/ssl/server.key /etc/sacred-focus/tls/server.key
```

## 正式证书与续期

正式部署使用受信任 CA 证书。首次部署可先用 Certbot standalone 申请，再复制证书并启动 Nginx；具体命令见 [云服务器首次部署清单](../../docs/cloud-production-deployment.md)。不要用宿主机 `certbot --nginx` 修改容器配置。

Certbot standalone 申请和续期均需要公网 80 端口可达且没有其他程序占用；续期前应临时停网关，续期后复制新的证书和私钥并恢复网关。自动续期需要完整的停网关、复制证书、恢复网关 hooks。[Certbot 官方说明](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)

复制源文件内容，不要创建指向 `/etc/letsencrypt/` 的绝对符号链接，链接目标不在容器挂载范围内。使用 `install -m 644` 放置证书、`install -m 600` 放置私钥；项目默认 Nginx master 可以读取 root 所有的私钥。若修改网关用户或启用 rootless Docker，另行验证实际文件读取权限。

替换证书后，先验证配置再 reload；如网关已停止，启动即可：

```bash
cd /opt/sacred-focus
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
curl --fail --show-error https://focus.example.com/api/health
```

TLS 私钥、证书文件和实际 `.env` 不应进入 Git、镜像构建上下文或交付 tar。更新应用通常不需要重新生成密钥或证书。
