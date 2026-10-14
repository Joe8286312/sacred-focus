import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AuthUser } from '../application/auth/authGateway';
import { completeLogout } from '../application/auth/sessionLifecycle';
import { getLoginRequestFailureMessage, getLoginResponseFailureMessage } from '../application/auth/loginFailureMessage';
import { authGateway } from '../platform/browser/auth';
import {
  announceAccountChange,
  beginAccountTransition,
  cancelAccountTransition,
  isAccountTransitioning,
  reloadAccountSession,
  setBrowserAccountId
} from '../platform/browser/accountSession';

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
  const user = ref<AuthUser | null>(null);
  const isPublicAccount = computed(() => user.value?.role === 'public');
  const isPersonalAccount = computed(() => user.value !== null && user.value.role !== 'public');

  async function login(password: string, username = 'admin'): Promise<boolean> {
    authError.value = null;
    beginAccountTransition();
    try {
      const { ok, body: data } = await authGateway.login(password, username.trim());

      if (!ok) {
        authError.value = getLoginResponseFailureMessage(data);
        cancelAccountTransition();
        return false;
      }

      isAuthenticated.value = true;
      hasCheckedAuth.value = true;
      user.value = data.user || null;
      announceAccountChange();
      return true;
    } catch (e: unknown) {
      authError.value = getLoginRequestFailureMessage(e);
      cancelAccountTransition();
      return false;
    }
  }

  async function logout(): Promise<void> {
    authError.value = null;
    beginAccountTransition();
    try {
      await authGateway.logout();
      announceAccountChange();
      completeLogout({
        markUnauthenticated: () => { isAuthenticated.value = false; user.value = null; },
        markAuthChecked: () => { hasCheckedAuth.value = true; },
        onLoggedOut: logoutHandler || (() => reloadAccountSession('/seat'))
      });
    } catch (e) {
      authError.value = getLoginRequestFailureMessage(e);
      cancelAccountTransition();
    }
  }

  async function checkAuthStatus(): Promise<boolean> {
    if (isChecking.value) return isAuthenticated.value;
    isChecking.value = true;
    try {
      const session = await authGateway.getSession();
      if (isAccountTransitioning()) return isAuthenticated.value;
      if (session.isAuthenticated && session.user) {
        if (!setBrowserAccountId(session.user.id)) {
          reloadAccountSession();
          return false;
        }
        user.value = session.user;
        isAuthenticated.value = true;
        hasCheckedAuth.value = true;
        return isAuthenticated.value;
      }
      isAuthenticated.value = false;
      user.value = null;
      hasCheckedAuth.value = true;
      return false;
    } catch (e) {
      // 短暂断网不能把当前页面误认作另一个账号。
      if (hasCheckedAuth.value) return isAuthenticated.value;
      isAuthenticated.value = false;
      user.value = null;
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
    user,
    isPublicAccount,
    isPersonalAccount,
    login,
    logout,
    checkAuthStatus
  };
});
