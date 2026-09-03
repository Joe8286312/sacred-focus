<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSacredSeatStore } from '../stores/sacredSeat';
import StreakWarningModal from '../components/seat/StreakWarningModal.vue';
import PrecedentCaseModal from '../components/seat/PrecedentCaseModal.vue';
import SeatSettingsModal from '../components/seat/SeatSettingsModal.vue';
import { playChimeSound } from '../utils/audio';
import type { FocusSessionLog } from '../types';

const store = useSacredSeatStore();

// 系统核心运行状态机
type SeatState = 'IDLE' | 'FOCUSING' | 'OVER_FOCUS' | 'RESERVING' | 'RESERVATION_TRIGGERED';
const currentState = ref<SeatState>('IDLE');

// 模态框开关
const isWarningModalOpen = ref(false);
const isCaseModalOpen = ref(false);
const isSettingsModalOpen = ref(false);

// 后悔药即时提示气泡
const regretNotice = ref('');

// 计时器变量
let timerInterval: number | null = null;
const sessionStartTime = ref<Date | null>(null);
const targetDurationSeconds = ref(60 * 60);
const remainingSeconds = ref(60 * 60);
const elapsedSeconds = ref(0);
const overFocusSeconds = ref(0);

// 预约链变量
const reservationDurationMinutes = ref(15);
const reservationRemainingSeconds = ref(15 * 60);

// 格式化秒数为 HH:MM:SS 或 MM:SS
function formatTime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 是否处于 30 秒后悔药保护期内
const isInsideRegretWindow = computed(() => {
  return elapsedSeconds.value < store.config.regretWindowSeconds;
});

// 清理所有定时器
function clearTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// -----------------------------------------------------------------------------
// 1. 专注心流模块
// -----------------------------------------------------------------------------

function startFocus(minutes?: number) {
  clearTimer();
  const mins = minutes ?? store.config.defaultFocusDuration;
  targetDurationSeconds.value = mins * 60;
  remainingSeconds.value = targetDurationSeconds.value;
  elapsedSeconds.value = 0;
  overFocusSeconds.value = 0;
  sessionStartTime.value = new Date();
  currentState.value = 'FOCUSING';

  timerInterval = window.setInterval(() => {
    elapsedSeconds.value += 1;
    if (remainingSeconds.value > 0) {
      remainingSeconds.value -= 1;
      if (remainingSeconds.value === 0) {
        // 关键机制：倒计时归零，静音且不弹窗，顺水推舟转为超额计时
        enterOverFocus();
      }
    }
  }, 1000);
}

// 进入超额专注状态 (静默顺水推舟态)
function enterOverFocus() {
  clearTimer();
  currentState.value = 'OVER_FOCUS';
  overFocusSeconds.value = 0;

  timerInterval = window.setInterval(() => {
    elapsedSeconds.value += 1;
    overFocusSeconds.value += 1;
  }, 1000);

  // 延迟监听用户退出心流后的首次点击/触控
  // 延迟 300ms 注册，避免归零瞬间的误触
  setTimeout(() => {
    window.addEventListener('click', handleWakeUpAction, { once: true });
    window.addEventListener('touchstart', handleWakeUpAction, { once: true });
  }, 300);
}

// 用户完成专注退出心流，首次点击唤醒结算
function handleWakeUpAction(e?: Event) {
  if (e) e.stopPropagation();
  clearTimer();
  window.removeEventListener('click', handleWakeUpAction);
  window.removeEventListener('touchstart', handleWakeUpAction);
  isCaseModalOpen.value = true;
}

// 用户主动点击【放弃退出】
function handleGiveUpClick() {
  if (isInsideRegretWindow.value) {
    // 触发【30秒后悔药免责退出】
    triggerRegretExit();
  } else {
    // 已超过后悔药窗口，弹出破坏性清零严正警告
    isWarningModalOpen.value = true;
  }
}

