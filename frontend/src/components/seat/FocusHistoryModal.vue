<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { FocusSessionLog, DailyFocusHeatmapItem } from '../../types';
import FocusHeatmap from './FocusHeatmap.vue';
import FocusSessionLogCard from './FocusSessionLogCard.vue';

const props = withDefaults(defineProps<{
  isOpen: boolean;
  logs: FocusSessionLog[];
  heatmapData?: DailyFocusHeatmapItem[];
  currentStreak: number;
  maxStreak: number;
  initialTab?: 'LOGS' | 'HEATMAP';
}>(), {
  heatmapData: () => [],
  initialTab: 'LOGS'
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// 模式选项卡：LOGS (流水明细) | HEATMAP (专注热力图)
type ModalTab = 'LOGS' | 'HEATMAP';
const activeTab = ref<ModalTab>(props.initialTab);

// 弹窗打开时或 initialTab 变化时重置/同步选项卡
watch(() => props.isOpen, (open) => {
  if (open && props.initialTab) {
    activeTab.value = props.initialTab;
  }
});

watch(() => props.initialTab, (tab) => {
  if (tab) {
    activeTab.value = tab;
  }
});

// 选中的热力图日期 (YYYY-MM-DD)
const selectedHeatmapDate = ref<string | null>(null);

function handleSelectDate(date: string | null) {
  selectedHeatmapDate.value = date;
}

function clearDateFilter() {
  selectedHeatmapDate.value = null;
}

// 选中日期的专属日志明细
const selectedDateLogs = computed(() => {
  if (!selectedHeatmapDate.value) return [];
  return props.logs.filter(l => l.startTime && l.startTime.startsWith(selectedHeatmapDate.value!));
});

// 筛选状态：ALL | SUCCESS | REGRET | FAIL
type FilterType = 'ALL' | 'SUCCESS' | 'REGRET' | 'FAIL';
const currentFilter = ref<FilterType>('ALL');

// 过滤后的流水日志 (支持联动热力图选中日期)
const filteredLogs = computed(() => {
  let list = props.logs;
  if (selectedHeatmapDate.value) {
    list = list.filter(l => l.startTime && l.startTime.startsWith(selectedHeatmapDate.value!));
  }
  if (currentFilter.value === 'ALL') {
    return list;
  }
  return list.filter(l => l.status === currentFilter.value);
});

// 统计核心指标
const stats = computed(() => {
  const total = props.logs.length;
  if (total === 0) {
    return {
      total: 0,
      successCount: 0,
      regretCount: 0,
      failCount: 0,
      totalHours: '0.0',
      successRate: '0%'
    };
  }

  const successCount = props.logs.filter(l => l.status === 'SUCCESS').length;
  const regretCount = props.logs.filter(l => l.status === 'REGRET').length;
  const failCount = props.logs.filter(l => l.status === 'FAIL').length;

  // 累加总专注秒数
  const totalSeconds = props.logs.reduce((acc, curr) => acc + (curr.actualDurationSeconds || 0), 0);
  const totalHours = (totalSeconds / 3600).toFixed(1);
  const successRate = total > 0 ? `${Math.round((successCount / total) * 100)}%` : '0%';

  return {
    total,
    successCount,
    regretCount,
    failCount,
    totalHours,
    successRate
  };
});

import { useSacredSeatStore } from '../../stores/sacredSeat';

const seatStore = useSacredSeatStore();
const isExporting = ref(false);
const isImporting = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const feedbackNotice = ref<{ text: string; isError?: boolean } | null>(null);

function showFeedback(text: string, isError = false) {
  feedbackNotice.value = { text, isError };
  setTimeout(() => {
    if (feedbackNotice.value?.text === text) {
      feedbackNotice.value = null;
    }
  }, 3500);
}

async function handleExport() {
  if (isExporting.value) return;
  isExporting.value = true;
  try {
    await seatStore.exportLogs();
    showFeedback('专注记录备份已成功导出');
  } catch (err: any) {
    console.error('Export logs failed', err);
    showFeedback(err?.message || '导出记录失败，请稍后重试', true);
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

async function handleFileSelected(e: Event) {
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

    const result = await seatStore.importLogs(json);
    showFeedback(`成功导入 ${result.importedCount} 条记录 (当前共计 ${result.totalLogs} 条)`);
  } catch (err: any) {
    console.error('Import logs failed', err);
    showFeedback(err?.message || '导入记录失败，请检查文件格式', true);
  } finally {
    isImporting.value = false;
    if (fileInputRef.value) {
      fileInputRef.value.value = '';
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
        <div class="history-modal-card">
          <!-- 1. 弹窗头部 -->
          <div class="modal-header">
            <div class="header-left">
              <div class="header-icon-box">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <div class="title-wrap">
                <h3 class="modal-title">神圣专注历史档案</h3>
                <span class="modal-subtitle font-mono">
                  全量心流深潜与自控履历 · 累计 {{ stats.total }} 次记录
                </span>
              </div>
            </div>

            <!-- 模式切换：流水明细 vs 专注热力图 -->
            <div class="header-center-tabs">
              <div class="mode-segmented-ctrl font-mono">
                <button 
                  class="mode-btn" 
                  :class="{ active: activeTab === 'LOGS' }" 
                  @click="activeTab = 'LOGS'"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                  </svg>
                  <span>流水明细</span>
                </button>
                <button 
                  class="mode-btn" 
                  :class="{ active: activeTab === 'HEATMAP' }" 
                  @click="activeTab = 'HEATMAP'"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                  </svg>
                  <span>全周期热力图</span>
                </button>
              </div>
            </div>

            <!-- 右侧操作区：导出备份、导入备份 -->
            <div class="header-right-actions">
              <button 
                class="btn-action-tool font-mono" 
                title="导出全量专注记录备份 (JSON)"
                :disabled="isExporting"
                @click="handleExport"
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
                title="从 JSON 备份导入专注记录"
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
                @change="handleFileSelected" 
              />
            </div>

            <!-- 退出 X 按钮：直接置于右上角 -->
            <button class="btn-close" @click="emit('close')" title="关闭">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- 反馈提示条 (零侵入浮动提示) -->
          <Transition name="slide-toast">
            <div 
              v-if="feedbackNotice" 
              class="feedback-toast font-mono" 
              :class="{ 'is-error': feedbackNotice.isError }"
            >
              {{ feedbackNotice.text }}
            </div>
          </Transition>

          <!-- ==================== 模式 A: 流水明细视图 ==================== -->
          <div v-show="activeTab === 'LOGS'" class="logs-tab-wrapper">
            <!-- 2. 核心统计数据看板 -->
            <div class="stats-overview-grid">
              <div class="stat-card">
                <div class="stat-card-header">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 14 10"></polyline>
                  </svg>
                  <span class="stat-label">累计专注时长</span>
                </div>
                <div class="stat-val font-mono">
                  {{ stats.totalHours }} <span class="stat-unit">小时</span>
                </div>
                <span class="stat-sub font-mono">全量秒数精确沉淀</span>
              </div>

              <div class="stat-card">
                <div class="stat-card-header">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  <span class="stat-label">专注完成率</span>
                </div>
                <div class="stat-val font-mono text-success">
                  {{ stats.successRate }}
                </div>
                <span class="stat-sub font-mono">成功 {{ stats.successCount }} / 中断 {{ stats.failCount }}</span>
              </div>

              <div class="stat-card">
                <div class="stat-card-header">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                  </svg>
                  <span class="stat-label">当前主链连胜</span>
                </div>
                <div class="stat-val font-mono text-gold">
                  #{{ currentStreak }}
                </div>
                <span class="stat-sub font-mono">连续点亮保持中</span>
              </div>

              <div class="stat-card">
                <div class="stat-card-header">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                    <path d="M4 22h16"></path>
                    <path d="M10 14.66V17c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-2.34"></path>
                    <path d="M18 14.66V17c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1v-2.34"></path>
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2z"></path>
                  </svg>
                  <span class="stat-label">历史最高连胜</span>
                </div>
                <div class="stat-val font-mono">
                  #{{ maxStreak }}
                </div>
                <span class="stat-sub font-mono">历史不败峰值</span>
              </div>
            </div>

            <!-- 3. 状态多维筛选工具栏（固定高度防挤压） -->
            <div class="filter-tabs-wrapper">
              <div class="filter-tabs custom-scrollbar">
                <button 
                  class="tab-pill" 
                  :class="{ active: currentFilter === 'ALL' }" 
                  @click="currentFilter = 'ALL'"
                >
                  <span>全部</span>
                  <span class="tab-badge font-mono">{{ stats.total }}</span>
                </button>
                <button 
                  class="tab-pill pill-success" 
                  :class="{ active: currentFilter === 'SUCCESS' }" 
                  @click="currentFilter = 'SUCCESS'"
                >
                  <span>圆满达成</span>
                  <span class="tab-badge font-mono">{{ stats.successCount }}</span>
                </button>
                <button 
                  class="tab-pill pill-regret" 
                  :class="{ active: currentFilter === 'REGRET' }" 
                  @click="currentFilter = 'REGRET'"
                >
                  <span>后悔药免责</span>
                  <span class="tab-badge font-mono">{{ stats.regretCount }}</span>
                </button>
                <button 
                  class="tab-pill pill-fail" 
                  :class="{ active: currentFilter === 'FAIL' }" 
                  @click="currentFilter = 'FAIL'"
                >
                  <span>违规中断</span>
                  <span class="tab-badge font-mono">{{ stats.failCount }}</span>
                </button>
              </div>
            </div>

            <!-- 日期联动筛选横幅 -->
            <div v-if="selectedHeatmapDate" class="date-filter-banner">
              <div class="banner-left font-mono">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span>热力图联动筛选日期：<strong>{{ selectedHeatmapDate }}</strong></span>
                <span class="banner-count">({{ filteredLogs.length }} 条记录)</span>
              </div>
              <button class="btn-clear-date-filter font-mono" @click="clearDateFilter">
                清除筛选 ✕
              </button>
            </div>

            <!-- 4. 专注记录时间轴清单（独占弹性滚动区） -->
            <div class="logs-scroll-area custom-scrollbar">
              <div v-if="filteredLogs.length === 0" class="empty-state">
                <div class="empty-icon-wrap">
                  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </div>
                <p class="empty-title">暂无对应专注记录</p>
                <span class="empty-desc font-mono">可通过上方分类标签或清除日期筛选查看其他心流</span>
              </div>

              <div v-else class="logs-list">
                <FocusSessionLogCard 
                  v-for="log in filteredLogs" 
                  :key="log.id" 
                  :log="log" 
                />
              </div>
            </div>
          </div>

          <!-- ==================== 模式 B: 专注热力图视图 ==================== -->
          <div v-show="activeTab === 'HEATMAP'" class="heatmap-tab-container custom-scrollbar">
            <!-- 52周贡献热力图主组件 -->
            <FocusHeatmap
              :heatmap-data="heatmapData"
              :selected-date="selectedHeatmapDate"
              @select-date="handleSelectDate"
            />

            <!-- 选定日期的下钻明细面板 -->
            <div v-if="selectedHeatmapDate" class="drilldown-section">
              <div class="drilldown-header">
                <div class="drilldown-title">
                  <span class="drilldown-badge font-mono">{{ selectedHeatmapDate }}</span>
                  <span class="drilldown-summary">当日专注明细 ({{ selectedDateLogs.length }} 条记录)</span>
                </div>
                <div class="drilldown-actions">
                  <button class="btn-switch-to-logs" @click="activeTab = 'LOGS'">
                    在流水明细中筛选此日
                  </button>
                  <button class="btn-clear-filter" @click="clearDateFilter" title="清除选中日期">
                    ✕
                  </button>
                </div>
              </div>

              <div v-if="selectedDateLogs.length === 0" class="drilldown-empty font-mono">
                该日期无专注明细记录
              </div>
              <div v-else class="logs-list">
                <FocusSessionLogCard 
                  v-for="log in selectedDateLogs" 
                  :key="log.id" 
                  :log="log" 
                />
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
  z-index: 1500;
  padding: 24px;
}

.history-modal-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md), 0 30px 70px rgba(0, 0, 0, 0.45);
  border-radius: var(--radius-lg, 16px);
  max-width: 840px;
  width: 100%;
  height: 88vh;
  max-height: 880px;
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
  position: relative;
  flex-shrink: 0;
  padding: 18px 68px 18px 28px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-secondary);
  gap: 16px;
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

/* 头部中央分段控制器 (流水明细 vs 专注热力图) */
.header-center-tabs {
  display: flex;
  align-items: center;
}

.mode-segmented-ctrl {
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full, 9999px);
  padding: 3px;
  gap: 2px;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-full, 9999px);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mode-btn:hover {
  color: var(--text-primary);
}

.mode-btn.active {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 700;
  box-shadow: var(--shadow-sm);
}

.header-right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-action-tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
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

.btn-close {
  position: absolute;
  top: 18px;
  right: 20px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm, 6px);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  z-index: 10;
}

.btn-close:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.btn-close:active {
  transform: scale(0.95);
}

/* 反馈浮动提示条 */
.feedback-toast {
  position: absolute;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 18px;
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

/* 模式 A: 流水明细包裹容器 */
.logs-tab-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 2. 统计数据看板 */
.stats-overview-grid {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 16px 28px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 10px);
  padding: 12px 16px;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-fast);
}

