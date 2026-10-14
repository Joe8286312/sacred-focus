# 云服务器首次部署清单

适用于 Ubuntu 云服务器、域名、Docker Compose 和 Nginx HTTPS 的首次上线。已有服务器更新版本，请直接使用 [云服务器项目更新步骤](cloud-server-update.md)；VMware 演练见 [新手部署指南](deployment-beginner-guide.md)。命令假定发布目录为 `/opt/sacred-focus`，数据目录为 `/srv/sacred-focus/data`，域名为 `focus.example.com`，请替换为自己的值。

## 1. 确认部署条件

- 使用 Docker Engine 和 Compose **2.24.4 或以上**；TLS overlay 的 `ports: !override []` 需要此版本支持。[Docker 合并规则](https://docs.docker.com/reference/compose-file/merge/)
- 服务器能获取 `nginx:1.27-alpine`，或提前在可联网的机器将该镜像导出并离线加载。应用 tar 只包含 Sacred Focus 镜像，不包含网关镜像。
- 当前 Compose 给应用设置 512 MB 内存、0.75 CPU 上限，给 Nginx 设置 128 MB、0.25 CPU 上限；应用 V8 堆上限为 384 MB。可从 1–2 vCPU、2 GB 内存的独立测试实例开始，实际规格按访问量和其他服务决定。这是容量估计，不是性能保证。
- 预留发布 tar、当前及旧镜像、数据库、WAL 和备份的磁盘空间。个人账号默认最多 20 个，公用工作区默认 50 MB，个人工作区默认 256 MB；这些限制不包括备份、日志和其他磁盘内容。

查看实际资源消耗使用 `docker stats --no-stream`、`free -h` 和 `df -h`。资源配置字段见 [交付与运维手册](../scripts/README.md)，账号配额见 [多人使用指南](multiuser.md)。

## 2. 安全组、DNS 与备案

1. 创建 Ubuntu 22.04 LTS 或 24.04 LTS 实例，记录公网 IPv4；SSH 使用你实际配置的用户名和端口。
2. 云安全组放行 TCP 80、443；SSH 端口尽量限制为你的公网 IP。应用容器的 3000 端口无需公开。
3. DNS 创建 A 记录：`focus.example.com` 指向服务器公网 IPv4。若配置了 AAAA 记录，也必须指向可用的该站点 IPv6 地址。
4. 在客户端和服务器确认域名解析；申请证书前确认没有指向其他服务器的旧记录：

   ```bash
   nslookup focus.example.com
   getent ahosts focus.example.com
   ```

若域名处于注册局 `serverHold` 状态，先在注册商核对实名审核和域名状态，恢复解析后再申请证书。不要只凭控制台已有 A 记录就认为域名可访问，也不应依赖固定等待天数。[腾讯云 serverHold 说明](https://cloud.tencent.com/document/product/242/54080)

部署在中国大陆服务器的网站，应先按实际接入商的要求办理 ICP 备案，再开通访问；中国香港及境外服务器的备案适用情况请按实际地域核对。[腾讯云备案指引](https://cloud.tencent.com/document/product/243/39038)、[是否需要备案](https://cloud.tencent.com/document/api/243/19630)

## 3. 初始化主机

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y openssh-server curl ca-certificates openssl nano
sudo timedatectl set-timezone Asia/Shanghai
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

使用非默认 SSH 端口时，先放行实际端口再启用 UFW。Docker 与主机防火墙规则有特殊交互，云安全组也需要独立配置。[Docker 防火墙限制](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations)

按 [Docker Ubuntu 安装文档](https://docs.docker.com/engine/install/ubuntu/) 安装 Docker Engine 和 Compose 插件；如将管理员加入 `docker` 组，只加入可信的运维用户。验证：

```bash
docker --version
docker compose version
docker run hello-world
sudo mkdir -p /opt/sacred-focus/release /srv/sacred-focus/data
sudo install -d -m 700 /etc/sacred-focus/tls
sudo chown -R "$USER":"$USER" /opt/sacred-focus
```

Certbot 按 [官方安装指引](https://certbot.eff.org/instructions) 选择实际系统和 **Other / standalone** 模式安装。项目 Nginx 运行在容器中，宿主机的 `certbot --nginx` 无法直接配置这个容器。

## 4. 上传发布物与配置

开发机按 [交付手册](../scripts/README.md) 打包，例如 `1.0.2`，上传以下文件到 `/opt/sacred-focus/`，保留目录结构：

```text
release/sacred-focus-v1.0.2.tar
docker-compose.yml
docker-compose.nginx.yml
.env.production.example
nginx/conf.d/
scripts/（包含 lib/）
```

不要复制开发机或其他服务器的 `.env`、数据目录、备份、TLS 私钥；每台新服务器使用自己的生产配置和证书。数据迁移另按第 8 节执行。

```bash
cd /opt/sacred-focus
cp .env.production.example .env
chmod 600 .env
openssl rand -base64 32
nano .env
find scripts -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
chmod +x scripts/*.sh scripts/lib/*.sh
```

至少填写：

```dotenv
APP_VERSION=v1.0.2
PORT=80
TZ=Asia/Shanghai
JWT_SECRET=<刚生成的随机字符串，至少32字符>
ADMIN_PASSWORD=<至少12字符的独立强密码>
HOST_DATA_DIR=/srv/sacred-focus/data
NGINX_SSL_DIR=/etc/sacred-focus/tls
ALLOWED_ORIGINS=https://focus.example.com
TRUSTED_IPS=
MAX_PERSONAL_ACCOUNTS=20
PUBLIC_DATA_LIMIT_MB=50
PERSONAL_DATA_LIMIT_MB=256
```

`PORT=80` 是当前更新脚本的**宿主机健康探测端口**：TLS overlay 隐藏应用端口，脚本应探测 Nginx 的 HTTP `/api/health`。容器中的应用仍监听 3000。仅使用基础 Compose 时，改回你的本机维护端口（默认 3000）。不要在启用 overlay 前以这份 `PORT=80` 配置启动基础 Compose。

资源参数可先保留模板默认值。修改内存上限时同步调整 `APP_MEMORY_SWAP_LIMIT`，并使 `NODE_HEAP_LIMIT_MB` 小于容器内存上限；相同的 memory/swap 总上限表示不允许额外使用 Swap。

## 5. 先申请证书，再启动 TLS 网关

仓库中的 Nginx 配置同时监听 80 和 443；启动时就必须读到 `server.crt` 和 `server.key`。没有证书时，它不能先作为 HTTP 网关运行。因此首次部署先用 Certbot standalone 申请证书，再启动 Compose。

检查 80 端口没有被其他程序占用；若这台主机已有网关，要在维护窗口临时停止占用者，或另行采用 DNS 验证，不要直接终止不明服务。

```bash
sudo ss -ltnp '( sport = :80 )'
sudo certbot certonly --standalone --cert-name focus.example.com \
  -d focus.example.com --email you@example.com --agree-tos

sudo install -m 644 /etc/letsencrypt/live/focus.example.com/fullchain.pem /etc/sacred-focus/tls/server.crt
sudo install -m 600 /etc/letsencrypt/live/focus.example.com/privkey.pem /etc/sacred-focus/tls/server.key
```

替换域名和邮箱。Standalone 校验需要公网可达的 80 端口；失败时核对解析、域名状态、安全组、防火墙和端口占用。[Certbot standalone 说明](https://eff-certbot.readthedocs.io/en/stable/using.html#standalone)

不要将 `/etc/letsencrypt/live/` 下的符号链接直接复制或软链接到项目目录；Nginx 容器只能读取挂载的证书目录。`install` 会复制目标文件的内容。

## 6. 加载、初始化数据权限与启动

每个新的 SSH 会话进入目录后都设置 `COMPOSE_FILE`，后续 Compose 和脚本必须使用同一组服务：

```bash
cd /opt/sacred-focus
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
docker load -i release/sacred-focus-v1.0.2.tar
docker compose --env-file .env config --quiet

# 镜像以 node 用户运行；绑定宿主机目录后必须重新设置挂载目录属主。
docker compose --env-file .env run --rm --no-deps --user 0 --entrypoint sh sacred-focus \
  -c 'chown -R node:node /app/data'
docker compose --env-file .env up -d
```

上述权限初始化仅针对这份 Compose 的 `/app/data` 挂载，避免对共享目录执行全目录属主变更。不要用 `chmod 777` 处理数据库写入错误。

```bash
docker compose ps
curl --fail --show-error http://127.0.0.1/api/health
curl --fail --show-error https://focus.example.com/api/health
docker compose logs --tail=100 sacred-focus
docker compose logs --tail=100 nginx
```

用手机访问正式域名，不应出现证书警告。默认是公用账号，访客共享其体验数据；登录 `admin` 使用 `.env` 中的初始密码。朋友账号在服务器创建，见 [多人使用指南](multiuser.md)，没有网页自由注册入口。

## 7. 续期与验收

Standalone 续期同样需要释放 80 端口；`certbot renew --dry-run` 在 Nginx 占用 80 时会失败。先在维护窗口演练；结束后无论成功失败都重新启动原网关：

```bash
cd /opt/sacred-focus
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
docker compose stop nginx
sudo certbot renew --cert-name focus.example.com --dry-run
docker compose start nginx
curl --fail --show-error https://focus.example.com/api/health
```

`--dry-run` 不部署真实续期证书。真实续期时，停止网关后运行 `sudo certbot renew --cert-name focus.example.com`；成功后重新执行第 5 节的两个 `install` 命令，再 `docker compose start nginx`。若原网关未停止而证书文件已替换，执行 `docker compose exec nginx nginx -t` 后 `docker compose exec nginx nginx -s reload`，或重启网关，使新证书生效。

安装方式可能已经带有自动续期定时器，但它不会自动释放容器的 80 端口，也不会自动复制证书到本项目目录。自动续期应完整配置 pre hook 停网关、deploy hook 复制有效证书、post hook 恢复网关，并使用绝对路径和明确的 Compose 文件。验证完整流程后再依赖定时续期。[Certbot 续期与 hooks](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)

## 8. 备份、迁移与后续更新

```bash
cd /opt/sacred-focus
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
sudo env COMPOSE_FILE="$COMPOSE_FILE" ./scripts/docker-backup.sh
sudo ls -lh /srv/sacred-focus/data/backup
```

服务器备份包括管理员数据库和账号注册表、公用工作区及所有已存在的个人工作区数据库；把同名 `.db`、`.manifest.json`、`_accounts/` 及冷备可能包含的 WAL 一并离线保存。应用没有跨账号事务，备份时避免创建账号或其他维护操作。详细恢复流程见 [交付与运维手册](../scripts/README.md)。

VMware 到新云服务器的**单账号业务迁移**可使用网页“跨设备数据迁移与整机备份”导出/导入 JSON；它不含其他账号及账号注册表。迁移全部账号时，用服务器完整快照按恢复流程操作，不要在应用运行时直接复制 `app.db`。

后续按 [云服务器项目更新步骤](cloud-server-update.md) 执行。更新脚本会保存更新前全账号快照，但自动回滚只恢复应用镜像版本和容器，不自动回退数据库、Compose 或网关配置。
