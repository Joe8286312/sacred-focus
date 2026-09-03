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
      stroke: selected ? 'var(--edge-stroke-selected)' : (isDashed ? 'var(--edge-stroke-dashed)' : 'var(--edge-stroke)'),
      strokeWidth: selected ? '3px' : '2px',
      strokeDasharray: isDashed ? '6,6' : 'none',
      transition: 'stroke 0.15s ease, stroke-width 0.15s ease'
    }" 
  />

  <!-- 仅在编辑模式且选中该连线时，在折线精确几何中心呈现矢量删除图标 -->
  <EdgeLabelRenderer>
    <div 
      v-if="data?.isEditMode && selected" 
      :style="{
        position: 'absolute',
        transform: `translate(${centerX}px, ${centerY}px) translate(-50%, -50%)`,
        pointerEvents: 'all'
      }"
      class="edge-delete-container"
    >
      <button 
        class="btn-edge-delete" 
        title="删除此连线"
        @click="handleDeleteClick"
      >
        <svg 
          viewBox="0 0 24 24" 
          width="11" 
          height="11" 
          stroke="currentColor" 
          stroke-width="3" 
          stroke-linecap="round"
          class="delete-svg-icon"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.edge-delete-container {
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-edge-delete {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #F43F5E 0%, #E11D48 100%);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid rgba(255, 255, 255, 0.75);
  box-shadow: 0 2px 8px rgba(225, 29, 72, 0.45);
  cursor: pointer;
  padding: 0;
  margin: 0;
  transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.18s ease;
  line-height: 0;
}

.btn-edge-delete:hover {
  transform: scale(1.28);
  box-shadow: 0 3px 12px rgba(225, 29, 72, 0.65);
}

.delete-svg-icon {
  display: block;
  pointer-events: none;
}
</style>
