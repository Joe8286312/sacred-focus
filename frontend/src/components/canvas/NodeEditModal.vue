<script setup lang="ts">
import { ref, watch } from 'vue';
import type { FocusNode, FocusGroup } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  node: FocusNode | null; // null 表示新建
  groups: FocusGroup[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', nodeData: FocusNode): void;
}>();

const form = ref<FocusNode>({
  id: '',
  code: '',
  name: '',
  groupId: null,
  triggerTime: null,
  triggerScene: '全天候',
  hasExactTime: false,
  timeValueMinutes: null,
  level: 0,
  maxLevel: 0,
  isLit: false,
  isFrozen: false,
  position: { x: 100, y: 100 },
  specCard: {
    instruction: '',
    failCondition: '',
    benefitMechanism: '',
    notes: ''
  }
});

// 标记场景描述是否被人为自定义修改过（若已自定义，则后续再改时间不再覆盖描述）
const isSceneCustomized = ref(false);

function initForm() {
  if (props.node) {
    const cloned = JSON.parse(JSON.stringify(props.node));
    form.value = {
      ...cloned,
      triggerTime: cloned.triggerTime ?? null,
      triggerScene: cloned.triggerScene ?? (cloned.triggerTime || '全天候'),
      hasExactTime: Boolean(cloned.triggerTime),
      timeValueMinutes: cloned.timeValueMinutes ?? null
    };
    // 判断此前是否已被自定义：如果场景描述存在，且不等于时间，也不等于全天候，则视为已自定义
    isSceneCustomized.value = Boolean(
      form.value.triggerScene &&
      form.value.triggerScene !== form.value.triggerTime &&
      form.value.triggerScene !== '全天候'
    );
  } else {
    // 每次新建时完全重置表单，生成全新唯一 ID，初始等级与最高等级均为 0 级，时间默认为 null
    form.value = {
      id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      code: '',
      name: '',
      groupId: null,
      triggerTime: null,
      triggerScene: '全天候',
      hasExactTime: false,
      timeValueMinutes: null,
      level: 0,
      maxLevel: 0,
      isLit: false,
      isFrozen: false,
      position: { x: 0, y: 0 },
      specCard: {
        instruction: '',
        failCondition: '',
        benefitMechanism: '',
        notes: ''
      }
    };
    isSceneCustomized.value = false;
  }
}

// 核心修复：监听 isOpen，每次打开弹窗时彻底根据 props.node 初始化，绝不残留上次新建输入
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      initForm();
    }
  },
  { immediate: true }
);

watch(
  () => props.node,
  () => {
    if (props.isOpen) {
      initForm();
    }
  }
);

function onTimeChange(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  form.value.triggerTime = val || null;
  if (form.value.triggerTime) {
    // 首次设置时间，或此前未人为自定义过描述：自动将场景描述同步填充为该时间
    if (!isSceneCustomized.value) {
      form.value.triggerScene = form.value.triggerTime;
    }
  } else {
    if (!isSceneCustomized.value) {
      form.value.triggerScene = '全天候';
    }
  }
}

function clearTime() {
  form.value.triggerTime = null;
  if (!isSceneCustomized.value) {
    form.value.triggerScene = '全天候';
  }
}

function onSceneInput() {
  // 用户人为输入或修改场景描述，立即锁定为已自定义
  isSceneCustomized.value = true;
}

