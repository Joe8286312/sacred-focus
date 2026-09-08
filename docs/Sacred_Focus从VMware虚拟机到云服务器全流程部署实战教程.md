# Sacred Focus 全系统全流程生产级部署实战教程
## （从 VMware Ubuntu 22.04 Server 到公网云端正式上线）

> **系统架构**：Vue 3 + Vite + TypeScript (前端静态) / Node.js Express + TypeScript (后端服务) / SQLite (WAL 模式持久化) / Nginx (网关反代) / PM2 (进程守护)  
> **适用环境**：阶段一：VMware Workstation 虚拟化环境（Ubuntu 22.04 LTS Server）；阶段二：公网云服务器（Ubuntu 22.04 LTS，含域名、HTTPS、自动备份与 PWA 原生体验）。

---

## 目录索引
- [全系统部署架构总览](#全系统部署架构总览)
- [阶段一：VMware 虚拟机 Ubuntu 22.04 Server 部署实战](#阶段一vmware-虚拟机-ubuntu-2204-server-部署实战)
  - [第一步：VMware 虚拟机与网络拓扑配置](#第一步vmware-虚拟机与网络拓扑配置)
  - [第二步：Ubuntu 22.04 运行环境初始化](#第二步ubuntu-2204-运行环境初始化)
  - [第三步：代码部署与依赖编译](#第三步代码部署与依赖编译)
  - [第四步：生产环境变量与安全密钥配置](#第四步生产环境变量与安全密钥配置)
  - [第五步：全系统编译与 PM2 守护启动](#第五步全系统编译与-pm2-守护启动)
  - [第六步：Nginx 反向代理与前端静态托管](#第六步nginx-反向代理与前端静态托管)
  - [第七步：UFW 防火墙与局域网实测验收](#第七步ufw-防火墙与局域网实测验收)
- [阶段二：云服务器采购与公网正式上线指南](#阶段二云服务器采购与公网正式上线指南)
  - [第一步：云基础设施采购建议](#第一步云基础设施采购建议)
  - [第二步：云控制台安全组与防火墙加固](#第二步云控制台安全组与防火墙加固)
  - [第三步：云端环境初始化与代码数据平移](#第三步云端环境初始化与代码数据平移)
  - [第四步：Let's Encrypt 自动化 SSL 证书与全量 HTTPS 配置](#第四步lets-encrypt-自动化-ssl-证书与全量-https-配置)
  - [第五步：SQLite 数据库每日热备与灾备策略](#第五步sqlite-数据库每日热备与灾备策略)
  - [第六步：移动端 PWA 安装与沉浸式体验交付](#第六步移动端-pwa-安装与沉浸式体验交付)
- [附录：运维常用命令与故障排除速查手册](#附录运维常用命令与故障排除速查手册)

---

## 全系统部署架构总览

```
【客户端：PC 浏览器 / 手机 Safari / 平板 Chrome / PWA 主屏幕 App】
                             │
                             ▼  (HTTP :80 / HTTPS :443)
       ┌─────────────────────────────────────────────────────┐
       │             Nginx 网关 (反向代理与静态分流)            │
       │  - 静态资源 Gzip 高速压缩                            │
       │  - SSL/TLS 证书卸载与 HTTP 301 强制跳转 HTTPS        │
       │  - X-Forwarded-For 客户端真实 IP 透传                │
       └──────────────────────────┬──────────────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       【前端单页静态资产】                  【后端 API 反向代理】
       /var/www/sacred-focus/frontend/dist        │
       - index.html (try_files 兜底)              │ proxy_pass http://127.0.0.1:3000/api/
       - JS / CSS / WebManifest 静态资源          ▼
                                       ┌───────────────────────────────────┐
                                       │    PM2 守护进程 (127.0.0.1:3000)   │
                                       │    sacred-focus-backend (Node.js) │
                                       │                                   │
                                       │    中间件防线：                    │
                                       │    - 蜜罐诱捕与恶意 UA 阻断         │
                                       │    - 分级速率限制 (Rate Limiter)   │
                                       │    - JWT / HttpOnly Cookie 鉴权   │
                                       │    - Helmet 安全响应标头           │
                                       └─────────────────┬─────────────────┘
                                                         │
                                                         ▼
                                       ┌───────────────────────────────────┐
                                       │       本地 SQLite 数据库           │
                                       │  /var/www/sacred-focus/backend/   │
                                       │  data/app.db (WAL 事务日志模式)    │
                                       └───────────────────────────────────┘
```

---

## 阶段一：VMware 虚拟机 Ubuntu 22.04 Server 部署实战

该阶段用于在本地宿主机上构建 100% 贴合生产特性的 Linux 隔离环境，完成原生依赖编译、进程托管、网关反代及多设备局域网验证。

### 第一步：VMware 虚拟机与网络拓扑配置

#### 1. 硬件规格建议
- **虚拟处理器**：2 核（vCPU）
- **运行内存**：2 GB 或以上（Node.js 构建与 C++ 模块编译需至少 1.5GB 可用内存）
- **虚拟硬盘**：20 GB ~ 40 GB（SSD 或 NVMe 驱动）
- **系统镜像**：`ubuntu-22.04.x-live-server-amd64.iso`

#### 2. 网络适配器模式配置
在 VMware 虚拟机设置中选择**网络适配器**：
- **强烈推荐：桥接模式（Bridged）**：
  - 勾选“复制物理网络连接状态”。
  - 虚拟机将直接接入物理路由器，获取独立的局域网 IP（例如 `192.168.1.188`）。
  - **核心收益**：同 Wi-Fi 下的宿主机 Windows、智能手机、平板皆可直连访问，完全逼真模拟真实联网。
- **备选方案：NAT 模式**（适用于校园网、公司 802.1X 认证限制单 MAC 地址的场景）：
  - 需在 VMware「编辑」->「虚拟网络编辑器」-> 选择 VMnet8 (NAT) -> 点击「NAT 设置」增加端口映射：
    - 主机端口 `8080` -> 虚拟机 IP 端口 `80`
    - 主机端口 `2222` -> 虚拟机 IP 端口 `22`
  - 宿主机通过 `http://127.0.0.1:8080` 访问服务。

#### 3. 获取虚拟机 IP 并通过终端连接
在虚拟机安装完成登录后执行：
```bash
ip -4 addr show | grep inet
```
记录分配的局域网 IP（设为 `192.168.1.188`）。在宿主机 Windows Terminal 或 PowerShell 中直接建立 SSH 会话：
```powershell
ssh username@192.168.1.188
```

---

### 第二步：Ubuntu 22.04 运行环境初始化

在 SSH 终端中执行系统更新与生产基座套件安装：

#### 1. 安装基础依赖与 C++ 编译套件
> `better-sqlite3` 是基于 C++ 原生扩展编译的模块，在 Linux 环境下构建必须安装 `build-essential` 与 `python3`。

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential python3 sqlite3 ufw fail2ban nginx
```

#### 2. 安装 Node.js v20 LTS
使用 NodeSource 官方软件源安装 LTS 版本：
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```
验证安装版本（需确认 Node >= 20.x，npm >= 10.x）：
```bash
node -v
npm -v
```

#### 3. 安装 PM2 进程守护工具
```bash
sudo npm install -g pm2
```

---

### 第三步：代码部署与依赖编译

#### 1. 规范化创建项目目录并授权
```bash
sudo mkdir -p /var/www/sacred-focus
sudo chown -R $USER:$USER /var/www/sacred-focus
```

#### 2. 代码传输方案（二选一）

- **方案 A（Git 仓库克隆，标准流程）**：
  ```bash
  cd /var/www
  git clone <您的Git仓库地址> sacred-focus
  cd sacred-focus
  ```

- **方案 B（从 Windows 宿主机直接文件传输）**：
  在 Windows 宿主机根目录下打开 PowerShell 执行 SCP 命令（自动排除缓存与输出）：
  ```powershell
  # 提示：Windows 下建议使用 WinSCP/FileZilla 工具，或使用 scp 传输工程文件
  scp -r d:\Codes\Projects\sacred-focus\* username@192.168.1.188:/var/www/sacred-focus/
  ```

#### 3. 安装依赖与原生扩展本地编译
进入虚拟机项目目录：
```bash
cd /var/www/sacred-focus
npm install
```

如果遇到 `better-sqlite3` 原生扩展编译提示，进入 backend 目录单独重编：
```bash
cd /var/www/sacred-focus/backend
npm rebuild better-sqlite3
cd ..
```

---

### 第四步：生产环境变量与安全密钥配置

#### 1. 生产环境密钥与散列密码生成
在终端通过一段 Node.js 命令生成生产级 JWT 密钥与管理员 Bcrypt 哈希：
```bash
node -e "
const bcrypt = require('/var/www/sacred-focus/backend/node_modules/bcryptjs');
const crypto = require('crypto');
const rawPwd = 'YourStrongPassword123'; // 请在此替换为您的实际登录密码
console.log('JWT_SECRET=' + crypto.randomBytes(32).toString('hex'));
console.log('ADMIN_PASSWORD_HASH=' + bcrypt.hashSync(rawPwd, 10));
"
```
终端将输出类似以下格式的内容：
```text
JWT_SECRET=e7a6839bc475510660601956f71d5300f89bbd8b85c1aa7eec43b17ba9310dfb
ADMIN_PASSWORD_HASH=$2a$10$7Z2v7q3R3UvE9yC..d.DkuvOskB8kM92K.9uHnfxPknE1w8n0oYvy
```

#### 2. 创建并配置 `backend/.env`
```bash
nano /var/www/sacred-focus/backend/.env
```
粘贴并调整以下生产环境配置：
```ini
# 监听端口与生产模式标示
PORT=3000
NODE_ENV=production

# 鉴权与安全密钥
JWT_SECRET=e7a6839bc475510660601956f71d5300f89bbd8b85c1aa7eec43b17ba9310dfb
ADMIN_PASSWORD_HASH=$2a$10$7Z2v7q3R3UvE9yC..d.DkuvOskB8kM92K.9uHnfxPknE1w8n0oYvy

# 局域网白名单（允许直通放行，免频控限制）
TRUSTED_IPS=127.0.0.1,::1,192.168.1.0/24

# 数据存储目录（指向 backend/data）
DATA_DIR=/var/www/sacred-focus/backend/data
```
保存并退出（Nano 快捷键：`Ctrl + O` 回车，`Ctrl + X` 退出）。

#### 3. 创建数据库存储目录并授权
```bash
mkdir -p /var/www/sacred-focus/backend/data
chmod 755 /var/www/sacred-focus/backend/data
```

---

### 第五步：全系统编译与 PM2 守护启动

#### 1. 执行全量编译
在项目根目录执行：
```bash
cd /var/www/sacred-focus
npm run build
```
该指令将并发或依次执行：
- `npm run build:backend`：调用 `tsc` 编译 TypeScript，产出 `/var/www/sacred-focus/backend/dist/server.js`；
- `npm run build:frontend`：调用 `vue-tsc` 与 `vite build`，产出优化后的静态单页资源 `/var/www/sacred-focus/frontend/dist`。

#### 2. 使用 PM2 启动后端服务
```bash
cd /var/www/sacred-focus/backend
pm2 start dist/server.js --name "sacred-focus-backend"
```

#### 3. 固化 PM2 随系统开机自启
```bash
pm2 startup
# 复制控制台提示的 sudo env PATH=... 命令并执行
pm2 save
```

#### 4. 验证本地后端服务
```bash
curl -I http://127.0.0.1:3000/api/health
```
响应应为 `HTTP/1.1 200 OK`，服务正处于安全的回环地址（`127.0.0.1`）隔离监听状态。

---

### 第六步：Nginx 反向代理与前端静态托管

#### 1. 编写 Nginx 配置文件
创建虚拟主机文件：
```bash
sudo nano /etc/nginx/sites-available/sacred-focus
```
写入以下完整的生产配置：
```nginx
server {
    listen 80;
    server_name _; # 允许使用虚拟机 IP 直接访问

    # 请求体限制（放行全量数据导入 JSON 镜像，上限 25MB）
    client_max_body_size 25M;

    # 启用 Gzip 压缩传输加速
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    # 1. 前端 Vue 3 静态单页应用托管
    location / {
        root /var/www/sacred-focus/frontend/dist;
        index index.html;
        # 核心：History 模式路由回退，消除页面刷新 404
        try_files $uri $uri/ /index.html;

        # 静态资源缓存控制
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 30d;
            add_header Cache-Control "public, no-transform";
        }
    }

    # 2. 后端 API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;

        # 透传客户端真实 IP
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

#### 2. 激活站点并重载 Nginx
```bash
# 移除默认的 default 站点
sudo rm -f /etc/nginx/sites-enabled/default

# 建立软链接激活配置
sudo ln -sf /etc/nginx/sites-available/sacred-focus /etc/nginx/sites-enabled/

# 测试配置语法
sudo nginx -t

# 重载生效
sudo systemctl reload nginx
```

---

### 第七步：UFW 防火墙与局域网实测验收

#### 1. 开启防火墙放行策略
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw --force enable
sudo ufw status
```

#### 2. 全功能多端验收
- **宿主机 Windows 测试**：
  在 Chrome / Edge 中访问 `http://192.168.1.188`。
- **手机移动端测试**：
  确保手机连接同一局域网 Wi-Fi，在移动端浏览器输入 `http://192.168.1.188`。
- **验收核心功能项**：
  1. **鉴权守卫拦截**：直接访问内部页面被重定向至 `/login` 磨砂玻璃登录页；
  2. **登录认证**：输入设定密码，成功生成并存储 HttpOnly Cookie 与 Token，平滑进入系统；
  3. **双主题切换**：切换深色 OLED 与浅色象牙白主题，确认视觉无瑕疵；
  4. **国策树与沙盒编辑**：拖动卡片、配置正交连线、版本快照保存；
  5. **神圣座位心流计时**：启动专注、触发 30 秒后悔药窗口、体验顺水推舟与流水热力图；
  6. **判例法典与全量迁移**：录入一条判例，并在系统数据中枢执行一次全量 JSON 导出。

---

## 阶段二：云服务器采购与公网正式上线指南

完成本地虚拟机的全功能验证后，即可放心采购公网云基础设施，进行面向生产的最终交付。

### 第一步：云基础设施采购建议

#### 1. 云服务器选型建议
- **产品类型**：轻量应用服务器（Lighthouse）或标准云服务器（ECS / CVM）
- **推荐规格**：
  - **CPU / 内存**：2 核 CPU，2 GB 内存（系统在 PM2 运行下常驻内存仅需 ~180MB，2G 规格绰绰有余）
  - **网络带宽**：3 Mbps ~ 5 Mbps 峰值
  - **系统盘**：40 GB ~ 60 GB 高性能 SSD
  - **成本参考**：国内主流云厂商新用户特惠通常在 60 ~ 120 元/首年。
- **地域与备案考量**：
  - **国内大陆节点（北京/上海/广州/杭州）**：网络延迟极低（10~30ms），但根据法规**域名必须完成工信部 ICP 备案**（通过手机小程序提交，约需 3~7 个工作日）。
  - **免备案节点（中国香港/新加坡）**：购买后即可绑定域名公网解析，免去备案等待，国内直连延迟通常在 35~70ms 之间。
- **操作系统镜像**：统一选择 **Ubuntu 22.04 LTS 64 位**。

#### 2. 域名选购与 DNS 解析
1. 在腾讯云 DNSPod、阿里云万网等平台注册域名（例如 `yourname-focus.com` 或 `.top` / `.cc`，首年仅需十数元）。
2. 进入云解析 DNS 控制台，为您的域名添加两条解析记录：
   - **记录 1**：主机记录 `@`，记录类型 `A`，记录值填入 **云服务器公网 IP**。
   - **记录 2**：主机记录 `www`，记录类型 `A`，记录值填入 **云服务器公网 IP**。
3. 在本地终端执行 `ping yourname-focus.com`，确认解析已正确指向该公网 IP。

---

### 第二步：云控制台安全组与防火墙加固

在云服务商网页控制台的「安全组」设置中，遵循最小权限暴露原则：
- **放行 TCP 22**：SSH 远程终端连接；
- **放行 TCP 80**：HTTP 服务（用于 Certbot 申请证书质询及 301 强制跳转）；
- **放行 TCP 443**：HTTPS 安全通讯（生产必须，PWA 与 Service Worker 前置依赖）；
- **严格封禁其他端口**：绝对禁止对外开放 3000、3306、6379 等内部端口。

---

### 第三步：云端环境初始化与代码数据平移

#### 1. 初始化云服务器基座
登录云服务器：
```powershell
ssh root@<您的云服务器公网IP>
```
按阶段一步骤依次安装：
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential python3 sqlite3 ufw fail2ban nginx certbot python3-certbot-nginx

# 安装 Node.js 20 LTS 与 PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

#### 2. 部署代码并执行生产构建
```bash
sudo mkdir -p /var/www/sacred-focus
sudo chown -R $USER:$USER /var/www/sacred-focus

cd /var/www
git clone <您的Git仓库地址> sacred-focus
cd sacred-focus

npm install
npm run build
```

#### 3. 历史数据平移（将虚拟机/本地积累的数据完整迁移至云端）
在 VMware 虚拟机上利用 SQLite 的热备命令生成一份完全一致的快照，并复制到云服务器：
```bash
# 在 VMware 虚拟机终端执行
sqlite3 /var/www/sacred-focus/backend/data/app.db ".backup '/tmp/app_prod.db'"
scp /tmp/app_prod.db root@<云端服务器公网IP>:/var/www/sacred-focus/backend/data/app.db
```

#### 4. 配置云端生产环境 `.env` 与启动 PM2
在云端服务器 `/var/www/sacred-focus/backend/.env` 中配置相同的 `JWT_SECRET` 与 `ADMIN_PASSWORD_HASH`，启动后端服务：
```bash
cd /var/www/sacred-focus/backend
pm2 start dist/server.js --name "sacred-focus-backend"
pm2 startup
pm2 save
```

---

### 第四步：Let's Encrypt 自动化 SSL 证书与全量 HTTPS 配置

在公网环境下，**HTTPS 是强制要求的**。它不仅防范中间人窃听与篡改，更是手机端安装 PWA 应用的绝对前提。

#### 1. 配置 HTTP 临时站点用于证书质询
编辑云端 `/etc/nginx/sites-available/sacred-focus`：
```nginx
server {
    listen 80;
    server_name yourname-focus.com www.yourname-focus.com;

    location / {
        root /var/www/sacred-focus/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```
激活站点：
```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/sacred-focus /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

#### 2. 使用 Certbot 一键签发证书
```bash
sudo certbot --nginx -d yourname-focus.com -d www.yourname-focus.com
```
按照命令行提示：
- 填入您的常用电子邮箱（接收过期告警）；
- 同意 Let's Encrypt 服务条款；
- Certbot 将自动完成 ACME 域名归属验证，并自动修改 Nginx 配置文件引入证书。

#### 3. 生产级 HTTPS Nginx 最终标准配置
验证后的完整配置文件应符合如下工业级规范：
```nginx
# 1. 强制 HTTP 301 永久重定向至 HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourname-focus.com www.yourname-focus.com;
    return 301 https://$host$request_uri;
}

# 2. HTTPS 核心生产服务块
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourname-focus.com www.yourname-focus.com;

    # SSL 证书文件（由 Certbot 自动管理与挂载）
    ssl_certificate /etc/letsencrypt/live/yourname-focus.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourname-focus.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 25M;

    # Gzip 压缩配置
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    # 工业级安全响应标头
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 静态应用资源托管
    location / {
        root /var/www/sacred-focus/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;

        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 30d;
            add_header Cache-Control "public, no-transform";
        }
    }

    # 后端 API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```
重载生效：
```bash
sudo nginx -t && sudo systemctl reload nginx
```

#### 4. 证书自动续期模拟测试
Certbot 默认已注册 `systemd` 定时任务，每 90 天到期前自动续约，执行模拟测试：
```bash
sudo certbot renew --dry-run
```
提示 `all simulated renewals succeeded` 即代表永久免人工干预。

---

### 第五步：SQLite 数据库每日热备与灾备策略

#### 1. 编写自动化热备脚本
创建脚本目录并编写备份逻辑：
```bash
sudo mkdir -p /var/backups/sacred-focus
sudo mkdir -p /var/www/scripts
sudo nano /var/www/scripts/backup_db.sh
```
写入以下内容：
```bash
#!/bin/bash
set -e

# 参数定义
DB_PATH="/var/www/sacred-focus/backend/data/app.db"
BACKUP_DIR="/var/backups/sacred-focus"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEST_FILE="$BACKUP_DIR/app_backup_$TIMESTAMP.db"

mkdir -p "$BACKUP_DIR"

# 利用 SQLite 在线事务一致性热备命令导出快照
if [ -f "$DB_PATH" ]; then
    sqlite3 "$DB_PATH" ".backup '$DEST_FILE'"
    # 高比例压缩
    gzip -9 "$DEST_FILE"
    echo "[$TIMESTAMP] Database backup successfully created: ${DEST_FILE}.gz"
fi

# 自动清理保留期超过 30 天的历史冷备
find "$BACKUP_DIR" -name "app_backup_*.db.gz" -type f -mtime +30 -delete
```
赋权并手动试运行一次：
```bash
sudo chmod +x /var/www/scripts/backup_db.sh
sudo /var/www/scripts/backup_db.sh
ls -lh /var/backups/sacred-focus/
```

#### 2. 挂载 Crontab 计划任务
```bash
sudo crontab -e
```
添加以下定时任务（每天凌晨 03:30 自动备份，避开专注心流高峰）：
```cron
30 3 * * * /var/www/scripts/backup_db.sh >> /var/log/sacred_focus_backup.log 2>&1
```

---

### 第六步：移动端 PWA 安装与沉浸式体验交付

系统已完整配置移动端 Manifest、矢量应用图标与 Service Worker，可作为原生 Web App 独立运行。

#### 1. iOS 设备安装流程（iPhone / iPad）
1. 在自带的 **Safari 浏览器** 中打开 `https://yourname-focus.com`；
2. 完成一次管理员登录，凭据将安全持久化；
3. 点击 Safari 底部中央的 **“分享”** 图标（带有向上箭头的正方形）；
4. 向下滑动找到并轻点 **“添加到主屏幕”**（Add to Home Screen）；
5. 命名为 **“Sacred Focus”**，点击右上角“添加”；
6. 效果体验：
   - 桌面生成独立金色六边形应用图标；
   - 点击启动后**彻底移除 Safari 顶部网址栏与底部工具栏**；
   - 支持 iOS 底部手势横条安全区沉浸自适应，享有纯正 Native App 质感。

#### 2. Android 设备安装流程（小米/红米/华为/荣耀等）
1. 在 **Chrome**、**Edge** 或系统自带浏览器中打开 `https://yourname-focus.com`；
2. 页面底部会自动滑出 **“将 Sacred Focus 添加至主屏幕”** 快捷横幅（或点击右上角三点菜单 -> 选择 **“安装应用”**）；
3. 确认添加后系统将在桌面创建 WebAPK 原生独立进程；
4. 点击即可进入全屏独立窗口，零干扰投入自控契约。

---

## 附录：运维常用命令与故障排除速查手册

### 1. 核心日常运维命令

| 业务场景 | 执行命令 |
| :--- | :--- |
| **检查后端运行状态** | `pm2 status` |
| **查看后端动态输出日志** | `pm2 logs sacred-focus-backend --lines 100` |
| **重启后端应用进程** | `pm2 restart sacred-focus-backend` |
| **代码更新后一键热发布** | `git pull && npm run build && pm2 reload sacred-focus-backend` |
| **测试并重载 Nginx 网关**| `sudo nginx -t && sudo systemctl reload nginx` |
| **查看服务器 UFW 防火墙** | `sudo ufw status verbose` |
| **即时手动执行全库备份** | `sudo /var/www/scripts/backup_db.sh` |
| **查看 SSL 证书有效天数** | `sudo certbot certificates` |

---

### 2. 常见故障与排错指南

#### Q1: `npm install` 时报 `node-gyp` 或 `better-sqlite3` 编译失败？
- **原因**：Linux 缺少 C++ 原生编译工具链或 Python 运行环境。
- **排错**：
  ```bash
  sudo apt install -y build-essential python3
  cd /var/www/sacred-focus/backend
  npm rebuild better-sqlite3
  ```

#### Q2: 浏览器刷新页面报 `404 Not Found`？
- **原因**：Vue Router 使用了 History 模式，Nginx 未将未匹配的路径重写至 `/index.html`。
- **排错**：确保 Nginx `location /` 块中配置了：
  ```nginx
  try_files $uri $uri/ /index.html;
  ```

#### Q3: 访问 API 时日志显示客户端 IP 全是 `127.0.0.1`，导致频控异常？
- **原因**：Nginx 没有向反代服务传递真实的客户端 IP 头，或 Express 没有开启代理信任。
- **排错**：
  - 检查 Nginx 是否包含：`proxy_set_header X-Real-IP $remote_addr;` 与 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`。
  - 检查 `backend/src/server.ts` 中是否存在 `app.set('trust proxy', 1);`（代码中已内置）。

#### Q4: SQLite 报 `SQLITE_CANTOPEN` 或 `attempt to write a readonly database`？
- **原因**：存放数据库文件的 `backend/data` 目录没有对应写入权限。
- **排错**：
  ```bash
  sudo chown -R $USER:$USER /var/www/sacred-focus/backend/data
  chmod 755 /var/www/sacred-focus/backend/data
  ```
