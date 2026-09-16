/**
 * 数据访问层的公开入口。
 * 新 repository 必须接收 databasePort，不得从 HTTP 层或 Express 类型导入依赖。
 */
export type { SqliteDatabasePort } from './databasePort.js';
export { createFocusTreeRepository, type FocusTreeRepository } from './focusTreeRepository.js';
export {
  createMaintenanceRepository,
  MaintenanceInProgressError,
  RevisionPreconditionError,
  type MaintenanceLease,
  type MaintenanceRepository,
  type MaintenanceRepositoryOptions
} from './maintenanceRepository.js';
export { createSystemMetaRepository, type SystemMetaRepository } from './systemMetaRepository.js';
