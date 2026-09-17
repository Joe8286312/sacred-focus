import type { EvolutionRepository } from '../repositories/evolutionRepository.js';
import type { SystemMetaRepository } from '../repositories/systemMetaRepository.js';

export interface SyncStatus {
  revision: number;
  evolutionVersion: string;
  updatedAt: string;
}

export interface SyncStatusServiceDependencies {
  evolutionRepository: Pick<EvolutionRepository, 'getState'>;
  systemMetaRepository: Pick<SystemMetaRepository, 'getSystemRevision' | 'getValue'>;
  now?: () => Date;
}

/** 同步探针的只读应用服务；组合多个 repository 而不感知 HTTP 或 SQLite。 */
export function createSyncStatusService({
  evolutionRepository,
  systemMetaRepository,
  now = () => new Date()
}: SyncStatusServiceDependencies) {
  function getStatus(): SyncStatus {
    const evolution = evolutionRepository.getState();
    const activeSnapshot = evolution.snapshots.find(snapshot => snapshot.slotIndex === evolution.activePointerIndex);
    return {
      revision: systemMetaRepository.getSystemRevision(),
      evolutionVersion: activeSnapshot?.version || 'v1.0',
      updatedAt: systemMetaRepository.getValue('last_sync_timestamp') || now().toISOString()
    };
  }

  return { getStatus };
}
