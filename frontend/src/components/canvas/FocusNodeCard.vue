<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { FocusNode } from '../../types';

const props = defineProps<{
  id: string;
  data: FocusNode & { 
    isEditMode?: boolean;
    activeConnectingHandle?: { nodeId: string; anchor: string } | null;
  };
  selected?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-lit', id: string): void;
  (e: 'open-spec', node: FocusNode): void;
  (e: 'handle-click', payload: { nodeId: string; anchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' }): void;
}>();

// 状态纯色指示点类（杜绝 Emoji，极简专业设计）
const statusDotClass = computed(() => {
  if (props.data.isFrozen) return 'dot-frozen';
  return props.data.isLit ? 'dot-lit' : 'dot-unlit';
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

function isHandleActive(anchor: string) {
  const active = props.data.activeConnectingHandle;
  return active && active.nodeId === props.id && active.anchor === anchor;
}

function handleAnchorClick(anchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT', e: MouseEvent) {
  if (!props.data.isEditMode) return;
  e.stopPropagation();
  emit('handle-click', { nodeId: props.id, anchor });
}
</script>

<template>
  <div class="focus-node-card" :class="[cardClass, { 'nodrag': !data.isEditMode }]">
    <!-- 四向磁吸连接锚点（单桩支持连接，杜绝图层叠放倒置） -->
    <Handle 
      id="top" 
      type="source" 
      :position="Position.Top" 
      class="node-handle handle-top" 
      :class="{ 'is-connecting-active': isHandleActive('TOP') }"
      @click="handleAnchorClick('TOP', $event)"
    />

    <Handle 
      id="bottom" 
      type="source" 
      :position="Position.Bottom" 
      class="node-handle handle-bottom" 
      :class="{ 'is-connecting-active': isHandleActive('BOTTOM') }"
      @click="handleAnchorClick('BOTTOM', $event)"
    />

    <Handle 
      id="left" 
      type="source" 
      :position="Position.Left" 
      class="node-handle handle-left" 
      :class="{ 'is-connecting-active': isHandleActive('LEFT') }"
      @click="handleAnchorClick('LEFT', $event)"
    />

    <Handle 
      id="right" 
      type="source" 
      :position="Position.Right" 
      class="node-handle handle-right" 
      :class="{ 'is-connecting-active': isHandleActive('RIGHT') }"
      @click="handleAnchorClick('RIGHT', $event)"
    />

    <!-- 卡片上部：代号与等级状态 -->
    <div class="card-header">
      <span class="node-code font-mono">{{ data.code }}</span>
      <div class="node-meta">
        <span class="status-indicator-dot" :class="statusDotClass"></span>
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
  border: 1.5px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  user-select: none;
  position: relative;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
  cursor: pointer;
}

.focus-node-card.is-edit-mode {
  cursor: grab;
}

.focus-node-card.is-edit-mode:active {
  cursor: grabbing;
}

/* 点亮态：根据用户需求，整张卡片背景变为清新浅绿色，在浅色/深色模式下都极其醒目 */
.focus-node-card.is-lit {
  border-color: #10B981 !important;
  background: #E6F4EA;
  box-shadow: 0 2px 14px rgba(16, 185, 129, 0.28);
}

.focus-node-card.is-lit .node-name {
  color: #064E3B;
  font-weight: 700;
}

.focus-node-card.is-lit .node-code {
  color: #047857;
  font-weight: 800;
}

.focus-node-card.is-lit .trigger-time-tag {
  color: #047857;
  opacity: 0.85;
}

.focus-node-card.is-lit .level-tag {
  color: #065F46;
}

/* 深色模式下的点亮态定制 */
[data-theme="dark"] .focus-node-card.is-lit {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(6, 78, 59, 0.35) 100%) !important;
  border-color: #34D399 !important;
  box-shadow: 0 0 18px rgba(16, 185, 129, 0.4) !important;
}

[data-theme="dark"] .focus-node-card.is-lit .node-name {
  color: #ECFDF5;
}

[data-theme="dark"] .focus-node-card.is-lit .node-code {
  color: #6EE7B7;
}

[data-theme="dark"] .focus-node-card.is-lit .trigger-time-tag {
  color: #A7F3D0;
}

[data-theme="dark"] .focus-node-card.is-lit .level-tag {
  color: #6EE7B7;
}

/* 熄灭待命态 */
.focus-node-card.is-unlit {
  border-color: var(--border-color);
  background: var(--bg-card);
  opacity: 0.88;
}

.focus-node-card.is-unlit .node-name {
  color: var(--text-secondary);
}

.focus-node-card.is-unlit .node-code {
  color: var(--text-muted);
}

/* 冻结水密隔舱态 */
.focus-node-card.is-frozen {
  border: 1.5px dashed var(--color-frozen);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
  background: rgba(56, 189, 248, 0.05);
}

.focus-node-card.is-frozen .node-code {
  color: var(--color-frozen);
}

/* 选中高亮 */
.focus-node-card.is-selected {
  border-width: 2px !important;
  border-color: var(--color-gold) !important;
  box-shadow: 0 0 18px rgba(245, 158, 11, 0.45) !important;
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
  gap: 6px;
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
  border-top: 1px solid rgba(125, 125, 125, 0.12);
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
  width: 9px !important;
  height: 9px !important;
  background: var(--bg-card) !important;
  border: 2px solid var(--text-muted) !important;
  border-radius: 50% !important;
  opacity: 0;
  /* 使用 scale 而非覆盖 transform，保证始终严格以中心点为原点对称放大 */
  transition: opacity 0.15s ease, border-color 0.15s ease, scale 0.15s ease, box-shadow 0.15s ease;
  z-index: 20;
  cursor: crosshair;
}

/* 编辑模式下或悬停时暴露锚点 */
.focus-node-card:hover .node-handle,
.focus-node-card.is-edit-mode .node-handle {
  opacity: 1;
}

.node-handle:hover {
  border-color: var(--color-lit) !important;
  scale: 1.45;
  box-shadow: 0 0 8px var(--color-lit);
}

/* 正在连线激活中的锚点 */
.node-handle.is-connecting-active {
  border-color: var(--color-gold) !important;
  background: var(--color-gold) !important;
  scale: 1.6;
  box-shadow: 0 0 12px var(--color-gold);
  animation: pulse-active 1s infinite alternate;
}

@keyframes pulse-active {
  from { scale: 1.4; }
  to { scale: 1.75; }
}
</style>
