<script setup lang="ts">
import { ref, watch } from 'vue';
import type { FocusGroup } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  group: FocusGroup | null; // null 表示新建
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', groupData: FocusGroup): void;
  (e: 'delete', groupId: string): void;
}>();

const presetColors = [
  '#EA580C', // 橙红
  '#0284C7', // 湛蓝
  '#10B981', // 翠绿
  '#8B5CF6', // 幽紫
  '#E11D48', // 绯红
  '#D97706'  // 琥珀金
];

const form = ref<FocusGroup>({
  id: '',
  name: '',
  themeColor: '#0284C7',
  position: { x: 50, y: 50 },
  size: { width: 340, height: 240 }
});

const isConfirmingDelete = ref(false);

watch(() => props.group, (newVal) => {
  if (newVal) {
    form.value = JSON.parse(JSON.stringify(newVal));
  } else {
    form.value = {
      id: `group-${Date.now()}`,
      name: '',
      themeColor: '#0284C7',
      position: { x: 80 + Math.random() * 50, y: 80 + Math.random() * 50 },
      size: { width: 360, height: 260 }
    };
  }
  isConfirmingDelete.value = false;
}, { immediate: true });

function handleSave() {
  if (!form.value.name.trim()) {
    alert('请填写分组名称');
    return;
  }
  emit('save', JSON.parse(JSON.stringify(form.value)));
  emit('close');
}

function handleDelete() {
  if (props.group) {
    emit('delete', props.group.id);
    emit('close');
  }
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="group-modal-container">
        <div class="modal-header">
          <h2 class="modal-title">
            {{ group ? '编辑分组' : '新建分组' }}
          </h2>
          <button class="btn-close" @click="$emit('close')">×</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">分组名称</label>
            <input 
              v-model="form.name" 
              class="form-input" 
              placeholder="例如: 早起破晓组, 专注作战组" 
            />
          </div>

          <div class="form-group">
            <label class="form-label">外框主题色定制</label>
            <div class="color-presets">
              <button 
                v-for="color in presetColors" 
                :key="color"
                class="color-dot"
                :style="{ backgroundColor: color }"
                :class="{ active: form.themeColor.toLowerCase() === color.toLowerCase() }"
                @click="form.themeColor = color"
              ></button>
              <div class="color-picker-wrapper">
                <input type="color" v-model="form.themeColor" class="custom-picker" />
                <span class="custom-color-text font-mono">{{ form.themeColor }}</span>
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">默认宽度 (px)</label>
              <input v-model.number="form.size.width" type="number" min="200" step="20" class="form-input font-mono" />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">默认高度 (px)</label>
              <input v-model.number="form.size.height" type="number" min="150" step="20" class="form-input font-mono" />
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <div v-if="group" class="delete-group-box">
            <button v-if="!isConfirmingDelete" class="btn-delete-group" @click="isConfirmingDelete = true">
              删除此分组
            </button>
            <template v-else>
              <button class="btn-confirm-delete" @click="handleDelete">确认删除外框</button>
              <button class="btn-cancel-mini" @click="isConfirmingDelete = false">取消</button>
            </template>
          </div>
          <button class="btn-cancel" @click="$emit('close')">取消</button>
          <button class="btn-submit" @click="handleSave">保存分组</button>
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
  z-index: 1100;
  padding: 20px;
}

.group-modal-container {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  max-width: 460px;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 22px;
  color: var(--text-muted);
  cursor: pointer;
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.flex-1 { flex: 1; }

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-input {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}

.form-input:focus {
  border-color: var(--color-lit);
}

.color-presets {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.color-dot.active {
  border-color: #ffffff;
  transform: scale(1.2);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
}

.color-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.custom-picker {
  border: none;
  background: none;
  width: 20px;
  height: 20px;
  cursor: pointer;
  padding: 0;
}

.custom-color-text {
  font-size: 12px;
  color: var(--text-muted);
}

.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: var(--bg-secondary);
}

.delete-group-box {
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-delete-group {
  background: none;
  border: none;
  color: var(--color-danger);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}

.btn-confirm-delete {
  background: var(--color-danger);
  color: #fff;
  border: none;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  cursor: pointer;
}

.btn-cancel-mini {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 8px 18px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-cancel:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-focus);
}

.btn-submit {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
  border: 1px solid transparent;
  padding: 8px 22px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-submit:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
}
</style>