// 触发后悔药免责退出
async function triggerRegretExit() {
  clearTimer();
  const log: FocusSessionLog = {
    id: `log-${Date.now()}`,
    type: 'FOCUS',
    startTime: sessionStartTime.value ? sessionStartTime.value.toISOString() : new Date().toISOString(),
    endTime: new Date().toISOString(),
    targetDurationMinutes: Math.round(targetDurationSeconds.value / 60),
    actualDurationSeconds: elapsedSeconds.value,
    status: 'REGRET',
    note: '在30秒免责窗口内使用后悔药退出，主链连胜完整保留'
  };

  await store.recordSession(log);
  currentState.value = 'IDLE';

  // 提示横幅
  regretNotice.value = '💊 已触发后悔药国策：本次退出不扣连胜，无负罪感退出。';
  setTimeout(() => {
    regretNotice.value = '';
  }, 4000);
}

// 二次确认：确认违规放弃并清零主链
async function handleConfirmReset() {
  isWarningModalOpen.value = false;
  clearTimer();

  const log: FocusSessionLog = {
    id: `log-${Date.now()}`,
    type: 'FOCUS',
    startTime: sessionStartTime.value ? sessionStartTime.value.toISOString() : new Date().toISOString(),
    endTime: new Date().toISOString(),
    targetDurationMinutes: Math.round(targetDurationSeconds.value / 60),
    actualDurationSeconds: elapsedSeconds.value,
    status: 'FAIL',
    note: '中途主动中断专注，主链归零'
  };

  await store.recordSession(log);
  currentState.value = 'IDLE';

  regretNotice.value = '⚠️ 专注已中断：承认本次主链断裂，连胜纪录重置为 #0。';
  setTimeout(() => {
    regretNotice.value = '';
  }, 4000);
}

// 正常结算（无争议 或 存入判例）
async function handleCompleteSession(withCase: boolean) {
  isCaseModalOpen.value = false;
  clearTimer();

  const log: FocusSessionLog = {
    id: `log-${Date.now()}`,
    type: 'FOCUS',
    startTime: sessionStartTime.value ? sessionStartTime.value.toISOString() : new Date().toISOString(),
    endTime: new Date().toISOString(),
    targetDurationMinutes: Math.round(targetDurationSeconds.value / 60),
    actualDurationSeconds: elapsedSeconds.value,
    status: 'SUCCESS',
    note: withCase ? '专注成功完成（已增量录入下必为例判例）' : '专注成功完成（无争议）'
  };

  await store.recordSession(log);
  currentState.value = 'IDLE';

  regretNotice.value = `🎉 恭喜！本次专注圆满完成，主链推进至 #${store.config.currentStreak}！`;
  setTimeout(() => {
    regretNotice.value = '';
  }, 4000);
}

// -----------------------------------------------------------------------------
// 2. 预约链模块 (线性时延抗阻平移)
// -----------------------------------------------------------------------------

function setReservationMinutes(mins: number) {
  reservationDurationMinutes.value = mins;
  reservationRemainingSeconds.value = mins * 60;
}

function startReservation() {
  clearTimer();
  reservationRemainingSeconds.value = reservationDurationMinutes.value * 60;
  currentState.value = 'RESERVING';

  timerInterval = window.setInterval(() => {
    if (reservationRemainingSeconds.value > 0) {
      reservationRemainingSeconds.value -= 1;
      if (reservationRemainingSeconds.value === 0) {
        // 预约归零，播放清脆提示音，转入就位确认
        clearTimer();
        playChimeSound();
        currentState.value = 'RESERVATION_TRIGGERED';
      }
    }
  }, 1000);
}

function cancelReservation() {
  clearTimer();
  currentState.value = 'IDLE';
}

function confirmReservationReady() {
  // 点击【确认就位，开始专注】，直接进入标准专注倒计时
  startFocus(store.config.defaultFocusDuration);
}

// -----------------------------------------------------------------------------
// 3. 设置保存
// -----------------------------------------------------------------------------

async function handleSaveSettings(updated: any) {
  await store.updateConfig(updated);
  isSettingsModalOpen.value = false;
}

onMounted(() => {
  store.fetchConfig();
  store.fetchLogs();
});

onUnmounted(() => {
  clearTimer();
  window.removeEventListener('click', handleWakeUpAction);
  window.removeEventListener('touchstart', handleWakeUpAction);
});
</script>

