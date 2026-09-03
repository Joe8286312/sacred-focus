<script setup lang="ts">
import { ref, watch } from 'vue';
import type { PrecedentCase } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  caseData: PrecedentCase | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', caseItem: PrecedentCase): void;
}>();

const date = ref('');
const behavior = ref('');
const verdict = ref<'ALLOW' | 'FORBID'>('ALLOW');
const boundaryCondition = ref('');
const isSubmitting = ref(false);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      if (props.caseData) {
        date.value = props.caseData.date;
        behavior.value = props.caseData.behavior;
        verdict.value = props.caseData.verdict;
        boundaryCondition.value = props.caseData.boundaryCondition;
      } else {
        date.value = new Date().toISOString().split('T')[0];
        behavior.value = '';
        verdict.value = 'ALLOW';
        boundaryCondition.value = '';
      }
    }
  },
  { immediate: true }
);

async function handleSubmit() {
  if (!behavior.value.trim()) {
    alert('请填写行为描述');
    return;
  }
  if (!boundaryCondition.value.trim()) {
    alert('请填写裁决边界约束');
    return;
  }

  isSubmitting.value = true;
  try {
    const isEdit = !!props.caseData;
    const url = isEdit ? `/api/cases/${props.caseData!.id}` : '/api/cases';
    const method = isEdit ? 'PUT' : 'POST';

    const payload: PrecedentCase = {
      id: props.caseData ? props.caseData.id : `case-${Date.now()}`,
      date: date.value || new Date().toISOString().split('T')[0],
      behavior: behavior.value.trim(),
      verdict: verdict.value,
      boundaryCondition: boundaryCondition.value.trim(),
      createdAt: props.caseData ? props.caseData.createdAt : new Date().toISOString()
    };

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const saved = await res.json();
      emit('save', { ...payload, ...saved });
      emit('close');
    } else {
      alert('保存判例失败，请稍后重试');
    }
  } catch (e) {
    console.error('Failed to save case', e);
    alert('网络异常，请重试');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">
              {{ caseData ? '修改下必为例判例' : '新增下必为例判例' }}
            </h3>
            <button class="btn-close" @click="emit('close')">✕</button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label>判定日期</label>
              <input v-model="date" type="date" />
            </div>

            <div class="form-group">
              <label>行为描述</label>
              <input 
                v-model="behavior" 
                type="text" 
                placeholder="例：中途起身接水 / 查阅英文技术文档" 
              />
            </div>

            <div class="form-group">
              <label>裁决结果（永久定性）</label>
              <div class="verdict-switcher">
                <button 
                  type="button"
                  class="btn-verdict btn-allow" 
                  :class="{ active: verdict === 'ALLOW' }"
                  @click="verdict = 'ALLOW'"
                >
                  终身允许
                </button>
                <button 
                  type="button"
                  class="btn-verdict btn-forbid" 
                  :class="{ active: verdict === 'FORBID' }"
                  @click="verdict = 'FORBID'"
                >
                  绝对禁止
                </button>
              </div>
            </div>

            <div class="form-group">
              <label>裁决说明与执行边界约束</label>
              <textarea 
                v-model="boundaryCondition" 
                rows="4" 
                placeholder="例：水杯需在视野内，接水必须在 1 分钟内返回且严禁携带手机；否则判定为违规。"
              ></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="emit('close')">
              取消
            </button>
            <button class="btn-save" :disabled="isSubmitting" @click="handleSubmit">
              {{ isSubmitting ? '保存中...' : '保存判例' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
  border-radius: var(--radius-lg);
  max-width: 500px;
  width: 100%;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 16px;
  color: var(--text-muted);
  cursor: pointer;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-group input,
.form-group textarea {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  transition: border-color var(--transition-fast);
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: var(--text-primary);
  outline: none;
}

.verdict-switcher {
  display: flex;
  gap: 10px;
}

.btn-verdict {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-verdict.btn-allow.active {
  border-color: #10B981;
  background: #10B981;
  color: #FFFFFF;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
}

.btn-verdict.btn-forbid.active {
  border-color: #EF4444;
  background: #EF4444;
  color: #FFFFFF;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
}

.modal-footer {
  display: flex;
  gap: 10px;
  border-top: 1px solid var(--border-color);
  padding-top: 16px;
}

.btn-cancel {
  flex: 1;
  background: transparent;
  border: 1px solid var(--border-color);
  padding: 9px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-cancel:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-save {
  flex: 1.5;
  background: var(--text-primary);
  color: var(--bg-primary);
  border: 1px solid transparent;
  font-weight: 600;
  padding: 9px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-save:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* 动效 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
