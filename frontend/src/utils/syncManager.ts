import { apiFetch } from './api';
import { useFocusTreeStore } from '../stores/focusTree';
import { useSacredSeatStore } from '../stores/sacredSeat';
import { useAuthStore } from '../stores/auth';
import { createSyncCoordinator } from '../application/sync/syncCoordinator';

export function initSyncManager(): () => void {
  const { probeAndSync } = createSyncCoordinator({
    isAuthenticated: () => useAuthStore().isAuthenticated,
    fetchRemoteStatus: () => apiFetch('/api/sync/status'),
    getFocusTreeSyncState: () => {
      const focusTreeStore = useFocusTreeStore();
      return {
        syncedRevision: focusTreeStore.syncedRevision,
        draftBaseRevision: focusTreeStore.draftBaseRevision,
        isEditing: focusTreeStore.isEditing,
        loading: focusTreeStore.loading
      };
    },
    observeRemoteRevision: revision => useFocusTreeStore().observeRemoteRevision(revision),
    refreshFocusTree: () => useFocusTreeStore().fetchTreeData(),
    refreshSacredSeatConfig: () => useSacredSeatStore().fetchConfig(),
    refreshSacredSeatLogs: () => useSacredSeatStore().fetchLogs(),
    logRemoteUpdate: (fromRevision, toRevision) => {
      console.log(`[Sacred Focus Sync] 云端检测到更新: rev ${fromRevision} -> ${toRevision}`);
    }
  });

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      probeAndSync();
    }
  };

  const onFocus = () => {
    probeAndSync();
  };

  // 1. 移动端/桌面端页面唤醒与切回前台监听
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
  }

  // 2. 60 秒低频心跳探针
  const timerId = setInterval(probeAndSync, 60000);

  // 返回清理闭包，防止 PWA / SPA 重复挂载内存泄漏
  return () => {
    clearInterval(timerId);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
    }
  };
}
