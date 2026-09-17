import type { FocusTreeData, ResetNodeItem } from '../types.js';
import type { FocusTreeRepository } from '../repositories/focusTreeRepository.js';
import type { SystemMetaRepository } from '../repositories/systemMetaRepository.js';

export interface FocusTreeSettlement {
  resetNodes: ResetNodeItem[];
  settlementDate: string;
}

export interface FocusTreeServiceDependencies {
  focusTreeRepository: Pick<FocusTreeRepository, 'getFullFocusTreeData' | 'replaceFullFocusTree'>;
  systemMetaRepository: Pick<SystemMetaRepository, 'deleteValue' | 'getSystemRevision' | 'incrementSystemRevision'>;
  settleDailyState: () => FocusTreeSettlement | null;
  now?: () => Date;
}

export type FocusTreeReadResult = FocusTreeData & { revision: number; resetSummary?: FocusTreeSettlement };

/** 国策树读取/日结应用服务：编排结算与版本读取，不感知 HTTP 或 SQLite。 */
export function createFocusTreeService({
  focusTreeRepository,
  systemMetaRepository,
  settleDailyState,
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

  return { getFocusTree, resetSettlementAudit, synchronizeFocusTree };
}
