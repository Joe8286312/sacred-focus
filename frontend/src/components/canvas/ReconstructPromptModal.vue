<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useFocusTreeStore } from '../../stores/focusTree';

const store = useFocusTreeStore();
const router = useRouter();

const summary = computed(() => store.pendingResetSummary);
const isOpen = computed(() => !!summary.value && summary.value.resetNodes.length > 0);

function handleGoToReconstruct() {
  store.dismissResetAlert();
  // 导航至国策画布，并携带 query 参数声明进入编辑模式
  router.push({ path: '/tree', query: { edit: 'true' } });
}

function handleDismiss() {
  store.dismissResetAlert();
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="isOpen && summary" class="reconstruct-modal-overlay" @click.self="handleDismiss">
      <div class="reconstruct-modal-container">
        <!-- 头部告警栏（极简高质感纯色指示点与矢量图标，杜绝 Emoji） -->
        <div class="modal-header">
          <div class="header-left">
            <span class="status-warning-dot"></span>
            <div class="title-wrap">
              <h2 class="modal-title">国策连续中断与等级归零</h2>
              <span class="modal-subtitle font-mono">
                自控日结算审计 · {{ summary.settlementDate }}（凌晨 04:00 边界周期）
              </span>
            </div>
          </div>
          <button class="btn-close" @click="handleDismiss" title="关闭">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- 核心内容区域 -->
        <div class="modal-body">
          <p class="summary-desc">
            系统检测到昨日有 <strong class="text-highlight">{{ summary.resetNodes.length }}</strong> 项国策未能按时点亮打卡。根据连续强化规则，其当前等级已自动清零回退至 <strong class="text-reset">Lv.0</strong>，历史最高峰值勋章已永久存档保留。
          </p>

          <!-- 断签国策清单列表 -->
          <div class="reset-nodes-list custom-scrollbar">
            <div 
              v-for="node in summary.resetNodes" 
              :key="node.id" 
              class="reset-node-item"
            >
              <div class="node-meta">
                <span class="node-code font-mono">{{ node.code }}</span>
                <span class="node-name">{{ node.name }}</span>
              </div>
              <div class="node-levels font-mono">
                <span class="level-pill lost-pill">跌落前 Lv.{{ node.lostLevel }}</span>
                <span class="level-arrow">→</span>
                <span class="level-pill current-pill">当前 Lv.0</span>
                <span class="level-pill max-pill" title="历史最高强化等级">峰值 Lv.{{ node.maxLevel }}</span>
              </div>
            </div>
          </div>

          <!-- 自控工程学反思提示框 -->
          <div class="engineering-hint-card">
            <div class="hint-header">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span>自控工程学·结构性反思</span>
            </div>
            <p class="hint-content">
              若某项国策频繁发生断签中断，通常意味着其<strong>动作执行阻力过大</strong>或<strong>场景触发时机与生理节律脱节</strong>。在自控工程学体系中，强行依靠意志力死撑往往引发雪崩。及时重构拓扑关系、拆分为更小动作或调整执行场景，是构建长期心理稳态的最优解。
            </p>
          </div>
        </div>

        <!-- 底部行动栏 -->
        <div class="modal-footer">
          <button class="btn-dismiss" @click="handleDismiss">
            知晓并保持现状
          </button>
          <button class="btn-reconstruct" @click="handleGoToReconstruct">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            <span>立即前往画布重构</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.reconstruct-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 5, 8, 0.82);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.reconstruct-modal-container {
  background: var(--bg-card, #121319);
  border: 1px solid rgba(239, 68, 68, 0.4);
  box-shadow: 0 0 40px rgba(239, 68, 68, 0.15), 0 20px 50px rgba(0, 0, 0, 0.6);
  border-radius: var(--radius-lg, 12px);
  max-width: 580px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalPop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalPop {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.status-warning-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #ef4444;
  box-shadow: 0 0 12px #ef4444;
  flex-shrink: 0;
}

.title-wrap {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.modal-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-color, #f3f4f6);
  letter-spacing: 0.5px;
}

.modal-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted, #9ca3af);
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.modal-body {
  padding: 22px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.summary-desc {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--text-color, #e5e7eb);
}

.text-highlight {
  color: #f59e0b;
  font-weight: 700;
}

.text-reset {
  color: #ef4444;
  font-weight: 700;
}

.reset-nodes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 4px;
}

.reset-node-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
}

.node-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.node-code {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-lit, #10b981);
  background: rgba(16, 185, 129, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.node-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
}

.node-levels {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
}

.level-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.lost-pill {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.level-arrow {
  color: var(--text-muted, #6b7280);
}

.current-pill {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.max-pill {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted, #9ca3af);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.engineering-hint-card {
  background: rgba(16, 185, 129, 0.04);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 8px;
  padding: 14px 16px;
}

.hint-header {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-lit, #10b981);
  margin-bottom: 8px;
}

.hint-content {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.65;
  color: var(--text-muted, #9ca3af);
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: rgba(0, 0, 0, 0.15);
}

.btn-dismiss {
  padding: 8px 18px;
  background: transparent;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
  border-radius: 6px;
  color: var(--text-muted, #9ca3af);
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-dismiss:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.04);
}

.btn-reconstruct {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 20px;
  background: var(--color-lit, #10b981);
  border: 1px solid var(--color-lit, #10b981);
  border-radius: 6px;
  color: #061811;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 0 16px rgba(16, 185, 129, 0.3);
}

.btn-reconstruct:hover {
  background: #059669;
  border-color: #059669;
  box-shadow: 0 0 24px rgba(16, 185, 129, 0.5);
  transform: translateY(-1px);
}
</style>
