# 云服务器正式部署清单

本清单用于把已在 VMware 验证过的 Sacred Focus 部署到带域名的云服务器。项目使用 Docker Compose、Nginx 和 SQLite；域名示例使用 `focus.example.com`，请替换为自己的域名。

## 1. 先确认资源规格

Sacred Focus 是轻量的 Node.js + SQLite 应用，不运行本地大模型。默认资源上限已经写入 Compose，并可在 `.env` 调整：应用最多 512 MB、0.75 CPU，Nginx 最多 128 MB、0.25 CPU；应用 V8 堆上限为 384 MB。

| 服务器用途 | 建议规格 | 本项目 `.env` 资源配置 |
|---|---|---|
| 仅运行 Sacred Focus | 1–2 vCPU、2 GB RAM、25 GB SSD | 使用默认值。 |
| 与普通网站/API 共用 | 2 vCPU、4 GB RAM、40 GB SSD | 使用默认值，并给宿主机及其他服务保留至少 1 GB 内存。 |
| 同机运行 Agent 编排、向量库等服务 | 4 vCPU、8 GB RAM、80 GB SSD 起 | Sacred Focus 保持默认值；Agent 服务单独限额。 |
| 同机本地运行大模型 | 不建议与本项目共用小型实例 | 按模型显存、GPU 驱动与模型框架单独规划。 |

默认值是上限，不是预留。查看实际消耗请用 `docker stats --no-stream`。如果应用被 OOM 杀掉，先通过 `docker compose logs --tail=100 sacred-focus` 确认原因，再逐级调大 `APP_MEMORY_LIMIT` 和 `NODE_HEAP_LIMIT_MB`，不要直接取消所有限制。

## 2. 云控制台与 DNS

1. 创建 Ubuntu 22.04 LTS 或 24.04 LTS 服务器，记录公网 IPv4。
2. 在云厂商安全组/防火墙放行 TCP：`22`、`80`、`443`。SSH 端口 22 应尽量只允许自己的公网 IP。
3. 在域名 DNS 控制台创建 A 记录：`focus.example.com` 指向服务器公网 IPv4。可选地，再创建 `www` 到同一地址。
4. 等待 DNS 生效后，在任意电脑确认：

   ```bash
   nslookup focus.example.com
   ```

返回值必须是服务器的公网 IP。证书申请前不要跳过此检查。

### 新注册域名的 `serverHold` 与备案

