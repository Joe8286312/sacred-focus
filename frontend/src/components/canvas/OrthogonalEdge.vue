<script setup lang="ts">
import { computed } from 'vue';
import { 
  BaseEdge, 
  EdgeLabelRenderer, 
  getSmoothStepPath, 
  Position, 
  type EdgeProps 
} from '@vue-flow/core';
import type { FocusEdge } from '../../types';

interface CustomEdgeProps extends EdgeProps {
  data: FocusEdge & { isEditMode?: boolean };
}

const props = defineProps<CustomEdgeProps>();

const emit = defineEmits<{
  (e: 'delete-edge', edgeId: string): void;
}>();

// 计算曼哈顿正交平滑折线 (带 4px 圆角)
const edgePathInfo = computed(() => {
  return getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition || Position.Right,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition || Position.Left,
    borderRadius: 4
  });
});

const path = computed(() => edgePathInfo.value[0]);
const centerX = computed(() => edgePathInfo.value[1]);
const centerY = computed(() => edgePathInfo.value[2]);

// 虚线与实线样式
const isDashed = computed(() => {
  return props.data?.style === 'DASHED';
});

function handleDeleteClick(e: MouseEvent) {
  e.stopPropagation();
  emit('delete-edge', props.id);
}
</script>

<template>
  <!-- 基础正交避障折线 -->
  <BaseEdge 
    :id="id" 
    :path="path" 
    :marker-end="markerEnd"
    :style="{
      stroke: selected ? 'var(--color-lit)' : 'var(--border-color)',
      strokeWidth: selected ? '2.5px' : '1.5px',
      strokeDasharray: isDashed ? '5,5' : 'none',
      transition: 'stroke 0.15s ease, stroke-width 0.15s ease'
    }" 
  />

  <!-- 选中或编辑模式下在折线中心呈现快捷删除按钮 [×] -->
  <EdgeLabelRenderer>
    <div 
      v-if="selected || data?.isEditMode" 
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${centerX}px, ${centerY}px)`,
        pointerEvents: 'all'
      }"
      class="edge-delete-container"
    >
      <button 
        class="btn-edge-delete" 
        title="删除此连线"
        @click="handleDeleteClick"
      >
        ×
      </button>
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.edge-delete-container {
  z-index: 10;
}

.btn-edge-delete {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-danger);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 6px rgba(244, 63, 94, 0.6);
  cursor: pointer;
  line-height: 1;
  padding: 0;
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.btn-edge-delete:hover {
  transform: scale(1.25);
  background: #e11d48;
}
</style>
