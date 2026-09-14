import { apiFetch } from './api';
import { useFocusTreeStore } from '../stores/focusTree';
import { useSacredSeatStore } from '../stores/sacredSeat';
import { useAuthStore } from '../stores/auth';

let isProbing = false;

export function initSyncManager(): () => void {
  async function probeAndSync() {
    if (isProbing) return;
    isProbing = true;

    try {
      // 只有在已登录时才发起同步探针
      const authStore = useAuthStore();
      if (!authStore.isAuthenticated) return;

      const data = await apiFetch<{ revision: number; evolutionVersion: string; updatedAt: string }>('/api/sync/status');
      const focusTreeStore = useFocusTreeStore();
      const sacredSeatStore = useSacredSeatStore();

      // 仅记录远端观测值；绝不把它当作本地已同步的写入基线。
      focusTreeStore.observeRemoteRevision(data.revision);

      if (data.revision <= focusTreeStore.syncedRevision) {
        return;
      }

      console.log(`[Sacred Focus Sync] 云端检测到更新: rev ${focusTreeStore.syncedRevision} -> ${data.revision}`);

      // 草稿存在且远端领先时，挂起拉取；保留草稿基线让后端 CAS 返回 409。
      if (
        focusTreeStore.isEditing &&
        focusTreeStore.draftBaseRevision !== null &&
        data.revision > focusTreeStore.draftBaseRevision
      ) {
        return;
      }

      // 非编辑态才允许刷新。fetchTreeData 成功后会依据响应中的 revision 推进 syncedRevision。
      if (!focusTreeStore.loading && !focusTreeStore.isEditing) {
        await focusTreeStore.fetchTreeData();
        await Promise.allSettled([
          sacredSeatStore.fetchConfig(),
          sacredSeatStore.fetchLogs()
        ]);
      }
    } catch (e) {
      // 探针静默失败不中断用户当前操作
    } finally {
      isProbing = false;
    }
  }

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