<template>
  <div class="seat-view-container" :class="{ 'is-focus-mode': currentState === 'FOCUSING' || currentState === 'OVER_FOCUS' }">
    <!-- 顶部后悔药或结算通知条 -->
    <Transition name="slide-down">
      <div v-if="regretNotice" class="toast-notice">
        {{ regretNotice }}
      </div>
    </Transition>

    <!-- ==================== 状态 1: IDLE 待命态 ==================== -->
    <template v-if="currentState === 'IDLE'">
      <div class="seat-header">
        <div class="token-banner">
          <span class="token-label">神圣信物生效中</span>
          <span class="token-value">{{ store.config.sacredToken }}</span>
        </div>
        <div class="header-tools">
          <div class="streak-badge">
            <span class="streak-node">当前主链: #{{ store.config.currentStreak }}</span>
            <span class="streak-max font-mono">最高: #{{ store.config.maxStreak }}</span>
          </div>
          <button class="btn-icon" @click="isSettingsModalOpen = true" title="个性化设置">
            ⚙️
          </button>
        </div>
      </div>

      <!-- 待命主时钟展示 -->
      <div class="timer-display-card">
        <div class="timer-digits font-mono">
          {{ formatTime(store.config.defaultFocusDuration * 60) }}
        </div>
        <div class="timer-status-hint">
          准备就位 · 点击下方按钮开启心流深潜
        </div>
        <div class="timer-actions">
          <button class="btn-primary" @click="startFocus()">
            开启神圣专注 ({{ store.config.defaultFocusDuration }}m)
          </button>
        </div>
      </div>

      <!-- 动态线性时延预约链 -->
      <div class="reservation-card">
        <div class="card-title">
          <span>⏰ 预约链 (线性时延抗阻)</span>
          <span class="signal-tag">启动信号: {{ store.config.reservationSignal }}</span>
        </div>
        <p class="card-desc">
          面对当前极大的启动心理阻抗，平移专注起点，以预定倒计时平滑接入心流。
        </p>
        <div class="reservation-controls">
          <button 
            class="btn-secondary" 
            :class="{ active: reservationDurationMinutes === 5 }" 
            @click="setReservationMinutes(5)"
          >+5m</button>
          <button 
            class="btn-secondary" 
            :class="{ active: reservationDurationMinutes === 10 }" 
            @click="setReservationMinutes(10)"
          >+10m</button>
          <button 
            class="btn-secondary" 
            :class="{ active: reservationDurationMinutes === 15 }" 
            @click="setReservationMinutes(15)"
          >+15m</button>
          <button 
            class="btn-secondary" 
            :class="{ active: reservationDurationMinutes === 30 }" 
            @click="setReservationMinutes(30)"
          >+30m</button>
          <button class="btn-reserve" @click="startReservation">
            点火预约倒计时 ({{ reservationDurationMinutes }}m)
          </button>
        </div>
      </div>
    </template>

    <!-- ==================== 状态 2: FOCUSING 专注倒计时进行中 ==================== -->
    <template v-else-if="currentState === 'FOCUSING'">
      <div class="immersive-focus-view">
        <div class="focus-top-banner">
          <span class="focus-token-hint">信物生效中：{{ store.config.sacredToken }}</span>
        </div>

        <div class="focus-clock-center">
          <div class="focus-clock-digits font-mono">
            {{ formatTime(remainingSeconds) }}
          </div>
          <div class="focus-progress-info">
            <span v-if="isInsideRegretWindow" class="regret-pill-badge font-mono">
              💊 后悔药窗口生效中 ({{ store.config.regretWindowSeconds - elapsedSeconds }}s)
            </span>
            <span v-else class="focus-ongoing-hint font-mono">
              深度专注进行中 · 主链连胜 #{{ store.config.currentStreak }}
            </span>
          </div>
        </div>

        <div class="focus-bottom-bar">
          <button class="btn-giveup" @click="handleGiveUpClick">
            放弃退出
          </button>
        </div>
      </div>
    </template>

    <!-- ==================== 状态 3: OVER_FOCUS 顺水推舟超额计时 ==================== -->
    <template v-else-if="currentState === 'OVER_FOCUS'">
      <div class="immersive-focus-view over-focus-view" @click="handleWakeUpAction">
        <div class="focus-top-banner">
          <span class="focus-token-hint">预设时长已达成 · 顺水推舟深潜中</span>
        </div>

        <div class="focus-clock-center">
          <div class="focus-clock-digits over-digits font-mono">
            + {{ formatTime(overFocusSeconds) }}
          </div>
          <div class="over-focus-hint">
            静音无扰心流中 · 任意点击页面以唤醒结算
          </div>
        </div>

        <div class="focus-bottom-bar">
          <button class="btn-wake-settle" @click="handleWakeUpAction">
            已退出心流，完成结算
          </button>
        </div>
      </div>
    </template>

    <!-- ==================== 状态 4: RESERVING 预约链倒计时 ==================== -->
    <template v-else-if="currentState === 'RESERVING'">
      <div class="reservation-running-view">
        <div class="res-badge">⏰ 预约平移中</div>
        <div class="res-clock font-mono">
          {{ formatTime(reservationRemainingSeconds) }}
        </div>
        <div class="res-signal-info">
          点火信号：<strong>{{ store.config.reservationSignal }}</strong>
        </div>
        <p class="res-hint">
          请提前做好物理就位准备。倒计时结束时将清脆鸣响，引导无缝接驳专注。
        </p>
        <button class="btn-cancel-res" @click="cancelReservation">
          取消本次预约
        </button>
      </div>
    </template>

    <!-- ==================== 状态 5: RESERVATION_TRIGGERED 预约点火就位卡 ==================== -->
    <template v-else-if="currentState === 'RESERVATION_TRIGGERED'">
      <div class="reservation-triggered-view">
        <div class="fire-icon">⏰</div>
        <h2 class="fire-title">预约时间已到！启动信号已点火</h2>
        <div class="fire-signal-box">
          <span class="fire-label">即刻执行启动信号：</span>
          <span class="fire-signal font-mono">{{ store.config.reservationSignal }}</span>
        </div>
        <div class="fire-token-box">
          <span class="fire-label">物理信物就位：</span>
          <span class="fire-token font-mono">{{ store.config.sacredToken }}</span>
        </div>
        <button class="btn-confirm-ready" @click="confirmReservationReady">
          ⚡ 确认就位，开启神圣专注 ({{ store.config.defaultFocusDuration }}m)
        </button>
      </div>
    </template>

    <!-- 弹窗组件：严正清零警告模态框 -->
    <StreakWarningModal 
      :is-open="isWarningModalOpen"
      :current-streak="store.config.currentStreak"
      @confirm="handleConfirmReset"
      @cancel="isWarningModalOpen = false"
    />

    <!-- 弹窗组件：下必为例判例结算模态框 -->
    <PrecedentCaseModal
      :is-open="isCaseModalOpen"
      :actual-duration-seconds="elapsedSeconds"
      @complete-without-case="handleCompleteSession(false)"
      @complete-with-case="handleCompleteSession(true)"
    />

    <!-- 弹窗组件：神圣座位个性化设置 -->
    <SeatSettingsModal
      :is-open="isSettingsModalOpen"
      :config="store.config"
      @close="isSettingsModalOpen = false"
      @save="handleSaveSettings"
    />
  </div>
