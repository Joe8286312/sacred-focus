import { Router, Request, Response } from 'express';
import path from 'path';
import { config } from '../config.js';
import { db, getFullFocusTreeData, incrementSystemRevision, upsertFocusNode } from '../db.js';
import { exportLimiter, importLimiter } from '../middleware/rateLimiter.js';
import { validateFullBackupPayload } from '../utils/validators.js';

const router = Router();

// 全量导出系统整机镜像（跨设备全量迁移与灾难恢复，15次/10分钟限流保护）
router.get('/export', exportLimiter, (_req: Request, res: Response) => {
  try {
    const liveTree = getFullFocusTreeData();
    const sacredSeatConfig = db.prepare('SELECT * FROM sacred_seat_config WHERE id = 1').get();
    const precedentCases = db.prepare('SELECT * FROM precedent_cases ORDER BY date DESC, createdAt DESC').all();
    const evolutionState = db.prepare('SELECT * FROM evolution_state WHERE id = 1').get();
    const evolutionSnapshots = db.prepare('SELECT * FROM evolution_snapshots ORDER BY slotIndex ASC').all();
    const sessionLogs = db.prepare('SELECT * FROM focus_session_logs ORDER BY startTime DESC').all();

    const fullBackup = {
      version: 1,
      dataType: 'SACRED_FOCUS_FULL_SYSTEM',
      exportedAt: new Date().toISOString(),
      summary: {
        groupCount: liveTree.groups.length,
        nodeCount: liveTree.nodes.length,
        edgeCount: liveTree.edges.length,
        labelCount: liveTree.labels ? liveTree.labels.length : 0,
        snapshotCount: evolutionSnapshots.length,
        logCount: sessionLogs.length,
        caseCount: precedentCases.length
      },
      focusTree: liveTree,
      liveTree: liveTree, // 保持向下兼容性
      sacredSeatConfig,
      precedentCases,
      evolution: {
        state: evolutionState,
        snapshots: evolutionSnapshots
      },
      sessionLogs
    };

    res.json(fullBackup);
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

  const { tree, sacredSeatConfig, precedentCases, evolution, sessionLogs } = validation.data;

  // 导入前自动热备当前 SQLite 数据库快照
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(config.dataDir, `app_pre_import_${timestamp}.db`);
    await db.backup(backupFile);
    console.log(`[Sacred Focus System] 预导入安全热备已生成: ${backupFile}`);
  } catch (backupErr) {
    console.warn('[Sacred Focus System] 预导入热备创建失败 (继续执行导入):', backupErr);
  }

  try {
    const importTx = db.transaction(() => {
      // 1. 恢复国策树 (groups, nodes, edges, labels)
      const groups = tree.groups || [];
      const nodes = tree.nodes || [];
      const edges = tree.edges || [];
      const labels = tree.labels || [];

      db.prepare('DELETE FROM focus_edges').run();
      db.prepare('DELETE FROM focus_nodes').run();
      db.prepare('DELETE FROM focus_groups').run();
      db.prepare('DELETE FROM focus_labels').run();

      const insertGroup = db.prepare(`
        INSERT INTO focus_groups (id, name, themeColor, positionX, positionY, width, height)
        VALUES (@id, @name, @themeColor, @positionX, @positionY, @width, @height)
      `);
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

      const insertEdge = db.prepare(`
        INSERT INTO focus_edges (id, sourceId, sourceType, targetId, targetType, sourceAnchor, targetAnchor, style)
        VALUES (@id, @sourceId, @sourceType, @targetId, @targetType, @sourceAnchor, @targetAnchor, @style)
      `);
      for (const e of edges) {
        insertEdge.run(e);
      }

      const insertLabel = db.prepare(`
        INSERT INTO focus_labels (id, text, positionX, positionY)
        VALUES (@id, @text, @positionX, @positionY)
      `);
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
        db.prepare(`
          INSERT OR REPLACE INTO sacred_seat_config (id, sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak, updatedAt)
          VALUES (1, @sacredToken, @reservationSignal, @defaultFocusDuration, @regretWindowSeconds, @currentStreak, @maxStreak, @updatedAt)
        `).run(sacredSeatConfig);
      }

      // 3. 恢复判例法典
      if (precedentCases) {
        db.prepare('DELETE FROM precedent_cases').run();
        const insertCase = db.prepare(`
          INSERT INTO precedent_cases (id, date, behavior, verdict, boundaryCondition, createdAt)
          VALUES (@id, @date, @behavior, @verdict, @boundaryCondition, @createdAt)
        `);
        for (const c of precedentCases) {
          insertCase.run(c);
        }
      }

      // 4. 恢复演化状态与快照
      if (evolution) {
        if (evolution.state) {
          db.prepare('UPDATE evolution_state SET activePointerIndex = ? WHERE id = 1').run(evolution.state.activePointerIndex ?? 0);
        }
        if (evolution.snapshots) {
          db.prepare('DELETE FROM evolution_snapshots').run();
          const insertSnap = db.prepare(`
            INSERT INTO evolution_snapshots (slotIndex, id, version, timestamp, changelogNotes, isMajor, dataJson)
            VALUES (@slotIndex, @id, @version, @timestamp, @changelogNotes, @isMajor, @dataJson)
          `);
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
        const insertLog = db.prepare(`
          INSERT INTO focus_session_logs (id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status, focusContent, failureReason, note)
          VALUES (@id, @type, @startTime, @endTime, @targetDurationMinutes, @actualDurationSeconds, @status, @focusContent, @failureReason, @note)
        `);
        for (const l of sessionLogs) {
          insertLog.run({
            ...l,
            focusContent: l.focusContent ?? null,
            failureReason: l.failureReason ?? null,
            note: l.note ?? null
          });
        }
      }

      // 6. 原子推进全局系统版本号
      incrementSystemRevision();

      return {
        nodesRestored: nodes.length,
        groupsRestored: groups.length,
        edgesRestored: edges.length,
        labelsRestored: labels.length,
        snapshotsRestored: (evolution?.snapshots || []).length,
        logsRestored: (sessionLogs || []).length,
        casesRestored: (precedentCases || []).length
      };
    });

    const summary = importTx();
    res.json({
      success: true,
      message: '全系统备份已彻底还原写入',
      summary
    });
  } catch (e: any) {
    console.error('Failed to import full system backup', e);
    res.status(500).json({ error: '导入系统备份失败', details: e.message });
  }
});

export default router;
