<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useFocusTreeStore } from '../stores/focusTree';
import NodeSpecModal from '../components/canvas/NodeSpecModal.vue';
import NodeEditModal from '../components/canvas/NodeEditModal.vue';
import type { FocusNode } from '../types';

const store = useFocusTreeStore();

// 规范卡与编辑弹窗状态
const isSpecModalOpen = ref(false);
const activeSpecNode = ref<FocusNode | null>(null);

const isNodeEditModalOpen = ref(false);
const editingNode = ref<FocusNode | null>(null);

// 搜索与分组过滤
const searchQuery = ref('');
const selectedGroupFilter = ref('');

// 类 Excel 复合排序规则栈（自然记忆先选的优先级高：第 1、第 2、第 3...）
export type SortableKey = 'code' | 'name' | 'group' | 'time' | 'level' | 'maxLevel' | 'status';
export interface SortRuleItem {
  key: SortableKey;
  dir: 'asc' | 'desc';
}
const sortStack = ref<SortRuleItem[]>([]);

// 本地可拖拽工作列表
const localNodeList = ref<FocusNode[]>([]);
const isOrderDirty = ref(false);

// 拖拽手柄状态
const draggedIndex = ref<number | null>(null);
const dropTargetIndex = ref<number | null>(null);
const dropPosition = ref<'top' | 'bottom' | null>(null);

// 每次进入页面时，无论之前如何临时排序，均自动复原并以基准持久化顺序呈现（Zero-Friction Auto-Reset）
onMounted(async () => {
  sortStack.value = [];
  selectedGroupFilter.value = '';
  searchQuery.value = '';
  isOrderDirty.value = false;
  await store.fetchTree();
  localNodeList.value = [...store.nodes];
});

// 监听 store.nodes 变化，若处于基准模式且未发生脏拖拽，则同步
watch(
  () => store.nodes,
  (newNodes) => {
    if (sortStack.value.length === 0 && !isOrderDirty.value) {
      localNodeList.value = [...newNodes];
    }
  },
  { deep: true }
);

function getGroupName(groupId: string | null): string {
  if (!groupId) return '独立国策';
  const group = store.groups.find(g => g.id === groupId);
  return group ? group.name : '独立国策';
}

function getGroupThemeColor(groupId: string | null): string {
  if (!groupId) return 'var(--text-muted)';
  const group = store.groups.find(g => g.id === groupId);
  return group?.themeColor || 'var(--color-lit)';
}

// 表头列点击切换排序：循环状态 (asc -> desc -> 取消)
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