新注册域名即使实名认证已通过，也可能暂时处于注册局 `serverHold` 状态。此时 DNS 解析不会指向你的真实服务器；等待域名状态恢复为 `OK` 后，再确认 A 记录返回服务器公网 IP。腾讯云说明该状态刷新通常需要 1–2 个工作日。[腾讯云 serverHold 说明](https://cloud.tencent.com/document/product/242/54080)

如果云服务器位于**中国大陆**，应在腾讯云 ICP 备案系统完成网站备案后再开放域名访问；未备案的域名解析到中国大陆腾讯云服务器会被拦截。香港及其他境外地域通常不适用这一前置流程。请以 [腾讯云 ICP 备案要求](https://cloud.tencent.com/document/product/243/39038) 和实际服务器地域为准。

## 3. 初始化服务器

SSH 登录后执行：

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y openssh-server curl ca-certificates openssl nano certbot
sudo timedatectl set-timezone Asia/Shanghai
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

按 [Docker 官方 Ubuntu 安装指南](https://docs.docker.com/engine/install/ubuntu/) 安装 Docker Engine 和 Compose 插件。完成后验证：

```bash
docker --version
docker compose version
docker run hello-world
```

创建运行目录：

```bash
sudo mkdir -p /opt/sacred-focus/release /srv/sacred-focus/data /etc/sacred-focus/tls
sudo chown -R "$USER":"$USER" /opt/sacred-focus /srv/sacred-focus
```

## 4. 上传发布物与创建 `.env`

从 Windows 开发机打包并上传以下发布物：镜像 tar 包、`docker-compose.yml`、`docker-compose.nginx.yml`、`.env.production.example`、`nginx/` 和 `scripts/`。不要上传本机 `.env`、数据库、备份或私钥。

服务器上执行：

```bash
cd /opt/sacred-focus
cp .env.production.example .env
chmod 600 .env
openssl rand -base64 32
nano .env
```

至少修改下面的字段；`JWT_SECRET` 粘贴刚生成的随机字符串，`ADMIN_PASSWORD` 使用独立强密码：

```dotenv
APP_VERSION=v1.0.1
TZ=Asia/Shanghai
JWT_SECRET=<随机字符串>
ADMIN_PASSWORD=<至少12位的独立强密码>
HOST_DATA_DIR=/srv/sacred-focus/data
NGINX_SSL_DIR=/etc/sacred-focus/tls
ALLOWED_ORIGINS=https://focus.example.com
TRUSTED_IPS=
```

保留资源限制默认值即可；若服务器需要为其他项目留更多余量，可先降低本项目配额：

```dotenv
APP_MEMORY_LIMIT=384m
APP_MEMORY_RESERVATION=96m
APP_MEMORY_SWAP_LIMIT=384m
APP_CPU_LIMIT=0.50
NODE_HEAP_LIMIT_MB=256
NGINX_MEMORY_LIMIT=96m
NGINX_CPU_LIMIT=0.20
```

`APP_MEMORY_SWAP_LIMIT` 应与 `APP_MEMORY_LIMIT` 相同，表示容器不得借用额外 Swap；这能防止一个内存异常的项目拖慢同机全部服务。

## 5. 首次启动 HTTP 网关并申请可信证书

先加载镜像并启动。始终先设置 `COMPOSE_FILE`，确保应用和 Nginx 网关属于同一个 Compose 项目：

```bash
cd /opt/sacred-focus
docker load -i release/sacred-focus-v1.0.1.tar
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d
curl --fail --show-error http://127.0.0.1/api/health
```

本项目的 Nginx 在容器内，因此不要使用 Certbot 的 `--nginx` 自动改写宿主机配置。用 standalone 模式；申请时临时停止容器网关以释放 80 端口：

```bash
cd /opt/sacred-focus
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
docker compose stop nginx
sudo certbot certonly --standalone -d focus.example.com --email you@example.com --agree-tos --no-eff-email
sudo install -m 644 /etc/letsencrypt/live/focus.example.com/fullchain.pem /etc/sacred-focus/tls/server.crt
sudo install -m 600 /etc/letsencrypt/live/focus.example.com/privkey.pem /etc/sacred-focus/tls/server.key
docker compose start nginx
```

申请失败时，检查 DNS、云安全组、UFW 和 80 端口占用；Certbot 的入站校验要求域名能从公网访问 80，除非改用 DNS 验证。[Certbot 官方说明](https://certbot.eff.org/instructions)

## 6. 正式验收与续期

```bash
curl --fail --show-error https://focus.example.com/api/health
docker compose ps
docker stats --no-stream
free -h
```

在手机上访问 `https://focus.example.com`。证书由 Let’s Encrypt 签发后不应再出现自签名警告。

续期演练：

```bash
sudo certbot renew --dry-run
```

真实续期后必须再次复制 `fullchain.pem` 和 `privkey.pem` 到 `/etc/sacred-focus/tls/`，然后执行 `docker compose restart nginx`。在完成一次手动演练前，不要急于配置自动化。

## 7. 日常边界

- 每次更新前运行 `./scripts/docker-backup.sh`；备份目录还应复制到服务器外。
- 只公开 80/443；不要公开应用内部的 3000 端口。
- 每个同机项目建立独立的 Compose 项目、数据目录、资源上限和反向代理域名。
- 修改 `.env` 的资源参数后执行 `docker compose --env-file .env up -d` 才会让限制重新生效。
