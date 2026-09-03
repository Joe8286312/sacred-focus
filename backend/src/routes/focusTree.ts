import { Router, Request, Response } from 'express';
import { db, getFullFocusTreeData } from '../db.js';
import type { FocusNode, FocusEdge, FocusGroup } from '../types.js';

const router = Router();

// 获取当前完整国策树（节点、连线、分组）
router.get('/', (_req: Request, res: Response) => {
  const data = getFullFocusTreeData();
  res.json(data);
});

// 全量保存国策树（画布排版/结构更新时调用）
router.put('/', (req: Request, res: Response) => {
  const { nodes, edges, groups } = req.body as {
    nodes?: FocusNode[];
    edges?: FocusEdge[];
    groups?: FocusGroup[];
  };

  const syncTx = db.transaction(() => {
    // 1. 同步分组
    if (groups) {
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
    }

    // 2. 同步节点
    if (nodes) {
      db.prepare('DELETE FROM focus_nodes').run();
      const insertNode = db.prepare(`
        INSERT INTO focus_nodes (
          id, code, name, groupId, triggerTime, hasExactTime, timeValueMinutes,
          level, maxLevel, isLit, isFrozen, positionX, positionY,
          specInstruction, specFailCondition, specBenefitMechanism, specNotes, sortOrder
        ) VALUES (
          @id, @code, @name, @groupId, @triggerTime, @hasExactTime, @timeValueMinutes,
          @level, @maxLevel, @isLit, @isFrozen, @positionX, @positionY,
          @specInstruction, @specFailCondition, @specBenefitMechanism, @specNotes, @sortOrder
        )
      `);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        insertNode.run({
          id: n.id,
          code: n.code,
          name: n.name,
          groupId: n.groupId,
          triggerTime: n.triggerTime,
          hasExactTime: n.hasExactTime ? 1 : 0,
          timeValueMinutes: n.timeValueMinutes ?? null,
          level: n.level,
          maxLevel: n.maxLevel,
          isLit: n.isLit ? 1 : 0,
          isFrozen: n.isFrozen ? 1 : 0,
          positionX: n.position.x,
          positionY: n.position.y,
          specInstruction: n.specCard?.instruction || '',
          specFailCondition: n.specCard?.failCondition || '',
          specBenefitMechanism: n.specCard?.benefitMechanism || '',
          specNotes: n.specCard?.notes ?? null,
          sortOrder: i
        });
      }
    }

    // 3. 同步连线
    if (edges) {
      db.prepare('DELETE FROM focus_edges').run();
      const insertEdge = db.prepare(`
        INSERT INTO focus_edges (id, sourceId, sourceType, targetId, targetType, sourceAnchor, targetAnchor, style)
        VALUES (@id, @sourceId, @sourceType, @targetId, @targetType, @sourceAnchor, @targetAnchor, @style)
      `);
      for (const e of edges) {
        insertEdge.run(e);
      }
    }
  });

  syncTx();
  res.json({ message: 'Focus tree synchronized successfully', data: getFullFocusTreeData() });
});

// 快速双击点亮/熄灭节点
router.patch('/nodes/:id/toggle-lit', (req: Request, res: Response) => {
  const { id } = req.params;
  const current = db.prepare('SELECT isLit FROM focus_nodes WHERE id = ?').get(id) as { isLit: number } | undefined;

  if (!current) {
    return res.status(404).json({ error: 'Node not found' });
  }

  const nextLit = current.isLit === 1 ? 0 : 1;
  db.prepare('UPDATE focus_nodes SET isLit = ? WHERE id = ?').run(nextLit, id);

  res.json({ id, isLit: Boolean(nextLit) });
});

// 保存列表基准排序
router.put('/nodes/reorder', (req: Request, res: Response) => {
  const { nodeIds } = req.body as { nodeIds: string[] };
  if (!Array.isArray(nodeIds)) {
    return res.status(400).json({ error: 'nodeIds must be an array of string' });
  }

  const reorderTx = db.transaction(() => {
    const updateSort = db.prepare('UPDATE focus_nodes SET sortOrder = ? WHERE id = ?');
    nodeIds.forEach((id, idx) => {
      updateSort.run(idx, id);
    });
  });

  reorderTx();
  res.json({ message: 'Sort order updated successfully' });
});

