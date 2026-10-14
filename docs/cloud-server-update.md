# 已部署云服务器的项目更新步骤

本指南用于更新已经运行的 Sacred Focus，按“Windows 本机打包 → 上传发布物 → 服务器备份 → 替换运行文件 → 更新容器 → 验收”的顺序操作。首次部署见 [云服务器首次部署清单](cloud-production-deployment.md)，全账号恢复见 [交付与运维手册](../scripts/README.md)，账号管理见 [多人使用指南](multiuser.md)。

文中的本机目录是 `D:\Codes\Projects\sacred-focus`，服务器发布目录是 `/opt/sacred-focus`，域名与 SSH 地址为示例。本文没有连接或更新你的服务器。命令假设服务器使用 Bash，当前登录的是能够使用 Docker 和 `sudo` 的普通管理用户；直接以 root 登录时按实际用户调整文件属主。

## 1. 先确定此次发布内容与版本

一次更新需要两部分：

| 发布物 | 作用 |
|---|---|
| `sacred-focus-vX.Y.Z.tar` | 后端程序、前端页面及运行依赖的 Docker 镜像 |
| `sacred-focus-runtime-vX.Y.Z.tar.gz` | Compose、更新/备份脚本、Nginx 配置及配置模板 |

**只上传镜像 tar 不会更新服务器上的 `scripts/`、Compose 或 Nginx 配置。** 本次多人功能还依赖全账号备份脚本与新增 Compose 环境变量，因此两部分必须一起交付。`git pull` 也不会让现有容器自动运行新代码；镜像必须重新构建并重新创建容器。

以下使用 **`1.0.3` / `v1.0.3` 作为示例**，不代表仓库已经发布或当前最新版本。选择一个尚未使用的新版本，避免覆盖仍可能用于回滚的旧标签。以下四处必须一致：

1. 本机构建参数：`-Version 1.0.3`。
2. 镜像标签：`sacred-focus:v1.0.3`。
3. 离线包名：`sacred-focus-v1.0.3.tar`。
4. 更新后服务器 `.env`：`APP_VERSION=v1.0.3`，由更新脚本写入。

镜像架构也必须匹配服务器。常见 x86 云服务器的 `uname -m` 是 `x86_64`，对应镜像 `amd64`；ARM 服务器通常是 `aarch64`，对应 `arm64`。当前打包脚本使用构建机的默认 Docker 平台，跨架构时先调整构建环境，不能直接上传不匹配的镜像。

## 2. Windows 本机构建并生成运行文件包

启动 Docker Desktop，使用 Linux containers。在 PowerShell 执行：

```powershell
Set-Location D:\Codes\Projects\sacred-focus
git status --short
git log -5 --oneline
docker version

$Version = "1.0.3"
$VcsRef = (git rev-parse --short HEAD).Trim()
.\scripts\docker-pack.ps1 -Version $Version -VcsRef $VcsRef
if ($LASTEXITCODE -ne 0) { throw "镜像打包失败，停止发布" }

docker image inspect "sacred-focus:v$Version" --format '{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.version"}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
if ($LASTEXITCODE -ne 0) { throw "找不到新镜像，停止发布" }

$ImageTar = "release/sacred-focus-v$Version.tar"
if (-not (Test-Path $ImageTar) -or (Get-Item $ImageTar).Length -eq 0) {
    throw "离线镜像包缺失或为空，停止发布"
}

$RuntimeTar = "release/sacred-focus-runtime-v$Version.tar.gz"
tar -czf $RuntimeTar Dockerfile .dockerignore .env.production.example docker-compose.yml docker-compose.nginx.yml scripts nginx/conf.d
if ($LASTEXITCODE -ne 0) { throw "运行文件包生成失败，停止发布" }

tar -tzf $RuntimeTar
$ChecksumLines = foreach ($ReleaseFile in @($ImageTar, $RuntimeTar)) {
    $FileHash = (Get-FileHash -Algorithm SHA256 $ReleaseFile).Hash.ToLowerInvariant()
    "$FileHash  $(Split-Path $ReleaseFile -Leaf)"
}
# 使用 ASCII 与 LF 换行，确保 Linux 校验时文件名不带 Windows 回车字符。
$ChecksumPath = Join-Path (Get-Location).Path "release/SHA256SUMS-v$Version.txt"
[System.IO.File]::WriteAllText($ChecksumPath, (($ChecksumLines -join "`n") + "`n"), [System.Text.Encoding]::ASCII)
```

