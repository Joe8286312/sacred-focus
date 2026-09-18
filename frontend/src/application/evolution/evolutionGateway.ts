import type { EvolutionState, FocusTreeData } from '../../types';

export interface EvolutionStateResponse extends EvolutionState {
  revision?: number;
}

export interface EvolutionRollbackResponse {
  liveTree: FocusTreeData;
  revision?: number;
}

export type EvolutionApiRequest = <T = any>(url: string, options?: RequestInit) => Promise<T>;

export interface EvolutionGateway {
  getState(): Promise<EvolutionStateResponse>;
  createSnapshot(changelogNotes: string, isMajor: boolean, expectedRevision: number): Promise<unknown>;
  rollback(targetSlotIndex: number, expectedRevision: number): Promise<EvolutionRollbackResponse>;
  exportArchitecture(): Promise<unknown>;
  importArchitecture(backupData: object, expectedRevision: number): Promise<unknown>;
}

/** 演化版本 HTTP 协议的纯适配规则，store 仅编排本地状态与刷新顺序。 */
export function createEvolutionGateway(request: EvolutionApiRequest): EvolutionGateway {
  return {
    getState() {
      return request<EvolutionStateResponse>('/api/evolution');
    },
    createSnapshot(changelogNotes, isMajor, expectedRevision) {
      return request('/api/evolution/snapshot', {
        method: 'POST', body: JSON.stringify({ changelogNotes, isMajor, expectedRevision })
      });
    },
    rollback(targetSlotIndex, expectedRevision) {
      return request<EvolutionRollbackResponse>('/api/evolution/rollback', {
        method: 'POST', body: JSON.stringify({ targetSlotIndex, expectedRevision })
      });
    },
    exportArchitecture() {
      return request('/api/evolution/export');
    },
    importArchitecture(backupData, expectedRevision) {
      return request('/api/evolution/import', {
        method: 'POST', body: JSON.stringify({ ...backupData, expectedRevision })
      });
    }
  };
}
