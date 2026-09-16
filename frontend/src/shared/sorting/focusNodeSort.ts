import type { FocusNode } from '../../types';

export type SortableKey = 'code' | 'name' | 'group' | 'time' | 'level' | 'maxLevel' | 'status';

export interface SortRuleItem {
  key: SortableKey;
  dir: 'asc' | 'desc';
}

/**
 * 按既有多列规则排序国策节点。
 * 没有排序规则时特意返回原数组引用，以保留列表视图的当前优化语义。
 */
export function applyCompoundFocusNodeSort(
  list: FocusNode[],
  sortStack: SortRuleItem[],
  getGroupName: (groupId: string | null) => string
): FocusNode[] {
  if (sortStack.length === 0) return list;

  return [...list].sort((a, b) => {
    for (const rule of sortStack) {
      let cmp = 0;
      if (rule.key === 'time') {
        // 核心时间排序规则：“按触发查询时，没有时间的场景放在最下面”
        const aHas = Boolean(a.hasExactTime && a.timeValueMinutes != null);
        const bHas = Boolean(b.hasExactTime && b.timeValueMinutes != null);
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        if (aHas && bHas) {
          cmp = (a.timeValueMinutes! - b.timeValueMinutes!) * (rule.dir === 'asc' ? 1 : -1);
        } else {
          cmp = (a.triggerScene || '').localeCompare(b.triggerScene || '', 'zh-CN') * (rule.dir === 'asc' ? 1 : -1);
        }
      } else if (rule.key === 'code') {
        cmp = a.code.localeCompare(b.code, undefined, { numeric: true }) * (rule.dir === 'asc' ? 1 : -1);
      } else if (rule.key === 'name') {
        cmp = a.name.localeCompare(b.name, 'zh-CN') * (rule.dir === 'asc' ? 1 : -1);
      } else if (rule.key === 'group') {
        const aGrp = getGroupName(a.groupId);
        const bGrp = getGroupName(b.groupId);
        cmp = aGrp.localeCompare(bGrp, 'zh-CN') * (rule.dir === 'asc' ? 1 : -1);
      } else if (rule.key === 'level') {
        cmp = (a.level - b.level) * (rule.dir === 'asc' ? 1 : -1);
      } else if (rule.key === 'maxLevel') {
        cmp = (a.maxLevel - b.maxLevel) * (rule.dir === 'asc' ? 1 : -1);
      } else if (rule.key === 'status') {
        const aVal = a.isLit ? 1 : 0;
        const bVal = b.isLit ? 1 : 0;
        cmp = (aVal - bVal) * (rule.dir === 'asc' ? 1 : -1);
      }
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}
