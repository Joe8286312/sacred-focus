// -----------------------------------------------------------------------------
// 自控工程学：业务日计算 (以东八区凌晨 04:00 为分界)
// -----------------------------------------------------------------------------

// 计算当前所属的业务日（以每天凌晨 04:00 为新一天开始，早于 4 点归属前一日）
// P3-LOG-03 治理：显式对齐东八区 (UTC+8) 并基于 UTC 时间戳计算，解耦宿主系统本地时区
export function getBusinessDay(date: Date = new Date(), timezoneOffsetHours = 8): string {
  // 东八区偏移 +8h，减去 04:00 业务日阈值 -4h，总相对 UTC 偏移量为 +(8 - 4) = +4h
  const netShiftMs = (timezoneOffsetHours - 4) * 60 * 60 * 1000;
  const shifted = new Date(date.getTime() + netShiftMs);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 计算前一个业务日
export function getPreviousBusinessDay(businessDay: string): string {
  const [y, m, d] = businessDay.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  const prevY = date.getUTCFullYear();
  const prevM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const prevD = String(date.getUTCDate()).padStart(2, '0');
  return `${prevY}-${prevM}-${prevD}`;
}
