import { ref } from 'vue';
import type { FocusNode } from '../types';

export type SortableKey = 'code' | 'name' | 'group' | 'time' | 'level' | 'maxLevel' | 'status';

export interface SortRuleItem {
  key: SortableKey;
  dir: 'asc' | 'desc';
}

export function useListSort() {
  const sortStack = ref<SortRuleItem[]>([]);

  function toggleColumnSort(key: SortableKey) {
    const existingIdx = sortStack.value.findIndex(item => item.key === key);
    if (existingIdx !== -1) {
      const currentDir = sortStack.value[existingIdx].dir;
      if (currentDir === 'asc') {
        sortStack.value[existingIdx].dir = 'desc';
      } else {
        sortStack.value.splice(existingIdx, 1);
      }
    } else {
      // 首次点击此列：追加至排序栈末尾（自动保证先选的优先级最高）
      sortStack.value.push({ key, dir: 'asc' });
    }
  }

  function getSortInfo(key: SortableKey): SortRuleItem | undefined {
    return sortStack.value.find(item => item.key === key);
  }

  function getSortPriority(key: SortableKey): number {
    return sortStack.value.findIndex(item => item.key === key) + 1;
  }

  function clearSort() {
    sortStack.value = [];
  }

  function applyCompoundSort(
    list: FocusNode[],
    getGroupName: (groupId: string | null) => string
  ): FocusNode[] {
    if (sortStack.value.length === 0) return list;

    return [...list].sort((a, b) => {
      for (const rule of sortStack.value) {
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

  return {
    sortStack,
    toggleColumnSort,
    getSortInfo,
    getSortPriority,
    clearSort,
    applyCompoundSort
  };
}
