<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  isOpen: boolean;
  currentStreak: number;
  initialFocusContent?: string;
}>();

const emit = defineEmits<{
  (e: 'confirm', payload: { focusContent: string; failureReason: string }): void;
  (e: 'cancel'): void;
}>();

const focusContent = ref(props.initialFocusContent || '');
const failureReason = ref('');
const errorMessage = ref('');

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    focusContent.value = props.initialFocusContent || '';
    failureReason.value = '';
    errorMessage.value = '';
  }
});

function handleConfirm() {
  if (!failureReason.value.trim()) {
    errorMessage.value = '请如实填写中断失败原因，诚实归因是自控工程学的第一法则';
    return;
  }
  emit('confirm', {
    focusContent: focusContent.value.trim() || '未指定专注目标',
    failureReason: failureReason.value.trim()
  });
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="modal-backdrop" @click.self="emit('cancel')">
        <div class="modal-card">
          <div class="warning-icon-wrap">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          
          <h3 class="warning-title">严正警告：此操作不可撤销</h3>
          
          <p class="warning-desc">
            您当前已专注超过后悔药免责时限。若现在放弃退出，将承认本次专注违规中断。
          </p>

          <div class="streak-impact">
            <span>当前主链连胜：</span>
            <span class="impact-node font-mono">#{{ currentStreak }}</span>
            <span class="arrow">→</span>
            <span class="impact-reset font-mono">#0 (彻底清零)</span>
          </div>

          <!-- 失败反思信息采集表单 -->
          <div class="form-section">
            <div class="form-group">
              <label class="input-label">本次专注目标 / 内容</label>
              <input 
                v-model="focusContent" 
                type="text" 
                placeholder="例如：重构专注历史面板" 
                class="form-input"
              />
            </div>

            <div class="form-group">
              <div class="label-row">
                <label class="input-label">违规中断原因与自控反思 <span class="required-star">*</span></label>
              </div>
              <textarea 
                v-model="failureReason" 
                rows="3" 
                placeholder="请如实记录是什么阻碍了本次专注（如：突发紧急打扰、走神刷社交媒体、生理疲劳、动作阻力过大等）"
                class="form-textarea"
                :class="{ 'has-error': !!errorMessage }"
              ></textarea>
              <span v-if="errorMessage" class="error-tip">{{ errorMessage }}</span>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" @click="emit('cancel')">
              再想想（继续专注）
            </button>
            <button class="btn-danger" @click="handleConfirm">
              确认中断并清零
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
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-card {
  background: var(--bg-card);
  border: 1px solid var(--color-danger);
  box-shadow: 0 0 36px rgba(244, 63, 94, 0.25), 0 20px 40px rgba(0, 0, 0, 0.5);
  border-radius: var(--radius-lg);
  padding: 28px 24px;
  max-width: 480px;
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.warning-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(244, 63, 94, 0.12);
  border: 1px solid rgba(244, 63, 94, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-danger);
  margin: 0 auto;
}

.warning-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-danger);
  text-align: center;
  margin: 0;
}

.warning-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  text-align: center;
  margin: 0;
}

.streak-impact {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(244, 63, 94, 0.08);
  border: 1px dashed rgba(244, 63, 94, 0.4);
  padding: 10px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}

.impact-node {
  font-weight: 700;
  color: var(--color-gold);
}

.arrow {
  color: var(--text-muted);
}

.impact-reset {
  font-weight: 700;
  color: var(--color-danger);
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 4px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.required-star {
  color: var(--color-danger);
  font-weight: 700;
}

.form-input, .form-textarea {
  width: 100%;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  box-sizing: border-box;
  transition: border-color var(--transition-fast);
}

.form-textarea {
  resize: vertical;
  min-height: 64px;
  line-height: 1.5;
}

.form-input:focus, .form-textarea:focus {
  border-color: var(--color-danger);
}

.form-textarea.has-error {
  border-color: var(--color-danger);
  background: rgba(244, 63, 94, 0.04);
}

.error-tip {
  font-size: 12px;
  color: var(--color-danger);
}

.modal-actions {
  display: flex;
  gap: 12px;
  width: 100%;
  margin-top: 8px;
}

.btn-cancel {
  flex: 1;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-cancel:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-focus);
}

.btn-danger {
  flex: 1;
  background: var(--color-danger);
  color: #fff;
  border: 1px solid var(--color-danger);
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 0 12px rgba(244, 63, 94, 0.3);
}

.btn-danger:hover {
  opacity: 0.92;
  transform: translateY(-1px);
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
