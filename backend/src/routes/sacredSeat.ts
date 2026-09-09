import { Router, Request, Response } from 'express';
import { db, incrementSystemRevision } from '../db.js';
import type {
  SacredSeatConfig,
  FocusSessionLog,
  DailyFocusHeatmapItem,
  SacredSeatConfigRow,
  FocusSessionLogRow,
  DailyFocusHeatmapRow
} from '../types.js';

const router = Router();

// 获取神圣座位配置
router.get('/config', (_req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM sacred_seat_config WHERE id = 1').get() as SacredSeatConfigRow | undefined;
  if (!row) {
    return res.status(404).json({ error: 'Config not found' });
  }

  const config: SacredSeatConfig = {
    sacredToken: row.sacredToken,
    reservationSignal: row.reservationSignal,
    defaultFocusDuration: row.defaultFocusDuration,
    regretWindowSeconds: row.regretWindowSeconds,
    currentStreak: row.currentStreak,
    maxStreak: row.maxStreak
  };

  res.json(config);
});

// 更新神圣座位配置
router.put('/config', (req: Request, res: Response) => {
  const { sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak } = req.body;

  const current = db.prepare('SELECT * FROM sacred_seat_config WHERE id = 1').get() as SacredSeatConfigRow | undefined;
  if (!current) {
    return res.status(404).json({ error: 'Config not found' });
  }

  db.prepare(`
    UPDATE sacred_seat_config
    SET sacredToken = @sacredToken,
        reservationSignal = @reservationSignal,
        defaultFocusDuration = @defaultFocusDuration,
        regretWindowSeconds = @regretWindowSeconds,
        currentStreak = @currentStreak,
        maxStreak = @maxStreak,
        updatedAt = datetime('now')
    WHERE id = 1
  `).run({
    sacredToken: sacredToken ?? current.sacredToken,
    reservationSignal: reservationSignal ?? current.reservationSignal,
    defaultFocusDuration: defaultFocusDuration ?? current.defaultFocusDuration,
    regretWindowSeconds: regretWindowSeconds ?? current.regretWindowSeconds,
    currentStreak: currentStreak ?? current.currentStreak,
    maxStreak: maxStreak ?? current.maxStreak
  });

  incrementSystemRevision();

  const updated = db.prepare('SELECT * FROM sacred_seat_config WHERE id = 1').get() as SacredSeatConfigRow | undefined;
  if (!updated) {
    return res.status(500).json({ error: 'Failed to retrieve updated config' });
  }

  res.json({
    sacredToken: updated.sacredToken,
    reservationSignal: updated.reservationSignal,
    defaultFocusDuration: updated.defaultFocusDuration,
    regretWindowSeconds: updated.regretWindowSeconds,
    currentStreak: updated.currentStreak,
    maxStreak: updated.maxStreak
  });
});

// 主链连胜手动清零（违规二次确认后触发）
router.post('/reset-streak', (_req: Request, res: Response) => {
  db.prepare(`
    UPDATE sacred_seat_config
    SET currentStreak = 0,
        updatedAt = datetime('now')
    WHERE id = 1
  `).run();

  incrementSystemRevision();

  const updated = db.prepare('SELECT currentStreak, maxStreak FROM sacred_seat_config WHERE id = 1').get() as Pick<SacredSeatConfigRow, 'currentStreak' | 'maxStreak'> | undefined;
  res.json({ currentStreak: updated?.currentStreak ?? 0, maxStreak: updated?.maxStreak ?? 0 });
});

// 获取流水日志
router.get('/logs', (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const rows = db.prepare(`
    SELECT * FROM focus_session_logs
    ORDER BY startTime DESC
    LIMIT @limit
  `).all({ limit }) as FocusSessionLogRow[];

  const logs: FocusSessionLog[] = rows.map(r => ({
    id: r.id,
    type: r.type,
    startTime: r.startTime,
    endTime: r.endTime,
    targetDurationMinutes: r.targetDurationMinutes,
    actualDurationSeconds: r.actualDurationSeconds,
    status: r.status,
    focusContent: r.focusContent ?? undefined,
    failureReason: r.failureReason ?? undefined,
    note: r.note ?? undefined
  }));

  res.json(logs);
});

