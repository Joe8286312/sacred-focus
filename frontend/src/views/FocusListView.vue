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

// 搜索与过滤
const searchQuery = ref('');

// 排序状态机：基准顺序 (BASELINE) 与临时多维排序
type SortRule = 'BASELINE' | 'TIME_ASC' | 'GROUP' | 'LEVEL_DESC' | 'STATUS_LIT';
const sortRule = ref<SortRule>('BASELINE');

// 本地可拖拽工作列表
const localNodeList = ref<FocusNode[]>([]);
const isOrderDirty = ref(false);

// 拖拽手柄状态
const draggedIndex = ref<number | null>(null);
const dropTargetIndex = ref<number | null>(null);
const dropPosition = ref<'top' | 'bottom' | null>(null);

// 每次进入页面时，无论之前如何临时排序，均自动复原并以基准持久化顺序呈现（Zero-Friction Auto-Reset）
onMounted(async () => {
  sortRule.value = 'BASELINE';
  isOrderDirty.value = false;
  await store.fetchTree();
  localNodeList.value = [...store.nodes];
});

// 监听 store.nodes 变化，若处于基准模式且未发生脏拖拽，则同步
watch(
  () => store.nodes,
  (newNodes) => {
    if (sortRule.value === 'BASELINE' && !isOrderDirty.value) {
      localNodeList.value = [...newNodes];
    }
  },
  { deep: true }
);

// 辅助解析时间值（分钟数）
function parseTimeMinutes(triggerTime: string): number {
  if (!triggerTime) return 9999;
  const match = triggerTime.match(/(\d{1,2})[:：](\d{2})/);
  if (match) {
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }
  if (triggerTime.includes('全天候')) return 0;
  if (triggerTime.includes('闹钟') || triggerTime.includes('晨') || triggerTime.includes('起爆')) return 360; // 06:00 左右
  if (triggerTime.includes('洗面') || triggerTime.includes('起燥')) return 370;
  if (triggerTime.includes('夜') || triggerTime.includes('寝') || triggerTime.includes('睡')) return 1380; // 23:00
  return 1000;
}

// 计算最终展示列表
const displayNodes = computed(() => {
  let list = [...localNodeList.value];

  // 1. 搜索过滤
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(n => 
      n.code.toLowerCase().includes(q) || 
      n.name.toLowerCase().includes(q) ||
      (n.triggerTime && n.triggerTime.toLowerCase().includes(q))
    );
  }

  // 2. 临时多维排序规则应用
  if (sortRule.value === 'TIME_ASC') {
    list.sort((a, b) => parseTimeMinutes(a.triggerTime) - parseTimeMinutes(b.triggerTime));
  } else if (sortRule.value === 'GROUP') {
    list.sort((a, b) => {
      if (!a.groupId && b.groupId) return 1;
      if (a.groupId && !b.groupId) return -1;
      if (!a.groupId && !b.groupId) return 0;
      return (a.groupId || '').localeCompare(b.groupId || '');
    });
  } else if (sortRule.value === 'LEVEL_DESC') {
    list.sort((a, b) => b.level - a.level || b.maxLevel - a.maxLevel);
  } else if (sortRule.value === 'STATUS_LIT') {
    list.sort((a, b) => (b.isLit ? 1 : 0) - (a.isLit ? 1 : 0));
  }

  return list;
});

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

// -----------------------------------------------------------------------------
// 排序操作：还原基准 vs 保存当前排序
// -----------------------------------------------------------------------------

function restoreBaseline() {
  sortRule.value = 'BASELINE';
  isOrderDirty.value = false;
  localNodeList.value = [...store.nodes];
}

async function saveCurrentOrder() {
  const currentIds = displayNodes.value.map(n => n.id);
  await store.saveReorder(currentIds);
  sortRule.value = 'BASELINE';
  isOrderDirty.value = false;
}

