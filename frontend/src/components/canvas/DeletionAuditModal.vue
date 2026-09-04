<script setup lang="ts">
import { computed } from 'vue';
import type { FocusNode, FocusGroup } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  deletedNodes: FocusNode[];
  deletedGroups: FocusGroup[];
  cascadeEdgesCount?: number;
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'confirm'): void;
}>();

const totalDeletedCount = computed(() => props.deletedNodes.length + props.deletedGroups.length);
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="audit-modal-container">
        <!-- 头部预警条 -->
        <div class="modal-header">
          <div class="header-title-wrap">
            <span class="warning-badge-dot"></span>
            <h2 class="modal-title">排版变更审计 · 删除确认</h2>
          </div>
          <button class="btn-close-icon" @click="$emit('close')" title="取消并继续编辑">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- 提示文本 -->
        <div class="modal-body">
          <p class="audit-lead-desc">
            检测到本次排版中移除了 <strong>{{ totalDeletedCount }}</strong> 项实体。
            确认覆盖保存后，将永久从数据库中物理删除以下国策或分组及其关联拓扑连线：
          </p>

          <!-- 被删除分组清单 -->
          <div v-if="deletedGroups.length > 0" class="audit-section">
            <div class="section-label">
              <span>已移除的分组外框 ({{ deletedGroups.length }})</span>
              <span class="sub-hint">原组内国策在持久库中将被转为独立国策</span>
            </div>
            <div class="items-chip-list">
              <div 
                v-for="g in deletedGroups" 
                :key="g.id"
                class="deleted-group-chip"
                :style="{ borderLeftColor: g.themeColor || '#0284C7' }"
              >
                <span class="group-name">{{ g.name }}</span>
              </div>
            </div>
          </div>

          <!-- 被删除国策清单 -->
          <div v-if="deletedNodes.length > 0" class="audit-section">
            <div class="section-label">
              <span>已移除的国策节点 ({{ deletedNodes.length }})</span>
              <span class="sub-hint">规范卡与历史打卡状态将被物理注销</span>
            </div>
            <div class="items-card-list">
              <div 
                v-for="n in deletedNodes" 
                :key="n.id"
                class="deleted-node-item font-mono"
              >
                <span class="node-code-badge">{{ n.code }}</span>
                <span class="node-name-text">{{ n.name }}</span>
                <span class="node-scene-tag">{{ n.triggerScene || n.triggerTime || '全天候' }}</span>
              </div>
            </div>
          </div>

          <!-- 连线附带清理说明 -->
          <div v-if="cascadeEdgesCount && cascadeEdgesCount > 0" class="cascade-edge-notice">
            <span class="notice-bullet"></span>
            <span>同时将清理 <strong>{{ cascadeEdgesCount }}</strong> 条关联拓扑连线</span>
          </div>
        </div>

        <!-- 底部行动操作栏 -->
        <div class="modal-footer">
          <button type="button" class="btn-cancel" @click="$emit('close')">
            放弃并继续调整
          </button>
          <button type="button" class="btn-confirm-overwrite" @click="$emit('confirm')">
            确认覆盖保存
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.audit-modal-container {
  background: var(--bg-primary);
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: var(--radius-md);
  box-shadow: 0 20px 40px -15px rgba(220, 38, 38, 0.15), 0 0 0 1px rgba(220, 38, 38, 0.1);
  width: 100%;
  max-width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalPop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  background: rgba(220, 38, 38, 0.04);
}

.header-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.warning-badge-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #DC2626;
  box-shadow: 0 0 8px rgba(220, 38, 38, 0.8);
}

.modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.btn-close-icon {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.btn-close-icon:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.audit-lead-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.audit-lead-desc strong {
  color: #DC2626;
  font-weight: 700;
}

.audit-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.sub-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
}

.items-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.deleted-group-chip {
  padding: 6px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-left: 3px solid #0284C7;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.items-card-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 4px;
}

.deleted-node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.node-code-badge {
  font-weight: 700;
  color: #DC2626;
  background: rgba(220, 38, 38, 0.08);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}

.node-name-text {
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}

.node-scene-tag {
  font-size: 11px;
  color: var(--text-muted);
}

.cascade-edge-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

.notice-bullet {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-muted);
}

.cascade-edge-notice strong {
  color: var(--text-primary);
}

.modal-footer {
  padding: 14px 20px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  padding: 7px 14px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-cancel:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-confirm-overwrite {
  background: #DC2626;
  color: #fff;
  border: 1px solid rgba(220, 38, 38, 0.4);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 700;
  padding: 7px 16px;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
}

.btn-confirm-overwrite:hover {
  background: #B91C1C;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
}

/* 进退场动效 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
