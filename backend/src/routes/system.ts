import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { exportLimiter, importLimiter } from '../middleware/rateLimiter.js';
import { validateFullBackupPayload } from '../utils/validators.js';
import { createSystemBackupRepository } from '../repositories/systemBackupRepository.js';
import { createMaintenanceRepository } from '../repositories/maintenanceRepository.js';
import { createSystemBackupService } from '../services/systemBackupService.js';
import { getErrorDetails } from '../utils/errorDetails.js';
import { getSystemImportFailureResponse } from './systemImportFailure.js';

const router = Router();
const maintenanceRepository = createMaintenanceRepository(db);
const repository = createSystemBackupRepository(db, { dataDir: config.dataDir, maintenanceRepository });
const service = createSystemBackupService({ systemBackupRepository: repository, maintenanceRepository });

// 全量导出系统整机镜像（跨设备全量迁移与灾难恢复，15次/10分钟限流保护）
router.get('/export', exportLimiter, (_req: Request, res: Response) => {
  try {
    res.json(service.exportFullBackup());
  } catch (e: unknown) {
    console.error('Failed to export full system backup', e);
    res.status(500).json({ error: 'Failed to export full system backup', details: getErrorDetails(e) });
  }
});

// 全量导入整机镜像（跨设备整机恢复，带预热备与 10次/小时频控保护）
router.post('/import', importLimiter, async (req: Request, res: Response) => {
  const validation = validateFullBackupPayload(req.body);
  if (!validation.success || !validation.data) {
    return res.status(400).json({
      error: 'INVALID_BACKUP_SCHEMA',
      message: validation.error || '备份文件结构校验未通过',
      details: validation.details
    });
  }

  const expectedRevision = req.body?.expectedRevision;
  if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return res.status(400).json({
      error: 'EXPECTED_REVISION_REQUIRED',
      message: '整机恢复必须携带有效的 expectedRevision'
    });
  }

  try {
    const result = await service.importFullBackup({
      expectedRevision,
      tree: validation.data.tree,
      sacredSeatConfig: validation.data.sacredSeatConfig,
      precedentCases: validation.data.precedentCases,
      evolution: validation.data.evolution,
      sessionLogs: validation.data.sessionLogs
    });
    console.log(`[Sacred Focus System] 预导入安全热备已生成: ${result.preImportBackup.backupFile}`);
    if (result.preImportBackup.prunedCount > 0) {
      console.log(`[Sacred Focus System] 已淘汰 ${result.preImportBackup.prunedCount} 个过期预导入热备`);
    }
    if (result.preImportBackup.pruneError) {
      console.warn('[Sacred Focus System] 预导入热备清理失败，将在下次恢复时重试:', result.preImportBackup.pruneError);
    }
    res.json({
      success: true,
      message: '全系统备份已彻底还原写入',
      summary: result.summary
    });
  } catch (e: unknown) {
    const failure = getSystemImportFailureResponse(e);
    if (!failure) throw e;
    if (failure.log) console.error(failure.log.message, failure.log.cause);
    return res.status(failure.status).json(failure.body);
  }
});

export default router;