// 单个节点增删改
router.post('/nodes', (req: Request, res: Response) => {
  const n = req.body as FocusNode;
  if (!n.id || !n.code || !n.name) {
    return res.status(400).json({ error: 'Missing required node fields' });
  }

  const maxOrderRow = db.prepare('SELECT MAX(sortOrder) as maxOrder FROM focus_nodes').get() as { maxOrder: number | null };
  const sortOrder = (maxOrderRow?.maxOrder ?? -1) + 1;

  db.prepare(`
    INSERT INTO focus_nodes (
      id, code, name, groupId, triggerTime, hasExactTime, timeValueMinutes,
      level, maxLevel, isLit, isFrozen, positionX, positionY,
      specInstruction, specFailCondition, specBenefitMechanism, specNotes, sortOrder
    ) VALUES (
      @id, @code, @name, @groupId, @triggerTime, @hasExactTime, @timeValueMinutes,
      @level, @maxLevel, @isLit, @isFrozen, @positionX, @positionY,
      @specInstruction, @specFailCondition, @specBenefitMechanism, @specNotes, @sortOrder
    )
  `).run({
    id: n.id,
    code: n.code,
    name: n.name,
    groupId: n.groupId || null,
    triggerTime: n.triggerTime || '全天候',
    hasExactTime: n.hasExactTime ? 1 : 0,
    timeValueMinutes: n.timeValueMinutes ?? null,
    level: n.level || 1,
    maxLevel: n.maxLevel || 3,
    isLit: n.isLit ? 1 : 0,
    isFrozen: n.isFrozen ? 1 : 0,
    positionX: n.position?.x ?? 0,
    positionY: n.position?.y ?? 0,
    specInstruction: n.specCard?.instruction || '',
    specFailCondition: n.specCard?.failCondition || '',
    specBenefitMechanism: n.specCard?.benefitMechanism || '',
    specNotes: n.specCard?.notes ?? null,
    sortOrder
  });

  res.status(201).json(n);
});

router.put('/nodes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const n = req.body as Partial<FocusNode>;

  const current = db.prepare('SELECT * FROM focus_nodes WHERE id = ?').get(id) as any;
  if (!current) {
    return res.status(404).json({ error: 'Node not found' });
  }

  db.prepare(`
    UPDATE focus_nodes SET
      code = @code,
      name = @name,
      groupId = @groupId,
      triggerTime = @triggerTime,
      hasExactTime = @hasExactTime,
      timeValueMinutes = @timeValueMinutes,
      level = @level,
      maxLevel = @maxLevel,
      isLit = @isLit,
      isFrozen = @isFrozen,
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
    triggerTime: n.triggerTime ?? current.triggerTime,
    hasExactTime: n.hasExactTime !== undefined ? (n.hasExactTime ? 1 : 0) : current.hasExactTime,
    timeValueMinutes: n.timeValueMinutes !== undefined ? n.timeValueMinutes : current.timeValueMinutes,
    level: n.level ?? current.level,
    maxLevel: n.maxLevel ?? current.maxLevel,
    isLit: n.isLit !== undefined ? (n.isLit ? 1 : 0) : current.isLit,
    isFrozen: n.isFrozen !== undefined ? (n.isFrozen ? 1 : 0) : current.isFrozen,
    positionX: n.position?.x ?? current.positionX,
    positionY: n.position?.y ?? current.positionY,
    specInstruction: n.specCard?.instruction ?? current.specInstruction,
    specFailCondition: n.specCard?.failCondition ?? current.specFailCondition,
    specBenefitMechanism: n.specCard?.benefitMechanism ?? current.specBenefitMechanism,
    specNotes: n.specCard?.notes !== undefined ? n.specCard.notes : current.specNotes
  });

  res.json({ message: 'Node updated successfully', id });
});

router.delete('/nodes/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const deleteTx = db.transaction(() => {
    // 连带清理关联的有向连线
    db.prepare('DELETE FROM focus_edges WHERE (sourceId = ? AND sourceType = "NODE") OR (targetId = ? AND targetType = "NODE")').run(id, id);
    const result = db.prepare('DELETE FROM focus_nodes WHERE id = ?').run(id);
    return result.changes > 0;
  });

  const deleted = deleteTx();
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

  db.prepare(`
    INSERT INTO focus_groups (id, name, themeColor, positionX, positionY, width, height)
    VALUES (@id, @name, @themeColor, @positionX, @positionY, @width, @height)
  `).run({
    id: g.id,
    name: g.name,
    themeColor: g.themeColor,
    positionX: g.position?.x ?? 0,
    positionY: g.position?.y ?? 0,
    width: g.size?.width ?? 320,
    height: g.size?.height ?? 200
  });

  res.status(201).json(g);
});

router.delete('/groups/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleteChildren = req.query.deleteChildren === 'true';

  const deleteGroupTx = db.transaction(() => {
    if (deleteChildren) {
      // 连带删除组内节点及其关联线
      const childNodes = db.prepare('SELECT id FROM focus_nodes WHERE groupId = ?').all(id) as { id: string }[];
      for (const n of childNodes) {
        db.prepare('DELETE FROM focus_edges WHERE (sourceId = ? AND sourceType = "NODE") OR (targetId = ? AND targetType = "NODE")').run(n.id, n.id);
      }
      db.prepare('DELETE FROM focus_nodes WHERE groupId = ?').run(id);
    } else {
      // 仅解绑
      db.prepare('UPDATE focus_nodes SET groupId = NULL WHERE groupId = ?').run(id);
    }

    // 清除外框自身的关联连线
    db.prepare('DELETE FROM focus_edges WHERE (sourceId = ? AND sourceType = "GROUP") OR (targetId = ? AND targetType = "GROUP")').run(id, id);
    return db.prepare('DELETE FROM focus_groups WHERE id = ?').run(id);
  });

  deleteGroupTx();
  res.json({ message: 'Group deleted successfully', id });
});

export default router;
