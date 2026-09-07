/**
 * 时间与时长格式化实用工具
 */

/**
 * 格式化紧凑时长 (专门用于顺水推舟等增量超额展示)
 * 规则：
 * - 仅展示非 0 的时间单位 (h, m, s)
 * - 正好 5 分钟 -> "5m"
 * - 5 分 12 秒 -> "5m12s"
 * - 1 小时零 2 秒 -> "1h2s"
 * - 1 小时整 -> "1h"
 * - 18 秒 -> "18s"
 * - 0 秒或负数 -> ""
 */
export function formatCompactDuration(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(seconds));
  if (totalSec <= 0) return '';

  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  let res = '';
  if (h > 0) res += `${h}h`;
  if (m > 0) res += `${m}m`;
  if (s > 0) res += `${s}s`;
  return res;
}
