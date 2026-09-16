import { Router, Request, Response } from 'express';
import { db, incrementSystemRevision } from '../db.js';
import { createPrecedentCaseRepository } from '../repositories/precedentCaseRepository.js';

const router = Router();
const repository = createPrecedentCaseRepository(db);

// 获取判例列表
router.get('/', (req: Request, res: Response) => {
  const verdict = req.query.verdict as string | undefined;
  res.json(verdict === 'ALLOW' || verdict === 'FORBID' ? repository.list(verdict) : repository.list());
});

// 导出全部判例法典
router.get('/export', (_req: Request, res: Response) => {
  const cases = repository.list();

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

  try {
    const summary = repository.importCases(rawCases);
    incrementSystemRevision();
    res.json({
      success: true,
      ...summary
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

  repository.create({ id, date, behavior, verdict, boundaryCondition, createdAt: createdAt || new Date().toISOString() });

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

  if (!repository.update(id as string, { behavior, verdict, boundaryCondition, date })) {
    return res.status(404).json({ error: 'Case not found' });
  }

  incrementSystemRevision();

  res.json({ id, date, behavior, verdict, boundaryCondition });
});

// 删除判例
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!repository.delete(id as string)) {
    return res.status(404).json({ error: 'Case not found' });
  }

  incrementSystemRevision();

  res.json({ message: 'Deleted successfully', id });
});

export default router;
