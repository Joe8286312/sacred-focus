import { Router, Request, Response } from 'express';
import { db, getFullFocusTreeData, getSystemRevision, RevisionPreconditionError } from '../db.js';
import type { EvolutionSnapshotRow, EvolutionStateRow } from '../types.js';
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

  try {
    const restored = repository.rollback({ expectedRevision, targetSlotIndex });
    if (!restored) {
      return res.status(404).json({ error: `Snapshot not found at slot ${targetSlotIndex}` });
    }
    res.json({
      message: `Successfully rolled back to slot ${targetSlotIndex} (${restored.version})`,
      activePointerIndex: targetSlotIndex,
      restoredSlotIndex: targetSlotIndex,
      restoredVersion: restored.version,
      version: restored.version,
      revision: restored.revision,
      liveTree: restored.liveTree
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
    const revision = repository.importArchitecture({ expectedRevision, tree, evolution });
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
