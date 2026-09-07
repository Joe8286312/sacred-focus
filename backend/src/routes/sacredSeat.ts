import { Router, Request, Response } from 'express';
import { db } from '../db.js';
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

  res.status(201).json({
    logId: id,
    status,
    currentStreak: newCurrentStreak,
    maxStreak: newMaxStreak
  });
});

export default router;
