import type { Statement } from 'better-sqlite3';
import { db } from '../connection.js';
import type {
  FocusNode,
  FocusEdge,
  FocusGroup,
  FocusLabel,
  FocusTreeData,
  FocusGroupRow,
  FocusNodeRow,
  FocusEdgeRow,
  FocusLabelRow
} from '../../types.js';

// 预编译节点 Upsert 语句，全局复用避免重复编译
let _upsertFocusNodeStmt: Statement | null = null;
function getUpsertFocusNodeStmt(): Statement {
  if (!_upsertFocusNodeStmt) {
    _upsertFocusNodeStmt = db.prepare(`
      INSERT OR REPLACE INTO focus_nodes (
        id, code, name, groupId, triggerTime, triggerScene, hasExactTime, timeValueMinutes,
        level, maxLevel, isLit, isFrozen, lastLitDate, previousLevel, positionX, positionY,
        specInstruction, specFailCondition, specBenefitMechanism, specNotes, sortOrder
      ) VALUES (
        @id, @code, @name, @groupId, @triggerTime, @triggerScene, @hasExactTime, @timeValueMinutes,
        @level, @maxLevel, @isLit, @isFrozen, @lastLitDate, @previousLevel, @positionX, @positionY,
        @specInstruction, @specFailCondition, @specBenefitMechanism, @specNotes, @sortOrder
      )
    `);
  }
  return _upsertFocusNodeStmt;
}

/**
 * 统一的核心国策节点落库辅助函数 (D-3 治理消除重复 SQL)
 * 处理 triggerTime 解析、scene 回退、默认值补齐并执行 INSERT OR REPLACE
 */
export function upsertFocusNode(node: FocusNode, sortOrder?: number): FocusNode {
  let hasExactTime = false;
  let timeValueMinutes: number | null = null;
  let finalTime = node.triggerTime || '';
  if (node.triggerTime) {
    const match = node.triggerTime.match(/^(\d{1,2})[:：](\d{2})$/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      finalTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      hasExactTime = true;
      timeValueMinutes = h * 60 + m;
    }
  } else {
    hasExactTime = Boolean(node.hasExactTime);
    timeValueMinutes = node.timeValueMinutes ?? null;
  }
  const finalScene = node.triggerScene?.trim() || finalTime || '全天候';

  getUpsertFocusNodeStmt().run({
    id: node.id,
    code: node.code,
    name: node.name,
    groupId: node.groupId || null,
    triggerTime: finalTime,
    triggerScene: finalScene,
    hasExactTime: hasExactTime ? 1 : 0,
    timeValueMinutes,
    level: node.level ?? 0,
    maxLevel: node.maxLevel ?? 0,
    isLit: node.isLit ? 1 : 0,
    isFrozen: node.isFrozen ? 1 : 0,
    lastLitDate: node.lastLitDate ?? null,
    previousLevel: node.previousLevel ?? 0,
    positionX: node.position?.x ?? 0,
    positionY: node.position?.y ?? 0,
    specInstruction: node.specCard?.instruction || '',
    specFailCondition: node.specCard?.failCondition || '',
    specBenefitMechanism: node.specCard?.benefitMechanism || '',
    specNotes: node.specCard?.notes ?? null,
    sortOrder: sortOrder ?? 0
  });

  return {
    ...node,
    triggerTime: finalTime || null,
    triggerScene: finalScene,
    hasExactTime,
    timeValueMinutes
  };
}

// 辅助查询：获取当前全量国策树数据
export function getFullFocusTreeData(): FocusTreeData {
  const groupRows = db.prepare('SELECT * FROM focus_groups').all() as FocusGroupRow[];
  const groups: FocusGroup[] = groupRows.map(row => ({
    id: row.id,
    name: row.name,
    themeColor: row.themeColor,
    position: { x: row.positionX, y: row.positionY },
    size: { width: row.width, height: row.height }
  }));

  const nodeRows = db.prepare('SELECT * FROM focus_nodes ORDER BY sortOrder ASC').all() as FocusNodeRow[];
  const nodes: FocusNode[] = nodeRows.map(row => ({
    id: row.id,
    code: row.code,
    name: row.name,
    groupId: row.groupId,
    triggerTime: (row.triggerTime && row.triggerTime.trim()) ? row.triggerTime : null,
    triggerScene: row.triggerScene || (row.triggerTime && row.triggerTime.trim()) || '全天候',
    hasExactTime: Boolean(row.hasExactTime && row.triggerTime && row.triggerTime.trim()),
    timeValueMinutes: row.timeValueMinutes ?? null,
    level: row.level,
    maxLevel: row.maxLevel,
    isLit: Boolean(row.isLit),
    isFrozen: Boolean(row.isFrozen),
    lastLitDate: row.lastLitDate || undefined,
    previousLevel: row.previousLevel ?? 0,
    position: { x: row.positionX, y: row.positionY },
    specCard: {
      instruction: row.specInstruction,
      failCondition: row.specFailCondition,
      benefitMechanism: row.specBenefitMechanism,
      notes: row.specNotes ?? undefined
    }
  }));

  const edgeRows = db.prepare('SELECT * FROM focus_edges').all() as FocusEdgeRow[];
  const edges: FocusEdge[] = edgeRows.map(row => ({
    id: row.id,
    sourceId: row.sourceId,
    sourceType: row.sourceType,
    targetId: row.targetId,
    targetType: row.targetType,
    sourceAnchor: row.sourceAnchor,
    targetAnchor: row.targetAnchor,
    style: row.style
  }));

  const labelRows = db.prepare('SELECT * FROM focus_labels').all() as FocusLabelRow[];
  const labels: FocusLabel[] = labelRows.map(row => ({
    id: row.id,
    text: row.text,
    position: { x: row.positionX, y: row.positionY }
  }));

  return { nodes, edges, groups, labels };
}
