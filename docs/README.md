# Sacred Focus 文档索引

本文档集以当前代码为事实来源，描述稳定的运行、模块和接口边界；不保留已经完成的重构过程记录。

首次使用先读根目录 [README](../README.md) 和 [多人使用指南](multiuser.md)。已在云服务器运行、需要发布新版本时，直接按 [云服务器项目更新指南](cloud-server-update.md) 操作；首次安装用部署指南，脚本与备份恢复的细节查运维手册。

| 文档 | 用途 |
|---|---|
| [架构概览](ARCHITECTURE_OVERVIEW.md) | 快速了解组件、账号工作区和主要数据流，再进入详细架构。 |
| [系统架构](architecture.md) | 分层、依赖方向、启动流程、安全和一致性边界。 |
| [模块说明](modules.md) | 前端、后端、数据、共享契约和交付模块的职责与物理位置。 |
| [API 与数据模型](api-and-data.md) | HTTP 路由、共享领域对象、SQLite 表和并发/导入约束。 |
| [开发与验证](development.md) | 本地启动、测试、构建、配置和文档维护规则。 |
| [多人使用指南](multiuser.md) | 公用体验、服务器创建个人账号、旧数据升级与容量控制。 |
| [部署新手指南](deployment-beginner-guide.md) | 从 VMware 局域网演练到云服务器、域名与可信 HTTPS 上线。 |
| [云服务器首次部署清单](cloud-production-deployment.md) | 域名、可信证书、Docker 上线与多项目资源隔离。 |
| [云服务器项目更新指南](cloud-server-update.md) | Windows 构建与上传、服务器备份与发布、验收和回滚的具体步骤。 |
| [部署与运维手册](../scripts/README.md) | 镜像、Compose、TLS、备份、恢复和更新回滚。 |
| [证书管理说明](../nginx/ssl/README.md) | 本地演练证书、生产证书挂载和续期边界。 |

文档按职责分工：产品能力与使用入口放在根 README；组件与协议放在架构、模块、API 文档；首次部署放在两份部署指南；日常版本更新放在云更新指南；运维脚本和数据恢复的详细约定放在 `scripts/README.md`。相同流程通过链接引用，避免多处维护互相矛盾的操作命令。

阅读代码时，应从共享契约与业务服务向两侧扩展：`contracts/` 定义跨端对象，`backend/src/services/` 编排用例，`backend/src/repositories/` 承担 SQLite 访问，路由与浏览器适配器只做协议转换和依赖装配。
