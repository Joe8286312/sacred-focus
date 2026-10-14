# Sacred Focus 交付与运维手册

本手册只覆盖镜像、Compose、Nginx、数据卷和运维脚本。它不要求了解应用的领域目录或内部实现。所有命令都应在包含 `docker-compose.yml`、`scripts/` 和 `.env` 的发布目录执行。

使用 Nginx TLS overlay 时，每个新的 shell 会话先执行：

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
```

这样 `docker compose` 与 `scripts/docker-*.sh` 会管理同一组应用和网关容器；特别是执行更新脚本前必须保留该变量，避免 `--remove-orphans` 将网关视为未声明服务。

## 1. 发布前预检

需要 Docker Engine/Compose v2；TLS 模式还需要一对由受信任 CA 签发的 `server.crt`、`server.key`。先执行无需 Docker daemon 的静态预检：

```bash
bash ./scripts/verify-delivery.sh
```

再创建真实生产配置，不能把 `.env.production.example` 中的占位符直接投入生产：

```bash
cp .env.production.example .env
chmod 600 .env
```

至少设置 `APP_VERSION`、高熵 `JWT_SECRET`、强 `ADMIN_PASSWORD`、`HOST_DATA_DIR`、`PORT`、`TZ` 与 `ALLOWED_ORIGINS`。`HOST_DATA_DIR` 是唯一的数据持久化位置；备份和恢复均以它为准。

检查 Compose 变量与 YAML 合并结果（这一步不启动容器）：

```bash
docker compose --env-file .env config --quiet
```

## 2. 构建与离线交付

在构建机执行，版本必须为 `x.y.z`：

```bash
./scripts/docker-pack.sh 1.2.3
# Windows PowerShell： .\scripts\docker-pack.ps1 -Version 1.2.3
```

产物为 `release/sacred-focus-v1.2.3.tar`。将该 tar、Compose 文件、`scripts/`、`nginx/` 与已配置的 `.env` 传输至目标机；不要传输数据库、TLS 私钥或源机器的 `.env`。

目标机首次离线部署：

```bash
docker load -i release/sacred-focus-v1.2.3.tar
docker compose --env-file .env up -d
curl -fsS http://127.0.0.1:${PORT:-3000}/api/health
```

基础 Compose 仅绑定 `127.0.0.1`。它适用于本机维护或已有外部网关的主机，不会直接把应用端口公开到公网。

## 3. TLS 网关部署

在仓库外创建证书目录，并确保 Docker 可读取其中的两个文件：

```bash
export NGINX_SSL_DIR=/srv/sacred-focus-tls
test -r "$NGINX_SSL_DIR/server.crt" && test -r "$NGINX_SSL_DIR/server.key"
docker compose --env-file .env -f docker-compose.yml -f docker-compose.nginx.yml config --quiet
docker compose --env-file .env -f docker-compose.yml -f docker-compose.nginx.yml up -d
```

Nginx overlay 会隐藏应用的 3000 端口、启用 HTTPS 入口并将 `TRUST_PROXY=1` 仅提供给该受控代理链。证书目录不得加入 Git、镜像构建上下文或交付 tar。

## 4. 健康检查与发布证据

每次部署或更新后记录以下输出（版本、时间、操作者和结果）：

```bash
docker compose ps
curl -fsS http://127.0.0.1:${PORT:-3000}/api/health
docker compose logs --tail=100 sacred-focus
```

TLS 模式可从可信客户端额外验证：

```bash
curl --fail --show-error https://your-domain.example/api/health
```

## 5. 备份与恢复演练

先做备份；脚本优先采用 Python 或容器 SQLite 在线备份，每个数据库独立取得一致快照。没有在线运行时时，只在容器成功暂停后冷备并复制必要 WAL。脚本备份管理员、公用与所有已有个人数据库，并保留最近 14 天的日常备份：

```bash
./scripts/docker-backup.sh
ls -lh "${HOST_DATA_DIR:-./data}/backup"
```

一次完整备份由以下文件组成，转移备份时必须一并保存：

```text
app_backup_YYYYMMDD_HHMMSS.db                # 管理员数据与账号注册表
app_backup_YYYYMMDD_HHMMSS.db.manifest.json  # 方法、源路径与快照清单
app_backup_YYYYMMDD_HHMMSS_accounts/         # public 与各 UUID 的数据库
```

清单中的 `consistency: per-database` 表示逐库一致快照；业务没有跨账号事务，备份期间应避免执行账号创建或其他服务器维护。冷备清单为 `paused-copy-with-wal`，可能额外包含根数据库的 `.db-wal` 和各账号数据库的 WAL。根 `.db` 文件发布完成才表示整次备份成功；任一已有账号数据库备份失败都会使脚本失败。

恢复是有停机窗口的人工操作。下面示例用于清单 `method` 为 `python-sqlite-online` 或 `better-sqlite-online` 的在线快照，先另存现有数据，再停止应用并同时还原注册表和账号目录：

```bash
./scripts/docker-backup.sh
docker compose stop sacred-focus
RESTORE_DATA_DIR="${HOST_DATA_DIR:-./data}"
RESTORE_SNAPSHOT="${RESTORE_DATA_DIR}/backup/app_backup_YYYYMMDD_HHMMSS.db"
RESTORE_ACCOUNTS="${RESTORE_SNAPSHOT%.db}_accounts"
cat "${RESTORE_SNAPSHOT}.manifest.json"
# 确认使用的是已校验的在线快照；将现有账号目录另存，以免混用旧 WAL。
if [ -d "${RESTORE_DATA_DIR}/accounts" ]; then
    mv "${RESTORE_DATA_DIR}/accounts" "${RESTORE_DATA_DIR}/accounts_before_restore_$(date +%Y%m%d_%H%M%S)"
