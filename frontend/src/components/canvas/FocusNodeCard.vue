<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { FocusNode } from '../../types';

const props = defineProps<{
  id: string;
  data: FocusNode & { isEditMode?: boolean };
  selected?: boolean;
}>();

defineEmits<{
  (e: 'toggle-lit', id: string): void;
  (e: 'open-spec', node: FocusNode): void;
}>();

// 状态图标：严格仅用于全局状态指示
const statusIcon = computed(() => {
  if (props.data.isFrozen) return '❄️';
  return props.data.isLit ? '🟢' : '⚪';
});

// 状态边框类
const cardClass = computed(() => {
  return {
    'is-lit': props.data.isLit && !props.data.isFrozen,
    'is-unlit': !props.data.isLit && !props.data.isFrozen,
    'is-frozen': props.data.isFrozen,
    'is-selected': props.selected,
    'is-edit-mode': props.data.isEditMode
  };
});
</script>

<template>
  <div class="focus-node-card" :class="cardClass">
    <!-- 四向磁吸连接锚点 -->
    <Handle 
      id="top" 
      type="source" 
      :position="Position.Top" 
      class="node-handle handle-top" 
    />
    <Handle 
      id="target-top" 
      type="target" 
      :position="Position.Top" 
      class="node-handle handle-top" 
    />

    <Handle 
      id="bottom" 
      type="source" 
      :position="Position.Bottom" 
      class="node-handle handle-bottom" 
    />
    <Handle 
      id="target-bottom" 
      type="target" 
      :position="Position.Bottom" 
      class="node-handle handle-bottom" 
    />

    <Handle 
      id="left" 
      type="source" 
      :position="Position.Left" 
      class="node-handle handle-left" 
    />
    <Handle 
      id="target-left" 
      type="target" 
      :position="Position.Left" 
      class="node-handle handle-left" 
    />

    <Handle 
      id="right" 
      type="source" 
      :position="Position.Right" 
      class="node-handle handle-right" 
    />
    <Handle 
      id="target-right" 
      type="target" 
      :position="Position.Right" 
      class="node-handle handle-right" 
    />

    <!-- 卡片上部：代号与等级状态 -->
    <div class="card-header">
      <span class="node-code font-mono">{{ data.code }}</span>
      <div class="node-meta">
        <span class="status-indicator">{{ statusIcon }}</span>
        <span class="level-tag font-mono">Lv.{{ data.level }}/{{ data.maxLevel }}</span>
      </div>
    </div>

    <!-- 卡片中部：主名称 -->
    <div class="card-body">
      <div class="node-name" :title="data.name">{{ data.name }}</div>
    </div>

    <!-- 卡片下沿：触发场景/时间 -->
    <div class="card-footer">
      <span class="trigger-time-tag font-mono" :title="data.triggerTime">
        {{ data.triggerTime || '全天候' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.focus-node-card {
  width: 180px;
  height: 80px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  user-select: none;
  position: relative;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

/* 点亮态 */
.focus-node-card.is-lit {
  border-color: var(--color-lit);
  box-shadow: 0 0 14px var(--color-lit-glow);
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, var(--bg-card) 100%);
}

.focus-node-card.is-lit .node-name {
  color: var(--text-primary);
  font-weight: 700;
}

.focus-node-card.is-lit .node-code {
  color: var(--color-lit);
}

/* 熄灭待命态 */
.focus-node-card.is-unlit {
  border-color: var(--border-color);
  opacity: 0.82;
}

.focus-node-card.is-unlit .node-name {
  color: var(--text-secondary);
}

.focus-node-card.is-unlit .node-code {
  color: var(--text-muted);
}

/* 冻结水密隔舱态 */
.focus-node-card.is-frozen {
  border: 1px dashed var(--color-frozen);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
}

.focus-node-card.is-frozen .node-code {
  color: var(--color-frozen);
}

/* 选中高亮 */
.focus-node-card.is-selected {
  border-width: 2px;
  border-color: var(--color-gold) !important;
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.4) !important;
}

/* 卡片头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  line-height: 1;
}

.node-code {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.node-meta {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-indicator {
  font-size: 11px;
  line-height: 1;
}

.level-tag {
  font-size: 11px;
  color: var(--text-muted);
}

/* 卡片中部 */
.card-body {
  display: flex;
  align-items: center;
  overflow: hidden;
}

.node-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

/* 卡片下沿 */
.card-footer {
  display: flex;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 3px;
}

.trigger-time-tag {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 四向磁吸锚点 */
.node-handle {
  width: 8px !important;
  height: 8px !important;
  background: var(--bg-primary) !important;
  border: 2px solid var(--text-muted) !important;
  border-radius: 50% !important;
  opacity: 0;
  transition: opacity 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  z-index: 5;
}

/* 编辑模式下或悬停时暴露锚点 */
.focus-node-card:hover .node-handle,
.focus-node-card.is-edit-mode .node-handle {
  opacity: 1;
}

.node-handle:hover {
  border-color: var(--color-lit) !important;
  transform: scale(1.3);
  box-shadow: 0 0 6px var(--color-lit);
}
</style>
