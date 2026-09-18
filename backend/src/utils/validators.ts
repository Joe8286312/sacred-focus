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

import { isObject, VALID_LOG_STATUSES, VALID_LOG_TYPES, VALID_VERDICTS } from '../domain/backupValidation/shared.js';
import {
  validateEdgeItem,
  validateGroupItem,
  validateLabelItem,
  validateNodeItem
} from '../domain/backupValidation/treeItems.js';
import type { FocusEdge, FocusGroup, FocusLabel, FocusNode, FocusTreeData, PrecedentCase } from '../types.js';

// 兼容既有导入路径：树元素校验器的实现已移至 domain/backupValidation。
export { validateEdgeItem, validateGroupItem, validateLabelItem, validateNodeItem };

export interface ValidatedSacredSeatConfig {
  sacredToken: string;
  reservationSignal: string;
  defaultFocusDuration: number;
  regretWindowSeconds: number;
  currentStreak: number;
  maxStreak: number;
  updatedAt: string;
}

export interface ValidatedEvolutionSnapshot {
  slotIndex: number;
  id: string;
  version: string;
  timestamp: string;
  changelogNotes: string;
  isMajor: boolean;
  dataJson: string;
}

export interface ValidatedEvolution {
  state: { activePointerIndex: number };
  snapshots: ValidatedEvolutionSnapshot[];
}

export interface ValidatedFocusSessionLog {
  id: string;
  type: 'FOCUS' | 'RESERVATION';
  startTime: string;
  endTime: string;
  targetDurationMinutes: number;
  actualDurationSeconds: number;
  status: 'SUCCESS' | 'FAIL' | 'REGRET';
  focusContent: string | null;
  failureReason: string | null;
  note: string | null;
}

export interface ValidatedFullBackupPayload {
  tree: FocusTreeData;
  sacredSeatConfig: ValidatedSacredSeatConfig | null;
  precedentCases: PrecedentCase[] | null;
  evolution: ValidatedEvolution | null;
  sessionLogs: ValidatedFocusSessionLog[] | null;
}

/**
 * 全量系统整机镜像导入校验器 (D-1)
 */
export function validateFullBackupPayload(body: unknown): ValidationResult<ValidatedFullBackupPayload> {
  if (!isObject(body)) {
    return { success: false, error: '备份文件格式不合法：必须为 JSON 对象' };
  }

  const rawTree = body.focusTree || body.liveTree;
  if (!rawTree || !isObject(rawTree)) {
    return { success: false, error: '备份文件缺少合法的 focusTree 或 liveTree 树结构数据' };
  }

  // P1-003 防御：国策树必须完整包含 nodes, groups, edges, labels 数组，禁止缺少字段导致清空现有数据
  if (
    !Array.isArray(rawTree.nodes) ||
    !Array.isArray(rawTree.groups) ||
    !Array.isArray(rawTree.edges) ||
    !Array.isArray(rawTree.labels)
  ) {
    return {
      success: false,
      error: '备份文件国策树结构不完整：nodes、groups、edges、labels 必须均为数组'
    };
  }

  const errors: string[] = [];

  // 1. 节点数组校验 (上限 500)
  const rawNodes = rawTree.nodes;
  if (rawNodes.length > 500) {
    return { success: false, error: '国策节点数量超过系统安全上限 (最大500条)' };
  }
  const validatedNodes: FocusNode[] = [];
  const nodeIds = new Set<string>();
  for (let i = 0; i < rawNodes.length; i++) {
    const node = validateNodeItem(rawNodes[i], i, errors);
    if (node) {
      if (nodeIds.has(node.id)) {
        errors.push(`第 ${i + 1} 个节点 ID 重复: ${node.id}`);
      } else {
        nodeIds.add(node.id);
      }
      validatedNodes.push(node as FocusNode);
    }
  }

  // 2. 分组数组校验 (上限 100)
  const rawGroups = rawTree.groups;
  if (rawGroups.length > 100) {
    return { success: false, error: '分组数量超过系统安全上限 (最大100个)' };
  }
  const validatedGroups: FocusGroup[] = [];
  const groupIds = new Set<string>();
  for (let i = 0; i < rawGroups.length; i++) {
    const group = validateGroupItem(rawGroups[i], i, errors);
    if (group) {
      if (groupIds.has(group.id)) {
        errors.push(`第 ${i + 1} 个分组 ID 重复: ${group.id}`);
      } else {
        groupIds.add(group.id);
      }
      validatedGroups.push(group as FocusGroup);
    }
  }

  // 校验节点的分组引用有效性
  for (const node of validatedNodes) {
    if (node.groupId && !groupIds.has(node.groupId)) {
      errors.push(`节点 ${node.id} 引用的分组 ${node.groupId} 不存在`);
    }
  }

  // 3. 连线数组校验 (上限 1000)
  const rawEdges = rawTree.edges;
  if (rawEdges.length > 1000) {
    return { success: false, error: '拓扑连线数量超过系统安全上限 (最大1000条)' };
  }
  const validatedEdges: FocusEdge[] = [];
  const edgeIds = new Set<string>();
  for (let i = 0; i < rawEdges.length; i++) {
    const edge = validateEdgeItem(rawEdges[i], i, errors);
    if (edge) {
      if (edgeIds.has(edge.id)) {
        errors.push(`第 ${i + 1} 条连线 ID 重复: ${edge.id}`);
      } else {
        edgeIds.add(edge.id);
      }
      // 拓扑连线端点有效性校验
      const validSource = edge.sourceType === 'GROUP' ? groupIds.has(edge.sourceId) : nodeIds.has(edge.sourceId);
      const validTarget = edge.targetType === 'GROUP' ? groupIds.has(edge.targetId) : nodeIds.has(edge.targetId);
      if (!validSource) {
        errors.push(`连线 ${edge.id} 的源节点/分组 ${edge.sourceId} 不存在`);
      }
      if (!validTarget) {
        errors.push(`连线 ${edge.id} 的目标节点/分组 ${edge.targetId} 不存在`);
      }
      validatedEdges.push(edge as FocusEdge);
    }
  }

  // 4. 说明标签校验 (上限 200)
  const rawLabels = rawTree.labels;
  if (rawLabels.length > 200) {
    return { success: false, error: '标签数量超过系统安全上限 (最大200个)' };
  }
  const validatedLabels: FocusLabel[] = [];
  const labelIds = new Set<string>();
  for (let i = 0; i < rawLabels.length; i++) {
    const label = validateLabelItem(rawLabels[i], i, errors);
    if (label) {
      if (labelIds.has(label.id)) {
        errors.push(`第 ${i + 1} 个标签 ID 重复: ${label.id}`);
      } else {
        labelIds.add(label.id);
      }
      validatedLabels.push(label as FocusLabel);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `备份数据结构校验未通过 (${errors.length} 项错误): ${errors[0]}`,
      details: errors.slice(0, 20)
    };
  }

  // 5. 神圣座位配置校验
  let validatedSeatConfig: ValidatedSacredSeatConfig | null = null;
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
  let validatedCases: PrecedentCase[] | null = null;
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
  let validatedEvolution: ValidatedEvolution | null = null;
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
  let validatedSessionLogs: ValidatedFocusSessionLog[] | null = null;
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
