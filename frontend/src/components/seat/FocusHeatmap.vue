<script setup lang="ts">
import { ref, computed } from 'vue';
import type { DailyFocusHeatmapItem } from '../../types';

const props = defineProps<{
  heatmapData: DailyFocusHeatmapItem[];
  selectedDate?: string | null;
}>();

const emit = defineEmits<{
  (e: 'select-date', date: string | null): void;
}>();

// 悬停提示 Tooltip 状态
const tooltipState = ref<{
  visible: boolean;
  x: number;
  y: number;
  dateStr: string;
  totalSeconds: number;
  totalSessions: number;
  successCount: number;
  regretCount: number;
  failCount: number;
} | null>(null);

// 映射日期字典 (date -> DailyFocusHeatmapItem)
const dataMap = computed(() => {
  const map = new Map<string, DailyFocusHeatmapItem>();
  for (const item of props.heatmapData) {
    map.set(item.date, item);
  }
  return map;
});

// 计算 52 周滚动日历网格
interface HeatmapDay {
  dateStr: string;
  dayOfWeek: number; // 1 (Mon) ~ 7 (Sun)
  isFuture: boolean;
  isToday: boolean;
  month: number;
  day: number;
  totalSeconds: number;
  totalSessions: number;
  successCount: number;
  regretCount: number;
  failCount: number;
  level: number; // 0 ~ 4
}

interface HeatmapWeek {
  days: HeatmapDay[];
  monthLabel?: string;
}

const calendarData = computed(() => {
  const today = new Date();
  const todayStr = formatDate(today);

  // 当周周日为网格截止日 (1=周一 ... 7=周日)
  const currentDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + (7 - currentDayOfWeek));
  endDate.setHours(23, 59, 59, 999);

  // 往前推 52 周 (52 * 7 = 364 天)
  const totalDays = 52 * 7;
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - totalDays + 1);
  startDate.setHours(0, 0, 0, 0);

  const weeks: HeatmapWeek[] = [];
  let cur = new Date(startDate);
  let lastMonth = -1;

  for (let w = 0; w < 52; w++) {
    const days: HeatmapDay[] = [];
    let weekMonthLabel: string | undefined = undefined;

    for (let d = 0; d < 7; d++) {
      const dateStr = formatDate(cur);
      const isFuture = cur.getTime() > today.getTime() && dateStr !== todayStr;
      const isToday = dateStr === todayStr;
      const curMonth = cur.getMonth() + 1;

      // 提取当日数据
      const record = dataMap.value.get(dateStr);
      const totalSec = record ? record.totalSeconds : 0;
      const totalSessions = record ? record.totalSessions : 0;
      const successCount = record ? record.successCount : 0;
      const regretCount = record ? record.regretCount : 0;
      const failCount = record ? record.failCount : 0;

      // 计算色相等级 (0 ~ 4)
      let level = 0;
      if (totalSec > 0) {
        if (totalSec < 1800) {
          level = 1; // 1~29 分钟
        } else if (totalSec < 3600) {
          level = 2; // 30~59 分钟
        } else if (totalSec < 7200) {
          level = 3; // 60~119 分钟
        } else {
          level = 4; // 120 分钟以上 (深潜 2小时+)
        }
      }

      // 月份标签判定：当周包含某月第 1~7 天且跨月
      if (cur.getDate() <= 7 && curMonth !== lastMonth && !weekMonthLabel) {
        weekMonthLabel = `${curMonth}月`;
        lastMonth = curMonth;
      }

      days.push({
        dateStr,
        dayOfWeek: d + 1,
        isFuture,
        isToday,
        month: curMonth,
        day: cur.getDate(),
        totalSeconds: totalSec,
        totalSessions,
        successCount,
        regretCount,
        failCount,
        level
      });

      cur.setDate(cur.getDate() + 1);
    }

    weeks.push({ days, monthLabel: weekMonthLabel });
  }

  return weeks;
});

