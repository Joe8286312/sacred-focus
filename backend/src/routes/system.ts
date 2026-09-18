import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { exportLimiter, importLimiter } from '../middleware/rateLimiter.js';
import { validateFullBackupPayload } from '../utils/validators.js';
import { createSystemBackupRepository } from '../repositories/systemBackupRepository.js';
import {
  createMaintenanceRepository,
  MaintenanceInProgressError,
  RevisionPreconditionError
} from '../repositories/maintenanceRepository.js';
import { createSystemBackupService, SystemBackupImportError } from '../services/systemBackupService.js';
import { getErrorDetails } from '../utils/errorDetails.js';

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
    if (!(e instanceof SystemBackupImportError)) throw e;
    const cause = e.cause;
    if (e.phase === 'acquire' && cause instanceof RevisionPreconditionError) {
      return res.status(409).json({
        error: 'VERSION_CONFLICT',
        message: '系统已被其他终端修改，请同步最新状态后再执行整机恢复',
        currentRevision: cause.currentRevision
      });
    }
    if (e.phase === 'acquire' && cause instanceof MaintenanceInProgressError) {
      return res.status(503).json({
        error: 'MAINTENANCE_IN_PROGRESS',
        message: '已有整机恢复正在执行，请稍后重试',
        retryAfterSeconds: Math.max(1, Math.ceil((cause.expiresAt - Date.now()) / 1000))
      });
    }
    if (e.phase === 'backup') {
      console.error('[Sacred Focus System] 预导入热备创建失败，终止导入操作以防数据丢失:', cause);
      return res.status(500).json({
        error: 'BACKUP_FAILED_ABORT_IMPORT',
        message: '导入前热备数据库快照失败，为防止数据损坏已终止导入',
        details: cause instanceof Error ? cause.message : String(cause)
      });
    }
    if (e.phase === 'restore' && cause instanceof RevisionPreconditionError) {
      return res.status(409).json({
        error: 'VERSION_CONFLICT',
        message: '恢复前置版本已变化，已终止覆写',
        currentRevision: cause.currentRevision
      });
    }
    console.error('Failed to import full system backup', cause);
    res.status(500).json({ error: '导入系统备份失败', details: cause instanceof Error ? cause.message : String(cause) });
  }
});

export default router;
