<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { formatCompactDuration } from '../../utils/time';
import type { PrecedentCase } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  actualDurationSeconds: number;
  targetDurationMinutes?: number;
  initialFocusContent?: string;
}>();

const emit = defineEmits<{
  (e: 'complete-without-case', focusContent: string): void;
  (e: 'complete-with-case', precedent: PrecedentCase, focusContent: string): void;
}>();

// 是否展开判例录入模式
const isRecordingMode = ref(false);

const today = new Date().toISOString().split('T')[0];
const date = ref(today);
const behavior = ref('');
const verdict = ref<'ALLOW' | 'FORBID'>('ALLOW');
const boundaryCondition = ref('');
const isSubmitting = ref(false);

const focusContent = ref(props.initialFocusContent || '');
const errorMessage = ref('');

// 格式化展示实际专注时长（基于真实延迟唤醒时间计算）
const formattedActualDuration = computed(() => {
  const sec = Math.max(0, Math.floor(props.actualDurationSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}小时 ${m}分钟`;
  }
  if (m > 0) {
    return `${m}分钟 ${s > 0 ? s + '秒' : ''}`;
  }
  return `${s}秒`;
});

// 顺水推舟超额专注增量说明（采用 5m / 5m12s / 1h2s 紧凑精确规范）
const overFocusSummary = computed(() => {
  if (!props.targetDurationMinutes) return '';
  const targetSec = props.targetDurationMinutes * 60;
  const overSec = props.actualDurationSeconds - targetSec;
  if (overSec > 0) {
    return `（顺水推舟超额 +${formatCompactDuration(overSec)}）`;
  }
  return '';
});

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    focusContent.value = props.initialFocusContent || '';
    errorMessage.value = '';
    isRecordingMode.value = false;
  }
});

function resetForm() {
  isRecordingMode.value = false;
  date.value = new Date().toISOString().split('T')[0];
  behavior.value = '';
  verdict.value = 'ALLOW';
  boundaryCondition.value = '';
  isSubmitting.value = false;
  errorMessage.value = '';
}

async function handleSaveCase() {
  if (!focusContent.value.trim()) {
    errorMessage.value = '请填写本次专注完成内容';
    isRecordingMode.value = false;
    return;
  }

  if (!behavior.value.trim() || !boundaryCondition.value.trim()) {
    errorMessage.value = '请填写行为描述与执行边界裁决';
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
      emit('complete-with-case', newCase, focusContent.value.trim());
      resetForm();
    } else {
      errorMessage.value = '保存判例失败，请稍后重试';
    }
  } catch (err) {
    console.error('Failed to submit precedent case', err);
    errorMessage.value = '网络异常，请重试';
  } finally {
    isSubmitting.value = false;
  }
}

function handleDirectComplete() {
  if (!focusContent.value.trim()) {
    errorMessage.value = '请填写本次专注完成内容';
    return;
  }
  emit('complete-without-case', focusContent.value.trim());
  resetForm();
}

function handleStartRecordMode() {
  if (!focusContent.value.trim()) {
    errorMessage.value = '请先填写本次专注完成内容';
    return;
  }
  errorMessage.value = '';
  isRecordingMode.value = true;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="modal-backdrop">
        <div class="modal-card">
          <!-- 阶段一：圆满完成选择与专注内容填写界面 -->
          <div v-if="!isRecordingMode" class="completion-view">
            <div class="completion-badge">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>

            <h3 class="card-title">本次神圣专注已圆满结束</h3>

            <!-- 自动计算的实际物理心流时长 -->
            <div class="duration-highlight-card">
              <span class="duration-label">实际专注心流</span>
              <span class="duration-val font-mono">{{ formattedActualDuration }}</span>
              <span v-if="overFocusSummary" class="duration-over font-mono">{{ overFocusSummary }}</span>
            </div>

            <!-- 专注内容录入 -->
            <div class="focus-input-box">
              <label class="input-label">本次专注完成内容 / 心流产出 <span class="required-star">*</span></label>
              <input 
                v-model="focusContent" 
                type="text" 
                placeholder="例如：重构专注历史面板与前后端联调" 
                class="form-input"
                :class="{ 'has-error': !!errorMessage }"
              />
              <span v-if="errorMessage" class="error-tip">{{ errorMessage }}</span>
            </div>
            
            <p class="card-desc">
              在刚才的心流深潜中，是否发生了灰色、突发或疑似违规的行为，需要记录<strong>【下必为例】</strong>法典？
            </p>

            <div class="actions-stack">
              <button class="btn-complete" @click="handleDirectComplete">
                无争议，直接完成
              </button>
              <button class="btn-record" @click="handleStartRecordMode">
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
                <label class="input-label">已关联的专注内容</label>
                <div class="readonly-focus-content font-mono">{{ focusContent }}</div>
              </div>

              <div class="form-group">
                <label class="input-label">判定日期</label>
                <input v-model="date" type="date" class="form-input" />
              </div>

              <div class="form-group">
                <label class="input-label">行为描述</label>
                <input 
                  v-model="behavior" 
                  type="text" 
                  placeholder="例：中途起身接水 / 查阅技术文档" 
                  class="form-input"
                />
              </div>

              <div class="form-group">
                <label class="input-label">裁决结果（永久生效）</label>
                <div class="verdict-switcher">
                  <button 
                    type="button"
                    class="btn-verdict" 
                    :class="{ active: verdict === 'ALLOW', allow: verdict === 'ALLOW' }"
                    @click="verdict = 'ALLOW'"
                  >
                    终身允许
                  </button>
                  <button 
                    type="button"
                    class="btn-verdict" 
                    :class="{ active: verdict === 'FORBID', forbid: verdict === 'FORBID' }"
                    @click="verdict = 'FORBID'"
                  >
                    绝对禁止
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label class="input-label">裁决说明与执行边界约束</label>
                <textarea 
                  v-model="boundaryCondition" 
                  rows="3" 
                  placeholder="例：允许条件：水杯在视野内，接水必须在 1 分钟内返回，严禁携带手机；否则判定为违规。"
                  class="form-textarea"
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
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md), 0 20px 40px rgba(0, 0, 0, 0.4);
  border-radius: var(--radius-lg);
  padding: 30px 26px;
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

.completion-badge {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.12);
  border: 1.5px solid var(--color-success);
  color: var(--color-success);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.25);
}

.card-title {
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.duration-highlight-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 10px 18px;
  width: 100%;
  box-sizing: border-box;
}

.duration-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.duration-val {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-lit);
}

.duration-over {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-gold);
}

.focus-input-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  text-align: left;
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
  padding: 9px 12px;
  font-size: 13px;
  color: var(--text-primary);
  box-sizing: border-box;
  transition: border-color var(--transition-fast);
}

.form-input:focus, .form-textarea:focus {
  border-color: var(--color-lit);
}

.form-input.has-error {
  border-color: var(--color-danger);
  background: rgba(244, 63, 94, 0.04);
}

.form-textarea {
  resize: vertical;
  min-height: 64px;
  line-height: 1.5;
}

.error-tip {
  font-size: 12px;
  color: var(--color-danger);
}

.readonly-focus-content {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 600;
}

.card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

.actions-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin-top: 4px;
}

.btn-complete {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
  border: 1px solid transparent;
  font-size: 14px;
  padding: 12px;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-glow);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-complete:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}

.btn-record {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-weight: 600;
  font-size: 13px;
  padding: 11px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-record:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-focus);
}

/* 判例表单样式 */
.record-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
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
  color: var(--text-primary);
}

.btn-back {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.btn-back:hover {
  color: var(--text-primary);
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.verdict-switcher {
  display: flex;
  gap: 10px;
}

.btn-verdict {
  flex: 1;
  padding: 9px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
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
  margin-top: 6px;
}

.btn-cancel {
  flex: 1;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.btn-submit {
  flex: 1.5;
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
  border: none;
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
