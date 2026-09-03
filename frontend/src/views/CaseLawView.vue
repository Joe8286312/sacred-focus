<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { PrecedentCase } from '../types';

const cases = ref<PrecedentCase[]>([]);
const filter = ref<'ALL' | 'ALLOW' | 'FORBID'>('ALL');

async function fetchCases() {
  try {
    const url = filter.value === 'ALL' ? '/api/cases' : `/api/cases?verdict=${filter.value}`;
    const res = await fetch(url);
    if (res.ok) {
      cases.value = await res.json();
    }
  } catch (e) {
    console.error('Failed to fetch precedent cases', e);
  }
}

onMounted(() => {
  fetchCases();
});
</script>

<template>
  <div class="cases-view-container">
    <div class="cases-header">
      <div>
        <h2>⚖️ 下必为例判例法典</h2>
        <p class="cases-subtitle">以终身永久放行的极高摩擦力，消灭灰色破窗侥幸心理。</p>
      </div>

      <div class="filter-pills">
        <button 
          class="pill" 
          :class="{ active: filter === 'ALL' }" 
          @click="filter = 'ALL'; fetchCases()"
        >全部</button>
        <button 
          class="pill pill-allow" 
          :class="{ active: filter === 'ALLOW' }" 
          @click="filter = 'ALLOW'; fetchCases()"
        >允许 (ALLOW)</button>
        <button 
          class="pill pill-forbid" 
          :class="{ active: filter === 'FORBID' }" 
          @click="filter = 'FORBID'; fetchCases()"
        >禁止 (FORBID)</button>
      </div>
    </div>

    <div class="cases-list">
      <div v-if="cases.length === 0" class="empty-hint">
        暂无判例记录。专注结束后若发生模糊试探，将在此沉淀终身准则。
      </div>

      <div 
        v-for="item in cases" 
        :key="item.id" 
        class="case-card"
        :class="item.verdict === 'ALLOW' ? 'case-allow' : 'case-forbid'"
      >
        <div class="case-top">
          <span class="case-date font-mono">{{ item.date }}</span>
          <span class="verdict-tag">{{ item.verdict === 'ALLOW' ? '✅ 终身允许' : '🚫 绝对禁止' }}</span>
        </div>
        <div class="case-behavior">
          <strong>行为：</strong>{{ item.behavior }}
        </div>
        <div class="case-boundary">
          <strong>裁决边界：</strong>{{ item.boundaryCondition }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cases-view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  gap: 20px;
}

.cases-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 16px;
}

h2 {
  font-size: 18px;
  font-weight: 700;
}

.cases-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.filter-pills {
  display: flex;
  gap: 6px;
}

.pill {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
}

.pill.active {
  border-color: var(--color-lit);
  color: var(--color-lit);
}

.cases-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.empty-hint {
  text-align: center;
  color: var(--text-muted);
  padding: 40px 0;
  font-size: 13px;
}

.case-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.case-allow {
  border-left: 3px solid var(--color-success);
}

.case-forbid {
  border-left: 3px solid var(--color-danger);
}

.case-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.case-date {
  color: var(--text-muted);
}

.verdict-tag {
  font-weight: 600;
}

.case-behavior {
  font-size: 14px;
}

.case-boundary {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
}
</style>