// 统计核心指标：年度总时长、活跃天数、最长连续、当前连续
const heatmapStats = computed(() => {
  let totalSeconds = 0;
  let activeDays = 0;
  let maxDailyStreak = 0;
  let tempStreak = 0;

  // 按日期正序遍历全部历史日历天
  const allDays: HeatmapDay[] = [];
  for (const w of calendarData.value) {
    for (const d of w.days) {
      if (!d.isFuture) {
        allDays.push(d);
      }
    }
  }

  for (const day of allDays) {
    if (day.totalSeconds > 0) {
      totalSeconds += day.totalSeconds;
      activeDays += 1;
      tempStreak += 1;
      if (tempStreak > maxDailyStreak) {
        maxDailyStreak = tempStreak;
      }
    } else {
      tempStreak = 0;
    }
  }

  // 计算当前连续天数 (从今天或昨天往前回溯)
  let currentDailyStreak = 0;
  let checkIndex = allDays.length - 1;

  // 如果今天尚未专注，从昨天开始算
  if (checkIndex >= 0 && allDays[checkIndex].totalSeconds === 0) {
    checkIndex -= 1;
  }

  while (checkIndex >= 0 && allDays[checkIndex].totalSeconds > 0) {
    currentDailyStreak += 1;
    checkIndex -= 1;
  }

  const totalHours = (totalSeconds / 3600).toFixed(1);
  const activeRate = allDays.length > 0 ? `${((activeDays / allDays.length) * 100).toFixed(1)}%` : '0%';
  const avgHoursPerActiveDay = activeDays > 0 ? (totalSeconds / activeDays / 3600).toFixed(1) : '0.0';

  return {
    totalHours,
    activeDays,
    activeRate,
    maxDailyStreak,
    currentDailyStreak,
    avgHoursPerActiveDay,
    trackedDays: allDays.length
  };
});

function formatDate(d: Date): string {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
}

// 格式化秒数为易读字符串
function formatDurationZh(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  if (sec === 0) return '0 分钟';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  let res = '';
  if (h > 0) res += `${h} 小时 `;
  if (m > 0) res += `${m} 分钟 `;
  if (s > 0 && h === 0) res += `${s} 秒`;
  return res.trim() || '0 分钟';
}

function getDayOfWeekZh(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return days[d.getDay()];
}

// 处理鼠标交互
function handleCellMouseEnter(day: HeatmapDay, event: MouseEvent) {
  if (day.isFuture) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  tooltipState.value = {
    visible: true,
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
    dateStr: day.dateStr,
    totalSeconds: day.totalSeconds,
    totalSessions: day.totalSessions,
    successCount: day.successCount,
    regretCount: day.regretCount,
    failCount: day.failCount
  };
}

function handleCellMouseLeave() {
  tooltipState.value = null;
}

function handleCellClick(day: HeatmapDay) {
  if (day.isFuture) return;
  if (props.selectedDate === day.dateStr) {
    emit('select-date', null); // 再次点击取消选择
  } else {
    emit('select-date', day.dateStr);
  }
}
</script>

