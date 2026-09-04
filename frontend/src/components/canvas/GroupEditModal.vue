<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { FocusGroup, FocusNode } from '../../types';
import { useFocusTreeStore } from '../../stores/focusTree';

const props = withDefaults(defineProps<{
  isOpen: boolean;
  group?: FocusGroup | null; // 可选的指定预设编辑分组
  currentGroupId?: string | null; // 从国策弹窗打开时，当前国策绑定的分组ID
  isDraftMode?: boolean; // 是否处于画布沙盒草稿模式（草稿模式下增删改仅在内存中生效，不直接发网络请求）
  draftGroups?: FocusGroup[]; // 草稿分组数据源
  draftNodes?: FocusNode[]; // 草稿国策数据源
}>(), {
  isDraftMode: false
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', groupData: FocusGroup): void;
  (e: 'delete', groupId: string): void;
  (e: 'select-group', groupId: string | null): void;
}>();

const store = useFocusTreeStore();

const presetColors = [
  '#0284C7', // 湛蓝
  '#10B981', // 翠绿
  '#EA580C', // 橙红
  '#8B5CF6', // 幽紫
  '#E11D48', // 绯红
  '#D97706', // 琥珀金
  '#06B6D4', // 青蓝
  '#6366F1'  // 靛蓝
];

const selectedGroupId = ref<string | null>(null);
const isCreating = ref(false);
const isConfirmingDeleteId = ref<string | null>(null);
const saveSuccessTip = ref<string | null>(null);

// 依据模式动态决定数据源（持久库 vs 沙盒草稿）
const effectiveGroups = computed(() => {
  return props.isDraftMode && props.draftGroups ? props.draftGroups : store.groups;
});

const effectiveNodes = computed(() => {
  return props.isDraftMode && props.draftNodes ? props.draftNodes : store.nodes;
});

const form = ref<FocusGroup>({
  id: '',
  name: '',
  themeColor: '#0284C7',
  position: { x: 0, y: 0 },
  size: { width: 360, height: 260 }
});

function initCreateForm() {
  isCreating.value = true;
  selectedGroupId.value = null;
  isConfirmingDeleteId.value = null;
  saveSuccessTip.value = null;
  const nextColor = presetColors[effectiveGroups.value.length % presetColors.length];
  form.value = {
    id: `group-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: '',
    themeColor: nextColor,
    position: { x: 0, y: 0 },
    size: { width: 360, height: 260 }
  };
}

function selectGroupToEdit(g: FocusGroup) {
  isCreating.value = false;
  selectedGroupId.value = g.id;
  isConfirmingDeleteId.value = null;
  saveSuccessTip.value = null;
  form.value = JSON.parse(JSON.stringify(g));
}

function initModal() {
  saveSuccessTip.value = null;
  isConfirmingDeleteId.value = null;

  if (props.group) {
    selectGroupToEdit(props.group);
  } else if (props.currentGroupId) {
    const found = effectiveGroups.value.find(g => g.id === props.currentGroupId);
    if (found) {
      selectGroupToEdit(found);
    } else {
      initCreateForm();
    }
  } else {
    // 默认进入新建模式，若已有分组，亦可点击左侧直接编辑已有分组
    initCreateForm();
  }
}

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      initModal();
    }
  },
  { immediate: true }
);

watch(
  () => props.group,
  (val) => {
    if (props.isOpen && val) {
      selectGroupToEdit(val);
    }
  }
);

// 统计组内节点数量与详情
function getNodeCount(groupId: string): number {
  return effectiveNodes.value.filter(n => n.groupId === groupId).length;
}

function getGroupNodes(groupId: string) {
  return effectiveNodes.value.filter(n => n.groupId === groupId);
}

const currentGroupMembers = computed(() => {
  if (isCreating.value || !selectedGroupId.value) return [];
  return getGroupNodes(selectedGroupId.value);
});

async function handleSave(keepCreating = false) {
  if (!form.value.name.trim()) {
    alert('请填写分组名称');
    return;
  }

  const payload: FocusGroup = JSON.parse(JSON.stringify(form.value));

  if (isCreating.value) {
    // 自动按公式计算落盘坐标 (baseX + count * stepY)
    payload.position = store.calculateSmartGroupPlacement();
    if (!props.isDraftMode) {
      await store.addGroup(payload);
    }
    emit('save', payload);
    emit('select-group', payload.id);

    if (keepCreating) {
      saveSuccessTip.value = `分组【${payload.name}】已成功创建！可继续输入下一个。`;
      setTimeout(() => {
        if (saveSuccessTip.value) saveSuccessTip.value = null;
      }, 3000);
      initCreateForm();
    } else {
      emit('close');
    }
  } else {
    if (!props.isDraftMode) {
      await store.updateGroup(payload.id, payload);
    }
    emit('save', payload);
    saveSuccessTip.value = `分组【${payload.name}】修改已保存！`;
    setTimeout(() => {
      if (saveSuccessTip.value) saveSuccessTip.value = null;
    }, 2000);
  }
}

async function handleDelete(groupId: string) {
  if (!props.isDraftMode) {
    await store.deleteGroup(groupId);
  }
  emit('delete', groupId);
  isConfirmingDeleteId.value = null;

  if (props.currentGroupId === groupId) {
    emit('select-group', null);
  }

  if (selectedGroupId.value === groupId) {
    if (effectiveGroups.value.length > 0) {
      selectGroupToEdit(effectiveGroups.value[0]);
    } else {
      initCreateForm();
    }
  }
}

function handleApplyCurrent(groupId: string) {
  emit('select-group', groupId);
  emit('close');
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="group-manage-container">
        <!-- 头部 -->
        <div class="modal-header">
          <div class="header-titles">
            <h2 class="modal-title">国策分组管理</h2>
            <span class="header-count-tag font-mono">共 {{ effectiveGroups.length }} 个分组外框</span>
          </div>
          <button class="btn-close" @click="$emit('close')">×</button>
        </div>

        <!-- 主体两栏布局 (左侧列表管理，右侧详细编辑/新建) -->
        <div class="modal-body-layout">
          <!-- 左栏：分组列表 -->
          <div class="groups-sidebar">
            <div class="sidebar-header">
              <span class="sidebar-title">分组列表</span>
              <button 
                type="button" 
                class="btn-new-group-sub" 
                :class="{ 'is-active': isCreating }"
                @click="initCreateForm"
                title="开辟新分组外框"
              >
                + 新建分组
              </button>
            </div>

            <div class="groups-list">
              <div 
                v-for="g in effectiveGroups" 
                :key="g.id"
                class="group-list-item"
                :class="{ 
                  'is-selected': !isCreating && selectedGroupId === g.id,
                  'is-current-active': currentGroupId === g.id 
                }"
                @click="selectGroupToEdit(g)"
              >
                <div class="item-left">
                  <span class="group-color-dot" :style="{ backgroundColor: g.themeColor }"></span>
                  <div class="group-info">
                    <span class="item-group-name" :title="g.name">{{ g.name }}</span>
                    <span class="item-member-count font-mono">{{ getNodeCount(g.id) }} 个国策</span>
                  </div>
                </div>

                <div class="item-actions" @click.stop>
                  <!-- 快捷删除/确认删除 -->
                  <template v-if="isConfirmingDeleteId === g.id">
                    <button type="button" class="btn-confirm-del-inline" @click="handleDelete(g.id)">确认</button>
                    <button type="button" class="btn-cancel-del-inline" @click="isConfirmingDeleteId = null">取消</button>
                  </template>
                  <template v-else>
                    <button 
                      v-if="currentGroupId !== undefined"
                      type="button" 
                      class="btn-apply-inline" 
                      :class="{ 'is-applied': currentGroupId === g.id }"
                      @click="handleApplyCurrent(g.id)"
                      :title="currentGroupId === g.id ? '当前国策已归属此分组' : '选定为当前国策归属'"
                    >
                      {{ currentGroupId === g.id ? '当前' : '选用' }}
                    </button>
                    <button 
                      type="button" 
                      class="btn-delete-inline" 
                      @click="isConfirmingDeleteId = g.id"
                      title="删除此分组外框"
                    >
                      删除
                    </button>
                  </template>
                </div>
              </div>

              <div v-if="effectiveGroups.length === 0" class="empty-groups-notice">
                <span>暂无分组</span>
                <span class="sub-notice">点击上方按钮创建第一个外框</span>
              </div>
            </div>
          </div>

          <!-- 右栏：新建/编辑表单 -->
          <div class="group-editor-panel">
            <div class="panel-header">
              <span class="panel-title">
                {{ isCreating ? '新建分组外框' : '编辑分组属性' }}
              </span>
              <span v-if="saveSuccessTip" class="save-success-banner font-mono">
                {{ saveSuccessTip }}
              </span>
            </div>

            <div class="panel-form">
              <div class="form-group">
                <label class="form-label">分组名称</label>
                <input 
                  v-model="form.name" 
                  class="form-input" 
                  placeholder="例如: 早起破晓组, 专注作战组" 
                  maxlength="24"
                  @keydown.enter.prevent="handleSave(false)"
                />
              </div>

              <div class="form-group">
                <label class="form-label">外框主题色定制</label>
                <div class="color-presets">
                  <button 
                    v-for="color in presetColors" 
                    :key="color"
                    type="button"
                    class="color-dot"
                    :style="{ backgroundColor: color }"
                    :class="{ active: form.themeColor.toLowerCase() === color.toLowerCase() }"
                    @click="form.themeColor = color"
                  ></button>
                  <div class="color-picker-wrapper">
                    <input type="color" v-model="form.themeColor" class="custom-picker" />
                    <span class="custom-color-text font-mono">{{ form.themeColor }}</span>
                  </div>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="form-label">默认宽度 (px)</label>
                  <input v-model.number="form.size.width" type="number" min="200" max="1200" step="20" class="form-input font-mono" />
                </div>
                <div class="form-group flex-1">
                  <label class="form-label">默认高度 (px)</label>
                  <input v-model.number="form.size.height" type="number" min="150" max="1000" step="20" class="form-input font-mono" />
                </div>
              </div>

              <!-- 组内国策成员概览 (编辑模式展示) -->
              <div v-if="!isCreating" class="form-group members-section">
                <label class="form-label">组内已收纳国策 ({{ currentGroupMembers.length }})</label>
                <div v-if="currentGroupMembers.length > 0" class="members-chips-wrap">
                  <span 
                    v-for="m in currentGroupMembers" 
                    :key="m.id" 
                    class="member-chip font-mono"
                  >
                    <span class="member-code">{{ m.code }}</span>
                    <span class="member-name">{{ m.name }}</span>
                  </span>
                </div>
                <div v-else class="text-muted-empty">
                  当前暂无国策归属于此分组
                </div>
              </div>
            </div>

            <!-- 操作底栏 -->
            <div class="panel-footer">
              <div class="footer-left">
                <template v-if="!isCreating && selectedGroupId">
                  <div v-if="isConfirmingDeleteId !== selectedGroupId">
                    <button 
                      type="button" 
                      class="btn-delete-full" 
                      @click="isConfirmingDeleteId = selectedGroupId"
                    >
                      删除此分组
                    </button>
                  </div>
                  <div v-else class="confirm-del-full-box">
                    <span class="confirm-del-label">确定删除外框？</span>
                    <button type="button" class="btn-confirm-delete" @click="handleDelete(selectedGroupId)">确认删除</button>
                    <button type="button" class="btn-cancel-mini" @click="isConfirmingDeleteId = null">取消</button>
                  </div>
                </template>
              </div>

              <div class="footer-right">
                <template v-if="isCreating">
                  <button 
                    type="button" 
                    class="btn-secondary" 
                    @click="handleSave(true)"
                    title="保存此分组并继续创建下一个"
                  >
                    保存并连续新建
                  </button>
                  <button 
                    type="button" 
                    class="btn-submit" 
                    @click="handleSave(false)"
                  >
                    创建并完成
                  </button>
                </template>
                <template v-else>
                  <button 
                    v-if="currentGroupId !== undefined && selectedGroupId"
                    type="button" 
                    class="btn-apply-full" 
                    @click="handleApplyCurrent(selectedGroupId)"
                  >
                    选用为此国策分组
                  </button>
                  <button 
                    type="button" 
                    class="btn-submit" 
                    @click="handleSave(false)"
                  >
                    保存修改
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 5, 8, 0.78);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 20px;
}

.group-manage-container {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  max-width: 780px;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-primary);
}

.header-titles {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.header-count-tag {
  font-size: 11px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 22px;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
  transition: color var(--transition-fast);
}

.btn-close:hover {
  color: var(--text-primary);
}

.modal-body-layout {
  display: flex;
  height: 440px;
  background: var(--bg-primary);
}

/* 左侧栏 */
.groups-sidebar {
  width: 270px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.sidebar-header {
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.btn-new-group-sub {
  background: #10B981;
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-new-group-sub:hover,
.btn-new-group-sub.is-active {
  background: #059669;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
}

.groups-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--bg-primary);
}

.group-list-item:hover {
  border-color: var(--border-color);
  background: var(--bg-tertiary);
}

.group-list-item.is-selected {
  border-color: #10B981;
  background: rgba(16, 185, 129, 0.08);
}

.group-list-item.is-current-active {
  border-left: 3px solid #0284C7;
}

.item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.group-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.group-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.item-group-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-member-count {
  font-size: 10px;
  color: var(--text-muted);
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.btn-apply-inline {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 10px;
  color: var(--text-secondary);
  padding: 2px 6px;
  cursor: pointer;
}

.btn-apply-inline:hover,
.btn-apply-inline.is-applied {
  border-color: #0284C7;
  color: #0284C7;
  background: rgba(2, 132, 199, 0.08);
}

.btn-delete-inline {
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: 10px;
  color: var(--text-muted);
  padding: 2px 5px;
  cursor: pointer;
}

.btn-delete-inline:hover {
  color: var(--color-danger);
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
}

.btn-confirm-del-inline {
  background: var(--color-danger);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  cursor: pointer;
}

.btn-cancel-del-inline {
  background: transparent;
  color: var(--text-muted);
  border: none;
  font-size: 10px;
  padding: 2px 4px;
  cursor: pointer;
}

.empty-groups-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 120px;
  font-size: 12px;
  color: var(--text-muted);
  gap: 4px;
}

.sub-notice {
  font-size: 10px;
  opacity: 0.7;
}

/* 右侧编辑面板 */
.group-editor-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 14px;
}

.panel-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.save-success-banner {
  font-size: 11px;
  color: #10B981;
  background: rgba(16, 185, 129, 0.1);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.panel-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.flex-1 { flex: 1; }

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-input {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}

.form-input:focus {
  border-color: #10B981;
}

.color-presets {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.color-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.color-dot:hover {
  transform: scale(1.15);
}

.color-dot.active {
  border-color: #fff;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.6);
  transform: scale(1.15);
}

.color-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.custom-picker {
  -webkit-appearance: none;
  border: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  background: none;
}

.custom-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.custom-picker::-webkit-color-swatch {
  border: none;
  border-radius: 50%;
}

.custom-color-text {
  font-size: 11px;
  color: var(--text-secondary);
}

.members-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}

.members-chips-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 80px;
  overflow-y: auto;
}

.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  font-size: 11px;
}

.member-code {
  font-weight: 700;
  color: #10B981;
}

.member-name {
  color: var(--text-secondary);
}

.text-muted-empty {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

.panel-footer {
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-delete-full {
  background: transparent;
  color: var(--color-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-delete-full:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: var(--color-danger);
}

.confirm-del-full-box {
  display: flex;
  align-items: center;
  gap: 6px;
}

.confirm-del-label {
  font-size: 11px;
  color: var(--color-danger);
  font-weight: 600;
}

.btn-confirm-delete {
  background: var(--color-danger);
  color: #fff;
  border: none;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel-mini {
  background: transparent;
  color: var(--text-muted);
  border: none;
  font-size: 11px;
  cursor: pointer;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-secondary:hover {
  background: var(--bg-secondary);
  border-color: var(--border-focus);
}

.btn-apply-full {
  background: rgba(2, 132, 199, 0.12);
  color: #0284C7;
  border: 1px solid rgba(2, 132, 199, 0.35);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-apply-full:hover {
  background: #0284C7;
  color: #fff;
}

.btn-submit {
  background: #10B981;
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-submit:hover {
  background: #059669;
}
</style>