.stat-card:hover {
  border-color: var(--border-focus);
  transform: translateY(-1px);
}

.stat-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
}

.stat-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-val {
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-unit {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-left: 2px;
}

.stat-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.text-success { color: var(--color-success) !important; }
.text-gold { color: var(--color-gold) !important; }
.text-danger { color: var(--color-danger) !important; }

/* 3. 筛选标签栏 */
.filter-tabs-wrapper {
  flex-shrink: 0;
  padding: 14px 28px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.filter-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow-x: auto;
  scrollbar-width: none;
}

.filter-tabs::-webkit-scrollbar {
  display: none;
}

.tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-full, 9999px);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.tab-pill:hover {
  color: var(--text-primary);
  border-color: var(--border-focus);
}

.tab-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
}

:root[data-theme="dark"] .tab-badge {
  background: rgba(255, 255, 255, 0.1);
}

.tab-pill.active {
  background: var(--text-primary);
  color: var(--bg-primary);
  border-color: var(--text-primary);
}

.tab-pill.active .tab-badge {
  background: rgba(0, 0, 0, 0.2);
  color: var(--bg-primary);
}

:root[data-theme="dark"] .tab-pill.active .tab-badge {
  background: rgba(0, 0, 0, 0.25);
  color: var(--bg-primary);
}

