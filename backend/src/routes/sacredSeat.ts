import { Router, Request, Response } from 'express';
import { db, incrementSystemRevision } from '../db.js';
import type { SacredSeatConfig, FocusSessionLog, DailyFocusHeatmapItem } from '../types.js';

const router = Router();

// 获取神圣座位配置
router.get('/config', (_req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM sacred_seat_config WHERE id = 1').get() as any;
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

  const current = db.prepare('SELECT * FROM sacred_seat_config WHERE id = 1').get() as any;
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

  const updated = db.prepare('SELECT * FROM sacred_seat_config WHERE id = 1').get() as any;
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

  const updated = db.prepare('SELECT currentStreak, maxStreak FROM sacred_seat_config WHERE id = 1').get() as any;
  res.json({ currentStreak: updated.currentStreak, maxStreak: updated.maxStreak });
});

// 获取流水日志
router.get('/logs', (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const rows = db.prepare(`
    SELECT * FROM focus_session_logs
    ORDER BY startTime DESC
    LIMIT @limit
  `).all({ limit }) as any[];

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
  `).all() as any[];

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
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM focus_session_logs').get() as any;
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
  const days = parseInt((req.query.days as string) || '365', 10);
  
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

  const rows = db.prepare(query).all(params) as any[];

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

// 提交专注会话日志并自动结算主链连胜
router.post('/logs', (req: Request, res: Response) => {
  const { id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status, focusContent, failureReason, note } = req.body;

  if (!id || !type || !startTime || !endTime || !status) {
    return res.status(400).json({ error: 'Missing required session log fields' });
  }

  const insertStmt = db.prepare(`
    INSERT INTO focus_session_logs (id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status, focusContent, failureReason, note)
    VALUES (@id, @type, @startTime, @endTime, @targetDurationMinutes, @actualDurationSeconds, @status, @focusContent, @failureReason, @note)
  `);

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
  const currentConfig = db.prepare('SELECT currentStreak, maxStreak FROM sacred_seat_config WHERE id = 1').get() as any;
  let newCurrentStreak = currentConfig.currentStreak;
  let newMaxStreak = currentConfig.maxStreak;

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

  res.status(201).json({
    logId: id,
    status,
    currentStreak: newCurrentStreak,
    maxStreak: newMaxStreak
  });
});

export default router;
