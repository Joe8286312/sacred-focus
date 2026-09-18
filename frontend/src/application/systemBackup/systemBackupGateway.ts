export interface SystemBackupImportResponse {
  summary?: unknown;
}

export type SystemBackupApiRequest = <T = unknown>(url: string, options?: RequestInit) => Promise<T>;

export interface SystemBackupGateway {
  exportFull(): Promise<unknown>;
  importFull(backupData: object, expectedRevision: number): Promise<SystemBackupImportResponse>;
}

/** 全系统镜像 HTTP 协议的纯适配规则，恢复后的本地刷新由调用方编排。 */
export function createSystemBackupGateway(request: SystemBackupApiRequest): SystemBackupGateway {
  return {
    exportFull() {
      return request('/api/system/export');
    },
    importFull(backupData, expectedRevision) {
      return request<SystemBackupImportResponse>('/api/system/import', {
        method: 'POST', body: JSON.stringify({ ...backupData, expectedRevision })
      });
    }
  };
}
