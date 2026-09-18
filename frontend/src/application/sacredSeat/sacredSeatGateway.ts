import type { DailyFocusHeatmapItem, FocusSessionLog, SacredSeatConfig } from '../../types';

export interface SacredSeatStreak {
  currentStreak: number;
  maxStreak: number;
}

export interface SacredSeatImportResult {
  success: boolean;
  importedCount: number;
  totalLogs: number;
}

export type SacredSeatApiRequest = <T = unknown>(url: string, options?: RequestInit) => Promise<T>;

export interface SacredSeatGateway {
  getConfig(): Promise<SacredSeatConfig>;
  updateConfig(partial: Partial<SacredSeatConfig>): Promise<SacredSeatConfig>;
  resetStreak(): Promise<SacredSeatStreak>;
  listLogs(): Promise<FocusSessionLog[]>;
  getHeatmap(days: number): Promise<DailyFocusHeatmapItem[]>;
  recordSession(session: FocusSessionLog): Promise<SacredSeatStreak>;
  recordSessionOnUnload(session: FocusSessionLog): Promise<void>;
  exportLogs(): Promise<unknown>;
  importLogs(payload: unknown): Promise<SacredSeatImportResult>;
}

/** 神圣座位 HTTP 协议的纯适配规则，Pinia store 只负责状态编排。 */
export function createSacredSeatGateway(request: SacredSeatApiRequest): SacredSeatGateway {
  return {
    getConfig() {
      return request<SacredSeatConfig>('/api/sacred-seat/config');
    },
    updateConfig(partial) {
      return request<SacredSeatConfig>('/api/sacred-seat/config', { method: 'PUT', body: JSON.stringify(partial) });
    },
    resetStreak() {
      return request<SacredSeatStreak>('/api/sacred-seat/reset-streak', { method: 'POST' });
    },
    listLogs() {
      return request<FocusSessionLog[]>('/api/sacred-seat/logs');
    },
    getHeatmap(days) {
      return request<DailyFocusHeatmapItem[]>(`/api/sacred-seat/heatmap?days=${days}`);
    },
    recordSession(session) {
      return request<SacredSeatStreak>('/api/sacred-seat/logs', { method: 'POST', body: JSON.stringify(session) });
    },
    async recordSessionOnUnload(session) {
      await request('/api/sacred-seat/logs', { method: 'POST', body: JSON.stringify(session), keepalive: true });
    },
    exportLogs() {
      return request('/api/sacred-seat/logs/export');
    },
    importLogs(payload) {
      return request<SacredSeatImportResult>('/api/sacred-seat/logs/import', { method: 'POST', body: JSON.stringify(payload) });
    }
  };
}
