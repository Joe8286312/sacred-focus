<script setup lang="ts">
import { ref } from 'vue';
import { useFocusTreeStore } from '../../stores/focusTree';
import { useSacredSeatStore } from '../../stores/sacredSeat';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const focusStore = useFocusTreeStore();
const seatStore = useSacredSeatStore();

// 状态反馈
const toastNotice = ref<{ text: string; isError?: boolean } | null>(null);
let toastTimer: any = null;

function showToast(text: string, isError = false) {
  toastNotice.value = { text, isError };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastNotice.value = null;
  }, 4000);
}

// ================= 全系统全量迁移状态 =================
const isExportingFull = ref(false);
const isImportingFull = ref(false);
const fullFileInputRef = ref<HTMLInputElement | null>(null);
const pendingFullBackup = ref<any | null>(null);
const isConfirmingFullImport = ref(false);

async function handleExportFull() {
  if (isExportingFull.value) return;
  isExportingFull.value = true;
  try {
    const ok = await focusStore.exportFullSystemBackup();
    if (ok) {
      showToast('全系统镜像备份已生成并触发下载');
    } else {
      showToast('导出全系统镜像失败', true);
    }
  } catch (err: any) {
    showToast(err?.message || '导出全系统镜像失败', true);
  } finally {
    isExportingFull.value = false;
  }
}

function triggerFullImportFile() {
  if (fullFileInputRef.value) {
    fullFileInputRef.value.value = '';
    fullFileInputRef.value.click();
  }
}

function onFullFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string);
      const tree = data?.focusTree || data?.liveTree;
      if (!data || !tree) {
        showToast('备份文件格式不合法，缺少国策树数据', true);
        return;
      }
      pendingFullBackup.value = data;
      isConfirmingFullImport.value = true;
    } catch {
      showToast('文件解析失败，请提供合法的 JSON 文件', true);
    }
  };
  reader.readAsText(file);
}

async function executeFullImport() {
  if (!pendingFullBackup.value) return;
  isImportingFull.value = true;
  try {
    const res = await focusStore.importFullSystemBackup(pendingFullBackup.value);
    if (res.success) {
      await Promise.all([
        seatStore.fetchLogs(),
        seatStore.fetchHeatmapData(),
        seatStore.fetchConfig()
      ]);
      isConfirmingFullImport.value = false;
      pendingFullBackup.value = null;
      showToast('全系统整机镜像已成功恢复！各模块数据均已就绪');
    } else {
      showToast(res.error || '整机恢复失败', true);
    }
  } catch (err: any) {
    showToast(err?.message || '整机恢复异常', true);
  } finally {
    isImportingFull.value = false;
    if (fullFileInputRef.value) {
      fullFileInputRef.value.value = '';
    }
  }
}

// ================= 模块 1：国策架构独立归档 =================
const isExportingTree = ref(false);
const isImportingTree = ref(false);
const treeFileInputRef = ref<HTMLInputElement | null>(null);

async function handleExportTree() {
  if (isExportingTree.value) return;
  isExportingTree.value = true;
  try {
    const ok = await focusStore.exportSystemBackup();
    if (ok) showToast('国策架构备份已成功导出');
    else showToast('导出国策架构失败', true);
  } finally {
    isExportingTree.value = false;
  }
}

function triggerTreeImport() {
  if (treeFileInputRef.value) {
    treeFileInputRef.value.value = '';
    treeFileInputRef.value.click();
  }
}

async function onTreeFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  isImportingTree.value = true;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const ok = await focusStore.importSystemBackup(data);
    if (ok) {
      showToast('国策架构备份导入成功，画布与演化树已重构');
    } else {
      showToast('导入国策架构失败', true);
    }
  } catch (err: any) {
    showToast(err?.message || '导入国策架构失败', true);
  } finally {
    isImportingTree.value = false;
    if (treeFileInputRef.value) treeFileInputRef.value.value = '';
  }
}

// ================= 模块 2：专注流水独立归档 =================
const isExportingLogs = ref(false);
const isImportingLogs = ref(false);
const logsFileInputRef = ref<HTMLInputElement | null>(null);

async function handleExportLogs() {
  if (isExportingLogs.value) return;
  isExportingLogs.value = true;
  try {
    await seatStore.exportLogs();
    showToast('专注记录流水备份已成功导出');
  } catch (err: any) {
    showToast(err?.message || '导出记录失败', true);
  } finally {
    isExportingLogs.value = false;
  }
}

function triggerLogsImport() {
  if (logsFileInputRef.value) {
    logsFileInputRef.value.value = '';
    logsFileInputRef.value.click();
  }
}

