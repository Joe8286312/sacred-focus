<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { 
  VueFlow, 
  useVueFlow, 
  MarkerType, 
  ConnectionLineType,
  ConnectionMode,
  type Connection,
  type NodeMouseEvent,
  type EdgeMouseEvent
} from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

import { useFocusTreeStore } from '../stores/focusTree';
import FocusNodeCard from '../components/canvas/FocusNodeCard.vue';
import FocusGroupFrame from '../components/canvas/FocusGroupFrame.vue';
import OrthogonalEdge from '../components/canvas/OrthogonalEdge.vue';
import NodeSpecModal from '../components/canvas/NodeSpecModal.vue';
import NodeEditModal from '../components/canvas/NodeEditModal.vue';
import GroupEditModal from '../components/canvas/GroupEditModal.vue';
import type { FocusNode, FocusGroup, FocusEdge } from '../types';

const store = useFocusTreeStore();
const { fitView } = useVueFlow();

// 交互模式：展示模式 (View Mode, 默认) vs 编辑模式 (Edit Mode)
const isEditMode = ref(false);

// 模态框状态
const isSpecModalOpen = ref(false);
const activeSpecNode = ref<FocusNode | null>(null);

const isNodeEditModalOpen = ref(false);
const editingNode = ref<FocusNode | null>(null);

const isGroupEditModalOpen = ref(false);
const editingGroup = ref<FocusGroup | null>(null);

// 排版无损撤销快照
let preEditNodesSnapshot: { id: string; x: number; y: number }[] = [];
let preEditGroupsSnapshot: { id: string; x: number; y: number }[] = [];

// 选中状态跟踪
const selectedNodeId = ref<string | null>(null);
const selectedEdgeId = ref<string | null>(null);

// 快速连续点击检测 (支持移动端快速三击或右键唤起规范卡)
let lastClickNodeId = '';
let lastClickTime = 0;
let clickCount = 0;

// 计算已点亮国策统计
const litStats = computed(() => {
  const total = store.nodes.length;
  const lit = store.nodes.filter(n => n.isLit).length;
  return { lit, total };
});

// 映射 Pinia 数据至 Vue Flow Nodes
const flowNodes = ref<any[]>([]);
const flowEdges = ref<any[]>([]);

function syncToFlow() {
  const nodesList: any[] = [];

  // 1. 分组外框节点 (处于下层 zIndex: 1)
  for (const g of store.groups) {
    nodesList.push({
      id: g.id,
      type: 'focusGroup',
      position: { ...g.position },
      data: { ...g, isEditMode: isEditMode.value },
      draggable: isEditMode.value,
      selectable: isEditMode.value,
      style: { zIndex: 1 }
    });
  }

  // 2. 国策节点 (处于上层 zIndex: 10)
  for (const n of store.nodes) {
    nodesList.push({
      id: n.id,
      type: 'focusNode',
      position: { ...n.position },
      data: { ...n, isEditMode: isEditMode.value },
      draggable: isEditMode.value,
      selectable: true,
      style: { zIndex: 10 }
    });
  }

  flowNodes.value = nodesList;

  // 3. 拓扑连线
  flowEdges.value = store.edges.map(e => ({
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    sourceHandle: e.sourceAnchor ? (e.sourceType === 'GROUP' ? `group-${e.sourceAnchor.toLowerCase()}` : e.sourceAnchor.toLowerCase()) : undefined,
    targetHandle: e.targetAnchor ? (e.targetType === 'GROUP' ? `group-target-${e.targetAnchor.toLowerCase()}` : `target-${e.targetAnchor.toLowerCase()}`) : undefined,
    type: 'orthogonal',
    markerEnd: MarkerType.ArrowClosed,
    data: { ...e, isEditMode: isEditMode.value }
  }));
}

watch([() => store.nodes, () => store.groups, () => store.edges, isEditMode], () => {
  syncToFlow();
}, { deep: true });

// -----------------------------------------------------------------------------
// 交互事件处理
// -----------------------------------------------------------------------------

// 单击节点
function onNodeClick({ node }: NodeMouseEvent) {
  selectedNodeId.value = node.id;
  selectedEdgeId.value = null;

  // 多击检测 (支持移动端快速三击打开规范卡)
  const now = Date.now();
  if (lastClickNodeId === node.id && now - lastClickTime < 350) {
    clickCount++;
    if (clickCount >= 3) {
      openSpecCard(node.id);
      clickCount = 0;
    }
  } else {
    lastClickNodeId = node.id;
    clickCount = 1;
  }
  lastClickTime = now;
}

