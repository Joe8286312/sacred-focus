import { apiFetch } from './api';
import { useFocusTreeStore } from '../stores/focusTree';
import { useSacredSeatStore } from '../stores/sacredSeat';
import { useAuthStore } from '../stores/auth';

let currentKnownRevision = 0;
let isProbing = false;

export function getCurrentRevision(): number {
  return currentKnownRevision;
}

export function setCurrentRevision(rev: number) {
  if (typeof rev === 'number' && rev > currentKnownRevision) {
    currentKnownRevision = rev;
  }
}

export function initSyncManager(): () => void {
  async function probeAndSync() {
    if (isProbing) return;
    isProbing = true;

    try {
      // 只有在已登录时才发起同步探针
      const authStore = useAuthStore();
      if (!authStore.isAuthenticated) return;

      const data = await apiFetch<{ revision: number; evolutionVersion: string; updatedAt: string }>('/api/sync/status');

      if (currentKnownRevision === 0) {
        currentKnownRevision = data.revision;
        return;
      }

      if (data.revision > currentKnownRevision) {
        console.log(`[Sacred Focus Sync] 云端检测到更新: rev ${currentKnownRevision} -> ${data.revision}`);
        currentKnownRevision = data.revision;

        const focusTreeStore = useFocusTreeStore();
        const sacredSeatStore = useSacredSeatStore();

        // 仅在当前未处于画布草稿编辑态时，执行无感静默热刷新
        if (!focusTreeStore.loading) {
          await Promise.allSettled([
            focusTreeStore.fetchTreeData(),
            sacredSeatStore.fetchConfig(),
            sacredSeatStore.fetchLogs()
          ]);
        }
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

