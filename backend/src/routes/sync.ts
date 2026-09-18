import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { createEvolutionRepository } from '../repositories/evolutionRepository.js';
import { createSystemMetaRepository } from '../repositories/systemMetaRepository.js';
import { createSyncStatusService } from '../services/syncStatusService.js';
import { getErrorDetails } from '../utils/errorDetails.js';

const router = Router();
const service = createSyncStatusService({
  evolutionRepository: createEvolutionRepository(db),
  systemMetaRepository: createSystemMetaRepository(db)
});

// 轻量同步探针 (响应 < 100 字节，极低消耗)
router.get('/status', (_req: Request, res: Response) => {
  try {
    res.json(service.getStatus());
  } catch (e: unknown) {
    res.status(500).json({ error: 'Failed to probe sync status', details: getErrorDetails(e) });
  }
});

export default router;