// 双击节点：展示模式下点亮/熄灭；编辑模式下打开编辑
function onNodeDoubleClick({ node }: NodeMouseEvent) {
  if (node.type === 'focusNode') {
    if (!isEditMode.value) {
      // 模式 A：双击左键切换【点亮 / 熄灭】
      store.toggleNodeLit(node.id);
    } else {
      // 模式 B：编辑模式下双击打开编辑
      const found = store.nodes.find(n => n.id === node.id);
      if (found) {
        editingNode.value = found;
        isNodeEditModalOpen.value = true;
      }
    }
  } else if (node.type === 'focusGroup' && isEditMode.value) {
    const found = store.groups.find(g => g.id === node.id);
    if (found) {
      editingGroup.value = found;
      isGroupEditModalOpen.value = true;
    }
  }
}

// 鼠标右键：展示模式下直接呼出国策详细规范卡
function onNodeContextMenu({ node, event }: NodeMouseEvent) {
  event.preventDefault();
  if (node.type === 'focusNode') {
    openSpecCard(node.id);
  }
}

function openSpecCard(nodeId: string) {
  const found = store.nodes.find(n => n.id === nodeId);
  if (found) {
    activeSpecNode.value = found;
    isSpecModalOpen.value = true;
  }
}

// 单击连线
function onEdgeClick({ edge }: EdgeMouseEvent) {
  selectedEdgeId.value = edge.id;
  selectedNodeId.value = null;
}

// 双击连线删除
function onEdgeDoubleClick({ edge }: EdgeMouseEvent) {
  if (isEditMode.value) {
    store.deleteEdge(edge.id);
  }
}

function onDeleteEdge(edgeId: string) {
  store.deleteEdge(edgeId);
}

// 创建新连线
function onConnect(connection: Connection) {
  if (!isEditMode.value) return;
  if (!connection.source || !connection.target) return;
  if (connection.source === connection.target) return; // 杜绝自环

  // 解析 source 与 target 是 node 还是 group
  const isSourceGroup = store.groups.some(g => g.id === connection.source);
  const isTargetGroup = store.groups.some(g => g.id === connection.target);

  // 解析锚点方位
  const parseAnchor = (handle?: string | null): 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' => {
    if (!handle) return 'RIGHT';
    const clean = handle.replace(/^(group-|target-)+/, '').toUpperCase();
    if (['TOP', 'BOTTOM', 'LEFT', 'RIGHT'].includes(clean)) {
      return clean as 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
    }
    return 'RIGHT';
  };

  const newEdge: FocusEdge = {
    id: `edge-${Date.now()}`,
    sourceId: connection.source,
    sourceType: isSourceGroup ? 'GROUP' : 'NODE',
    targetId: connection.target,
    targetType: isTargetGroup ? 'GROUP' : 'NODE',
    sourceAnchor: parseAnchor(connection.sourceHandle),
    targetAnchor: parseAnchor(connection.targetHandle),
    style: 'SOLID'
  };

  store.addEdge(newEdge);
}

function onPaneClick() {
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
}

// -----------------------------------------------------------------------------
// 模式切换与排版保存/撤销
// -----------------------------------------------------------------------------

function toggleEditMode() {
  if (!isEditMode.value) {
    // 进入编辑模式：捕获当前坐标快照，供 Esc 或取消时无损恢复
    preEditNodesSnapshot = store.nodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
    preEditGroupsSnapshot = store.groups.map(g => ({ id: g.id, x: g.position.x, y: g.position.y }));
    isEditMode.value = true;
  } else {
    // 退出编辑模式前自动保存排版
    saveLayoutChanges();
    isEditMode.value = false;
  }
}

// 放弃排版调整 (Esc 无损撤销)
function cancelLayoutChanges() {
  if (!isEditMode.value) return;
  // 从快照恢复
  for (const snap of preEditNodesSnapshot) {
    const node = store.nodes.find(n => n.id === snap.id);
    if (node) {
      node.position.x = snap.x;
      node.position.y = snap.y;
    }
  }
  for (const snap of preEditGroupsSnapshot) {
    const group = store.groups.find(g => g.id === snap.id);
    if (group) {
      group.position.x = snap.x;
      group.position.y = snap.y;
    }
  }
  syncToFlow();
  isEditMode.value = false;
}

