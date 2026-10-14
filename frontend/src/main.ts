import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import App from './App.vue';
import './styles/base.css';
import { getTheme, setTheme } from './platform/browser/theme';
import { setUnauthorizedHandler } from './platform/browser/api';
import { setAuthLogoutHandler, useAuthStore } from './stores/auth';
import { ACCOUNT_CHANGE_KEY, isAccountTransitioning, reloadAccountSession } from './platform/browser/accountSession';

// 挂载 Vue 前恢复已保存主题；首次访问默认采用浅色，避免登录页出现不可读的深色界面。
setTheme(getTheme());

setUnauthorizedHandler(() => {
  // Cookie 到期、账号停用或其他标签页切换账号后，重建内存状态并重新核验服务端身份。
  reloadAccountSession();
});

setAuthLogoutHandler(() => {
  reloadAccountSession('/seat');
});

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');

window.addEventListener('storage', event => {
  if (event.key === ACCOUNT_CHANGE_KEY && event.newValue) reloadAccountSession();
});
window.addEventListener('pageshow', event => {
  // 浏览器返回缓存页时，旧账号的 DOM / store 也必须重新创建。
  if (event.persisted) reloadAccountSession();
});
function recheckSession() {
  if (!isAccountTransitioning() && useAuthStore().hasCheckedAuth) {
    void useAuthStore().checkAuthStatus();
  }
}
window.addEventListener('focus', recheckSession);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') recheckSession();
});
