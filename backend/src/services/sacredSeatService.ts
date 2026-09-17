import type { FocusSessionLog, SacredSeatConfig } from '../types.js';
import type { SacredSeatRepository } from '../repositories/sacredSeatRepository.js';
import type { SystemMetaRepository } from '../repositories/systemMetaRepository.js';

export interface SacredSeatServiceDependencies {
  sacredSeatRepository: SacredSeatRepository;
  systemMetaRepository: SystemMetaRepository;
  now?: () => Date;
}

export interface SacredSeatLogsExport {
  version: 1;
  exportedAt: string;
  dataType: 'FOCUS_SESSION_LOGS';
  total: number;
  logs: FocusSessionLog[];
}

export interface SavedFocusSessionLog {
  logId: string;
  status: FocusSessionLog['status'];
  currentStreak: number;
  maxStreak: number;
  idempotent?: true;
}

/** 神圣座位用例服务：组合配置、流水及 revision，而不感知 HTTP 或 SQLite。 */
export function createSacredSeatService({
  sacredSeatRepository,
  systemMetaRepository,
  now = () => new Date()
}: SacredSeatServiceDependencies) {
  function incrementRevision(): number {
    return systemMetaRepository.incrementSystemRevision(now().toISOString());
  }

  function getConfig(): SacredSeatConfig | undefined {
    return sacredSeatRepository.getConfig();
  }

  function updateConfig(config: SacredSeatConfig): SacredSeatConfig | undefined {
    const updated = sacredSeatRepository.updateConfig(config);
    // 保持原路由的顺序：即使后续读取不到记录，写用例仍会推进 revision。
    incrementRevision();
    return updated;
  }

  function resetStreak(): { currentStreak: number; maxStreak: number } {
    const updated = sacredSeatRepository.resetStreak();
    incrementRevision();
    return updated;
  }

  function listLogs(limit?: number): FocusSessionLog[] {
    return sacredSeatRepository.listLogs(limit);
  }

  function exportLogs(): SacredSeatLogsExport {
    const logs = sacredSeatRepository.listLogs();
    return {
      version: 1,
      exportedAt: now().toISOString(),
      dataType: 'FOCUS_SESSION_LOGS',
      total: logs.length,
      logs
    };
  }

  function importLogs(logs: unknown[]): { importedCount: number; totalLogs: number } {
    const summary = sacredSeatRepository.importLogs(logs);
    incrementRevision();
    return summary;
  }

  function getHeatmap(days: number) {
    return sacredSeatRepository.getHeatmap(days);
  }

  function saveLog(log: FocusSessionLog): SavedFocusSessionLog {
    const existing = sacredSeatRepository.getLogById(log.id);
    if (existing) {
      const streak = sacredSeatRepository.getStreak();
      return {
        logId: existing.id,
        status: existing.status,
        currentStreak: streak?.currentStreak ?? 0,
        maxStreak: streak?.maxStreak ?? 0,
        idempotent: true
      };
    }

    const streak = sacredSeatRepository.createLogWithStreakSettlement(log);
    return { logId: log.id, status: log.status, ...streak };
  }

  return { getConfig, updateConfig, resetStreak, listLogs, exportLogs, importLogs, getHeatmap, saveLog };
}
