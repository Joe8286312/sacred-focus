<script setup lang="ts">
import { onMounted } from 'vue';
import { useSacredSeatStore } from '../stores/sacredSeat.js';

const store = useSacredSeatStore();

onMounted(() => {
  store.fetchConfig();
  store.fetchLogs();
});
</script>

<template>
  <div class="seat-view-container">
    <div class="seat-header">
      <div class="token-banner">
        <span class="token-label">神圣信物生效中</span>
        <span class="token-value">{{ store.config.sacredToken }}</span>
      </div>
      <div class="streak-badge">
        <span class="streak-node">当前主链: #{{ store.config.currentStreak }}</span>
        <span class="streak-max font-mono">最高: #{{ store.config.maxStreak }}</span>
      </div>
    </div>

    <!-- 极简大时钟区域 -->
    <div class="timer-display-card">
      <div class="timer-digits font-mono">
        60:00
      </div>
      <div class="timer-status-hint">
        准备就位 · 点击下方按钮开启心流
      </div>
      <div class="timer-actions">
        <button class="btn-primary">
          开启神圣专注 ({{ store.config.defaultFocusDuration }}m)
        </button>
      </div>
    </div>

    <!-- 预约链动态线性时延 -->
    <div class="reservation-card">
      <div class="card-title">
        <span>⏰ 预约链 (动态线性时延)</span>
        <span class="signal-tag">启动信号: {{ store.config.reservationSignal }}</span>
      </div>
      <p class="card-desc">避开当下贴现阻抗，通过平移启动时间化解前额叶阻力。</p>
      <div class="reservation-controls">
        <button class="btn-secondary">+5m</button>
        <button class="btn-secondary">+10m</button>
        <button class="btn-secondary active">+15m</button>
        <button class="btn-secondary">+30m</button>
        <button class="btn-reserve">点火预约倒计时</button>
      </div>
    </div>
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

.streak-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 6px 12px;
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
</style>
