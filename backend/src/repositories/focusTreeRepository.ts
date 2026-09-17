import type { Statement } from 'better-sqlite3';
import type { SqliteDatabasePort } from './databasePort.js';
import { createSystemMetaRepository } from './systemMetaRepository.js';
import { RevisionPreconditionError } from './maintenanceRepository.js';
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
} from '../types.js';

export interface FocusTreeRepository {
  upsertFocusNode(node: FocusNode, sortOrder?: number): FocusNode;
  getFullFocusTreeData(): FocusTreeData;
  replaceFullFocusTree(input: { expectedRevision: number; tree: FocusTreeData }): number;
  getNodeLitState(id: string): NodeLitState | undefined;
  updateNodeLitState(state: NodeLitState): void;
  reorderNodes(nodeIds: string[]): void;
  createNode(node: FocusNode): FocusNode;
  deleteNodeAndEdges(id: string): boolean;
  createGroup(group: FocusGroup): void;
}

export interface FocusTreeRepositoryOptions { now?: () => Date; }

export interface NodeLitState {
  id: string;
  level: number;
  maxLevel: number;
  isLit: number;
  lastLitDate?: string | null;
  previousLevel?: number;
  previousLastLitDate?: string | null;
}

/** 国策树的 SQLite 读写边界；调用方必须显式注入数据库端口。 */
export function createFocusTreeRepository(
  db: SqliteDatabasePort,
  { now = () => new Date() }: FocusTreeRepositoryOptions = {}
): FocusTreeRepository {
  let upsertFocusNodeStatement: Statement | null = null;
  const systemMeta = createSystemMetaRepository(db);

  function getUpsertFocusNodeStatement(): Statement {
    if (!upsertFocusNodeStatement) {
      upsertFocusNodeStatement = db.prepare(`
        INSERT OR REPLACE INTO focus_nodes (
          id, code, name, groupId, triggerTime, triggerScene, hasExactTime, timeValueMinutes,
          level, maxLevel, isLit, isFrozen, lastLitDate, previousLevel, previousLastLitDate, positionX, positionY,
          specInstruction, specFailCondition, specBenefitMechanism, specNotes, sortOrder
        ) VALUES (
          @id, @code, @name, @groupId, @triggerTime, @triggerScene, @hasExactTime, @timeValueMinutes,
          @level, @maxLevel, @isLit, @isFrozen, @lastLitDate, @previousLevel, @previousLastLitDate, @positionX, @positionY,
          @specInstruction, @specFailCondition, @specBenefitMechanism, @specNotes, @sortOrder
        )
      `);
    }
    return upsertFocusNodeStatement;
  }

  function upsertFocusNode(node: FocusNode, sortOrder?: number): FocusNode {
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

    getUpsertFocusNodeStatement().run({
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
      previousLastLitDate: node.previousLastLitDate ?? null,
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
      timeValueMinutes,
      previousLastLitDate: node.previousLastLitDate ?? null
    };
  }

  function getFullFocusTreeData(): FocusTreeData {
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
      previousLastLitDate: row.previousLastLitDate || null,
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

  function replaceFullFocusTree({ expectedRevision, tree }: { expectedRevision: number; tree: FocusTreeData }): number {
    return db.transaction(() => {
      const currentRevision = systemMeta.getSystemRevision();
      if (expectedRevision !== currentRevision) {
        throw new RevisionPreconditionError(currentRevision);
      }

      // 保持既有删除顺序，避免外键与 groupId 的隐式变更影响快照替换。
      db.prepare('DELETE FROM focus_edges').run();
      db.prepare('DELETE FROM focus_nodes').run();
      db.prepare('DELETE FROM focus_groups').run();
      db.prepare('DELETE FROM focus_labels').run();

      const insertGroup = db.prepare(`
        INSERT INTO focus_groups (id, name, themeColor, positionX, positionY, width, height)
        VALUES (@id, @name, @themeColor, @positionX, @positionY, @width, @height)
      `);
      for (const group of tree.groups) {
        insertGroup.run({
          id: group.id,
          name: group.name,
          themeColor: group.themeColor,
          positionX: group.position.x,
          positionY: group.position.y,
          width: group.size.width,
          height: group.size.height
        });
      }

      for (let index = 0; index < tree.nodes.length; index++) {
        upsertFocusNode(tree.nodes[index], index);
      }

      const insertEdge = db.prepare(`
        INSERT INTO focus_edges (id, sourceId, sourceType, targetId, targetType, sourceAnchor, targetAnchor, style)
        VALUES (@id, @sourceId, @sourceType, @targetId, @targetType, @sourceAnchor, @targetAnchor, @style)
      `);
      for (const edge of tree.edges) insertEdge.run(edge);

      const insertLabel = db.prepare(`
        INSERT INTO focus_labels (id, text, positionX, positionY)
        VALUES (@id, @text, @positionX, @positionY)
      `);
      for (const label of tree.labels) {
        insertLabel.run({ id: label.id, text: label.text, positionX: label.position?.x ?? 0, positionY: label.position?.y ?? 0 });
      }

      return systemMeta.incrementSystemRevision(now().toISOString());
    })();
  }

  function getNodeLitState(id: string): NodeLitState | undefined {
    return db.prepare('SELECT id, level, maxLevel, isLit, lastLitDate, previousLevel, previousLastLitDate FROM focus_nodes WHERE id = ?')
      .get(id) as NodeLitState | undefined;
  }

  function updateNodeLitState(state: NodeLitState): void {
    db.prepare(`
      UPDATE focus_nodes SET
        isLit = @isLit,
        level = @level,
        maxLevel = @maxLevel,
        lastLitDate = @lastLitDate,
        previousLevel = @previousLevel,
        previousLastLitDate = @previousLastLitDate
      WHERE id = @id
    `).run(state);
  }

  function reorderNodes(nodeIds: string[]): void {
    const reorderTransaction = db.transaction(() => {
      const updateSort = db.prepare('UPDATE focus_nodes SET sortOrder = ? WHERE id = ?');
      nodeIds.forEach((id, index) => updateSort.run(index, id));
    });
    reorderTransaction();
  }

  function createNode(node: FocusNode): FocusNode {
    const maxOrderRow = db.prepare('SELECT MAX(sortOrder) as maxOrder FROM focus_nodes').get() as { maxOrder: number | null } | undefined;
    return upsertFocusNode(node, (maxOrderRow?.maxOrder ?? -1) + 1);
  }

  function deleteNodeAndEdges(id: string): boolean {
    return db.transaction(() => {
      db.prepare("DELETE FROM focus_edges WHERE (sourceId = ? AND sourceType = 'NODE') OR (targetId = ? AND targetType = 'NODE')").run(id, id);
      return db.prepare('DELETE FROM focus_nodes WHERE id = ?').run(id).changes > 0;
    })();
  }

  function createGroup(group: FocusGroup): void {
    db.prepare(`
      INSERT INTO focus_groups (id, name, themeColor, positionX, positionY, width, height)
      VALUES (@id, @name, @themeColor, @positionX, @positionY, @width, @height)
    `).run({
      id: group.id,
      name: group.name,
      themeColor: group.themeColor,
      positionX: group.position?.x ?? 0,
      positionY: group.position?.y ?? 0,
      width: group.size?.width ?? 320,
      height: group.size?.height ?? 200
    });
  }

  return { upsertFocusNode, getFullFocusTreeData, replaceFullFocusTree, getNodeLitState, updateNodeLitState, reorderNodes, createNode, deleteNodeAndEdges, createGroup };
}
