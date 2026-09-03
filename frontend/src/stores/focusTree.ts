import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FocusNode, FocusEdge, FocusGroup, EvolutionState } from '../types';

export const useFocusTreeStore = defineStore('focusTree', () => {
  const nodes = ref<FocusNode[]>([]);
  const edges = ref<FocusEdge[]>([]);
  const groups = ref<FocusGroup[]>([]);
  const evolution = ref<EvolutionState>({
    activePointerIndex: 0,
    snapshots: []
  });
  const loading = ref(false);
  const lastCreatedNodeId = ref<string | null>(null);

  // 检查某个 (x, y) 矩形区域是否已被已有国策节点或分组外框占用
  function isAreaOccupied(x: number, y: number, w = 210, h = 95): boolean {
    // 1. 检查是否与任何已有国策节点碰撞
    for (const n of nodes.value) {
      if (!n.position) continue;
      const dx = Math.abs(x - n.position.x);
      const dy = Math.abs(y - n.position.y);
      if (dx < w && dy < h) {
        return true;
      }
    }
    // 2. 检查是否与任何分组外框碰撞 (严格杜绝独立国策掉进分组外框内部)
    for (const g of groups.value) {
      if (!g.position || !g.size) continue;
      const gx = g.position.x;
      const gy = g.position.y;
      const gw = g.size.width;
      const gh = g.size.height;
      if (x < gx + gw && x + w > gx && y < gy + gh && y + h > gy) {
        return true;
      }
    }
    return false;
  }

  // 100% 几何无碰撞智能空间放置计算引擎
  function calculateSmartPlacement(groupId: string | null): { x: number; y: number } {
    if (groupId) {
      const group = groups.value.find(g => g.id === groupId);
      if (group) {
        const groupNodes = nodes.value.filter(n => n.groupId === groupId);
        if (groupNodes.length === 0) {
          return { x: Math.round(group.position.x + 24), y: Math.round(group.position.y + 60) };
        }
        const maxY = Math.max(...groupNodes.map(n => n.position.y));
        const referenceX = groupNodes[0].position.x || Math.round(group.position.x + 24);
        const newY = Math.round(maxY + 95);

        // 自适应撑大分组外框高度
        const requiredBottom = newY + 85 + 24;
        const currentBottom = group.position.y + group.size.height;
        if (requiredBottom > currentBottom) {
          group.size.height = Math.round(requiredBottom - group.position.y);
        }
        return { x: Math.round(referenceX), y: newY };
      }
    }

    // 独立国策：在独立国策专属网格（x 从 1060 开始，按列递进，每列从 y=80 开始自上而下检索）
    // 逐槽位执行几何碰撞探测，精准锁定第一个 100% 闲置、绝对无重叠的空旷槽位
    for (let col = 0; col < 12; col++) {
      const candidateX = 1060 + col * 230;
      for (let row = 0; row < 10; row++) {
        const candidateY = 80 + row * 105;
        if (!isAreaOccupied(candidateX, candidateY)) {
          return { x: candidateX, y: candidateY };
        }
      }
    }

    return { x: 1060, y: 800 };
  }

  async function fetchTree() {
    loading.value = true;
    try {
      const res = await fetch('/api/focus-tree');
      if (res.ok) {
        const data = await res.json();
        nodes.value = data.nodes;
        edges.value = data.edges;
        groups.value = data.groups;
      }
    } catch (e) {
      console.error('Failed to fetch focus tree', e);
    } finally {
      loading.value = false;
    }
  }

  async function syncTree() {
    try {
      const res = await fetch('/api/focus-tree', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: nodes.value,
          edges: edges.value,
          groups: groups.value
        })
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to sync tree', e);
      return false;
    }
  }

  async function toggleNodeLit(nodeId: string) {
    // 乐观更新
    const node = nodes.value.find(n => n.id === nodeId);
    if (node) {
      node.isLit = !node.isLit;
    }
    try {
      const res = await fetch(`/api/focus-tree/nodes/${nodeId}/toggle-lit`, { method: 'PATCH' });
      if (!res.ok && node) {
        // 回滚
        node.isLit = !node.isLit;
      }
    } catch (e) {
      console.error('Failed to toggle lit state', e);
      if (node) node.isLit = !node.isLit;
    }
  }

  async function reorderNodes(nodeIds: string[]) {
    try {
      await fetch('/api/focus-tree/nodes/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeIds })
      });
    } catch (e) {
      console.error('Failed to reorder nodes', e);
    }
  }

  async function fetchEvolution() {
    try {
      const res = await fetch('/api/evolution');
      if (res.ok) {
        evolution.value = await res.json();
      }
    } catch (e) {
      console.error('Failed to fetch evolution state', e);
    }
  }

  async function createSnapshot(changelogNotes: string, isMajor: boolean) {
    try {
      const res = await fetch('/api/evolution/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changelogNotes, isMajor })
      });
      if (res.ok) {
        await fetchEvolution();
      }
      return res.ok;
    } catch (e) {
      console.error('Failed to create snapshot', e);
      return false;
    }
  }

  async function rollbackToSlot(targetSlotIndex: number) {
    try {
      const res = await fetch('/api/evolution/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSlotIndex })
      });
      if (res.ok) {
        const data = await res.json();
        nodes.value = data.liveTree.nodes;
        edges.value = data.liveTree.edges;
        groups.value = data.liveTree.groups;
        await fetchEvolution();
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to rollback', e);
      return false;
    }
  }

  async function addNode(node: FocusNode) {
    if (!node.position || (node.position.x === 0 && node.position.y === 0)) {
      node.position = calculateSmartPlacement(node.groupId);
    }
    nodes.value.push(node);
    lastCreatedNodeId.value = node.id;
    try {
      await fetch('/api/focus-tree/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(node)
      });
    } catch (e) {
      console.error('Failed to add node', e);
    }
  }

  async function updateNode(id: string, updates: Partial<FocusNode>) {
    const idx = nodes.value.findIndex(n => n.id === id);
    if (idx !== -1) {
      const current = nodes.value[idx];
      // 若分组变更，自动触发跨组空间重吸附
      if (updates.groupId !== undefined && updates.groupId !== current.groupId) {
        updates.position = calculateSmartPlacement(updates.groupId);
      }
      nodes.value[idx] = { ...nodes.value[idx], ...updates };
    }
    try {
      await fetch(`/api/focus-tree/nodes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.error('Failed to update node', e);
    }
  }

  async function saveReorder(orderedIds: string[]) {
    const nodeMap = new Map(nodes.value.map(n => [n.id, n]));
    const reordered: FocusNode[] = [];
    for (const id of orderedIds) {
      const item = nodeMap.get(id);
      if (item) reordered.push(item);
    }
    for (const n of nodes.value) {
      if (!orderedIds.includes(n.id)) reordered.push(n);
    }
    nodes.value = reordered;
    await reorderNodes(orderedIds);
  }

  async function deleteNode(id: string) {
    nodes.value = nodes.value.filter(n => n.id !== id);
    edges.value = edges.value.filter(e => e.sourceId !== id && e.targetId !== id);
    try {
      await fetch(`/api/focus-tree/nodes/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to delete node', e);
    }
  }

  async function addEdge(edge: FocusEdge) {
    edges.value.push(edge);
    try {
      await fetch('/api/focus-tree/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edge)
      });
    } catch (e) {
      console.error('Failed to add edge', e);
    }
  }

  async function deleteEdge(id: string) {
    edges.value = edges.value.filter(e => e.id !== id);
    try {
      await fetch(`/api/focus-tree/edges/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to delete edge', e);
    }
  }

  async function addGroup(group: FocusGroup) {
    groups.value.push(group);
    try {
      await fetch('/api/focus-tree/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(group)
      });
    } catch (e) {
      console.error('Failed to add group', e);
    }
  }

  async function updateGroup(id: string, updates: Partial<FocusGroup>) {
    const idx = groups.value.findIndex(g => g.id === id);
    if (idx !== -1) {
      groups.value[idx] = { ...groups.value[idx], ...updates };
    }
    try {
      await fetch(`/api/focus-tree/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.error('Failed to update group', e);
    }
  }

  async function deleteGroup(id: string) {
    groups.value = groups.value.filter(g => g.id !== id);
    // 把该组内节点的 groupId 置空
    nodes.value.forEach(n => {
      if (n.groupId === id) n.groupId = null;
    });
    // 移除与该组直接相连的连线
    edges.value = edges.value.filter(e => e.sourceId !== id && e.targetId !== id);
    try {
      await fetch(`/api/focus-tree/groups/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to delete group', e);
    }
  }

  return {
    nodes,
    edges,
    groups,
    evolution,
    loading,
    lastCreatedNodeId,
    calculateSmartPlacement,
    fetchTree,
    syncTree,
    toggleNodeLit,
    reorderNodes,
    saveReorder,
    fetchEvolution,
    createSnapshot,
    rollbackToSlot,
    addNode,
    updateNode,
    deleteNode,
    addEdge,
    deleteEdge,
    addGroup,
    updateGroup,
    deleteGroup
  };
});
