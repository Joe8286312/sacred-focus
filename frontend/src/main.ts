import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import App from './App.vue';
import './styles/base.css';
import { getTheme, setTheme } from './platform/browser/theme';

// 挂载 Vue 前恢复已保存主题；首次访问默认采用浅色，避免登录页出现不可读的深色界面。
setTheme(getTheme());

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');