</template>

<style scoped>
.seat-view-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  gap: 28px;
  max-width: 680px;
  margin: 0 auto;
  position: relative;
}

.seat-view-container.is-focus-mode {
  max-width: 100%;
  padding: 0;
  background-color: var(--bg-primary);
}

/* 顶部提示条 */
.toast-notice {
  position: absolute;
  top: 16px;
  background: var(--bg-card);
  border: 1px solid var(--color-lit);
  color: var(--text-primary);
  font-weight: 600;
  font-size: 13px;
  padding: 10px 20px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-md);
  z-index: 50;
  text-align: center;
  backdrop-filter: blur(10px);
}

.seat-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.token-banner {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.token-label {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.token-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-lit);
}

.header-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.streak-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 6px 14px;
  border-radius: var(--radius-full);
}

.streak-node {
  font-weight: 700;
  color: var(--color-gold);
}

.streak-max {
  font-size: 12px;
  color: var(--text-secondary);
}

.btn-icon {
  font-size: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  width: 34px;
  height: 34px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.btn-icon:hover {
  color: var(--text-primary);
  border-color: var(--border-focus);
}

.timer-display-card {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 48px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(12px);
}

.timer-digits {
  font-size: clamp(64px, 12vw, 96px);
  font-weight: 700;
  letter-spacing: -2px;
  color: var(--text-primary);
  line-height: 1;
  text-shadow: 0 0 24px var(--color-lit-glow);
}

.timer-status-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 16px;
  margin-bottom: 28px;
}

