# 公用体验与个人账号

网页默认进入 `public` 公用账号，无需注册。所有访客共享这个工作区，能体验国策树、专注、判例和演化，修改也会被其他访客看到。请将私人记录保存在个人账号中。公用账号不能导入完整系统备份覆盖工作区。

点击顶部“登录个人账号”，输入管理员提供的用户名和密码。登录后只操作自己的工作区；退出回到公用账号。浏览器的专注计时按账号保存，切换会重新加载页面，避免旧草稿跨账号保存。同一浏览器不同标签页共用 Cookie，切换账号会同步刷新其他标签页。

公用账号在状态接口中也被视为可使用的工作区（`isAuthenticated: true`、`role: public`），不代表访客获得了个人账号身份。页面会显示“公用账号”与共享数据提示，业务 API 始终按服务器核验的身份选择数据库。

## 默认配置与个人设置

| 项目 | 默认值 |
|---|---|
| 神圣信物 | 图书馆坐上特定座位 |
| 预约启动信号 | 打响指 |
| 专注时长 | 60 分钟 |
| 后悔窗口 | 30 秒 |
| 心流目标 | 空白，提示示例“学习红黑树”；提示不会成为实际目标或日志内容。 |

个人设置保存在当前账号。首次运行新版时，仅将字段仍等于已知旧默认文案的信物和启动信号升级为上述值；自定义字段、时长、连胜和历史记录保留。此迁移每个工作区只执行一次，之后手动修改不会在重启时被重复覆盖。

## 已有单用户部署如何升级

升级前备份整个持久化数据目录。原来的 `DATA_DIR/app.db` 继续作为 `admin` 的私人工作区，已有国策、日志、判例及快照不会搬入公开空间。管理员用户名为 `admin`，使用原来的管理员密码。已有管理员 JWT 继续兼容；公用工作区首次访问时为空。

云服务器上的镜像、运行文件和配置更新按 [云服务器项目更新指南](cloud-server-update.md) 执行。已有单用户服务器若仍使用旧备份脚本，更新前先使用新版备份工具，确保后续个人账号数据也纳入运维备份。

数据目录如下：

```text
data/
  app.db                         # 管理员原有数据、账号注册表及认证元数据
  accounts/
    public/app.db                # 所有访客共用的体验数据
    <服务器生成的账号 UUID>/app.db # 每个个人账号的数据
```

所有业务读写、同步版本、每日结算、演化快照、导入导出与维护锁按账号隔离。个人账号导入完整备份只覆盖自己的数据。网页导出仅包含当前工作区的业务数据，不包含账号密码及注册表。

## 在服务器管理朋友的账号

没有开放注册接口和网页创建账号功能。Docker 部署在发布目录执行；使用项目 Nginx 网关时，新的 SSH 会话先设置 `export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml`，再执行账号命令：

```bash
docker compose exec sacred-focus node backend/dist/cli/accounts.js create friend01
docker compose exec sacred-focus node backend/dist/cli/accounts.js list
docker compose exec sacred-focus node backend/dist/cli/accounts.js disable friend01
docker compose exec sacred-focus node backend/dist/cli/accounts.js enable friend01
docker compose exec sacred-focus node backend/dist/cli/accounts.js reset-password friend01
```

创建和重置密码会提示隐藏输入。用户名为 3–32 位英文、数字、点、下划线或连字符，自动转为小写；`admin` 和 `public` 为保留名称。新密码至少 12 字符，最多 72 UTF-8 字节。不要把密码写在命令参数里。

本地开发可在仓库根目录运行：

```bash
npm --prefix backend run accounts -- create friend01
npm --prefix backend run accounts -- list
```

自动化脚本可使用 `--password-stdin` 从标准输入读取密码。在 Docker 中使用 `exec -T` 配合管道；密码应来自受保护的文件或密钥管理工具。

停用账号会立即拒绝其已有会话，并保留数据；重新启用需要重新登录。重置个人账号密码也会使旧会话失效。当前不提供自动删除账号或数据命令，避免误删记录；停用账号仍占用名额。

管理员沿用已有 `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` 逻辑：首次密码哈希保存后，单独修改 `ADMIN_PASSWORD` 不会覆盖已有哈希。直接运行 Node 时，可设置新的 bcrypt `ADMIN_PASSWORD_HASH` 并重启；默认 Compose 只传入 `ADMIN_PASSWORD`，因此若要使用 `ADMIN_PASSWORD_HASH`，需要先在应用服务的 `environment` 中显式映射该变量，仅新增 `.env` 字段不会生效。同时更换 `JWT_SECRET` 会使全部已签发的管理员和个人会话失效。

## 控制数量与容量

在部署 `.env` 中按服务器容量配置：

```dotenv
MAX_PERSONAL_ACCOUNTS=20
PUBLIC_DATA_LIMIT_MB=50
PERSONAL_DATA_LIMIT_MB=256
```

个人账号总数上限含停用账号，`admin` 与 `public` 不计入。超过上限时服务器命令拒绝创建；降低上限不会删除已有账号。`PERSONAL_DATA_LIMIT_MB` 也用于管理员数据库。容量值按 `1024 × 1024` 字节换算，由 SQLite 的 `max_page_count` 对主数据库页数执行上限；降低配置不会缩小已有文件，也不能将上限降到低于现有页数。容量不包含 WAL、预导入热备、服务器备份或容器日志，仍应监控宿主机磁盘。

修改配置后重新创建应用容器使环境变量生效。公用账号保留每 IP 每分钟 60 次的公网 API 限流；个人账号使用现有每 IP 每分钟 1000 次限制，登录沿用防爆破限流。`TRUSTED_IPS` 只豁免安全扫描与限流，不赋予个人账号身份。现有容器内存、CPU 和日志大小限制继续生效。

页面业务请求携带 `X-SF-Account-Id` 核对页面身份与当前 Cookie。如果其他标签页切换账号、Cookie 过期或账号被停用，旧页面的请求会被拒绝并重新核验身份，避免旧草稿写入新账号；这个请求头不能用来选择别人的工作区。

## 备份与恢复

服务器备份必须包括根数据库和 `accounts/` 下的全部数据库，才能恢复账号与朋友的数据。个人网页导出不能代替服务器全量备份。恢复文件前停止应用服务，避免写入旧的 WAL；同时还原对应账号注册表和 UUID 目录，不要把朋友数据库复制到管理员或公用账号路径。

`scripts/docker-backup.sh` 和更新前热备现在都会生成管理员快照、同名 `_accounts/` 目录及 `.db.manifest.json` 清单。日常 `app_backup_*` 备份按组清理超过 14 天的记录；`app_pre_update_*` 更新前备份不自动按此规则清理。每个账号的 `app_pre_import_*` 热备默认只保留最近 5 个。必须整组保存和恢复；冷备还需要对应 WAL。恢复步骤及权限处理见 [运维手册](../scripts/README.md)。

首次启用多人版本前，请将现有 `data/` 完整备份到安全位置。公用体验数据会长期共享保存，没有自动清空机制；管理员可通过离线维护公用数据库清理，也可在容量设置较小的情况下运行。
