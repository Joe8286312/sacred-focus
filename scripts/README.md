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

先做备份；脚本优先采用 SQLite 在线备份，必要时短暂停顿容器冷备，并保留最近 14 天的日常备份：

```bash
./scripts/docker-backup.sh
ls -lh "${HOST_DATA_DIR:-./data}/backup"
```

恢复是有停机窗口的人工操作。仅使用已校验的 `.db` 备份，先另存现有数据库，再停止应用并替换数据文件：

```bash
./scripts/docker-backup.sh
docker compose stop sacred-focus
cp "${HOST_DATA_DIR:-./data}/backup/app_backup_YYYYMMDD_HHMMSS.db" "${HOST_DATA_DIR:-./data}/app.db"
rm -f "${HOST_DATA_DIR:-./data}/app.db-wal" "${HOST_DATA_DIR:-./data}/app.db-shm"
docker compose up -d sacred-focus
curl -fsS http://127.0.0.1:${PORT:-3000}/api/health
```

将 `YYYYMMDD_HHMMSS` 替换为实际备份名。`rm -f` 仅应在已确认用一致性 `.db` 快照覆盖主库后执行，用于清除不属于该快照的旧 WAL/SHM；恢复后应检查业务数据并记录结果。

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
