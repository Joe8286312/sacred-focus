<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useFocusTreeStore } from '../../stores/focusTree';
import type { EvolutionSnapshot } from '../../types';

const props = defineProps<{
  isOpen: boolean;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const store = useFocusTreeStore();

// 表单状态
const changelogNotes = ref('');
const isMajor = ref(false);
const isSubmitting = ref(false);
const confirmingRollbackSlot = ref<number | null>(null);

// 状态反馈与通知
const feedbackMessage = ref<string | null>(null);
const feedbackType = ref<'success' | 'error' | 'warning'>('success');
let feedbackTimer: any = null;

function showToast(msg: string, type: 'success' | 'error' | 'warning' = 'success') {
  feedbackMessage.value = msg;
  feedbackType.value = type;
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedbackMessage.value = null;
  }, 3500);
}

// 导入备份文件引用
const fileInputRef = ref<HTMLInputElement | null>(null);
const pendingImportData = ref<any | null>(null);
const isConfirmingImport = ref(false);

// 监听弹窗打开状态，及时拉取最新演化状态
watch(
  () => props.isOpen,
  async (open) => {
    if (open) {
      await store.fetchEvolution();
      changelogNotes.value = '';
      isMajor.value = false;
      confirmingRollbackSlot.value = null;
      isConfirmingImport.value = false;
      pendingImportData.value = null;
    }
  },
  { immediate: true }
);

// 当前活跃指针与快照列表
const activePointerIndex = computed(() => store.evolution.activePointerIndex);
const snapshots = computed(() => store.evolution.snapshots || []);

// 5 槽位插槽轨道数组 (Slot 0 ~ Slot 4)
const slotRail = computed(() => {
  const list: Array<{ slotIndex: number; snapshot: EvolutionSnapshot | null; isActive: boolean }> = [];
  for (let i = 0; i < 5; i++) {
    const found = snapshots.value.find(s => s.slotIndex === i) || null;
    list.push({
      slotIndex: i,
      snapshot: found,
      isActive: activePointerIndex.value === i
    });
  }
  return list;
});

// 当前活跃快照
const currentActiveSnapshot = computed(() => {
  return snapshots.value.find(s => s.slotIndex === activePointerIndex.value) || null;
});

// 计算下一个快照将写入的槽位
const nextTargetSlot = computed(() => {
  const occupiedSlots = snapshots.value.map(s => s.slotIndex ?? 0);
  for (let i = 0; i < 5; i++) {
    if (!occupiedSlots.includes(i)) return i;
  }
  // 若 5 槽位已满，按环形队列推进覆盖
  return (activePointerIndex.value + 1) % 5;
});

const isNextSlotWillOverwrite = computed(() => {
  return snapshots.value.length >= 5;
});

// 预览即将生成的版本号
const previewNextVersion = computed(() => {
  const currentVersion = currentActiveSnapshot.value ? currentActiveSnapshot.value.version : 'v1.0';
  const match = currentVersion.match(/^v(\d+)\.(\d+)$/);
  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    if (isMajor.value) {
      return `v${major + 1}.0`;
    } else {
      return `v${major}.${minor + 1}`;
    }
  }
  return isMajor.value ? 'v2.0' : 'v1.1';
});

// 时间格式化工具
function formatTimestamp(isoStr: string) {
  if (!isoStr) return '--';
  try {
    const d = new Date(isoStr);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return isoStr;
  }
}

// 固化快照
async function handleCreateSnapshot() {
  if (!changelogNotes.value.trim() || isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    const success = await store.createSnapshot(changelogNotes.value.trim(), isMajor.value);
    if (success) {
      showToast(`已成功固化版本快照 ${previewNextVersion.value} 至 Slot ${nextTargetSlot.value}`, 'success');
      changelogNotes.value = '';
      isMajor.value = false;
      await store.fetchEvolution();
    } else {
      showToast('固化快照失败，请查看服务端日志', 'error');
    }
  } catch (e: any) {
    showToast(`固化快照异常: ${e.message}`, 'error');
  } finally {
    isSubmitting.value = false;
  }
}

// 触发回滚确认
function promptRollback(slotIndex: number) {
  confirmingRollbackSlot.value = slotIndex;
}

