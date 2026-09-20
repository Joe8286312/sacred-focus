# 从 VMware 演练到云服务器上线

本指南面向首次部署服务器的 Sacred Focus 使用者。路线分为两段：先在本地 VMware 中完成低风险演练，再把同一发布物迁移到云服务器、域名和可信 HTTPS。

> 示例系统为 Ubuntu Server 24.04 LTS、Docker Compose v2。云厂商的控制台不同，但 Linux 内的部署步骤相同。

## 1. 你最终会得到什么

```text
手机或电脑浏览器
        │ HTTPS :443
        ▼
Nginx 容器（TLS 与 HTTP → HTTPS）
        │ Docker 内部网络
        ▼
Sacred Focus 容器（网页与 API）
        │
        ▼
宿主机数据目录（SQLite app.db、backup/）
```

数据存放在 `HOST_DATA_DIR` 指定的宿主机目录，而不是容器内部。基础 Compose 只监听服务器本机；叠加 Nginx Compose 后才公开 80/443。

使用 Nginx 模式时，在每个新的 SSH 会话进入发布目录后先执行：

```bash
cd /opt/sacred-focus
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
```

这会让后续的 `docker compose`、备份脚本和更新脚本始终使用同一套应用与网关服务。不要在 Nginx 已运行时只用基础 Compose 执行带 `--remove-orphans` 的更新。

| 阶段 | 访问方式 | 完成标准 |
|---|---|---|
| A. VMware 演练 | `https://虚拟机局域网IP` | 电脑和同一 Wi-Fi 的手机均能访问；已完成备份与更新演练。 |
| B. 云服务器上线 | `https://你的域名` | 可信 HTTPS、定期备份和更新回滚均可用。 |

## 2. 阶段 A：创建 VMware 虚拟机

建议起点：Ubuntu Server 24.04 LTS、2 vCPU、2 GB 内存、25 GB 磁盘。构建镜像时 4 GB 内存会更从容。

VMware 网络选择很关键：

- **桥接（Bridged，推荐）**：虚拟机从路由器获得独立局域网 IP，手机最容易访问。
- **NAT**：虚拟机可上网，但手机不能直接访问，除非额外配置端口转发。
- **仅主机（Host-only）**：只能从宿主机访问，不适合手机测试。

安装系统时创建普通管理员用户。登录虚拟机后执行：

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y openssh-server curl ca-certificates openssl nano
hostname -I
```

记下类似 `192.168.1.50` 的地址，下文用 `VM_IP` 表示。宿主机先测试 SSH：

```bash
ssh 你的Linux用户名@VM_IP
```

若手机无法访问该 IP，请确认手机和虚拟机处于同一局域网、路由器没有启用 AP/客户端隔离，且 VMware 网卡确实使用桥接。

### 放行必要端口

先放行 SSH，避免锁死远程管理：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

不要公开应用 3000 端口。Docker 的端口规则与 UFW/firewalld 有特殊交互；项目只通过 Nginx 公开 80/443，以缩小暴露面。参见 [Docker 官方防火墙说明](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations)。

## 3. 安装 Docker 和 Compose

以下是 Docker 官方 APT 仓库的 Ubuntu 安装路径。不要同时混用系统旧 Docker 包和 Docker 官方包。

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

允许当前用户运行 Docker。注意：`docker` 组拥有较高主机权限，只添加你信任的管理员用户。

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker run hello-world
docker compose version
```

