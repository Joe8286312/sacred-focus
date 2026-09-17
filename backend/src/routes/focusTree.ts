import { Router, Request, Response } from 'express';
import {
  db,
  settleFocusTreeDailyState,
  incrementSystemRevision,
  upsertFocusNode
} from '../db.js';
import type { FocusNode, FocusEdge, FocusGroup, FocusLabel, FocusNodeRow } from '../types.js';
import { createFocusTreeRepository } from '../repositories/focusTreeRepository.js';
import { createSystemMetaRepository } from '../repositories/systemMetaRepository.js';
import { createFocusTreeService } from '../services/focusTreeService.js';
import { RevisionPreconditionError } from '../repositories/maintenanceRepository.js';

const router = Router();
const focusTreeService = createFocusTreeService({
  focusTreeRepository: createFocusTreeRepository(db),
  systemMetaRepository: createSystemMetaRepository(db),
  settleDailyState: settleFocusTreeDailyState
});

// 获取当前完整国策树（节点、连线、分组），并在每日首次上线时执行自控跨天结算审计
router.get('/', (_req: Request, res: Response) => {
  res.json(focusTreeService.getFocusTree());
});

// 重置每日跨天审计结算标记（便于随时进行联调与测试）
router.post('/reset-settlement-audit', (_req: Request, res: Response) => {
  focusTreeService.resetSettlementAudit();
  res.json({ ok: true, message: 'Settlement audit reset successfully' });
});

// 全量保存国策树（画布排版/结构更新时调用，支持 expectedRevision 乐观版本锁）
router.put('/', (req: Request, res: Response) => {
  const { nodes, edges, groups, labels, expectedRevision } = req.body as {
    nodes?: FocusNode[];
    edges?: FocusEdge[];
    groups?: FocusGroup[];
    labels?: FocusLabel[];
    expectedRevision?: number;
  };

  if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return res.status(400).json({
      error: 'EXPECTED_REVISION_REQUIRED',
      message: '全量保存国策树必须携带有效的 expectedRevision'
    });
  }

  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(groups) || !Array.isArray(labels)) {
    return res.status(400).json({
      error: 'INCOMPLETE_TREE_SNAPSHOT',
      message: '全量保存必须同时携带 nodes、edges、groups、labels 四个数组'
    });
  }
  try {
    const synchronized = focusTreeService.synchronizeFocusTree({
      expectedRevision,
      tree: { nodes, edges, groups, labels }
    });
    res.json({ message: 'Focus tree synchronized successfully', ...synchronized });
  } catch (err: any) {
    if (err instanceof RevisionPreconditionError) {
      return res.status(409).json({
        error: 'VERSION_CONFLICT',
        message: '检测到其他设备已提交新版本，请先同步最新状态后再保存',
        currentRevision: err.currentRevision
      });
    }
    console.error('Focus tree sync error:', err);
    res.status(500).json({
      error: 'SYNC_TRANSACTION_FAILED',
      message: '国策树同步事务执行失败，数据库约束或数据格式异常',
      details: err?.message || String(err)
    });
  }
});

// 点亮/反悔取消点亮节点（基于连续天数与凌晨 4 点业务日状态机）
router.patch('/nodes/:id/toggle-lit', (req: Request, res: Response) => {
  const { id } = req.params;
  const toggled = focusTreeService.toggleNodeLit(id as string);
  if (!toggled) {
    return res.status(404).json({ error: 'Node not found' });
  }
  res.json(toggled);
});

// 保存列表基准排序
router.put('/nodes/reorder', (req: Request, res: Response) => {
  const { nodeIds } = req.body as { nodeIds: string[] };
  if (!Array.isArray(nodeIds)) {
    return res.status(400).json({ error: 'nodeIds must be an array of string' });
  }

  focusTreeService.reorderNodes(nodeIds);
  res.json({ message: 'Sort order updated successfully' });
});

// 单个节点增删改
router.post('/nodes', (req: Request, res: Response) => {
  const n = req.body as FocusNode;
  if (!n.id || !n.code || !n.name) {
    return res.status(400).json({ error: 'Missing required node fields' });
  }

  const savedNode = focusTreeService.createNode(n);
  res.status(201).json(savedNode);
});