.tab-pill.pill-success.active {
  background: var(--color-success);
  color: #ffffff;
  border-color: var(--color-success);
}

.tab-pill.pill-regret.active {
  background: var(--color-gold);
  color: #ffffff;
  border-color: var(--color-gold);
}

.tab-pill.pill-fail.active {
  background: var(--color-danger);
  color: #ffffff;
  border-color: var(--color-danger);
}

/* 日期联动筛选提示条 */
.date-filter-banner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 28px;
  background: rgba(245, 158, 11, 0.08);
  border-bottom: 1px solid rgba(245, 158, 11, 0.25);
  font-size: 12px;
  color: var(--text-primary);
}

.banner-left {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.banner-left strong {
  color: #F59E0B;
}

.banner-count {
  font-size: 11px;
  color: var(--text-muted);
}

.btn-clear-date-filter {
  background: transparent;
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #F59E0B;
  border-radius: var(--radius-sm, 6px);
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-clear-date-filter:hover {
  background: rgba(245, 158, 11, 0.15);
}

/* 4. 清单滚动区 */
.logs-scroll-area {
  flex: 1;
  min-height: 0;
  padding: 20px 28px;
  overflow-y: auto;
  background: var(--bg-card);
}

.empty-state {
  padding: 60px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
}

.empty-icon-wrap {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.empty-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.empty-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ==================== 模式 B: 热力图选项卡容器 ==================== */
.heatmap-tab-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--bg-card);
}

/* 选定日期的下钻明细面板 */
.drilldown-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 10px);
  padding: 18px 20px;
  box-shadow: var(--shadow-sm);
}

