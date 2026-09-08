<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const password = ref('');
const loading = ref(false);
const isErrorShake = ref(false);
const showPassword = ref(false);
const passwordInputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  // 自动聚焦密码框
  passwordInputRef.value?.focus();
});

async function handleLogin() {
  if (!password.value.trim() || loading.value) return;

  loading.value = true;
  isErrorShake.value = false;

  const success = await authStore.login(password.value);
  loading.value = false;

  if (success) {
    const redirect = (route.query.redirect as string) || '/seat';
    router.replace(redirect);
  } else {
    // 触发错误弹性震颤动效
    isErrorShake.value = true;
    setTimeout(() => {
      isErrorShake.value = false;
    }, 600);
    password.value = '';
    passwordInputRef.value?.focus();
  }
}
</script>

<template>
  <div class="login-container">
    <!-- 背景极简光晕 -->
    <div class="glow-orb" />

    <div class="login-card" :class="{ 'shake-animation': isErrorShake }">
      <!-- 极简几何 SVG 矢量锁徽标 -->
      <div class="lock-badge">
        <svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          <circle cx="12" cy="16" r="1.5" />
        </svg>
      </div>

      <div class="card-header">
        <h1 class="system-title">SACRED FOCUS</h1>
        <p class="system-subtitle">神 圣 契 约 访 问 核 验</p>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="input-wrapper" :class="{ 'has-error': authStore.authError }">
          <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 2l-2 2m-1.5 1.5L14 9m-4.5 4.5L2 21l3 1 1-3 1 1 3-1-1-3 1 1 3-1-1-3 4.5-4.5" />
            <circle cx="15.5" cy="8.5" r="4.5" />
          </svg>

          <input
            ref="passwordInputRef"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            class="password-input"
            placeholder="输入管理员安全密码"
            autocomplete="current-password"
            :disabled="loading"
          />

          <button
            type="button"
            class="toggle-eye-btn"
            tabindex="-1"
            @click="showPassword = !showPassword"
          >
            <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </button>
        </div>

        <div v-if="authStore.authError" class="error-text">
          {{ authStore.authError }}
        </div>

        <button type="submit" class="submit-btn" :disabled="loading || !password.trim()">
          <span v-if="!loading">进 入 自 控 中 枢</span>
          <span v-else class="loading-dots">核 验 中...</span>
        </button>
      </form>

      <div class="card-footer">
        <span class="security-tag">SINGLE-ADMIN PRIVATE REALM</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-primary);
  position: relative;
  overflow: hidden;
  padding: 1.5rem;
}

.glow-orb {
  position: absolute;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--color-lit-glow) 0%, transparent 70%);
  filter: blur(50px);
  pointer-events: none;
  opacity: 0.6;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background-color: var(--bg-card);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 2.25rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 10;
  transition: border-color var(--transition-normal), box-shadow var(--transition-normal);
}

.login-card:hover {
  border-color: var(--border-focus);
}

.lock-badge {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.lock-icon {
  width: 24px;
  height: 24px;
}

.card-header {
  text-align: center;
  margin-bottom: 2rem;
}

.system-title {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--text-primary);
  margin: 0 0 0.4rem 0;
}

.system-subtitle {
  font-size: 0.8rem;
  letter-spacing: 0.25em;
  color: var(--text-muted);
  margin: 0;
  text-indent: 0.25em;
}

.login-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.input-wrapper:focus-within {
  border-color: var(--color-lit);
  box-shadow: 0 0 0 1px var(--color-lit-glow);
}

.input-wrapper.has-error {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 1px rgba(244, 63, 94, 0.25);
}

.input-icon {
  width: 18px;
  height: 18px;
  margin-left: 1rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.password-input {
  flex: 1;
  background: transparent;
  border: none;
  padding: 0.85rem 0.75rem;
  font-size: 0.95rem;
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
}

.password-input::placeholder {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.toggle-eye-btn {
  background: transparent;
  border: none;
  padding: 0.75rem;
  margin-right: 0.25rem;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition-fast);
}

.toggle-eye-btn svg {
  width: 18px;
  height: 18px;
}

.toggle-eye-btn:hover {
  color: var(--text-primary);
}

.error-text {
  font-size: 0.8rem;
  color: var(--color-danger);
  text-align: center;
  margin-top: -0.5rem;
}

.submit-btn {
  width: 100%;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.85rem;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit-btn:hover:not(:disabled) {
  border-color: var(--color-lit);
  color: var(--color-lit);
  box-shadow: var(--shadow-glow);
  transform: translateY(-1px);
}

.submit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.card-footer {
  margin-top: 2rem;
  text-align: center;
}

.security-tag {
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  color: var(--text-muted);
  text-transform: uppercase;
}

/* 错误震颤动画 */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
}

.shake-animation {
  animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}
</style>
