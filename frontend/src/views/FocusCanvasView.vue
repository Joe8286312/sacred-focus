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
  type EdgeMouseEvent,
  type NodeDragEvent
} from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

import { useRoute } from 'vue-router';
import { useFocusTreeStore } from '../stores/focusTree';
import FocusNodeCard from '../components/canvas/FocusNodeCard.vue';
import FocusGroupFrame from '../components/canvas/FocusGroupFrame.vue';
import OrthogonalEdge from '../components/canvas/OrthogonalEdge.vue';
import NodeSpecModal from '../components/canvas/NodeSpecModal.vue';
import NodeEditModal from '../components/canvas/NodeEditModal.vue';
import GroupEditModal from '../components/canvas/GroupEditModal.vue';
import DeletionAuditModal from '../components/canvas/DeletionAuditModal.vue';
import EvolutionModal from '../components/canvas/EvolutionModal.vue';
import type { FocusNode, FocusGroup, FocusEdge } from '../types';

const route = useRoute();
const store = useFocusTreeStore();
const { fitView, setCenter } = useVueFlow();

const highlightedNodeId = ref<string | null>(null);

// 鼠标悬停在国策节点上时，禁用画布左键拖拽平移，彻底防误触
const isHoveringNode = ref(false);

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

const isEvolutionModalOpen = ref(false);

const currentActiveVersion = computed(() => {
  const p = store.evolution.activePointerIndex;
  const found = store.evolution.snapshots.find(s => s.slotIndex === p);
  return found ? found.version : 'v1.0';
});

// 临时草稿沙盒数据（编辑模式专属）
const draftNodes = ref<FocusNode[]>([]);
const draftGroups = ref<FocusGroup[]>([]);
const draftEdges = ref<FocusEdge[]>([]);

// 当前画布活跃数据源（展示模式读持久库，编辑模式读写内存草稿）
const activeNodes = computed(() => isEditMode.value ? draftNodes.value : store.nodes);
const activeGroups = computed(() => isEditMode.value ? draftGroups.value : store.groups);
const activeEdges = computed(() => isEditMode.value ? draftEdges.value : store.edges);

