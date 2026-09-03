<script setup lang="ts">
defineProps<{
  isOpen: boolean;
  currentStreak: number;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="modal-backdrop" @click.self="emit('cancel')">
        <div class="modal-card">
          <div class="warning-icon"></div>
          <h3 class="warning-title">严正警告：此操作不可撤销</h3>
          
          <p class="warning-desc">
            您当前已专注超过后悔药时限。若现在放弃退出，将承认本次专注违规中断。
          </p>

          <div class="streak-impact">
            <span>当前主链连胜：</span>
            <span class="impact-node font-mono">#{{ currentStreak }}</span>
            <span class="arrow">→</span>
            <span class="impact-reset font-mono">#0 (彻底清零)</span>
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" @click="emit('cancel')">
              再想想（继续专注）
            </button>
            <button class="btn-danger" @click="emit('confirm')">
              确认放弃并清零
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
  background: var(--bg-secondary);
  border: 1px solid var(--color-danger);
  box-shadow: 0 0 32px rgba(244, 63, 94, 0.25);
  border-radius: var(--radius-lg);
  padding: 32px 28px;
  max-width: 440px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.warning-icon {
  font-size: 40px;
  line-height: 1;
}

.warning-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-danger);
}

.warning-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
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
  padding: 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-cancel:hover {
  background: var(--border-color);
}

.btn-danger {
  flex: 1;
  background: var(--color-danger);
  color: #fff;
  border: none;
  padding: 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 700;
}

.btn-danger:hover {
  opacity: 0.9;
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
