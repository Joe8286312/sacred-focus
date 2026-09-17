import type { PrecedentCase } from '../types.js';
import type { CaseVerdict, PrecedentCaseRepository } from '../repositories/precedentCaseRepository.js';
import type { SystemMetaRepository } from '../repositories/systemMetaRepository.js';

export interface PrecedentCaseServiceDependencies {
  precedentCaseRepository: PrecedentCaseRepository;
  systemMetaRepository: SystemMetaRepository;
  now?: () => Date;
}

export interface PrecedentCasesExport {
  version: 1;
  exportedAt: string;
  dataType: 'PRECEDENT_CASES';
  total: number;
  cases: PrecedentCase[];
}

export type NewPrecedentCase = Omit<PrecedentCase, 'createdAt'> & { createdAt?: string };

/** 判例法典用例服务：组合 CRUD、导入导出与 revision，而不感知 HTTP 或 SQLite。 */
export function createPrecedentCaseService({
  precedentCaseRepository,
  systemMetaRepository,
  now = () => new Date()
}: PrecedentCaseServiceDependencies) {
  function incrementRevision(): number {
    return systemMetaRepository.incrementSystemRevision(now().toISOString());
  }

  function listCases(verdict?: CaseVerdict): PrecedentCase[] {
    return precedentCaseRepository.list(verdict);
  }

  function exportCases(): PrecedentCasesExport {
    const cases = precedentCaseRepository.list();
    return {
      version: 1,
      exportedAt: now().toISOString(),
      dataType: 'PRECEDENT_CASES',
      total: cases.length,
      cases
    };
  }

  function importCases(cases: unknown[]): { importedCount: number; totalCases: number } {
    const summary = precedentCaseRepository.importCases(cases);
    incrementRevision();
    return summary;
  }

  function createCase(caseItem: NewPrecedentCase): void {
    precedentCaseRepository.create({ ...caseItem, createdAt: caseItem.createdAt || now().toISOString() });
    incrementRevision();
  }

  function updateCase(
    id: string,
    updates: Pick<PrecedentCase, 'behavior' | 'verdict' | 'boundaryCondition'> & { date?: string }
  ): boolean {
    const updated = precedentCaseRepository.update(id, updates);
    if (updated) incrementRevision();
    return updated;
  }

  function deleteCase(id: string): boolean {
    const deleted = precedentCaseRepository.delete(id);
    if (deleted) incrementRevision();
    return deleted;
  }

  return { listCases, exportCases, importCases, createCase, updateCase, deleteCase };
}
