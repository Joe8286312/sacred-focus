interface SystemBackupTreePreview {
  nodes?: unknown[];
  groups?: unknown[];
  labels?: unknown[];
}

interface SystemBackupEvolutionPreview {
  snapshots?: unknown[];
}

/** 迁移确认框读取的镜像预览字段；不替代服务端的严格恢复校验。 */
export interface SystemBackupPayload extends Record<string, unknown> {
  focusTree?: SystemBackupTreePreview;
  liveTree?: SystemBackupTreePreview;
  evolution?: SystemBackupEvolutionPreview;
  sessionLogs?: unknown[];
  precedentCases?: unknown[];
}

/** 锁定迁移弹窗的既有门槛：镜像对象必须带有真值国策树或兼容 liveTree 别名。 */
export function isSystemBackupPayload(value: unknown): value is SystemBackupPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as SystemBackupPayload;
  return Boolean(payload.focusTree || payload.liveTree);
}
