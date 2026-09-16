import { db } from './connection.js';
import {
  createMaintenanceRepository,
  MaintenanceInProgressError,
  RevisionPreconditionError,
  type MaintenanceLease
} from '../repositories/maintenanceRepository.js';

export { MaintenanceInProgressError, RevisionPreconditionError, type MaintenanceLease };

/** 兼容入口：维护租约与外键校验已迁移至 repositories/maintenanceRepository。 */
const repository = createMaintenanceRepository(db);
export const getActiveMaintenanceLease = repository.getActiveMaintenanceLease;
export const acquireMaintenanceLease = repository.acquireMaintenanceLease;
export const assertMaintenanceLease = repository.assertMaintenanceLease;
export const releaseMaintenanceLease = repository.releaseMaintenanceLease;
export const assertForeignKeyIntegrity = repository.assertForeignKeyIntegrity;
