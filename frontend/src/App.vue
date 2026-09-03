<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterView, useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();
const currentTheme = ref<'dark' | 'light'>('dark');

function toggleTheme() {
  currentTheme.value = currentTheme.value === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme.value);
  localStorage.setItem('sacred-focus-theme', currentTheme.value);
}

onMounted(() => {
  const saved = localStorage.getItem('sacred-focus-theme') as 'dark' | 'light' | null;
  if (saved) {
    currentTheme.value = saved;
    document.documentElement.setAttribute('data-theme', saved);
  }
});
</script>

<template>
  <div class="app-container">
    <!-- 顶部全局极简导航 -->
    <header class="app-header">
      <div class="brand" @click="router.push('/seat')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="brand-icon">
          <path d="M6 19v2M18 19v2M7 10h10M7 5h10a2 2 0 0 1 2 2v12H5V7a2 2 0 0 1 2-2z"></path>
        </svg>
        <span class="brand-title">Sacred Focus</span>
      </div>

      <nav class="nav-links">
        <button 
          class="nav-btn" 
          :class="{ active: route.path === '/seat' }"
          @click="router.push('/seat')"
        >
          神圣座位
        </button>
        <button 
          class="nav-btn" 
          :class="{ active: route.path === '/tree' }"
          @click="router.push('/tree')"
        >
          国策画布
        </button>
        <button 
          class="nav-btn" 
          :class="{ active: route.path === '/list' }"
          @click="router.push('/list')"
        >
          国策列表
        </button>
        <button 
          class="nav-btn" 
          :class="{ active: route.path === '/cases' }"
          @click="router.push('/cases')"
        >
          判例法典
        </button>
      </nav>

      <div class="header-right">
        <button class="theme-toggle-btn" @click="toggleTheme" title="切换深浅主题">
          <svg v-if="currentTheme === 'dark'" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </button>
      </div>
    </header>

    <!-- 视图主区域 -->
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-primary);
}

.app-header {
  height: 48px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
  z-index: 100;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.2px;
}

.brand-glyph {
  font-size: 16px;
}

.nav-links {
  display: flex;
  gap: 4px;
}

.nav-btn {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.nav-btn:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.nav-btn.active {
  color: var(--color-lit);
  background: rgba(0, 240, 255, 0.08);
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-toggle-btn {
  font-size: 14px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
}

.app-main {
  flex: 1;
  overflow: hidden;
  position: relative;
}
</style>