// 导出全部专注流水日志
router.get('/logs/export', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT * FROM focus_session_logs
    ORDER BY startTime DESC
  `).all() as FocusSessionLogRow[];

  const logs: FocusSessionLog[] = rows.map(r => ({
    id: r.id,
    type: r.type,
    startTime: r.startTime,
    endTime: r.endTime,
    targetDurationMinutes: r.targetDurationMinutes,
    actualDurationSeconds: r.actualDurationSeconds,
    status: r.status,
    focusContent: r.focusContent ?? undefined,
    failureReason: r.failureReason ?? undefined,
    note: r.note ?? undefined
  }));

  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    dataType: 'FOCUS_SESSION_LOGS',
    total: logs.length,
    logs
  });
});

// 批量导入专注流水日志 (支持增量合并与覆盖更新)
router.post('/logs/import', (req: Request, res: Response) => {
  const body = req.body;
  const rawLogs = Array.isArray(body) ? body : (Array.isArray(body?.logs) ? body.logs : null);

  if (!rawLogs || !Array.isArray(rawLogs)) {
    return res.status(400).json({ error: 'Invalid payload: expected an array of logs or an object with a logs array' });
  }

  const upsertStmt = db.prepare(`
    INSERT INTO focus_session_logs (id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status, focusContent, failureReason, note)
    VALUES (@id, @type, @startTime, @endTime, @targetDurationMinutes, @actualDurationSeconds, @status, @focusContent, @failureReason, @note)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      startTime = excluded.startTime,
      endTime = excluded.endTime,
      targetDurationMinutes = excluded.targetDurationMinutes,
      actualDurationSeconds = excluded.actualDurationSeconds,
      status = excluded.status,
      focusContent = excluded.focusContent,
      failureReason = excluded.failureReason,
      note = excluded.note
  `);

  let importedCount = 0;

  const importTx = db.transaction((logs: any[]) => {
    for (const log of logs) {
      if (!log.id || !log.type || !log.startTime || !log.status) {
        continue;
      }
      upsertStmt.run({
        id: String(log.id),
        type: String(log.type),
        startTime: String(log.startTime),
        endTime: String(log.endTime || log.startTime),
        targetDurationMinutes: Number(log.targetDurationMinutes || 0),
        actualDurationSeconds: Number(log.actualDurationSeconds || 0),
        status: String(log.status),
        focusContent: log.focusContent ? String(log.focusContent) : null,
        failureReason: log.failureReason ? String(log.failureReason) : null,
        note: log.note ? String(log.note) : null
      });
      importedCount += 1;
    }
  });

  try {
    importTx(rawLogs);
    incrementSystemRevision();
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM focus_session_logs').get() as { count: number } | undefined;
    res.json({
      success: true,
      importedCount,
      totalLogs: totalRow?.count || 0
    });
  } catch (err: any) {
    console.error('Failed to import focus session logs', err);
    res.status(500).json({ error: 'Failed to import logs: ' + err.message });
  }
});

// 获取全周期专注热力图日级聚合数据 (支持 ?days=365 或全部)
router.get('/heatmap', (req: Request, res: Response) => {
  let days = 365;
  if (req.query.days === 'all' || req.query.days === '0') {
    days = 0;
  } else if (req.query.days !== undefined) {
    const parsed = parseInt(String(req.query.days), 10);
    days = isNaN(parsed) || parsed < 0 ? 365 : Math.min(parsed, 3650);
  }

  let query = `
    SELECT 
      substr(startTime, 1, 10) AS date,
      COUNT(*) AS totalSessions,
      SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS successCount,
      SUM(CASE WHEN status = 'REGRET' THEN 1 ELSE 0 END) AS regretCount,
      SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END) AS failCount,
      SUM(actualDurationSeconds) AS totalSeconds
    FROM focus_session_logs
    WHERE type = 'FOCUS'
  `;

  const params: any = {};
  if (days > 0) {
    query += ` AND substr(startTime, 1, 10) >= date('now', '-' || @days || ' days')`;
    params.days = days;
  }

  query += ` GROUP BY substr(startTime, 1, 10) ORDER BY date ASC`;

  const rows = db.prepare(query).all(params) as DailyFocusHeatmapRow[];

  const items: DailyFocusHeatmapItem[] = rows.map(r => ({
    date: r.date,
    totalSessions: Number(r.totalSessions || 0),
    successCount: Number(r.successCount || 0),
    regretCount: Number(r.regretCount || 0),
    failCount: Number(r.failCount || 0),
    totalSeconds: Number(r.totalSeconds || 0)
  }));

  res.json(items);
});

const VALID_LOG_TYPES = ['FOCUS', 'RESERVATION'] as const;
const VALID_LOG_STATUSES = ['SUCCESS', 'FAIL', 'REGRET'] as const;

// 提交专注会话日志并自动结算主链连胜 (D-6 防御校验与原子事务保障)
router.post('/logs', (req: Request, res: Response) => {
  const { id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status, focusContent, failureReason, note } = req.body;

  if (!id || !type || !startTime || !endTime || !status) {
    return res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS', message: 'Missing required session log fields' });
  }

  if (!VALID_LOG_TYPES.includes(type)) {
    return res.status(400).json({ error: 'INVALID_TYPE', message: `Invalid session type: ${type}. Expected FOCUS or RESERVATION.` });
  }

  if (!VALID_LOG_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'INVALID_STATUS', message: `Invalid session status: ${status}. Expected SUCCESS, FAIL, or REGRET.` });
  }

  const insertStmt = db.prepare(`
    INSERT INTO focus_session_logs (id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status, focusContent, failureReason, note)
    VALUES (@id, @type, @startTime, @endTime, @targetDurationMinutes, @actualDurationSeconds, @status, @focusContent, @failureReason, @note)
  `);

  let newCurrentStreak = 0;
  let newMaxStreak = 0;

  try {
    const logTx = db.transaction(() => {
      insertStmt.run({
        id,
        type,
        startTime,
        endTime,
        targetDurationMinutes: targetDurationMinutes || 0,
        actualDurationSeconds: actualDurationSeconds || 0,
        status,
        focusContent: focusContent || null,
        failureReason: failureReason || null,
        note: note || null
      });

      // 结算连胜状态
      const currentConfig = db.prepare('SELECT currentStreak, maxStreak FROM sacred_seat_config WHERE id = 1').get() as Pick<SacredSeatConfigRow, 'currentStreak' | 'maxStreak'> | undefined;
      newCurrentStreak = currentConfig?.currentStreak ?? 0;
      newMaxStreak = currentConfig?.maxStreak ?? 0;

      if (type === 'FOCUS') {
        if (status === 'SUCCESS') {
          newCurrentStreak += 1;
          if (newCurrentStreak > newMaxStreak) {
            newMaxStreak = newCurrentStreak;
          }
        } else if (status === 'FAIL') {
          // 发生违规，主链清零
          newCurrentStreak = 0;
        }
        // REGRET 状态下不计入违规，不增加连胜，保持原值

        db.prepare(`
          UPDATE sacred_seat_config
          SET currentStreak = @newCurrentStreak,
              maxStreak = @newMaxStreak,
              updatedAt = datetime('now')
          WHERE id = 1
        `).run({ newCurrentStreak, newMaxStreak });
      }

      incrementSystemRevision();
    });

    logTx();

    res.status(201).json({
      logId: id,
      status,
      currentStreak: newCurrentStreak,
      maxStreak: newMaxStreak
    });
  } catch (err: any) {
    console.error('Failed to save session log:', err);
    res.status(500).json({
      error: 'LOG_SAVE_FAILED',
      message: '专注会话日志保存失败',
      details: err?.message || String(err)
    });
  }
});

export default router;
