import type { Request, Response, NextFunction } from 'express';
import { getActiveMaintenanceLease } from '../db/maintenance.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// 整机恢复热备与覆写期间，拒绝所有外部写入，避免恢复点之后的写操作被静默抹掉。
export function maintenanceGuard(req: Request, res: Response, next: NextFunction) {
  if (!WRITE_METHODS.has(req.method)) {
    return next();
  }

  const lease = getActiveMaintenanceLease();
  if (!lease) {
    return next();
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((lease.expiresAt - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return res.status(503).json({
    error: 'MAINTENANCE_IN_PROGRESS',
    message: '系统正在执行数据恢复，写入操作已暂时冻结，请稍后重试',
    retryAfterSeconds
  });
}