检查运行文件列表应包含 `scripts/lib/database-backup.sh`、`backup-databases.py` 和 `backup-databases.cjs`。发布包通过明确列出文件来排除本机 `.env`、`data/`、`nginx/ssl/` 和私钥；不要改为打包整个项目目录。

构建使用的是当前本机源码。先确认需要发布的修改确实在这个工作区中；如果提交尚未推送，服务器执行 `git pull` 无法取得这些修改。本机离线构建可以包含本机提交，不需要先把提交推到 GitHub。`VcsRef` 只记录 HEAD；未提交代码不会体现在这个提交号中。

Linux/macOS 构建机可使用 `VCS_REF="$(git rev-parse --short HEAD)" ./scripts/docker-pack.sh 1.0.3` 生成同名离线镜像包，运行文件仍需另外打包。

## 3. 上传并在服务器暂存解包

先登录服务器，创建上传目录；将示例地址替换为真实地址：

```powershell
$Server = "ubuntu@203.0.113.10"
ssh $Server
```

在服务器执行后退出：

```bash
mkdir -p /opt/sacred-focus/incoming
exit
```

回到 Windows PowerShell，上传刚才的三个文件：

```powershell
scp "release/sacred-focus-v$Version.tar" "release/sacred-focus-runtime-v$Version.tar.gz" "release/SHA256SUMS-v$Version.txt" "${Server}:/opt/sacred-focus/incoming/"
if ($LASTEXITCODE -ne 0) { throw "上传失败，停止发布" }
ssh $Server
```

在服务器中重新设置版本。此后的命令都在同一个 Bash 会话执行，保留这些变量：

```bash
set -e
SF_VERSION=1.0.3
SF_RUN_DIR=/opt/sacred-focus
SF_STAGE="${SF_RUN_DIR}/staging/v${SF_VERSION}"
SF_OPERATOR="$(id -un)"
SF_OPERATOR_GROUP="$(id -gn)"
uname -m
df -h "${SF_RUN_DIR}"

cd "${SF_RUN_DIR}/incoming"
sha256sum -c "SHA256SUMS-v${SF_VERSION}.txt"
```

两项必须都显示 `OK`，否则重新传输，不能继续。新暂存目录应为空：

```bash
test ! -e "${SF_STAGE}"
mkdir -p "${SF_STAGE}"
tar -xzf "sacred-focus-runtime-v${SF_VERSION}.tar.gz" -C "${SF_STAGE}"
find "${SF_STAGE}/scripts" -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
find "${SF_STAGE}/scripts" -type f -name '*.sh' -exec chmod +x {} +
bash "${SF_STAGE}/scripts/verify-delivery.sh"
```

如果 `test`、解包或预检失败，停下检查。不要复用包含旧文件的 staging 目录。`sed` 将 Windows 的 CRLF 转成 LF，避免 `$'\r': command not found` 或 `bad interpreter`。可执行权限不会可靠地随 Windows 发布包保留，因此要在 Linux 设置。

## 4. 记录旧版本并保存旧运行配置

先确认当前使用的编排与 Compose 项目名。以下命令针对本项目标准的 Nginx TLS 部署：

```bash
cd "${SF_RUN_DIR}"
test -f .env
docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' sacred-focus
export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml
export COMPOSE_PROJECT_NAME="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' sacred-focus)"
test -n "${COMPOSE_PROJECT_NAME}"
sudo env COMPOSE_FILE="${COMPOSE_FILE}" COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" docker compose ps
```