// 计算最终展示列表
const displayNodes = computed(() => {
  let list = [...localNodeList.value];

  // 1. 分组下拉快速过滤
  if (selectedGroupFilter.value) {
    if (selectedGroupFilter.value === 'INDEPENDENT') {
      list = list.filter(n => !n.groupId);
    } else {
      list = list.filter(n => n.groupId === selectedGroupFilter.value);
    }
  }

  // 2. 搜索过滤（支持代码、名称、场景描述、触发时间、所属分组名称搜索）
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(n => 
      n.code.toLowerCase().includes(q) || 
      n.name.toLowerCase().includes(q) ||
      (n.triggerScene && n.triggerScene.toLowerCase().includes(q)) ||
      (n.triggerTime && n.triggerTime.toLowerCase().includes(q)) ||
      getGroupName(n.groupId).toLowerCase().includes(q)
    );
  }

  // 3. 类 Excel 多列复合排序应用
  if (sortStack.value.length > 0) {
    list.sort((a, b) => {
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

  return list;
});

// -----------------------------------------------------------------------------
// 排序操作：还原基准 vs 保存当前排序
// -----------------------------------------------------------------------------

function restoreBaseline() {
  sortStack.value = [];
  selectedGroupFilter.value = '';
  isOrderDirty.value = false;
  localNodeList.value = [...store.nodes];
}

async function saveCurrentOrder() {
  const currentIds = displayNodes.value.map(n => n.id);
  await store.saveReorder(currentIds);
  sortStack.value = [];
  isOrderDirty.value = false;
}

// -----------------------------------------------------------------------------
// HTML5 拖拽重排引擎 (仅手柄响应，物理隔离)
// -----------------------------------------------------------------------------

function onHandleDragStart(index: number, e: DragEvent) {
  draggedIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }
}

function onRowDragOver(index: number, e: DragEvent) {
  if (draggedIndex.value === null) return;
  e.preventDefault();
  dropTargetIndex.value = index;

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  dropPosition.value = e.clientY < mid ? 'top' : 'bottom';
}

function onRowDragLeave(index: number) {
  if (dropTargetIndex.value === index) {
    dropTargetIndex.value = null;
    dropPosition.value = null;
  }
}

function onRowDrop(index: number) {
  if (draggedIndex.value === null || draggedIndex.value === index) {
    onDragEnd();
    return;
  }

  // 处于临时过滤排序时，拖拽将自动应用并转入自定义微调基准态
  const currentArr = [...displayNodes.value];
  const itemToMove = currentArr.splice(draggedIndex.value, 1)[0];
  let targetIdx = index;
  if (dropPosition.value === 'bottom') {
    targetIdx += 1;
  }
  if (targetIdx > draggedIndex.value) {
    targetIdx -= 1;
  }

  currentArr.splice(targetIdx, 0, itemToMove);
  localNodeList.value = currentArr;
  sortStack.value = []; // 拖动后即转为用户自定义物理基准序列
  isOrderDirty.value = true;
  onDragEnd();
}

function onDragEnd() {
  draggedIndex.value = null;
  dropTargetIndex.value = null;
  dropPosition.value = null;
}

// -----------------------------------------------------------------------------
// 行级点击与生命周期操作
// -----------------------------------------------------------------------------

function handleRowDoubleClick(node: FocusNode, e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest('.col-handle') || target.closest('.col-actions') || target.closest('.col-status')) return;
  activeSpecNode.value = node;
  isSpecModalOpen.value = true;
}

function openCreateModal() {
  editingNode.value = null;
  isNodeEditModalOpen.value = true;
}

function openEditModal(node: FocusNode) {
  editingNode.value = { ...node };
  isNodeEditModalOpen.value = true;
}

function handleSaveNode(nodeData: FocusNode) {
  if (editingNode.value) {
    store.updateNode(nodeData.id, nodeData);
    const idx = localNodeList.value.findIndex(n => n.id === nodeData.id);
    if (idx !== -1) {
      localNodeList.value[idx] = { ...localNodeList.value[idx], ...nodeData };
    }
  } else {
    store.addNode(nodeData);
    localNodeList.value = localNodeList.value.filter(n => n.id !== nodeData.id);
    localNodeList.value.push(nodeData);
  }
  isNodeEditModalOpen.value = false;
  editingNode.value = null;
}

async function handleDeleteNode(node: FocusNode) {
  const confirmed = window.confirm(`严正确认：您确定要彻底删除国策【${node.name}】吗？\n所有以此节点为起终点的有向连线也将一并物理清理。此操作不可撤销。`);
  if (!confirmed) return;
  await store.deleteNode(node.id);
  localNodeList.value = localNodeList.value.filter(n => n.id !== node.id);
  isSpecModalOpen.value = false;
}
</script>

