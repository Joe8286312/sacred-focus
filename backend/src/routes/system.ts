import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import {
  acquireMaintenanceLease,
  db,
  MaintenanceInProgressError,
  releaseMaintenanceLease,
  RevisionPreconditionError
} from '../db.js';
import { exportLimiter, importLimiter } from '../middleware/rateLimiter.js';
import { validateFullBackupPayload } from '../utils/validators.js';
import { createSystemBackupRepository } from '../repositories/systemBackupRepository.js';

const router = Router();
const repository = createSystemBackupRepository(db, { dataDir: config.dataDir });

// 全量导出系统整机镜像（跨设备全量迁移与灾难恢复，15次/10分钟限流保护）
router.get('/export', exportLimiter, (_req: Request, res: Response) => {
  try {
    res.json(repository.exportFullBackup());
  } catch (e: any) {
    console.error('Failed to export full system backup', e);
    res.status(500).json({ error: 'Failed to export full system backup', details: e.message });
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

  const { tree, sacredSeatConfig, precedentCases, evolution, sessionLogs } = validation.data;
  let maintenanceLease;

  try {
    // 在任何 await 前同步取得维护租约；后续外部写请求由全局门禁统一拒绝。
    maintenanceLease = acquireMaintenanceLease('full-system-import', expectedRevision);
  } catch (e: any) {
    if (e instanceof RevisionPreconditionError) {
      return res.status(409).json({
        error: 'VERSION_CONFLICT',
        message: '系统已被其他终端修改，请同步最新状态后再执行整机恢复',
        currentRevision: e.currentRevision
      });
    }
    if (e instanceof MaintenanceInProgressError) {
      return res.status(503).json({
        error: 'MAINTENANCE_IN_PROGRESS',
        message: '已有整机恢复正在执行，请稍后重试',
        retryAfterSeconds: Math.max(1, Math.ceil((e.expiresAt - Date.now()) / 1000))
      });
    }
    throw e;
  }

  // 导入前自动热备当前 SQLite 数据库快照 (P1-002: 热备失败必须终止导入，严禁破坏性覆写)
  try {
    const result = await repository.createPreImportBackup();
    console.log(`[Sacred Focus System] 预导入安全热备已生成: ${result.backupFile}`);
    if (result.prunedCount > 0) {
      console.log(`[Sacred Focus System] 已淘汰 ${result.prunedCount} 个过期预导入热备`);
    }
    if (result.pruneError) {
      // 热备本身已经成功；清理失败不应降低本次恢复的可回退性。
      console.warn('[Sacred Focus System] 预导入热备清理失败，将在下次恢复时重试:', result.pruneError);
    }
  } catch (backupErr: any) {
    console.error('[Sacred Focus System] 预导入热备创建失败，终止导入操作以防数据丢失:', backupErr);
    releaseMaintenanceLease(maintenanceLease);
    return res.status(500).json({
      error: 'BACKUP_FAILED_ABORT_IMPORT',
      message: '导入前热备数据库快照失败，为防止数据损坏已终止导入',
      details: backupErr?.message || String(backupErr)
    });
  }

  try {
    const summary = repository.restoreFullBackup({
      maintenanceLease,
      tree,
      sacredSeatConfig,
      precedentCases,
      evolution,
      sessionLogs
    });
    res.json({
      success: true,
      message: '全系统备份已彻底还原写入',
      summary
    });
  } catch (e: any) {
    if (e instanceof RevisionPreconditionError) {
      return res.status(409).json({
        error: 'VERSION_CONFLICT',
        message: '恢复前置版本已变化，已终止覆写',
        currentRevision: e.currentRevision
      });
    }
    console.error('Failed to import full system backup', e);
    res.status(500).json({ error: '导入系统备份失败', details: e.message });
  } finally {
    releaseMaintenanceLease(maintenanceLease);
  }
});

export default router;
