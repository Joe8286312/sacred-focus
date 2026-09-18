import type { PrecedentCase } from '../../types';

export type CaseFilter = 'ALL' | 'ALLOW' | 'FORBID';

export interface CaseImportResult {
  importedCount: number;
  totalCases: number;
}

export type ApiRequest = <T = unknown>(url: string, options?: RequestInit) => Promise<T>;

export interface PrecedentCaseGateway {
  list(filter: CaseFilter): Promise<PrecedentCase[]>;
  save(caseItem: PrecedentCase, isEdit: boolean): Promise<Partial<PrecedentCase>>;
  remove(id: string): Promise<void>;
  exportAll(): Promise<unknown>;
  importAll(payload: unknown): Promise<CaseImportResult>;
}

/** 判例 HTTP 协议的纯适配规则，供视图与模态框共用。 */
export function createPrecedentCaseGateway(request: ApiRequest): PrecedentCaseGateway {
  return {
    list(filter) {
      return request<PrecedentCase[]>(filter === 'ALL' ? '/api/cases' : `/api/cases?verdict=${filter}`);
    },
    save(caseItem, isEdit) {
      return request<Partial<PrecedentCase>>(isEdit ? `/api/cases/${caseItem.id}` : '/api/cases', {
        method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(caseItem)
      });
    },
    async remove(id) {
      await request(`/api/cases/${id}`, { method: 'DELETE' });
    },
    exportAll() {
      return request('/api/cases/export');
    },
    importAll(payload) {
      return request<CaseImportResult>('/api/cases/import', { method: 'POST', body: JSON.stringify(payload) });
    }
  };
}
