import type { FocusEdge, FocusGroup, FocusLabel, FocusNode, FocusTreeData } from '../../types';

export interface FocusTreeResponse extends FocusTreeData {
  revision?: number;
}

export interface RevisionResponse {
  revision?: number;
}

export interface NodeLitResponse {
  isLit: boolean;
  level: number;
  maxLevel: number;
  lastLitDate?: string;
}

export interface FocusTreePayload {
  nodes: FocusNode[];
  edges: FocusEdge[];
  groups: FocusGroup[];
  labels: FocusLabel[];
}

export type FocusTreeApiRequest = <T = any>(url: string, options?: RequestInit) => Promise<T>;

export interface FocusTreeGateway {
  getTree(): Promise<FocusTreeResponse>;
  saveTree(tree: FocusTreePayload, expectedRevision: number): Promise<RevisionResponse>;
  toggleNodeLit(nodeId: string): Promise<NodeLitResponse>;
  reorderNodes(nodeIds: string[]): Promise<void>;
  createNode(node: FocusNode): Promise<void>;
  updateNode(id: string, updates: Partial<FocusNode>): Promise<void>;
  deleteNode(id: string): Promise<void>;
  createEdge(edge: FocusEdge): Promise<void>;
  deleteEdge(id: string): Promise<void>;
  createGroup(group: FocusGroup): Promise<void>;
  updateGroup(id: string, updates: Partial<FocusGroup>): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  resetSettlementAudit(): Promise<void>;
}

/** 国策树核心 HTTP 协议的纯适配规则，store 继续管理草稿及乐观更新。 */
export function createFocusTreeGateway(request: FocusTreeApiRequest): FocusTreeGateway {
  return {
    getTree() {
      return request<FocusTreeResponse>('/api/focus-tree');
    },
    saveTree(tree, expectedRevision) {
      return request<RevisionResponse>('/api/focus-tree', {
        method: 'PUT', body: JSON.stringify({ ...tree, expectedRevision })
      });
    },
    toggleNodeLit(nodeId) {
      return request<NodeLitResponse>(`/api/focus-tree/nodes/${nodeId}/toggle-lit`, { method: 'PATCH' });
    },
    async reorderNodes(nodeIds) {
      await request('/api/focus-tree/nodes/reorder', { method: 'PUT', body: JSON.stringify({ nodeIds }) });
    },
    async createNode(node) {
      await request('/api/focus-tree/nodes', { method: 'POST', body: JSON.stringify(node) });
    },
    async updateNode(id, updates) {
      await request(`/api/focus-tree/nodes/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    },
    async deleteNode(id) {
      await request(`/api/focus-tree/nodes/${id}`, { method: 'DELETE' });
    },
    async createEdge(edge) {
      await request('/api/focus-tree/edges', { method: 'POST', body: JSON.stringify(edge) });
    },
    async deleteEdge(id) {
      await request(`/api/focus-tree/edges/${id}`, { method: 'DELETE' });
    },
    async createGroup(group) {
      await request('/api/focus-tree/groups', { method: 'POST', body: JSON.stringify(group) });
    },
    async updateGroup(id, updates) {
      await request(`/api/focus-tree/groups/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    },
    async deleteGroup(id) {
      await request(`/api/focus-tree/groups/${id}`, { method: 'DELETE' });
    },
    async resetSettlementAudit() {
      await request('/api/focus-tree/reset-settlement-audit', { method: 'POST' });
    }
  };
}
