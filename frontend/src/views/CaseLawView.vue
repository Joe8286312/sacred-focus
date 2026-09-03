<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { PrecedentCase } from '../types';
import CaseEditModal from '../components/case/CaseEditModal.vue';

const cases = ref<PrecedentCase[]>([]);
const filter = ref<'ALL' | 'ALLOW' | 'FORBID'>('ALL');

// 模态框状态
const isModalOpen = ref(false);
const editingCase = ref<PrecedentCase | null>(null);

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

function openAddModal() {
  editingCase.value = null;
  isModalOpen.value = true;
}

function openEditModal(item: PrecedentCase) {
  editingCase.value = { ...item };
  isModalOpen.value = true;
}

async function handleDeleteCase(item: PrecedentCase) {
  const confirmed = window.confirm(`严正确认：您确定要彻底删除判例【${item.behavior}】吗？此操作不可撤销。`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/cases/${item.id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      cases.value = cases.value.filter(c => c.id !== item.id);
    } else {
      alert('删除失败，请稍后重试');
    }
  } catch (err) {
    console.error('Failed to delete case', err);
    alert('网络异常，请重试');
  }
}

function handleSavedCase() {
  fetchCases();
}

onMounted(() => {
  fetchCases();
});
</script>

<template>
  <div class="cases-view-container">
    <div class="cases-header">
      <div class="header-info">
        <h1 class="page-title">下必为例判例法典</h1>
        <p class="cases-subtitle">以终身永久放行的极高摩擦力，消灭灰色破窗侥幸心理。</p>
      </div>

      <div class="header-actions">
        <!-- 筛选药丸：彻底移除多余英文 (ALLOW)/(FORBID) -->
        <div class="filter-pills">
          <button 
            class="pill" 
            :class="{ active: filter === 'ALL' }" 
            @click="filter = 'ALL'; fetchCases()"
          >
            全部
          </button>
          <button 
            class="pill pill-allow" 
            :class="{ active: filter === 'ALLOW' }" 
            @click="filter = 'ALLOW'; fetchCases()"
          >
            允许
          </button>
          <button 
            class="pill pill-forbid" 
            :class="{ active: filter === 'FORBID' }" 
            @click="filter = 'FORBID'; fetchCases()"
          >
            禁止
          </button>
        </div>

        <!-- 显式添加判例入口 -->
        <button class="btn-add-case" @click="openAddModal">
          + 添加判例
        </button>
      </div>
    </div>

    <!-- 判例列表主体 -->
    <div class="cases-list">
      <div v-if="cases.length === 0" class="empty-hint">
        暂无判例记录。点击右上角【+ 添加判例】或在专注结束后沉淀终身准则。
      </div>

      <!-- 
        卡片背景规范：
        对于允许的行为：背景设置为浅绿 (case-allow)
        对于禁止的行为：背景设置为浅红 (case-forbid)
      -->
      <div 
        v-for="item in cases" 
        :key="item.id" 
        class="case-card"
        :class="item.verdict === 'ALLOW' ? 'case-allow' : 'case-forbid'"
      >
        <div class="case-top">
          <div class="top-left">
            <span class="case-date font-mono">{{ item.date }}</span>
            <span class="verdict-badge font-mono">
              {{ item.verdict === 'ALLOW' ? '终身允许' : '绝对禁止' }}
            </span>
          </div>

          <!-- 判例操作项：修改与删除 -->
          <div class="card-operations">
            <button class="btn-card-action btn-card-edit" @click="openEditModal(item)">
              修改
            </button>
            <button class="btn-card-action btn-card-delete" @click="handleDeleteCase(item)">
              删除
            </button>
          </div>
        </div>

        <div class="case-behavior">
          <span class="field-label">行为：</span>
          <span class="field-value">{{ item.behavior }}</span>
        </div>

        <div class="case-boundary">
          <span class="field-label">裁决边界：</span>
          <span class="field-value">{{ item.boundaryCondition }}</span>
        </div>
      </div>
    </div>

    <!-- 判例新增/编辑模态框 -->
    <CaseEditModal
      :is-open="isModalOpen"
      :case-data="editingCase"
      @close="isModalOpen = false"
      @save="handleSavedCase"
    />
  </div>
