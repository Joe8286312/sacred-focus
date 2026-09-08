<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { FocusLabel } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  label?: FocusLabel | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', labelData: FocusLabel): void;
  (e: 'delete', labelId: string): void;
}>();

const text = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      text.value = props.label ? props.label.text : '';
      nextTick(() => {
        inputRef.value?.focus();
        inputRef.value?.select();
      });
    }
  },
  { immediate: true }
);

function handleSave() {
  const trimmed = text.value.trim();
  if (!trimmed) return;

  if (props.label) {
    emit('save', {
      ...props.label,
      text: trimmed
    });
  } else {
    emit('save', {
      id: `label-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      text: trimmed,
      position: { x: 0, y: 0 }
    });
  }
}

function handleDelete() {
  if (props.label?.id) {
    emit('delete', props.label.id);
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSave();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">{{ label ? '编辑标签' : '新建标签' }}</h3>
        <button class="btn-close" @click="emit('close')" title="关闭 (Esc)">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">标签说明文本</label>
          <input
            ref="inputRef"
            v-model="text"
            type="text"
            class="form-input"
            placeholder="例如：专注间歇、代偿流转、前置缓冲..."
            maxlength="40"
            @keydown="handleKeyDown"
          />
          <p class="form-hint">支持在画布任意位置呈现极简流转说明与拓扑注释。</p>
        </div>
      </div>

      <div class="modal-footer">
        <div class="footer-left">
          <button 
            v-if="label" 
            class="btn-action btn-danger" 
            @click="handleDelete"
          >
            删除标签
          </button>
        </div>
        <div class="footer-right">
          <button class="btn-action btn-secondary" @click="emit('close')">取消</button>
          <button 
            class="btn-action btn-primary" 
            :disabled="!text.trim()" 
            @click="handleSave"
          >
            {{ label ? '保存修改' : '立即创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 16px;
}

.modal-card {
  width: 100%;
  max-width: 440px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.25));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modal-pop {
  from { opacity: 0; transform: scale(0.96) translateY(6px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast);
}

.btn-close:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--color-primary, #0284C7);
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted, #888);
  margin: 0;
  line-height: 1.4;
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-action {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
}

.btn-secondary {
  background: var(--bg-card);
  border-color: var(--border-color);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-primary {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #EF4444;
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #EF4444;
}
</style>
