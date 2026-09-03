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

  // 智能空间放置与防重叠计算
  function calculateSmartPlacement(groupId: string | null): { x: number; y: number } {
    if (groupId) {
      const group = groups.value.find(g => g.id === groupId);
      if (group) {
        const groupNodes = nodes.value.filter(n => n.groupId === groupId);
        if (groupNodes.length === 0) {
          return { x: Math.round(group.position.x + 30), y: Math.round(group.position.y + 60) };
        }
        const maxY = Math.max(...groupNodes.map(n => n.position.y));
        const referenceX = groupNodes[0].position.x;
        const newY = Math.round(maxY + 95);

        // 自适应撑大分组外框高度
        const requiredBottom = newY + 80 + 30;
        const currentBottom = group.position.y + group.size.height;
        if (requiredBottom > currentBottom) {
          group.size.height = Math.round(requiredBottom - group.position.y);
        }
        return { x: Math.round(referenceX), y: newY };
      }
    }

    // 独立国策放置逻辑 (groupId === null)
    const independentNodes = nodes.value.filter(n => !n.groupId);
    if (independentNodes.length === 0) {
      return { x: 1080, y: 120 };
    }
    const maxY = Math.max(...independentNodes.map(n => n.position.y));
    const lastNode = independentNodes[independentNodes.length - 1];
    const referenceX = lastNode?.position?.x || 1080;

    // 若垂直排列过长（> 650），自动开启右侧新列排布
    if (maxY > 650) {
      return { x: Math.round(referenceX + 220), y: 120 };
    }
    return { x: Math.round(referenceX), y: Math.round(maxY + 105) };
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