// 保存当前排版坐标
async function saveLayoutChanges() {
  // 从 VueFlow 实例同步当前实际拖拽坐标回 Pinia
  for (const fn of flowNodes.value) {
    if (fn.type === 'focusNode') {
      const node = store.nodes.find(n => n.id === fn.id);
      if (node) {
        node.position.x = Math.round(fn.position.x);
        node.position.y = Math.round(fn.position.y);
      }
    } else if (fn.type === 'focusGroup') {
      const group = store.groups.find(g => g.id === fn.id);
      if (group) {
        group.position.x = Math.round(fn.position.x);
        group.position.y = Math.round(fn.position.y);
      }
    }
  }
  await store.syncTree();
}

// 键盘快捷键监听 (Delete/Backspace 删除选中对象, Esc 撤销排版)
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (isSpecModalOpen.value) {
      isSpecModalOpen.value = false;
    } else if (isNodeEditModalOpen.value) {
      isNodeEditModalOpen.value = false;
    } else if (isGroupEditModalOpen.value) {
      isGroupEditModalOpen.value = false;
    } else if (isEditMode.value) {
      cancelLayoutChanges();
    }
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && isEditMode.value) {
    // 焦点在输入框中时不拦截
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (selectedEdgeId.value) {
      store.deleteEdge(selectedEdgeId.value);
      selectedEdgeId.value = null;
    } else if (selectedNodeId.value) {
      const isGroup = store.groups.some(g => g.id === selectedNodeId.value);
      if (isGroup) {
        store.deleteGroup(selectedNodeId.value);
      } else {
        store.deleteNode(selectedNodeId.value);
      }
      selectedNodeId.value = null;
    }
  }
}

// 模态框事件
function openNewNodeModal() {
  editingNode.value = null;
  isNodeEditModalOpen.value = true;
}

function openNewGroupModal() {
  editingGroup.value = null;
  isGroupEditModalOpen.value = true;
}

function handleSaveNode(nodeData: FocusNode) {
  const existing = store.nodes.find(n => n.id === nodeData.id);
  if (existing) {
    store.updateNode(nodeData.id, nodeData);
  } else {
    store.addNode(nodeData);
  }
}

function handleDeleteNode(node: FocusNode) {
  store.deleteNode(node.id);
  if (selectedNodeId.value === node.id) {
    selectedNodeId.value = null;
  }
}

function handleSaveGroup(groupData: FocusGroup) {
  const existing = store.groups.find(g => g.id === groupData.id);
  if (existing) {
    store.updateGroup(groupData.id, groupData);
  } else {
    store.addGroup(groupData);
  }
}

function handleDeleteGroup(groupId: string) {
  store.deleteGroup(groupId);
  if (selectedNodeId.value === groupId) {
    selectedNodeId.value = null;
  }
}

