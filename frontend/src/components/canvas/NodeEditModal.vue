<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
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
  position: { x: 0, y: 0 },
  specCard: {
    instruction: '',
    failCondition: '',
    benefitMechanism: '',
    notes: ''
  }
});

// 标记场景描述是否被人为自定义修改过（若已自定义，则后续再改时间不再覆盖描述）
const isSceneCustomized = ref(false);

// 极简双列平滑滚动时间选择器状态
const isTimePickerOpen = ref(false);
const timePickerRef = ref<HTMLElement | null>(null);
const timeInputRef = ref<HTMLInputElement | null>(null);
const hourScrollRef = ref<HTMLElement | null>(null);
const minuteScrollRef = ref<HTMLElement | null>(null);

const HOURS_LIST = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_LIST = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const currentHour = computed(() => {
  if (!form.value.triggerTime) return null;
  const parts = form.value.triggerTime.split(/[:：]/);
  return parts[0] ? parts[0].padStart(2, '0') : null;
});

const currentMinute = computed(() => {
  if (!form.value.triggerTime) return null;
  const parts = form.value.triggerTime.split(/[:：]/);
  return parts[1] ? parts[1].padStart(2, '0') : null;
});

function applyTime(timeStr: string | null) {
  form.value.triggerTime = timeStr;
  if (timeStr) {
    if (!isSceneCustomized.value) {
      form.value.triggerScene = timeStr;
    }
  } else {
    if (!isSceneCustomized.value) {
      form.value.triggerScene = '全天候';
    }
  }
}

function scrollToActive() {
  nextTick(() => {
    if (hourScrollRef.value && currentHour.value) {
      const activeHourEl = hourScrollRef.value.querySelector('.is-selected') as HTMLElement;
      if (activeHourEl) {
        hourScrollRef.value.scrollTop = activeHourEl.offsetTop - (hourScrollRef.value.clientHeight / 2) + (activeHourEl.clientHeight / 2);
      }
    }
    if (minuteScrollRef.value && currentMinute.value) {
      const activeMinEl = minuteScrollRef.value.querySelector('.is-selected') as HTMLElement;
      if (activeMinEl) {
        minuteScrollRef.value.scrollTop = activeMinEl.offsetTop - (minuteScrollRef.value.clientHeight / 2) + (activeMinEl.clientHeight / 2);
      }
    }
  });
}

function selectHour(h: string) {
  const min = currentMinute.value || '00';
  applyTime(`${h}:${min}`);
  scrollToActive();
}

function selectMinute(m: string) {
  const hr = currentHour.value || '08';
  applyTime(`${hr}:${m}`);
  scrollToActive();
}

function setNowTime() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  applyTime(`${h}:${m}`);
  scrollToActive();
}

function clearTime() {
  applyTime(null);
}

function clearTimeAndClose() {
  applyTime(null);
  isTimePickerOpen.value = false;
}

function openTimePicker() {
  isTimePickerOpen.value = true;
  scrollToActive();
}

function toggleTimePicker() {
  isTimePickerOpen.value = !isTimePickerOpen.value;
  if (isTimePickerOpen.value) {
    scrollToActive();
  }
}

function closeTimePicker() {
  isTimePickerOpen.value = false;
}

// 聚焦时全选输入框文字，防止在 00:00 后面直接键入造成 00:00444
function onInputFocus(e: FocusEvent) {
  openTimePicker();
  (e.target as HTMLInputElement).select();
}

