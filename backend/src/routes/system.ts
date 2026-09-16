import { Router, Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { config } from '../config.js';
import {
  acquireMaintenanceLease,
  assertMaintenanceLease,
  assertForeignKeyIntegrity,
  db,
  getFullFocusTreeData,
  incrementSystemRevision,
  MaintenanceInProgressError,
  releaseMaintenanceLease,
  RevisionPreconditionError,
  upsertFocusNode
} from '../db.js';
import { exportLimiter, importLimiter } from '../middleware/rateLimiter.js';
import { validateFullBackupPayload } from '../utils/validators.js';
import { createSystemBackupRepository } from '../repositories/systemBackupRepository.js';

const router = Router();
const PRE_IMPORT_BACKUP_RETENTION = 5;
const repository = createSystemBackupRepository(db);

async function prunePreImportBackups() {
  const entries = await fs.readdir(config.dataDir, { withFileTypes: true });
  const backupFiles = await Promise.all(entries
    .filter(entry => entry.isFile() && /^app_pre_import_.*\.db$/i.test(entry.name))
    .map(async entry => {
      const filePath = path.join(config.dataDir, entry.name);
      const stat = await fs.stat(filePath);
      return { filePath, modifiedAt: stat.mtimeMs };
    }));

  backupFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);
  const expiredBackups = backupFiles.slice(PRE_IMPORT_BACKUP_RETENTION);
  await Promise.all(expiredBackups.map(backup => fs.unlink(backup.filePath)));
  return expiredBackups.length;
}

// 全量导出系统整机镜像（跨设备全量迁移与灾难恢复，15次/10分钟限流保护）
router.get('/export', exportLimiter, (_req: Request, res: Response) => {
  try {
    res.json(repository.exportFullBackup());
  } catch (e: any) {
    console.error('Failed to export full system backup', e);
    res.status(500).json({ error: 'Failed to export full system backup', details: e.message });
  }
});