async function onLogsFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  isImportingLogs.value = true;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const res = await seatStore.importLogs(json);
    showToast(`成功增量导入 ${res.importedCount} 条专注记录 (共计 ${res.totalLogs} 条)`);
  } catch (err: any) {
    showToast(err?.message || '导入专注记录失败', true);
  } finally {
    isImportingLogs.value = false;
    if (logsFileInputRef.value) logsFileInputRef.value.value = '';
  }
}

// ================= 模块 3：判例法典独立归档 =================
const isExportingCases = ref(false);
const isImportingCases = ref(false);
const casesFileInputRef = ref<HTMLInputElement | null>(null);

async function handleExportCases() {
  if (isExportingCases.value) return;
  isExportingCases.value = true;
  try {
    const res = await fetch('/api/cases/export');
    if (!res.ok) throw new Error(res.statusText);
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
    showToast('判例法典备份已成功导出');
  } catch (err: any) {
    showToast(err?.message || '导出判例失败', true);
  } finally {
    isExportingCases.value = false;
  }
}

function triggerCasesImport() {
  if (casesFileInputRef.value) {
    casesFileInputRef.value.value = '';
    casesFileInputRef.value.click();
  }
}

async function onCasesFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  isImportingCases.value = true;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const res = await fetch('/api/cases/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json)
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || '导入失败');
    showToast(`成功增量导入 ${result.importedCount} 条判例 (共计 ${result.totalCases} 条)`);
  } catch (err: any) {
    showToast(err?.message || '导入判例失败', true);
  } finally {
    isImportingCases.value = false;
    if (casesFileInputRef.value) casesFileInputRef.value.value = '';
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
        <div class="migration-card">
          <!-- 1. 弹窗头部 -->
          <div class="modal-header">
            <div class="header-left">
              <div class="header-icon-box">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
              </div>
              <div class="title-wrap">
                <h3 class="modal-title">系统数据中枢 · 跨设备迁移</h3>
                <span class="modal-subtitle font-mono">
                  全量整机迁移镜像与领域数据独立归档控制台
                </span>
              </div>
            </div>

            <button class="btn-close" @click="emit('close')" title="关闭">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- 反馈提示条 (浮动通知) -->
          <Transition name="slide-toast">
            <div v-if="toastNotice" class="feedback-toast font-mono" :class="{ 'is-error': toastNotice.isError }">
              {{ toastNotice.text }}
            </div>
          </Transition>

          <!-- 2. 弹窗主体 (可平滑滚动) -->
          <div class="modal-body custom-scrollbar">
            <!-- 分区一：全量整机跨设备搬家 (核心主卡片) -->
            <div class="section-full-system">
              <div class="section-title-row">
                <div class="title-with-pill">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                  <span class="section-title">全系统整机跨设备搬家</span>
                  <span class="badge-accent font-mono">全量快照镜像</span>
                </div>
                <span class="section-desc">
                  一键完整打包或整机还原国策树、演化版本快照、专注流水记录与判罚宝典。
                </span>
              </div>

              <!-- 导入二次确认防误触横幅 -->
              <div v-if="isConfirmingFullImport" class="full-import-confirm-box">
                <div class="confirm-head">
                  <span class="danger-dot"></span>
                  <strong>警告：整机恢复将彻底清空并重构全库所有数据！</strong>
                </div>
                <div class="confirm-stats-grid font-mono">
                  <div class="stat-pill">
                    <span class="stat-lbl">国策节点</span>
                    <span class="stat-num">{{ (pendingFullBackup?.focusTree?.nodes || pendingFullBackup?.liveTree?.nodes)?.length || 0 }}</span>
                  </div>
                  <div class="stat-pill">
                    <span class="stat-lbl">国策分组</span>
                    <span class="stat-num">{{ (pendingFullBackup?.focusTree?.groups || pendingFullBackup?.liveTree?.groups)?.length || 0 }}</span>
                  </div>
                  <div class="stat-pill">
                    <span class="stat-lbl">演化快照</span>
                    <span class="stat-num">{{ pendingFullBackup?.evolution?.snapshots?.length || 0 }}</span>
                  </div>
                  <div class="stat-pill">
                    <span class="stat-lbl">专注流水</span>
                    <span class="stat-num">{{ pendingFullBackup?.sessionLogs?.length || 0 }}</span>
                  </div>
                  <div class="stat-pill">
                    <span class="stat-lbl">判罚法典</span>
                    <span class="stat-num">{{ pendingFullBackup?.precedentCases?.length || 0 }}</span>
                  </div>
                </div>
                <p class="confirm-desc">
                  已解析完整镜像备份。点击确认将以备份文件全面覆盖当前设备所有数据，该操作不可逆。
                </p>
                <div class="confirm-btn-row">
                  <button class="btn-danger-confirm font-mono" :disabled="isImportingFull" @click="executeFullImport">
                    {{ isImportingFull ? '写入恢复中...' : '确认整机写入恢复' }}
                  </button>
                  <button class="btn-cancel font-mono" :disabled="isImportingFull" @click="isConfirmingFullImport = false; pendingFullBackup = null">
                    取消
                  </button>
                </div>
              </div>

              <!-- 全量操作按钮卡片 -->
              <div v-else class="full-actions-card">
                <div class="full-info">
                  <span class="full-main-text">一键生成全系统整机 JSON 归档</span>
                  <span class="full-sub-text">适用于换机搬迁、云端冷备与系统灾备重建</span>
                </div>
                <div class="full-btn-group">
                  <button 
                    class="btn-full-export font-mono" 
                    :disabled="isExportingFull" 
                    @click="handleExportFull"
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>{{ isExportingFull ? '导出中...' : '导出全量镜像' }}</span>
                  </button>

                  <button 
                    class="btn-full-import font-mono" 
                    :disabled="isImportingFull" 
                    @click="triggerFullImportFile"
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <span>{{ isImportingFull ? '解析中...' : '从镜像整机恢复' }}</span>
                  </button>

                  <input 
                    ref="fullFileInputRef" 
                    type="file" 
                    accept=".json" 
                    style="display: none;" 
                    @change="onFullFileSelected" 
                  />
                </div>
              </div>
            </div>

            <!-- 分区二：三模块独立数据归档通道 -->
            <div class="section-domains">
              <div class="section-title-row">
                <div class="title-with-pill">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                  <span class="section-title">领域数据独立归档通道</span>
                  <span class="badge-neutral font-mono">模块自治 · 互不干扰</span>
                </div>
                <span class="section-desc">
                  单独备份或合流某一特定模块数据，导入时绝不触碰或覆盖其他领域记录。
                </span>
              </div>

              <div class="domains-grid">
                <!-- 卡片 1: 国策架构 -->
                <div class="domain-card">
                  <div class="domain-card-header">
                    <div class="domain-icon-box icon-tree">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                      </svg>
                    </div>
                    <div class="domain-meta">
                      <span class="domain-name">国策架构与演化</span>
                      <span class="domain-sub font-mono">画布拓扑 / 分组空间 / 5槽快照</span>
                    </div>
                  </div>
                  <p class="domain-info-text">
                    仅归档节点定义、空间排版与演化快照，便于国策方案独立分享，绝不影响专注流水与判例。
                  </p>
                  <div class="domain-card-actions">
                    <button class="btn-domain-action font-mono" :disabled="isExportingTree" @click="handleExportTree">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      <span>{{ isExportingTree ? '导出中...' : '导出' }}</span>
                    </button>
                    <button class="btn-domain-action font-mono" :disabled="isImportingTree" @click="triggerTreeImport">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      <span>{{ isImportingTree ? '导入中...' : '导入' }}</span>
                    </button>
                    <input ref="treeFileInputRef" type="file" accept=".json" style="display: none;" @change="onTreeFileSelected" />
                  </div>
                </div>

                <!-- 卡片 2: 专注流水 -->
                <div class="domain-card">
                  <div class="domain-card-header">
                    <div class="domain-icon-box icon-seat">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                    </div>
                    <div class="domain-meta">
                      <span class="domain-name">神圣专注历史档案</span>
                      <span class="domain-sub font-mono">秒级流水 / 连胜打卡 / 52周热力图</span>
                    </div>
                  </div>
                  <p class="domain-info-text">
                    完整导出或幂等增量合流心流履历，支持跨设备合并专注记录，绝不破坏现有国策树结构。
                  </p>
                  <div class="domain-card-actions">
                    <button class="btn-domain-action font-mono" :disabled="isExportingLogs" @click="handleExportLogs">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      <span>{{ isExportingLogs ? '导出中...' : '导出' }}</span>
                    </button>
                    <button class="btn-domain-action font-mono" :disabled="isImportingLogs" @click="triggerLogsImport">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      <span>{{ isImportingLogs ? '导入中...' : '导入' }}</span>
                    </button>
                    <input ref="logsFileInputRef" type="file" accept=".json" style="display: none;" @change="onLogsFileSelected" />
                  </div>
                </div>

                <!-- 卡片 3: 判例法典 -->
                <div class="domain-card">
                  <div class="domain-card-header">
                    <div class="domain-icon-box icon-cases">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      </svg>
                    </div>
                    <div class="domain-meta">
                      <span class="domain-name">下必为例判罚宝典</span>
                      <span class="domain-sub font-mono">终身允许 / 绝对禁止 / 裁决边界</span>
                    </div>
                  </div>
                  <p class="domain-info-text">
                    独立归档并幂等合流高摩擦力防破窗判例库，支持分享法则方案，绝不触碰专注记录与国策。
                  </p>
                  <div class="domain-card-actions">
                    <button class="btn-domain-action font-mono" :disabled="isExportingCases" @click="handleExportCases">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      <span>{{ isExportingCases ? '导出中...' : '导出' }}</span>
                    </button>
                    <button class="btn-domain-action font-mono" :disabled="isImportingCases" @click="triggerCasesImport">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      <span>{{ isImportingCases ? '导入中...' : '导入' }}</span>
                    </button>
                    <input ref="casesFileInputRef" type="file" accept=".json" style="display: none;" @change="onCasesFileSelected" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1600;
  padding: 24px;
}

