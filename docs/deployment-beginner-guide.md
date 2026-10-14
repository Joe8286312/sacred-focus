# 从 VMware 演练到云服务器上线

本指南面向首次部署服务器的 Sacred Focus 使用者，重点是 VMware 局域网演练。正式上线见 [云服务器首次部署清单](cloud-production-deployment.md)，已上线服务器升级见 [云服务器项目更新步骤](cloud-server-update.md)，完整备份与恢复见 [交付与运维手册](../scripts/README.md)。

> 示例系统为 Ubuntu Server 22.04 LTS 或 24.04 LTS、Docker Compose 2.24.4 或以上。TLS overlay 使用 `!override` 清除应用端口映射，旧版 Compose 不支持该语法。[Docker 合并规则](https://docs.docker.com/reference/compose-file/merge/)

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
宿主机数据目录（app.db、accounts/、backup/）
```

数据存放在 `HOST_DATA_DIR` 指定的宿主机目录。基础 Compose 只监听服务器本机；叠加 Nginx Compose 后才公开 80/443。全新部署只创建神圣座位的最小配置，画布为空。默认访客进入公用账号；管理员和服务器创建的个人账号分别拥有独立工作区。账号操作见 [多人使用指南](multiuser.md)。

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

可从 Ubuntu Server 22.04 LTS 或 24.04 LTS、2 vCPU、2 GB 内存的虚拟机开始演练。磁盘应同时容纳镜像、tar、数据库和备份；构建镜像优先在开发机执行，实际资源按负载调整。

VMware 网络选择很关键：

- **桥接（Bridged，推荐）**：虚拟机从路由器获得独立局域网 IP，手机最容易访问。
- **NAT**：虚拟机可上网，但手机不能直接访问，除非额外配置端口转发。
- **仅主机（Host-only）**：只能从宿主机访问，不适合手机测试。

安装系统时创建普通管理员用户。登录虚拟机后执行：

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y openssh-server curl ca-certificates openssl nano
sudo timedatectl set-timezone Asia/Shanghai
timedatectl status
hostname -I
```

`TZ=Asia/Shanghai` 会传入应用容器，但不会自动修改 Ubuntu 宿主机时区；上述命令会将虚拟机系统日志、备份文件名与计划任务统一为中国标准时间（UTC+08:00）。

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
.\scripts\docker-pack.ps1 -Version 1.0.2 -VcsRef (git rev-parse --short HEAD)
```

得到 `release/sacred-focus-v1.0.2.tar`。版本仅是贯穿本指南的示例，不代表最新发布；请选择未使用过的版本，镜像标签、tar 文件名和 `.env` 必须一致。把下列内容上传到虚拟机的 `/opt/sacred-focus/`；可使用 WinSCP 或 PowerShell 的 `scp`：

```text
docker-compose.yml
docker-compose.nginx.yml
.env.production.example
nginx/conf.d/
nginx/ssl/generate-cert.sh
scripts/（包含 lib/）
release/sacred-focus-v1.0.2.tar
```

不要上传本机的 `.env`、`data/`、SQLite 数据库或私钥。应用 tar 不包含 `nginx:1.27-alpine`；目标机器须能拉取网关镜像，完全离线环境还需单独导出并加载该镜像。

虚拟机上创建目录：

```bash
sudo mkdir -p /opt/sacred-focus/release
sudo mkdir -p /srv/sacred-focus/data
sudo mkdir -p /etc/sacred-focus/tls
sudo chown -R "$USER":"$USER" /opt/sacred-focus
cd /opt/sacred-focus
ls docker-compose.yml scripts/docker-update.sh release/
find scripts nginx/ssl -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
```

## 5. 阶段 A：局域网自签名 HTTPS

从 Windows 上传的 shell 脚本先统一为 LF 换行；上一节的 `find` 命令仅处理 `.sh` 文件，不改证书或配置。

自签名证书仅用于 VMware 测试。它会加密传输，但手机会显示“不受信任”警告，这是预期行为。

```bash
cd /opt/sacred-focus
chmod +x nginx/ssl/generate-cert.sh scripts/*.sh scripts/lib/*.sh
./nginx/ssl/generate-cert.sh VM_IP

sudo install -m 600 nginx/ssl/server.key /etc/sacred-focus/tls/server.key
sudo install -m 644 nginx/ssl/server.crt /etc/sacred-focus/tls/server.crt
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
APP_VERSION=v1.0.2
PORT=80
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

`HOST_DATA_DIR` 保存管理员数据库与账号注册表、各工作区数据库、WAL 和备份。`PORT=80` 供当前更新脚本探测宿主机 Nginx；TLS overlay 下应用端口不公开，容器仍监听 3000。仅基础 Compose 模式时则使用本机应用映射端口（默认 3000）。

已有数据不会因更新被清空。多人部署不要只删除根 `app.db` 来“重置”：它还包含账号注册表，会与 `accounts/` 脱节。若要重做空白演练，应停止测试环境后将完整旧数据目录另存，改用新的 `HOST_DATA_DIR`，重新初始化权限；实际使用中的数据按备份恢复流程处理。

## 7. 启动、检查与手机访问

```bash
cd /opt/sacred-focus
docker load -i release/sacred-focus-v1.0.2.tar

export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml

docker compose --env-file .env \
  config --quiet

# node 用户需要拥有宿主机绑定数据目录的读写权限。
docker compose --env-file .env run --rm --no-deps --user 0 --entrypoint sh sacred-focus \
  -c 'chown -R node:node /app/data'

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

手机地址是 `https://VM_IP`。原部署记录中的 `43.142.96.124` 是云服务器公网地址，应作为 `CLOUD_IP` 使用；它不代替本节的虚拟机局域网 `VM_IP`。正式云端验收使用可信域名 HTTPS，不加 `-k`。若局域网访问打不开，依次检查：

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
sudo env COMPOSE_FILE="$COMPOSE_FILE" ./scripts/docker-backup.sh
sudo ls -lh /srv/sacred-focus/data/backup
```

### 更新

在开发机选择下一个未使用的版本（例如 `1.0.3`），上传 tar 后执行：

```bash
sudo env COMPOSE_FILE="$COMPOSE_FILE" ./scripts/docker-update.sh release/sacred-focus-v1.0.3.tar
# sudo 更新脚本可能重建 .env；成功或失败后均恢复运维用户的权限。
sudo chown "$USER":"$USER" .env
chmod 600 .env
curl -kfsS https://VM_IP/api/health
```

更新脚本会先备份；若新容器健康检查失败，会恢复旧 `APP_VERSION` 并重新启动旧容器，但不自动恢复数据库或运行配置。更新前必须确认 `PORT=80` 和正确的 `COMPOSE_FILE`；具体过程、失败处理和人工回滚见 [云服务器项目更新步骤](cloud-server-update.md)。

### 数据迁移

从网页右上角“跨设备数据迁移与整机备份”入口导出当前账号 JSON；再在新的测试工作区导入，确认树、座位配置、判例、日志和演化快照能恢复。该导出不包含其他账号或注册表；全服务器恢复使用脚本生成的 `.db`、manifest 和 `_accounts/` 完整套件，见 [交付手册](../scripts/README.md)。VMware 快照不能替代应用一致性备份。

## 9. 阶段 B：云服务器上线

完成局域网演练后，按 [云服务器首次部署清单](cloud-production-deployment.md) 配置安全组、域名解析、备案（按服务器地域和接入商要求）、可信证书及正式生产密钥。云端不要直接复制虚拟机的 `.env` 或私钥。

当前 Nginx 配置在启动时就需要证书；首次正式部署应先用 Certbot standalone 申请证书，再启动 TLS overlay。后续 standalone 续期同样需要释放 80 端口，成功后重新复制证书并恢复网关。云部署清单提供完整顺序和续期说明，避免在此维护两套命令。

正式云端验收使用 `curl --fail --show-error https://你的域名/api/health`，不使用跳过证书校验的 `-k`。单账号业务迁移可以网页导入 JSON；多人全服务器迁移必须同时恢复账号注册表和全部工作区数据库。

## 10. 日常运维入口

| 事项 | 文档或命令 |
|---|---|
| 新 SSH 会话选择网关编排 | `cd /opt/sacred-focus` 后设置 `export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml` |
| 应用与网关状态 | `docker compose ps` |
| 应用 / 网关日志 | `docker compose logs --tail=100 sacred-focus` / `docker compose logs --tail=100 nginx` |
| 公用与个人账号管理 | [多人使用指南](multiuser.md) |
| 备份与恢复 | [交付与运维手册](../scripts/README.md) |
| 已上线项目更新、验收、回滚 | [云服务器项目更新步骤](cloud-server-update.md) |
| 首次云服务器部署、证书续期 | [云服务器首次部署清单](cloud-production-deployment.md) |

把全套备份定期复制到服务器外的可信位置；同一块磁盘上的备份无法抵抗整块磁盘损坏。镜像更新和数据库恢复是不同操作，不要用删除数据库解决更新失败。
