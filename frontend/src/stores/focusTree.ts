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
  const lastCreatedGroupId = ref<string | null>(null);
  const pendingResetSummary = ref<{ resetNodes: any[]; settlementDate: string } | null>(null);

  let sessionGroupSpawnCount = 0;
  let sessionNodeSpawnCount = 0;

  // 新建分组落盘点：起始槽位坐标 (-1000, 0)，步长 290px
  function calculateSmartGroupPlacement(): { x: number; y: number } {
    const baseX = -1000;
    const baseY = 0;
    const stepY = 290; // 外框高 260px + 30px 紧凑呼吸间隙
    const slot = sessionGroupSpawnCount % 5;
    sessionGroupSpawnCount++;
    return {
      x: baseX,
      y: Math.round(baseY + slot * stepY)
    };
  }

  // 新建国策落盘点：起始槽位坐标 (-600, 0)，步长 105px
  function calculateSmartPlacement(groupId: string | null): { x: number; y: number } {
    if (groupId) {
      const group = groups.value.find(g => g.id === groupId);
      if (group) {
        const countInGroup = nodes.value.filter(n => n.groupId === groupId).length;
        const innerX = (group.position?.x ?? 0) + 30;
        const innerY = (group.position?.y ?? 0) + 60 + (countInGroup % 4) * 90;
        return { x: Math.round(innerX), y: Math.round(innerY) };
      }
    }
    // 独立国策：固定起始槽位 (-600, 0)，步长 105px
    const baseNodeX = -600;
    const baseNodeY = 0;
    const stepNodeY = 105; // 国策卡片高 72px + 33px 紧凑呼吸间距
    const slot = sessionNodeSpawnCount % 5;
    sessionNodeSpawnCount++;
    return {
      x: baseNodeX,
      y: Math.round(baseNodeY + slot * stepNodeY)
    };
  }

  function dismissResetAlert() {
    if (pendingResetSummary.value) {
      sessionStorage.setItem('dismissedResetAlertDate', pendingResetSummary.value.settlementDate);
      pendingResetSummary.value = null;
    }
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
        if (data.resetSummary && data.resetSummary.resetNodes && data.resetSummary.resetNodes.length > 0) {
          const dismissed = sessionStorage.getItem('dismissedResetAlertDate');
          if (dismissed !== data.resetSummary.settlementDate) {
            pendingResetSummary.value = data.resetSummary;
          }
        }
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

  // 全量覆盖持久化树数据（事务性提交画布草稿）
  async function saveWholeTree(tree: { nodes: FocusNode[]; groups: FocusGroup[]; edges: FocusEdge[] }) {
    try {
      const res = await fetch('/api/focus-tree', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: tree.nodes,
          edges: tree.edges,
          groups: tree.groups
        })
      });
      if (res.ok) {
        nodes.value = JSON.parse(JSON.stringify(tree.nodes));
        groups.value = JSON.parse(JSON.stringify(tree.groups));
        edges.value = JSON.parse(JSON.stringify(tree.edges));
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to save whole tree', e);
      return false;
    }
  }

  async function toggleNodeLit(nodeId: string) {
    const node = nodes.value.find(n => n.id === nodeId);
    if (!node) return;
    const prevLit = node.isLit;
    const prevLevel = node.level;
    const prevMaxLevel = node.maxLevel;
    const prevLastLitDate = node.lastLitDate;

    try {
      const res = await fetch(`/api/focus-tree/nodes/${nodeId}/toggle-lit`, { method: 'PATCH' });
      if (res.ok) {
        const updated = await res.json();
        node.isLit = updated.isLit;
        node.level = updated.level;
        node.maxLevel = updated.maxLevel;
        node.lastLitDate = updated.lastLitDate;
      } else {
        node.isLit = prevLit;
        node.level = prevLevel;
        node.maxLevel = prevMaxLevel;
        node.lastLitDate = prevLastLitDate;
      }
    } catch (e) {
      console.error('Failed to toggle lit state', e);
      node.isLit = prevLit;
      node.level = prevLevel;
      node.maxLevel = prevMaxLevel;
      node.lastLitDate = prevLastLitDate;
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

  async function exportSystemBackup() {
    try {
      const res = await fetch('/api/evolution/export');
      if (!res.ok) throw new Error('Failed to export backup');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      a.href = url;
      a.download = `sacred-focus-backup-${timeStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      console.error('Failed to export system backup', e);
      return false;
    }
  }

  async function importSystemBackup(backupData: any) {
    try {
      const res = await fetch('/api/evolution/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupData)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Import failed');
      }
      await fetchTree();
      await fetchEvolution();
      return true;
    } catch (e) {
      console.error('Failed to import system backup', e);
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
    if (!group.position) {
      group.position = calculateSmartGroupPlacement();
    }
    groups.value.push(group);
    lastCreatedGroupId.value = group.id;
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
    lastCreatedGroupId,
    pendingResetSummary,
    dismissResetAlert,
    calculateSmartPlacement,
    calculateSmartGroupPlacement,
    fetchTree,
    syncTree,
    saveWholeTree,
    toggleNodeLit,
    reorderNodes,
    saveReorder,
    fetchEvolution,
    createSnapshot,
    rollbackToSlot,
    exportSystemBackup,
    importSystemBackup,
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
