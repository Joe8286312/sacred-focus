import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SacredSeatConfig, FocusSessionLog, DailyFocusHeatmapItem } from '../types';
import { sacredSeatGateway } from '../platform/browser/sacredSeat';
import {
  downloadSacredSeatLogs,
  enterBrowserFullscreen,
  exitBrowserFullscreen,
  subscribeToFullscreenChanges
} from '../platform/browser/sacredSeatEffects';

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
    subscribeToFullscreenChanges(document, (isActive) => {
      isFullscreen.value = isActive;
    });
  }

  async function enterFullscreen() {
    try {
      await enterBrowserFullscreen(document);
    } catch (e) {
      console.warn('Fullscreen entry failed or user denied:', e);
    }
  }

  async function exitFullscreen() {
    try {
      await exitBrowserFullscreen(document);
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
      config.value = await sacredSeatGateway.getConfig();
    } catch (e) {
      console.error('Failed to fetch sacred seat config', e);
    }
  }

  async function updateConfig(partial: Partial<SacredSeatConfig>) {
    try {
      config.value = await sacredSeatGateway.updateConfig(partial);
    } catch (e) {
      console.error('Failed to update config', e);
    }
  }

  async function resetStreak() {
    try {
      const data = await sacredSeatGateway.resetStreak();
      config.value.currentStreak = data.currentStreak;
      config.value.maxStreak = data.maxStreak;
    } catch (e) {
      console.error('Failed to reset streak', e);
    }
  }

  async function fetchLogs() {
    try {
      logs.value = await sacredSeatGateway.listLogs();
    } catch (e) {
      console.error('Failed to fetch logs', e);
    }
  }

  async function fetchHeatmapData(days = 365) {
    try {
      heatmapData.value = await sacredSeatGateway.getHeatmap(days);
    } catch (e) {
      console.error('Failed to fetch heatmap data', e);
    }
  }

  async function recordSession(session: FocusSessionLog) {
    try {
      const data = await sacredSeatGateway.recordSession(session);
      config.value.currentStreak = data.currentStreak;
      config.value.maxStreak = data.maxStreak;
      const existingIdx = logs.value.findIndex(l => l.id === session.id);
      if (existingIdx >= 0) {
        logs.value[existingIdx] = session;
      } else {
        logs.value.unshift(session);
      }
      fetchHeatmapData();
      return data;
    } catch (e) {
      console.error('Failed to record session', e);
      throw e;
    }
  }

  async function exportLogs(): Promise<void> {
    const data = await sacredSeatGateway.exportLogs();
    downloadSacredSeatLogs(data);
  }

  async function importLogs(payload: unknown): Promise<{ success: boolean; importedCount: number; totalLogs: number }> {
    const result = await sacredSeatGateway.importLogs(payload);
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
