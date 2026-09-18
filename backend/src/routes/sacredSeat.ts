import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { createSacredSeatRepository } from '../repositories/sacredSeatRepository.js';
import { createSystemMetaRepository } from '../repositories/systemMetaRepository.js';
import { createSacredSeatService } from '../services/sacredSeatService.js';
import { getErrorDetails } from '../utils/errorDetails.js';

const router = Router();
const service = createSacredSeatService({
  sacredSeatRepository: createSacredSeatRepository(db),
  systemMetaRepository: createSystemMetaRepository(db)
});

// 获取神圣座位配置
router.get('/config', (_req: Request, res: Response) => {
  const config = service.getConfig();
  if (!config) {
    return res.status(404).json({ error: 'Config not found' });
  }
  res.json(config);
});

// 更新神圣座位配置
router.put('/config', (req: Request, res: Response) => {
  const { sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak } = req.body;

  const current = service.getConfig();
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

  const updated = service.updateConfig({
    sacredToken: sacredToken !== undefined ? String(sacredToken).trim() : current.sacredToken,
    reservationSignal: reservationSignal !== undefined ? String(reservationSignal).trim() : current.reservationSignal,
    defaultFocusDuration: defaultFocusDuration !== undefined ? Number(defaultFocusDuration) : current.defaultFocusDuration,
    regretWindowSeconds: regretWindowSeconds !== undefined ? Number(regretWindowSeconds) : current.regretWindowSeconds,
    currentStreak: targetCurrentStreak,
    maxStreak: targetMaxStreak
  });

  if (!updated) {
    return res.status(500).json({ error: 'Failed to retrieve updated config' });
  }

  res.json(updated);
});

// 主链连胜手动清零（违规二次确认后触发）
router.post('/reset-streak', (_req: Request, res: Response) => {
  const updated = service.resetStreak();
  res.json(updated);
});

// 获取流水日志 (P2-006: limit 范围规范与防御)
router.get('/logs', (req: Request, res: Response) => {
  const rawLimit = parseInt(String(req.query.limit || '50'), 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 500);

  res.json(service.listLogs(limit));
});

// 导出全部专注流水日志
router.get('/logs/export', (_req: Request, res: Response) => {
  res.json(service.exportLogs());
});

// 批量导入专注流水日志 (支持增量合并与覆盖更新)
router.post('/logs/import', (req: Request, res: Response) => {
  const body = req.body;
  const rawLogs = Array.isArray(body) ? body : (Array.isArray(body?.logs) ? body.logs : null);

  if (!rawLogs || !Array.isArray(rawLogs)) {
    return res.status(400).json({ error: 'Invalid payload: expected an array of logs or an object with a logs array' });
  }

  try {
    const summary = service.importLogs(rawLogs);
    res.json({
      success: true,
      ...summary
    });
  } catch (err: unknown) {
    console.error('Failed to import focus session logs', err);
    res.status(500).json({ error: 'Failed to import logs: ' + getErrorDetails(err) });
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

  res.json(service.getHeatmap(days));
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

  try {
    const saved = service.saveLog({
      id, type, startTime, endTime, targetDurationMinutes, actualDurationSeconds, status,
      focusContent, failureReason, note
    });

    res.status(saved.idempotent ? 200 : 201).json(saved);
  } catch (err: any) {
    console.error('Failed to save session log:', err);
    res.status(500).json({
      error: 'LOG_SAVE_FAILED',
      message: '专注会话日志保存失败',
      details: getErrorDetails(err)
    });
  }
});

export default router;