router.put('/nodes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const n = req.body as Partial<FocusNode>;

  const current = db.prepare('SELECT * FROM focus_nodes WHERE id = ?').get(id) as FocusNodeRow | undefined;
  if (!current) {
    return res.status(404).json({ error: 'Node not found' });
  }

  let finalTime = current.triggerTime;
  let hasExactTime = current.hasExactTime;
  let timeValueMinutes = current.timeValueMinutes;

  if (n.triggerTime !== undefined) {
    if (n.triggerTime) {
      const match = n.triggerTime.match(/^(\d{1,2})[:：](\d{2})$/);
      if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        finalTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        hasExactTime = 1;
        timeValueMinutes = h * 60 + m;
      } else {
        finalTime = null;
        hasExactTime = 0;
        timeValueMinutes = null;
      }
    } else {
      finalTime = null;
      hasExactTime = 0;
      timeValueMinutes = null;
    }
  }

  const finalScene = n.triggerScene !== undefined
    ? (n.triggerScene.trim() || finalTime || '全天候')
    : (current.triggerScene || current.triggerTime || '全天候');

  db.prepare(`
    UPDATE focus_nodes SET
      code = @code,
      name = @name,
      groupId = @groupId,
      triggerTime = @triggerTime,
      triggerScene = @triggerScene,
      hasExactTime = @hasExactTime,
      timeValueMinutes = @timeValueMinutes,
      level = @level,
      maxLevel = @maxLevel,
      isLit = @isLit,
      isFrozen = @isFrozen,
      lastLitDate = @lastLitDate,
      previousLevel = @previousLevel,
      positionX = @positionX,
      positionY = @positionY,
      specInstruction = @specInstruction,
      specFailCondition = @specFailCondition,
      specBenefitMechanism = @specBenefitMechanism,
      specNotes = @specNotes
    WHERE id = @id
  `).run({
    id,
    code: n.code ?? current.code,
    name: n.name ?? current.name,
    groupId: n.groupId !== undefined ? n.groupId : current.groupId,
    triggerTime: finalTime || '',
    triggerScene: finalScene,
    hasExactTime,
    timeValueMinutes,
    level: n.level !== undefined ? n.level : current.level,
    maxLevel: n.maxLevel !== undefined ? n.maxLevel : current.maxLevel,
    isLit: n.isLit !== undefined ? (n.isLit ? 1 : 0) : current.isLit,
    isFrozen: n.isFrozen !== undefined ? (n.isFrozen ? 1 : 0) : current.isFrozen,
    lastLitDate: n.lastLitDate !== undefined ? n.lastLitDate : current.lastLitDate,
    previousLevel: n.previousLevel !== undefined ? n.previousLevel : current.previousLevel,
    positionX: n.position?.x ?? current.positionX,
    positionY: n.position?.y ?? current.positionY,
    specInstruction: n.specCard?.instruction ?? current.specInstruction,
    specFailCondition: n.specCard?.failCondition ?? current.specFailCondition,
    specBenefitMechanism: n.specCard?.benefitMechanism ?? current.specBenefitMechanism,
    specNotes: n.specCard?.notes !== undefined ? n.specCard.notes : current.specNotes
  });

  incrementSystemRevision();
  res.json({ message: 'Node updated successfully', id });
});

router.delete('/nodes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = focusTreeService.deleteNode(id as string);
  if (!deleted) {
    return res.status(404).json({ error: 'Node not found' });
  }

  incrementSystemRevision();
  res.json({ message: 'Node deleted successfully', id });
});

// 分组增删改
router.post('/groups', (req: Request, res: Response) => {
  const g = req.body as FocusGroup;
  if (!g.id || !g.name || !g.themeColor) {
    return res.status(400).json({ error: 'Missing required group fields' });
  }

  focusTreeService.createGroup(g);
  res.status(201).json(g);
});

router.put('/groups/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body as Partial<FocusGroup>;
  const updated = focusTreeService.updateGroup(id as string, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Group not found' });
  }
  res.json(updated);
});

router.delete('/groups/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleteChildren = req.query.deleteChildren === 'true';

  const deleteGroupTx = db.transaction(() => {
    if (deleteChildren) {
      // 连带删除组内节点及其关联线
      const childNodes = db.prepare('SELECT id FROM focus_nodes WHERE groupId = ?').all(id) as { id: string }[];
      for (const n of childNodes) {
        db.prepare("DELETE FROM focus_edges WHERE (sourceId = ? AND sourceType = 'NODE') OR (targetId = ? AND targetType = 'NODE')").run(n.id, n.id);
      }
      db.prepare('DELETE FROM focus_nodes WHERE groupId = ?').run(id);
    } else {
      // 仅解绑
      db.prepare('UPDATE focus_nodes SET groupId = NULL WHERE groupId = ?').run(id);
    }

    // 清除外框自身的关联连线
    db.prepare("DELETE FROM focus_edges WHERE (sourceId = ? AND sourceType = 'GROUP') OR (targetId = ? AND targetType = 'GROUP')").run(id, id);
    return db.prepare('DELETE FROM focus_groups WHERE id = ?').run(id);
  });

  deleteGroupTx();
  incrementSystemRevision();
  res.json({ message: 'Group deleted successfully', id });
});

export default router;
