import type { SqliteDatabasePort } from './databasePort.js';
import { createFocusTreeRepository } from './focusTreeRepository.js';

export interface FullSystemBackup {
  version: number;
  dataType: string;
  exportedAt: string;
  summary: Record<string, number>;
  focusTree: unknown;
  liveTree: unknown;
  sacredSeatConfig: unknown;
  precedentCases: unknown[];
  evolution: { state: unknown; snapshots: unknown[] };
  sessionLogs: unknown[];
}

/** 系统整机备份的只读导出边界；破坏性恢复在单独事务中迁移。 */
export function createSystemBackupRepository(db: SqliteDatabasePort): { exportFullBackup(): FullSystemBackup } {
  const focusTree = createFocusTreeRepository(db);
  function exportFullBackup(): FullSystemBackup {
    const liveTree = focusTree.getFullFocusTreeData();
    const sacredSeatConfig = db.prepare('SELECT * FROM sacred_seat_config WHERE id = 1').get();
    const precedentCases = db.prepare('SELECT * FROM precedent_cases ORDER BY date DESC, createdAt DESC').all();
    const evolutionState = db.prepare('SELECT * FROM evolution_state WHERE id = 1').get();
    const evolutionSnapshots = db.prepare('SELECT * FROM evolution_snapshots ORDER BY slotIndex ASC').all();
    const sessionLogs = db.prepare('SELECT * FROM focus_session_logs ORDER BY startTime DESC').all();
    return {
      version: 1, dataType: 'SACRED_FOCUS_FULL_SYSTEM', exportedAt: new Date().toISOString(),
      summary: { groupCount: liveTree.groups.length, nodeCount: liveTree.nodes.length, edgeCount: liveTree.edges.length,
        labelCount: liveTree.labels ? liveTree.labels.length : 0, snapshotCount: evolutionSnapshots.length,
        logCount: sessionLogs.length, caseCount: precedentCases.length },
      focusTree: liveTree, liveTree, sacredSeatConfig, precedentCases,
      evolution: { state: evolutionState, snapshots: evolutionSnapshots }, sessionLogs
    };
  }
  return { exportFullBackup };
}