.drilldown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.drilldown-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drilldown-badge {
  font-size: 12px;
  font-weight: 700;
  color: #F59E0B;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 2px 8px;
  border-radius: var(--radius-sm, 6px);
}

.drilldown-summary {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.drilldown-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-switch-to-logs {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-switch-to-logs:hover {
  color: var(--text-primary);
  border-color: var(--border-focus);
}

.btn-clear-filter {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: var(--radius-sm, 6px);
  line-height: 1;
  transition: all var(--transition-fast);
}

.btn-clear-filter:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.drilldown-empty {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: 20px 0;
}

/* 优雅滚动条 */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-focus);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
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

/* ================= 移动端专属响应式优化 (<= 768px) ================= */
@media (max-width: 768px) {
  .history-modal-card {
    width: 95vw;
    max-height: 92vh;
    border-radius: var(--radius-md, 12px);
  }

  .modal-header {
    position: relative;
    padding: 12px 14px;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .header-left {
    width: 100%;
    padding-right: 40px;
    justify-content: flex-start;
  }

  .btn-close {
    top: 10px;
    right: 10px;
    width: 36px;
    height: 36px;
  }

  .header-right-actions {
    width: 100%;
    display: flex;
    gap: 8px;
  }

  .header-right-actions .btn-action-tool {
    flex: 1;
    justify-content: center;
    min-height: 36px;
  }

  .modal-title {
    font-size: 14px;
  }

  .tab-switcher {
    width: 100%;
    display: flex;
  }

  .tab-btn {
    flex: 1;
    min-height: 38px;
    font-size: 12px;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .tab-btn:active {
    transform: scale(0.96);
  }

  .stats-overview-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    padding: 10px 12px;
  }

  .stat-card {
    padding: 8px 10px;
  }

  .stat-val {
    font-size: 1.2rem;
  }

  .toolbar-strip {
    padding: 10px 12px;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .filter-pills {
    width: 100%;
    overflow-x: auto;
    gap: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .pill {
    padding: 5px 10px;
    font-size: 11px;
    min-height: 32px;
    -webkit-tap-highlight-color: transparent;
  }

  .pill:active {
    transform: scale(0.95);
  }

  .toolbar-right {
    width: 100%;
    display: flex;
    gap: 8px;
  }

  .btn-tool-export,
  .btn-tool-import {
    flex: 1;
    min-height: 36px;
    font-size: 12px;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .btn-tool-export:active,
  .btn-tool-import:active {
    transform: scale(0.95);
  }

  .logs-scroll-area {
    padding: 12px 12px;
    -webkit-overflow-scrolling: touch;
  }

  .heatmap-tab-container {
    padding: 14px 12px;
    -webkit-overflow-scrolling: touch;
  }

  .drilldown-section {
    padding: 12px 12px;
  }
}
</style>
