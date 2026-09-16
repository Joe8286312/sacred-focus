import type { SqliteDatabasePort } from './databasePort.js';
import { createSystemMetaRepository } from './systemMetaRepository.js';
import type {
  DailyFocusHeatmapItem,
  DailyFocusHeatmapRow,
  FocusSessionLog,
  FocusSessionLogRow,
  SacredSeatConfig,
  SacredSeatConfigRow
} from '../types.js';

export interface SacredSeatRepository {
  getConfig(): SacredSeatConfig | undefined;
  updateConfig(config: SacredSeatConfig): SacredSeatConfig | undefined;
  resetStreak(): { currentStreak: number; maxStreak: number };
  listLogs(limit?: number): FocusSessionLog[];
  importLogs(logs: any[]): { importedCount: number; totalLogs: number };
  getHeatmap(days: number): DailyFocusHeatmapItem[];
  getLogById(id: string): FocusSessionLog | undefined;
  getStreak(): { currentStreak: number; maxStreak: number } | undefined;
  createLogWithStreakSettlement(log: FocusSessionLog): { currentStreak: number; maxStreak: number };
}

function toConfig(row: SacredSeatConfigRow): SacredSeatConfig {
  return {
    sacredToken: row.sacredToken,
    reservationSignal: row.reservationSignal,
    defaultFocusDuration: row.defaultFocusDuration,
    regretWindowSeconds: row.regretWindowSeconds,
    currentStreak: row.currentStreak,
    maxStreak: row.maxStreak
  };
}

function toLog(row: FocusSessionLogRow): FocusSessionLog {
  return {
    id: row.id,
    type: row.type,
    startTime: row.startTime,
    endTime: row.endTime,
    targetDurationMinutes: row.targetDurationMinutes,
    actualDurationSeconds: row.actualDurationSeconds,
    status: row.status,
    focusContent: row.focusContent ?? undefined,
    failureReason: row.failureReason ?? undefined,
    note: row.note ?? undefined
  };
}

