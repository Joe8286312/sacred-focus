<script setup lang="ts">
import { ref } from 'vue';
import type { PrecedentCase } from '../../types';

defineProps<{
  isOpen: boolean;
  actualDurationSeconds: number;
}>();

const emit = defineEmits<{
  (e: 'complete-without-case'): void;
  (e: 'complete-with-case', precedent: PrecedentCase): void;
}>();

// 是否展开判例录入模式
const isRecordingMode = ref(false);

const today = new Date().toISOString().split('T')[0];
const date = ref(today);
const behavior = ref('');
const verdict = ref<'ALLOW' | 'FORBID'>('ALLOW');
const boundaryCondition = ref('');
const isSubmitting = ref(false);

function resetForm() {
  isRecordingMode.value = false;
  date.value = new Date().toISOString().split('T')[0];
  behavior.value = '';
  verdict.value = 'ALLOW';
  boundaryCondition.value = '';
  isSubmitting.value = false;
}

async function handleSaveCase() {
  if (!behavior.value.trim() || !boundaryCondition.value.trim()) {
    alert('请填写行为描述与执行边界裁决');
    return;
  }

  isSubmitting.value = true;
  const newCase: PrecedentCase = {
    id: `case-${Date.now()}`,
    date: date.value,
    behavior: behavior.value.trim(),
    verdict: verdict.value,
    boundaryCondition: boundaryCondition.value.trim(),
    createdAt: new Date().toISOString()
  };

  try {
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCase)
    });

    if (res.ok) {
      emit('complete-with-case', newCase);
      resetForm();
    } else {
      alert('保存判例失败，请稍后重试');
    }
  } catch (err) {
    console.error('Failed to submit precedent case', err);
    alert('网络异常，请重试');
  } finally {
    isSubmitting.value = false;
  }
}

function handleDirectComplete() {
  emit('complete-without-case');
  resetForm();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="modal-backdrop">
        <div class="modal-card">
          <!-- 阶段一：圆满完成选择界面 -->
          <div v-if="!isRecordingMode" class="completion-view">
            <div class="card-icon"></div>
            <h3 class="card-title">本次神圣专注已圆满结束</h3>
            
            <p class="card-desc">
              在刚才的心流深潜中，是否发生了灰色、突发或疑似违规的行为，需要记录<strong>【下必为例】</strong>判例？
            </p>

            <div class="actions-stack">
              <button class="btn-complete" @click="handleDirectComplete">
                无争议，直接完成
              </button>
              <button class="btn-record" @click="isRecordingMode = true">
                记录判例法典
              </button>
            </div>
          </div>

          <!-- 阶段二：判例法典录入表单 -->
          <div v-else class="record-view">
            <div class="form-header">
              <span class="form-title">录入【下必为例】判例</span>
              <button class="btn-back" @click="isRecordingMode = false">返回</button>
            </div>

            <div class="form-body">
              <div class="form-group">
                <label>判定日期</label>
                <input v-model="date" type="date" />
              </div>

              <div class="form-group">
                <label>行为描述</label>
                <input 
                  v-model="behavior" 
                  type="text" 
                  placeholder="例：中途起身接水 / 查阅技术文档" 
                />
              </div>

              <div class="form-group">
                <label>裁决结果（永久生效）</label>
                <div class="verdict-switcher">
                  <button 
                    type="button"
                    class="btn-verdict" 
                    :class="{ active: verdict === 'ALLOW', allow: verdict === 'ALLOW' }"
                    @click="verdict = 'ALLOW'"
                  >
                    终身允许 (ALLOW)
                  </button>
                  <button 
                    type="button"
                    class="btn-verdict" 
                    :class="{ active: verdict === 'FORBID', forbid: verdict === 'FORBID' }"
                    @click="verdict = 'FORBID'"
                  >
                    绝对禁止 (FORBID)
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label>裁决说明与执行边界约束</label>
                <textarea 
                  v-model="boundaryCondition" 
                  rows="3" 
                  placeholder="例：允许条件：水杯在视野内，接水必须在 1 分钟内返回，严禁携带手机；否则判定为违规。"
                ></textarea>
              </div>
            </div>

            <div class="form-actions">
              <button class="btn-cancel" @click="handleDirectComplete">
                放弃录入，直接结算
              </button>
              <button 
                class="btn-submit" 
                :disabled="isSubmitting"
                @click="handleSaveCase"
              >
                {{ isSubmitting ? '保存中...' : '确认存入法典并结算' }}
              </button>
            </div>
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
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-focus);
  box-shadow: var(--shadow-md);
  border-radius: var(--radius-lg);
  padding: 32px 28px;
  max-width: 500px;
  width: 100%;
}

.completion-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}

.card-icon {
  font-size: 48px;
  line-height: 1;
}

.card-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.card-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.actions-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  margin-top: 12px;
}

.btn-complete {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
  border: 1px solid transparent;
  font-size: 15px;
  padding: 14px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-glow);
}

.btn-record {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-weight: 600;
  font-size: 14px;
  padding: 12px;
  border-radius: var(--radius-md);
}

/* 判例表单样式 */
.record-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 10px;
}

.form-title {
  font-weight: 700;
  font-size: 16px;
}

.btn-back {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 8px;
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
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

.verdict-switcher {
  display: flex;
  gap: 10px;
}

.btn-verdict {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 600;
}

.btn-verdict.allow {
  border-color: var(--color-success);
  color: var(--color-success);
  background: rgba(16, 185, 129, 0.1);
}

.btn-verdict.forbid {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: rgba(244, 63, 94, 0.1);
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.btn-cancel {
  flex: 1;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  padding: 11px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
}

.btn-submit {
  flex: 1.5;
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
  border: 1px solid transparent;
  border: none;
  padding: 11px;
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
