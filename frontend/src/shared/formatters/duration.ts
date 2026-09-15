/**
 * 紧凑时长格式化。
 *
 * 这是无状态的共享展示能力：不依赖 Vue、DOM、网络或领域 store。
 * 输出规则和历史 `utils/time.ts` 入口完全兼容。
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
