/**
 * 数据访问层的公开入口。
 * 新 repository 必须接收 databasePort，不得从 HTTP 层或 Express 类型导入依赖。
 */
export type { SqliteDatabasePort } from './databasePort.js';
export { createFocusTreeRepository, type FocusTreeRepository } from './focusTreeRepository.js';
export { createEvolutionRepository, type EvolutionRepository } from './evolutionRepository.js';
export { createPrecedentCaseRepository, type PrecedentCaseRepository } from './precedentCaseRepository.js';
export { createSacredSeatRepository, type SacredSeatRepository } from './sacredSeatRepository.js';
export {
  createSystemBackupRepository,
  type FullSystemBackup,
  type FullSystemRestoreInput,
  type FullSystemRestoreSummary,
  type SystemBackupRepository,
  type SystemBackupRepositoryOptions
} from './systemBackupRepository.js';
export {
  createMaintenanceRepository,
  MaintenanceInProgressError,
  RevisionPreconditionError,
  type MaintenanceLease,
  type MaintenanceRepository,
  type MaintenanceRepositoryOptions
} from './maintenanceRepository.js';
export { createSystemMetaRepository, type SystemMetaRepository } from './systemMetaRepository.js';
