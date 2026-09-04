import { Router, Request, Response } from 'express';
import { db, getFullFocusTreeData } from '../db.js';
import type { EvolutionSnapshot, EvolutionState, FocusTreeData } from '../types.js';

const router = Router();

// 获取演化状态（活跃指针与全部 5 槽位快照）
router.get('/', (_req: Request, res: Response) => {
  const stateRow = db.prepare('SELECT activePointerIndex FROM evolution_state WHERE id = 1').get() as { activePointerIndex: number } | undefined;
  const activePointerIndex = stateRow?.activePointerIndex ?? 0;

  const rows = db.prepare('SELECT * FROM evolution_snapshots ORDER BY slotIndex ASC').all() as any[];
  const snapshots: EvolutionSnapshot[] = rows.map(r => {
    const parsed = JSON.parse(r.dataJson);
    return {
      id: r.id,
      slotIndex: r.slotIndex,
      version: r.version,
      timestamp: r.timestamp,
      changelogNotes: r.changelogNotes,
      isMajor: Boolean(r.isMajor),
      nodes: parsed.nodes,
      edges: parsed.edges,
      groups: parsed.groups
    };
  });

  const state: EvolutionState = {
    activePointerIndex,
    snapshots
  };

  res.json(state);
});

// 归档保存新版本快照（5 槽位防震荡环形缓存）
router.post('/snapshot', (req: Request, res: Response) => {
  const { changelogNotes, isMajor } = req.body as {
    changelogNotes: string;
    isMajor: boolean;
  };

  if (!changelogNotes) {
    return res.status(400).json({ error: 'changelogNotes is required' });
  }

  const liveTree = getFullFocusTreeData();

  const snapshotTx = db.transaction(() => {
    // 1. 获取当前指针与现有快照
    const stateRow = db.prepare('SELECT activePointerIndex FROM evolution_state WHERE id = 1').get() as { activePointerIndex: number };
    const currentPointer = stateRow ? stateRow.activePointerIndex : 0;
    const existingSnapshots = db.prepare('SELECT * FROM evolution_snapshots ORDER BY slotIndex ASC').all() as any[];

    // 2. 计算新版本号
    const currentSnapshotRow = existingSnapshots.find(s => s.slotIndex === currentPointer);
    let currentVersion = currentSnapshotRow ? currentSnapshotRow.version : 'v1.0';
    let nextVersion = 'v1.1';

    const match = currentVersion.match(/^v(\d+)\.(\d+)$/);
    if (match) {
      let major = parseInt(match[1], 10);
      let minor = parseInt(match[2], 10);
      if (isMajor) {
        major += 1;
        minor = 0;
      } else {
        minor += 1;
      }
      nextVersion = `v${major}.${minor}`;
    }

    // 3. 计算目标槽位（最多保留 5 个快照）
    let targetSlotIndex = 0;
    if (existingSnapshots.length < 5) {
      targetSlotIndex = existingSnapshots.length;
    } else {
      // 5 槽位满，淘汰当前指针之后的旧未来，或者向后环移
      targetSlotIndex = (currentPointer + 1) % 5;
    }

    const newSnapshot: EvolutionSnapshot = {
      version: nextVersion,
      timestamp: new Date().toISOString(),
      changelogNotes,
      isMajor: Boolean(isMajor),
      nodes: liveTree.nodes,
      edges: liveTree.edges,
      groups: liveTree.groups
    };

    // 4. 写入槽位
    db.prepare(`
      INSERT OR REPLACE INTO evolution_snapshots (slotIndex, id, version, timestamp, changelogNotes, isMajor, dataJson)
      VALUES (@slotIndex, @id, @version, @timestamp, @changelogNotes, @isMajor, @dataJson)
    `).run({
      slotIndex: targetSlotIndex,
      id: `snap-${Date.now()}`,
      version: newSnapshot.version,
      timestamp: newSnapshot.timestamp,
      changelogNotes: newSnapshot.changelogNotes,
      isMajor: newSnapshot.isMajor ? 1 : 0,
      dataJson: JSON.stringify(newSnapshot)
    });

    // 5. 更新活跃指针
    db.prepare('UPDATE evolution_state SET activePointerIndex = ? WHERE id = 1').run(targetSlotIndex);

    return { 
      version: nextVersion,
      nextVersion, 
      slotIndex: targetSlotIndex,
      targetSlotIndex,
      activePointerIndex: targetSlotIndex
    };
  });

  const result = snapshotTx();
  res.status(201).json({ message: 'Snapshot created', ...result });
});

