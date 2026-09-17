import path from 'path';
import { promises as fs } from 'fs';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { SqliteDatabasePort } from './databasePort.js';
import { createFocusTreeRepository } from './focusTreeRepository.js';
import { createMaintenanceRepository, type MaintenanceLease, type MaintenanceRepository } from './maintenanceRepository.js';
import { createSystemMetaRepository } from './systemMetaRepository.js';
import type { FocusTreeData } from '../types.js';
import type { EvolutionImportData } from './evolutionRepository.js';

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

export interface FullSystemRestoreInput {
  maintenanceLease: MaintenanceLease;
  tree: FocusTreeData;
  sacredSeatConfig?: any;
  precedentCases?: any[] | null;
  evolution?: EvolutionImportData | null;
  sessionLogs?: any[] | null;
}

export interface FullSystemRestoreSummary {
  nodesRestored: number;
  groupsRestored: number;
  edgesRestored: number;
  labelsRestored: number;
  snapshotsRestored: number;
  logsRestored: number;
  casesRestored: number;
  revision: number;
}

export interface SystemBackupRepository {
  exportFullBackup(): FullSystemBackup;
  createPreImportBackup(): Promise<PreImportBackupResult>;
  restoreFullBackup(input: FullSystemRestoreInput): FullSystemRestoreSummary;
}

export interface SystemBackupRepositoryOptions {
  maintenanceRepository?: MaintenanceRepository;
  dataDir?: string;
  preImportBackupRetention?: number;
  now?: () => Date;
}

export interface PreImportBackupResult {
  backupFile: string;
  prunedCount: number;
  pruneError?: unknown;
}

type BackupCapableSqliteDatabasePort = SqliteDatabasePort & Pick<SqliteDatabase, 'backup'>;

