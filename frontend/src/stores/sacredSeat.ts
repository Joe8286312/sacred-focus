import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SacredSeatConfig, FocusSessionLog } from '../types/index.js';

export const useSacredSeatStore = defineStore('sacredSeat', () => {
  const config = ref<SacredSeatConfig>({
    sacredToken: '主力机开启专注模式',
    reservationSignal: '反手拍手轻声说换人',
    defaultFocusDuration: 60,
    regretWindowSeconds: 30,
    currentStreak: 0,
    maxStreak: 0
  });

  const logs = ref<FocusSessionLog[]>([]);
  const loading = ref(false);

  async function fetchConfig() {
    try {
      const res = await fetch('/api/sacred-seat/config');
      if (res.ok) {
        config.value = await res.json();
      }
    } catch (e) {
      console.error('Failed to fetch sacred seat config', e);
    }
  }

  async function updateConfig(partial: Partial<SacredSeatConfig>) {
    try {
      const res = await fetch('/api/sacred-seat/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial)
      });
      if (res.ok) {
        config.value = await res.json();
      }
    } catch (e) {
      console.error('Failed to update config', e);
    }
  }

  async function resetStreak() {
    try {
      const res = await fetch('/api/sacred-seat/reset-streak', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        config.value.currentStreak = data.currentStreak;
        config.value.maxStreak = data.maxStreak;
      }
    } catch (e) {
      console.error('Failed to reset streak', e);
    }
  }

  async function fetchLogs() {
    try {
      const res = await fetch('/api/sacred-seat/logs');
      if (res.ok) {
        logs.value = await res.json();
      }
    } catch (e) {
      console.error('Failed to fetch logs', e);
    }
  }

  async function recordSession(session: FocusSessionLog) {
    try {
      const res = await fetch('/api/sacred-seat/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
      });
      if (res.ok) {
        const data = await res.json();
        config.value.currentStreak = data.currentStreak;
        config.value.maxStreak = data.maxStreak;
        logs.value.unshift(session);
      }
    } catch (e) {
      console.error('Failed to record session', e);
    }
  }

  return {
    config,
    logs,
    loading,
    fetchConfig,
    updateConfig,
    resetStreak,
    fetchLogs,
    recordSession
  };
});