// 全量导入整机镜像（跨设备整机恢复，带预热备与 10次/小时频控保护）
router.post('/import', importLimiter, async (req: Request, res: Response) => {
  const validation = validateFullBackupPayload(req.body);
  if (!validation.success || !validation.data) {
    return res.status(400).json({
      error: 'INVALID_BACKUP_SCHEMA',
      message: validation.error || '备份文件结构校验未通过',
      details: validation.details
    });
  }

  const expectedRevision = req.body?.expectedRevision;
  if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return res.status(400).json({
      error: 'EXPECTED_REVISION_REQUIRED',
      message: '整机恢复必须携带有效的 expectedRevision'
    });
  }

  const { tree, sacredSeatConfig, precedentCases, evolution, sessionLogs } = validation.data;
  let maintenanceLease;

  try {
    // 在任何 await 前同步取得维护租约；后续外部写请求由全局门禁统一拒绝。
    maintenanceLease = acquireMaintenanceLease('full-system-import', expectedRevision);
  } catch (e: any) {
    if (e instanceof RevisionPreconditionError) {
      return res.status(409).json({
        error: 'VERSION_CONFLICT',
        message: '系统已被其他终端修改，请同步最新状态后再执行整机恢复',
        currentRevision: e.currentRevision
      });
    }
    if (e instanceof MaintenanceInProgressError) {
      return res.status(503).json({
        error: 'MAINTENANCE_IN_PROGRESS',
        message: '已有整机恢复正在执行，请稍后重试',
        retryAfterSeconds: Math.max(1, Math.ceil((e.expiresAt - Date.now()) / 1000))
      });
    }
    throw e;
  }

  // 导入前自动热备当前 SQLite 数据库快照 (P1-002: 热备失败必须终止导入，严禁破坏性覆写)
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(config.dataDir, `app_pre_import_${timestamp}.db`);
    await db.backup(backupFile);
    console.log(`[Sacred Focus System] 预导入安全热备已生成: ${backupFile}`);
    try {
      const prunedCount = await prunePreImportBackups();
      if (prunedCount > 0) {
        console.log(`[Sacred Focus System] 已淘汰 ${prunedCount} 个过期预导入热备`);
      }
    } catch (pruneErr) {
      // 热备本身已经成功；清理失败不应降低本次恢复的可回退性。
      console.warn('[Sacred Focus System] 预导入热备清理失败，将在下次恢复时重试:', pruneErr);
    }
  } catch (backupErr: any) {
    console.error('[Sacred Focus System] 预导入热备创建失败，终止导入操作以防数据丢失:', backupErr);
    releaseMaintenanceLease(maintenanceLease);
    return res.status(500).json({
      error: 'BACKUP_FAILED_ABORT_IMPORT',
      message: '导入前热备数据库快照失败，为防止数据损坏已终止导入',
      details: backupErr?.message || String(backupErr)
    });
  }

  try {
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

    const importTx = db.transaction(() => {
      // 热备等待期间若发现租约丢失或 revision 改变，绝不开始破坏性覆写。
      assertMaintenanceLease(maintenanceLease);

      // 1. 恢复国策树 (groups, nodes, edges, labels)
      const groups = tree.groups || [];
      const nodes = tree.nodes || [];
      const edges = tree.edges || [];
      const labels = tree.labels || [];

      // 外键持续开启；先删依赖项，再删被引用实体，全部操作在同一事务内回滚。
      db.prepare('DELETE FROM focus_edges').run();
      db.prepare('DELETE FROM focus_nodes').run();
      db.prepare('DELETE FROM focus_groups').run();
      db.prepare('DELETE FROM focus_labels').run();

      for (const g of groups) {
        insertGroup.run({
          id: g.id,
          name: g.name,
          themeColor: g.themeColor,
          positionX: g.position?.x ?? 0,
          positionY: g.position?.y ?? 0,
          width: g.size?.width ?? 480,
          height: g.size?.height ?? 360
        });
      }

      // 恢复节点 (使用共享 upsertFocusNode 消除重复 SQL)
      for (let i = 0; i < nodes.length; i++) {
        upsertFocusNode(nodes[i], i);
      }

      for (const e of edges) {
        insertEdge.run(e);
      }

      for (const l of labels) {
        insertLabel.run({
          id: l.id,
          text: l.text,
          positionX: l.position?.x ?? 0,
          positionY: l.position?.y ?? 0
        });
      }

      // 2. 恢复神圣座位配置
      if (sacredSeatConfig) {
        upsertSeatConfig.run(sacredSeatConfig);
      }

      // 3. 恢复判例法典
      if (precedentCases) {
        db.prepare('DELETE FROM precedent_cases').run();
        for (const c of precedentCases) {
          insertCase.run(c);
        }
      }

      // 4. 恢复演化状态与快照
      if (evolution) {
        if (evolution.state) {
          updateEvolutionPointer.run(evolution.state.activePointerIndex ?? 0);
        }
        if (evolution.snapshots) {
          db.prepare('DELETE FROM evolution_snapshots').run();
          for (const s of evolution.snapshots) {
            insertSnap.run({
              slotIndex: s.slotIndex,
              id: s.id,
              version: s.version,
              timestamp: s.timestamp,
              changelogNotes: s.changelogNotes,
              isMajor: s.isMajor ? 1 : 0,
              dataJson: typeof s.dataJson === 'string' ? s.dataJson : JSON.stringify(s)
            });
          }
        }
      }

      // 5. 恢复流水日志
      if (sessionLogs) {
        db.prepare('DELETE FROM focus_session_logs').run();
        for (const l of sessionLogs) {
          insertLog.run({
            ...l,
            focusContent: l.focusContent ?? null,
            failureReason: l.failureReason ?? null,
            note: l.note ?? null
          });
        }
      }

      assertForeignKeyIntegrity();

      // 6. 原子推进全局系统版本号
      const revision = incrementSystemRevision();

      return {
        nodesRestored: nodes.length,
        groupsRestored: groups.length,
        edgesRestored: edges.length,
        labelsRestored: labels.length,
        snapshotsRestored: (evolution?.snapshots || []).length,
        logsRestored: (sessionLogs || []).length,
        casesRestored: (precedentCases || []).length,
        revision
      };
    });

    const summary = importTx();
    res.json({
      success: true,
      message: '全系统备份已彻底还原写入',
      summary
    });
  } catch (e: any) {
    if (e instanceof RevisionPreconditionError) {
      return res.status(409).json({
        error: 'VERSION_CONFLICT',
        message: '恢复前置版本已变化，已终止覆写',
        currentRevision: e.currentRevision
      });
    }
    console.error('Failed to import full system backup', e);
    res.status(500).json({ error: '导入系统备份失败', details: e.message });
  } finally {
    releaseMaintenanceLease(maintenanceLease);
  }
});

export default router;
