import { defineStore } from 'pinia';
import { ref } from 'vue';
import { completeLogout } from '../application/auth/sessionLifecycle';
import { authGateway } from '../platform/browser/auth';

let logoutHandler: (() => void) | undefined;

/** 由浏览器组合根注册登出后的导航；store 不反向依赖 Vue Router。 */
export function setAuthLogoutHandler(handler: (() => void) | undefined) {
  logoutHandler = handler;
}

export const useAuthStore = defineStore('auth', () => {
  // 清理历史版本遗留在 localStorage 中的敏感 token（纯 HttpOnly Cookie 模式）
  if (typeof localStorage !== 'undefined' && localStorage.getItem('sf_token')) {
    localStorage.removeItem('sf_token');
  }

  const isAuthenticated = ref<boolean>(false);
  const hasCheckedAuth = ref<boolean>(false);
  const isChecking = ref<boolean>(false);
  const authError = ref<string | null>(null);

  async function login(password: string): Promise<boolean> {
    authError.value = null;
    try {
      const { ok, body: data } = await authGateway.login(password);

      if (!ok) {
        authError.value = data.message || data.error || '密码核验失败';
        return false;
      }

      isAuthenticated.value = true;
      hasCheckedAuth.value = true;
      return true;
    } catch (e: any) {
      authError.value = e.message || '网络连接异常，请检查后端服务';
      return false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await authGateway.logout();
    } catch (e) {
      // 登出静默清理
    } finally {
      completeLogout({
        markUnauthenticated: () => { isAuthenticated.value = false; },
        markAuthChecked: () => { hasCheckedAuth.value = true; },
        onLoggedOut: logoutHandler
      });
    }
  }

  async function checkAuthStatus(): Promise<boolean> {
    if (isChecking.value) return isAuthenticated.value;
    isChecking.value = true;
    try {
      const authenticated = await authGateway.getStatus();
      if (authenticated) {
        isAuthenticated.value = true;
        hasCheckedAuth.value = true;
        return isAuthenticated.value;
      }
      isAuthenticated.value = false;
      hasCheckedAuth.value = true;
      return false;
    } catch (e) {
      isAuthenticated.value = false;
      hasCheckedAuth.value = true;
      return false;
    } finally {
      isChecking.value = false;
    }
  }

  return {
    isAuthenticated,
    hasCheckedAuth,
    isChecking,
    authError,
    login,
    logout,
    checkAuthStatus
  };
});