function switchSortRule(rule: SortRule) {
  if (sortRule.value === rule) {
    sortRule.value = 'BASELINE';
  } else {
    sortRule.value = rule;
  }
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
  sortRule.value = 'BASELINE'; // 拖动后即转为用户自定义物理序列
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

function handleRowClick(node: FocusNode, e: MouseEvent) {
  // 若点击在手柄、操作按钮上，不触发点亮
  const target = e.target as HTMLElement;
  if (target.closest('.col-handle') || target.closest('.col-actions')) return;
  store.toggleNodeLit(node.id);
}

function handleRowDoubleClick(node: FocusNode, e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest('.col-handle') || target.closest('.col-actions')) return;
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
  } else {
    store.addNode(nodeData);
  }
  isNodeEditModalOpen.value = false;
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
    <!-- 顶部状态栏与核心行动项 -->
    <div class="list-header">
      <div class="header-left">
        <h1 class="page-title">国策列表管理</h1>
        <span class="count-tag font-mono">{{ displayNodes.length }} / {{ store.nodes.length }} 节点</span>
      </div>

      <div class="header-actions">
        <!-- 还原基准顺序：离开页面自动复原，也可页内一键还原 -->
        <button 
          class="btn-tool btn-restore-order"
          :class="{ 'is-active': sortRule !== 'BASELINE' || isOrderDirty }"
          @click="restoreBaseline" 
          title="恢复数据库中已持久化的默认基准物理排列"
        >
          还原基准顺序
        </button>

        <!-- 保存当前排序：固化为新的永久基准 -->
        <button 
          class="btn-tool btn-save-order"
          :class="{ 'is-highlight': sortRule !== 'BASELINE' || isOrderDirty }"
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

    <!-- 检索工具栏与临时动态排序维度切换药丸 -->
    <div class="toolbar-strip">
      <div class="search-box">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="按代码、名称或场景快速检索..." 
        />
        <button v-if="searchQuery" class="btn-clear-search" @click="searchQuery = ''">✕</button>
      </div>

      <!-- 临时多维排序药丸 -->
      <div class="sort-pills">
        <span class="sort-pills-label">视图排序:</span>
        <button 
          class="sort-pill" 
          :class="{ active: sortRule === 'BASELINE' && !isOrderDirty }"
          @click="restoreBaseline"
        >
          基准默认
        </button>
        <button 
          class="sort-pill" 
          :class="{ active: sortRule === 'TIME_ASC' }"
          @click="switchSortRule('TIME_ASC')"
        >
          按触发时间
        </button>
        <button 
          class="sort-pill" 
          :class="{ active: sortRule === 'GROUP' }"
          @click="switchSortRule('GROUP')"
        >
          按所属分组
        </button>
        <button 
          class="sort-pill" 
          :class="{ active: sortRule === 'LEVEL_DESC' }"
          @click="switchSortRule('LEVEL_DESC')"
        >
          按等级降序
        </button>
        <button 
          class="sort-pill" 
          :class="{ active: sortRule === 'STATUS_LIT' }"
          @click="switchSortRule('STATUS_LIT')"
        >
          已点亮置顶
        </button>
      </div>
    </div>

    <!-- 临时排序提示条 -->
    <div v-if="sortRule !== 'BASELINE' || isOrderDirty" class="temporary-sort-banner">
      <span class="banner-text">
        当前为临时排布视图（{{ sortRule === 'TIME_ASC' ? '按触发时间' : sortRule === 'GROUP' ? '按所属分组' : sortRule === 'LEVEL_DESC' ? '按等级降序' : sortRule === 'STATUS_LIT' ? '已点亮置顶' : '手动调整未保存' }}）· 离开此页面将自动复原为基准顺序
      </span>
      <div class="banner-actions">
        <button class="btn-banner-restore" @click="restoreBaseline">立即还原</button>
        <button class="btn-banner-save" @click="saveCurrentOrder">保存为基准</button>
      </div>
    </div>

    <!-- 国策表格主体 -->
    <div class="node-table-wrapper">
      <div class="table-header">
        <span class="col-handle" title="按住最左侧色块手柄拖动即可重排">#</span>
        <span class="col-code">代码</span>
        <span class="col-name">国策名称</span>
        <span class="col-group">分组</span>
        <span class="col-time">触发场景</span>
        <span class="col-cur-level">当前等级</span>
        <span class="col-max-level">最高等级</span>
        <span class="col-status">状态</span>
        <span class="col-actions">操作</span>
      </div>

      <div class="table-body">
        <div v-if="displayNodes.length === 0" class="empty-list-hint">
          {{ searchQuery ? '未检索到匹配的国策，可尝试其他关键词' : '暂无国策节点，点击右上角【+ 新建国策】即可开启' }}
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
          @click="handleRowClick(node, $event)"
          @dblclick="handleRowDoubleClick(node, $event)"
          @dragover="onRowDragOver(idx, $event)"
          @dragleave="onRowDragLeave(idx)"
          @drop="onRowDrop(idx)"
          :title="`单击行切换点亮 · 双击查阅规范卡 · 拖动手柄调整排序`"
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

          <!-- 触发场景描述 -->
          <div class="col-time">{{ node.triggerTime || '全天候' }}</div>

          <!-- 当前等级（居中） -->
          <div class="col-cur-level font-mono">
            <span class="level-badge" :class="{ 'is-max': node.level >= node.maxLevel }">
              Lv.{{ node.level }}
            </span>
          </div>

          <!-- 最高等级（居中） -->
          <div class="col-max-level font-mono">
            <span class="max-level-text">Lv.{{ node.maxLevel }}</span>
          </div>

          <!-- 状态指示列：极简 CSS 纯色指示微点与文字 -->
          <div class="col-status" @click.stop="store.toggleNodeLit(node.id)">
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

          <!-- 行级操作项 -->
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

.header-actions {
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

/* 检索与排序药丸工具栏 */
.toolbar-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  min-width: 240px;
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

.sort-pills {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sort-pills-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-right: 2px;
}

.sort-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sort-pill:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sort-pill.active {
  background: var(--text-primary);
  color: var(--bg-primary);
  border-color: transparent;
  font-weight: 600;
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
  grid-template-columns: 32px 70px 1.4fr 1.1fr 1fr 75px 75px 85px 95px;
  padding: 10px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
  align-items: center;
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
  grid-template-columns: 32px 70px 1.4fr 1.1fr 1fr 75px 75px 85px 95px;
  padding: 11px 16px;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  transition: background-color var(--transition-fast);
  cursor: pointer;
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

/* 行级操作按钮 */
.col-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
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
