# Sacred Focus 文档索引

本文档集以当前代码为事实来源，描述稳定的运行、模块和接口边界；不保留已经完成的重构过程记录。

| 文档 | 用途 |
|---|---|
| [系统架构](architecture.md) | 分层、依赖方向、启动流程、安全和一致性边界。 |
| [模块说明](modules.md) | 前端、后端、数据、共享契约和交付模块的职责与物理位置。 |
| [API 与数据模型](api-and-data.md) | HTTP 路由、共享领域对象、SQLite 表和并发/导入约束。 |
| [开发与验证](development.md) | 本地启动、测试、构建、配置和文档维护规则。 |
| [部署新手指南](deployment-beginner-guide.md) | 从 VMware 局域网演练到云服务器、域名与可信 HTTPS 上线。 |
| [云服务器正式部署清单](cloud-production-deployment.md) | 域名、可信证书、Docker 上线与多项目资源隔离。 |
| [部署与运维手册](../scripts/README.md) | 镜像、Compose、TLS、备份、恢复和更新回滚。 |

阅读代码时，应从共享契约与业务服务向两侧扩展：`contracts/` 定义跨端对象，`backend/src/services/` 编排用例，`backend/src/repositories/` 承担 SQLite 访问，路由与浏览器适配器只做协议转换和依赖装配。
