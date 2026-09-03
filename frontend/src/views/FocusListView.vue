<script setup lang="ts">
import { ref, onMounted } from 'vue';
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

function handleRowClick(node: FocusNode) {
  // 单击行：快速切换【点亮 / 熄灭】
  store.toggleNodeLit(node.id);
}

function handleRowDoubleClick(node: FocusNode) {
  // 双击行：唤出国策【详细规范卡】
  activeSpecNode.value = node;
  isSpecModalOpen.value = true;
}

function handleSaveNode(nodeData: FocusNode) {
  store.updateNode(nodeData.id, nodeData);
}

function handleDeleteNode(node: FocusNode) {
  store.deleteNode(node.id);
  isSpecModalOpen.value = false;
}

onMounted(() => {
  store.fetchTree();
});
</script>

<template>
  <div class="list-view-container">
    <!-- 顶部状态栏与行动按钮 -->
    <div class="list-header">
      <div class="header-title">
        <h1 class="page-title">国策列表管理</h1>
        <span class="count-tag font-mono">{{ store.nodes.length }} 节点</span>
      </div>
      <div class="header-actions">
        <button class="btn-tool btn-restore-order" @click="store.fetchTree" title="清除临时改动，恢复已保存的基准序列">
          还原基准顺序
        </button>
        <button class="btn-tool btn-save-order" @click="store.syncTree" title="保存当前排序为默认基准">
          保存当前排序
        </button>
      </div>
    </div>

    <!-- 国策表格主体 -->
    <div class="node-table-wrapper">
      <div class="table-header">
        <span class="col-handle">#</span>
        <span class="col-code">代码</span>
        <span class="col-name">国策名称</span>
        <span class="col-group">分组</span>
        <span class="col-time">触发场景</span>
        <span class="col-cur-level">当前等级</span>
        <span class="col-max-level">最高等级</span>
        <span class="col-status">状态</span>
      </div>

      <div class="table-body">
        <div 
          v-for="node in store.nodes" 
          :key="node.id"
          class="table-row"
          :class="{ 'row-lit': node.isLit, 'row-frozen': node.isFrozen }"
          @click="handleRowClick(node)"
          @dblclick="handleRowDoubleClick(node)"
          :title="`单击切换点亮 · 双击查看详细规范卡`"
        >
          <!-- 极简拖拽色块手柄 -->
          <div class="col-handle">
            <span 
              class="color-handle-bar"
              :style="{ backgroundColor: node.groupId ? getGroupThemeColor(node.groupId) : 'var(--border-color)' }"
            ></span>
          </div>

          <!-- 国策纯文本代码 -->
          <div class="col-code font-mono">{{ node.code }}</div>

          <!-- 国策名称 -->
          <div class="col-name">{{ node.name }}</div>

          <!-- 分组：明确指出具体所属分组名称，无分组则标为独立国策 -->
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

          <!-- 当前等级（独立居中） -->
          <div class="col-cur-level font-mono">
            <span class="level-badge" :class="{ 'is-max': node.level >= node.maxLevel }">
              Lv.{{ node.level }}
            </span>
          </div>

          <!-- 最高等级（独立居中） -->
          <div class="col-max-level font-mono">
            <span class="max-level-text">Lv.{{ node.maxLevel }}</span>
          </div>

          <!-- 状态列：极简 CSS 纯色指示微点与文字 -->
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
        </div>
      </div>
    </div>

    <!-- 详细规范卡模态窗 -->
    <NodeSpecModal
      :is-open="isSpecModalOpen"
      :node="activeSpecNode"
      :is-edit-mode="false"
      @close="isSpecModalOpen = false"
      @edit="editingNode = $event; isSpecModalOpen = false; isNodeEditModalOpen = true"
      @delete="handleDeleteNode"
    />

    <!-- 编辑国策模态窗 -->
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
  max-width: 1060px;
  margin: 0 auto;
  width: 100%;
  gap: 16px;
  box-sizing: border-box;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  font-size: 16px;
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
}

.btn-tool {
  padding: 6px 16px;
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

.btn-restore-order:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-save-order {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
  border: 1px solid transparent;
}

.btn-save-order:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
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
  grid-template-columns: 32px 70px 1.4fr 1.2fr 1fr 80px 80px 100px;
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

.table-row {
  display: grid;
  grid-template-columns: 32px 70px 1.4fr 1.2fr 1fr 80px 80px 100px;
  padding: 12px 16px;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  transition: all var(--transition-fast);
  cursor: pointer;
  user-select: none;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:hover {
  background: var(--bg-card-hover);
}

/* 点亮态整行浅绿微透 */
.table-row.row-lit {
  background: rgba(16, 185, 129, 0.07);
}

[data-theme="dark"] .table-row.row-lit {
  background: rgba(16, 185, 129, 0.12);
}

.table-row.row-frozen {
  background: rgba(56, 189, 248, 0.05);
}

.color-handle-bar {
  display: inline-block;
  width: 4px;
  height: 20px;
  border-radius: 2px;
  transition: background-color var(--transition-fast);
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

/* 等级列：严格居中对齐 */
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

/* 状态指示列：严格居中，配极简微点 */
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
</style>