<template>
  <div class="focus-heatmap-root">
    <!-- 1. 全周期宏观核心指标看板 -->
    <div class="heatmap-stats-bar">
      <div class="stat-pill-item">
        <span class="stat-pill-label">年度累计投入</span>
        <span class="stat-pill-value font-mono">{{ heatmapStats.totalHours }} <small>小时</small></span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-pill-item">
        <span class="stat-pill-label">年度活跃天数</span>
        <span class="stat-pill-value font-mono">{{ heatmapStats.activeDays }} <small>天 ({{ heatmapStats.activeRate }})</small></span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-pill-item">
        <span class="stat-pill-label">最长连续专注</span>
        <span class="stat-pill-value font-mono highlight-gold">{{ heatmapStats.maxDailyStreak }} <small>天连续</small></span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-pill-item">
        <span class="stat-pill-label">当前连续专注</span>
        <span class="stat-pill-value font-mono highlight-success">{{ heatmapStats.currentDailyStreak }} <small>天</small></span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-pill-item">
        <span class="stat-pill-label">活跃日均时长</span>
        <span class="stat-pill-value font-mono">{{ heatmapStats.avgHoursPerActiveDay }} <small>小时/天</small></span>
      </div>
    </div>

    <!-- 2. 日历热力图主体区域 (可横向滚动) -->
    <div class="heatmap-scroll-container">
      <div class="heatmap-board">
        <!-- 顶部月份指示轴 -->
        <div class="month-labels-row">
          <div class="weekday-placeholder"></div>
          <div class="month-labels-track">
            <div 
              v-for="(week, wIdx) in calendarData" 
              :key="wIdx" 
              class="month-label-col font-mono"
            >
              <span v-if="week.monthLabel">{{ week.monthLabel }}</span>
            </div>
          </div>
        </div>

        <!-- 网格主体：左侧星期标记 + 52 周单元格矩阵 -->
        <div class="grid-main-row">
          <!-- 左侧星期标记 -->
          <div class="weekday-labels-col font-mono">
            <span>周一</span>
            <span>&nbsp;</span>
            <span>周三</span>
            <span>&nbsp;</span>
            <span>周五</span>
            <span>&nbsp;</span>
            <span>周日</span>
          </div>

          <!-- 52 列周方格 -->
          <div class="weeks-columns-wrap">
            <div 
              v-for="(week, wIdx) in calendarData" 
              :key="wIdx" 
              class="week-column"
            >
              <div 
                v-for="day in week.days" 
                :key="day.dateStr"
                class="day-cell"
                :class="[
                  `level-${day.level}`,
                  { 
                    'is-future': day.isFuture,
                    'is-today': day.isToday,
                    'is-selected': selectedDate === day.dateStr
                  }
                ]"
                @mouseenter="handleCellMouseEnter(day, $event)"
                @mouseleave="handleCellMouseLeave"
                @click="handleCellClick(day)"
              ></div>
            </div>
          </div>
        </div>

        <!-- 底部说明与图例 -->
        <div class="heatmap-footer">
          <div class="footer-hint font-mono">
            <span v-if="selectedDate" class="selected-hint">
              已选定：{{ selectedDate }} · 点击可取消筛选
            </span>
            <span v-else>
              滚动 52 周自控投入分布 · 点击单元格联动下方流水
            </span>
          </div>

          <div class="legend-box font-mono">
            <span class="legend-text">较少</span>
            <span class="legend-cell level-0"></span>
            <span class="legend-cell level-1"></span>
            <span class="legend-cell level-2"></span>
            <span class="legend-cell level-3"></span>
            <span class="legend-cell level-4"></span>
            <span class="legend-text">较多</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 悬停 Tooltip 气泡 (Teleport 到 Body) -->
    <Teleport to="body">
      <div 
        v-if="tooltipState && tooltipState.visible"
        class="heatmap-tooltip-bubble font-mono"
        :style="{
          left: `${tooltipState.x}px`,
          top: `${tooltipState.y}px`
        }"
      >
        <div class="tooltip-header">
          <span class="tooltip-date">{{ tooltipState.dateStr }}</span>
          <span class="tooltip-weekday">{{ getDayOfWeekZh(tooltipState.dateStr) }}</span>
        </div>
        <div class="tooltip-body">
          <div class="tooltip-duration">
            {{ formatDurationZh(tooltipState.totalSeconds) }}
          </div>
          <div v-if="tooltipState.totalSessions > 0" class="tooltip-sessions">
            共 {{ tooltipState.totalSessions }} 次专注
            <span class="tooltip-tag tag-success">达成 {{ tooltipState.successCount }}</span>
            <span v-if="tooltipState.regretCount > 0" class="tooltip-tag tag-regret">后悔 {{ tooltipState.regretCount }}</span>
            <span v-if="tooltipState.failCount > 0" class="tooltip-tag tag-fail">中断 {{ tooltipState.failCount }}</span>
          </div>
          <div v-else class="tooltip-empty">
            当日无专注记录
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.focus-heatmap-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

/* 1. 顶部宏观核心数据栏 */
.heatmap-stats-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 12px 18px;
  gap: 12px;
  overflow-x: auto;
}

.stat-pill-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.stat-pill-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.stat-pill-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-pill-value small {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
}

.highlight-gold {
  color: #F59E0B;
}

