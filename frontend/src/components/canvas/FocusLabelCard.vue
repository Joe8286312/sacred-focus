<script setup lang="ts">
import type { FocusLabel } from '../../types';

const props = defineProps<{
  id: string;
  data: FocusLabel & { 
    isEditMode?: boolean;
    isHighlighted?: boolean;
  };
  selected?: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit-label', label: FocusLabel): void;
}>();

function onDoubleClick(e: MouseEvent) {
  if (props.data.isEditMode) {
    e.stopPropagation();
    emit('edit-label', {
      id: props.id,
      text: props.data.text,
      position: props.data.position
    });
  }
}
</script>

<template>
  <div 
    class="focus-label-card"
    :class="{ 
      'is-edit-mode': data.isEditMode, 
      'is-selected': selected,
      'pulse-highlight': data.isHighlighted 
    }"
    :title="data.isEditMode ? '双击修改标签文本 (或按 Delete 删除)' : data.text"
    @dblclick="onDoubleClick"
  >
    <span class="label-text">{{ data.text }}</span>
  </div>
</template>

<style scoped>
.focus-label-card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.5px;
  white-space: nowrap;
  user-select: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(8px);
  transition: all var(--transition-fast, 0.15s ease);
}

.focus-label-card.is-edit-mode {
  cursor: grab;
}

.focus-label-card.is-edit-mode:hover {
  border-color: var(--border-focus);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.focus-label-card.is-edit-mode:active {
  cursor: grabbing;
}

.focus-label-card.is-selected {
  border-color: var(--color-gold, #F59E0B) !important;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.28), 0 2px 10px rgba(245, 158, 11, 0.2) !important;
}

.pulse-highlight {
  animation: label-pulse 2s ease-in-out;
}

@keyframes label-pulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
  50% { transform: scale(1.08); box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
}

.label-text {
  color: var(--text-primary);
}
</style>
