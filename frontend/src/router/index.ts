import { createRouter, createWebHistory } from 'vue-router';
import SacredSeatView from '../views/SacredSeatView.vue';
import FocusCanvasView from '../views/FocusCanvasView.vue';
import FocusListView from '../views/FocusListView.vue';
import CaseLawView from '../views/CaseLawView.vue';

const routes = [
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
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});
