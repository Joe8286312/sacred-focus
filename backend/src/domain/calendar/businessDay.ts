/**
 * 自控业务日策略。
 *
 * 默认以 UTC+8 的凌晨 04:00 作为业务日分界。该模块是纯计算能力，
 * 不依赖 SQLite、Express、环境变量或进程级状态。
 */
export function getBusinessDay(date: Date = new Date(), timezoneOffsetHours = 8): string {
  // 时区偏移 + 业务日分界：UTC+8 的 04:00 等价于 UTC 时间加 4 小时后的零点。
  const netShiftMs = (timezoneOffsetHours - 4) * 60 * 60 * 1000;
  const shifted = new Date(date.getTime() + netShiftMs);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 计算给定业务日的前一个自然业务日。 */
export function getPreviousBusinessDay(businessDay: string): string {
  const [y, m, d] = businessDay.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  const prevY = date.getUTCFullYear();
  const prevM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const prevD = String(date.getUTCDate()).padStart(2, '0');
  return `${prevY}-${prevM}-${prevD}`;
}