.timer-actions {
  display: flex;
  gap: 16px;
}

.btn-primary {
  background: var(--color-lit);
  color: #050508;
  font-weight: 700;
  font-size: 15px;
  padding: 12px 32px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-glow);
}

.reservation-card {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 18px 20px;
}

.card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 6px;
}

.signal-tag {
  font-size: 12px;
  color: var(--color-gold);
  background: rgba(245, 158, 11, 0.1);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 14px;
}

.reservation-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-secondary {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
}

.btn-secondary.active {
  border-color: var(--color-lit);
  color: var(--color-lit);
}

.btn-reserve {
  margin-left: auto;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-focus);
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

/* ================= 沉浸式专注界面 ================= */
.immersive-focus-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 40px 24px;
}

.focus-top-banner {
  font-size: 13px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.focus-clock-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.focus-clock-digits {
  font-size: clamp(80px, 18vw, 140px);
  font-weight: 700;
  letter-spacing: -3px;
  line-height: 1;
  color: var(--text-primary);
  text-shadow: 0 0 36px var(--color-lit-glow);
}

.regret-pill-badge {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: var(--color-gold);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: var(--radius-full);
}

.focus-ongoing-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.focus-bottom-bar {
  display: flex;
  justify-content: center;
}

.btn-giveup {
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  padding: 8px 24px;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  transition: all var(--transition-fast);
}

.btn-giveup:hover {
  color: var(--color-danger);
  border-color: rgba(244, 63, 94, 0.3);
  background: rgba(244, 63, 94, 0.05);
}

/* 超额顺水推舟态 */
.over-focus-view {
  cursor: pointer;
}

.over-digits {
  color: var(--text-secondary);
  text-shadow: none;
}

.over-focus-hint {
  font-size: 13px;
  color: var(--text-muted);
}

.btn-wake-settle {
  background: var(--bg-secondary);
  border: 1px solid var(--color-lit);
  color: var(--color-lit);
  padding: 10px 24px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 600;
}

/* ================= 预约中界面 ================= */
.reservation-running-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  text-align: center;
  padding: 32px 16px;
}

.res-badge {
  font-size: 13px;
  color: var(--color-gold);
  background: rgba(245, 158, 11, 0.1);
  padding: 4px 14px;
  border-radius: var(--radius-full);
}

.res-clock {
  font-size: clamp(64px, 14vw, 100px);
  font-weight: 700;
  line-height: 1;
}

.res-signal-info {
  font-size: 14px;
}

.res-hint {
  max-width: 380px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}

.btn-cancel-res {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 8px 24px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
}

/* ================= 预约点火卡 ================= */
.reservation-triggered-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  text-align: center;
  padding: 36px 20px;
  background: var(--bg-card);
  border: 1px solid var(--color-lit);
  box-shadow: 0 0 40px var(--color-lit-glow);
  border-radius: var(--radius-lg);
  max-width: 520px;
  width: 100%;
}

.fire-icon {
  font-size: 52px;
  line-height: 1;
  animation: pulse 1.5s infinite;
}

.fire-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.fire-signal-box, .fire-token-box {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 10px 18px;
  border-radius: var(--radius-md);
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.fire-signal {
  color: var(--color-gold);
  font-weight: 700;
}

.fire-token {
  color: var(--color-lit);
  font-weight: 700;
}

.btn-confirm-ready {
  background: var(--color-lit);
  color: #050508;
  font-weight: 700;
  font-size: 15px;
  padding: 14px 28px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-glow);
  width: 100%;
  margin-top: 8px;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from, .slide-down-leave-to {
  transform: translateY(-20px);
  opacity: 0;
}
</style>