.migration-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md), 0 30px 70px rgba(0, 0, 0, 0.45);
  border-radius: var(--radius-lg, 16px);
  max-width: 860px;
  width: 100%;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.97) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* 1. 头部 */
.modal-header {
  flex-shrink: 0;
  padding: 18px 28px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-secondary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-icon-box {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md, 10px);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--color-lit);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 16px var(--color-lit-glow);
}

.title-wrap {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.modal-title {
  margin: 0;
  font-size: 1.22rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.modal-subtitle {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px;
  border-radius: var(--radius-sm, 6px);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.btn-close:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

/* 反馈浮动提示条 */
.feedback-toast {
  position: absolute;
  top: 74px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 20px;
  border-radius: var(--radius-full, 9999px);
  background: var(--bg-secondary);
  border: 1px solid var(--border-focus);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  color: var(--color-lit);
  font-size: 12px;
  font-weight: 600;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.feedback-toast.is-error {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.slide-toast-enter-active,
.slide-toast-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-toast-enter-from,
.slide-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}

/* 2. 主体滚动区 */
.modal-body {
  padding: 24px 28px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 26px;
}

.section-title-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
}

.title-with-pill {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.badge-accent {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-lit-glow);
  color: var(--color-lit);
  border: 1px solid var(--color-lit);
}

.badge-neutral {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.section-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 分区一：全量系统整机卡片 */
.section-full-system {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 10px);
  padding: 18px 20px;
}

.full-actions-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border-radius: var(--radius-sm, 8px);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.full-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.full-main-text {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.full-sub-text {
  font-size: 11px;
  color: var(--text-muted);
}

.full-btn-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.btn-full-export {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border-focus);
  background: var(--color-lit-glow);
  color: var(--color-lit);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-full-export:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px var(--color-lit-glow);
}

.btn-full-import {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-full-import:hover:not(:disabled) {
  border-color: var(--border-focus);
  color: var(--color-lit);
}

/* 导入确认警示框 */
.full-import-confirm-box {
  background: var(--bg-card);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm, 8px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-danger);
  font-size: 13px;
}

.danger-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-danger);
  box-shadow: 0 0 8px var(--color-danger);
}

.confirm-stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.stat-pill {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 6px 10px;
  border-radius: var(--radius-sm, 6px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
}

.stat-lbl {
  font-size: 10px;
  color: var(--text-muted);
}

.stat-num {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.confirm-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.confirm-btn-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-danger-confirm {
  background: var(--color-danger);
  color: #fff;
  border: none;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 16px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-danger-confirm:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-cancel {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  font-size: 12px;
  padding: 7px 14px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
}

.btn-cancel:hover:not(:disabled) {
  color: var(--text-primary);
}

/* 分区二：三模块网格 */
.domains-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.domain-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 10px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  transition: all var(--transition-fast);
}

.domain-card:hover {
  border-color: var(--border-focus);
}

.domain-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.domain-icon-box {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm, 8px);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-tree { color: #3b82f6; }
.icon-seat { color: var(--color-lit); }
.icon-cases { color: #10b981; }

.domain-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.domain-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.domain-sub {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.domain-info-text {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
  flex: 1;
}

.domain-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.btn-domain-action {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 0;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-domain-action:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-focus);
  background: var(--bg-tertiary);
}

.btn-domain-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 滚动条 */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-focus);
  border-radius: 4px;
}

/* 动效 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
