import { Router, Request, Response } from 'express';
import { 
  db, 
  getFullFocusTreeData, 
  getBusinessDay, 
  getPreviousBusinessDay, 
  settleFocusTreeDailyState 
} from '../db.js';
import type { FocusNode, FocusEdge, FocusGroup } from '../types.js';

const router = Router();

// 获取当前完整国策树（节点、连线、分组），并在每日首次上线时执行自控跨天结算审计
router.get('/', (_req: Request, res: Response) => {
  const settlement = settleFocusTreeDailyState();
  const data = getFullFocusTreeData();
  if (settlement && settlement.resetNodes.length > 0) {
    data.resetSummary = settlement;
  }
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

// 点亮/反悔取消点亮节点（基于连续天数与凌晨 4 点业务日状态机）
router.patch('/nodes/:id/toggle-lit', (req: Request, res: Response) => {
  const { id } = req.params;
  const current = db.prepare('SELECT id, level, maxLevel, isLit, lastLitDate, previousLevel FROM focus_nodes WHERE id = ?').get(id) as {
    id: string;
    level: number;
    maxLevel: number;
    isLit: number;
    lastLitDate?: string | null;
    previousLevel?: number;
  } | undefined;

  if (!current) {
    return res.status(404).json({ error: 'Node not found' });
  }

  const today = getBusinessDay();
  const yesterday = getPreviousBusinessDay(today);

  let nextLit: boolean;
  let nextLevel: number;
  let nextMaxLevel: number;
  let nextLastLitDate: string | null;
  let nextPreviousLevel = current.previousLevel ?? 0;

  if (current.isLit === 0) {
    // 动作：执行今日点亮升级
    nextLit = true;
    nextPreviousLevel = current.level; // 备份当前等级供反悔回退

    if (current.lastLitDate === yesterday) {
      // 连续天数：昨日已点亮，今日连续打卡，等级 +1
      nextLevel = current.level + 1;
    } else if (current.lastLitDate === today) {
      // 今日此前点亮过又撤销，今日再次点亮
      nextLevel = Math.max((current.previousLevel ?? 0) + 1, 1);
    } else {
      // 初始首次点亮或断签后首次点亮：升级至 1 级
      nextLevel = 1;
    }

    nextMaxLevel = Math.max(current.maxLevel, nextLevel);
    nextLastLitDate = today;
  } else {
    // 动作：当天反悔取消点亮
    nextLit = false;
    // 等级回退到今日点亮前的备份等级
    nextLevel = Math.max(current.previousLevel ?? 0, 0);

    // 最高等级：若最高等级恰好由今日点亮所抬升，则同步减回；否则保留历史最高
    if (current.maxLevel === current.level) {
      nextMaxLevel = nextLevel;
    } else {
      nextMaxLevel = current.maxLevel;
    }

    // 用户明确要求：“反悔时业务天数也要回退一天”
    // 若回退后等级 > 0，则业务日期回退至昨日；若回退后归零，则回退为 null
    if (nextLevel > 0) {
      nextLastLitDate = yesterday;
    } else {
      nextLastLitDate = null;
    }
  }

  db.prepare(`
    UPDATE focus_nodes SET
      isLit = @isLit,
      level = @level,
      maxLevel = @maxLevel,
      lastLitDate = @lastLitDate,
      previousLevel = @previousLevel
    WHERE id = @id
  `).run({
    id,
    isLit: nextLit ? 1 : 0,
    level: nextLevel,
    maxLevel: nextMaxLevel,
    lastLitDate: nextLastLitDate,
    previousLevel: nextPreviousLevel
  });

  res.json({
    id,
    isLit: nextLit,
    level: nextLevel,
    maxLevel: nextMaxLevel,
    lastLitDate: nextLastLitDate
  });
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

  let finalTime: string | null = null;
  let hasExactTime = 0;
  let timeValueMinutes: number | null = null;
  if (n.triggerTime) {
    const match = n.triggerTime.match(/^(\d{1,2})[:：](\d{2})$/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      finalTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      hasExactTime = 1;
      timeValueMinutes = h * 60 + m;
    }
  }
  const finalScene = n.triggerScene?.trim() || finalTime || '全天候';

  db.prepare(`
    INSERT INTO focus_nodes (
      id, code, name, groupId, triggerTime, triggerScene, hasExactTime, timeValueMinutes,
      level, maxLevel, isLit, isFrozen, lastLitDate, previousLevel, positionX, positionY,
      specInstruction, specFailCondition, specBenefitMechanism, specNotes, sortOrder
    ) VALUES (
      @id, @code, @name, @groupId, @triggerTime, @triggerScene, @hasExactTime, @timeValueMinutes,
      @level, @maxLevel, @isLit, @isFrozen, @lastLitDate, @previousLevel, @positionX, @positionY,
      @specInstruction, @specFailCondition, @specBenefitMechanism, @specNotes, @sortOrder
    )
  `).run({
    id: n.id,
    code: n.code,
    name: n.name,
    groupId: n.groupId || null,
    triggerTime: finalTime || '',
    triggerScene: finalScene,
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
    sortOrder
  });

  res.status(201).json({
    ...n,
    triggerTime: finalTime,
    triggerScene: finalScene,
    hasExactTime: Boolean(hasExactTime),
    timeValueMinutes
  });
});

router.put('/nodes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const n = req.body as Partial<FocusNode>;

  const current = db.prepare('SELECT * FROM focus_nodes WHERE id = ?').get(id) as any;
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

  res.json({ message: 'Node updated successfully', id });
});

router.delete('/nodes/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const deleteTx = db.transaction(() => {
    // 连带清理关联的有向连线（使用 SQL 标准单引号，修复 SQLite 报错与假删除问题）
    db.prepare("DELETE FROM focus_edges WHERE (sourceId = ? AND sourceType = 'NODE') OR (targetId = ? AND targetType = 'NODE')").run(id, id);
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
  res.json({ message: 'Group deleted successfully', id });
});

export default router;