/** 神圣座位 SQLite 数据访问与原子日志结算边界。 */
export function createSacredSeatRepository(db: SqliteDatabasePort): SacredSeatRepository {
  const systemMeta = createSystemMetaRepository(db);

  function getConfig(): SacredSeatConfig | undefined {
    const row = db.prepare('SELECT * FROM sacred_seat_config WHERE id = 1').get() as SacredSeatConfigRow | undefined;
    return row ? toConfig(row) : undefined;
  }

  function updateConfig(config: SacredSeatConfig): SacredSeatConfig | undefined {
    db.prepare(`
      UPDATE sacred_seat_config SET
        sacredToken = @sacredToken, reservationSignal = @reservationSignal,
        defaultFocusDuration = @defaultFocusDuration, regretWindowSeconds = @regretWindowSeconds,
        currentStreak = @currentStreak, maxStreak = @maxStreak, updatedAt = datetime('now')
      WHERE id = 1
    `).run(config);
    return getConfig();
  }

  function getStreak(): { currentStreak: number; maxStreak: number } | undefined {
    const row = db.prepare('SELECT currentStreak, maxStreak FROM sacred_seat_config WHERE id = 1').get() as { currentStreak: number; maxStreak: number } | undefined;
    return row;
  }

  function resetStreak(): { currentStreak: number; maxStreak: number } {
    db.prepare("UPDATE sacred_seat_config SET currentStreak = 0, updatedAt = datetime('now') WHERE id = 1").run();
    return getStreak() ?? { currentStreak: 0, maxStreak: 0 };
  }

  function listLogs(limit?: number): FocusSessionLog[] {
    const rows = (limit === undefined
      ? db.prepare('SELECT * FROM focus_session_logs ORDER BY startTime DESC').all()
      : db.prepare('SELECT * FROM focus_session_logs ORDER BY startTime DESC LIMIT @limit').all({ limit })) as FocusSessionLogRow[];
    return rows.map(toLog);
  }

  function importLogs(logs: any[]): { importedCount: number; totalLogs: number } {
    const upsert = db.prepare(`
      INSERT INTO focus_session_logs (id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status, focusContent, failureReason, note)
      VALUES (@id, @type, @startTime, @endTime, @targetDurationMinutes, @actualDurationSeconds, @status, @focusContent, @failureReason, @note)
      ON CONFLICT(id) DO UPDATE SET type=excluded.type, startTime=excluded.startTime, endTime=excluded.endTime,
        targetDurationMinutes=excluded.targetDurationMinutes, actualDurationSeconds=excluded.actualDurationSeconds,
        status=excluded.status, focusContent=excluded.focusContent, failureReason=excluded.failureReason, note=excluded.note
    `);
    let importedCount = 0;
    db.transaction((items: any[]) => {
      for (const log of items) {
        if (!log.id || !log.type || !log.startTime || !log.status) continue;
        upsert.run({
          id: String(log.id), type: String(log.type), startTime: String(log.startTime),
          endTime: String(log.endTime || log.startTime), targetDurationMinutes: Number(log.targetDurationMinutes || 0),
          actualDurationSeconds: Number(log.actualDurationSeconds || 0), status: String(log.status),
          focusContent: log.focusContent ? String(log.focusContent) : null,
          failureReason: log.failureReason ? String(log.failureReason) : null,
          note: log.note ? String(log.note) : null
        });
        importedCount++;
      }
    })(logs);
    const total = db.prepare('SELECT COUNT(*) as count FROM focus_session_logs').get() as { count: number } | undefined;
    return { importedCount, totalLogs: total?.count || 0 };
  }

  function getHeatmap(days: number): DailyFocusHeatmapItem[] {
    let query = `SELECT substr(startTime, 1, 10) AS date, COUNT(*) AS totalSessions,
      SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS successCount,
      SUM(CASE WHEN status = 'REGRET' THEN 1 ELSE 0 END) AS regretCount,
      SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END) AS failCount,
      SUM(actualDurationSeconds) AS totalSeconds FROM focus_session_logs WHERE type = 'FOCUS'`;
    const params: { days?: number } = {};
    if (days > 0) { query += " AND substr(startTime, 1, 10) >= date('now', '-' || @days || ' days')"; params.days = days; }
    query += ' GROUP BY substr(startTime, 1, 10) ORDER BY date ASC';
    return (db.prepare(query).all(params) as DailyFocusHeatmapRow[]).map(row => ({
      date: row.date, totalSessions: Number(row.totalSessions || 0), successCount: Number(row.successCount || 0),
      regretCount: Number(row.regretCount || 0), failCount: Number(row.failCount || 0), totalSeconds: Number(row.totalSeconds || 0)
    }));
  }

  function getLogById(id: string): FocusSessionLog | undefined {
    const row = db.prepare('SELECT * FROM focus_session_logs WHERE id = ?').get(id) as FocusSessionLogRow | undefined;
    return row ? toLog(row) : undefined;
  }

  function createLogWithStreakSettlement(log: FocusSessionLog): { currentStreak: number; maxStreak: number } {
    let currentStreak = 0;
    let maxStreak = 0;
    const insert = db.prepare(`INSERT INTO focus_session_logs (id,type,startTime,endTime,targetDurationMinutes,actualDurationSeconds,status,focusContent,failureReason,note)
      VALUES (@id,@type,@startTime,@endTime,@targetDurationMinutes,@actualDurationSeconds,@status,@focusContent,@failureReason,@note)`);
    db.transaction(() => {
      insert.run({ ...log, targetDurationMinutes: log.targetDurationMinutes || 0, actualDurationSeconds: log.actualDurationSeconds || 0,
        focusContent: log.focusContent || null, failureReason: log.failureReason || null, note: log.note || null });
      const streak = getStreak();
      currentStreak = streak?.currentStreak ?? 0;
      maxStreak = streak?.maxStreak ?? 0;
      if (log.type === 'FOCUS') {
        const duration = Number(log.actualDurationSeconds || 0);
        if (log.status === 'SUCCESS' && duration >= 60) { currentStreak++; if (currentStreak > maxStreak) maxStreak = currentStreak; }
        else if (log.status === 'FAIL') currentStreak = 0;
        db.prepare("UPDATE sacred_seat_config SET currentStreak=@currentStreak,maxStreak=@maxStreak,updatedAt=datetime('now') WHERE id=1")
          .run({ currentStreak, maxStreak });
      }
      systemMeta.incrementSystemRevision(new Date().toISOString());
    })();
    return { currentStreak, maxStreak };
  }

  return { getConfig, updateConfig, resetStreak, listLogs, importLogs, getHeatmap, getLogById, getStreak, createLogWithStreakSettlement };
}
