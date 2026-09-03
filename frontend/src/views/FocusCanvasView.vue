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

// 两步点击连接桩状态 (Click-to-Connect)
const activeConnectingHandle = ref<{ nodeId: string; anchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' } | null>(null);

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
      data: { 
        ...g, 
        isEditMode: isEditMode.value,
        activeConnectingHandle: activeConnectingHandle.value
      },
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
      data: { 
        ...n, 
        isEditMode: isEditMode.value,
        activeConnectingHandle: activeConnectingHandle.value
      },
      draggable: isEditMode.value,
      selectable: true,
      style: { zIndex: 10 }
    });
  }

  flowNodes.value = nodesList;

  // 3. 拓扑连线 (层级处于中间偏上)
  flowEdges.value = store.edges.map(e => ({
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    sourceHandle: e.sourceAnchor ? e.sourceAnchor.toLowerCase() : undefined,
    targetHandle: e.targetAnchor ? e.targetAnchor.toLowerCase() : undefined,
    type: 'orthogonal',
    markerEnd: MarkerType.ArrowClosed,
    data: { ...e, isEditMode: isEditMode.value }
  }));
}

watch([() => store.nodes, () => store.groups, () => store.edges, isEditMode, activeConnectingHandle], () => {
  syncToFlow();
}, { deep: true });

// -----------------------------------------------------------------------------
// 交互事件处理 (遵循用户最新核心定调：展示模式下单击点亮、双击规范；编辑模式下双击编辑)
// -----------------------------------------------------------------------------

// 单击节点
function onNodeClick({ node }: NodeMouseEvent) {
  selectedNodeId.value = node.id;
  selectedEdgeId.value = null;

  if (!isEditMode.value && node.type === 'focusNode') {
    // 模式 A 展示模式：单击快速切换【点亮 / 熄灭】
    store.toggleNodeLit(node.id);
  }
}

