import {
  MaintenanceInProgressError,
  RevisionPreconditionError
} from '../repositories/maintenanceRepository.js';
import { SystemBackupImportError } from '../services/systemBackupService.js';

export interface SystemImportFailureResponse {
  status: number;
  body: Record<string, unknown>;
  log?: { message: string; cause: unknown };
}

function getCauseDetails(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** 将整机恢复的领域阶段错误映射为既有 HTTP 响应；未知错误交还全局中间件。 */
export function getSystemImportFailureResponse(
  error: unknown,
  now: () => number = Date.now
): SystemImportFailureResponse | undefined {
  if (!(error instanceof SystemBackupImportError)) return undefined;

  const cause = error.cause;
  if (error.phase === 'acquire' && cause instanceof RevisionPreconditionError) {
    return {
      status: 409,
      body: {
        error: 'VERSION_CONFLICT',
        message: '系统已被其他终端修改，请同步最新状态后再执行整机恢复',
        currentRevision: cause.currentRevision
      }
    };
  }
  if (error.phase === 'acquire' && cause instanceof MaintenanceInProgressError) {
    return {
      status: 503,
      body: {
        error: 'MAINTENANCE_IN_PROGRESS',
        message: '已有整机恢复正在执行，请稍后重试',
        retryAfterSeconds: Math.max(1, Math.ceil((cause.expiresAt - now()) / 1000))
      }
    };
  }
  if (error.phase === 'backup') {
    return {
      status: 500,
      body: {
        error: 'BACKUP_FAILED_ABORT_IMPORT',
        message: '导入前热备数据库快照失败，为防止数据损坏已终止导入',
        details: getCauseDetails(cause)
      },
      log: { message: '[Sacred Focus System] 预导入热备创建失败，终止导入操作以防数据丢失:', cause }
    };
  }
  if (error.phase === 'restore' && cause instanceof RevisionPreconditionError) {
    return {
      status: 409,
      body: {
        error: 'VERSION_CONFLICT',
        message: '恢复前置版本已变化，已终止覆写',
        currentRevision: cause.currentRevision
      }
    };
  }
  return {
    status: 500,
    body: { error: '导入系统备份失败', details: getCauseDetails(cause) },
    log: { message: 'Failed to import full system backup', cause }
  };
}