.highlight-success {
  color: #10B981;
}

.stat-divider {
  width: 1px;
  height: 24px;
  background: var(--border-color);
  flex-shrink: 0;
}

/* 2. 网格容器 */
.heatmap-scroll-container {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 18px 20px;
}

.heatmap-board {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 700px;
}

/* 月份行 */
.month-labels-row {
  display: flex;
  align-items: center;
  height: 16px;
}

.weekday-placeholder {
  width: 32px;
  flex-shrink: 0;
}

.month-labels-track {
  display: flex;
  flex: 1;
  gap: 3px;
}

.month-label-col {
  width: 10px;
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  position: relative;
}

.month-label-col span {
  position: absolute;
  left: 0;
  top: 0;
}

/* 网格主体 */
.grid-main-row {
  display: flex;
  align-items: center;
}

.weekday-labels-col {
  width: 32px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 88px;
  font-size: 9px;
  color: var(--text-muted);
  line-height: 10px;
  flex-shrink: 0;
  user-select: none;
}

.weeks-columns-wrap {
  display: flex;
  flex: 1;
  gap: 3px;
}

.week-column {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* 方格单元格 */
.day-cell {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
  box-sizing: border-box;
}

.day-cell:hover {
  transform: scale(1.35);
  z-index: 5;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
}

.day-cell.is-today {
  outline: 1.5px solid #00F0FF;
  outline-offset: 1px;
}

.day-cell.is-selected {
  outline: 2px solid #F59E0B;
  outline-offset: 1px;
  transform: scale(1.3);
}

.day-cell.is-future {
  opacity: 0.15;
  cursor: default;
  pointer-events: none;
}

/* 色相等级 (极夜深色默认) */
.level-0 {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.level-1 {
  background: #0E4429;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.level-2 {
  background: #006D32;
  border: 1px solid rgba(16, 185, 129, 0.5);
}

.level-3 {
  background: #26A641;
  border: 1px solid #26A641;
  box-shadow: 0 0 4px rgba(38, 166, 65, 0.4);
}

.level-4 {
  background: #39D353;
  border: 1px solid #39D353;
  box-shadow: 0 0 8px rgba(57, 211, 83, 0.6);
}

/* 日光浅色适配 */
[data-theme="light"] .level-0 {
  background: #EBEDF0;
  border: 1px solid #E1E4E8;
}

[data-theme="light"] .level-1 {
  background: #9BE9A8;
  border: 1px solid #85E094;
}

[data-theme="light"] .level-2 {
  background: #40C463;
  border: 1px solid #34B355;
}

[data-theme="light"] .level-3 {
  background: #30A14E;
  border: 1px solid #288C43;
  box-shadow: none;
}

[data-theme="light"] .level-4 {
  background: #216E39;
  border: 1px solid #19582D;
  box-shadow: none;
}

/* 底部图例 */
.heatmap-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
}

.footer-hint {
  color: var(--text-muted);
}

.selected-hint {
  color: #F59E0B;
  font-weight: 600;
}

.legend-box {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-text {
  font-size: 10px;
  color: var(--text-muted);
}

.legend-cell {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: inline-block;
}

/* 3. 悬浮 Tooltip 气泡 */
.heatmap-tooltip-bubble {
  position: fixed;
  transform: translate(-50%, -100%);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  box-shadow: var(--shadow-md);
  z-index: 9999;
  pointer-events: none;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 4px;
}

.tooltip-duration {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-top: 2px;
}

.tooltip-sessions {
  font-size: 11px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.tooltip-empty {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.tooltip-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 2px;
}

.tag-success {
  color: #10B981;
  background: rgba(16, 185, 129, 0.15);
}

.tag-regret {
  color: #F59E0B;
  background: rgba(245, 158, 11, 0.15);
}

.tag-fail {
  color: #EF4444;
  background: rgba(239, 68, 68, 0.15);
}

@media (max-width: 768px) {
  .heatmap-scroll-container {
    padding: 12px 10px;
  }
  .heatmap-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .heatmap-stats-strip {
    justify-content: space-between;
  }
}
</style>
