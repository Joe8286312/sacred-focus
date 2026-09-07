import { Router, Request, Response } from 'express';
import { db, getFullFocusTreeData } from '../db.js';

const router = Router();

// 全量导出系统整机镜像（跨设备全量迁移与灾难恢复）
router.get('/export', (_req: Request, res: Response) => {
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

// 全量导入整机镜像（跨设备整机恢复）
router.post('/import', (req: Request, res: Response) => {
  const backup = req.body;
  const tree = backup?.focusTree || backup?.liveTree;

  if (!backup || !tree) {
    return res.status(400).json({ error: '备份格式不合法：缺少国策树结构' });
  }

  try {
    const importTx = db.transaction(() => {
      // 1. 恢复国策树 (groups, nodes, edges)
      const groups = tree.groups || [];
      const nodes = tree.nodes || [];
      const edges = tree.edges || [];

      db.prepare('DELETE FROM focus_edges').run();
      db.prepare('DELETE FROM focus_nodes').run();
      db.prepare('DELETE FROM focus_groups').run();

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

      const insertNode = db.prepare(`
        INSERT INTO focus_nodes (
          id, code, name, groupId, triggerTime, triggerScene, hasExactTime, timeValueMinutes,
          level, maxLevel, isLit, isFrozen, lastLitDate, previousLevel, positionX, positionY,
          specInstruction, specFailCondition, specBenefitMechanism, specNotes, sortOrder
        ) VALUES (
          @id, @code, @name, @groupId, @triggerTime, @triggerScene, @hasExactTime, @timeValueMinutes,
          @level, @maxLevel, @isLit, @isFrozen, @lastLitDate, @previousLevel, @positionX, @positionY,
          @specInstruction, @specFailCondition, @specBenefitMechanism, @specNotes, @sortOrder
        )
      `);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        let hasExactTime = 0;
        let timeValueMinutes: number | null = null;
        if (n.triggerTime) {
          const match = n.triggerTime.match(/^(\d{1,2})[:：](\d{2})$/);
          if (match) {
            hasExactTime = 1;
            timeValueMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
          }
        }
        insertNode.run({
          id: n.id,
          code: n.code,
          name: n.name,
          groupId: n.groupId,
          triggerTime: n.triggerTime || '',
          triggerScene: n.triggerScene || n.triggerTime || '全天候',
          hasExactTime,
          timeValueMinutes,
          level: n.level ?? 0,
          maxLevel: n.maxLevel ?? 0,
          isLit: n.isLit ? 1 : 0,
          isFrozen: n.isFrozen ? 1 : 0,
          lastLitDate: n.lastLitDate ?? null,
          previousLevel: n.previousLevel ?? 0,
          positionX: n.position?.x ?? 0,
          positionY: n.position?.y ?? 0,
          specInstruction: n.specCard?.instruction || '',
          specFailCondition: n.specCard?.failCondition || '',
          specBenefitMechanism: n.specCard?.benefitMechanism || '',
          specNotes: n.specCard?.notes ?? null,
          sortOrder: i
        });
      }

      const insertEdge = db.prepare(`
        INSERT INTO focus_edges (id, sourceId, sourceType, targetId, targetType, sourceAnchor, targetAnchor, style)
        VALUES (@id, @sourceId, @sourceType, @targetId, @targetType, @sourceAnchor, @targetAnchor, @style)
      `);
      for (const e of edges) {
        insertEdge.run(e);
      }

      // 2. 恢复神圣座位配置
      if (backup.sacredSeatConfig) {
        const cfg = backup.sacredSeatConfig;
        db.prepare(`
          INSERT OR REPLACE INTO sacred_seat_config (id, sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak, updatedAt)
          VALUES (1, @sacredToken, @reservationSignal, @defaultFocusDuration, @regretWindowSeconds, @currentStreak, @maxStreak, @updatedAt)
        `).run(cfg);
      }

      // 3. 恢复判例法典
      if (Array.isArray(backup.precedentCases)) {
        db.prepare('DELETE FROM precedent_cases').run();
        const insertCase = db.prepare(`
          INSERT INTO precedent_cases (id, date, behavior, verdict, boundaryCondition, createdAt)
          VALUES (@id, @date, @behavior, @verdict, @boundaryCondition, @createdAt)
        `);
        for (const c of backup.precedentCases) {
          insertCase.run(c);
        }
      }

      // 4. 恢复演化状态与快照
      if (backup.evolution) {
        if (backup.evolution.state) {
          db.prepare('UPDATE evolution_state SET activePointerIndex = ? WHERE id = 1').run(backup.evolution.state.activePointerIndex ?? 0);
        }
        if (Array.isArray(backup.evolution.snapshots)) {
          db.prepare('DELETE FROM evolution_snapshots').run();
          const insertSnap = db.prepare(`
            INSERT INTO evolution_snapshots (slotIndex, id, version, timestamp, changelogNotes, isMajor, dataJson)
            VALUES (@slotIndex, @id, @version, @timestamp, @changelogNotes, @isMajor, @dataJson)
          `);
          for (const s of backup.evolution.snapshots) {
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
      if (Array.isArray(backup.sessionLogs)) {
        db.prepare('DELETE FROM focus_session_logs').run();
        const insertLog = db.prepare(`
          INSERT INTO focus_session_logs (id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status, focusContent, failureReason, note)
          VALUES (@id, @type, @startTime, @endTime, @targetDurationMinutes, @actualDurationSeconds, @status, @focusContent, @failureReason, @note)
        `);
        for (const l of backup.sessionLogs) {
          insertLog.run({
            ...l,
            focusContent: l.focusContent ?? null,
            failureReason: l.failureReason ?? null,
            note: l.note ?? null
          });
        }
      }

      return {
        nodesRestored: nodes.length,
        groupsRestored: groups.length,
        edgesRestored: edges.length,
        snapshotsRestored: (backup.evolution?.snapshots || []).length,
        logsRestored: (backup.sessionLogs || []).length,
        casesRestored: (backup.precedentCases || []).length
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
