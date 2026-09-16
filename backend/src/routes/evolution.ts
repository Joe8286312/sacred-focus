import { Router, Request, Response } from 'express';
import { assertForeignKeyIntegrity, db, getFullFocusTreeData, getSystemRevision, incrementSystemRevision, RevisionPreconditionError, upsertFocusNode } from '../db.js';
import type { EvolutionSnapshot, EvolutionState, FocusTreeData, EvolutionSnapshotRow, EvolutionStateRow } from '../types.js';
import { validateFullBackupPayload } from '../utils/validators.js';
import { createEvolutionRepository } from '../repositories/evolutionRepository.js';

const router = Router();
const repository = createEvolutionRepository(db);

function requireExpectedRevision(req: Request, res: Response): number | null {
  const expectedRevision = req.body?.expectedRevision;
  if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
    res.status(400).json({
      error: 'EXPECTED_REVISION_REQUIRED',
      message: '演化写操作必须携带有效的 expectedRevision'
    });
    return null;
  }
  return expectedRevision;
}

function assertExpectedRevision(expectedRevision: number) {
  const currentRevision = getSystemRevision();
  if (expectedRevision !== currentRevision) {
    throw new RevisionPreconditionError(currentRevision);
  }
}

function sendVersionConflict(res: Response, currentRevision: number) {
  return res.status(409).json({
    error: 'VERSION_CONFLICT',
    message: '系统已被其他终端修改，请同步最新状态后再执行演化操作',
    currentRevision
  });
}

// 获取演化状态（活跃指针与全部 5 槽位快照）
router.get('/', (_req: Request, res: Response) => {
  res.json({ ...repository.getState(), revision: getSystemRevision() });
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
  const expectedRevision = requireExpectedRevision(req, res);
  if (expectedRevision === null) return;

  try {
    const result = repository.createSnapshot({ expectedRevision, changelogNotes, isMajor });
    res.status(201).json({ message: 'Snapshot created', ...result });
  } catch (e: any) {
    if (e instanceof RevisionPreconditionError) return sendVersionConflict(res, e.currentRevision);
    throw e;
  }
});
// 版本指针安全回滚 (Rollback)
router.post('/rollback', (req: Request, res: Response) => {
  const { targetSlotIndex } = req.body as { targetSlotIndex: number };

  if (typeof targetSlotIndex !== 'number' || targetSlotIndex < 0 || targetSlotIndex > 4) {
    return res.status(400).json({ error: 'targetSlotIndex must be between 0 and 4' });
  }
  const expectedRevision = requireExpectedRevision(req, res);
  if (expectedRevision === null) return;

  const snapshotRow = db.prepare('SELECT * FROM evolution_snapshots WHERE slotIndex = ?').get(targetSlotIndex) as EvolutionSnapshotRow | undefined;
  if (!snapshotRow) {
    return res.status(404).json({ error: `Snapshot not found at slot ${targetSlotIndex}` });
  }

  const rollbackTx = db.transaction(() => {
    assertExpectedRevision(expectedRevision);
    // 1. 仅移动活跃指针
    db.prepare('UPDATE evolution_state SET activePointerIndex = ? WHERE id = 1').run(targetSlotIndex);

    // 2. 将快照中的国策树全量还原回当前活跃树中
    const snapshotData = JSON.parse(snapshotRow.dataJson) as FocusTreeData;

    // 外键始终开启：先清理依赖表，再清理被引用实体，所有操作同一事务回滚。
    db.prepare('DELETE FROM focus_edges').run();
    db.prepare('DELETE FROM focus_nodes').run();
    db.prepare('DELETE FROM focus_groups').run();
    db.prepare('DELETE FROM focus_labels').run();

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

    // 恢复节点 (使用共享 upsertFocusNode 消除重复 SQL)
    for (let i = 0; i < snapshotData.nodes.length; i++) {
      upsertFocusNode(snapshotData.nodes[i], i);
    }

    // 恢复连线
    const insertEdge = db.prepare(`
      INSERT INTO focus_edges (id, sourceId, sourceType, targetId, targetType, sourceAnchor, targetAnchor, style)
      VALUES (@id, @sourceId, @sourceType, @targetId, @targetType, @sourceAnchor, @targetAnchor, @style)
    `);
    for (const e of snapshotData.edges) {
      insertEdge.run(e);
    }

    // 恢复说明标签
    if (snapshotData.labels) {
      const insertLabel = db.prepare(`
        INSERT INTO focus_labels (id, text, positionX, positionY)
        VALUES (@id, @text, @positionX, @positionY)
      `);
      for (const l of snapshotData.labels) {
        insertLabel.run({
          id: l.id,
          text: l.text,
          positionX: l.position?.x ?? 0,
          positionY: l.position?.y ?? 0
        });
      }
    }

    assertForeignKeyIntegrity();
    const revision = incrementSystemRevision();

    return { version: snapshotRow.version, revision };
  });

  try {
    const restored = rollbackTx();
    res.json({
      message: `Successfully rolled back to slot ${targetSlotIndex} (${restored.version})`,
      activePointerIndex: targetSlotIndex,
      restoredSlotIndex: targetSlotIndex,
      restoredVersion: restored.version,
      version: restored.version,
      revision: restored.revision,
      liveTree: getFullFocusTreeData()
    });
  } catch (e: any) {
    if (e instanceof RevisionPreconditionError) {
      return sendVersionConflict(res, e.currentRevision);
    }
    throw e;
  }
});

