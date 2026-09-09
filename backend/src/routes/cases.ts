import { Router, Request, Response } from 'express';
import { db, incrementSystemRevision } from '../db.js';
import type { PrecedentCase, PrecedentCaseRow } from '../types.js';

const router = Router();

// 获取判例列表
router.get('/', (req: Request, res: Response) => {
  const verdict = req.query.verdict as string | undefined;
  let rows: PrecedentCaseRow[];

  if (verdict && (verdict === 'ALLOW' || verdict === 'FORBID')) {
    rows = db.prepare('SELECT * FROM precedent_cases WHERE verdict = ? ORDER BY date DESC, createdAt DESC').all(verdict) as PrecedentCaseRow[];
  } else {
    rows = db.prepare('SELECT * FROM precedent_cases ORDER BY date DESC, createdAt DESC').all() as PrecedentCaseRow[];
  }

  const cases: PrecedentCase[] = rows.map(r => ({
    id: r.id,
    date: r.date,
    behavior: r.behavior,
    verdict: r.verdict,
    boundaryCondition: r.boundaryCondition,
    createdAt: r.createdAt
  }));

  res.json(cases);
});

// 导出全部判例法典
router.get('/export', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM precedent_cases ORDER BY date DESC, createdAt DESC').all() as PrecedentCaseRow[];
  const cases: PrecedentCase[] = rows.map(r => ({
    id: r.id,
    date: r.date,
    behavior: r.behavior,
    verdict: r.verdict,
    boundaryCondition: r.boundaryCondition,
    createdAt: r.createdAt
  }));

  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    dataType: 'PRECEDENT_CASES',
    total: cases.length,
    cases
  });
});

// 批量导入判例法典 (支持增量合并与覆盖更新)
router.post('/import', (req: Request, res: Response) => {
  const body = req.body;
  const rawCases = Array.isArray(body) ? body : (Array.isArray(body?.cases) ? body.cases : null);

  if (!rawCases || !Array.isArray(rawCases)) {
    return res.status(400).json({ error: 'Invalid payload: expected an array of cases or an object with a cases array' });
  }

  const upsertStmt = db.prepare(`
    INSERT INTO precedent_cases (id, date, behavior, verdict, boundaryCondition, createdAt)
    VALUES (@id, @date, @behavior, @verdict, @boundaryCondition, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date,
      behavior = excluded.behavior,
      verdict = excluded.verdict,
      boundaryCondition = excluded.boundaryCondition,
      createdAt = excluded.createdAt
  `);

  let importedCount = 0;

  const importTx = db.transaction((cases: any[]) => {
    for (const c of cases) {
      if (!c.id || !c.behavior || !c.verdict || !c.boundaryCondition) {
        continue;
      }
      if (c.verdict !== 'ALLOW' && c.verdict !== 'FORBID') {
        continue;
      }
      upsertStmt.run({
        id: String(c.id),
        date: String(c.date || new Date().toISOString().substring(0, 10)),
        behavior: String(c.behavior),
        verdict: String(c.verdict),
        boundaryCondition: String(c.boundaryCondition),
        createdAt: String(c.createdAt || new Date().toISOString())
      });
      importedCount += 1;
    }
  });

  try {
    importTx(rawCases);
    incrementSystemRevision();
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM precedent_cases').get() as { count: number } | undefined;
    res.json({
      success: true,
      importedCount,
      totalCases: totalRow?.count || 0
    });
  } catch (err: any) {
    console.error('Failed to import precedent cases', err);
    res.status(500).json({ error: 'Failed to import cases: ' + err.message });
  }
});

// 新增判例
router.post('/', (req: Request, res: Response) => {
  const { id, date, behavior, verdict, boundaryCondition, createdAt } = req.body;

  if (!id || !date || !behavior || !verdict || !boundaryCondition) {
    return res.status(400).json({ error: 'Missing required precedent case fields' });
  }

  if (verdict !== 'ALLOW' && verdict !== 'FORBID') {
    return res.status(400).json({ error: 'Invalid verdict value. Must be ALLOW or FORBID.' });
  }

  db.prepare(`
    INSERT INTO precedent_cases (id, date, behavior, verdict, boundaryCondition, createdAt)
    VALUES (@id, @date, @behavior, @verdict, @boundaryCondition, @createdAt)
  `).run({
    id,
    date,
    behavior,
    verdict,
    boundaryCondition,
    createdAt: createdAt || new Date().toISOString()
  });

  incrementSystemRevision();

  res.status(201).json({ id, date, behavior, verdict, boundaryCondition, createdAt });
});

// 修改判例
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { date, behavior, verdict, boundaryCondition } = req.body;

  if (!behavior || !verdict || !boundaryCondition) {
    return res.status(400).json({ error: 'Missing required precedent case fields' });
  }

  if (verdict !== 'ALLOW' && verdict !== 'FORBID') {
    return res.status(400).json({ error: 'Invalid verdict value. Must be ALLOW or FORBID.' });
  }

  const result = db.prepare(`
    UPDATE precedent_cases 
    SET behavior = @behavior, verdict = @verdict, boundaryCondition = @boundaryCondition, date = COALESCE(@date, date)
    WHERE id = @id
  `).run({
    id,
    behavior,
    verdict,
    boundaryCondition,
    date: date || null
  });

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Case not found' });
  }

  incrementSystemRevision();

  res.json({ id, date, behavior, verdict, boundaryCondition });
});

// 删除判例
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM precedent_cases WHERE id = ?').run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Case not found' });
  }

  incrementSystemRevision();

  res.json({ message: 'Deleted successfully', id });
});

export default router;
