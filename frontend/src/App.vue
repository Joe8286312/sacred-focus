<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterView, useRouter, useRoute } from 'vue-router';
import ReconstructPromptModal from './components/canvas/ReconstructPromptModal.vue';
import { useFocusTreeStore } from './stores/focusTree';
import { useSacredSeatStore } from './stores/sacredSeat';

const router = useRouter();
const route = useRoute();
const currentTheme = ref<'dark' | 'light'>('dark');
const focusStore = useFocusTreeStore();
const seatStore = useSacredSeatStore();

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

  // 暴露调试辅助函数，便于随时在控制台调起断签清零审计弹窗进行预览与测试
  (window as any).__triggerResetModal = (mockData?: any) => {
    sessionStorage.removeItem('dismissedResetAlertDate');
    focusStore.pendingResetSummary = mockData || {
      settlementDate: new Date().toISOString().slice(0, 10),
      resetNodes: [
        { id: 'mock-1', code: 'N7', name: '晨间深度工作流', lostLevel: 1, maxLevel: 3 },
        { id: 'mock-2', code: '123', name: '离线复盘与整理', lostLevel: 1, maxLevel: 1 }
      ]
    };
  };

  (window as any).__resetAndTriggerAudit = async () => {
    sessionStorage.removeItem('dismissedResetAlertDate');
    await fetch('/api/focus-tree/reset-settlement-audit', { method: 'POST' });
    await focusStore.fetchTree();
  };
});
</script>

<template>
  <div class="app-container">
    <!-- 顶部全局极简导航（专注时隐藏导航链接，仅保留深浅切换与全屏） -->
    <header class="app-header" :class="{ 'is-focus-mode': seatStore.isFocusMode }">
      <div 
        class="brand" 
        :class="{ 'brand-disabled': seatStore.isFocusMode }"
        @click="!seatStore.isFocusMode && router.push('/seat')"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="brand-icon">
          <path d="M6 19v2M18 19v2M7 10h10M7 5h10a2 2 0 0 1 2 2v12H5V7a2 2 0 0 1 2-2z"></path>
        </svg>
        <span class="brand-title">Sacred Focus</span>
        <span v-if="seatStore.isFocusMode" class="focus-live-badge">
          <span class="pulse-dot"></span>
          心流深潜中
        </span>
      </div>

      <!-- 专注中时隐藏全部切换界面按钮，防止误触打断心流 -->
      <nav v-if="!seatStore.isFocusMode" class="nav-links">
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
        <!-- 专注时提供全屏快捷控制按钮 -->
        <button 
          v-if="seatStore.isFocusMode"
          class="fullscreen-toggle-btn"
          @click="seatStore.toggleFullscreen"
          :title="seatStore.isFullscreen ? '退出全屏 (ESC)' : '进入全屏沉浸 (F11)'"
        >
          <svg v-if="seatStore.isFullscreen" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
          </svg>
        </button>

        <!-- 始终保留深浅主题切换按钮 -->
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
      <ReconstructPromptModal />
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
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-toggle-btn:hover {
  background: var(--bg-surface);
  border-color: var(--color-lit);
}

.fullscreen-toggle-btn {
  font-size: 14px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-toggle-btn:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
  border-color: var(--border-lit);
}

/* 专注心流时的沉浸式极简顶栏 */
.app-header.is-focus-mode {
  background: var(--bg-primary);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: all var(--transition-normal);
}

.brand.brand-disabled {
  cursor: default;
  user-select: none;
}

.focus-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 600;
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 9999px;
  letter-spacing: 0.3px;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: pulse-dot 1.8s infinite ease-in-out;
}

@keyframes pulse-dot {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.6; }
}

.app-main {
  flex: 1;
  overflow: hidden;
  position: relative;
}
</style>
