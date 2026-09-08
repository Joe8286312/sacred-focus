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

export const router = createRouter({
  history: createWebHistory(),
  routes
});

// 全局路由鉴权守卫
router.beforeEach((to, _from, next) => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('sf_token') : null;
  const isPublic = to.meta.public;

  if (!token && !isPublic) {
    // 未登录访问受保护页面，重定向至 /login
    return next({
      path: '/login',
      query: { redirect: to.fullPath }
    });
  }

  if (token && to.path === '/login') {
    // 已登录访问登录页，直接跳转回神圣座位
    return next('/seat');
  }

  next();
});
