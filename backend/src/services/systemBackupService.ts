import type { FullSystemBackup, SystemBackupRepository } from '../repositories/systemBackupRepository.js';

export interface SystemBackupServiceDependencies {
  systemBackupRepository: Pick<SystemBackupRepository, 'exportFullBackup'>;
}

/** 整机备份用例的应用服务边界；不依赖 Express 或 SQLite 单例。 */
export function createSystemBackupService({
  systemBackupRepository
}: SystemBackupServiceDependencies) {
  function exportFullBackup(): FullSystemBackup {
    return systemBackupRepository.exportFullBackup();
  }

  return { exportFullBackup };
}