<template>
  <div class="list-view-container">
    <!-- 顶部状态栏 -->
    <div class="list-header">
      <div class="header-left">
        <h1 class="page-title">国策列表管理</h1>
        <span class="count-tag font-mono">{{ displayNodes.length }} / {{ store.nodes.length }} 节点</span>
      </div>
    </div>

    <!-- 检索工具栏与核心操作（下移并排补齐右侧空缺） -->
    <div class="toolbar-strip">
      <div class="toolbar-left">
        <div class="search-box">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="按代码、名称、场景或分组检索..." 
          />
          <button v-if="searchQuery" class="btn-clear-search" @click="searchQuery = ''">✕</button>
        </div>

        <!-- 分组筛选下拉框 -->
        <div class="group-filter-wrap">
          <select v-model="selectedGroupFilter" class="group-filter-select">
            <option value="">全部分组</option>
            <option value="INDEPENDENT">独立国策 (无外框)</option>
            <option v-for="g in store.groups" :key="g.id" :value="g.id">
              {{ g.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- 右侧核心操作项（从原顶部下移，与搜索工具栏并齐） -->
      <div class="toolbar-actions">
        <!-- 还原基准顺序：离开页面自动复原，也可页内一键还原 -->
        <button 
          class="btn-tool btn-restore-order"
          :class="{ 'is-active': sortStack.length > 0 || isOrderDirty || selectedGroupFilter || searchQuery }"
          @click="restoreBaseline" 
          title="恢复数据库中已持久化的默认基准物理排列"
        >
          还原基准顺序
        </button>

        <!-- 保存当前排序：固化为新的永久基准 -->
        <button 
          class="btn-tool btn-save-order"
          :class="{ 'is-highlight': sortStack.length > 0 || isOrderDirty }"
          @click="saveCurrentOrder" 
          title="将当前排列顺序持久化固化为新的默认基准"
        >
          保存当前排序
        </button>

        <!-- + 新建国策入口 -->
        <button class="btn-create-node" @click="openCreateModal">
          + 新建国策
        </button>
      </div>
    </div>

    <!-- 临时排序提示条 -->
    <div v-if="sortStack.length > 0 || isOrderDirty" class="temporary-sort-banner">
      <span class="banner-text">
        当前为类 Excel 复合排布视图（按先选优先级：
        <template v-for="(rule, idx) in sortStack" :key="rule.key">
          <strong class="sort-tag-item">
            {{ rule.key === 'code' ? '代码' : rule.key === 'name' ? '名称' : rule.key === 'group' ? '分组' : rule.key === 'time' ? '触发时间' : rule.key === 'level' ? '当前等级' : rule.key === 'maxLevel' ? '最高等级' : '状态' }}
            <span class="sort-dir-arrow">{{ rule.dir === 'asc' ? '▲' : '▼' }}</span>
          </strong>
          <span v-if="idx < sortStack.length - 1" class="sort-arrow-sep">→</span>
        </template>
        ）· 离开此页面将自动复原为基准顺序
      </span>
      <div class="banner-actions">
        <button class="btn-banner-restore" @click="restoreBaseline">立即还原</button>
        <button class="btn-banner-save" @click="saveCurrentOrder">保存为基准</button>
      </div>
    </div>

    <!-- 国策表格主体 -->
    <div class="node-table-wrapper">
      <div class="table-header">
        <span class="col-handle non-sortable" title="按住手柄即可拖动重排（仅无排序列时生效）">#</span>
        
        <div class="col-code sortable-header" @click="toggleColumnSort('code')" title="点击切换代码排序">
          <span>代码</span>
          <span class="sort-indicator" :class="{ 'is-active': getSortInfo('code') }">
            <svg v-if="getSortInfo('code')?.dir === 'asc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 4 4 18 20 18"></polygon></svg>
            <svg v-else-if="getSortInfo('code')?.dir === 'desc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 20 4 6 20 6"></polygon></svg>
            <span v-else class="sort-idle-icon">⇅</span>
            <sup v-if="getSortInfo('code') && sortStack.length > 1" class="priority-badge font-mono">{{ getSortPriority('code') }}</sup>
          </span>
        </div>

        <div class="col-name sortable-header" @click="toggleColumnSort('name')" title="点击切换名称排序">
          <span>国策名称</span>
          <span class="sort-indicator" :class="{ 'is-active': getSortInfo('name') }">
            <svg v-if="getSortInfo('name')?.dir === 'asc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 4 4 18 20 18"></polygon></svg>
            <svg v-else-if="getSortInfo('name')?.dir === 'desc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 20 4 6 20 6"></polygon></svg>
            <span v-else class="sort-idle-icon">⇅</span>
            <sup v-if="getSortInfo('name') && sortStack.length > 1" class="priority-badge font-mono">{{ getSortPriority('name') }}</sup>
          </span>
        </div>

        <div class="col-group sortable-header" @click="toggleColumnSort('group')" title="点击切换分组排序">
          <span>分组</span>
          <span class="sort-indicator" :class="{ 'is-active': getSortInfo('group') }">
            <svg v-if="getSortInfo('group')?.dir === 'asc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 4 4 18 20 18"></polygon></svg>
            <svg v-else-if="getSortInfo('group')?.dir === 'desc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 20 4 6 20 6"></polygon></svg>
            <span v-else class="sort-idle-icon">⇅</span>
            <sup v-if="getSortInfo('group') && sortStack.length > 1" class="priority-badge font-mono">{{ getSortPriority('group') }}</sup>
          </span>
        </div>

        <div class="col-time sortable-header" @click="toggleColumnSort('time')" title="点击切换时间排序（无特定时间的场景稳定置底）">
          <span>触发时间 / 场景</span>
          <span class="sort-indicator" :class="{ 'is-active': getSortInfo('time') }">
            <svg v-if="getSortInfo('time')?.dir === 'asc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 4 4 18 20 18"></polygon></svg>
            <svg v-else-if="getSortInfo('time')?.dir === 'desc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 20 4 6 20 6"></polygon></svg>
            <span v-else class="sort-idle-icon">⇅</span>
            <sup v-if="getSortInfo('time') && sortStack.length > 1" class="priority-badge font-mono">{{ getSortPriority('time') }}</sup>
          </span>
        </div>

        <div class="col-cur-level sortable-header center-header" @click="toggleColumnSort('level')" title="点击切换当前等级排序">
          <span>当前等级</span>
          <span class="sort-indicator" :class="{ 'is-active': getSortInfo('level') }">
            <svg v-if="getSortInfo('level')?.dir === 'asc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 4 4 18 20 18"></polygon></svg>
            <svg v-else-if="getSortInfo('level')?.dir === 'desc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 20 4 6 20 6"></polygon></svg>
            <span v-else class="sort-idle-icon">⇅</span>
            <sup v-if="getSortInfo('level') && sortStack.length > 1" class="priority-badge font-mono">{{ getSortPriority('level') }}</sup>
          </span>
        </div>

        <div class="col-max-level sortable-header center-header" @click="toggleColumnSort('maxLevel')" title="点击切换最高等级排序">
          <span>最高等级</span>
          <span class="sort-indicator" :class="{ 'is-active': getSortInfo('maxLevel') }">
            <svg v-if="getSortInfo('maxLevel')?.dir === 'asc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 4 4 18 20 18"></polygon></svg>
            <svg v-else-if="getSortInfo('maxLevel')?.dir === 'desc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 20 4 6 20 6"></polygon></svg>
            <span v-else class="sort-idle-icon">⇅</span>
            <sup v-if="getSortInfo('maxLevel') && sortStack.length > 1" class="priority-badge font-mono">{{ getSortPriority('maxLevel') }}</sup>
          </span>
        </div>

        <div class="col-status sortable-header center-header" @click="toggleColumnSort('status')" title="点击切换状态排序">
          <span>状态</span>
          <span class="sort-indicator" :class="{ 'is-active': getSortInfo('status') }">
            <svg v-if="getSortInfo('status')?.dir === 'asc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 4 4 18 20 18"></polygon></svg>
            <svg v-else-if="getSortInfo('status')?.dir === 'desc'" viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="12 20 4 6 20 6"></polygon></svg>
            <span v-else class="sort-idle-icon">⇅</span>
            <sup v-if="getSortInfo('status') && sortStack.length > 1" class="priority-badge font-mono">{{ getSortPriority('status') }}</sup>
          </span>
        </div>

        <span class="col-actions header-actions-col">操作</span>
      </div>

      <div class="table-body">
        <div v-if="displayNodes.length === 0" class="empty-list-hint">
          {{ searchQuery || selectedGroupFilter ? '未检索到匹配的国策，可尝试重置筛选或关键词' : '暂无国策节点，点击右上角【+ 新建国策】即可开启' }}
        </div>

        <div 
          v-for="(node, idx) in displayNodes" 
          :key="node.id"
          class="table-row"
          :class="{ 
            'row-lit': node.isLit, 
            'row-frozen': node.isFrozen,
            'is-dragging': draggedIndex === idx,
            'drop-indicator-top': dropTargetIndex === idx && dropPosition === 'top',
            'drop-indicator-bottom': dropTargetIndex === idx && dropPosition === 'bottom'
          }"
          @dblclick="handleRowDoubleClick(node, $event)"
          @dragover="onRowDragOver(idx, $event)"
          @dragleave="onRowDragLeave(idx)"
          @drop="onRowDrop(idx)"
          :title="`双击查阅规范卡 · 拖动手柄调整排序`"
        >
          <!-- 极简拖拽色块手柄（仅手柄响应拖拽，物理绝对隔离） -->
          <div 
            class="col-handle"
            draggable="true"
            @dragstart="onHandleDragStart(idx, $event)"
            @dragend="onDragEnd"
            title="按住拖拽即可调整排列顺序"
          >
            <span 
              class="color-handle-bar"
              :style="{ backgroundColor: node.groupId ? getGroupThemeColor(node.groupId) : 'var(--border-color)' }"
            ></span>
          </div>

          <!-- 国策纯文本代码 -->
          <div class="col-code font-mono">{{ node.code }}</div>

          <!-- 国策名称 -->
          <div class="col-name">{{ node.name }}</div>

          <!-- 分组 -->
          <div class="col-group">
            <span 
              class="group-tag"
              :class="{ 'is-independent': !node.groupId }"
              :style="{
                borderColor: node.groupId ? `${getGroupThemeColor(node.groupId)}66` : 'var(--border-color)',
                color: node.groupId ? getGroupThemeColor(node.groupId) : 'var(--text-muted)'
              }"
            >
              {{ getGroupName(node.groupId) }}
            </span>
          </div>

          <!-- 触发时间 / 场景描述 -->
          <div class="col-time">
            <span v-if="node.triggerTime" class="exact-time-badge font-mono">{{ node.triggerTime }}</span>
            <span class="scene-desc-text" :class="{ 'is-dimmed': !node.triggerTime && node.triggerScene === '全天候' }">
              {{ node.triggerScene || node.triggerTime || '全天候' }}
            </span>
          </div>

          <!-- 当前等级（居中） -->
          <div class="col-cur-level font-mono">
            <span class="level-badge" :class="{ 'is-max': node.level > 0 && node.level >= node.maxLevel }">
              Lv.{{ node.level }}
            </span>
          </div>

          <!-- 最高等级（居中） -->
          <div class="col-max-level font-mono">
            <span class="max-level-text">Lv.{{ node.maxLevel }}</span>
          </div>

          <!-- 状态指示列：仅在此列点击响应点亮/待命切换 -->
          <div 
            class="col-status col-status-clickable" 
            @click.stop="store.toggleNodeLit(node.id)" 
            title="点击切换点亮/待命状态"
          >
            <span 
              class="status-indicator-dot" 
              :class="{
                'dot-frozen': node.isFrozen,
                'dot-lit': node.isLit && !node.isFrozen,
                'dot-unlit': !node.isLit && !node.isFrozen
              }"
            ></span>
            <span class="status-label font-mono">
              {{ node.isFrozen ? '冻结' : (node.isLit ? '已点亮' : '待命') }}
            </span>
          </div>

          <!-- 行级操作项（与表头绝对居中对齐） -->
          <div class="col-actions" @click.stop>
            <button class="btn-row-action btn-row-edit" @click="openEditModal(node)" title="编辑国策属性">
              修改
            </button>
            <button class="btn-row-action btn-row-delete" @click="handleDeleteNode(node)" title="删除国策及关联连线">
              删除
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- 详细规范卡模态窗 -->
    <NodeSpecModal
      :is-open="isSpecModalOpen"
      :node="activeSpecNode"
      :is-edit-mode="false"
      @close="isSpecModalOpen = false"
      @edit="openEditModal($event); isSpecModalOpen = false"
      @delete="handleDeleteNode"
    />

    <!-- 编辑/新建国策模态窗 -->
    <NodeEditModal
      :is-open="isNodeEditModalOpen"
      :node="editingNode"
      :groups="store.groups"
      @close="isNodeEditModalOpen = false"
      @save="handleSaveNode"
    />
  </div>
