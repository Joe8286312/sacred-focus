/**
 * Sacred Focus 数据持久化统一中枢 (D-2 治理重构)
 * 原 1089 行 God Object 已拆解为高内聚、单职责子模块：
 *  - db/connection.ts   : 数据库实例与 WAL / 外键连接配置
 *  - db/schema.ts       : 9 大核心数据表 DDL 定义
 *  - db/migrations.ts   : 字段平滑升级与数据对齐迁移
 *  - db/seed.ts         : 最小运行状态初始化（不写入任何演示国策数据）
 *  - domain/calendar/businessDay.ts : 04:00 业务日计算算法（db/dateUtils.ts 保留兼容转出）
 *  - db/revision.ts     : 全局系统原子版本号与时间戳
 *  - db/queries/focusTree.ts  : 国策树查询与 upsertFocusNode
 *  - db/queries/settlement.ts : 每日首次上线结算引擎
 */

export * from './db/index.js';
export { db } from './db/index.js';