如果现有部署还使用其他 overlay、自定义文件或项目名，保留同一组文件和项目名，不能照抄成另一组。每个新 SSH 会话都要重新设置 `COMPOSE_FILE`；更新脚本执行 `up -d --remove-orphans`，漏掉 Nginx overlay 可能把网关当作多余容器移除。

保存配置与旧镜像信息：

```bash
umask 077
SF_ROLLBACK="${SF_RUN_DIR}/rollback/$(date +%Y%m%d_%H%M%S)"
mkdir -p "${SF_ROLLBACK}/config"

SF_OLD_CONTAINER="$(sudo env COMPOSE_FILE="${COMPOSE_FILE}" COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" docker compose ps -q sacred-focus)"
test -n "${SF_OLD_CONTAINER}"
docker inspect --format '{{.Config.Image}} {{.Image}}' "${SF_OLD_CONTAINER}" > "${SF_ROLLBACK}/old-image.txt"
SF_OLD_IMAGE_ID="$(docker inspect --format '{{.Image}}' "${SF_OLD_CONTAINER}")"
SF_ROLLBACK_IMAGE="sacred-focus:rollback-$(basename "${SF_ROLLBACK}")"
docker image tag "${SF_OLD_IMAGE_ID}" "${SF_ROLLBACK_IMAGE}"
printf 'manual-rollback-image=%s\n' "${SF_ROLLBACK_IMAGE}" >> "${SF_ROLLBACK}/old-image.txt"
printf 'COMPOSE_FILE=%s\nCOMPOSE_PROJECT_NAME=%s\n' "${COMPOSE_FILE}" "${COMPOSE_PROJECT_NAME}" > "${SF_ROLLBACK}/compose-selection.txt"
sudo awk '/^[[:space:]]*APP_VERSION=/' .env > "${SF_ROLLBACK}/old-app-version.txt"
sudo stat -c 'env-owner=%u:%g env-mode=%a' .env > "${SF_ROLLBACK}/env-permissions-before.txt"

SF_CONFIG_FILES=()
for SF_CONFIG_FILE in .env .env.production .env.production.example Dockerfile .dockerignore docker-compose.yml docker-compose.nginx.yml scripts nginx/conf.d; do
    if test -e "${SF_CONFIG_FILE}"; then
        SF_CONFIG_FILES+=("${SF_CONFIG_FILE}")
    fi
done
sudo tar -czf - "${SF_CONFIG_FILES[@]}" > "${SF_ROLLBACK}/runtime-before.tar.gz"
tar -xzf "${SF_ROLLBACK}/runtime-before.tar.gz" -C "${SF_ROLLBACK}/config"
```

自定义 overlay 也要加入 `SF_CONFIG_FILES`。备份包含真实 `.env`，只能存放在受限目录，不能提交 Git 或粘贴到公开日志。TLS 证书及私钥继续留在原 `NGINX_SSL_DIR`；若要备份证书，另存到受保护的位置，不放进发布包。

确认 `.env` 归当前管理用户读取，便于下一步从真实配置解析数据位置：

```bash
sudo chown "${SF_OPERATOR}:${SF_OPERATOR_GROUP}" .env
sudo chmod 600 .env
```

以上为旧镜像额外保留了独立标签，同时还要保留旧离线包。不要在验收前运行 `docker image prune -a`，也不要覆盖旧版本标签。未固定版本、旧值为 `latest` 时，新镜像包会更新 `latest`，脚本恢复这个旧值不能可靠地回到旧代码；需要人工使用记录的独立回滚标签。

## 5. 使用新版脚本备份全部账号

**第一次从单用户版升级时，必须从暂存目录运行新版备份脚本。** 旧服务器的备份脚本可能只保存根 `app.db`，无法覆盖已经存在的公用或个人数据库；直接运行旧脚本然后更新镜像会留下备份缺口。