// 双击节点
function onNodeDoubleClick({ node }: NodeMouseEvent) {
  if (node.type === 'focusNode') {
    if (!isEditMode.value) {
      // 模式 A 展示模式：双击唤出【详细规范卡】
      openSpecCard(node.id);
    } else {
      // 模式 B 编辑模式：双击呼出【国策编辑表单】
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

function openSpecCard(nodeId: string) {
  const found = store.nodes.find(n => n.id === nodeId);
  if (found) {
    activeSpecNode.value = found;
    isSpecModalOpen.value = true;
  }
}

// -----------------------------------------------------------------------------
// 两步点击精准连线 (Click-to-Connect)
// -----------------------------------------------------------------------------

function onHandleClick(payload: { nodeId: string; anchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' }) {
  if (!isEditMode.value) return;

  if (!activeConnectingHandle.value) {
    // 第一步：选定起始端 (Source)
    activeConnectingHandle.value = payload;
  } else {
    // 如果再次点击了同一个桩，取消选定
    if (
      activeConnectingHandle.value.nodeId === payload.nodeId &&
      activeConnectingHandle.value.anchor === payload.anchor
    ) {
      activeConnectingHandle.value = null;
      return;
    }

    // 第二步：选定目标端 (Target)，立刻生成确定性的 Source ➔ Target 有向连线
    const source = activeConnectingHandle.value;
    const target = payload;

    const isSourceGroup = store.groups.some(g => g.id === source.nodeId);
    const isTargetGroup = store.groups.some(g => g.id === target.nodeId);

    const newEdge: FocusEdge = {
      id: `edge-${Date.now()}`,
      sourceId: source.nodeId,
      sourceType: isSourceGroup ? 'GROUP' : 'NODE',
      targetId: target.nodeId,
      targetType: isTargetGroup ? 'GROUP' : 'NODE',
      sourceAnchor: source.anchor,
      targetAnchor: target.anchor,
      style: 'SOLID'
    };

    store.addEdge(newEdge);
    activeConnectingHandle.value = null;
  }
}

// 拖拽连线兼容
function onConnect(connection: Connection) {
  if (!isEditMode.value) return;
  if (!connection.source || !connection.target) return;
  if (connection.source === connection.target) return;

  const isSourceGroup = store.groups.some(g => g.id === connection.source);
  const isTargetGroup = store.groups.some(g => g.id === connection.target);

  const parseAnchor = (handle?: string | null): 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' => {
    if (!handle) return 'RIGHT';
    const clean = handle.toUpperCase();
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

function onPaneClick() {
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
  // 单击空白处取消待连接桩
  if (activeConnectingHandle.value) {
    activeConnectingHandle.value = null;
  }
}

// -----------------------------------------------------------------------------
// 模式切换与排版保存/撤销
// -----------------------------------------------------------------------------

function toggleEditMode() {
  if (!isEditMode.value) {
    preEditNodesSnapshot = store.nodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
    preEditGroupsSnapshot = store.groups.map(g => ({ id: g.id, x: g.position.x, y: g.position.y }));
    isEditMode.value = true;
  } else {
    saveLayoutChanges();
    isEditMode.value = false;
    activeConnectingHandle.value = null;
  }
}

function cancelLayoutChanges() {
  if (!isEditMode.value) return;
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
  activeConnectingHandle.value = null;
}

async function saveLayoutChanges() {
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

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (activeConnectingHandle.value) {
      activeConnectingHandle.value = null;
    } else if (isSpecModalOpen.value) {
      isSpecModalOpen.value = false;
    } else if (isNodeEditModalOpen.value) {
      isNodeEditModalOpen.value = false;
    } else if (isGroupEditModalOpen.value) {
      isGroupEditModalOpen.value = false;
    } else if (isEditMode.value) {
      cancelLayoutChanges();
    }
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && isEditMode.value) {
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
    <!-- 顶部极简毛玻璃控制条：采用 1fr auto 1fr 三列严格网格对齐，中心按钮永不位移 -->
    <div class="canvas-header-bar">
      <div class="bar-left">
        <h1 class="system-title">国策树画布中枢</h1>
        <div class="lit-badge font-mono" title="已点亮国策统计">
          🟢 {{ litStats.lit }}/{{ litStats.total }} 已点亮
        </div>
      </div>

      <div class="bar-center">
        <!-- 核心交互模式切换开关 (严格居中) -->
        <button 
          class="mode-toggle-btn"
          :class="{ 'is-editing': isEditMode }"
          @click="toggleEditMode"
        >
          <span v-if="!isEditMode">👁️ 展示模式 (单击点亮 · 双击规范)</span>
          <span v-else>✏️ 编辑模式 (拖拽排版 · 点击连线)</span>
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

    <!-- 两步连线提示条 -->
    <Transition name="slide-banner">
      <div v-if="activeConnectingHandle" class="connecting-hint-banner">
        <span class="hint-pulse-dot"></span>
        <span>已选中起始桩 <strong>[{{ activeConnectingHandle.nodeId }} · {{ activeConnectingHandle.anchor }}]</strong>，请点击目标国策连接桩以相连</span>
        <button class="btn-cancel-hint" @click="activeConnectingHandle = null">取消 (Esc)</button>
      </div>
    </Transition>

    <!-- Vue Flow 核心画布容器 -->
    <div class="vue-flow-viewport">
      <VueFlow
        v-model:nodes="flowNodes"
        v-model:edges="flowEdges"
        :fit-view-on-init="true"
        :zoom-on-double-click="false"
        :pan-on-drag="true"
        :nodes-draggable="isEditMode"
        :nodes-connectable="isEditMode"
        :elements-selectable="true"
        :connection-line-type="ConnectionLineType.SmoothStep"
        :connection-mode="ConnectionMode.Loose"
        class="focus-tree-flow"
        @node-click="onNodeClick"
        @node-double-click="onNodeDoubleClick"
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
            @handle-click="onHandleClick"
          />
        </template>

        <!-- 自定义分组外框 -->
        <template #node-focusGroup="props">
          <FocusGroupFrame 
            :id="props.id"
            :data="props.data"
            :selected="props.selected"
            @edit-group="editingGroup = $event; isGroupEditModalOpen = true"
            @handle-click="onHandleClick"
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

/* 顶部极简毛玻璃控制条：严格 1fr auto 1fr 三列栅格，保证中间模式开关绝对居中 */
.canvas-header-bar {
  height: 54px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  padding: 0 20px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  backdrop-filter: blur(12px);
  z-index: 100;
  box-shadow: var(--shadow-sm);
}

.bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-self: start;
}

.system-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
}

.lit-badge {
  font-size: 12px;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #10B981;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  white-space: nowrap;
}

.bar-center {
  display: flex;
  align-items: center;
  justify-self: center;
}

.mode-toggle-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 20px;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.mode-toggle-btn.is-editing {
  background: rgba(245, 158, 11, 0.14);
  border-color: var(--color-gold);
  color: var(--color-gold);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
}

.bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-self: end;
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
  white-space: nowrap;
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

/* 连线提示条 */
.connecting-hint-banner {
  position: absolute;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  border: 1px solid var(--color-gold);
  box-shadow: 0 4px 20px rgba(245, 158, 11, 0.35);
  padding: 8px 18px;
  border-radius: var(--radius-full);
  z-index: 150;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-primary);
  backdrop-filter: blur(8px);
}

.hint-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-gold);
  box-shadow: 0 0 8px var(--color-gold);
  animation: pulse-dot 1s infinite alternate;
}

@keyframes pulse-dot {
  from { opacity: 0.4; }
  to { opacity: 1; }
}

.btn-cancel-hint {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  cursor: pointer;
  margin-left: 6px;
}

.btn-cancel-hint:hover {
  color: var(--color-danger);
}

.slide-banner-enter-active, .slide-banner-leave-active {
  transition: all 0.2s ease;
}
.slide-banner-enter-from, .slide-banner-leave-to {
  transform: translate(-50%, -12px);
  opacity: 0;
}

/* 画布视口 */
.vue-flow-viewport {
  flex: 1;
  width: 100%;
  height: calc(100% - 54px);
  position: relative;
  background-color: var(--bg-primary);
  background-image: radial-gradient(var(--border-color) 1px, transparent 1px);
  background-size: 24px 24px;
}

.focus-tree-flow {
  width: 100%;
  height: 100%;
}
</style>
