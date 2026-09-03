<script setup lang="ts">
import { ref, watch } from 'vue';
import type { SacredSeatConfig } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  config: SacredSeatConfig;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', updated: Partial<SacredSeatConfig>): void;
}>();

// 本地草稿，支持无损取消
const sacredToken = ref('');
const reservationSignal = ref('');
const defaultFocusDuration = ref(60);
const regretWindowSeconds = ref(30);

watch(() => props.isOpen, (open) => {
  if (open) {
    sacredToken.value = props.config.sacredToken;
    reservationSignal.value = props.config.reservationSignal;
    defaultFocusDuration.value = props.config.defaultFocusDuration;
    regretWindowSeconds.value = props.config.regretWindowSeconds;
  }
});

function handleSave() {
  emit('save', {
    sacredToken: sacredToken.value.trim() || '主力机开启专注模式',
    reservationSignal: reservationSignal.value.trim() || '反手拍手轻声说换人',
    defaultFocusDuration: Number(defaultFocusDuration.value) || 60,
    regretWindowSeconds: Number(regretWindowSeconds.value) || 30
  });
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">⚙️ 神圣座位个性化设置</h3>
            <button class="btn-close" @click="emit('close')">✕</button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label>
                神圣信物 (Sacred Token)
                <span class="hint">物理隔离锚点，专注时随身佩戴或状态切换</span>
              </label>
              <input v-model="sacredToken" type="text" placeholder="例：主力机开启专注模式 / 戴上专属棒球帽" />
            </div>

            <div class="form-group">
              <label>
                预约启动信号 (Reservation Signal)
                <span class="hint">前额叶点火动作，倒计时结束时触发执行</span>
              </label>
              <input v-model="reservationSignal" type="text" placeholder="例：反手拍手轻声说换人 / 打响指" />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>
                  标准专注时长 (分钟)
                  <span class="hint">默认单次心流时长</span>
                </label>
                <input v-model.number="defaultFocusDuration" type="number" min="1" max="240" />
              </div>

              <div class="form-group">
                <label>
                  后悔药窗口 (秒)
                  <span class="hint">启动后免责退出时限</span>
                </label>
                <input v-model.number="regretWindowSeconds" type="number" min="5" max="120" />
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="emit('close')">
              取消 (放弃修改)
            </button>
            <button class="btn-save" @click="handleSave">
              保存配置
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
  background: rgba(0, 0, 0, 0.8);
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
  max-width: 480px;
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
}

.btn-close {
  color: var(--text-muted);
  font-size: 16px;
  padding: 4px;
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

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

label {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  gap: 2px;
}

.hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
}

.modal-footer {
  display: flex;
  gap: 10px;
  border-top: 1px solid var(--border-color);
  padding-top: 16px;
}

.btn-cancel {
  flex: 1;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
}

.btn-save {
  flex: 1.5;
  background: var(--color-lit);
  color: #050508;
  font-weight: 700;
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
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