暂存脚本通过 `SF_ROOT_DIR` 指向现有发布目录，沿用旧编排与真实 `.env`：

```bash
SF_ROOT_DIR="${SF_RUN_DIR}"
source "${SF_STAGE}/scripts/lib/docker-common.sh"
SF_DATA_DIR="$(sf_host_data_dir)"
sudo test -f "${SF_DATA_DIR}/app.db"
df -h "${SF_DATA_DIR}"

SF_BACKUP_STATUS=0
sudo env SF_ROOT_DIR="${SF_RUN_DIR}" COMPOSE_FILE="${COMPOSE_FILE}" COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" bash "${SF_STAGE}/scripts/docker-backup.sh" || SF_BACKUP_STATUS=$?
test "${SF_BACKUP_STATUS}" -eq 0
sudo find "${SF_DATA_DIR}/backup" -maxdepth 1 -type f -name 'app_backup_*.db.manifest.json' -printf '%f\n'
```

确认退出码为 `0` 并找到本次清单。没有数据库、备份失败或清单不完整时先排查，不要继续更新。脚本会优先使用 Python/容器 SQLite 在线快照；无法在线备份时，仅在容器暂停成功后冷备。备份期间不要创建、停用或重置账号。

确认磁盘还容得下新镜像、旧镜像、完整数据包和本次快照；空间不足时先处理无关文件或扩容，不能删掉用于回滚的镜像或本次唯一备份。

一次完整备份包含管理员数据库及账号注册表、公用/个人数据库目录和清单，必须整组保存：

```text
app_backup_YYYYMMDD_HHMMSS.db
app_backup_YYYYMMDD_HHMMSS.db.manifest.json
app_backup_YYYYMMDD_HHMMSS_accounts/    # 有账号数据库时存在
app_backup_YYYYMMDD_HHMMSS.db-wal      # 冷备时可能存在，必须保留
```

用最新日常备份生成可转移的保护包：

```bash
SF_BACKUP_NAME="$(sudo find "${SF_DATA_DIR}/backup" -maxdepth 1 -type f -name 'app_backup_*.db' -printf '%f\n' | sort | tail -n 1)"
test -n "${SF_BACKUP_NAME}"
SF_BACKUP_FILES=("${SF_BACKUP_NAME}" "${SF_BACKUP_NAME}.manifest.json")
for SF_BACKUP_EXTRA in "${SF_BACKUP_NAME%.db}_accounts" "${SF_BACKUP_NAME}-wal"; do
    if sudo test -e "${SF_DATA_DIR}/backup/${SF_BACKUP_EXTRA}"; then
        SF_BACKUP_FILES+=("${SF_BACKUP_EXTRA}")
    fi
done
sudo tar -C "${SF_DATA_DIR}/backup" -czf - "${SF_BACKUP_FILES[@]}" > "${SF_ROLLBACK}/account-snapshots.tar.gz"
tar -tzf "${SF_ROLLBACK}/account-snapshots.tar.gz"
```

首次启用多人版还应在短暂停机窗口保存整个旧数据目录。应用停止后再打包，避免直接复制正在写入的 SQLite/WAL 文件：

```bash
docker compose stop sacred-focus
if sudo tar -C "${SF_DATA_DIR}" -czf - . > "${SF_ROLLBACK}/data-before.tar.gz"; then
    docker compose start sacred-focus
else
    docker compose start sacred-focus
    printf '完整数据目录打包失败，停止更新。\n' >&2
    exit 1
fi
```

回到 Windows 的另一个 PowerShell 窗口，把 `SF_ROLLBACK` 的实际时间戳目录复制到受保护的本地位置，例如：

```powershell
New-Item -ItemType Directory -Force "release/server-backups" | Out-Null
scp -r "${Server}:/opt/sacred-focus/rollback/实际时间戳目录" "release/server-backups/"
```

