# Sacred Focus 企业级 Docker 容器化部署与版本化更新指南

> **系统架构**：Vue 3.5 + Node.js Express + SQLite WAL 模式 + Docker 多阶段构建 + Docker Compose 编排  
> **适用环境**：VMware Workstation 虚拟机（Ubuntu 22.04 / Debian 12）、PVE / ESXi 虚拟化环境、阿里云 / 腾讯云 / 华为云等生产级 Linux 服务器。

---

## 目录索引
- [一、容器化架构全景与设计思想](#一容器化架构全景与设计思想)
- [二、VMware 虚拟机环境准备（Docker 安装）](#二vmware-虚拟机环境准备docker-安装)
- [三、首次部署与快速启动流程](#三首次部署与快速启动流程)
- [四、“大厂级”版本化打包与平滑更新工作流](#四大厂级版本化打包与平滑更新工作流)
  - [方案 A：离线镜像包分发流（适合私有 VM / 局域网）](#方案-a离线镜像包分发流适合私有-vm--局域网推荐)
  - [方案 B：容器镜像仓库分发流（大厂标准云端模式）](#方案-b容器镜像仓库分发流大厂标准云端模式)
- [五、数据持久化机制与防灾备策略](#五数据持久化机制与防灾备策略)
- [六、进阶：集成 Nginx 网关与 HTTPS 配置](#六进阶集成-nginx-网关与-https-配置)
- [七、运维常用命令与排障手册](#七运维常用命令与排障手册)

---

## 一、容器化架构全景与设计思想

为了杜绝传统物理机部署中常见的“环境版本冲突”、“依赖编译缺失”、“服务升级中断”等问题，Sacred Focus 采用遵循云原生最佳实践的容器化封装方案：

```
┌─────────────────────────────────────────────────────────────┐
│                    打包编译端 (开发机 / CI 节点)              │
│                                                             │
│  源码 ──► 多阶段构建 (Dockerfile) ──► 产出纯净极简镜像        │
│          - Stage 1: 编译 Vue 3 前端与 TypeScript 后端        │
│          - Stage 2: 独立安装原生编译生产依赖 (better-sqlite3)│
│          - Stage 3: node:22-bookworm-slim 最小化安全镜像      │
└──────────────────────────────┬──────────────────────────────┘
                               │ (推送仓库 或 导出 Tar 包)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  运行端 (VMware 虚拟机 / 云服务器)            │
│                                                             │
│   Docker Compose 守护编排                                   │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ 容器名: sacred-focus (非 root 用户 node 运行, 端口: 3000)│ │
│   │  - Express 引擎 (同源兼顾 API 与前端 SPA 静态托管)     │ │
│   │  - 健康检查探测 (HEALTHCHECK 每 30s 探测 /api/health)  │ │
│   │  - 日志轮转防爆仓 (max-size: 20m, max-file: 3)         │ │
│   └──────────────────────────┬────────────────────────────┘ │
│                              │ 宿主机数据卷映射              │
│                              ▼                              │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ 宿主机挂载目录: ./data ──► 容器内 /app/data            │ │
│   │  - app.db (SQLite WAL 事务数据库)                     │ │
│   │  - backup/ (自动滚动冷备快照)                         │ │
│   │  【核心承诺】：升级、替换、回滚镜像，业务数据 100% 留存 │ │
│   └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 核心收益：
1. **交付单元唯一**：前端编译产物（HTML/JS/CSS/PWA）由后端静态引擎直接提供，前后端同镜像交付，无需再分别配置前端静态服务器。
2. **体积瘦身**：多阶段构建彻底剥离 Vite、TypeScript 编译器及 devDependencies，镜像体积从接近 1GB 精简至约 180MB。
3. **原生 C++ 性能**：基于 Debian 12 (bookworm) 原生 glibc 编译 `better-sqlite3`，确保 WAL 高并发读写的绝对稳定。
4. **企业级权限安全**：容器内以 UID 1000 非特权用户 `node` 运行，杜绝容器逃逸与宿主机提权隐患。

---

## 二、VMware 虚拟机环境准备（Docker 安装）

若您的虚拟机（以 Ubuntu 22.04 / 24.04 LTS Server 为例）尚未安装 Docker，可执行以下官方快速安装流程：

```bash
# 1. 更新系统包索引并安装必要依赖
sudo apt update && sudo apt install -y ca-certificates curl gnupg lsb-release

# 2. 引入 Docker 官方 GPG 密钥
sudo mkdir -m 0755 -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 3. 写入软件源仓库
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. 安装 Docker 引擎及 Compose 插件
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. 将当前用户加入 docker 组（避免每次执行都要 sudo，注销重新登录后生效）
sudo usermod -aG docker $USER

# 6. 验证安装
docker --version
docker compose version
```

---

## 三、首次部署与快速启动流程

### 1. 将项目部署文件同步至虚拟机
建议在虚拟机的 `/opt/sacred-focus` 或 `~/sacred-focus` 目录下建立运行目录。生产部署所需的核心文件包括：
- `docker-compose.yml`
- `.env.production.example`
- `scripts/`（运维脚本目录）

可通过 `scp` 或 Git 检出：
```bash
mkdir -p ~/sacred-focus
cd ~/sacred-focus
```

### 2. 初始化生产环境配置文件
```bash
# 从模板生成正式环境变量
cp .env.production.example .env

# 编辑 .env 文件
nano .env
```

**重要配置项确认**：
- `JWT_SECRET`：**必须修改**为强随机字符串（长度至少 32 字符，例如用 `openssl rand -base64 32` 生成）。
- `ADMIN_PASSWORD`：管理员初始登录密码。
- `PORT`：对外映射端口（默认为 `3000`）。
- `APP_VERSION`：当前部署的镜像版本（首次部署可设为 `1.0.0` 或直接使用 `latest`）。

### 3. 拉起容器服务
- **方式一（本地/虚拟机直接在线编译拉起）**：
  若源码也在虚拟机中，可一条命令构建并启动：
  ```bash
  docker compose up -d --build
  ```
- **方式二（使用已打包好的离线镜像，推荐）**：
  参照下文第四节先加载镜像，然后执行：
  ```bash
  docker compose up -d
  ```

### 4. 验证服务状态
```bash
# 查看容器运行状态及健康检测状态 (healthy)
docker compose ps

# 查看启动日志
docker compose logs -f sacred-focus
```
在浏览器中访问 `http://<虚拟机IP>:3000`，即可看到 Sacred Focus 沉浸式登录与系统首页！

---

## 四、“大厂级”版本化打包与平滑更新工作流

在企业级生产实践中，业务代码迭代后，**绝不允许直接在生产服务器上拉代码 `npm install` 重新编译**，而是通过在 CI/开发机打包出带版本 Tag 的 Docker 镜像，服务器端只负责拉取/加载并重启容器。

本项目内置了自动化打包与更新工具链，支持以下两种主流分发模式：

---

### 方案 A：离线镜像包分发流（适合私有 VM / 局域网，推荐）

此方案无需搭建公网 Docker 镜像仓库，非常适合在宿主机（Windows/macOS）开发、虚拟机运行的场景。

#### 步骤 1：在开发机一键编译与版本打包
项目根目录下提供了跨平台打包脚本：
- **Windows (PowerShell)**：
  ```powershell
  # 指定版本号打包（如 1.0.0、1.1.0）
  .\scripts\docker-pack.ps1 -Version 1.1.0
  ```
- **Linux / macOS (Bash)**：
  ```bash
  chmod +x ./scripts/docker-pack.sh
  ./scripts/docker-pack.sh 1.1.0
  ```
脚本执行完毕后，将在 `./release/` 目录下生成标准化离线包：  
`./release/sacred-focus-v1.1.0.tar`（或 `.tar.gz`）。

#### 步骤 2：将镜像包复制到虚拟机
通过 `scp` 命令（或 VMware 共享目录）传输：
```bash
# 示例：通过 scp 拷入虚拟机
scp ./release/sacred-focus-v1.1.0.tar user@192.168.1.188:~/sacred-focus/
```

#### 步骤 3：虚拟机上一键无损平滑更新
在虚拟机中执行一键更新脚本：
```bash
cd ~/sacred-focus
chmod +x ./scripts/docker-update.sh
./scripts/docker-update.sh sacred-focus-v1.1.0.tar
```

**更新脚本自动执行的全链路流程**：
1. 🛡️ **前置冷备**：自动为当前的 SQLite 数据库（`app.db` 及 WAL 文件）打上时间戳备份到 `./data/backup/`，确保发生意外可 100% 立即回滚。
2. 📥 **导入镜像**：调用 `docker load` 将新版本镜像注入 Docker 本地镜像库。
3. 🔄 **同步配置**：自动更新 `.env` 中的 `APP_VERSION` 为新版本。
4. 🚀 **原子替换**：调用 `docker compose up -d`，Docker 自动销毁旧容器并拉起新版本容器（数据卷保持挂载，完全不丢失）。
5. 🩺 **健康探测**：轮询探测 `/api/health` 端口，确认新版本平稳上线！

---

### 方案 B：容器镜像仓库分发流（大厂标准云端模式）

若您拥有公网服务器或配置了云厂商免费容器镜像服务（如阿里云 ACR、腾讯云 CCR、Docker Hub、自建 Harbor）：

#### 步骤 1：打包并推送到镜像仓库
```powershell
# Windows
.\scripts\docker-pack.ps1 -Version 1.1.0 -Registry "registry.cn-hangzhou.aliyuncs.com/myworkspace"

# Linux / macOS
./scripts/docker-pack.sh 1.1.0 registry.cn-hangzhou.aliyuncs.com/myworkspace
```

#### 步骤 2：服务器端一键拉取并升级
在服务器/虚拟机端：
```bash
# 方式 1：使用更新脚本
./scripts/docker-update.sh v1.1.0

# 方式 2：纯原生命令更新
# 修改 .env 中的 APP_VERSION=v1.1.0
docker compose pull
docker compose up -d
```

---

## 五、数据持久化机制与防灾备策略

### 1. 为什么更新镜像不会丢失数据？
在 `docker-compose.yml` 中定义了宿主机数据卷挂载：
```yaml
volumes:
  - ./data:/app/data
```
- 系统的 SQLite 数据库主文件 `app.db`、WAL 日志 `app.db-wal` 以及共享内存 `app.db-shm` 均存储在宿主机的 `./data` 目录中。
- Docker 容器仅作为“无状态执行计算单元”，任何更新、重启或销毁容器的操作均不会对 `./data` 产生任何副作用。

### 2. 每日自动定时热备（Crontab）
为了应对误删或灾难恢复，系统提供了 `scripts/docker-backup.sh` 脚本。您可以在虚拟机中设置 Linux 定时任务：

```bash
crontab -e
```
添加以下规则（每天凌晨 03:00 自动执行一次数据库原子备份，并保留最近 14 天备份）：
```cron
0 3 * * * /home/ubuntu/sacred-focus/scripts/docker-backup.sh >> /home/ubuntu/sacred-focus/data/backup.log 2>&1
```

### 3. 紧急灾难回滚操作
若升级后因代码缺陷需要紧急回滚至上一个版本：
```bash
# 1. 修改 .env 中的 APP_VERSION 为旧版本号 (例如 v1.0.0)
nano .env

# 2. 重新拉起旧版本容器
docker compose up -d

# 3. (可选) 如需恢复数据库，从 ./data/backup/ 中选择备份文件覆盖回 ./data/app.db
cp ./data/backup/app_pre_update_XXXXX.db ./data/app.db
docker compose restart sacred-focus
```

---

## 六、进阶：集成 Nginx 网关与 HTTPS 配置

若需要通过域名访问、开启 HTTP/2、启用 Gzip 深度压缩以及配置 SSL/TLS 证书，可使用项目提供的扩展编排文件 `docker-compose.nginx.yml`：

```
客户端 (80/443) ──► Nginx 容器 ──(内部网络)──► Sacred Focus 容器 (3000)
```

### 启动双容器反代架构：
```bash
docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d
```

- Nginx 配置文件位于 `./nginx/conf.d/default.conf`。
- SSL 证书可放置于 `./nginx/ssl/`（如 `server.crt` 和 `server.key`），取消 `default.conf` 中的 SSL 监听段即可启用 HTTPS 访问。

---

## 七、运维常用命令与排障手册

| 操作诉求 | 命令 | 说明 |
| :--- | :--- | :--- |
| **查看运行状态** | `docker compose ps` | 查看容器状态（State）与健康检查（Status: healthy） |
| **查看实时日志** | `docker compose logs -f sacred-focus` | 跟踪应用标准输出与请求日志 |
| **重启应用** | `docker compose restart sacred-focus` | 重启服务（毫秒级生效，数据不受影响） |
| **停止容器** | `docker compose stop` | 优雅停止当前服务 |
| **完全销毁容器** | `docker compose down` | 移除容器网络（数据卷 `./data` 依旧安全保留） |
| **进入容器内部** | `docker compose exec sacred-focus sh` | 进入容器内部终端进行环境调试 |
| **手动触发备份** | `./scripts/docker-backup.sh` | 立即对 SQLite 数据库生成时间戳冷备 |
| **清理未使用的镜像** | `docker image prune -f` | 释放升级后留存的旧镜像磁盘占用 |

---

> 💡 **小结**：通过以上标准化的 Docker 方案，Sacred Focus 实现了开发机一键编译、版本化归档分发、服务器一键免停机平滑替换与数据零丢失备份，完全达到主流互联网大厂微服务交付与运维标准！
