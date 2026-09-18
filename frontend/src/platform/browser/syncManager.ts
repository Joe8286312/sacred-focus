import { apiFetch } from '../../utils/api';
import { useFocusTreeStore } from '../../stores/focusTree';
import { useSacredSeatStore } from '../../stores/sacredSeat';
import { useAuthStore } from '../../stores/auth';
import { createSyncCoordinator } from '../../application/sync/syncCoordinator';

/** 浏览器同步组合：装配 Pinia、HTTP 与唤醒事件，纯同步策略位于 application 层。 */
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
    if (document.visibilityState === 'visible') probeAndSync();
  };
  const onFocus = () => { probeAndSync(); };

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);

  const timerId = setInterval(probeAndSync, 60000);
  return () => {
    clearInterval(timerId);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
    if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
  };
}
