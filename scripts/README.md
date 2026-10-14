# Sacred Focus 交付与运维手册

本手册覆盖镜像、Compose、Nginx、数据卷和运维脚本。首次上线见 [云服务器首次部署清单](../docs/cloud-production-deployment.md)，已有云服务器更新按 [项目更新步骤](../docs/cloud-server-update.md) 执行。所有命令在包含 `docker-compose.yml`、`scripts/` 和 `.env` 的发布目录执行。

## 1. 前置条件与配置约定

需要 Docker Engine 和 Compose **2.24.4 或以上**；TLS overlay 使用此版本起支持的 `!override` 清除基础应用端口映射。[Docker 合并规则](https://docs.docker.com/reference/compose-file/merge/)

在每个新 shell 会话选择与现有部署一致的编排：

```bash
cd /opt/sacred-focus
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
```

仅基础 Compose 时用 `export COMPOSE_FILE=docker-compose.yml`。如现有部署有 `COMPOSE_PROJECT_NAME`，保持原值；不要创建同目录中的另一组容器。更新脚本执行 `up -d --remove-orphans`，遗漏网关 overlay 会把网关视为未声明服务。

首次部署在服务器创建真实配置，已有服务器更新时保留原 `.env`，只合并需要的字段，不能覆盖密钥：

```bash
cp .env.production.example .env
chmod 600 .env
```

至少设置 `APP_VERSION`、高熵 `JWT_SECRET`、强 `ADMIN_PASSWORD`、`HOST_DATA_DIR`、`PORT`、`TZ` 与 `ALLOWED_ORIGINS`。`HOST_DATA_DIR` 保存管理员数据库及账号注册表、`accounts/` 中各工作区数据库、WAL 和备份。

当前更新脚本从 `.env` 读取 `PORT`，探测宿主机对应的 HTTP 端口：

| 运行方式 | `.env` 的 `PORT` | 健康探针 |
|---|---|---|
| 仅基础 Compose | `3000`，或实际本机映射端口 | `http://127.0.0.1:3000/api/health` |
| 项目 Nginx TLS overlay | `80` | `http://127.0.0.1/api/health` |

TLS 下应用容器仍监听 3000，但宿主机没有该端口映射；`PORT=80` 供脚本探测网关，不改变应用监听端口。不要在未启用 overlay 时以这份 TLS 配置启动基础 Compose。

发布预检分两处执行。在**完整源码仓库**运行：

```bash
bash ./scripts/verify-delivery.sh
npm test
npm run build
```

`verify-delivery.sh` 无需 Docker daemon，但要求 Dockerfile、`.dockerignore` 等构建文件，最小运行发布包不满足其条件。在目标机执行：

```bash
docker compose --env-file .env config --quiet
```

`config --quiet` 只验证配置，不确认镜像、证书或数据权限可用；避免把包含生产密钥的完整 `docker compose config` 输出写入公开日志。

## 2. 构建与离线交付

在项目根目录构建，版本必须为 `x.y.z`，选择未使用过的新版本；Docker 标签、tar 名和 `APP_VERSION` 保持一致：

```bash
./scripts/docker-pack.sh 1.2.3
```

Windows PowerShell：

```powershell
.\scripts\docker-pack.ps1 -Version 1.2.3 -VcsRef (git rev-parse --short HEAD)
```

产物为 `release/sacred-focus-v1.2.3.tar`，包含该版本应用镜像和 `latest` 标签，不包含 Nginx 镜像。TLS 目标机需能拉取 `nginx:1.27-alpine`；完全离线时另行导出并加载网关镜像。

交付 tar、两个 Compose 文件、`scripts/`（包含 `lib/`）、`nginx/conf.d/` 和 `.env.production.example`；首次部署在目标机配置独立 `.env`。不要传送源机器的 `.env`、数据目录、备份或 TLS 私钥。内网演练可交付证书脚本，在目标机生成证书。打包不会自动提交 Git，也不会创建同名 Git tag。

目标机加载镜像并初始化**本项目独占**数据目录权限：

```bash
docker load -i release/sacred-focus-v1.2.3.tar
docker compose --env-file .env run --rm --no-deps --user 0 --entrypoint sh sacred-focus \
  -c 'chown -R node:node /app/data'
```

镜像以 `node` 用户运行，宿主机绑定目录会覆盖镜像内目录原来的属主，Dockerfile 的 `chown` 无法保证绑定目录可写。不要用 `chmod 777` 处理写权限问题。运行命令前确认 `HOST_DATA_DIR` 没有指向其他项目的共享目录。

## 3. TLS 网关启动与健康验收

TLS overlay 在启动时就需要仓库外 `NGINX_SSL_DIR` 中的有效证书和私钥。首次正式部署先申请证书，再启动；它不能在缺证书时先作为 HTTP 网关运行。申请、复制、standalone 续期停网关的顺序见 [证书管理](../nginx/ssl/README.md) 和 [云部署清单](../docs/cloud-production-deployment.md)。

```bash
# .env：NGINX_SSL_DIR=/etc/sacred-focus/tls、PORT=80
sudo test -s /etc/sacred-focus/tls/server.crt
sudo test -s /etc/sacred-focus/tls/server.key
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d

docker compose ps
curl -fsS http://127.0.0.1/api/health
curl --fail --show-error https://focus.example.com/api/health
docker compose logs --tail=100 sacred-focus
docker compose logs --tail=100 nginx
```

仅基础 Compose 时不启动 Nginx，探针改为实际本机映射端口。不要假设 `.env` 自动成为 shell 的环境变量。TLS 正式验收不加 `-k`，要验证域名和完整证书链；自签名内网演练可临时使用 `-k`。

Nginx overlay 隐藏应用端口，启用 80/443 入口并把 `TRUST_PROXY=1` 提供给受控单层代理链。应用容器重建后，如果网关缓存的上游 IP 已过时，重启 Nginx 再验收。证书和私钥不得加入 Git、镜像构建上下文或交付 tar。

## 4. 全账号备份

备份脚本优先使用宿主 Python SQLite 或容器 SQLite 在线备份并校验各库完整性。在线运行时不可用时，仅在容器成功暂停后复制数据库及必要 WAL。每次备份包含管理员、公用及所有已有个人工作区数据库：

```bash
sudo env COMPOSE_FILE="$COMPOSE_FILE" ./scripts/docker-backup.sh
sudo ls -lh /srv/sacred-focus/data/backup
```

脚本从发布目录 `.env` 读取 `HOST_DATA_DIR`，不依赖同名 shell 环境变量；上面的 `ls` 使用你实际的数据路径。快照是 `0600`，可能归宿主机或容器 root 所有，归档和恢复需足够权限。使用 `sudo` 时显式传入 `COMPOSE_FILE`；如设置了 `COMPOSE_PROJECT_NAME`，一并传入。

完整备份套件：

```text
app_backup_YYYYMMDD_HHMMSS.db                # 管理员数据与账号注册表
app_backup_YYYYMMDD_HHMMSS.db.manifest.json  # 备份方法、源路径和快照清单
app_backup_YYYYMMDD_HHMMSS_accounts/         # public 与个人 UUID 数据库（存在时）
app_backup_YYYYMMDD_HHMMSS.db-wal            # 冷备可能包含
```

`consistency: per-database` 表示逐库一致快照，业务没有跨账号事务；备份期间避免账号创建等维护。冷备为 `method: cold-copy`、`consistency: paused-copy-with-wal`，账号目录也可能包含 WAL。根 `.db` 最后发布，只有命令成功才说明完整备份结束；任一已有账号数据库失败都使整次备份失败。

转移时一起保存 `.db`、manifest、`_accounts/` 及配套 WAL。`docker-backup.sh` 清理超过 14 天的 `app_backup_*` 日常套件；`app_pre_update_*` 更新前套件不参与该清理，应另行按磁盘空间规划保留。将备份复制到服务器外，单磁盘内备份不能抵御磁盘损坏。

网页“完整备份”只包含当前账号业务内容，不包含其他工作区或账号注册表，不能替代服务器备份。账号维护见 [多人使用指南](../docs/multiuser.md)。

## 5. 全服务器恢复演练

恢复会停机，并覆盖当前所有账号的数据。先核对备份 manifest、恢复范围和真实数据路径；下面示例只用于 `python-sqlite-online` 或 `better-sqlite-online` **在线快照**。日期和数据目录必须按实际修改，且备份目录不得与恢复目标混淆。

先保存恢复前备份，在普通运维 shell 中定义明确的路径：

```bash
sudo env COMPOSE_FILE="$COMPOSE_FILE" ./scripts/docker-backup.sh
RESTORE_DATA_DIR=/srv/sacred-focus/data
RESTORE_SNAPSHOT="${RESTORE_DATA_DIR}/backup/app_backup_YYYYMMDD_HHMMSS.db"
RESTORE_ACCOUNTS="${RESTORE_SNAPSHOT%.db}_accounts"
RESTORE_OLD="${RESTORE_DATA_DIR}/before_restore_$(date +%Y%m%d_%H%M%S)"
sudo test -s "$RESTORE_SNAPSHOT"
sudo cat "${RESTORE_SNAPSHOT}.manifest.json"
```

逐项核对 manifest 中数据库数量及文件。若清单包含 public 或个人数据库但 `_accounts/` 缺失，停止恢复，不要恢复成只有管理员的半套数据。确认在线快照之后执行：

```bash
(
set -e
docker compose stop nginx sacred-focus
sudo mkdir -p "$RESTORE_OLD"
sudo cp -a "${RESTORE_DATA_DIR}/app.db" "$RESTORE_OLD/"
for suffix in -wal -shm; do
  if sudo test -f "${RESTORE_DATA_DIR}/app.db${suffix}"; then
    sudo cp -a "${RESTORE_DATA_DIR}/app.db${suffix}" "$RESTORE_OLD/"
  fi
done
if sudo test -d "${RESTORE_DATA_DIR}/accounts"; then
  sudo mv "${RESTORE_DATA_DIR}/accounts" "$RESTORE_OLD/accounts"
fi
sudo mkdir -p "${RESTORE_DATA_DIR}/accounts"
if sudo test -d "$RESTORE_ACCOUNTS"; then
  sudo cp -a "${RESTORE_ACCOUNTS}/." "${RESTORE_DATA_DIR}/accounts/"
fi
sudo cp "$RESTORE_SNAPSHOT" "${RESTORE_DATA_DIR}/app.db"
sudo rm -f "${RESTORE_DATA_DIR}/app.db-wal" "${RESTORE_DATA_DIR}/app.db-shm"
docker compose run --rm --no-deps --user 0 --entrypoint sh sacred-focus \
  -c 'chown -R node:node /app/data/accounts /app/data/app.db'
docker compose up -d sacred-focus nginx
curl -fsS http://127.0.0.1/api/health
curl --fail --show-error https://focus.example.com/api/health
)
```

仅基础 Compose 时从 `stop` / `up` 中移除 `nginx`，并使用相应本机探针。操作中任一步失败，保留 `before_restore_*`，停止继续启动并排查；它保存了还原前数据库、WAL/SHM 和账号目录。恢复后核对公用、管理员和个人账号的数据、账号启停状态与登录行为。

若使用 `cold-copy`，不能照搬在线快照的 WAL 处理：停止应用，另存原数据并清理旧 WAL/SHM，再复制备份 `.db` 和配套根 `.db-wal` 为 `app.db` / `app.db-wal`，同时保留 `_accounts/` 中各库的 WAL。重新赋予这些还原文件 node 读写权限再启动。不要在恢复 `.db` 后丢弃对应 WAL。

## 6. 更新事务与回滚边界

通常使用离线 tar；首次部署前不要用更新命令代替密钥、权限与证书初始化：

```bash
sudo env COMPOSE_FILE="$COMPOSE_FILE" ./scripts/docker-update.sh release/sacred-focus-v1.2.3.tar
# sudo 下 sed 可能重建 .env；无论成功失败均恢复运维用户属主及权限。
sudo chown "$USER":"$USER" .env
chmod 600 .env
```

更新事务：全账号预更新备份 → 加载或拉取镜像 → 修改 `.env` 的 `APP_VERSION` → `up -d --remove-orphans` → HTTP 健康检查。备份或获取镜像失败时不切换版本；启动或健康检查失败时输出最近 100 行应用日志，恢复原版本并重新启动旧容器。

| 退出码 | 含义 |
|---|---|
| `0` | 更新成功 |
| `1` | 前置步骤失败，或更新失败且自动回滚成功；需看日志区分 |
| `2` | 自动回滚也失败，需人工恢复 |

退出码 `2` 表示旧版本也未通过恢复或健康检查；保留日志并按更新指南执行人工回退，不能将它记为已恢复服务。

自动回滚**只恢复镜像版本和容器**，不自动回退数据库、Compose、Nginx 文件或其他 `.env` 参数。涉及数据库迁移时，先确认旧镜像能否使用迁移后的数据；必要时按完整快照恢复。更新后的用户行为、账号隔离和 HTTPS 仍需人工验收。

脚本也支持 `./scripts/docker-update.sh v1.2.3`，但它按 Compose 中的 `sacred-focus:v1.2.3` 拉取镜像。仓库默认没有配置可供你拉取的远程镜像仓库，`docker-pack` 的可选 Registry 参数不会替服务器改 Compose 镜像路径；未自行配置仓库时使用离线 tar。无参数更新只重新拉取当前配置版本，不会自动发现新发布。

完整的暂存运行文件、保护原配置、校验新镜像、更新后恢复 `.env` 权限、网关验收和人工回滚命令见 [云服务器项目更新步骤](../docs/cloud-server-update.md)。发布前在测试环境演练一次失败更新和完整恢复，不要删除旧镜像或数据库来处理更新失败。

## 7. 发布证据

记录镜像版本、VCS revision、环境、操作者、更新日志、HTTP/HTTPS 健康检查结果、备份文件名和恢复演练结果。记录中不要包含密码、JWT、私钥或数据库内容。静态预检和构建通过不代表实际目标服务器已完成 TLS、备份恢复和回滚演练，应分别记录实际验收状态。
