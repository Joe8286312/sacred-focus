import type { FullSystemBackup, FullSystemRestoreInput, SystemBackupRepository } from '../repositories/systemBackupRepository.js';
import type { MaintenanceRepository } from '../repositories/maintenanceRepository.js';

export type SystemBackupImportPhase = 'acquire' | 'backup' | 'restore';

/** 标识整机导入失败所在阶段，供 HTTP 适配器保持既有错误响应。 */
export class SystemBackupImportError extends Error {
  constructor(
    public readonly phase: SystemBackupImportPhase,
    public readonly cause: unknown
  ) {
    super(`SYSTEM_BACKUP_IMPORT_${phase.toUpperCase()}_FAILED`);
    this.name = 'SystemBackupImportError';
  }
}

export type FullSystemImportInput = Omit<FullSystemRestoreInput, 'maintenanceLease'> & {
  expectedRevision: number;
};

export interface SystemBackupServiceDependencies {
  systemBackupRepository: Pick<SystemBackupRepository, 'exportFullBackup' | 'createPreImportBackup' | 'restoreFullBackup'>;
  maintenanceRepository: Pick<MaintenanceRepository, 'acquireMaintenanceLease' | 'releaseMaintenanceLease'>;
}

/** 整机备份用例的应用服务边界；不依赖 Express 或 SQLite 单例。 */
export function createSystemBackupService({
  systemBackupRepository,
  maintenanceRepository
}: SystemBackupServiceDependencies) {
  function exportFullBackup(): FullSystemBackup {
    return systemBackupRepository.exportFullBackup();
  }

  async function createPreImportBackup() {
    return systemBackupRepository.createPreImportBackup();
  }

  function restoreFullBackup(input: Parameters<SystemBackupRepository['restoreFullBackup']>[0]) {
    return systemBackupRepository.restoreFullBackup(input);
  }

  /** 整机导入的维护租约、热备、恢复与释放顺序。 */
  async function importFullBackup({ expectedRevision, ...restoreInput }: FullSystemImportInput) {
    let maintenanceLease: ReturnType<MaintenanceRepository['acquireMaintenanceLease']> | undefined;
    try {
      try {
        maintenanceLease = maintenanceRepository.acquireMaintenanceLease('full-system-import', expectedRevision);
      } catch (error) {
        throw new SystemBackupImportError('acquire', error);
      }

      let preImportBackup;
      try {
        preImportBackup = await createPreImportBackup();
      } catch (error) {
        throw new SystemBackupImportError('backup', error);
      }

      try {
        const summary = restoreFullBackup({ maintenanceLease, ...restoreInput });
        return { preImportBackup, summary };
      } catch (error) {
        throw new SystemBackupImportError('restore', error);
      }
    } finally {
      if (maintenanceLease) maintenanceRepository.releaseMaintenanceLease(maintenanceLease);
    }
  }

  return { exportFullBackup, createPreImportBackup, restoreFullBackup, importFullBackup };
}