// 严谨过滤键盘输入，物理级杜绝非法乱码与多位冗余
function onTimeTextInput(e: Event) {
  const inputEl = e.target as HTMLInputElement;
  let raw = inputEl.value;
  
  // 仅允许数字和冒号
  raw = raw.replace(/[^\d:：]/g, '').replace('：', ':');
  
  // 严格限制最大 5 字符 (HH:mm)
  if (raw.length > 5) {
    raw = raw.slice(0, 5);
  }
  
  // 若用户连输 4 位纯数字（如 0830），自动格式化插入冒号
  if (/^\d{4}$/.test(raw)) {
    const h = parseInt(raw.slice(0, 2), 10);
    const m = parseInt(raw.slice(2, 4), 10);
    if (h <= 23 && m <= 59) {
      raw = `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
    }
  }

  inputEl.value = raw;

  if (!raw) {
    applyTime(null);
    return;
  }

  // 若符合标准 HH:mm 格式，即刻同步状态并联动滚轮定位
  const match = raw.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
  if (match) {
    const h = match[1].padStart(2, '0');
    const min = match[2];
    applyTime(`${h}:${min}`);
    scrollToActive();
  }
}

function onTimeTextBlur(e: Event) {
  const inputEl = e.target as HTMLInputElement;
  const raw = inputEl.value.trim();
  
  if (!raw) {
    applyTime(null);
    return;
  }

  // 尝试规范化宽松格式（如 8:5 -> 08:05, 8 -> 08:00）
  const matchCol = raw.match(/^([0-1]?[0-9]|2[0-3])[:]([0-5]?[0-9])$/);
  if (matchCol) {
    const h = matchCol[1].padStart(2, '0');
    const min = matchCol[2].padStart(2, '0');
    applyTime(`${h}:${min}`);
    inputEl.value = `${h}:${min}`;
    scrollToActive();
    return;
  }

  const matchSingleH = raw.match(/^([0-1]?[0-9]|2[0-3])$/);
  if (matchSingleH) {
    const h = matchSingleH[1].padStart(2, '0');
    applyTime(`${h}:00`);
    inputEl.value = `${h}:00`;
    scrollToActive();
    return;
  }

  // 如果仍不合法，直接回退为最后有效的 triggerTime，彻底杜绝 00444 等异常内容
  inputEl.value = form.value.triggerTime || '';
}

function handleClickOutside(e: PointerEvent) {
  if (isTimePickerOpen.value && timePickerRef.value && !timePickerRef.value.contains(e.target as Node)) {
    closeTimePicker();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleClickOutside);
});

function initForm() {
  isTimePickerOpen.value = false;
  if (props.node) {
    const cloned = JSON.parse(JSON.stringify(props.node));
    form.value = {
      ...cloned,
      triggerTime: cloned.triggerTime ?? null,
      triggerScene: cloned.triggerScene ?? (cloned.triggerTime || '全天候'),
      hasExactTime: Boolean(cloned.triggerTime),
      timeValueMinutes: cloned.timeValueMinutes ?? null
    };
    isSceneCustomized.value = Boolean(
      form.value.triggerScene &&
      form.value.triggerScene !== form.value.triggerTime &&
      form.value.triggerScene !== '全天候'
    );
  } else {
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

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      initForm();
    } else {
      closeTimePicker();
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

              <!-- 极简双列平滑滚动时间选择器 -->
              <div ref="timePickerRef" class="custom-time-picker-root">
                <div 
                  class="custom-time-input-wrap"
                  :class="{ 'is-open': isTimePickerOpen }"
                >
                  <input 
                    ref="timeInputRef"
                    type="text" 
                    maxlength="5"
                    class="form-input font-mono custom-time-field" 
                    placeholder="例如: 08:30 (点击滚动或键盘输入)" 
                    :value="form.triggerTime || ''"
                    @focus="onInputFocus"
                    @click="openTimePicker"
                    @input="onTimeTextInput"
                    @blur="onTimeTextBlur"
                    @keydown.enter.prevent="closeTimePicker"
                  />
                  <div class="time-input-adornments">
                    <button 
                      v-if="form.triggerTime" 
                      type="button" 
                      class="btn-clear-time-inline" 
                      @click.stop="clearTime" 
                      title="清空具体时间"
                    >
                      ✕
                    </button>
                    <button 
                      type="button" 
                      class="btn-toggle-picker" 
                      @click.stop="toggleTimePicker" 
                      title="展开/收起滚动选择面板"
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- 极简双列平滑滚动选择浮层 (Popover) -->
                <div v-if="isTimePickerOpen" class="scroll-time-popover" @click.stop>
                  <div class="scroll-columns-header">
                    <span class="column-title">小时 ({{ currentHour || '--' }})</span>
                    <span class="column-title">分钟 ({{ currentMinute || '--' }})</span>
                  </div>

                  <div class="scroll-columns-body">
                    <!-- 小时滚动列 (00 - 23) -->
                    <div ref="hourScrollRef" class="scroll-column hours-col">
                      <div 
                        v-for="h in HOURS_LIST" 
                        :key="h" 
                        class="scroll-item font-mono"
                        :class="{ 'is-selected': currentHour === h }"
                        @click="selectHour(h)"
                      >
                        {{ h }}
                      </div>
                    </div>

                    <div class="scroll-col-divider"></div>

                    <!-- 分钟滚动列 (00 - 59 全量精确到每分钟) -->
                    <div ref="minuteScrollRef" class="scroll-column minutes-col">
                      <div 
                        v-for="m in MINUTES_LIST" 
                        :key="m" 
                        class="scroll-item font-mono"
                        :class="{ 'is-selected': currentMinute === m }"
                        @click="selectMinute(m)"
                      >
                        {{ m }}
                      </div>
                    </div>
                  </div>

                  <div class="scroll-picker-footer">
                    <div class="footer-left">
                      <button type="button" class="btn-picker-link" @click="setNowTime">
                        当前时间
                      </button>
                      <button type="button" class="btn-picker-link text-danger" @click="clearTimeAndClose">
                        设为全天候
                      </button>
                    </div>
                    <button type="button" class="btn-picker-done" @click="closeTimePicker">
                      确定
                    </button>
                  </div>
                </div>
              </div>
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

.custom-time-picker-root {
  position: relative;
  width: 100%;
}

.custom-time-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  cursor: pointer;
  width: 100%;
}

.custom-time-field {
  width: 100%;
  padding-right: 56px;
  cursor: text;
  box-sizing: border-box;
  min-height: 35px;
}

.custom-time-input-wrap.is-open .custom-time-field {
  border-color: #10B981;
}

.time-input-adornments {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-clear-time-inline {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.btn-clear-time-inline:hover {
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.1);
}

.btn-toggle-picker {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.custom-time-input-wrap.is-open .btn-toggle-picker,
.btn-toggle-picker:hover {
  color: #10B981;
}

/* 极简双列平滑滚动时间选择浮层 */
.scroll-time-popover {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  width: 190px;
  background: var(--bg-primary);
  border: 1px solid var(--border-focus);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  padding: 8px 10px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scroll-columns-header {
  display: flex;
  justify-content: space-around;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-color);
}

.column-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  width: 50%;
  text-align: center;
}

.scroll-columns-body {
  display: flex;
  align-items: stretch;
  height: 160px;
  position: relative;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.scroll-column {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scroll-behavior: smooth;
  padding: 4px 2px;
}

.scroll-col-divider {
  width: 1px;
  background: var(--border-color);
  flex-shrink: 0;
}

.scroll-item {
  height: 26px;
  line-height: 26px;
  text-align: center;
  font-size: 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
  user-select: none;
}

.scroll-item:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.scroll-item.is-selected {
  background: #10B981;
  color: #fff;
  font-weight: 700;
}

.scroll-picker-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}

.footer-left {
  display: flex;
  gap: 6px;
}

.btn-picker-link {
  background: transparent;
  border: none;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0 2px;
  transition: color var(--transition-fast);
}

.btn-picker-link:hover {
  color: var(--text-primary);
}

.btn-picker-link.text-danger:hover {
  color: var(--color-danger);
}

.btn-picker-done {
  background: var(--text-primary);
  color: var(--bg-primary);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.btn-picker-done:hover {
  opacity: 0.9;
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