/** 系统整机镜像导出与事务恢复的 SQLite 数据访问边界。 */
export function createSystemBackupRepository(
  db: SqliteDatabasePort,
  {
    maintenanceRepository,
    dataDir,
    preImportBackupRetention = 5,
    now = () => new Date()
  }: SystemBackupRepositoryOptions = {}
): SystemBackupRepository {
  const focusTree = createFocusTreeRepository(db);
  const maintenance = maintenanceRepository ?? createMaintenanceRepository(db);
  const systemMeta = createSystemMetaRepository(db);
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

  async function createPreImportBackup(): Promise<PreImportBackupResult> {
    if (!dataDir || !('backup' in db) || typeof db.backup !== 'function') {
      throw new Error('PRE_IMPORT_BACKUP_UNSUPPORTED');
    }

    const timestamp = now().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(dataDir, `app_pre_import_${timestamp}.db`);
    await (db as BackupCapableSqliteDatabasePort).backup(backupFile);

    try {
      const entries = await fs.readdir(dataDir, { withFileTypes: true });
      const backupFiles = await Promise.all(entries
        .filter(entry => entry.isFile() && /^app_pre_import_.*\.db$/i.test(entry.name))
        .map(async entry => {
          const filePath = path.join(dataDir, entry.name);
          const stat = await fs.stat(filePath);
          return { filePath, modifiedAt: stat.mtimeMs };
        }));
      backupFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);
      const expiredBackups = backupFiles.slice(preImportBackupRetention);
      await Promise.all(expiredBackups.map(backup => fs.unlink(backup.filePath)));
      return { backupFile, prunedCount: expiredBackups.length };
    } catch (pruneError) {
      // 热备已成功；裁剪失败不能降低当前恢复操作的可回退性。
      return { backupFile, prunedCount: 0, pruneError };
    }
  }

  function restoreFullBackup({
    maintenanceLease,
    tree,
    sacredSeatConfig,
    precedentCases,
    evolution,
    sessionLogs
  }: FullSystemRestoreInput): FullSystemRestoreSummary {
    const insertGroup = db.prepare(`
      INSERT INTO focus_groups (id, name, themeColor, positionX, positionY, width, height)
      VALUES (@id, @name, @themeColor, @positionX, @positionY, @width, @height)
    `);
    const insertEdge = db.prepare(`
      INSERT INTO focus_edges (id, sourceId, sourceType, targetId, targetType, sourceAnchor, targetAnchor, style)
      VALUES (@id, @sourceId, @sourceType, @targetId, @targetType, @sourceAnchor, @targetAnchor, @style)
    `);
    const insertLabel = db.prepare(`
      INSERT INTO focus_labels (id, text, positionX, positionY)
      VALUES (@id, @text, @positionX, @positionY)
    `);
    const insertCase = db.prepare(`
      INSERT INTO precedent_cases (id, date, behavior, verdict, boundaryCondition, createdAt)
      VALUES (@id, @date, @behavior, @verdict, @boundaryCondition, @createdAt)
    `);
    const insertSnap = db.prepare(`
      INSERT INTO evolution_snapshots (slotIndex, id, version, timestamp, changelogNotes, isMajor, dataJson)
      VALUES (@slotIndex, @id, @version, @timestamp, @changelogNotes, @isMajor, @dataJson)
    `);
    const insertLog = db.prepare(`
      INSERT INTO focus_session_logs (id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status, focusContent, failureReason, note)
      VALUES (@id, @type, @startTime, @endTime, @targetDurationMinutes, @actualDurationSeconds, @status, @focusContent, @failureReason, @note)
    `);
    const upsertSeatConfig = db.prepare(`
      INSERT OR REPLACE INTO sacred_seat_config (id, sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak, updatedAt)
      VALUES (1, @sacredToken, @reservationSignal, @defaultFocusDuration, @regretWindowSeconds, @currentStreak, @maxStreak, @updatedAt)
    `);
    const updateEvolutionPointer = db.prepare('UPDATE evolution_state SET activePointerIndex = ? WHERE id = 1');

    return db.transaction(() => {
      // 热备等待期间若租约丢失或版本发生变化，绝不开始破坏性覆写。
      maintenance.assertMaintenanceLease(maintenanceLease);

      const groups = tree.groups || [];
      const nodes = tree.nodes || [];
      const edges = tree.edges || [];
      const labels = tree.labels || [];

      // 外键持续开启；先删依赖项，再删被引用实体，全部操作失败时自动回滚。
      db.prepare('DELETE FROM focus_edges').run();
      db.prepare('DELETE FROM focus_nodes').run();
      db.prepare('DELETE FROM focus_groups').run();
      db.prepare('DELETE FROM focus_labels').run();

      for (const group of groups) {
        insertGroup.run({
          id: group.id,
          name: group.name,
          themeColor: group.themeColor,
          positionX: group.position?.x ?? 0,
          positionY: group.position?.y ?? 0,
          width: group.size?.width ?? 480,
          height: group.size?.height ?? 360
        });
      }
      for (const [index, node] of nodes.entries()) focusTree.upsertFocusNode(node, index);
      for (const edge of edges) insertEdge.run(edge);
      for (const label of labels) {
        insertLabel.run({
          id: label.id,
          text: label.text,
          positionX: label.position?.x ?? 0,
          positionY: label.position?.y ?? 0
        });
      }

      if (sacredSeatConfig) upsertSeatConfig.run(sacredSeatConfig);

      if (precedentCases) {
        db.prepare('DELETE FROM precedent_cases').run();
        for (const caseItem of precedentCases) insertCase.run(caseItem);
      }

      if (evolution) {
        if (evolution.state) updateEvolutionPointer.run(evolution.state.activePointerIndex ?? 0);
        if (evolution.snapshots) {
          db.prepare('DELETE FROM evolution_snapshots').run();
          for (const snapshot of evolution.snapshots) {
            insertSnap.run({
              slotIndex: snapshot.slotIndex,
              id: snapshot.id,
              version: snapshot.version,
              timestamp: snapshot.timestamp,
              changelogNotes: snapshot.changelogNotes,
              isMajor: snapshot.isMajor ? 1 : 0,
              dataJson: typeof snapshot.dataJson === 'string' ? snapshot.dataJson : JSON.stringify(snapshot)
            });
          }
        }
      }

      if (sessionLogs) {
        db.prepare('DELETE FROM focus_session_logs').run();
        for (const log of sessionLogs) {
          insertLog.run({
            ...log,
            focusContent: log.focusContent ?? null,
            failureReason: log.failureReason ?? null,
            note: log.note ?? null
          });
        }
      }

      maintenance.assertForeignKeyIntegrity();
      const revision = systemMeta.incrementSystemRevision(new Date().toISOString());
      return {
        nodesRestored: nodes.length,
        groupsRestored: groups.length,
        edgesRestored: edges.length,
        labelsRestored: labels.length,
        snapshotsRestored: evolution?.snapshots?.length ?? 0,
        logsRestored: sessionLogs?.length ?? 0,
        casesRestored: precedentCases?.length ?? 0,
        revision
      };
    })();
  }

  return { exportFullBackup, createPreImportBackup, restoreFullBackup };
}
