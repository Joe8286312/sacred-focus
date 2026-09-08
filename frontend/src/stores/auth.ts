import { defineStore } from 'pinia';
import { ref } from 'vue';
import { router } from '../router';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(typeof localStorage !== 'undefined' ? (localStorage.getItem('sf_token') || '') : '');
  const isAuthenticated = ref<boolean>(Boolean(token.value));
  const isChecking = ref<boolean>(false);
  const authError = ref<string | null>(null);

  async function login(password: string): Promise<boolean> {
    authError.value = null;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include'
      });

      const data = await res.json();

      if (!res.ok) {
        authError.value = data.message || data.error || '密码核验失败';
        return false;
      }

      if (data.token) {
        token.value = data.token;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('sf_token', data.token);
        }
      }
      isAuthenticated.value = true;
      return true;
    } catch (e: any) {
      authError.value = e.message || '网络连接异常，请检查后端服务';
      return false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      // 登出静默清理
    } finally {
      token.value = '';
      isAuthenticated.value = false;
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('sf_token');
      }
      router.push('/login');
    }
  }

  async function checkAuthStatus(): Promise<boolean> {
    if (isChecking.value) return isAuthenticated.value;
    isChecking.value = true;
    try {
      const headers: Record<string, string> = {};
      if (token.value) {
        headers['Authorization'] = `Bearer ${token.value}`;
      }
      const res = await fetch('/api/auth/status', {
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        isAuthenticated.value = Boolean(data.isAuthenticated);
        if (!isAuthenticated.value) {
          token.value = '';
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('sf_token');
          }
        }
        return isAuthenticated.value;
      }
      return false;
    } catch (e) {
      return false;
    } finally {
      isChecking.value = false;
    }
  }

  return {
    token,
    isAuthenticated,
    isChecking,
    authError,
    login,
    logout,
    checkAuthStatus
  };
});
