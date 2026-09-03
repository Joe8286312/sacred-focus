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

  return {
    nodes,
    edges,
    groups,
    evolution,
    loading,
    fetchTree,
    syncTree,
    toggleNodeLit,
    reorderNodes,
    fetchEvolution,
    createSnapshot,
    rollbackToSlot
  };
});