这些包包含所有人的私人数据和生产密钥，应限制访问。仅将备份留在同一服务器，无法应对磁盘或实例损坏。备份是 `0600` 且可能归 root 所有；上面的 `sudo tar ... > 文件` 将可转移文件创建为当前管理用户所有，不必放宽数据库快照权限。

## 6. 更新运行文件，保留生产配置与数据

先比较旧服务器与新包的 Compose、Nginx 配置；如服务器做过定制，将需要的定制合并到新文件。不要直接用模板覆盖 `.env`，也不要覆盖数据目录、证书目录或现有 `nginx/ssl/` 真实密钥。

确认定制已合并后，执行：

```bash
cp "${SF_STAGE}/Dockerfile" "${SF_STAGE}/.dockerignore" "${SF_STAGE}/.env.production.example" "${SF_STAGE}/docker-compose.yml" "${SF_STAGE}/docker-compose.nginx.yml" "${SF_RUN_DIR}/"
mkdir -p "${SF_RUN_DIR}/scripts" "${SF_RUN_DIR}/nginx/conf.d"
cp -a "${SF_STAGE}/scripts/." "${SF_RUN_DIR}/scripts/"
cp "${SF_STAGE}/nginx/conf.d/default.conf" "${SF_RUN_DIR}/nginx/conf.d/default.conf"
find "${SF_RUN_DIR}/scripts" -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
find "${SF_RUN_DIR}/scripts" -type f -name '*.sh' -exec chmod +x {} +
sudo nano "${SF_RUN_DIR}/.env"
```

保留原有的 `JWT_SECRET`、`ADMIN_PASSWORD`、`HOST_DATA_DIR`、`NGINX_SSL_DIR`、域名和资源限制。**此时不要提前改 `APP_VERSION`**，否则更新脚本会把新版本当作“旧版本”，失去自动回退目标。

多人限额可按需增加；缺少时最新 Compose 使用如下默认值，不需要重建整份 `.env`：

```dotenv
MAX_PERSONAL_ACCOUNTS=20
PUBLIC_DATA_LIMIT_MB=50
PERSONAL_DATA_LIMIT_MB=256
```

账号上限含停用的个人账号，`admin/public` 不计入。容量限制针对每个 SQLite 数据库，WAL、备份与日志仍需额外磁盘空间。

### TLS 部署必须调整更新脚本的探针端口

当前 `docker-update.sh` 从 `.env` 读取 `PORT`，探测 `http://127.0.0.1:$PORT/api/health`。Nginx overlay 会移除应用的宿主 3000 端口，因此 **TLS 部署保持 `PORT=3000` 会使脚本误判失败，回滚的健康检查也会失败**。

本指南的标准 TLS 编排在 `.env` 设置：

```dotenv
PORT=80
```

Nginx 的 HTTP 80 端口对 `/api/health` 放行并代理到应用。使用此 overlay 时，`PORT=80` 只让更新脚本经网关检查；应用容器仍监听 `3000`，不会重新公开应用端口。**只使用基础 Compose 或外部自定义网关时，不要照抄这个值**：基础 Compose 的 `PORT` 会改变宿主端口映射，应保留实际维护端口并确认其可返回健康状态。

保存 `.env` 后执行：

```bash
sudo chown "${SF_OPERATOR}:${SF_OPERATOR_GROUP}" "${SF_RUN_DIR}/.env"
sudo chmod 600 "${SF_RUN_DIR}/.env"
bash ./scripts/verify-delivery.sh
docker compose --env-file .env config --quiet
docker compose exec -T sacred-focus sh -c 'test -w /app/data && test -w /app/data/app.db'
```

三项必须通过。最后一项确认旧运行容器的非特权用户能够写入绑定数据卷；如果失败，先按 [运维手册](../scripts/README.md) 检查数据目录属主，不能靠删除数据重新初始化。`config --quiet` 不会启动容器，也不会将展开后的密钥打印出来。新 Compose 使用 `!override`，Compose 插件需为 2.24.4 或更高版本。

