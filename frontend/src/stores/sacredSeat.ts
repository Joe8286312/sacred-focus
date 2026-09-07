import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SacredSeatConfig, FocusSessionLog } from '../types';

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

  // 专注沉浸态全局响应变量
  const isFocusMode = ref(false);
  const isFullscreen = ref(false);

  // 监听浏览器全屏状态变化（如按 ESC 退出全屏时同步）
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const handleFullscreenChange = () => {
      isFullscreen.value = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
  }

  async function enterFullscreen() {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as any).webkitRequestFullscreen) {
          await (el as any).webkitRequestFullscreen();
        } else if ((el as any).msRequestFullscreen) {
          await (el as any).msRequestFullscreen();
        }
      }
    } catch (e) {
      console.warn('Fullscreen entry failed or user denied:', e);
    }
  }

  async function exitFullscreen() {
    try {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (e) {
      console.warn('Exit fullscreen failed:', e);
    }
  }

  async function toggleFullscreen() {
    if (isFullscreen.value) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  }

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
    isFocusMode,
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
    fetchConfig,
    updateConfig,
    resetStreak,
    fetchLogs,
    recordSession
  };
});
