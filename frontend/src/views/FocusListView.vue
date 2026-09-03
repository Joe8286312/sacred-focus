<script setup lang="ts">
import { onMounted } from 'vue';
import { useFocusTreeStore } from '../stores/focusTree.js';

const store = useFocusTreeStore();

onMounted(() => {
  store.fetchTree();
});
</script>

<template>
  <div class="list-view-container">
    <div class="list-header">
      <div class="header-title">
        <span>国策列表管理</span>
        <span class="count-tag font-mono">{{ store.nodes.length }} 节点</span>
      </div>
      <div class="header-actions">
        <button class="btn-sm">🔄 还原基准顺序</button>
        <button class="btn-sm active">💾 保存当前排序</button>
      </div>
    </div>

    <div class="node-table-wrapper">
      <div class="table-header">
        <span class="col-handle">#</span>
        <span class="col-code">代码</span>
        <span class="col-name">国策名称</span>
        <span class="col-group">分组</span>
        <span class="col-time">触发场景</span>
        <span class="col-level">等级</span>
        <span class="col-status">状态</span>
      </div>

      <div class="table-body">
        <div 
          v-for="node in store.nodes" 
          :key="node.id"
          class="table-row"
          :class="{ 'row-lit': node.isLit }"
          @dblclick="store.toggleNodeLit(node.id)"
        >
          <div class="col-handle">
            <span class="color-handle-bar"></span>
          </div>
          <div class="col-code font-mono">{{ node.code }}</div>
          <div class="col-name">{{ node.name }}</div>
          <div class="col-group">
            <span class="group-tag">{{ node.groupId ? '分组组员' : '独立国策' }}</span>
          </div>
          <div class="col-time">{{ node.triggerTime }}</div>
          <div class="col-level font-mono">Lv.{{ node.level }}/{{ node.maxLevel }}</div>
          <div class="col-status">
            <span class="status-indicator">{{ node.isLit ? '🟢' : '⚪' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list-view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px 24px;
  max-width: 1024px;
  margin: 0 auto;
  width: 100%;
  gap: 16px;
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
  font-size: 16px;
  font-weight: 700;
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

.btn-sm {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.btn-sm.active {
  border-color: var(--color-lit);
  color: var(--color-lit);
}

.node-table-wrapper {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.table-header {
  display: grid;
  grid-template-columns: 36px 60px 1.5fr 1fr 1.2fr 80px 60px;
  padding: 10px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
}

.table-body {
  overflow-y: auto;
}

.table-row {
  display: grid;
  grid-template-columns: 36px 60px 1.5fr 1fr 1.2fr 80px 60px;
  padding: 12px 16px;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  transition: background-color var(--transition-fast);
  cursor: pointer;
}

.table-row:hover {
  background: var(--bg-card-hover);
}

.table-row.row-lit {
  background: rgba(0, 240, 255, 0.03);
}

.color-handle-bar {
  display: inline-block;
  width: 4px;
  height: 18px;
  background: var(--color-lit);
  border-radius: 2px;
}

.col-code {
  font-weight: 700;
  color: var(--color-lit);
}

.col-name {
  font-weight: 600;
}

.group-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.col-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.status-indicator {
  font-size: 14px;
}
</style>