## 7. 执行更新并检查退出码

仍在 `/opt/sacred-focus`，保留同一组 `COMPOSE_FILE` / `COMPOSE_PROJECT_NAME`：

```bash
SF_UPDATE_STATUS=0
sudo env COMPOSE_FILE="${COMPOSE_FILE}" COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" bash ./scripts/docker-update.sh "${SF_RUN_DIR}/incoming/sacred-focus-v${SF_VERSION}.tar" || SF_UPDATE_STATUS=$?
sudo chown "${SF_OPERATOR}:${SF_OPERATOR_GROUP}" .env
sudo chmod 600 .env
printf '更新脚本退出码：%s\n' "${SF_UPDATE_STATUS}"
```

通过 `|| SF_UPDATE_STATUS=$?` 立即捕获失败退出码，避免被后续命令覆盖，也避免当前会话的 `set -e` 提前退出而漏掉权限恢复。使用 `sudo` 是为了读取/创建受保护的全部账号备份；脚本用 `sed -i` 更新 `.env` 后可能使其归 root 所有，因此无论成功失败都恢复管理用户属主和 `0600` 权限。

| 退出码 | 后续处理 |
|---|---|
| `0` | 更新脚本完成，继续检查真实版本、网关和网页行为。 |
| `1` | 更新失败；可能在备份/镜像阶段已停止，也可能容器回退成功。按日志确认，不能记为发布成功。 |
| `2` | 容器启动或健康检查失败，且自动回退也失败。保留日志，停止反复更新，按下一节人工处置。 |

成功后验证实际运行版本与公网 TLS：

```bash
docker compose ps
docker compose exec -T sacred-focus curl -fsS http://127.0.0.1:3000/api/health
docker compose exec -T nginx nginx -t
docker compose restart nginx
curl --fail --show-error http://127.0.0.1/api/health
curl --fail --show-error https://focus.example.com/api/health
docker compose logs --tail=100 sacred-focus nginx
docker stats --no-stream
df -h "${SF_DATA_DIR}"
```

将域名替换为自己的域名。健康响应中的 `version` 应是 `v1.0.3`，不能只看 HTTP 200；记录 `.env` 中 `APP_VERSION`、容器镜像标签/ID 和响应版本。Nginx 配置是绑定挂载，配置检查通过后重启网关使其重新读取文件。公网检查不加 `-k`，这样能发现证书不受信任、域名不匹配或过期。

应用容器重建后，Nginx 也可能仍缓存旧 upstream IP，导致网关返回 502，并使脚本经 80 端口的探测失败。遇到这一情况，先核对实际 `APP_VERSION`、容器镜像和容器内 `/api/health`，再查看 Nginx 日志；脚本可能已经回退，不能把“容器内健康”误当作新版本已发布。检查 `nginx -t` 并重启网关后，再判断当前版本是否可用，必要时重新执行更新或按下一节人工恢复。

从浏览器验收：

- 未登录默认进入公用账号，能正常浏览与体验。
- `admin` 使用原密码登录，原有私人数据没有进入公用空间。
- 已有个人账号能登录；公用、管理员和朋友账号的数据隔离，退出后回到公用账号。
- 新工作区/使用默认值的设置显示“图书馆坐上特定座位”和“打响指”；已保存的自定义设置保留。
- 未开始的心流目标默认为空，提示为“输入本次心流目标（例如：学习红黑树）”；已有进行中的目标不应被清空。

需要创建朋友账号时，在同一编排会话执行 `docker compose exec sacred-focus node backend/dist/cli/accounts.js create friend01`，按提示输入密码。账号数由服务器控制，没有开放注册入口。

## 8. 回滚边界与人工恢复