// 仅导出国策架构数据（节点、分组、连线、演化快照）
router.get('/export', (_req: Request, res: Response) => {
  try {
    const liveTree = getFullFocusTreeData();
    const evolutionState = db.prepare('SELECT * FROM evolution_state WHERE id = 1').get() as EvolutionStateRow | undefined;
    const evolutionSnapshots = db.prepare('SELECT * FROM evolution_snapshots ORDER BY slotIndex ASC').all() as EvolutionSnapshotRow[];

    const backupData = {
      schemaVersion: '1.0',
      dataType: 'FOCUS_TREE_ARCHITECTURE',
      exportedAt: new Date().toISOString(),
      focusTree: liveTree,
      liveTree: liveTree,
      evolution: {
        state: evolutionState,
        snapshots: evolutionSnapshots
      }
    };

    res.json(backupData);
  } catch (e: any) {
    console.error('Failed to export focus tree backup', e);
    res.status(500).json({ error: 'Failed to export focus tree backup', details: e.message });
  }
});

// 仅导入国策架构数据（绝不影响专注流水与判例法典）
router.post('/import', (req: Request, res: Response) => {
  const validation = validateFullBackupPayload(req.body);
  if (!validation.success || !validation.data) {
    return res.status(400).json({
      error: 'INVALID_BACKUP_SCHEMA',
      message: validation.error || '国策架构备份文件结构校验未通过',
      details: validation.details
    });
  }
  const expectedRevision = requireExpectedRevision(req, res);
  if (expectedRevision === null) return;

  const { tree, evolution } = validation.data;

  try {
    const importTx = db.transaction(() => {
      assertExpectedRevision(expectedRevision);
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

      // 2. 恢复演化状态与快照
      if (evolution) {
        if (evolution.state) {
          db.prepare('UPDATE evolution_state SET activePointerIndex = ? WHERE id = 1').run(evolution.state.activePointerIndex ?? 0);
        }
        if (Array.isArray(evolution.snapshots)) {
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
      assertForeignKeyIntegrity();
      return incrementSystemRevision();
    });

    const revision = importTx();
    res.json({ message: 'Focus tree architecture successfully imported and restored', revision });
  } catch (e: any) {
    if (e instanceof RevisionPreconditionError) {
      return sendVersionConflict(res, e.currentRevision);
    }
    console.error('Failed to import focus tree backup', e);
    res.status(500).json({ error: 'Failed to import focus tree backup', details: e.message });
  }
});

export default router;
