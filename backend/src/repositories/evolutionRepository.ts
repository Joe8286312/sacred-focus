import type { SqliteDatabasePort } from './databasePort.js';
import { createFocusTreeRepository } from './focusTreeRepository.js';
import { createSystemMetaRepository } from './systemMetaRepository.js';
import { createMaintenanceRepository, RevisionPreconditionError } from './maintenanceRepository.js';
import type { EvolutionSnapshot, EvolutionSnapshotRow, EvolutionState, EvolutionStateRow, FocusTreeData } from '../types.js';

export interface EvolutionRepository {
  getState(): EvolutionState;
  exportArchitecture(): FocusTreeArchitectureExport;
  createSnapshot(input: { expectedRevision: number; changelogNotes: string; isMajor: boolean }): {
    version: string; nextVersion: string; slotIndex: number; targetSlotIndex: number; activePointerIndex: number; revision: number;
  };
  rollback(input: { expectedRevision: number; targetSlotIndex: number }): { version: string; revision: number; liveTree: FocusTreeData } | undefined;
  importArchitecture(input: { expectedRevision: number; tree: FocusTreeData; evolution?: EvolutionImportData }): number;
}

export interface FocusTreeArchitectureExport {
  schemaVersion: '1.0';
  dataType: 'FOCUS_TREE_ARCHITECTURE';
  exportedAt: string;
  focusTree: FocusTreeData;
  liveTree: FocusTreeData;
  evolution: {
    state: EvolutionStateRow | undefined;
    snapshots: EvolutionSnapshotRow[];
  };
}

export interface EvolutionImportData {
  state?: { activePointerIndex?: number };
  snapshots?: Array<{
    slotIndex: number;
    id: string;
    version: string;
    timestamp: string;
    changelogNotes: string;
    isMajor: boolean;
    dataJson?: unknown;
  }>;
}

function toSnapshot(row: EvolutionSnapshotRow): EvolutionSnapshot {
  const parsed = JSON.parse(row.dataJson);
  return { id: row.id, slotIndex: row.slotIndex, version: row.version, timestamp: row.timestamp, changelogNotes: row.changelogNotes,
    isMajor: Boolean(row.isMajor), nodes: parsed.nodes, edges: parsed.edges, groups: parsed.groups };
}

