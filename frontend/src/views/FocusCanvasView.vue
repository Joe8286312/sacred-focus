<script setup lang="ts">
import { onMounted } from 'vue';
import { VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import { useFocusTreeStore } from '../stores/focusTree';

const store = useFocusTreeStore();

onMounted(() => {
  store.fetchTree();
  store.fetchEvolution();
});
</script>

<template>
  <div class="canvas-view-container">
    <div class="canvas-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">国策树画布中枢</span>
        <span class="badge-version">
          {{ store.evolution.snapshots[store.evolution.activePointerIndex]?.version || 'v1.0' }}
        </span>
      </div>
      <div class="toolbar-right">
        <button class="btn-tool" @click="store.fetchTree">刷新</button>
        <button class="btn-tool btn-save" @click="store.syncTree">保存演化</button>
      </div>
    </div>

    <div class="canvas-wrapper">
      <VueFlow
        :fit-view-on-init="true"
        :default-viewport="{ zoom: 1, x: 100, y: 100 }"
        class="custom-vue-flow"
      >
        <!-- 画布内容将在此呈现 -->
      </VueFlow>

      <div class="canvas-overlay-nodes">
        <div 
          v-for="node in store.nodes" 
          :key="node.id"
          class="preview-node-card"
          :class="{ 'is-lit': node.isLit, 'is-frozen': node.isFrozen }"
          :style="{ transform: `translate(${node.position.x}px, ${node.position.y}px)` }"
          @dblclick="store.toggleNodeLit(node.id)"
        >
          <div class="card-header">
            <span class="card-code font-mono">{{ node.code }}</span>
            <span class="card-status font-mono">
              {{ node.isLit ? '🟢' : '⚪' }} Lv.{{ node.level }}/{{ node.maxLevel }}
            </span>
          </div>
          <div class="card-name">{{ node.name }}</div>
          <div class="card-footer">
            <span class="card-time">{{ node.triggerTime }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-view-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-primary);
}

.canvas-toolbar {
  height: 48px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  z-index: 10;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-title {
  font-weight: 700;
  font-size: 14px;
}

.badge-version {
  background: rgba(0, 240, 255, 0.12);
  color: var(--color-lit);
  border: 1px solid var(--color-lit);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.btn-tool {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.btn-save {
  background: var(--color-lit);
  color: #000;
  font-weight: 600;
  border: none;
}

.canvas-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.custom-vue-flow {
  width: 100%;
  height: 100%;
  background: radial-gradient(circle, var(--border-color) 1px, transparent 1px);
  background-size: 24px 24px;
}

.canvas-overlay-nodes {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: auto;
}

.preview-node-card {
  position: absolute;
  width: 180px;
  height: 80px;
  background: var(--bg-card);
  border: 1px solid var(--color-unlit);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.preview-node-card.is-lit {
  border: 2px solid var(--color-lit);
  box-shadow: var(--shadow-glow);
  background: rgba(0, 240, 255, 0.04);
}

.preview-node-card.is-frozen {
  border: 2px dashed var(--color-frozen);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-code {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.card-status {
  font-size: 10px;
  color: var(--text-muted);
}

.card-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
}

.card-footer {
  font-size: 11px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-color);
  padding-top: 2px;
}
</style>
