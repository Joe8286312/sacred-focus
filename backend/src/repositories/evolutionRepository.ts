import type { SqliteDatabasePort } from './databasePort.js';
import { createFocusTreeRepository } from './focusTreeRepository.js';
import { createSystemMetaRepository } from './systemMetaRepository.js';
import { RevisionPreconditionError } from './maintenanceRepository.js';
import type { EvolutionSnapshot, EvolutionSnapshotRow, EvolutionState, EvolutionStateRow } from '../types.js';

export interface EvolutionRepository {
  getState(): EvolutionState;
  createSnapshot(input: { expectedRevision: number; changelogNotes: string; isMajor: boolean }): {
    version: string; nextVersion: string; slotIndex: number; targetSlotIndex: number; activePointerIndex: number; revision: number;
  };
}

function toSnapshot(row: EvolutionSnapshotRow): EvolutionSnapshot {
  const parsed = JSON.parse(row.dataJson);
  return { id: row.id, slotIndex: row.slotIndex, version: row.version, timestamp: row.timestamp, changelogNotes: row.changelogNotes,
    isMajor: Boolean(row.isMajor), nodes: parsed.nodes, edges: parsed.edges, groups: parsed.groups };
}

/** 演化状态读取与五槽快照写入的 SQLite 边界。 */
export function createEvolutionRepository(db: SqliteDatabasePort): EvolutionRepository {
  const focusTree = createFocusTreeRepository(db);
  const systemMeta = createSystemMetaRepository(db);
  function getState(): EvolutionState {
    const state = db.prepare('SELECT activePointerIndex FROM evolution_state WHERE id = 1').get() as Pick<EvolutionStateRow, 'activePointerIndex'> | undefined;
    const rows = db.prepare('SELECT * FROM evolution_snapshots ORDER BY slotIndex ASC').all() as EvolutionSnapshotRow[];
    return { activePointerIndex: state?.activePointerIndex ?? 0, snapshots: rows.map(toSnapshot) };
  }
  function createSnapshot({ expectedRevision, changelogNotes, isMajor }: { expectedRevision: number; changelogNotes: string; isMajor: boolean }) {
    return db.transaction(() => {
      const currentRevision = systemMeta.getSystemRevision();
      if (expectedRevision !== currentRevision) throw new RevisionPreconditionError(currentRevision);
      const state = getState();
      const current = state.snapshots.find(snapshot => snapshot.slotIndex === state.activePointerIndex);
      const match = (current?.version ?? 'v1.0').match(/^v(\d+)\.(\d+)$/);
      const nextVersion = match ? (isMajor ? `v${Number(match[1]) + 1}.0` : `v${match[1]}.${Number(match[2]) + 1}`) : 'v1.1';
      const targetSlotIndex = state.snapshots.length < 5 ? state.snapshots.length : (state.activePointerIndex + 1) % 5;
      const tree = focusTree.getFullFocusTreeData();
      const snapshot: EvolutionSnapshot = { version: nextVersion, timestamp: new Date().toISOString(), changelogNotes,
        isMajor: Boolean(isMajor), nodes: tree.nodes, edges: tree.edges, groups: tree.groups, labels: tree.labels || [] };
      db.prepare(`INSERT OR REPLACE INTO evolution_snapshots (slotIndex,id,version,timestamp,changelogNotes,isMajor,dataJson)
        VALUES (@slotIndex,@id,@version,@timestamp,@changelogNotes,@isMajor,@dataJson)`).run({
        slotIndex: targetSlotIndex, id: `snap-${Date.now()}`, version: snapshot.version, timestamp: snapshot.timestamp,
        changelogNotes: snapshot.changelogNotes, isMajor: snapshot.isMajor ? 1 : 0, dataJson: JSON.stringify(snapshot)
      });
      db.prepare('UPDATE evolution_state SET activePointerIndex = ? WHERE id = 1').run(targetSlotIndex);
      const revision = systemMeta.incrementSystemRevision(new Date().toISOString());
      return { version: nextVersion, nextVersion, slotIndex: targetSlotIndex, targetSlotIndex, activePointerIndex: targetSlotIndex, revision };
    })();
  }
  return { getState, createSnapshot };
}
