import { Router, Request, Response } from 'express';
import { db, incrementSystemRevision } from '../db.js';
import { createSacredSeatRepository } from '../repositories/sacredSeatRepository.js';

const router = Router();
const repository = createSacredSeatRepository(db);

// 获取神圣座位配置
router.get('/config', (_req: Request, res: Response) => {
  const config = repository.getConfig();
  if (!config) {
    return res.status(404).json({ error: 'Config not found' });
  }
  res.json(config);
});

// 更新神圣座位配置
router.put('/config', (req: Request, res: Response) => {
  const { sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak } = req.body;

  const current = repository.getConfig();
  if (!current) {
    return res.status(404).json({ error: 'Config not found' });
  }

  // 边界与类型强校验 (P2-006)
  if (sacredToken !== undefined && (typeof sacredToken !== 'string' || sacredToken.trim().length === 0 || sacredToken.length > 128)) {
    return res.status(400).json({ error: 'INVALID_SACRED_TOKEN', message: '神圣图腾指令必须为 1-128 字符的有效字符串' });
  }

  if (reservationSignal !== undefined && (typeof reservationSignal !== 'string' || reservationSignal.trim().length === 0 || reservationSignal.length > 128)) {
    return res.status(400).json({ error: 'INVALID_RESERVATION_SIGNAL', message: '预约暗号必须为 1-128 字符的有效字符串' });
  }

  if (defaultFocusDuration !== undefined) {
    const dur = Number(defaultFocusDuration);
    if (!Number.isInteger(dur) || dur < 1 || dur > 1440) {
      return res.status(400).json({ error: 'INVALID_FOCUS_DURATION', message: '默认专注时长必须为 1 到 1440 分钟之间的整数' });
    }
  }

  if (regretWindowSeconds !== undefined) {
    const reg = Number(regretWindowSeconds);
    if (!Number.isInteger(reg) || reg < 5 || reg > 300) {
      return res.status(400).json({ error: 'INVALID_REGRET_WINDOW', message: '后悔药窗口时长必须为 5 到 300 秒之间的整数' });
    }
  }

  const targetCurrentStreak = currentStreak !== undefined ? Number(currentStreak) : current.currentStreak;
  const targetMaxStreak = maxStreak !== undefined ? Number(maxStreak) : current.maxStreak;

  if (currentStreak !== undefined && (!Number.isInteger(targetCurrentStreak) || targetCurrentStreak < 0)) {
    return res.status(400).json({ error: 'INVALID_CURRENT_STREAK', message: '当前连胜天数必须为非负整数' });
  }

  if (maxStreak !== undefined && (!Number.isInteger(targetMaxStreak) || targetMaxStreak < 0)) {
    return res.status(400).json({ error: 'INVALID_MAX_STREAK', message: '最大连胜天数必须为非负整数' });
  }

  if (targetCurrentStreak > targetMaxStreak) {
    return res.status(400).json({ error: 'INVALID_STREAK_RANGE', message: '当前连胜不能超过历史最大连胜' });
  }

  const updated = repository.updateConfig({
    sacredToken: sacredToken !== undefined ? String(sacredToken).trim() : current.sacredToken,
    reservationSignal: reservationSignal !== undefined ? String(reservationSignal).trim() : current.reservationSignal,
    defaultFocusDuration: defaultFocusDuration !== undefined ? Number(defaultFocusDuration) : current.defaultFocusDuration,
    regretWindowSeconds: regretWindowSeconds !== undefined ? Number(regretWindowSeconds) : current.regretWindowSeconds,
    currentStreak: targetCurrentStreak,
    maxStreak: targetMaxStreak
  });

  incrementSystemRevision();
  if (!updated) {
    return res.status(500).json({ error: 'Failed to retrieve updated config' });
  }

  res.json(updated);
});

// 主链连胜手动清零（违规二次确认后触发）
router.post('/reset-streak', (_req: Request, res: Response) => {
  const updated = repository.resetStreak();
  incrementSystemRevision();
  res.json(updated);
});

// 获取流水日志 (P2-006: limit 范围规范与防御)
router.get('/logs', (req: Request, res: Response) => {
  const rawLimit = parseInt(String(req.query.limit || '50'), 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 500);

  res.json(repository.listLogs(limit));
});

// 导出全部专注流水日志
router.get('/logs/export', (_req: Request, res: Response) => {
  const logs = repository.listLogs();

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

  try {
    const summary = repository.importLogs(rawLogs);
    incrementSystemRevision();
    res.json({
      success: true,
      ...summary
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

  res.json(repository.getHeatmap(days));
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

  // P1-005 幂等性支持：如果该日志 ID 已存在，直接返回已有记录及当前连胜状态，不重复记账或抛出唯一键冲突
  const existing = repository.getLogById(id);
  if (existing) {
    const currentConfig = repository.getStreak();
    return res.status(200).json({
      logId: existing.id,
      status: existing.status,
      currentStreak: currentConfig?.currentStreak ?? 0,
      maxStreak: currentConfig?.maxStreak ?? 0,
      idempotent: true
    });
  }

  try {
    const streak = repository.createLogWithStreakSettlement({
      id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status,
      focusContent, failureReason, note
    });

    res.status(201).json({
      logId: id,
      status,
      ...streak
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
