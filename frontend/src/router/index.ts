import { createRouter, createWebHistory } from 'vue-router';
import SacredSeatView from '../views/SacredSeatView.vue';
import FocusCanvasView from '../views/FocusCanvasView.vue';
import FocusListView from '../views/FocusListView.vue';
import CaseLawView from '../views/CaseLawView.vue';
import LoginView from '../views/LoginView.vue';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { public: true }
  },
  {
    path: '/',
    redirect: '/seat'
  },
  {
    path: '/seat',
    name: 'SacredSeat',
    component: SacredSeatView
  },
  {
    path: '/tree',
    name: 'FocusCanvas',
    component: FocusCanvasView
  },
  {
    path: '/list',
    name: 'FocusList',
    component: FocusListView
  },
  {
    path: '/cases',
    name: 'CaseLaw',
    component: CaseLawView
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/seat'
  }
];

import { useAuthStore } from '../stores/auth';

export const router = createRouter({
  history: createWebHistory(),
  routes
});

// 全局路由鉴权守卫（基于纯 HttpOnly Cookie 与内存鉴权状态）
router.beforeEach(async (to, _from, next) => {
  const isPublic = Boolean(to.meta.public);
  const authStore = useAuthStore();

  // 若尚未初始化核验过服务端的 HttpOnly Cookie 登录状态，则执行一次静默异步核验
  if (!authStore.hasCheckedAuth) {
    await authStore.checkAuthStatus();
  }

  if (!authStore.isAuthenticated && !isPublic) {
    // 未登录访问受保护页面，重定向至 /login
    return next({
      path: '/login',
      query: { redirect: to.fullPath }
    });
  }

  if (authStore.isAuthenticated && to.path === '/login') {
    // 已登录访问登录页，直接跳转回神圣座位
    return next('/seat');
  }

  next();
});

