<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { FocusGroup } from '../../types';

const props = defineProps<{
  id: string;
  data: FocusGroup & { isEditMode?: boolean };
  selected?: boolean;
}>();

defineEmits<{
  (e: 'edit-group', group: FocusGroup): void;
}>();

// 主题色样式计算
const frameStyle = computed(() => {
  const color = props.data.themeColor || '#0284C7';
  return {
    borderColor: color,
    backgroundColor: `${color}0D`, // 5% 透明度背景
    width: `${props.data.size?.width || 320}px`,
    height: `${props.data.size?.height || 220}px`
  };
});

const headerStyle = computed(() => {
  const color = props.data.themeColor || '#0284C7';
  return {
    backgroundColor: `${color}26`, // 15% 透明度
    borderBottomColor: `${color}4D`,
    color: color
  };
});
</script>

<template>
  <div 
    class="focus-group-frame" 
    :style="frameStyle" 
    :class="{ 'is-selected': selected, 'is-edit-mode': data.isEditMode }"
  >
    <!-- 分组四向连接锚点，支持全场景拓扑连线 (Group-to-Group, Group-to-Node, Node-to-Group) -->
    <Handle 
      id="group-top" 
      type="source" 
      :position="Position.Top" 
      class="group-handle handle-top" 
    />
    <Handle 
      id="group-target-top" 
      type="target" 
      :position="Position.Top" 
      class="group-handle handle-top" 
    />

    <Handle 
      id="group-bottom" 
      type="source" 
      :position="Position.Bottom" 
      class="group-handle handle-bottom" 
    />
    <Handle 
      id="group-target-bottom" 
      type="target" 
      :position="Position.Bottom" 
      class="group-handle handle-bottom" 
    />

    <Handle 
      id="group-left" 
      type="source" 
      :position="Position.Left" 
      class="group-handle handle-left" 
    />
    <Handle 
      id="group-target-left" 
      type="target" 
      :position="Position.Left" 
      class="group-handle handle-left" 
    />

    <Handle 
      id="group-right" 
      type="source" 
      :position="Position.Right" 
      class="group-handle handle-right" 
    />
    <Handle 
      id="group-target-right" 
      type="target" 
      :position="Position.Right" 
      class="group-handle handle-right" 
    />

    <!-- 分组标题栏 -->
    <div class="group-header" :style="headerStyle" @dblclick="$emit('edit-group', data)">
      <span class="group-title">{{ data.name }}</span>
      <span v-if="data.isEditMode" class="group-edit-hint">双击修改</span>
    </div>
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
  pointer-events: all;
}

.focus-group-frame.is-selected {
  border-style: solid;
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.35);
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
  background: var(--bg-primary) !important;
  border: 2px solid var(--text-muted) !important;
  border-radius: 50% !important;
  opacity: 0;
  transition: opacity 0.15s ease, transform 0.15s ease;
  z-index: 4;
}

.focus-group-frame:hover .group-handle,
.focus-group-frame.is-edit-mode .group-handle {
  opacity: 1;
}

.group-handle:hover {
  transform: scale(1.3);
  border-color: var(--color-gold) !important;
  box-shadow: 0 0 8px var(--color-gold);
}
</style>