// 执行回滚
async function executeRollback(slotIndex: number) {
  isSubmitting.value = true;
  try {
    const success = await store.rollbackToSlot(slotIndex);
    if (success) {
      confirmingRollbackSlot.value = null;
      showToast(`已成功无损回滚至 Slot ${slotIndex} 版本快照`, 'success');
    } else {
      showToast('回滚失败，请检查网络或服务端', 'error');
    }
  } catch (e: any) {
    showToast(`回滚异常: ${e.message}`, 'error');
  } finally {
    isSubmitting.value = false;
  }
}

// 导出系统冷备
async function handleExportBackup() {
  const success = await store.exportSystemBackup();
  if (success) {
    showToast('系统全量 JSON 备份已生成并触发下载', 'success');
  } else {
    showToast('导出备份失败', 'error');
  }
}

// 触发文件选择
function triggerImportFile() {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
}

// 处理导入文件
function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string);
      const tree = data?.liveTree || data?.focusTree;
      if (!data || !tree) {
        showToast('备份文件格式不合法，缺少国策树结构', 'error');
        return;
      }
      pendingImportData.value = data;
      isConfirmingImport.value = true;
    } catch {
      showToast('备份文件解析失败，请提供合法的 JSON 文件', 'error');
    }
  };
  reader.readAsText(file);
}

