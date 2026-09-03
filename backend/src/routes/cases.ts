import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import type { PrecedentCase } from '../types.js';

const router = Router();

// 获取判例列表
router.get('/', (req: Request, res: Response) => {
  const verdict = req.query.verdict as string | undefined;
  let rows: any[];

  if (verdict && (verdict === 'ALLOW' || verdict === 'FORBID')) {
    rows = db.prepare('SELECT * FROM precedent_cases WHERE verdict = ? ORDER BY date DESC, createdAt DESC').all(verdict);
  } else {
    rows = db.prepare('SELECT * FROM precedent_cases ORDER BY date DESC, createdAt DESC').all();
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

  res.status(201).json({ id, date, behavior, verdict, boundaryCondition, createdAt });
});

// 删除判例
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM precedent_cases WHERE id = ?').run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Case not found' });
  }

  res.json({ message: 'Deleted successfully', id });
});

export default router;
