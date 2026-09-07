<script setup lang="ts">
import { formatCompactDuration } from '../../utils/time';
import type { FocusSessionLog } from '../../types';

defineProps<{
  log: FocusSessionLog;
}>();

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
  <div 
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
</template>

<style scoped>
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

.text-success { color: var(--color-success) !important; }
.text-gold { color: var(--color-gold) !important; }
.text-danger { color: var(--color-danger) !important; }
</style>