</template>

<style scoped>
.list-view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px 24px;
  max-width: 1080px;
  margin: 0 auto;
  width: 100%;
  gap: 14px;
  box-sizing: border-box;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.count-tag {
  font-size: 12px;
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}

.toolbar-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 320px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  flex: 1;
  color: var(--text-secondary);
}

.search-box input {
  background: transparent;
  border: none;
  outline: none;
  font-size: 12px;
  color: var(--text-primary);
  width: 100%;
}

.btn-clear-search {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}

.group-filter-wrap {
  display: flex;
  align-items: center;
}

.group-filter-select {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.group-filter-select:hover, .group-filter-select:focus {
  border-color: var(--border-focus);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-tool {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-restore-order {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.btn-restore-order.is-active {
  border-color: var(--text-primary);
  color: var(--text-primary);
  font-weight: 600;
}

.btn-save-order {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.btn-save-order.is-highlight {
  background: var(--text-primary);
  color: var(--bg-primary);
  border-color: transparent;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.btn-create-node {
  background: var(--text-primary);
  color: var(--bg-primary);
  border: 1px solid transparent;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.btn-create-node:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* 临时排序提示条 */
.temporary-sort-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: var(--radius-sm);
  padding: 6px 14px;
  font-size: 12px;
}

.banner-text {
  color: var(--text-primary);
  font-weight: 500;
}

.sort-tag-item {
  color: #10B981;
  font-weight: 600;
  margin: 0 2px;
}

.sort-dir-arrow {
  font-size: 10px;
  margin-left: 2px;
}

.sort-arrow-sep {
  color: var(--text-muted);
  margin: 0 4px;
}

.banner-actions {
  display: flex;
  gap: 8px;
}

.btn-banner-restore {
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-primary);
  cursor: pointer;
}

.btn-banner-save {
  background: var(--text-primary);
  color: var(--bg-primary);
  border: none;
  border-radius: var(--radius-sm);
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

/* 表格主体 */
.node-table-wrapper {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
}

.table-header {
  display: grid;
  grid-template-columns: 32px 70px 1.3fr 1fr 1.3fr 80px 80px 85px 115px;
  padding: 10px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
  align-items: center;
}

.sortable-header {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-fast);
}

.sortable-header:hover {
  color: var(--text-primary);
}

.sort-indicator {
  display: inline-flex;
  align-items: center;
  color: var(--text-muted);
  opacity: 0.5;
  transition: all var(--transition-fast);
}

.sortable-header:hover .sort-indicator {
  opacity: 0.9;
}

.sort-indicator.is-active {
  color: #10B981;
  opacity: 1;
  font-weight: 700;
}

.sort-idle-icon {
  font-size: 11px;
  line-height: 1;
}

.priority-badge {
  font-size: 10px;
  font-weight: 700;
  color: #10B981;
  margin-left: 2px;
}

.center-header {
  justify-content: center;
}

.header-actions-col {
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.non-sortable {
  cursor: default;
}

.table-body {
  overflow-y: auto;
}

.empty-list-hint {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
  font-size: 13px;
}

.table-row {
  display: grid;
  grid-template-columns: 32px 70px 1.3fr 1fr 1.3fr 80px 80px 85px 115px;
  padding: 11px 16px;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  transition: background-color var(--transition-fast);
  user-select: none;
  position: relative;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:hover {
  background: var(--bg-card-hover);
}

.table-row.row-lit {
  background: rgba(16, 185, 129, 0.07);
}

[data-theme="dark"] .table-row.row-lit {
  background: rgba(16, 185, 129, 0.12);
}

.table-row.row-frozen {
  background: rgba(56, 189, 248, 0.05);
}

/* 拖拽视觉反馈指示线 */
.table-row.is-dragging {
  opacity: 0.4;
  background: var(--bg-tertiary);
}

.table-row.drop-indicator-top::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--color-lit);
  box-shadow: 0 0 8px var(--color-lit);
  z-index: 20;
}

.table-row.drop-indicator-bottom::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--color-lit);
  box-shadow: 0 0 8px var(--color-lit);
  z-index: 20;
}

/* 拖拽手柄条 */
.col-handle {
  display: flex;
  align-items: center;
  cursor: grab;
  padding: 4px 2px;
}

.col-handle:active {
  cursor: grabbing;
}

.color-handle-bar {
  display: inline-block;
  width: 5px;
  height: 20px;
  border-radius: 2px;
  transition: transform 0.15s ease;
}

.col-handle:hover .color-handle-bar {
  transform: scaleX(1.4);
}

.col-code {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.table-row.row-lit .col-code {
  color: #10B981;
}

.col-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.col-group {
  display: flex;
  align-items: center;
}

.group-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  border: 1px solid;
  white-space: nowrap;
}

.group-tag.is-independent {
  border-color: var(--border-color);
  color: var(--text-muted);
  font-weight: 400;
}

.col-time {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exact-time-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: rgba(16, 185, 129, 0.12);
  color: #10B981;
  border: 1px solid rgba(16, 185, 129, 0.3);
  flex-shrink: 0;
}

.scene-desc-text {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-desc-text.is-dimmed {
  color: var(--text-muted);
  opacity: 0.6;
}

.col-cur-level,
.col-max-level {
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  font-size: 13px;
}

.level-badge {
  font-weight: 600;
  color: var(--text-primary);
}

.level-badge.is-max {
  color: var(--color-gold);
}

.max-level-text {
  color: var(--text-muted);
}

.col-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
}

.col-status-clickable {
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.col-status-clickable:hover {
  background: var(--bg-tertiary);
}

.status-indicator-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  transition: all 0.2s ease;
}

.status-indicator-dot.dot-lit {
  background: #10B981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.7);
}

.status-indicator-dot.dot-unlit {
  background: var(--text-muted);
  opacity: 0.5;
}

.status-indicator-dot.dot-frozen {
  background: #38BDF8;
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.7);
}

.status-label {
  color: var(--text-secondary);
}

.table-row.row-lit .status-label {
  color: #10B981;
  font-weight: 600;
}

/* 行级操作按钮：居中对齐表头“操作”文字 */
.col-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  align-items: center;
}

.btn-row-action {
  background: transparent;
  border: 1px solid var(--border-color);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-row-edit {
  color: var(--text-primary);
}

.btn-row-edit:hover {
  background: var(--bg-tertiary);
}

.btn-row-delete {
  color: #DC2626;
  border-color: rgba(220, 38, 38, 0.25);
}

.btn-row-delete:hover {
  background: rgba(220, 38, 38, 0.1);
}
</style>