</template>

<style scoped>
.cases-view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
  gap: 20px;
  box-sizing: border-box;
}

.cases-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.cases-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-pills {
  display: flex;
  gap: 6px;
}

.pill {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.pill:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.pill.active {
  background: var(--text-primary);
  color: var(--bg-primary);
  border-color: transparent;
  font-weight: 600;
}

.btn-add-case {
  background: var(--text-primary);
  color: var(--bg-primary);
  border: 1px solid transparent;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.btn-add-case:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.cases-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.empty-hint {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  font-size: 13px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-color);
}

/* 判例卡片基础结构 */
.case-card {
  border-radius: var(--radius-md);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-sm);
}

/* ================= 1. 允许的行为：背景设置为浅绿 ================= */
.case-card.case-allow {
  background: #E6F4EA;
  border: 1.5px solid #10B981;
}

.case-card.case-allow .verdict-badge {
  background: #10B981;
  color: #FFFFFF;
}

.case-card.case-allow .case-behavior .field-value {
  color: #064E3B;
  font-weight: 700;
}

.case-card.case-allow .case-boundary .field-value {
  color: #047857;
}

.case-card.case-allow .field-label {
  color: #065F46;
  font-weight: 600;
}

[data-theme="dark"] .case-card.case-allow {
  background: rgba(16, 185, 129, 0.12);
  border: 1.5px solid rgba(16, 185, 129, 0.35);
}

[data-theme="dark"] .case-card.case-allow .case-behavior .field-value {
  color: #ECFDF5;
}

[data-theme="dark"] .case-card.case-allow .case-boundary .field-value {
  color: #A7F3D0;
}

[data-theme="dark"] .case-card.case-allow .field-label {
  color: #6EE7B7;
}

/* ================= 2. 禁止的行为：背景设置为浅红 ================= */
.case-card.case-forbid {
  background: #FEE2E2;
  border: 1.5px solid #EF4444;
}

.case-card.case-forbid .verdict-badge {
  background: #EF4444;
  color: #FFFFFF;
}

.case-card.case-forbid .case-behavior .field-value {
  color: #7F1D1D;
  font-weight: 700;
}

.case-card.case-forbid .case-boundary .field-value {
  color: #B91C1C;
}

.case-card.case-forbid .field-label {
  color: #991B1B;
  font-weight: 600;
}

[data-theme="dark"] .case-card.case-forbid {
  background: rgba(239, 68, 68, 0.12);
  border: 1.5px solid rgba(239, 68, 68, 0.35);
}

[data-theme="dark"] .case-card.case-forbid .case-behavior .field-value {
  color: #FEF2F2;
}

[data-theme="dark"] .case-card.case-forbid .case-boundary .field-value {
  color: #FECACA;
}

[data-theme="dark"] .case-card.case-forbid .field-label {
  color: #F87171;
}

/* 卡片顶部 */
.case-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.top-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.case-date {
  font-size: 12px;
  opacity: 0.75;
}

.verdict-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  letter-spacing: 0.5px;
}

/* 操作项 */
.card-operations {
  display: flex;
  gap: 6px;
}

.btn-card-action {
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.15);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

[data-theme="dark"] .btn-card-action {
  border-color: rgba(255, 255, 255, 0.18);
}

.btn-card-edit {
  color: var(--text-primary);
}

.btn-card-edit:hover {
  background: rgba(0, 0, 0, 0.08);
}

[data-theme="dark"] .btn-card-edit:hover {
  background: rgba(255, 255, 255, 0.12);
}

.btn-card-delete {
  color: #DC2626;
  border-color: rgba(220, 38, 38, 0.3);
}

.btn-card-delete:hover {
  background: rgba(220, 38, 38, 0.12);
}

/* 行为与边界内容 */
.case-behavior,
.case-boundary {
  font-size: 13px;
  line-height: 1.5;
}

.field-label {
  font-size: 12px;
}
</style>