// 版本指针安全回滚 (Rollback)
router.post('/rollback', (req: Request, res: Response) => {
  const { targetSlotIndex } = req.body as { targetSlotIndex: number };

  if (typeof targetSlotIndex !== 'number' || targetSlotIndex < 0 || targetSlotIndex > 4) {
    return res.status(400).json({ error: 'targetSlotIndex must be between 0 and 4' });
  }

  const snapshotRow = db.prepare('SELECT * FROM evolution_snapshots WHERE slotIndex = ?').get(targetSlotIndex) as any;
  if (!snapshotRow) {
    return res.status(404).json({ error: `Snapshot not found at slot ${targetSlotIndex}` });
  }

  const rollbackTx = db.transaction(() => {
    // 1. 仅移动活跃指针
    db.prepare('UPDATE evolution_state SET activePointerIndex = ? WHERE id = 1').run(targetSlotIndex);

    // 2. 将快照中的国策树全量还原回当前活跃树中
    const snapshotData = JSON.parse(snapshotRow.dataJson) as FocusTreeData;

    // 清理现有数据
    db.prepare('DELETE FROM focus_edges').run();
    db.prepare('DELETE FROM focus_nodes').run();
    db.prepare('DELETE FROM focus_groups').run();

    // 恢复分组
    const insertGroup = db.prepare(`
      INSERT INTO focus_groups (id, name, themeColor, positionX, positionY, width, height)
      VALUES (@id, @name, @themeColor, @positionX, @positionY, @width, @height)
    `);
    for (const g of snapshotData.groups) {
      insertGroup.run({
        id: g.id,
        name: g.name,
        themeColor: g.themeColor,
        positionX: g.position.x,
        positionY: g.position.y,
        width: g.size.width,
        height: g.size.height
      });
    }

    // 恢复节点
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
    for (let i = 0; i < snapshotData.nodes.length; i++) {
      const n = snapshotData.nodes[i];
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
        positionX: n.position.x,
        positionY: n.position.y,
        specInstruction: n.specCard?.instruction || '',
        specFailCondition: n.specCard?.failCondition || '',
        specBenefitMechanism: n.specCard?.benefitMechanism || '',
        specNotes: n.specCard?.notes ?? null,
        sortOrder: i
      });
    }

    // 恢复连线
    const insertEdge = db.prepare(`
      INSERT INTO focus_edges (id, sourceId, sourceType, targetId, targetType, sourceAnchor, targetAnchor, style)
      VALUES (@id, @sourceId, @sourceType, @targetId, @targetType, @sourceAnchor, @targetAnchor, @style)
    `);
    for (const e of snapshotData.edges) {
      insertEdge.run(e);
    }

    return snapshotRow.version;
  });

  const restoredVersion = rollbackTx();
  res.json({
    message: `Successfully rolled back to slot ${targetSlotIndex} (${restoredVersion})`,
    activePointerIndex: targetSlotIndex,
    restoredSlotIndex: targetSlotIndex,
    restoredVersion,
    version: restoredVersion,
    liveTree: getFullFocusTreeData()
  });
});

// 全量导出系统配置（稳态备份）
router.get('/export', (_req: Request, res: Response) => {
  try {
    const liveTree = getFullFocusTreeData();
    const sacredSeatConfig = db.prepare('SELECT * FROM sacred_seat_config WHERE id = 1').get();
    const precedentCases = db.prepare('SELECT * FROM precedent_cases ORDER BY date DESC, createdAt DESC').all();
    const evolutionState = db.prepare('SELECT * FROM evolution_state WHERE id = 1').get();
    const evolutionSnapshots = db.prepare('SELECT * FROM evolution_snapshots ORDER BY slotIndex ASC').all();
    const sessionLogs = db.prepare('SELECT * FROM focus_session_logs ORDER BY startTime DESC').all();

    const backupData = {
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      focusTree: liveTree,
      liveTree: liveTree,
      sacredSeatConfig,
      precedentCases,
      evolution: {
        state: evolutionState,
        snapshots: evolutionSnapshots
      },
      sessionLogs
    };

    res.json(backupData);
  } catch (e: any) {
    console.error('Failed to export backup', e);
    res.status(500).json({ error: 'Failed to export backup', details: e.message });
  }
});

// 全量导入灾备配置
router.post('/import', (req: Request, res: Response) => {
  const backup = req.body;
  const tree = backup?.focusTree || backup?.liveTree;
  if (!backup || !tree) {
    return res.status(400).json({ error: 'Invalid backup file format: missing focusTree or liveTree' });
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
          positionX: g.position.x,
          positionY: g.position.y,
          width: g.size.width,
          height: g.size.height
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
          positionX: n.position.x,
          positionY: n.position.y,
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
            insertSnap.run(s);
          }
        }
      }

      // 5. 恢复流水日志（若存在）
      if (Array.isArray(backup.sessionLogs)) {
        db.prepare('DELETE FROM focus_session_logs').run();
        const insertLog = db.prepare(`
          INSERT INTO focus_session_logs (id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status, note)
          VALUES (@id, @type, @startTime, @endTime, @targetDurationMinutes, @actualDurationSeconds, @status, @note)
        `);
        for (const l of backup.sessionLogs) {
          insertLog.run(l);
        }
      }
    });

    importTx();
    res.json({ message: 'Backup successfully imported and restored' });
  } catch (e: any) {
    console.error('Failed to import backup', e);
    res.status(500).json({ error: 'Failed to import backup', details: e.message });
  }
});

export default router;
