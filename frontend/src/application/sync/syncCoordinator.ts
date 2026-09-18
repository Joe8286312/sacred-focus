export interface RemoteSyncStatus {
  revision: number;
  evolutionVersion: string;
  updatedAt: string;
}

export interface FocusTreeSyncState {
  syncedRevision: number;
  draftBaseRevision: number | null;
  isEditing: boolean;
  loading: boolean;
}

export interface SyncCoordinatorDependencies {
  isAuthenticated: () => boolean;
  fetchRemoteStatus: () => Promise<RemoteSyncStatus>;
  getFocusTreeSyncState: () => FocusTreeSyncState;
  observeRemoteRevision: (revision: number) => void;
  refreshFocusTree: () => Promise<unknown>;
  refreshSacredSeatConfig: () => Promise<unknown>;
  refreshSacredSeatLogs: () => Promise<unknown>;
  logRemoteUpdate?: (fromRevision: number, toRevision: number) => void;
}

/** 跨端同步策略：只协调注入的状态与刷新动作，不依赖 Pinia、HTTP 或浏览器 API。 */
export function createSyncCoordinator({
  isAuthenticated,
  fetchRemoteStatus,
  getFocusTreeSyncState,
  observeRemoteRevision,
  refreshFocusTree,
  refreshSacredSeatConfig,
  refreshSacredSeatLogs,
  logRemoteUpdate
}: SyncCoordinatorDependencies) {
  let isProbing = false;

  async function probeAndSync() {
    if (isProbing) return;
    isProbing = true;

    try {
      if (!isAuthenticated()) return;

      const data = await fetchRemoteStatus();
      const state = getFocusTreeSyncState();
      // 仅记录远端观测值；绝不把它当作本地已同步的写入基线。
      observeRemoteRevision(data.revision);

      if (data.revision <= state.syncedRevision) return;

      logRemoteUpdate?.(state.syncedRevision, data.revision);

      // 草稿存在且远端领先时，挂起拉取；保留草稿基线让后端 CAS 返回 409。
      if (state.isEditing && state.draftBaseRevision !== null && data.revision > state.draftBaseRevision) return;

      // 非编辑态才允许刷新。刷新树成功后自行依据响应 revision 推进本地基线。
      if (!state.loading && !state.isEditing) {
        await refreshFocusTree();
        await Promise.allSettled([refreshSacredSeatConfig(), refreshSacredSeatLogs()]);
      }
    } catch {
      // 探针静默失败不中断用户当前操作。
    } finally {
      isProbing = false;
    }
  }

  return { probeAndSync };
}
