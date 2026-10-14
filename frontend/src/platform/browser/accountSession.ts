/** 一个页面生命周期只属于一个账号；切换时停止旧请求，并重新创建全部 store 和草稿。 */
export const ACCOUNT_CHANGE_KEY = 'sacred_focus_account_change';
export const ACCOUNT_TRANSITION_EVENT = 'sacred-focus:account-transition';

let accountId: string | null = null;
let transitioning = false;
let generation = 0;
const pendingRequests = new Set<AbortController>();

export function getBrowserAccountId(): string | null {
  return accountId;
}

export function setBrowserAccountId(id: string): boolean {
  if (accountId !== null && accountId !== id) return false;
  accountId = id;
  return true;
}

export function isAccountTransitioning(): boolean {
  return transitioning;
}

function dispatchTransition() {
  window.dispatchEvent(new CustomEvent(ACCOUNT_TRANSITION_EVENT, { detail: transitioning }));
}

export function beginAccountTransition() {
  transitioning = true;
  generation += 1;
  for (const controller of pendingRequests) controller.abort();
  pendingRequests.clear();
  dispatchTransition();
}

export function cancelAccountTransition() {
  transitioning = false;
  dispatchTransition();
}

/** 不持久化账号或令牌，只广播 Cookie 会话已改变，让同源其他标签页重新核验。 */
export function announceAccountChange() {
  try {
    localStorage.setItem(ACCOUNT_CHANGE_KEY, `${Date.now()}:${Math.random()}`);
  } catch {
    // 禁用存储时仍可切换；请求中的账号标识继续阻止跨账号写入。
  }
}

export function reloadAccountSession(path = `${location.pathname}${location.search}${location.hash}`) {
  beginAccountTransition();
  location.replace(path);
}

export function accountStorageKey(key: string): string {
  if (!accountId) throw new Error('账号状态尚未加载');
  return `${key}:${encodeURIComponent(accountId)}`;
}

export function createAccountRequest(signal?: AbortSignal | null) {
  if (!accountId || transitioning) throw new DOMException('账号正在切换，请稍后重试', 'AbortError');
  const requestGeneration = generation;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  pendingRequests.add(controller);
  return {
    accountId,
    signal: controller.signal,
    ensureCurrent() {
      if (transitioning || requestGeneration !== generation || controller.signal.aborted) {
        throw new DOMException('账号会话已改变', 'AbortError');
      }
    },
    dispose() {
      pendingRequests.delete(controller);
      signal?.removeEventListener('abort', abort);
    }
  };
}
