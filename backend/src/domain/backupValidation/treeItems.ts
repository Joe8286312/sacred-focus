import {
  isObject,
  sanitizeColor,
  VALID_ANCHORS,
  VALID_EDGE_STYLES,
  VALID_ELEMENT_TYPES
} from './shared.js';

/** 校验国策节点。 */
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

/** 校验分组外框。 */
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

/** 校验拓扑连线。 */
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

/** 校验说明标签。 */
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
