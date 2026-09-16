import type { SqliteDatabasePort } from './databasePort.js';
import type { PrecedentCase, PrecedentCaseRow } from '../types.js';

export type CaseVerdict = PrecedentCase['verdict'];

export interface PrecedentCaseRepository {
  list(verdict?: CaseVerdict): PrecedentCase[];
  importCases(cases: any[]): { importedCount: number; totalCases: number };
  create(caseItem: PrecedentCase): void;
  update(id: string, updates: Pick<PrecedentCase, 'behavior' | 'verdict' | 'boundaryCondition'> & { date?: string }): boolean;
  delete(id: string): boolean;
}

export interface PrecedentCaseRepositoryOptions { now?: () => Date; }

function toCase(row: PrecedentCaseRow): PrecedentCase {
  return { id: row.id, date: row.date, behavior: row.behavior, verdict: row.verdict, boundaryCondition: row.boundaryCondition, createdAt: row.createdAt };
}

/** 判例法典 SQLite CRUD 与容错导入边界。 */
export function createPrecedentCaseRepository(
  db: SqliteDatabasePort,
  { now = () => new Date() }: PrecedentCaseRepositoryOptions = {}
): PrecedentCaseRepository {
  function list(verdict?: CaseVerdict): PrecedentCase[] {
    const rows = (verdict
      ? db.prepare('SELECT * FROM precedent_cases WHERE verdict = ? ORDER BY date DESC, createdAt DESC').all(verdict)
      : db.prepare('SELECT * FROM precedent_cases ORDER BY date DESC, createdAt DESC').all()) as PrecedentCaseRow[];
    return rows.map(toCase);
  }

  function importCases(cases: any[]): { importedCount: number; totalCases: number } {
    const upsert = db.prepare(`INSERT INTO precedent_cases (id,date,behavior,verdict,boundaryCondition,createdAt)
      VALUES (@id,@date,@behavior,@verdict,@boundaryCondition,@createdAt)
      ON CONFLICT(id) DO UPDATE SET date=excluded.date,behavior=excluded.behavior,verdict=excluded.verdict,
        boundaryCondition=excluded.boundaryCondition,createdAt=excluded.createdAt`);
    let importedCount = 0;
    db.transaction((items: any[]) => {
      for (const item of items) {
        if (!item.id || !item.behavior || !item.verdict || !item.boundaryCondition) continue;
        if (item.verdict !== 'ALLOW' && item.verdict !== 'FORBID') continue;
        const timestamp = now().toISOString();
        upsert.run({
          id: String(item.id), date: String(item.date || timestamp.substring(0, 10)), behavior: String(item.behavior),
          verdict: String(item.verdict), boundaryCondition: String(item.boundaryCondition), createdAt: String(item.createdAt || timestamp)
        });
        importedCount++;
      }
    })(cases);
    const total = db.prepare('SELECT COUNT(*) as count FROM precedent_cases').get() as { count: number } | undefined;
    return { importedCount, totalCases: total?.count || 0 };
  }

  function create(caseItem: PrecedentCase): void {
    db.prepare('INSERT INTO precedent_cases (id,date,behavior,verdict,boundaryCondition,createdAt) VALUES (@id,@date,@behavior,@verdict,@boundaryCondition,@createdAt)')
      .run(caseItem);
  }

  function update(id: string, updates: Pick<PrecedentCase, 'behavior' | 'verdict' | 'boundaryCondition'> & { date?: string }): boolean {
    return db.prepare(`UPDATE precedent_cases SET behavior=@behavior,verdict=@verdict,boundaryCondition=@boundaryCondition,
      date=COALESCE(@date,date) WHERE id=@id`).run({ id, ...updates, date: updates.date || null }).changes > 0;
  }

  function remove(id: string): boolean {
    return db.prepare('DELETE FROM precedent_cases WHERE id = ?').run(id).changes > 0;
  }

  return { list, importCases, create, update, delete: remove };
}
