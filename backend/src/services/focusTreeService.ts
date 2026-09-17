import type { FocusTreeData, ResetNodeItem } from '../types.js';
import { getBusinessDay, getPreviousBusinessDay } from '../domain/calendar/businessDay.js';
import type { FocusTreeRepository, NodeLitState } from '../repositories/focusTreeRepository.js';
import type { SystemMetaRepository } from '../repositories/systemMetaRepository.js';

export interface FocusTreeSettlement {
  resetNodes: ResetNodeItem[];
  settlementDate: string;
}

export interface FocusTreeServiceDependencies {
  focusTreeRepository: Pick<FocusTreeRepository, 'getFullFocusTreeData' | 'replaceFullFocusTree' | 'getNodeLitState' | 'updateNodeLitState' | 'reorderNodes' | 'createNode' | 'deleteNodeAndEdges' | 'createGroup' | 'getGroup' | 'updateGroup' | 'deleteGroup'>;
  systemMetaRepository: Pick<SystemMetaRepository, 'deleteValue' | 'getSystemRevision' | 'incrementSystemRevision'>;
  settleDailyState: () => FocusTreeSettlement | null;
  getBusinessDay?: () => string;
  getPreviousBusinessDay?: (businessDay: string) => string;
  now?: () => Date;
}

export type FocusTreeReadResult = FocusTreeData & { revision: number; resetSummary?: FocusTreeSettlement };

/** 国策树读取/日结应用服务：编排结算与版本读取，不感知 HTTP 或 SQLite。 */
export function createFocusTreeService({
  focusTreeRepository,
  systemMetaRepository,
  settleDailyState,
  getBusinessDay: calculateBusinessDay = getBusinessDay,
  getPreviousBusinessDay: calculatePreviousBusinessDay = getPreviousBusinessDay,
  now = () => new Date()
}: FocusTreeServiceDependencies) {
  function getFocusTree(): FocusTreeReadResult {
    const settlement = settleDailyState();
    const data = focusTreeRepository.getFullFocusTreeData();
    return {
      ...data,
      ...(settlement && settlement.resetNodes.length > 0 ? { resetSummary: settlement } : {}),
      revision: systemMetaRepository.getSystemRevision()
    };
  }

  function resetSettlementAudit(): number {
    systemMetaRepository.deleteValue('lastDailySettlementDate');
    return systemMetaRepository.incrementSystemRevision(now().toISOString());
  }

  function synchronizeFocusTree(input: { expectedRevision: number; tree: FocusTreeData }): { revision: number; data: FocusTreeData } {
    const revision = focusTreeRepository.replaceFullFocusTree(input);
    return { revision, data: focusTreeRepository.getFullFocusTreeData() };
  }

  function toggleNodeLit(id: string): { id: string; isLit: boolean; level: number; maxLevel: number; lastLitDate: string | null } | undefined {
    const current = focusTreeRepository.getNodeLitState(id);
    if (!current) return undefined;

    const today = calculateBusinessDay();
    const yesterday = calculatePreviousBusinessDay(today);
    let nextLit: boolean;
    let nextLevel: number;
    let nextMaxLevel: number;
    let nextLastLitDate: string | null;
    let nextPreviousLevel = current.previousLevel ?? 0;
    let nextPreviousLastLitDate = current.previousLastLitDate ?? null;

    if (current.isLit === 0) {
      nextLit = true;
      nextPreviousLevel = current.level;
      nextPreviousLastLitDate = current.lastLitDate ?? null;
      if (current.lastLitDate === yesterday) {
        nextLevel = current.level + 1;
      } else if (current.lastLitDate === today) {
        nextLevel = Math.max((current.previousLevel ?? 0) + 1, 1);
      } else {
        nextLevel = 1;
      }
      nextMaxLevel = Math.max(current.maxLevel, nextLevel);
      nextLastLitDate = today;
    } else {
      nextLit = false;
      nextLevel = Math.max(current.previousLevel ?? 0, 0);
      nextMaxLevel = current.maxLevel === current.level ? Math.max(nextLevel, 1) : Math.max(current.maxLevel, 1);
      if (current.previousLastLitDate !== undefined && current.previousLastLitDate !== null) {
        nextLastLitDate = current.previousLastLitDate;
      } else if (nextLevel > 0) {
        nextLastLitDate = yesterday;
      } else {
        nextLastLitDate = null;
      }
      nextPreviousLastLitDate = null;
    }

    const nextState: NodeLitState = {
      id,
      isLit: nextLit ? 1 : 0,
      level: nextLevel,
      maxLevel: nextMaxLevel,
      lastLitDate: nextLastLitDate,
      previousLevel: nextPreviousLevel,
      previousLastLitDate: nextPreviousLastLitDate
    };
    focusTreeRepository.updateNodeLitState(nextState);
    systemMetaRepository.incrementSystemRevision(now().toISOString());
    return { id, isLit: nextLit, level: nextLevel, maxLevel: nextMaxLevel, lastLitDate: nextLastLitDate };
  }

  function reorderNodes(nodeIds: string[]): void {
    focusTreeRepository.reorderNodes(nodeIds);
    systemMetaRepository.incrementSystemRevision(now().toISOString());
  }

  function createNode(node: FocusTreeData['nodes'][number]) {
    const savedNode = focusTreeRepository.createNode(node);
    systemMetaRepository.incrementSystemRevision(now().toISOString());
    return savedNode;
  }

  function deleteNode(id: string): boolean {
    const deleted = focusTreeRepository.deleteNodeAndEdges(id);
    if (deleted) systemMetaRepository.incrementSystemRevision(now().toISOString());
    return deleted;
  }

  function createGroup(group: FocusTreeData['groups'][number]): void {
    focusTreeRepository.createGroup(group);
    systemMetaRepository.incrementSystemRevision(now().toISOString());
  }

  function updateGroup(id: string, updates: Partial<FocusTreeData['groups'][number]>): FocusTreeData['groups'][number] | undefined {
    const current = focusTreeRepository.getGroup(id);
    if (!current) return undefined;
    const updated = {
      id,
      name: updates.name ?? current.name,
      themeColor: updates.themeColor ?? current.themeColor,
      position: {
        x: updates.position?.x ?? current.position.x,
        y: updates.position?.y ?? current.position.y
      },
      size: {
        width: updates.size?.width ?? current.size.width,
        height: updates.size?.height ?? current.size.height
      }
    };
    focusTreeRepository.updateGroup(updated);
    systemMetaRepository.incrementSystemRevision(now().toISOString());
    return updated;
  }

  function deleteGroup(id: string, deleteChildren: boolean): void {
    focusTreeRepository.deleteGroup(id, { deleteChildren });
    // 保持原路由语义：即使 group 不存在，删除请求仍会推进 revision 并返回成功。
    systemMetaRepository.incrementSystemRevision(now().toISOString());
  }

  return { getFocusTree, resetSettlementAudit, synchronizeFocusTree, toggleNodeLit, reorderNodes, createNode, deleteNode, createGroup, updateGroup, deleteGroup };
}
