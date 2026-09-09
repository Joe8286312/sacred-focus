// -----------------------------------------------------------------------------
// 自控工程学：业务日计算 (以凌晨 04:00 为分界)
// -----------------------------------------------------------------------------

// 计算当前所属的业务日（以每天凌晨 04:00 为新一天开始，早于 4 点归属前一日）
export function getBusinessDay(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() - 4 * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 计算前一个业务日
export function getPreviousBusinessDay(businessDay: string): string {
  const [y, m, d] = businessDay.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const prevY = date.getFullYear();
  const prevM = String(date.getMonth() + 1).padStart(2, '0');
  const prevD = String(date.getDate()).padStart(2, '0');
  return `${prevY}-${prevM}-${prevD}`;
}
