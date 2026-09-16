import { ref } from 'vue';
import {
  applyCompoundFocusNodeSort,
  type SortableKey,
  type SortRuleItem
} from '../../shared/sorting/focusNodeSort';
import type { FocusNode } from '../../types';

export type { SortableKey, SortRuleItem } from '../../shared/sorting/focusNodeSort';

/** Vue 状态层：只维护用户选择的多列排序规则。 */
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
    return applyCompoundFocusNodeSort(list, sortStack.value, getGroupName);
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
