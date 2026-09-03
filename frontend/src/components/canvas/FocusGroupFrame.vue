<script setup lang="ts">
import { ref, computed } from 'vue';
import { Handle, Position, useVueFlow } from '@vue-flow/core';
import type { FocusGroup } from '../../types';

const props = defineProps<{
  id: string;
  data: FocusGroup & { 
    isEditMode?: boolean;
    activeConnectingHandle?: { nodeId: string; anchor: string } | null;
  };
  selected?: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit-group', group: FocusGroup): void;
  (e: 'handle-click', payload: { nodeId: string; anchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' }): void;
  (e: 'resize-group', payload: { id: string; size: { width: number; height: number } }): void;
}>();

const { viewport } = useVueFlow();
const isResizing = ref(false);

// 主题色与外框尺寸
const themeColor = computed(() => props.data.themeColor || '#0284C7');

const frameStyle = computed(() => {
  const color = themeColor.value;
  return {
    borderColor: color,
    backgroundColor: `${color}0D`, // 5% 透明度背景
    width: `${props.data.size?.width || 360}px`,
    height: `${props.data.size?.height || 260}px`
  };
});

const headerStyle = computed(() => {
  const color = themeColor.value;
  return {
    backgroundColor: `${color}26`, // 15% 透明度
    borderBottomColor: `${color}4D`,
    color: color
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

// -----------------------------------------------------------------------------
// 自由拖拽调整尺寸 (Resize Engine)
// -----------------------------------------------------------------------------
function startResize(direction: 'br' | 'r' | 'b', e: MouseEvent | TouchEvent) {
  if (!props.data.isEditMode) return;
  e.stopPropagation();
  e.preventDefault();

  const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
  const startWidth = props.data.size?.width || 360;
  const startHeight = props.data.size?.height || 260;
  const currentZoom = viewport.value.zoom || 1;

  isResizing.value = true;

  function onPointerMove(moveEvent: MouseEvent | TouchEvent) {
    const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
    const clientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

    const deltaX = (clientX - startX) / currentZoom;
    const deltaY = (clientY - startY) / currentZoom;

    if (direction === 'br' || direction === 'r') {
      const newWidth = Math.max(240, Math.round(startWidth + deltaX));
      if (!props.data.size) props.data.size = { width: newWidth, height: startHeight };
      else props.data.size.width = newWidth;
    }
    if (direction === 'br' || direction === 'b') {
      const newHeight = Math.max(160, Math.round(startHeight + deltaY));
      if (!props.data.size) props.data.size = { width: startWidth, height: newHeight };
      else props.data.size.height = newHeight;
    }
  }

  function onPointerUp() {
    isResizing.value = false;
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
    if (props.data.size) {
      emit('resize-group', { id: props.id, size: { ...props.data.size } });
    }
  }

  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchmove', onPointerMove);
  window.addEventListener('touchend', onPointerUp);
}
</script>

<template>
  <div 
    class="focus-group-frame" 
    :style="frameStyle" 
    :class="{ 'is-selected': selected, 'is-edit-mode': data.isEditMode, 'is-resizing': isResizing }"
  >
    <!-- 分组四向连接锚点，支持全场景拓扑连线 (Group-to-Group, Group-to-Node, Node-to-Group) -->
    <Handle 
      id="top" 
      type="source" 
      :position="Position.Top" 
      class="group-handle handle-top" 
      :class="{ 'is-connecting-active': isHandleActive('TOP') }"
      @click="handleAnchorClick('TOP', $event)"
    />

    <Handle 
      id="bottom" 
      type="source" 
      :position="Position.Bottom" 
      class="group-handle handle-bottom" 
      :class="{ 'is-connecting-active': isHandleActive('BOTTOM') }"
      @click="handleAnchorClick('BOTTOM', $event)"
    />

    <Handle 
      id="left" 
      type="source" 
      :position="Position.Left" 
      class="group-handle handle-left" 
      :class="{ 'is-connecting-active': isHandleActive('LEFT') }"
      @click="handleAnchorClick('LEFT', $event)"
    />

    <Handle 
      id="right" 
      type="source" 
      :position="Position.Right" 
      class="group-handle handle-right" 
      :class="{ 'is-connecting-active': isHandleActive('RIGHT') }"
      @click="handleAnchorClick('RIGHT', $event)"
    />

    <!-- 分组标题栏 -->
    <div class="group-header" :style="headerStyle" @dblclick="$emit('edit-group', data)">
      <span class="group-title">{{ data.name }}</span>
      <span v-if="data.isEditMode" class="group-edit-hint">双击设置</span>
    </div>

    <!-- 实时调整尺寸尺寸标签指示 -->
    <div v-if="isResizing" class="resize-dimension-tag font-mono">
      {{ data.size?.width }} × {{ data.size?.height }} px
    </div>

    <!-- 编辑模式下的多向自由调整尺寸手柄 (支持右下角对角线拉伸、右边框拉宽、底边框拉高) -->
    <template v-if="data.isEditMode">
      <div 
        class="group-resizer group-resizer-br nodrag" 
        :style="{ borderColor: themeColor }"
        title="拖拽调整外框大小"
        @mousedown="startResize('br', $event)"
        @touchstart="startResize('br', $event)"
      ></div>
      <div 
        class="group-resizer group-resizer-r nodrag" 
        title="拖拽调整外框宽度"
        @mousedown="startResize('r', $event)"
        @touchstart="startResize('r', $event)"
      ></div>
      <div 
        class="group-resizer group-resizer-b nodrag" 
        title="拖拽调整外框高度"
        @mousedown="startResize('b', $event)"
        @touchstart="startResize('b', $event)"
      ></div>
    </template>
  </div>
</template>

<style scoped>
.focus-group-frame {
  border-radius: var(--radius-md);
  border: 1.5px dashed;
  box-sizing: border-box;
  position: relative;
  user-select: none;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
  /* 外框本体设为 none，内部空间不阻挡内部连线/画布点击 */
  pointer-events: none;
}

.focus-group-frame.is-selected {
  border-style: solid;
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.35);
}

.focus-group-frame.is-resizing {
  transition: none !important;
}

.group-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 6px 14px;
  border-top-left-radius: calc(var(--radius-md) - 2px);
  border-top-right-radius: calc(var(--radius-md) - 2px);
  border-bottom: 1px solid;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  cursor: grab;
  pointer-events: all;
}

.group-title {
  letter-spacing: 0.5px;
}

.group-edit-hint {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.7;
}

/* 分组锚点 */
.group-handle {
  width: 10px !important;
  height: 10px !important;
  background: var(--bg-card) !important;
  border: 2px solid var(--text-muted) !important;
  border-radius: 50% !important;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease, scale 0.15s ease, border-color 0.15s ease;
  z-index: 15;
  cursor: crosshair;
}

/* 仅在编辑模式下暴露锚点！展示模式下保持隐蔽 */
.focus-group-frame.is-edit-mode .group-handle {
  opacity: 0.6;
  pointer-events: all;
}

.focus-group-frame.is-edit-mode:hover .group-handle {
  opacity: 1;
}

.group-handle:hover {
  scale: 1.45;
  border-color: var(--color-gold) !important;
  box-shadow: 0 0 8px var(--color-gold);
}

.group-handle.is-connecting-active {
  border-color: var(--color-gold) !important;
  background: var(--color-gold) !important;
  scale: 1.6;
  box-shadow: 0 0 12px var(--color-gold);
  animation: pulse-group-handle 1s infinite alternate;
}

@keyframes pulse-group-handle {
  from { scale: 1.4; }
  to { scale: 1.75; }
}

/* 实时拖拽尺寸提示 */
.resize-dimension-tag {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  pointer-events: none;
  z-index: 50;
}

/* 调整尺寸手柄 */
.group-resizer {
  pointer-events: all;
}

/* 右下角对角线拉伸把手 */
.group-resizer-br {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 13px;
  height: 13px;
  background: var(--bg-card);
  border: 2px solid;
  border-radius: 3px;
  cursor: nwse-resize;
  z-index: 40;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition: scale 0.15s ease;
}

.group-resizer-br:hover {
  scale: 1.35;
}

/* 右边框宽度把手 */
.group-resizer-r {
  position: absolute;
  right: -4px;
  top: 36px;
  bottom: 16px;
  width: 8px;
  cursor: ew-resize;
  z-index: 35;
}

/* 底边框高度把手 */
.group-resizer-b {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: -4px;
  height: 8px;
  cursor: ns-resize;
  z-index: 35;
}
</style>