function handleSave() {
  if (!form.value.code.trim() || !form.value.name.trim()) {
    alert('请填写国策纯文本编号与名称');
    return;
  }

  const finalScene = form.value.triggerScene?.trim() || form.value.triggerTime || '全天候';
  let hasExactTime = false;
  let timeValueMinutes: number | null = null;

  if (form.value.triggerTime) {
    const match = form.value.triggerTime.match(/^(\d{1,2})[:：](\d{2})$/);
    if (match) {
      hasExactTime = true;
      timeValueMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }
  }

  const payload: FocusNode = {
    ...form.value,
    triggerTime: form.value.triggerTime || null,
    triggerScene: finalScene,
    hasExactTime,
    timeValueMinutes
  };

  emit('save', JSON.parse(JSON.stringify(payload)));
  emit('close');
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="edit-modal-container">
        <div class="modal-header">
          <h2 class="modal-title">
            {{ node ? '编辑国策' : '新建国策' }}
          </h2>
          <button class="btn-close" @click="$emit('close')">×</button>
        </div>

        <div class="modal-body">
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">国策代码</label>
              <input 
                v-model="form.code" 
                class="form-input font-mono" 
                placeholder="例如: M1, R0, F3" 
                maxlength="10"
              />
            </div>
            <div class="form-group flex-2">
              <label class="form-label">国策名称</label>
              <input 
                v-model="form.name" 
                class="form-input" 
                placeholder="例如: 离地起爆, 神圣寝域" 
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">归属分组 (默认独立无外框)</label>
              <select v-model="form.groupId" class="form-select">
                <option :value="null">-- 独立国策 (无外框) --</option>
                <option v-for="g in groups" :key="g.id" :value="g.id">
                  {{ g.name }}
                </option>
              </select>
            </div>
            <div class="form-group flex-1">
              <div class="label-with-action">
                <label class="form-label">触发时间 (可选具体时间)</label>
                <button 
                  v-if="form.triggerTime" 
                  type="button" 
                  class="btn-text-clear font-mono" 
                  @click="clearTime" 
                  title="设为无特定触发时间 (null)"
                >
                  清除时间
                </button>
              </div>
              <input 
                :value="form.triggerTime || ''" 
                type="time" 
                class="form-input font-mono time-picker-input" 
                @input="onTimeChange" 
                @change="onTimeChange"
              />
            </div>
          </div>

          <div class="form-group">
            <div class="label-with-action">
              <label class="form-label">触发场景描述</label>
              <span class="scene-hint-badge" :class="{ 'is-custom': isSceneCustomized }">
                {{ isSceneCustomized ? '已人为自定义' : '跟随时间自动同步' }}
              </span>
            </div>
            <input 
              v-model="form.triggerScene" 
              class="form-input" 
              placeholder="例如: 起床后5分钟内下床, 晨净洗漱, 全天候" 
              @input="onSceneInput"
            />
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">当前等级 (连续天数)</label>
              <input 
                v-model.number="form.level" 
                type="number" 
                min="0" 
                max="99" 
                class="form-input font-mono" 
              />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">最高等级 (历史峰值)</label>
              <input 
                v-model.number="form.maxLevel" 
                type="number" 
                min="0" 
                max="99" 
                class="form-input font-mono" 
              />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">状态属性</label>
              <div class="checkbox-row">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="form.isFrozen" />
                  <span>水密隔舱冻结</span>
                </label>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">动作指令 (Instruction)</label>
            <textarea 
              v-model="form.specCard.instruction" 
              class="form-textarea" 
              rows="2" 
              placeholder="清晰可执行的具体动作，例如：闹钟响后3分钟内彻底离开床铺并叠被"
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label form-label-danger">失败判定 (Fail Condition)</label>
            <textarea 
              v-model="form.specCard.failCondition" 
              class="form-textarea form-textarea-danger" 
              rows="2" 
              placeholder="何种情况判定为未达标或违规，例如：超过3分钟仍在床或坐于床上看手机"
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">机制收益与心理学解释 (Benefit Mechanism)</label>
            <textarea 
              v-model="form.specCard.benefitMechanism" 
              class="form-textarea" 
              rows="2" 
              placeholder="为何如此设计、克服何种心理阻抗"
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">备注说明 (可选)</label>
            <input 
              v-model="form.specCard.notes" 
              class="form-input" 
              placeholder="例如: 2026-09-01 从5分钟收紧至3分钟" 
            />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" @click="$emit('close')">取消</button>
          <button class="btn-submit" @click="handleSave">保存国策</button>
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

.edit-modal-container {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.flex-1 { flex: 1; }
.flex-2 { flex: 2; }

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.label-with-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-text-clear {
  background: transparent;
  border: none;
  font-size: 11px;
  color: var(--color-danger);
  cursor: pointer;
  padding: 0 4px;
  opacity: 0.8;
  transition: opacity 0.15s;
}

.btn-text-clear:hover {
  opacity: 1;
  text-decoration: underline;
}

.scene-hint-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
}

.scene-hint-badge.is-custom {
  color: #10B981;
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.08);
}

.time-picker-input {
  min-height: 35px;
}

.form-label-danger {
  color: var(--color-danger);
}

.form-input, .form-select, .form-textarea {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}

.form-input:focus, .form-select:focus, .form-textarea:focus {
  border-color: var(--color-lit);
}

.form-textarea {
  resize: vertical;
}

.checkbox-row {
  display: flex;
  align-items: center;
  height: 35px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  cursor: pointer;
  color: var(--color-frozen);
}

.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: var(--bg-secondary);
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 8px 20px;
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
  padding: 8px 24px;
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
