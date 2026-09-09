/**
 * Sacred Focus 系统级输入防御校验器 (D-1 治理与全量安全入库门禁)
 * 零第三方外部依赖，原生强类型校验，防范超大字符串、恶意注入与畸形格式
 */

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string[];
}

const HEX_OR_SAFE_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const VALID_ANCHORS = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
const VALID_EDGE_STYLES = ['SOLID', 'DASHED'];
const VALID_ELEMENT_TYPES = ['NODE', 'GROUP'];
const VALID_VERDICTS = ['ALLOW', 'FORBID'];
const VALID_LOG_TYPES = ['FOCUS', 'RESERVATION'];
const VALID_LOG_STATUSES = ['SUCCESS', 'FAIL', 'REGRET'];

function isObject(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function sanitizeColor(color: unknown, defaultColor = '#3B82F6'): string {
  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (HEX_OR_SAFE_COLOR_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return defaultColor;
}

/**
 * 校验国策节点
 */
export function validateNodeItem(n: any, idx: number, errors: string[]): any | null {
  if (!isObject(n)) {
    errors.push(`nodes[${idx}] 不是有效对象`);
    return null;
  }
  if (!n.id || typeof n.id !== 'string' || n.id.length > 64) {
    errors.push(`nodes[${idx}].id 缺失或超长 (最大64字符)`);
    return null;
  }
  if (!n.code || typeof n.code !== 'string' || n.code.length > 32) {
    errors.push(`nodes[${idx}].code 缺失或超长 (最大32字符)`);
    return null;
  }
  if (!n.name || typeof n.name !== 'string' || n.name.length > 128) {
    errors.push(`nodes[${idx}].name 缺失或超长 (最大128字符)`);
    return null;
  }

  const posX = typeof n.position?.x === 'number' && Number.isFinite(n.position.x) ? n.position.x : 0;
  const posY = typeof n.position?.y === 'number' && Number.isFinite(n.position.y) ? n.position.y : 0;

  return {
    id: String(n.id).trim(),
    code: String(n.code).trim(),
    name: String(n.name).trim(),
    groupId: n.groupId ? String(n.groupId).slice(0, 64) : null,
    triggerTime: n.triggerTime ? String(n.triggerTime).slice(0, 32) : null,
    triggerScene: n.triggerScene ? String(n.triggerScene).slice(0, 256) : '全天候',
    hasExactTime: Boolean(n.hasExactTime),
    timeValueMinutes: typeof n.timeValueMinutes === 'number' && Number.isFinite(n.timeValueMinutes) ? n.timeValueMinutes : null,
    level: Math.max(0, Math.min(typeof n.level === 'number' ? Math.floor(n.level) : 0, 999)),
    maxLevel: Math.max(0, Math.min(typeof n.maxLevel === 'number' ? Math.floor(n.maxLevel) : 0, 999)),
    isLit: Boolean(n.isLit),
    isFrozen: Boolean(n.isFrozen),
    lastLitDate: n.lastLitDate ? String(n.lastLitDate).slice(0, 32) : null,
    previousLevel: Math.max(0, Math.min(typeof n.previousLevel === 'number' ? Math.floor(n.previousLevel) : 0, 999)),
    position: { x: posX, y: posY },
    specCard: {
      instruction: n.specCard?.instruction ? String(n.specCard.instruction).slice(0, 2048) : '',
      failCondition: n.specCard?.failCondition ? String(n.specCard.failCondition).slice(0, 2048) : '',
      benefitMechanism: n.specCard?.benefitMechanism ? String(n.specCard.benefitMechanism).slice(0, 2048) : '',
      notes: n.specCard?.notes ? String(n.specCard.notes).slice(0, 2048) : null
    }
  };
}

/**
 * 校验分组外框
 */
export function validateGroupItem(g: any, idx: number, errors: string[]): any | null {
  if (!isObject(g)) {
    errors.push(`groups[${idx}] 不是有效对象`);
    return null;
  }
  if (!g.id || typeof g.id !== 'string' || g.id.length > 64) {
    errors.push(`groups[${idx}].id 缺失或超长`);
    return null;
  }
  if (!g.name || typeof g.name !== 'string' || g.name.length > 128) {
    errors.push(`groups[${idx}].name 缺失或超长`);
    return null;
  }

  const posX = typeof g.position?.x === 'number' && Number.isFinite(g.position.x) ? g.position.x : 0;
  const posY = typeof g.position?.y === 'number' && Number.isFinite(g.position.y) ? g.position.y : 0;
  const width = typeof g.size?.width === 'number' && g.size.width > 0 ? Math.min(g.size.width, 10000) : 480;
  const height = typeof g.size?.height === 'number' && g.size.height > 0 ? Math.min(g.size.height, 10000) : 360;

  return {
    id: String(g.id).trim(),
    name: String(g.name).trim(),
    themeColor: sanitizeColor(g.themeColor),
    position: { x: posX, y: posY },
    size: { width, height }
  };
}

/**
 * 校验拓扑连线
 */
export function validateEdgeItem(e: any, idx: number, errors: string[]): any | null {
  if (!isObject(e)) {
    errors.push(`edges[${idx}] 不是有效对象`);
    return null;
  }
  if (!e.id || typeof e.id !== 'string' || e.id.length > 64) {
    errors.push(`edges[${idx}].id 无效`);
    return null;
  }
  if (!e.sourceId || typeof e.sourceId !== 'string' || !e.targetId || typeof e.targetId !== 'string') {
    errors.push(`edges[${idx}] sourceId 或 targetId 缺失`);
    return null;
  }

  const sourceType = VALID_ELEMENT_TYPES.includes(e.sourceType) ? e.sourceType : 'NODE';
  const targetType = VALID_ELEMENT_TYPES.includes(e.targetType) ? e.targetType : 'NODE';
  const sourceAnchor = VALID_ANCHORS.includes(e.sourceAnchor) ? e.sourceAnchor : 'BOTTOM';
  const targetAnchor = VALID_ANCHORS.includes(e.targetAnchor) ? e.targetAnchor : 'TOP';
  const style = VALID_EDGE_STYLES.includes(e.style) ? e.style : 'SOLID';

  return {
    id: String(e.id).trim(),
    sourceId: String(e.sourceId).trim(),
    sourceType,
    targetId: String(e.targetId).trim(),
    targetType,
    sourceAnchor,
    targetAnchor,
    style
  };
}

/**
 * 校验说明标签
 */
export function validateLabelItem(l: any, idx: number, errors: string[]): any | null {
  if (!isObject(l)) {
    errors.push(`labels[${idx}] 不是有效对象`);
    return null;
  }
  if (!l.id || typeof l.id !== 'string' || l.id.length > 64) {
    errors.push(`labels[${idx}].id 无效`);
    return null;
  }
  const posX = typeof l.position?.x === 'number' && Number.isFinite(l.position.x) ? l.position.x : 0;
  const posY = typeof l.position?.y === 'number' && Number.isFinite(l.position.y) ? l.position.y : 0;

  return {
    id: String(l.id).trim(),
    text: l.text ? String(l.text).slice(0, 256) : '',
    position: { x: posX, y: posY }
  };
}

/**
 * 全量系统整机镜像导入校验器 (D-1)
 */
export function validateFullBackupPayload(body: unknown): ValidationResult<any> {
  if (!isObject(body)) {
    return { success: false, error: '备份文件格式不合法：必须为 JSON 对象' };
  }

  const rawTree = body.focusTree || body.liveTree;
  if (!rawTree || !isObject(rawTree)) {
    return { success: false, error: '备份文件缺少合法的 focusTree 或 liveTree 树结构数据' };
  }

  const errors: string[] = [];

  // 1. 节点数组校验 (上限 500)
  const rawNodes = Array.isArray(rawTree.nodes) ? rawTree.nodes : [];
  if (rawNodes.length > 500) {
    return { success: false, error: '国策节点数量超过系统安全上限 (最大500条)' };
  }
  const validatedNodes: any[] = [];
  for (let i = 0; i < rawNodes.length; i++) {
    const node = validateNodeItem(rawNodes[i], i, errors);
    if (node) validatedNodes.push(node);
  }

  // 2. 分组数组校验 (上限 100)
  const rawGroups = Array.isArray(rawTree.groups) ? rawTree.groups : [];
  if (rawGroups.length > 100) {
    return { success: false, error: '分组数量超过系统安全上限 (最大100个)' };
  }
  const validatedGroups: any[] = [];
  for (let i = 0; i < rawGroups.length; i++) {
    const group = validateGroupItem(rawGroups[i], i, errors);
    if (group) validatedGroups.push(group);
  }

  // 3. 连线数组校验 (上限 1000)
  const rawEdges = Array.isArray(rawTree.edges) ? rawTree.edges : [];
  if (rawEdges.length > 1000) {
    return { success: false, error: '拓扑连线数量超过系统安全上限 (最大1000条)' };
  }
  const validatedEdges: any[] = [];
  for (let i = 0; i < rawEdges.length; i++) {
    const edge = validateEdgeItem(rawEdges[i], i, errors);
    if (edge) validatedEdges.push(edge);
  }

  // 4. 说明标签校验 (上限 200)
  const rawLabels = Array.isArray(rawTree.labels) ? rawTree.labels : [];
  if (rawLabels.length > 200) {
    return { success: false, error: '标签数量超过系统安全上限 (最大200个)' };
  }
  const validatedLabels: any[] = [];
  for (let i = 0; i < rawLabels.length; i++) {
    const label = validateLabelItem(rawLabels[i], i, errors);
    if (label) validatedLabels.push(label);
  }

  if (errors.length > 10) {
    return {
      success: false,
      error: `数据包含过多结构错误 (${errors.length} 项)，导入终止`,
      details: errors.slice(0, 10)
    };
  }

  // 5. 神圣座位配置校验
  let validatedSeatConfig: any = null;
  if (body.sacredSeatConfig && isObject(body.sacredSeatConfig)) {
    const c = body.sacredSeatConfig;
    validatedSeatConfig = {
      sacredToken: String(c.sacredToken || '主力机开启专注模式').slice(0, 128),
      reservationSignal: String(c.reservationSignal || '反手拍手轻声说换人').slice(0, 128),
      defaultFocusDuration: Math.max(1, Math.min(typeof c.defaultFocusDuration === 'number' ? c.defaultFocusDuration : 60, 1440)),
      regretWindowSeconds: Math.max(5, Math.min(typeof c.regretWindowSeconds === 'number' ? c.regretWindowSeconds : 30, 300)),
      currentStreak: Math.max(0, typeof c.currentStreak === 'number' ? c.currentStreak : 0),
      maxStreak: Math.max(0, typeof c.maxStreak === 'number' ? c.maxStreak : 0),
      updatedAt: String(c.updatedAt || new Date().toISOString())
    };
  }

  // 6. 判例法典校验 (上限 2000)
  let validatedCases: any[] | null = null;
  if (Array.isArray(body.precedentCases)) {
    if (body.precedentCases.length > 2000) {
      return { success: false, error: '判例数量超过系统安全上限 (最大2000条)' };
    }
    validatedCases = [];
    for (const c of body.precedentCases) {
      if (!isObject(c) || !c.id || !c.behavior) continue;
      validatedCases.push({
        id: String(c.id).slice(0, 64),
        date: String(c.date || new Date().toISOString().slice(0, 10)).slice(0, 32),
        behavior: String(c.behavior).slice(0, 512),
        verdict: VALID_VERDICTS.includes(c.verdict) ? c.verdict : 'ALLOW',
        boundaryCondition: String(c.boundaryCondition || '').slice(0, 2048),
        createdAt: String(c.createdAt || new Date().toISOString())
      });
    }
  }

  // 7. 演化快照与指针校验
  let validatedEvolution: any = null;
  if (body.evolution && isObject(body.evolution)) {
    const rawState = body.evolution.state;
    const rawSnaps = Array.isArray(body.evolution.snapshots) ? body.evolution.snapshots : [];
    validatedEvolution = {
      state: {
        activePointerIndex: Math.max(0, Math.min(typeof rawState?.activePointerIndex === 'number' ? rawState.activePointerIndex : 0, 4))
      },
      snapshots: rawSnaps.slice(0, 10).map((s: any) => ({
        slotIndex: Math.max(0, Math.min(typeof s.slotIndex === 'number' ? s.slotIndex : 0, 4)),
        id: String(s.id || `snap-${Date.now()}`).slice(0, 64),
        version: String(s.version || 'v1.0').slice(0, 32),
        timestamp: String(s.timestamp || new Date().toISOString()).slice(0, 64),
        changelogNotes: String(s.changelogNotes || '').slice(0, 2048),
        isMajor: Boolean(s.isMajor),
        dataJson: typeof s.dataJson === 'string' ? s.dataJson : JSON.stringify(s)
      }))
    };
  }

  // 8. 流水日志校验 (上限 50000)
  let validatedSessionLogs: any[] | null = null;
  if (Array.isArray(body.sessionLogs)) {
    if (body.sessionLogs.length > 50000) {
      return { success: false, error: '专注日志数量超过系统安全上限 (最大50000条)' };
    }
    validatedSessionLogs = [];
    for (const l of body.sessionLogs) {
      if (!isObject(l) || !l.id || !l.startTime) continue;
      validatedSessionLogs.push({
        id: String(l.id).slice(0, 64),
        type: VALID_LOG_TYPES.includes(l.type) ? l.type : 'FOCUS',
        startTime: String(l.startTime).slice(0, 64),
        endTime: String(l.endTime || l.startTime).slice(0, 64),
        targetDurationMinutes: Math.max(0, Math.min(Number(l.targetDurationMinutes || 0), 1440)),
        actualDurationSeconds: Math.max(0, Math.min(Number(l.actualDurationSeconds || 0), 86400)),
        status: VALID_LOG_STATUSES.includes(l.status) ? l.status : 'SUCCESS',
        focusContent: l.focusContent ? String(l.focusContent).slice(0, 512) : null,
        failureReason: l.failureReason ? String(l.failureReason).slice(0, 512) : null,
        note: l.note ? String(l.note).slice(0, 1024) : null
      });
    }
  }

  return {
    success: true,
    data: {
      tree: {
        groups: validatedGroups,
        nodes: validatedNodes,
        edges: validatedEdges,
        labels: validatedLabels
      },
      sacredSeatConfig: validatedSeatConfig,
      precedentCases: validatedCases,
      evolution: validatedEvolution,
      sessionLogs: validatedSessionLogs
    }
  };
}
