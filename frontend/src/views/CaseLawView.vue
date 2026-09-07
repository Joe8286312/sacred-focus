<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
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

const confirmingDeleteId = ref<string | null>(null);
const feedbackNotice = ref<{ text: string; isError?: boolean } | null>(null);

function showFeedback(text: string, isError = false) {
  feedbackNotice.value = { text, isError };
  setTimeout(() => {
    if (feedbackNotice.value?.text === text) {
      feedbackNotice.value = null;
    }
  }, 3500);
}

function openAddModal() {
  editingCase.value = null;
  isModalOpen.value = true;
}

function openEditModal(item: PrecedentCase) {
  editingCase.value = { ...item };
  isModalOpen.value = true;
}

async function confirmDelete(item: PrecedentCase) {
  confirmingDeleteId.value = null;
  try {
    const res = await fetch(`/api/cases/${item.id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      cases.value = cases.value.filter(c => c.id !== item.id);
      showFeedback(`已彻底删除判例【${item.behavior}】`);
    } else {
      showFeedback('删除失败，请稍后重试', true);
    }
  } catch (err) {
    console.error('Failed to delete case', err);
    showFeedback('网络异常，请重试', true);
  }
}

function handleSavedCase() {
  fetchCases();
}

const isExporting = ref(false);
const isImporting = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

async function handleExportCases() {
  if (isExporting.value) return;
  isExporting.value = true;
  try {
    const res = await fetch('/api/cases/export');
    if (!res.ok) {
      throw new Error(`导出判例失败: ${res.statusText}`);
    }
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `precedent-cases-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showFeedback('判罚宝典备份已成功导出');
  } catch (err: any) {
    console.error('Export cases failed', err);
    showFeedback(err?.message || '导出判例失败，请稍后重试', true);
  } finally {
    isExporting.value = false;
  }
}

function triggerFileInput() {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
}

async function handleFileImport(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  isImporting.value = true;
  try {
    const text = await file.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('所选文件非合法的 JSON 格式');
    }

    const res = await fetch('/api/cases/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json)
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || '导入判例失败');
    }

    await fetchCases();
    showFeedback(`成功导入 ${result.importedCount} 条判例 (当前共计 ${result.totalCases} 条)`);
  } catch (err: any) {
    console.error('Import cases failed', err);
    showFeedback(err?.message || '导入判例失败，请检查文件格式', true);
  } finally {
    isImporting.value = false;
    if (fileInputRef.value) {
      fileInputRef.value.value = '';
    }
  }
}

function onCasesRefreshed() {
  fetchCases();
}

onMounted(() => {
  fetchCases();
  window.addEventListener('sacred-focus:refresh-cases', onCasesRefreshed);
});

onUnmounted(() => {
  window.removeEventListener('sacred-focus:refresh-cases', onCasesRefreshed);
});
</script>

<template>
  <div class="cases-view-container">
    <!-- 顶部反馈提示条 (0 侵入，替代原生 alert) -->
    <Transition name="slide-down">
      <div 
        v-if="feedbackNotice" 
        class="feedback-toast font-mono"
        :class="{ 'is-error': feedbackNotice.isError }"
      >
        {{ feedbackNotice.text }}
      </div>
    </Transition>

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

        <!-- 显式添加判例入口 (移动端第1行右侧) -->
        <button class="btn-add-case" @click="openAddModal">
          + 添加判例
        </button>

        <!-- 备份与迁移：导出、导入 (移动端第2行) -->
        <div class="case-backup-tools">
          <button 
            class="btn-action-tool font-mono" 
            title="导出判例法典备份 (JSON)" 
            :disabled="isExporting"
            @click="handleExportCases"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>{{ isExporting ? '导出中...' : '导出' }}</span>
          </button>

          <button 
            class="btn-action-tool font-mono" 
            title="从 JSON 备份导入判例" 
            :disabled="isImporting"
            @click="triggerFileInput"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>{{ isImporting ? '导入中...' : '导入' }}</span>
          </button>

          <input 
            ref="fileInputRef" 
            type="file" 
            accept=".json" 
            style="display: none;" 
            @change="handleFileImport" 
          />
        </div>
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

          <!-- 判例操作项：修改与二次确认删除 -->
          <div class="card-operations" @click.stop>
            <template v-if="confirmingDeleteId === item.id">
              <span class="confirm-del-label font-mono">确定删除？</span>
              <button class="btn-card-action btn-confirm-del-inline" @click="confirmDelete(item)">
                确认
              </button>
              <button class="btn-card-action btn-cancel-del-inline" @click="confirmingDeleteId = null">
                取消
              </button>
            </template>
            <template v-else>
              <button class="btn-card-action btn-card-edit" @click="openEditModal(item)">
                修改
              </button>
              <button class="btn-card-action btn-card-delete" @click="confirmingDeleteId = item.id">
                删除
              </button>
            </template>
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

.btn-action-tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.btn-action-tool:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-focus);
  background: var(--bg-tertiary);
}

.btn-action-tool:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  flex: 1;
  min-height: 0;
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
  align-items: center;
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

[data-theme="dark"] .btn-card-delete {
  color: #F87171;
  border-color: rgba(248, 113, 113, 0.35);
}

.btn-card-delete:hover {
  background: rgba(220, 38, 38, 0.12);
}

/* 二次确认删除行内控件 */
.confirm-del-label {
  font-size: 11px;
  font-weight: 600;
  color: #DC2626;
  margin-right: 2px;
}

[data-theme="dark"] .confirm-del-label {
  color: #F87171;
}

.btn-confirm-del-inline {
  background: #EF4444;
  color: #FFFFFF;
  border: 1px solid #EF4444;
  font-weight: 600;
}

.btn-confirm-del-inline:hover {
  background: #DC2626;
}

.btn-cancel-del-inline {
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-cancel-del-inline:hover {
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.08);
}

[data-theme="dark"] .btn-cancel-del-inline:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* 顶部反馈浮条 */
.feedback-toast {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-secondary);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: var(--color-success);
  padding: 8px 20px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--shadow-md);
  z-index: 100;
  pointer-events: none;
}

.feedback-toast.is-error {
  border-color: rgba(239, 68, 68, 0.4);
  color: var(--color-danger);
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

/* ================= 移动端专属响应式优化 (<= 768px) ================= */
@media (max-width: 768px) {
  .cases-view-container {
    padding: 12px 10px;
    gap: 12px;
  }

  .cases-header {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding-bottom: 12px;
  }

  .page-title {
    font-size: 16px;
  }

  .cases-subtitle {
    font-size: 11.5px;
    line-height: 1.4;
  }

  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .filter-pills {
    display: flex;
    gap: 6px;
  }

  .btn-add-case {
    padding: 6px 14px;
    min-height: 36px;
    font-size: 12px;
    font-weight: 600;
  }

  .btn-add-case:active {
    transform: scale(0.95);
  }

  /* 移动端第2行：导出与导入按钮并排均分 */
  .case-backup-tools {
    width: 100%;
    display: flex;
    gap: 8px;
  }

  .case-backup-tools .btn-action-tool {
    flex: 1;
    justify-content: center;
    min-height: 36px;
    font-size: 12px;
  }

  .btn-action-tool:active {
    transform: scale(0.95);
  }

  .case-card {
    padding: 14px 12px;
    gap: 8px;
  }

  .case-top {
    flex-wrap: wrap;
    gap: 8px;
  }

  .btn-card-action {
    min-height: 32px;
    padding: 4px 10px;
    font-size: 12px;
  }
}
</style>