// 执行导入覆盖
async function executeImportBackup() {
  if (!pendingImportData.value) return;

  isSubmitting.value = true;
  try {
    const success = await store.importSystemBackup(pendingImportData.value);
    if (success) {
      showToast('系统全量备份导入成功，视图与演化树已重构', 'success');
      isConfirmingImport.value = false;
      pendingImportData.value = null;
    } else {
      showToast('导入备份失败，服务端写入异常', 'error');
    }
  } catch (e: any) {
    showToast(`导入异常: ${e.message}`, 'error');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="evolution-modal-container">
        <!-- 头部区域 -->
        <div class="modal-header">
          <div class="header-left">
            <span class="header-indicator-dot"></span>
            <div class="title-block">
              <h2 class="modal-title">国策演化中枢 · 5 槽位防震荡快照</h2>
              <p class="modal-subtitle">
                环形队列版本管理 · 任意槽位无损回滚 · 全系统冷备导入导出
              </p>
            </div>
          </div>

          <div class="header-right">
            <div class="active-version-badge font-mono">
              <span class="active-dot"></span>
              <span>HEAD: {{ currentActiveSnapshot?.version || 'v1.0' }} (Slot {{ activePointerIndex }})</span>
            </div>
            <button class="btn-close-icon" @click="$emit('close')" title="关闭演化中枢">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- 全局通知 Toast 提示条 -->
        <Transition name="toast-slide">
          <div v-if="feedbackMessage" class="feedback-toast" :class="feedbackType">
            <span class="toast-dot"></span>
            <span>{{ feedbackMessage }}</span>
          </div>
        </Transition>

        <!-- 模态框主体内容 -->
        <div class="modal-body">
          <!-- 模块一：5 槽位环形快照轨道 -->
          <div class="rail-section">
            <div class="section-title-bar">
              <div class="section-title-wrap">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 7v5l3 3"></path>
                </svg>
                <span class="section-title">环形快照轨道 (5 槽位防震荡机制)</span>
              </div>
              <span class="section-hint">
                活跃指针已锁定 Slot {{ activePointerIndex }} · 满 5 槽后将覆盖轮转最早快照
              </span>
            </div>

            <!-- 5 槽位卡片列表 -->
            <div class="slots-grid">
              <div
                v-for="item in slotRail"
                :key="item.slotIndex"
                class="slot-card"
                :class="{
                  'is-active': item.isActive,
                  'is-occupied': item.snapshot !== null,
                  'is-empty': item.snapshot === null
                }"
              >
                <!-- 槽位头部 -->
                <div class="slot-card-header">
                  <div class="slot-meta-left">
                    <span class="slot-number-pill font-mono">SLOT {{ item.slotIndex }}</span>
                    <span 
                      v-if="item.snapshot" 
                      class="slot-version-pill font-mono"
                      :class="{ 'is-major': item.snapshot.isMajor }"
                    >
                      {{ item.snapshot.version }}
                    </span>
                  </div>

                  <div class="slot-meta-right">
                    <span v-if="item.isActive" class="active-head-tag font-mono">
                      <span class="head-pulse-dot"></span>
                      HEAD 活跃
                    </span>
                    <span v-else-if="item.snapshot?.isMajor" class="major-milestone-tag">
                      重大里程碑
                    </span>
                  </div>
                </div>

                <!-- 槽位已占用内容 -->
                <div v-if="item.snapshot" class="slot-card-content">
                  <div class="slot-meta-row">
                    <span class="timestamp-text font-mono">{{ formatTimestamp(item.snapshot.timestamp) }}</span>
                    <span class="entity-stats-text">
                      {{ item.snapshot.nodes?.length || 0 }} 国策 · {{ item.snapshot.groups?.length || 0 }} 分组 · {{ item.snapshot.edges?.length || 0 }} 连线
                    </span>
                  </div>

                  <div class="changelog-box">
                    <p class="changelog-text">{{ item.snapshot.changelogNotes || '未录入演化注记' }}</p>
                  </div>

                  <!-- 槽位底部行动栏 -->
                  <div class="slot-card-actions">
                    <div v-if="item.isActive" class="current-running-label">
                      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>当前树运行此版本</span>
                    </div>

                    <template v-else>
                      <div v-if="confirmingRollbackSlot === item.slotIndex" class="rollback-confirm-group">
                        <span class="confirm-warning-text">确认覆盖当前树回滚至此版本？</span>
                        <div class="confirm-btn-row">
                          <button 
                            class="btn-confirm-rollback" 
                            :disabled="isSubmitting"
                            @click="executeRollback(item.slotIndex)"
                          >
                            确定回滚
                          </button>
                          <button 
                            class="btn-cancel-rollback" 
                            :disabled="isSubmitting"
                            @click="confirmingRollbackSlot = null"
                          >
                            取消
                          </button>
                        </div>
                      </div>

                      <button 
                        v-else 
                        class="btn-rollback" 
                        :disabled="isSubmitting"
                        @click="promptRollback(item.slotIndex)"
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
                          <polyline points="1 4 1 10 7 10"></polyline>
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                        <span>一键无损回滚至此槽位</span>
                      </button>
                    </template>
                  </div>
                </div>

                <!-- 槽位空闲态 -->
                <div v-else class="slot-empty-content">
                  <div class="empty-icon-wrap">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.5" fill="none">
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"></rect>
                      <line x1="12" y1="8" x2="12" y2="16"></line>
                      <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                  </div>
                  <span class="empty-title">空闲未分配槽位</span>
                  <span class="empty-desc">
                    {{ item.slotIndex === nextTargetSlot ? '下次固化将优先写入此槽位' : '环形缓冲区预备存储位' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 模块二：固化当前国策树为新版本快照 -->
          <div class="creation-section">
            <div class="section-title-bar">
              <div class="section-title-wrap">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                <span class="section-title">固化当前国策树为新版本快照</span>
              </div>
              <div class="target-slot-indicator font-mono">
                <span>目标写入槽位: <strong>SLOT {{ nextTargetSlot }}</strong></span>
                <span v-if="isNextSlotWillOverwrite" class="overwrite-warning">(将覆盖最早快照)</span>
              </div>
            </div>

            <div class="creation-card">
              <!-- 演化日志输入区 -->
              <div class="form-item">
                <label class="form-label">
                  <span>版本演化日志 / 变更动因注记</span>
                  <span class="label-required">* 必填</span>
                </label>
                <textarea
                  v-model="changelogNotes"
                  class="changelog-textarea"
                  rows="3"
                  placeholder="详述本次版本迭代的核心动机（例如：重构早间破晓组连线，精简神圣首战判定规则，建立晚间防震荡护盾...）"
                ></textarea>
              </div>

              <!-- 版本号级别选择与生成预览 -->
              <div class="creation-footer-bar">
                <div class="version-type-toggle">
                  <label class="custom-checkbox">
                    <input type="checkbox" v-model="isMajor" />
                    <span class="checkbox-indicator"></span>
                    <span class="checkbox-label">
                      <strong>重大里程碑版本 (Major)</strong>
                      <span class="checkbox-subtext">主版本号升级 (如 v1.x -> v2.0)</span>
                    </span>
                  </label>
                </div>

                <div class="creation-action-wrap">
                  <div class="next-version-preview font-mono">
                    <span class="preview-label">拟发布版本:</span>
                    <span class="preview-tag" :class="{ 'is-major': isMajor }">
                      {{ previewNextVersion }}
                    </span>
                  </div>

                  <button
                    class="btn-submit-snapshot"
                    :disabled="!changelogNotes.trim() || isSubmitting"
                    @click="handleCreateSnapshot"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    </svg>
                    <span>{{ isSubmitting ? '固化封版中...' : '固化并发布快照' }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 模块三：全系统底层数据冷备与跨机迁移 -->
          <div class="backup-section">
            <div class="section-title-bar">
              <div class="section-title-wrap">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                  <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                <span class="section-title">全系统底层冷备与跨环境迁移</span>
              </div>
              <span class="section-hint">包含国策树、拓扑网络、神圣座位及判例法典的无损 JSON 映像</span>
            </div>

            <!-- 导入二次确认警示框 -->
            <div v-if="isConfirmingImport" class="import-confirm-banner">
              <div class="banner-title-row">
                <span class="danger-dot"></span>
                <strong>警告：导入将彻底覆盖当前系统的全部数据库记录！</strong>
              </div>
              <p class="banner-desc">
                已成功解析备份数据包。包含 {{ (pendingImportData?.liveTree?.nodes || pendingImportData?.focusTree?.nodes)?.length || 0 }} 项国策节点、{{ (pendingImportData?.liveTree?.groups || pendingImportData?.focusTree?.groups)?.length || 0 }} 个分组及 {{ pendingImportData?.evolution?.snapshots?.length || 0 }} 个演化快照。此操作不可撤销，请确认是否继续执行覆盖写入？
              </p>
              <div class="banner-actions">
                <button class="btn-confirm-import-danger" :disabled="isSubmitting" @click="executeImportBackup">
                  确认全量覆写恢复
                </button>
                <button class="btn-cancel-import" :disabled="isSubmitting" @click="isConfirmingImport = false; pendingImportData = null">
                  取消导入
                </button>
              </div>
            </div>

            <div v-else class="backup-card">
              <div class="backup-card-info">
                <span class="backup-title">独立全库 JSON 映像备份</span>
                <span class="backup-desc">可用于本地灾备归档，或跨设备完整无损迁移作战系统状态</span>
              </div>

              <div class="backup-btn-group">
                <button class="btn-export-backup" :disabled="isSubmitting" @click="handleExportBackup">
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  <span>导出系统备份 (JSON)</span>
                </button>

                <button class="btn-import-backup" :disabled="isSubmitting" @click="triggerImportFile">
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span>从 JSON 恢复系统</span>
                </button>

                <!-- 隐藏的本地文件选择器 -->
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".json"
                  style="display: none"
                  @change="onFileSelected"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 底部栏 -->
        <div class="modal-footer">
          <span class="footer-tip">
            提示：固化快照不影响当前编辑中的未保存草稿，回滚操作将重载画布持久数据。
          </span>
          <button class="btn-close-modal" @click="$emit('close')">
            完成并返回画布
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(4, 7, 13, 0.75);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.evolution-modal-container {
  background: var(--bg-primary, #0d131f);
  border: 1px solid var(--border-color, #1e293b);
  border-radius: var(--radius-md, 8px);
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
  width: 100%;
  max-width: 920px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  animation: modalPop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalPop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 模态框头部 */
.modal-header {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color, #1e293b);
  background: rgba(255, 255, 255, 0.015);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-indicator-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #10B981;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.8);
}

.title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #f8fafc);
  letter-spacing: -0.01em;
}

.modal-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted, #64748b);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.active-version-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-sm, 4px);
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #10B981;
  font-size: 12px;
  font-weight: 600;
}

.active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10B981;
  animation: pulse 2s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

.btn-close-icon {
  background: transparent;
  border: none;
  color: var(--text-muted, #64748b);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-sm, 4px);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-close-icon:hover {
  background: var(--bg-tertiary, #1e293b);
  color: var(--text-primary, #f8fafc);
}

/* 模态框全局通知 Toast */
.feedback-toast {
  position: absolute;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}

.feedback-toast.success {
  background: rgba(16, 185, 129, 0.95);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.feedback-toast.error {
  background: rgba(220, 38, 38, 0.95);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.feedback-toast.warning {
  background: rgba(217, 119, 6, 0.95);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.toast-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ffffff;
}

/* 模态框主体 */
.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.section-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary, #f8fafc);
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.section-hint {
  font-size: 11px;
  color: var(--text-muted, #64748b);
}

/* 5 槽位轨道 Grid */
.slots-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

@media (max-width: 860px) {
  .slots-grid {
    grid-template-columns: 1fr;
  }
}

.slot-card {
  background: var(--bg-secondary, #131d2e);
  border: 1px solid var(--border-color, #1e293b);
  border-radius: var(--radius-sm, 6px);
  display: flex;
  flex-direction: column;
  padding: 12px;
  min-height: 200px;
  transition: all var(--transition-normal, 0.2s ease);
  position: relative;
}

.slot-card.is-active {
  border-color: #10B981;
  background: rgba(16, 185, 129, 0.04);
  box-shadow: 0 0 16px rgba(16, 185, 129, 0.15), inset 0 0 0 1px rgba(16, 185, 129, 0.3);
}

.slot-card.is-empty {
  border-style: dashed;
  background: rgba(255, 255, 255, 0.01);
}

.slot-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.slot-meta-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.slot-number-pill {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted, #64748b);
  background: var(--bg-primary, #0d131f);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--border-color, #1e293b);
}

.slot-version-pill {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-primary, #f8fafc);
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(2, 132, 199, 0.15);
  border: 1px solid rgba(2, 132, 199, 0.35);
}

.slot-version-pill.is-major {
  color: #F59E0B;
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
}

.slot-meta-right {
  display: flex;
  align-items: center;
}

.active-head-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #10B981;
}

.head-pulse-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #10B981;
}

.major-milestone-tag {
  font-size: 9px;
  color: #F59E0B;
  background: rgba(245, 158, 11, 0.1);
  padding: 1px 4px;
  border-radius: 2px;
}

.slot-card-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding-top: 8px;
  gap: 8px;
}

.slot-meta-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.timestamp-text {
  font-size: 10px;
  color: var(--text-muted, #64748b);
}

.entity-stats-text {
  font-size: 10px;
  color: var(--text-secondary, #94a3b8);
}

.changelog-box {
  flex: 1;
  background: var(--bg-primary, #0d131f);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 8px;
  max-height: 80px;
  overflow-y: auto;
}

.changelog-text {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-primary, #f8fafc);
  word-break: break-word;
}

.slot-card-actions {
  margin-top: auto;
  padding-top: 8px;
}

.current-running-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 0;
  font-size: 11px;
  font-weight: 600;
  color: #10B981;
  background: rgba(16, 185, 129, 0.08);
  border-radius: var(--radius-sm, 4px);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.btn-rollback {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-primary, #0d131f);
  border: 1px solid var(--border-color, #1e293b);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-secondary, #94a3b8);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-rollback:hover:not(:disabled) {
  background: rgba(2, 132, 199, 0.15);
  border-color: rgba(2, 132, 199, 0.5);
  color: #38BDF8;
}

.rollback-confirm-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  background: rgba(220, 38, 38, 0.08);
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: 4px;
}

.confirm-warning-text {
  font-size: 10px;
  color: #F87171;
  font-weight: 600;
  text-align: center;
}

.confirm-btn-row {
  display: flex;
  gap: 4px;
}

.btn-confirm-rollback {
  flex: 1;
  padding: 4px 6px;
  background: #DC2626;
  border: none;
  border-radius: 3px;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.btn-confirm-rollback:hover:not(:disabled) {
  background: #B91C1C;
}

.btn-cancel-rollback {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--border-color, #1e293b);
  border-radius: 3px;
  color: var(--text-muted, #64748b);
  font-size: 10px;
  cursor: pointer;
}

.slot-empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  flex: 1;
  padding: 16px 8px;
  gap: 6px;
}

.empty-icon-wrap {
  color: var(--text-muted, #64748b);
  margin-bottom: 2px;
}

.empty-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #64748b);
}

.empty-desc {
  font-size: 10px;
  color: rgba(100, 116, 139, 0.7);
  line-height: 1.4;
}

/* 模块二：快照创建卡片 */
.creation-card {
  background: var(--bg-secondary, #131d2e);
  border: 1px solid var(--border-color, #1e293b);
  border-radius: var(--radius-sm, 6px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.target-slot-indicator {
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
}

.target-slot-indicator strong {
  color: #38BDF8;
}

.overwrite-warning {
  margin-left: 6px;
  color: #F87171;
  font-weight: 600;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #f8fafc);
}

.label-required {
  font-size: 11px;
  color: #F87171;
  font-weight: 400;
}

.changelog-textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary, #0d131f);
  border: 1px solid var(--border-color, #1e293b);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-primary, #f8fafc);
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  transition: all var(--transition-fast, 0.15s ease);
}

.changelog-textarea:focus {
  outline: none;
  border-color: #0284C7;
  box-shadow: 0 0 0 1px rgba(2, 132, 199, 0.4);
}

.creation-footer-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.custom-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.custom-checkbox input {
  display: none;
}

.checkbox-indicator {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid var(--border-color, #1e293b);
  background: var(--bg-primary, #0d131f);
  position: relative;
  transition: all var(--transition-fast, 0.15s ease);
}

.custom-checkbox input:checked + .checkbox-indicator {
  background: #F59E0B;
  border-color: #F59E0B;
}

.custom-checkbox input:checked + .checkbox-indicator::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 5px;
  width: 4px;
  height: 8px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.checkbox-label {
  display: flex;
  flex-direction: column;
}

.checkbox-label strong {
  font-size: 12px;
  color: var(--text-primary, #f8fafc);
}

.checkbox-subtext {
  font-size: 10px;
  color: var(--text-muted, #64748b);
}

.creation-action-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.next-version-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.preview-label {
  color: var(--text-muted, #64748b);
}

.preview-tag {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(2, 132, 199, 0.15);
  border: 1px solid rgba(2, 132, 199, 0.4);
  color: #38BDF8;
}

.preview-tag.is-major {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.45);
  color: #F59E0B;
}

.btn-submit-snapshot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #0284C7;
  border: none;
  border-radius: var(--radius-sm, 4px);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-submit-snapshot:hover:not(:disabled) {
  background: #0369A1;
}

.btn-submit-snapshot:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 模块三：冷备卡片 */
.backup-card {
  background: var(--bg-secondary, #131d2e);
  border: 1px solid var(--border-color, #1e293b);
  border-radius: var(--radius-sm, 6px);
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.backup-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.backup-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary, #f8fafc);
}

.backup-desc {
  font-size: 11px;
  color: var(--text-muted, #64748b);
}

.backup-btn-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-export-backup {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-primary, #0d131f);
  border: 1px solid var(--border-color, #1e293b);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-primary, #f8fafc);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-export-backup:hover:not(:disabled) {
  background: var(--bg-tertiary, #1e293b);
  border-color: #38BDF8;
  color: #38BDF8;
}

.btn-import-backup {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-primary, #0d131f);
  border: 1px solid var(--border-color, #1e293b);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-secondary, #94a3b8);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-import-backup:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.1);
  border-color: rgba(220, 38, 38, 0.4);
  color: #F87171;
}

/* 导入确认横幅 */
.import-confirm-banner {
  background: rgba(220, 38, 38, 0.08);
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: var(--radius-sm, 6px);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.banner-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #F87171;
  font-size: 13px;
}

.danger-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #DC2626;
  box-shadow: 0 0 6px rgba(220, 38, 38, 0.8);
}

.banner-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary, #94a3b8);
}

.banner-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.btn-confirm-import-danger {
  padding: 6px 14px;
  background: #DC2626;
  border: none;
  border-radius: var(--radius-sm, 4px);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-confirm-import-danger:hover:not(:disabled) {
  background: #B91C1C;
}

.btn-cancel-import {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--border-color, #1e293b);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-muted, #64748b);
  font-size: 11px;
  cursor: pointer;
}

/* 模态框底部 */
.modal-footer {
  padding: 14px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border-color, #1e293b);
  background: rgba(255, 255, 255, 0.015);
}

.footer-tip {
  font-size: 11px;
  color: var(--text-muted, #64748b);
}

.btn-close-modal {
  padding: 8px 18px;
  background: var(--bg-tertiary, #1e293b);
  border: 1px solid var(--border-color, #1e293b);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-primary, #f8fafc);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-close-modal:hover {
  background: var(--border-color, #334155);
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

.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}
</style>