/** 演化状态、快照、回滚恢复与架构导入的 SQLite 事务边界。 */
export function createEvolutionRepository(db: SqliteDatabasePort): EvolutionRepository {
  const focusTree = createFocusTreeRepository(db);
  const systemMeta = createSystemMetaRepository(db);
  const maintenance = createMaintenanceRepository(db);
  function restoreTree(tree: FocusTreeData, useImportDefaults: boolean) {
    // 外键始终开启：先清理依赖表，再清理被引用实体；调用方的事务负责完整回滚。
    db.prepare('DELETE FROM focus_edges').run();
    db.prepare('DELETE FROM focus_nodes').run();
    db.prepare('DELETE FROM focus_groups').run();
    db.prepare('DELETE FROM focus_labels').run();

    const groups = db.prepare('INSERT INTO focus_groups (id,name,themeColor,positionX,positionY,width,height) VALUES (@id,@name,@themeColor,@positionX,@positionY,@width,@height)');
    for (const group of useImportDefaults ? tree.groups || [] : tree.groups) {
      groups.run({
        id: group.id,
        name: group.name,
        themeColor: group.themeColor,
        positionX: useImportDefaults ? group.position?.x ?? 0 : group.position.x,
        positionY: useImportDefaults ? group.position?.y ?? 0 : group.position.y,
        width: useImportDefaults ? group.size?.width ?? 480 : group.size.width,
        height: useImportDefaults ? group.size?.height ?? 360 : group.size.height
      });
    }
    for (const [index, node] of (useImportDefaults ? tree.nodes || [] : tree.nodes).entries()) {
      focusTree.upsertFocusNode(node, index);
    }
    const edges = db.prepare('INSERT INTO focus_edges (id,sourceId,sourceType,targetId,targetType,sourceAnchor,targetAnchor,style) VALUES (@id,@sourceId,@sourceType,@targetId,@targetType,@sourceAnchor,@targetAnchor,@style)');
    for (const edge of useImportDefaults ? tree.edges || [] : tree.edges) edges.run(edge);
    const labels = db.prepare('INSERT INTO focus_labels (id,text,positionX,positionY) VALUES (@id,@text,@positionX,@positionY)');
    const treeLabels = useImportDefaults ? tree.labels || [] : tree.labels;
    if (treeLabels) {
      for (const label of treeLabels) {
        labels.run({ id: label.id, text: label.text, positionX: label.position?.x ?? 0, positionY: label.position?.y ?? 0 });
      }
    }
  }
  function getState(): EvolutionState {
    const state = db.prepare('SELECT activePointerIndex FROM evolution_state WHERE id = 1').get() as Pick<EvolutionStateRow, 'activePointerIndex'> | undefined;
    const rows = db.prepare('SELECT * FROM evolution_snapshots ORDER BY slotIndex ASC').all() as EvolutionSnapshotRow[];
    return { activePointerIndex: state?.activePointerIndex ?? 0, snapshots: rows.map(toSnapshot) };
  }
  function exportArchitecture(): FocusTreeArchitectureExport {
    const liveTree = focusTree.getFullFocusTreeData();
    const state = db.prepare('SELECT * FROM evolution_state WHERE id = 1').get() as EvolutionStateRow | undefined;
    const snapshots = db.prepare('SELECT * FROM evolution_snapshots ORDER BY slotIndex ASC').all() as EvolutionSnapshotRow[];
    return {
      schemaVersion: '1.0',
      dataType: 'FOCUS_TREE_ARCHITECTURE',
      exportedAt: new Date().toISOString(),
      focusTree: liveTree,
      liveTree,
      evolution: { state, snapshots }
    };
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
  function rollback({ expectedRevision, targetSlotIndex }: { expectedRevision: number; targetSlotIndex: number }) {
    const snapshot = db.prepare('SELECT * FROM evolution_snapshots WHERE slotIndex = ?').get(targetSlotIndex) as EvolutionSnapshotRow | undefined;
    if (!snapshot) return undefined;
    return db.transaction(() => {
      const revision = systemMeta.getSystemRevision(); if (revision !== expectedRevision) throw new RevisionPreconditionError(revision);
      db.prepare('UPDATE evolution_state SET activePointerIndex = ? WHERE id = 1').run(targetSlotIndex);
      restoreTree(JSON.parse(snapshot.dataJson) as FocusTreeData, false);
      maintenance.assertForeignKeyIntegrity();
      return { version: snapshot.version, revision: systemMeta.incrementSystemRevision(new Date().toISOString()), liveTree: focusTree.getFullFocusTreeData() };
    })();
  }
  function importArchitecture({ expectedRevision, tree, evolution }: { expectedRevision: number; tree: FocusTreeData; evolution?: EvolutionImportData }) {
    return db.transaction(() => {
      const revision = systemMeta.getSystemRevision(); if (revision !== expectedRevision) throw new RevisionPreconditionError(revision);
      restoreTree(tree, true);
      if (evolution?.state) db.prepare('UPDATE evolution_state SET activePointerIndex = ? WHERE id = 1').run(evolution.state.activePointerIndex ?? 0);
      if (Array.isArray(evolution?.snapshots)) {
        db.prepare('DELETE FROM evolution_snapshots').run();
        const snapshots = db.prepare('INSERT INTO evolution_snapshots (slotIndex,id,version,timestamp,changelogNotes,isMajor,dataJson) VALUES (@slotIndex,@id,@version,@timestamp,@changelogNotes,@isMajor,@dataJson)');
        for (const item of evolution.snapshots) snapshots.run({ slotIndex: item.slotIndex, id: item.id, version: item.version, timestamp: item.timestamp, changelogNotes: item.changelogNotes, isMajor: item.isMajor ? 1 : 0, dataJson: typeof item.dataJson === 'string' ? item.dataJson : JSON.stringify(item) });
      }
      maintenance.assertForeignKeyIntegrity(); return systemMeta.incrementSystemRevision(new Date().toISOString());
    })();
  }
  return { getState, exportArchitecture, createSnapshot, rollback, importArchitecture };
}