当前更新脚本的自动回滚只恢复 `.env` 中的旧 `APP_VERSION` 并重新启动容器。它**不会恢复数据库、Compose、Nginx、脚本或此前手动修改的其他 `.env` 字段**。健康检查通过也无法证明所有业务行为正确。

应用启动会执行数据库迁移；新代码对数据结构/内容的变更不能假设能被旧代码读取。发生问题时先记录：更新退出码、`old-image.txt`、`compose-selection.txt`、本次备份名、容器日志和实际健康版本。

人工回退的顺序是：

1. 停止应用，避免继续写入；必要时保存当前状态供排查。
2. 从 `runtime-before.tar.gz` 恢复本次保存的旧 Compose、Nginx、脚本和完整旧 `.env`，恢复原编排文件与项目名。检查 `.env` 权限和 TLS 挂载位置。
3. 判断旧代码是否能读取新数据；需要撤销迁移或数据改动时，按 [运维手册的备份恢复步骤](../scripts/README.md#5-全服务器恢复演练) **同时恢复根账号注册表、公用/个人目录及必要 WAL**，或使用停机取得的完整旧数据目录。不要只替换根 `app.db`。
4. 使用保留的旧镜像启动；旧标签为 `latest` 时使用先前固定的独立标签。重新检查容器内健康、网关健康、可信 HTTPS、账号数据和文件属主。

完整旧配置与数据库恢复都需要停机窗口，恢复会丢弃备份之后的业务写入；先确认需要恢复到的时间点，避免把新旧账号注册表和 UUID 数据库混用。**不要运行 `docker compose down -v`、删除持久化数据目录或用删除卷来“修复”更新。** 旧镜像、配置包和数据备份至少保留到业务验收及恢复验证结束。

以下提供标准 TLS 部署的运行配置/镜像人工回退命令。先将保存目录替换为第 4 节生成的实际目录；如果重新登录了 SSH，先按第 4 节设置当前运行编排，再停止服务：

```bash
set -e
SF_RUN_DIR=/opt/sacred-focus
SF_ROLLBACK=/opt/sacred-focus/rollback/实际时间戳目录
SF_OPERATOR="$(id -un)"
SF_OPERATOR_GROUP="$(id -gn)"
SF_SAVED_CONFIG="${SF_ROLLBACK}/config"
test -d "${SF_SAVED_CONFIG}"
test -f "${SF_SAVED_CONFIG}/.env"
test -f "${SF_SAVED_CONFIG}/docker-compose.yml"
test -f "${SF_ROLLBACK}/old-image.txt"
cd "${SF_RUN_DIR}"
docker compose stop nginx sacred-focus
```

服务停止后保存失败版本的运行文件，再按备份中明确列出的路径恢复。下列命令不复制整个生产根目录，不碰数据目录或 TLS 私钥：

```bash
SF_FAILED_RUNTIME="${SF_ROLLBACK}/runtime-failed-$(date +%Y%m%d_%H%M%S)"
mkdir -p "${SF_FAILED_RUNTIME}"
for SF_CONFIG_FILE in .env .env.production .env.production.example Dockerfile .dockerignore docker-compose.yml docker-compose.nginx.yml; do
    if test -e "${SF_RUN_DIR}/${SF_CONFIG_FILE}"; then
        cp -a "${SF_RUN_DIR}/${SF_CONFIG_FILE}" "${SF_FAILED_RUNTIME}/"
    fi
    if test -f "${SF_SAVED_CONFIG}/${SF_CONFIG_FILE}"; then
        cp -a "${SF_SAVED_CONFIG}/${SF_CONFIG_FILE}" "${SF_RUN_DIR}/"
    fi
done
test -d "${SF_SAVED_CONFIG}/scripts"
test -d "${SF_SAVED_CONFIG}/nginx/conf.d"
mv "${SF_RUN_DIR}/scripts" "${SF_FAILED_RUNTIME}/scripts"
cp -a "${SF_SAVED_CONFIG}/scripts" "${SF_RUN_DIR}/scripts"
mv "${SF_RUN_DIR}/nginx/conf.d" "${SF_FAILED_RUNTIME}/nginx-conf.d"
cp -a "${SF_SAVED_CONFIG}/nginx/conf.d" "${SF_RUN_DIR}/nginx/conf.d"
sudo chown "${SF_OPERATOR}:${SF_OPERATOR_GROUP}" "${SF_RUN_DIR}/.env"
sudo chmod 600 "${SF_RUN_DIR}/.env"

export COMPOSE_FILE="$(sed -n 's/^COMPOSE_FILE=//p' "${SF_ROLLBACK}/compose-selection.txt")"
export COMPOSE_PROJECT_NAME="$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "${SF_ROLLBACK}/compose-selection.txt")"
test -n "${COMPOSE_FILE}"
test -n "${COMPOSE_PROJECT_NAME}"
read -r SF_OLD_IMAGE_REF SF_OLD_IMAGE_ID < "${SF_ROLLBACK}/old-image.txt"
SF_ROLLBACK_IMAGE="$(sed -n 's/^manual-rollback-image=//p' "${SF_ROLLBACK}/old-image.txt")"
test "$(docker image inspect --format '{{.Id}}' "${SF_ROLLBACK_IMAGE}")" = "${SF_OLD_IMAGE_ID}"
case "${SF_OLD_IMAGE_REF}" in
    *@sha256:*) test "$(docker image inspect --format '{{.Id}}' "${SF_OLD_IMAGE_REF}")" = "${SF_OLD_IMAGE_ID}" ;;
    *) docker image tag "${SF_OLD_IMAGE_ID}" "${SF_OLD_IMAGE_REF}" ;;
esac
docker compose --env-file .env config --quiet
```

独立回滚标签必须仍指向记录的旧镜像 ID。标签分支的 `docker image tag` 把原来的镜像引用重新指向这个旧 ID，即使原值是 `sacred-focus:latest`，也不会误启新代码。digest 分支只核对原 digest 对应的镜像 ID。上述恢复循环针对标准文件；保存过自定义 overlay 的部署，还必须逐个恢复这些文件后再检查 Compose。

**此时服务仍停止。先完成旧代码与现有数据库的兼容判定，以及必要的全账号数据库恢复，再执行启动命令。** 数据库恢复与 node 文件权限处理按照 [运维手册](../scripts/README.md#5-全服务器恢复演练)，不要直接把备份归档解压覆盖正在运行的数据目录。

```bash
docker compose up -d --force-recreate --remove-orphans
docker compose exec -T sacred-focus curl -fsS http://127.0.0.1:3000/api/health
docker compose exec -T nginx nginx -t
docker compose restart nginx
curl --fail --show-error http://127.0.0.1/api/health
curl --fail --show-error https://focus.example.com/api/health
docker compose ps
```

再次替换实际域名，响应版本应对应恢复后的旧版本，并检查管理员、公用与个人账号的数据。这里直接检查容器内部和网关 80 端口，不依赖旧 `.env` 的 `PORT` 值。

## 9. 可选：使用镜像仓库

离线方案不依赖服务器访问镜像仓库。若已经有自己的真实仓库，可使用打包脚本的 `-Registry` 参数推送，但当前 Compose 的镜像名是 `sacred-focus:${APP_VERSION}`，没有仓库前缀。

要在线更新，须先将 Compose `image` 改为你实际仓库的完整路径，完成 `docker login`，固定一个存在的 `vX.Y.Z` 标签，再运行 `./scripts/docker-update.sh vX.Y.Z`。不要把 `registry/path/sacred-focus:vX.Y.Z` 直接当作更新脚本参数，它只接受版本号或本地 tar 路径；也不要使用 `latest` 或通配符代替本次确定的版本。运行文件仍需要按上面的流程单独交付、备份和检查。
