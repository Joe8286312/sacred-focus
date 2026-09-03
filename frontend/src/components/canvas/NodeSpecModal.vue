<script setup lang="ts">
import { ref } from 'vue';
import type { FocusNode } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  node: FocusNode | null;
  isEditMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'edit', node: FocusNode): void;
  (e: 'delete', node: FocusNode): void;
}>();

const isConfirmingDelete = ref(false);

function handleDeleteClick() {
  isConfirmingDelete.value = true;
}

function handleConfirmDelete() {
  if (props.node) {
    emit('delete', props.node);
    isConfirmingDelete.value = false;
    emit('close');
  }
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="isOpen && node" class="modal-overlay" @click.self="$emit('close')">
      <div class="spec-card-container">
        <!-- 头部信息 -->
        <div class="spec-header">
          <div class="header-left">
            <span class="node-badge font-mono">{{ node.code }}</span>
            <h2 class="node-title">{{ node.name }}</h2>
          </div>
          <div class="header-right">
            <span class="status-pill">
              {{ node.isFrozen ? '❄️ 水密隔舱冻结' : (node.isLit ? '🟢 已点亮' : '⚪ 待命熄灭') }}
            </span>
            <span class="level-pill font-mono">Lv.{{ node.level }}/{{ node.maxLevel }}</span>
            <button class="btn-close" @click="$emit('close')">×</button>
          </div>
        </div>

        <!-- 触发场景与时限 -->
        <div class="trigger-banner">
          <span class="trigger-label">触发时限 / 场景：</span>
          <span class="trigger-val font-mono">{{ node.triggerTime || '全天候无约束' }}</span>
        </div>

        <!-- 详细规范主体 -->
        <div class="spec-content-body">
          <!-- 动作指令 -->
          <div class="spec-section">
            <div class="section-label">⚡ 动作指令 (Instruction)</div>
            <div class="section-text">
              {{ node.specCard?.instruction || '暂无详细动作指令' }}
            </div>
          </div>

          <!-- 失败判定 -->
          <div class="spec-section">
            <div class="section-label fail-label">🚫 失败判定 (Fail Condition)</div>
            <div class="section-text fail-text">
              {{ node.specCard?.failCondition || '暂无明确失败红线' }}
            </div>
          </div>

          <!-- 机制收益与心理学解释 -->
          <div class="spec-section">
            <div class="section-label">🧠 机制收益与心理学解释 (Benefit Mechanism)</div>
            <div class="section-text">
              {{ node.specCard?.benefitMechanism || '暂无机制收益说明' }}
            </div>
          </div>

          <!-- 备注 -->
          <div v-if="node.specCard?.notes" class="spec-section">
            <div class="section-label">📝 备注 (Notes)</div>
            <div class="section-text notes-text">
              {{ node.specCard.notes }}
            </div>
          </div>
        </div>

        <!-- 底部行动栏 -->
        <div class="spec-footer">
          <div v-if="isEditMode" class="edit-tools">
            <template v-if="!isConfirmingDelete">
              <button class="btn-edit" @click="$emit('edit', node)">
                ✏️ 修改此国策
              </button>
              <button class="btn-delete" @click="handleDeleteClick">
                🗑️ 删除此国策
              </button>
            </template>
            <template v-else>
              <span class="delete-warning">确认彻底删除该国策？关联连线将一并移除</span>
              <button class="btn-confirm-delete" @click="handleConfirmDelete">确认删除</button>
              <button class="btn-cancel-delete" @click="isConfirmingDelete = false">取消</button>
            </template>
          </div>
          <button class="btn-primary-close" @click="$emit('close')">
            关闭规范卡
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
  background: rgba(5, 5, 8, 0.78);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.spec-card-container {
  background: var(--bg-card);
  border: 1px solid var(--color-lit);
  box-shadow: 0 0 32px var(--color-lit-glow);
  border-radius: var(--radius-lg);
  max-width: 620px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.spec-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.node-badge {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-lit);
  background: rgba(6, 182, 212, 0.1);
  border: 1px solid rgba(6, 182, 212, 0.3);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
}

.node-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-pill {
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 4px 10px;
  border-radius: var(--radius-full);
}

.level-pill {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-gold);
  background: rgba(245, 158, 11, 0.1);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.btn-close:hover {
  color: var(--text-primary);
}

.trigger-banner {
  background: var(--bg-secondary);
  padding: 8px 24px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border-color);
}

.trigger-label {
  color: var(--text-muted);
}

.trigger-val {
  color: var(--color-lit);
  font-weight: 600;
}

.spec-content-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.spec-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.fail-label {
  color: var(--color-danger);
}

.section-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-secondary);
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-lit);
}

.fail-text {
  border-left-color: var(--color-danger);
}

.notes-text {
  border-left-color: var(--text-muted);
  color: var(--text-secondary);
}

.spec-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.edit-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-edit {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-edit:hover {
  border-color: var(--color-lit);
}

.btn-delete {
  background: rgba(244, 63, 94, 0.1);
  border: 1px solid rgba(244, 63, 94, 0.3);
  color: var(--color-danger);
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.delete-warning {
  font-size: 12px;
  color: var(--color-danger);
}

.btn-confirm-delete {
  background: var(--color-danger);
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.btn-cancel-delete {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

.btn-primary-close {
  background: var(--color-lit);
  color: #050508;
  font-weight: 700;
  font-size: 13px;
  padding: 8px 24px;
  border-radius: var(--radius-full);
  margin-left: auto;
  cursor: pointer;
}

.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>
