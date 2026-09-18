import { Router, Request, Response } from 'express';
import { db, settleFocusTreeDailyState } from '../db.js';
import type { FocusNode, FocusEdge, FocusGroup, FocusLabel } from '../types.js';
import { createFocusTreeRepository } from '../repositories/focusTreeRepository.js';
import { createSystemMetaRepository } from '../repositories/systemMetaRepository.js';
import { createFocusTreeService } from '../services/focusTreeService.js';
import { RevisionPreconditionError } from '../repositories/maintenanceRepository.js';
import { getErrorDetails } from '../utils/errorDetails.js';

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
  } catch (err: unknown) {
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
      details: getErrorDetails(err)
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
  if (!focusTreeService.updateNode(id as string, n)) {
    return res.status(404).json({ error: 'Node not found' });
  }
  res.json({ message: 'Node updated successfully', id });
});

router.delete('/nodes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = focusTreeService.deleteNode(id as string);
  if (!deleted) {
    return res.status(404).json({ error: 'Node not found' });
  }

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
  focusTreeService.deleteGroup(id as string, deleteChildren);
  res.json({ message: 'Group deleted successfully', id });
});

export default router;