// 审计弹窗状态
const isAuditModalOpen = ref(false);
const auditDeletedNodes = ref<FocusNode[]>([]);
const auditDeletedGroups = ref<FocusGroup[]>([]);
const auditCascadeEdgesCount = ref(0);

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
  const currentPosMap = new Map<string, { x: number; y: number }>();
  for (const fn of flowNodes.value) {
    if (fn && fn.position) {
      currentPosMap.set(fn.id, { x: fn.position.x, y: fn.position.y });
    }
  }

  const nodesList: any[] = [];
  const sourceGroups = activeGroups.value;
  const sourceNodes = activeNodes.value;
  const sourceEdges = activeEdges.value;

  // 1. 分组外框节点 (处于下层 zIndex: 1)
  for (const g of sourceGroups) {
    const pos = (isEditMode.value && currentPosMap.has(g.id))
      ? currentPosMap.get(g.id)!
      : { ...g.position };
    nodesList.push({
      id: g.id,
      type: 'focusGroup',
      position: pos,
      data: { 
        ...g, 
        isEditMode: isEditMode.value,
        activeConnectingHandle: activeConnectingHandle.value,
        isHighlighted: highlightedNodeId.value === g.id
      },
      draggable: isEditMode.value,
      selectable: isEditMode.value,
      style: { zIndex: highlightedNodeId.value === g.id ? 25 : 1 }
    });
  }

  // 2. 国策节点 (处于上层 zIndex: 10)
  for (const n of sourceNodes) {
    const pos = (isEditMode.value && currentPosMap.has(n.id))
      ? currentPosMap.get(n.id)!
      : { ...n.position };
    nodesList.push({
      id: n.id,
      type: 'focusNode',
      position: pos,
      data: { 
        ...n, 
        isEditMode: isEditMode.value,
        activeConnectingHandle: activeConnectingHandle.value,
        isHighlighted: highlightedNodeId.value === n.id
      },
      draggable: isEditMode.value,
      selectable: true,
      style: { zIndex: 10 }
    });
  }

  flowNodes.value = nodesList;

  // 3. 拓扑连线 (层级处于中间偏上)
  flowEdges.value = sourceEdges.map(e => ({
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

watch(
  [
    () => store.nodes, 
    () => store.groups, 
    () => store.edges, 
    draftNodes, 
    draftGroups, 
    draftEdges, 
    isEditMode, 
    activeConnectingHandle
  ], 
  () => {
    syncToFlow();
  }, 
  { deep: true }
);

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

// 拖拽停止后同步草稿内存坐标
function onNodeDragStop({ node, nodes }: NodeDragEvent) {
  if (!isEditMode.value) return;
  const targetNodes = nodes && nodes.length > 0 ? nodes : (node ? [node] : []);
  for (const n of targetNodes) {
    if (n.type === 'focusNode') {
      const found = draftNodes.value.find(item => item.id === n.id);
      if (found) {
        found.position.x = Math.round(n.position.x);
        found.position.y = Math.round(n.position.y);
      }
    } else if (n.type === 'focusGroup') {
      const found = draftGroups.value.find(item => item.id === n.id);
      if (found) {
        found.position.x = Math.round(n.position.x);
        found.position.y = Math.round(n.position.y);
      }
    }
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
      const found = draftNodes.value.find(n => n.id === node.id);
      if (found) {
        editingNode.value = found;
        isNodeEditModalOpen.value = true;
      }
    }
  } else if (node.type === 'focusGroup' && isEditMode.value) {
    const found = draftGroups.value.find(g => g.id === node.id);
    if (found) {
      editingGroup.value = found;
      isGroupEditModalOpen.value = true;
    }
  }
}

function openSpecCard(nodeId: string) {
  const sourceNodes = isEditMode.value ? draftNodes.value : store.nodes;
  const found = sourceNodes.find(n => n.id === nodeId);
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

    const isSourceGroup = draftGroups.value.some(g => g.id === source.nodeId);
    const isTargetGroup = draftGroups.value.some(g => g.id === target.nodeId);

    const newEdge: FocusEdge = {
      id: `edge-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sourceId: source.nodeId,
      sourceType: isSourceGroup ? 'GROUP' : 'NODE',
      targetId: target.nodeId,
      targetType: isTargetGroup ? 'GROUP' : 'NODE',
      sourceAnchor: source.anchor,
      targetAnchor: target.anchor,
      style: 'SOLID'
    };

    draftEdges.value.push(newEdge);
    activeConnectingHandle.value = null;
  }
}

// 拖拽连线兼容
function onConnect(connection: Connection) {
  if (!isEditMode.value) return;
  if (!connection.source || !connection.target) return;
  if (connection.source === connection.target) return;

  const isSourceGroup = draftGroups.value.some(g => g.id === connection.source);
  const isTargetGroup = draftGroups.value.some(g => g.id === connection.target);

  const parseAnchor = (handle?: string | null): 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' => {
    if (!handle) return 'RIGHT';
    const clean = handle.toUpperCase();
    if (['TOP', 'BOTTOM', 'LEFT', 'RIGHT'].includes(clean)) {
      return clean as 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
    }
    return 'RIGHT';
  };

  const newEdge: FocusEdge = {
    id: `edge-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    sourceId: connection.source,
    sourceType: isSourceGroup ? 'GROUP' : 'NODE',
    targetId: connection.target,
    targetType: isTargetGroup ? 'GROUP' : 'NODE',
    sourceAnchor: parseAnchor(connection.sourceHandle),
    targetAnchor: parseAnchor(connection.targetHandle),
    style: 'SOLID'
  };

  draftEdges.value.push(newEdge);
}

// 单击连线
function onEdgeClick({ edge }: EdgeMouseEvent) {
  selectedEdgeId.value = edge.id;
  selectedNodeId.value = null;
}

// 双击连线删除
function onEdgeDoubleClick({ edge }: EdgeMouseEvent) {
  if (isEditMode.value) {
    onDeleteEdge(edge.id);
  }
}

function onDeleteEdge(edgeId: string) {
  if (!isEditMode.value) return;
  draftEdges.value = draftEdges.value.filter(e => e.id !== edgeId);
  if (selectedEdgeId.value === edgeId) {
    selectedEdgeId.value = null;
  }
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
// 模式切换与排版保存/撤销（彻底沙盒化体系）
// -----------------------------------------------------------------------------

function enterEditMode() {
  draftNodes.value = JSON.parse(JSON.stringify(store.nodes));
  draftGroups.value = JSON.parse(JSON.stringify(store.groups));
  draftEdges.value = JSON.parse(JSON.stringify(store.edges));
  isEditMode.value = true;
  activeConnectingHandle.value = null;
  syncToFlow();
}

function cancelLayoutChanges() {
  if (!isEditMode.value) return;
  // 彻底丢弃草稿，零脏数据残留，还原持久状态
  draftNodes.value = [];
  draftGroups.value = [];
  draftEdges.value = [];
  isEditMode.value = false;
  activeConnectingHandle.value = null;
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
  syncToFlow();
}

function toggleEditMode() {
  if (!isEditMode.value) {
    enterEditMode();
  } else {
    // 关键修正：在编辑模式下点击中间按钮，属于“退出/放弃”排版，直接回退持久画布
    cancelLayoutChanges();
  }
}

function onResizeGroup(payload: { id: string; size: { width: number; height: number } }) {
  if (!isEditMode.value) return;
  const found = draftGroups.value.find(g => g.id === payload.id);
  if (found) {
    found.size = { ...payload.size };
  }
}

// 点击右侧“保存排版”：前置差异比对审计
function initiateSaveLayout() {
  // 1. 同步 flowNodes 的当前坐标与尺寸至草稿
  for (const fn of flowNodes.value) {
    if (fn.type === 'focusNode') {
      const node = draftNodes.value.find(n => n.id === fn.id);
      if (node) {
        node.position.x = Math.round(fn.position.x);
        node.position.y = Math.round(fn.position.y);
      }
    } else if (fn.type === 'focusGroup') {
      const group = draftGroups.value.find(g => g.id === fn.id);
      if (group) {
        group.position.x = Math.round(fn.position.x);
        group.position.y = Math.round(fn.position.y);
        if (fn.data?.size) {
          group.size = { ...fn.data.size };
        }
      }
    }
  }

  // 2. 差异比对 (Diff): 比对持久库中有但在草稿中被移出的节点与分组
  const deletedNodes = store.nodes.filter(pn => !draftNodes.value.some(dn => dn.id === pn.id));
  const deletedGroups = store.groups.filter(pg => !draftGroups.value.some(dg => dg.id === pg.id));

  if (deletedNodes.length > 0 || deletedGroups.length > 0) {
    auditDeletedNodes.value = deletedNodes;
    auditDeletedGroups.value = deletedGroups;
    const deletedNodeIds = new Set(deletedNodes.map(n => n.id));
    const deletedGroupIds = new Set(deletedGroups.map(g => g.id));
    const cascadeEdges = store.edges.filter(e => 
      deletedNodeIds.has(e.sourceId) || 
      deletedNodeIds.has(e.targetId) ||
      deletedGroupIds.has(e.sourceId) || 
      deletedGroupIds.has(e.targetId)
    );
    auditCascadeEdgesCount.value = cascadeEdges.length;
    isAuditModalOpen.value = true;
  } else {
    executeSaveLayout();
  }
}

// 执行全量覆盖持久化保存
async function executeSaveLayout() {
  isAuditModalOpen.value = false;
  await store.saveWholeTree({
    nodes: draftNodes.value,
    groups: draftGroups.value,
    edges: draftEdges.value
  });
  // 成功保存后清空草稿并退出编辑模式
  draftNodes.value = [];
  draftGroups.value = [];
  draftEdges.value = [];
  isEditMode.value = false;
  activeConnectingHandle.value = null;
  syncToFlow();
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (isAuditModalOpen.value) {
      isAuditModalOpen.value = false;
    } else if (isEvolutionModalOpen.value) {
      isEvolutionModalOpen.value = false;
    } else if (activeConnectingHandle.value) {
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
      draftEdges.value = draftEdges.value.filter(edge => edge.id !== selectedEdgeId.value);
      selectedEdgeId.value = null;
    } else if (selectedNodeId.value) {
      const node = draftNodes.value.find(n => n.id === selectedNodeId.value);
      if (node) {
        // 无弹窗打扰，仅从草稿中移除
        draftNodes.value = draftNodes.value.filter(n => n.id !== node.id);
        draftEdges.value = draftEdges.value.filter(edge => edge.sourceId !== node.id && edge.targetId !== node.id);
        selectedNodeId.value = null;
      } else {
        const group = draftGroups.value.find(g => g.id === selectedNodeId.value);
        if (group) {
          // 无弹窗打扰，仅从草稿中移除分组
          draftGroups.value = draftGroups.value.filter(g => g.id !== group.id);
          draftNodes.value.forEach(n => {
            if (n.groupId === group.id) n.groupId = null;
          });
          draftEdges.value = draftEdges.value.filter(edge => edge.sourceId !== group.id && edge.targetId !== group.id);
          selectedNodeId.value = null;
        }
      }
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
  if (!isEditMode.value) return;
  const idx = draftNodes.value.findIndex(n => n.id === nodeData.id);
  if (idx !== -1) {
    draftNodes.value[idx] = { ...draftNodes.value[idx], ...nodeData };
  } else {
    if (!nodeData.id) {
      nodeData.id = `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    }
    if (!nodeData.position || (nodeData.position.x === 0 && nodeData.position.y === 0)) {
      nodeData.position = store.calculateSmartPlacement(nodeData.groupId);
    }
    draftNodes.value.push(nodeData);
    store.lastCreatedNodeId = nodeData.id;
  }
  isNodeEditModalOpen.value = false;
  editingNode.value = null;
}

function handleDeleteNode(node: FocusNode) {
  if (!isEditMode.value) return;
  draftNodes.value = draftNodes.value.filter(n => n.id !== node.id);
  draftEdges.value = draftEdges.value.filter(e => e.sourceId !== node.id && e.targetId !== node.id);
  if (selectedNodeId.value === node.id) {
    selectedNodeId.value = null;
  }
  isNodeEditModalOpen.value = false;
  editingNode.value = null;
}

function handleSaveGroup(groupData: FocusGroup) {
  if (!isEditMode.value) return;
  const idx = draftGroups.value.findIndex(g => g.id === groupData.id);
  if (idx !== -1) {
    draftGroups.value[idx] = { ...draftGroups.value[idx], ...groupData };
  } else {
    if (!groupData.id) {
      groupData.id = `group-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    }
    if (!groupData.position || (groupData.position.x === 0 && groupData.position.y === 0)) {
      groupData.position = store.calculateSmartGroupPlacement();
    }
    draftGroups.value.push(groupData);
    store.lastCreatedGroupId = groupData.id;
  }
}

function handleDeleteGroup(groupId: string) {
  if (!isEditMode.value) return;
  draftGroups.value = draftGroups.value.filter(g => g.id !== groupId);
  draftNodes.value.forEach(n => {
    if (n.groupId === groupId) n.groupId = null;
  });
  draftEdges.value = draftEdges.value.filter(e => e.sourceId !== groupId && e.targetId !== groupId);
  if (selectedNodeId.value === groupId) {
    selectedNodeId.value = null;
  }
}

onMounted(async () => {
  await store.fetchTree();
  store.fetchEvolution();
  syncToFlow();
  window.addEventListener('keydown', handleKeyDown);

  // 若通过路由参数携带 edit=true (例如从重构弹窗一键跳转)，自动开启编辑模式
  if (route.query.edit === 'true') {
    enterEditMode();
  }

  // 监听跨页面/弹窗联动标记
  checkCanvasLinkage();
});

function checkCanvasLinkage() {
  // 联动 1：新建节点自动平滑平移至该卡片，并激发脉冲微光呼吸动画
  if (store.lastCreatedNodeId) {
    const targetId = store.lastCreatedNodeId;
    store.lastCreatedNodeId = null;
    setTimeout(() => {
      const found = flowNodes.value.find(n => n.id === targetId);
      if (found) {
        setCenter(found.position.x + 90, found.position.y + 40, { duration: 800 });
        highlightedNodeId.value = targetId;
        syncToFlow();
        setTimeout(() => {
          highlightedNodeId.value = null;
          syncToFlow();
        }, 2600);
      }
    }, 250);
  }

  // 联动 2：新建/编辑分组自动平滑平移至该分组外框并激发光晕微光呼吸动画
  if (store.lastCreatedGroupId) {
    const targetGroupId = store.lastCreatedGroupId;
    store.lastCreatedGroupId = null;
    setTimeout(() => {
      const found = flowNodes.value.find(n => n.id === targetGroupId);
      if (found) {
        const w = (found.data as any)?.size?.width || (found.data as any)?.width || 360;
        const h = (found.data as any)?.size?.height || (found.data as any)?.height || 260;
        setCenter(found.position.x + w / 2, found.position.y + h / 2, { duration: 800 });
        highlightedNodeId.value = targetGroupId;
        syncToFlow();
        setTimeout(() => {
          highlightedNodeId.value = null;
          syncToFlow();
        }, 2600);
      }
    }, 250);
  }
}

// 实时监听来自当前页面弹窗或外部触发的创建标记
watch(
  [() => store.lastCreatedNodeId, () => store.lastCreatedGroupId],
  ([newNodeId, newGroupId]) => {
    if (newNodeId || newGroupId) {
      checkCanvasLinkage();
    }
  }
);

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
          <span class="badge-dot"></span>
          <span>{{ litStats.lit }}/{{ litStats.total }} 已点亮</span>
        </div>
      </div>

      <div class="bar-center">
        <!-- 核心交互模式切换开关 (严格居中) -->
        <button 
          class="mode-toggle-btn"
          :class="{ 'is-editing': isEditMode }"
          @click="toggleEditMode"
          :title="isEditMode ? '点击退出编辑模式并放弃修改' : '点击进入编辑排版与连线模式'"
        >
          <span v-if="!isEditMode">展示模式 (单击点亮 · 双击规范)</span>
          <span v-else>编辑模式 (点击退出并放弃修改)</span>
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
          <button class="btn-action-tool btn-save-layout" @click="initiateSaveLayout">
            保存排版
          </button>
          <button class="btn-action-tool btn-cancel-layout" @click="cancelLayoutChanges" title="按 Esc 键放弃排版修改">
            放弃排版 (Esc)
          </button>
        </template>
        <!-- 展示模式快捷项 -->
        <template v-else>
          <button class="btn-action-tool btn-evolution-tool" @click="isEvolutionModalOpen = true" title="演化日志与5槽位防震荡快照回滚">
            演化快照 ({{ currentActiveVersion }})
          </button>
          <button class="btn-action-tool" @click="fitView({ padding: 0.15, minZoom: 0.05, maxZoom: 1 })" title="自适应居中对齐">
            居中全景
          </button>
          <button class="btn-action-tool" @click="store.fetchTree" title="重新从数据库拉取最新国策树">
            刷新
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
        :pan-on-drag="!isHoveringNode"
        :min-zoom="0.05"
        :max-zoom="3"
        :nodes-draggable="isEditMode"
        :nodes-connectable="isEditMode"
        :elements-selectable="true"
        :connection-line-type="ConnectionLineType.SmoothStep"
        :connection-mode="ConnectionMode.Loose"
        class="focus-tree-flow"
        @node-click="onNodeClick"
        @node-double-click="onNodeDoubleClick"
        @node-drag-stop="onNodeDragStop"
        @node-mouse-enter="isHoveringNode = true"
        @node-mouse-leave="isHoveringNode = false"
        @pane-mouse-enter="isHoveringNode = false"
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
            @node-hover="isHoveringNode = $event"
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
            @resize-group="onResizeGroup"
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
      :groups="isEditMode ? draftGroups : store.groups"
      @close="isNodeEditModalOpen = false"
      @save="handleSaveNode"
      @delete="handleDeleteNode"
    />

    <!-- 弹窗三：新建/编辑分组外框 -->
    <GroupEditModal
      :is-open="isGroupEditModalOpen"
      :group="editingGroup"
      :is-draft-mode="isEditMode"
      :draft-groups="draftGroups"
      :draft-nodes="draftNodes"
      @close="isGroupEditModalOpen = false"
      @save="handleSaveGroup"
      @delete="handleDeleteGroup"
    />

    <!-- 弹窗四：排版删除集中审计确认弹窗 -->
    <DeletionAuditModal
      :is-open="isAuditModalOpen"
      :deleted-nodes="auditDeletedNodes"
      :deleted-groups="auditDeletedGroups"
      :cascade-edges-count="auditCascadeEdgesCount"
      @close="isAuditModalOpen = false"
      @confirm="executeSaveLayout"
    />

    <!-- 弹窗五：国策演化与 5 槽位防震荡环形快照回滚中枢 -->
    <EvolutionModal
      :is-open="isEvolutionModalOpen"
      @close="isEvolutionModalOpen = false"
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.28);
  color: #10B981;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  white-space: nowrap;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10B981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
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
  background: var(--bg-tertiary);
  border-color: var(--border-focus);
}

.btn-evolution-tool {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.4);
  color: #10B981;
  font-weight: 600;
}

.btn-evolution-tool:hover {
  background: rgba(16, 185, 129, 0.16);
  border-color: #10B981;
  color: #34D399;
}

.btn-save-layout {
  background: var(--text-primary);
  color: var(--bg-primary);
  font-weight: 600;
  border: 1px solid transparent;
}

.btn-save-layout:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.btn-cancel-layout {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.btn-cancel-layout:hover {
  background: var(--bg-tertiary);
  color: var(--color-danger);
  border-color: rgba(244, 63, 94, 0.35);
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

/* 彻底解决分组外框阻挡内部连线选取的底层原因：
   1. 将连线图层置于分组节点外框之上 (z-index: 5)
   2. 将 Vue Flow 自动生成的 .vue-flow__node-focusGroup 外框容器设为 pointer-events: none
   3. 分组标题栏与连接桩单独保留 pointer-events: all */
:deep(.vue-flow__edges) {
  z-index: 5 !important;
}

:deep(.vue-flow__node-focusGroup) {
  z-index: 1 !important;
  pointer-events: none !important;
}

:deep(.vue-flow__node-focusGroup .group-header),
:deep(.vue-flow__node-focusGroup .group-handle),
:deep(.vue-flow__node-focusGroup .group-resizer) {
  pointer-events: all !important;
}

:deep(.vue-flow__node-focusNode) {
  z-index: 10 !important;
  pointer-events: all !important;
}
</style>