onMounted(() => {
  store.fetchTree();
  store.fetchEvolution();
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <div class="canvas-view-container">
    <!-- 顶部极简毛玻璃控制条 -->
    <div class="canvas-header-bar">
      <div class="bar-left">
        <h1 class="system-title">国策树画布中枢</h1>
        <div class="lit-badge font-mono" title="已点亮国策统计">
          🟢 {{ litStats.lit }}/{{ litStats.total }} 已点亮
        </div>
      </div>

      <div class="bar-center">
        <!-- 核心交互模式切换开关 -->
        <button 
          class="mode-toggle-btn"
          :class="{ 'is-editing': isEditMode }"
          @click="toggleEditMode"
        >
          <span v-if="!isEditMode">👁️ 展示模式 (双击点亮 · 右键规范)</span>
          <span v-else>✏️ 编辑模式 (拖拽排版 · 磁吸连线)</span>
        </button>
      </div>

      <div class="bar-right">
        <!-- 编辑模式专有行动项 -->
        <template v-if="isEditMode">
          <button class="btn-action-tool" @click="openNewNodeModal">
            + 新建国策
          </button>
          <button class="btn-action-tool" @click="openNewGroupModal">
            + 新建分组
          </button>
          <button class="btn-action-tool btn-save-layout" @click="saveLayoutChanges">
            💾 保存排版
          </button>
          <button class="btn-action-tool btn-cancel-layout" @click="cancelLayoutChanges" title="按 Esc 键放弃排版修改">
            放弃排版 (Esc)
          </button>
        </template>
        <!-- 展示模式快捷项 -->
        <template v-else>
          <button class="btn-action-tool" @click="fitView({ padding: 0.2 })" title="自适应居中对齐">
            🎯 居中全景
          </button>
          <button class="btn-action-tool" @click="store.fetchTree" title="重新从数据库拉取最新国策树">
            🔄 刷新
          </button>
        </template>
      </div>
    </div>

    <!-- Vue Flow 核心画布容器 -->
    <div class="vue-flow-viewport">
      <VueFlow
        v-model:nodes="flowNodes"
        v-model:edges="flowEdges"
        :fit-view-on-init="true"
        :pan-on-drag="!isEditMode || true"
        :nodes-draggable="isEditMode"
        :nodes-connectable="isEditMode"
        :elements-selectable="true"
        :connection-line-type="ConnectionLineType.SmoothStep"
        :connection-mode="ConnectionMode.Loose"
        class="focus-tree-flow"
        @node-click="onNodeClick"
        @node-double-click="onNodeDoubleClick"
        @node-contextmenu="onNodeContextMenu"
        @edge-click="onEdgeClick"
        @edge-double-click="onEdgeDoubleClick"
        @connect="onConnect"
        @pane-click="onPaneClick"
      >
        <!-- 自定义国策节点 -->
        <template #node-focusNode="props">
          <FocusNodeCard 
            :id="props.id"
            :data="props.data"
            :selected="props.selected"
            @toggle-lit="store.toggleNodeLit(props.id)"
            @open-spec="openSpecCard(props.id)"
          />
        </template>

        <!-- 自定义分组外框 -->
        <template #node-focusGroup="props">
          <FocusGroupFrame 
            :id="props.id"
            :data="props.data"
            :selected="props.selected"
            @edit-group="editingGroup = $event; isGroupEditModalOpen = true"
          />
        </template>

        <!-- 自定义正交避障连线 -->
        <template #edge-orthogonal="props">
          <OrthogonalEdge 
            v-bind="props" 
            @delete-edge="onDeleteEdge"
          />
        </template>
      </VueFlow>
    </div>

    <!-- 弹窗一：国策详细规范卡 -->
    <NodeSpecModal
      :is-open="isSpecModalOpen"
      :node="activeSpecNode"
      :is-edit-mode="isEditMode"
      @close="isSpecModalOpen = false"
      @edit="editingNode = $event; isSpecModalOpen = false; isNodeEditModalOpen = true"
      @delete="handleDeleteNode"
    />

    <!-- 弹窗二：新建/编辑国策节点 -->
    <NodeEditModal
      :is-open="isNodeEditModalOpen"
      :node="editingNode"
      :groups="store.groups"
      @close="isNodeEditModalOpen = false"
      @save="handleSaveNode"
    />

    <!-- 弹窗三：新建/编辑分组外框 -->
    <GroupEditModal
      :is-open="isGroupEditModalOpen"
      :group="editingGroup"
      @close="isGroupEditModalOpen = false"
      @save="handleSaveGroup"
      @delete="handleDeleteGroup"
    />
  </div>
</template>

<style scoped>
.canvas-view-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background-color: var(--bg-primary);
}

/* 顶部控制条 */
.canvas-header-bar {
  height: 54px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  backdrop-filter: blur(12px);
  z-index: 100;
  box-shadow: var(--shadow-sm);
}

.bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.system-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.lit-badge {
  font-size: 12px;
  font-weight: 600;
  background: rgba(6, 182, 212, 0.1);
  border: 1px solid rgba(6, 182, 212, 0.3);
  color: var(--color-lit);
  padding: 3px 10px;
  border-radius: var(--radius-full);
}

.bar-center {
  display: flex;
  align-items: center;
}

.mode-toggle-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 18px;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mode-toggle-btn.is-editing {
  background: rgba(245, 158, 11, 0.12);
  border-color: var(--color-gold);
  color: var(--color-gold);
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
}

.bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-action-tool {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  padding: 5px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-action-tool:hover {
  border-color: var(--color-lit);
  color: var(--color-lit);
}

.btn-save-layout {
  background: var(--color-lit);
  color: #050508;
  font-weight: 700;
  border: none;
}

.btn-save-layout:hover {
  background: #22d3ee;
  color: #050508;
}

.btn-cancel-layout {
  background: rgba(244, 63, 94, 0.1);
  border-color: rgba(244, 63, 94, 0.3);
  color: var(--color-danger);
}

.btn-cancel-layout:hover {
  background: rgba(244, 63, 94, 0.2);
  border-color: var(--color-danger);
}

/* 画布视口 */
.vue-flow-viewport {
  flex: 1;
  width: 100%;
  height: calc(100% - 54px);
  position: relative;
  background-color: var(--bg-primary);
  /* 现代点阵网格背景 */
  background-image: radial-gradient(var(--border-color) 1px, transparent 1px);
  background-size: 24px 24px;
}

.focus-tree-flow {
  width: 100%;
  height: 100%;
}
</style>
