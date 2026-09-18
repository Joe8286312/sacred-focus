import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { createPrecedentCaseRepository } from '../repositories/precedentCaseRepository.js';
import { createSystemMetaRepository } from '../repositories/systemMetaRepository.js';
import { createPrecedentCaseService } from '../services/precedentCaseService.js';
import { getErrorDetails } from '../utils/errorDetails.js';

const router = Router();
const service = createPrecedentCaseService({
  precedentCaseRepository: createPrecedentCaseRepository(db),
  systemMetaRepository: createSystemMetaRepository(db)
});

// 获取判例列表
router.get('/', (req: Request, res: Response) => {
  const verdict = req.query.verdict as string | undefined;
  res.json(verdict === 'ALLOW' || verdict === 'FORBID' ? service.listCases(verdict) : service.listCases());
});

// 导出全部判例法典
router.get('/export', (_req: Request, res: Response) => {
  res.json(service.exportCases());
});

// 批量导入判例法典 (支持增量合并与覆盖更新)
router.post('/import', (req: Request, res: Response) => {
  const body = req.body;
  const rawCases = Array.isArray(body) ? body : (Array.isArray(body?.cases) ? body.cases : null);

  if (!rawCases || !Array.isArray(rawCases)) {
    return res.status(400).json({ error: 'Invalid payload: expected an array of cases or an object with a cases array' });
  }

  try {
    const summary = service.importCases(rawCases);
    res.json({
      success: true,
      ...summary
    });
  } catch (err: unknown) {
    console.error('Failed to import precedent cases', err);
    res.status(500).json({ error: 'Failed to import cases: ' + getErrorDetails(err) });
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

  service.createCase({ id, date, behavior, verdict, boundaryCondition, createdAt });

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

  if (!service.updateCase(id as string, { behavior, verdict, boundaryCondition, date })) {
    return res.status(404).json({ error: 'Case not found' });
  }

  res.json({ id, date, behavior, verdict, boundaryCondition });
});

// 删除判例
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!service.deleteCase(id as string)) {
    return res.status(404).json({ error: 'Case not found' });
  }

  res.json({ message: 'Deleted successfully', id });
});

export default router;
