<script setup lang="ts">
import { ref, computed } from 'vue';
import { formatCompactDuration } from '../../utils/time';
import type { FocusSessionLog } from '../../types';

const props = defineProps<{
  isOpen: boolean;
  logs: FocusSessionLog[];
  currentStreak: number;
  maxStreak: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// 筛选状态：ALL | SUCCESS | REGRET | FAIL
type FilterType = 'ALL' | 'SUCCESS' | 'REGRET' | 'FAIL';
const currentFilter = ref<FilterType>('ALL');

// 过滤后的流水日志
const filteredLogs = computed(() => {
  if (currentFilter.value === 'ALL') {
    return props.logs;
  }
  return props.logs.filter(l => l.status === currentFilter.value);
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

// 格式化时间戳
function formatDateTime(isoString: string): string {
  if (!isoString) return '--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}`;
}

// 格式化秒数
function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}小时 ${m}分钟`;
  }
  if (m > 0) {
    return `${m}分钟${s > 0 ? ' ' + s + '秒' : ''}`;
  }
  return `${s}秒`;
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

            <button class="btn-close" @click="emit('close')" title="关闭">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

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
              <span class="empty-desc font-mono">可通过上方分类标签切换查看其他历史心流</span>
            </div>

            <div v-else class="logs-list">
              <div 
                v-for="log in filteredLogs" 
                :key="log.id" 
                class="log-card"
                :class="{
                  'status-success': log.status === 'SUCCESS',
                  'status-regret': log.status === 'REGRET',
                  'status-fail': log.status === 'FAIL'
                }"
              >
                <!-- 卡片顶栏：状态徽标与时间戳 -->
                <div class="log-card-header">
                  <div class="log-status-tag font-mono">
                    <template v-if="log.status === 'SUCCESS'">
                      <span class="tag-icon text-success">✓</span>
                      <span class="tag-text">圆满达成 · 主链推进</span>
                    </template>
                    <template v-else-if="log.status === 'REGRET'">
                      <span class="tag-icon text-gold">⟲</span>
                      <span class="tag-text">后悔药免责退出 · 主链保全</span>
                    </template>
                    <template v-else>
                      <span class="tag-icon text-danger">✕</span>
                      <span class="tag-text">违规中断放弃 · 主链清零</span>
                    </template>
                  </div>

                  <span class="log-timestamp font-mono">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="time-icon">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    {{ formatDateTime(log.startTime) }}
                  </span>
                </div>

                <!-- 卡片主要内容：专注目标 -->
                <div class="log-content-row">
                  <span v-if="log.focusContent" class="content-title">
                    {{ log.focusContent }}
                  </span>
                  <span v-else class="content-title text-placeholder">
                    未记录具体专注目标
                  </span>
                </div>

                <!-- 卡片指标行：实际时长 vs 设定目标 -->
                <div class="log-meta-row font-mono">
                  <div class="meta-tag">
                    <span class="meta-label">实际心流</span>
                    <span class="meta-val font-bold" :class="{
                      'text-success': log.status === 'SUCCESS',
                      'text-gold': log.status === 'REGRET',
                      'text-danger': log.status === 'FAIL'
                    }">
                      {{ formatDuration(log.actualDurationSeconds) }}
                    </span>
                  </div>

                  <div class="meta-divider">/</div>

                  <div class="meta-tag">
                    <span class="meta-label">预设目标</span>
                    <span class="meta-val">{{ log.targetDurationMinutes }}分钟</span>
                  </div>

                  <!-- 顺水推舟超额增量药丸 -->
                  <div 
                    v-if="log.status === 'SUCCESS' && (log.actualDurationSeconds - log.targetDurationMinutes * 60) > 0" 
                    class="over-pill font-mono"
                    title="预设时长已满后自发顺水推舟深潜"
                  >
                    +{{ formatCompactDuration(log.actualDurationSeconds - log.targetDurationMinutes * 60) }} 顺水推舟
                  </div>
                </div>

                <!-- 失败原因反思警示框（仅中断时呈现） -->
                <div v-if="log.status === 'FAIL' && log.failureReason" class="failure-reason-card">
                  <div class="reason-header">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>中断原因与自控反思：</span>
                  </div>
                  <p class="reason-text">{{ log.failureReason }}</p>
                </div>

                <!-- 附加备注信息 -->
                <div v-if="log.note && log.note !== log.failureReason" class="log-note-row">
                  <span class="note-text">{{ log.note }}</span>
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
  z-index: 1500;
  padding: 24px;
}

.history-modal-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md), 0 30px 70px rgba(0, 0, 0, 0.45);
  border-radius: var(--radius-lg, 16px);
  max-width: 760px;
  width: 100%;
  height: 86vh;
  max-height: 860px;
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
  padding: 20px 28px;
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

/* 3. 筛选标签栏（关键修复：flex-shrink: 0 彻底杜绝挤压重叠） */
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

/* 激活态高质感配色 */
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

/* 4. 清单滚动区（独占 flex: 1，独立滚轮） */
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

/* 单条专注历史卡片 */
.log-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 10px);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-fast);
}

.log-card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.log-card.status-success {
  border-left: 4px solid var(--color-success);
}

.log-card.status-regret {
  border-left: 4px solid var(--color-gold);
}

.log-card.status-fail {
  border-left: 4px solid var(--color-danger);
}

.log-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log-status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.tag-icon {
  font-weight: 900;
  font-size: 13px;
}

.log-timestamp {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
}

.time-icon {
  color: var(--text-muted);
}

.log-content-row {
  display: flex;
  align-items: center;
}

.content-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.45;
}

.text-placeholder {
  color: var(--text-muted);
  font-weight: 500;
  font-style: italic;
}

/* 指标与时长对比行 */
.log-meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
}

.meta-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  padding: 4px 10px;
  border-radius: var(--radius-sm, 6px);
}

.meta-label {
  color: var(--text-muted);
  font-size: 11px;
}

.meta-val {
  color: var(--text-secondary);
}

.font-bold {
  font-weight: 700;
}

.meta-divider {
  color: var(--border-focus);
}

.over-pill {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-success);
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  padding: 3px 8px;
  border-radius: var(--radius-sm, 6px);
}

/* 失败归因高亮警告框 */
.failure-reason-card {
  background: rgba(244, 63, 94, 0.05);
  border: 1px solid rgba(244, 63, 94, 0.25);
  border-radius: var(--radius-sm, 6px);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.reason-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-danger);
}

.reason-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-primary);
}

.log-note-row {
  font-size: 12px;
  color: var(--text-muted);
  border-top: 1px dashed var(--border-color);
  padding-top: 8px;
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
</style>