fi
mkdir -p "${RESTORE_DATA_DIR}/accounts"
if [ -d "${RESTORE_ACCOUNTS}" ]; then
    cp -a "${RESTORE_ACCOUNTS}/." "${RESTORE_DATA_DIR}/accounts/"
fi
cp "${RESTORE_SNAPSHOT}" "${RESTORE_DATA_DIR}/app.db"
rm -f "${RESTORE_DATA_DIR}/app.db-wal" "${RESTORE_DATA_DIR}/app.db-shm"
# 备份为 0600；还原后重新赋予容器 node 用户读取和写入权限。
docker compose run --rm --no-deps --user 0 --entrypoint sh sacred-focus -c 'chown -R node:node /app/data/accounts /app/data/app.db'
docker compose up -d sacred-focus
curl -fsS http://127.0.0.1:${PORT:-3000}/api/health
```

将 `YYYYMMDD_HHMMSS` 替换为实际备份名。`rm -f` 只清理不属于新快照的旧 WAL/SHM。若清单是 `cold-copy`，必须在清理旧 WAL 后，将备份的根 `.db-wal` 复制为 `app.db-wal`，并保留账号目录中对应的 WAL；不能只恢复 `.db` 后丢弃配套 WAL。恢复后检查管理员和个人账号的数据并记录结果。

个人网页“完整备份”只包含当前账号的业务内容，不能代替服务器注册表与全部账号备份。服务器创建、停用和重置个人账号的操作见 [多人使用指南](../docs/multiuser.md)。

## 6. 更新与自动回滚

在线更新：

```bash
./scripts/docker-update.sh v1.2.3
```

离线更新：

```bash
./scripts/docker-update.sh release/sacred-focus-v1.2.3.tar
```

更新事务顺序为：预更新备份 → 加载/拉取镜像 → 写入 `APP_VERSION` → 启动容器 → 健康检查。拉取或备份失败时不会修改版本或替换容器；启动或健康检查失败时会输出最近 100 行容器日志、恢复原 `APP_VERSION` 并重新启动旧容器。退出码 `1` 表示更新失败但回滚成功，退出码 `2` 表示回滚本身失败，应立即保留日志、停止进一步操作并人工处置。

发布前至少在非生产环境演练一次失败回滚：使用一个无法通过 `/api/health` 的镜像运行更新脚本，确认 `.env` 中版本恢复、旧服务返回 200 且失败日志已采集。不得以删除旧镜像或数据库作为回滚手段。

## 7. 最终验收清单

- `bash ./scripts/verify-delivery.sh`、`npm test` 与 `npm run build` 均通过。
- 基础 Compose 与 TLS overlay 的 `config --quiet` 均通过。
- 实际目标环境完成一次 TLS 启动、一次健康检查、一次数据库恢复演练和一次失败更新回滚演练。
- 交付记录包含镜像版本、VCS revision、环境、健康检查、备份文件名、演练时间和操作者；不包含密码、JWT、私钥或数据库内容。
