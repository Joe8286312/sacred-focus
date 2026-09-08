import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SacredSeatConfig, FocusSessionLog, DailyFocusHeatmapItem } from '../types';
import { apiFetch } from '../utils/api';

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
  const heatmapData = ref<DailyFocusHeatmapItem[]>([]);
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
      config.value = await apiFetch('/api/sacred-seat/config');
    } catch (e) {
      console.error('Failed to fetch sacred seat config', e);
    }
  }

  async function updateConfig(partial: Partial<SacredSeatConfig>) {
    try {
      config.value = await apiFetch('/api/sacred-seat/config', {
        method: 'PUT',
        body: JSON.stringify(partial)
      });
    } catch (e) {
      console.error('Failed to update config', e);
    }
  }

  async function resetStreak() {
    try {
      const data = await apiFetch('/api/sacred-seat/reset-streak', { method: 'POST' });
      config.value.currentStreak = data.currentStreak;
      config.value.maxStreak = data.maxStreak;
    } catch (e) {
      console.error('Failed to reset streak', e);
    }
  }

  async function fetchLogs() {
    try {
      logs.value = await apiFetch('/api/sacred-seat/logs');
    } catch (e) {
      console.error('Failed to fetch logs', e);
    }
  }

  async function fetchHeatmapData(days = 365) {
    try {
      heatmapData.value = await apiFetch(`/api/sacred-seat/heatmap?days=${days}`);
    } catch (e) {
      console.error('Failed to fetch heatmap data', e);
    }
  }

  async function recordSession(session: FocusSessionLog) {
    try {
      const data = await apiFetch('/api/sacred-seat/logs', {
        method: 'POST',
        body: JSON.stringify(session)
      });
      config.value.currentStreak = data.currentStreak;
      config.value.maxStreak = data.maxStreak;
      logs.value.unshift(session);
      fetchHeatmapData();
    } catch (e) {
      console.error('Failed to record session', e);
    }
  }

  async function exportLogs(): Promise<void> {
    const data = await apiFetch('/api/sacred-seat/logs/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `sacred-focus-logs-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function importLogs(payload: unknown): Promise<{ success: boolean; importedCount: number; totalLogs: number }> {
    const result = await apiFetch('/api/sacred-seat/logs/import', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    await Promise.all([
      fetchLogs(),
      fetchHeatmapData(),
      fetchConfig()
    ]);
    return result;
  }

  return {
    config,
    logs,
    heatmapData,
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
    fetchHeatmapData,
    recordSession,
    exportLogs,
    importLogs
  };
});