如遇系统版本或安装问题，以 [Docker 官方 Ubuntu 安装文档](https://docs.docker.com/engine/install/ubuntu/) 为准。

## 4. 在开发机打包并传送发布物

Windows 开发机中确认 Docker Desktop 已运行，在项目根目录执行：

```powershell
.\scripts\docker-pack.ps1 -Version 1.0.0
```

得到 `release/sacred-focus-v1.0.0.tar`。把下列内容上传到虚拟机的 `/opt/sacred-focus/`；可使用 WinSCP 图形界面或 PowerShell 的 `scp`：

```text
docker-compose.yml
docker-compose.nginx.yml
.env.production.example
nginx/
scripts/
release/sacred-focus-v1.0.0.tar
```

不要上传本机的 `.env`、`data/`、SQLite 数据库或私钥。

虚拟机上创建目录：

```bash
sudo mkdir -p /opt/sacred-focus/release
sudo mkdir -p /srv/sacred-focus/data
sudo mkdir -p /etc/sacred-focus/tls
sudo chown -R "$USER":"$USER" /opt/sacred-focus /srv/sacred-focus
cd /opt/sacred-focus
ls docker-compose.yml scripts/docker-update.sh release/
```

## 5. 阶段 A：局域网自签名 HTTPS

自签名证书仅用于 VMware 测试。它会加密传输，但手机会显示“不受信任”警告，这是预期行为。

```bash
cd /opt/sacred-focus
chmod +x nginx/ssl/generate-cert.sh scripts/*.sh scripts/lib/*.sh
./nginx/ssl/generate-cert.sh VM_IP

install -m 600 nginx/ssl/server.key /etc/sacred-focus/tls/server.key
install -m 644 nginx/ssl/server.crt /etc/sacred-focus/tls/server.crt
```

请把 `VM_IP` 换成真实 IP。证书脚本会把 IPv4 写入证书 SAN，避免浏览器出现“访问 IP 与证书域名不匹配”的错误。只有确认这是自己的局域网虚拟机时，才能在手机浏览器中继续访问该自签名证书。

## 6. 创建生产配置

```bash
cd /opt/sacred-focus
cp .env.production.example .env
chmod 600 .env
nano .env
```

VMware 演练可按下面填写；尖括号内容必须替换：

```dotenv
APP_VERSION=v1.0.0
TZ=Asia/Shanghai
JWT_SECRET=<执行 openssl rand -base64 32 后填入结果>
ADMIN_PASSWORD=<至少12字符的强密码>
HOST_DATA_DIR=/srv/sacred-focus/data
NGINX_SSL_DIR=/etc/sacred-focus/tls
ALLOWED_ORIGINS=https://VM_IP
TRUSTED_IPS=
```

生成 JWT 密钥：

```bash
openssl rand -base64 32
```

`HOST_DATA_DIR` 是数据库、WAL 文件和备份的唯一持久化位置，绝不能随意删除。

## 7. 启动、检查与手机访问

```bash
cd /opt/sacred-focus
docker load -i release/sacred-focus-v1.0.0.tar

export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml

docker compose --env-file .env \
  config --quiet

docker compose --env-file .env \
  up -d
```

验证：

```bash
docker compose ps
curl -fsS http://127.0.0.1/api/health
curl -kfsS https://VM_IP/api/health
docker compose logs --tail=100 sacred-focus
```

手机地址是 `https://VM_IP`。若打不开，依次检查：

```bash
hostname -I
sudo ufw status
docker compose ps
docker compose logs --tail=100 nginx
docker compose logs --tail=100 sacred-focus
```

## 8. 本地演练的三个必做动作

### 备份

```bash
cd /opt/sacred-focus
./scripts/docker-backup.sh
ls -lh /srv/sacred-focus/data/backup
```

### 更新

在开发机打包 `1.0.1`，上传 tar 后执行：

```bash
./scripts/docker-update.sh release/sacred-focus-v1.0.1.tar
curl -kfsS https://VM_IP/api/health
```

更新脚本会先备份；若新容器健康检查失败，会恢复旧 `APP_VERSION` 并重新启动旧容器。不要通过删除旧镜像或数据库来“修复”更新。

### 数据迁移

从网页右上角“跨设备数据迁移与整机备份”入口导出整机 JSON；再在新的测试环境导入它，确认树、座位配置、判例、日志和演化快照都能恢复。VMware 快照不能替代应用备份：它和运行中的 SQLite/WAL 未必构成一致的数据快照。

## 9. 阶段 B：云服务器与域名

完成 VMware 演练后再购买云服务器。入门规格可从 1–2 vCPU、2 GB 内存、25 GB SSD 的 Ubuntu 实例开始；如果要在服务器构建镜像或长期保留大量备份，请增加内存和磁盘。

在云厂商控制台完成：

1. 创建 Ubuntu 24.04 LTS 实例并记录公网 IP。
2. 安全组只开放 22（尽量限制你的 IP）、80、443。
3. 购买域名后，在 DNS 创建 A 记录：`focus.example.com → 云服务器公网 IPv4`。
4. 在服务器确认解析：

   ```bash
   getent hosts focus.example.com
   ```

   输出必须是该云服务器公网 IP。

随后重复第 3、4、6、7 节。正式 `.env` 改为：

```dotenv
HOST_DATA_DIR=/srv/sacred-focus/data
NGINX_SSL_DIR=/etc/sacred-focus/tls
ALLOWED_ORIGINS=https://focus.example.com
```

## 10. 获取可信 HTTPS 证书

推荐 Let’s Encrypt。申请前，域名必须已解析到服务器、80 端口必须可从公网访问，且没有其他程序占用 80。Certbot 的安装命令会随系统变化，请在 [Certbot 官方指引](https://certbot.eff.org/instructions) 中选择 Ubuntu 和你的实际 Web 服务方式。

申请成功后，证书通常在 `/etc/letsencrypt/live/focus.example.com/`。复制到项目使用的独立目录：

```bash
sudo install -d -m 700 /etc/sacred-focus/tls
sudo install -m 644 /etc/letsencrypt/live/focus.example.com/fullchain.pem /etc/sacred-focus/tls/server.crt
sudo install -m 600 /etc/letsencrypt/live/focus.example.com/privkey.pem /etc/sacred-focus/tls/server.key
```

不要使用跨目录的绝对符号链接：容器只能读取被挂载的 `/etc/sacred-focus/tls`。证书续期后，重新复制两个文件并重启网关：

```bash
cd /opt/sacred-focus
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
docker compose --env-file .env restart nginx
curl --fail --show-error https://focus.example.com/api/health
```

在熟悉手动续期并成功完成 `certbot renew --dry-run` 后，再按 Certbot 文档配置 deploy hook 自动复制证书和重启 Nginx。

## 11. 将 VMware 数据迁移到云服务器

推荐使用网页整机 JSON 导入导出：

1. VMware 页面导出整机备份，并离线保存该 JSON。
2. 云服务器部署完成后，用新管理员密码登录。
3. 在云服务器网页导入 JSON；系统会先创建预导入热备。
4. 核对树、座位设置、判例、日志和演化快照，再让手机改用域名。

不要在应用运行时直接复制 `app.db`。对新手而言，整机 JSON 导入比文件级 SQLite 迁移安全。

## 12. 日常运维速查

| 事项 | 命令 |
|---|---|
| 查看状态 | `export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml` 后执行 `docker compose ps` |
| 应用日志 | `docker compose logs --tail=100 sacred-focus` |
| 网关日志 | `docker compose logs --tail=100 nginx` |
| 数据库备份 | `./scripts/docker-backup.sh` |
| 离线更新 | `./scripts/docker-update.sh release/sacred-focus-vX.Y.Z.tar` |
| 配置预检 | `bash ./scripts/verify-delivery.sh` |
| 健康检查 | `curl --fail https://你的域名/api/health` |

每次更新前先备份，并将 `/srv/sacred-focus/data/backup/` 定期复制到另一台设备或可信对象存储。同一块磁盘上的备份不能抵抗整块磁盘损坏。
