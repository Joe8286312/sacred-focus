import {
  isObject,
  isOneOf,
  sanitizeColor,
  VALID_ANCHORS,
  VALID_EDGE_STYLES,
  VALID_ELEMENT_TYPES
} from './shared.js';

export interface ValidatedNodeItem {
  id: string; code: string; name: string; groupId: string | null; triggerTime: string | null;
  triggerScene: string; hasExactTime: boolean; timeValueMinutes: number | null; level: number;
  maxLevel: number; isLit: boolean; isFrozen: boolean; lastLitDate: string | null; previousLevel: number;
  position: { x: number; y: number };
  specCard: { instruction: string; failCondition: string; benefitMechanism: string; notes: string | null };
}

export interface ValidatedGroupItem {
  id: string; name: string; themeColor: string; position: { x: number; y: number }; size: { width: number; height: number };
}

export interface ValidatedEdgeItem {
  id: string; sourceId: string; sourceType: (typeof VALID_ELEMENT_TYPES)[number]; targetId: string;
  targetType: (typeof VALID_ELEMENT_TYPES)[number]; sourceAnchor: (typeof VALID_ANCHORS)[number];
  targetAnchor: (typeof VALID_ANCHORS)[number]; style: (typeof VALID_EDGE_STYLES)[number];
}

export interface ValidatedLabelItem { id: string; text: string; position: { x: number; y: number }; }

/** 校验国策节点。 */
export function validateNodeItem(n: unknown, idx: number, errors: string[]): ValidatedNodeItem | null {
  if (!isObject(n)) { errors.push(`nodes[${idx}] 不是有效对象`); return null; }
  if (!n.id || typeof n.id !== 'string' || n.id.length > 64) { errors.push(`nodes[${idx}].id 缺失或超长 (最大64字符)`); return null; }
  if (!n.code || typeof n.code !== 'string' || n.code.length > 32) { errors.push(`nodes[${idx}].code 缺失或超长 (最大32字符)`); return null; }
  if (!n.name || typeof n.name !== 'string' || n.name.length > 128) { errors.push(`nodes[${idx}].name 缺失或超长 (最大128字符)`); return null; }
  const position = isObject(n.position) ? n.position : undefined;
  const specCard = isObject(n.specCard) ? n.specCard : undefined;
  const posX = typeof position?.x === 'number' && Number.isFinite(position.x) ? position.x : 0;
  const posY = typeof position?.y === 'number' && Number.isFinite(position.y) ? position.y : 0;
  return {
    id: n.id.trim(), code: n.code.trim(), name: n.name.trim(),
    groupId: n.groupId ? String(n.groupId).slice(0, 64) : null,
    triggerTime: n.triggerTime ? String(n.triggerTime).slice(0, 32) : null,
    triggerScene: n.triggerScene ? String(n.triggerScene).slice(0, 256) : '全天候', hasExactTime: Boolean(n.hasExactTime),
    timeValueMinutes: typeof n.timeValueMinutes === 'number' && Number.isFinite(n.timeValueMinutes) ? n.timeValueMinutes : null,
    level: Math.max(0, Math.min(typeof n.level === 'number' ? Math.floor(n.level) : 0, 999)),
    maxLevel: Math.max(0, Math.min(typeof n.maxLevel === 'number' ? Math.floor(n.maxLevel) : 0, 999)),
    isLit: Boolean(n.isLit), isFrozen: Boolean(n.isFrozen), lastLitDate: n.lastLitDate ? String(n.lastLitDate).slice(0, 32) : null,
    previousLevel: Math.max(0, Math.min(typeof n.previousLevel === 'number' ? Math.floor(n.previousLevel) : 0, 999)),
    position: { x: posX, y: posY },
    specCard: {
      instruction: specCard?.instruction ? String(specCard.instruction).slice(0, 2048) : '',
      failCondition: specCard?.failCondition ? String(specCard.failCondition).slice(0, 2048) : '',
      benefitMechanism: specCard?.benefitMechanism ? String(specCard.benefitMechanism).slice(0, 2048) : '',
      notes: specCard?.notes ? String(specCard.notes).slice(0, 2048) : null
    }
  };
}

/** 校验分组外框。 */
export function validateGroupItem(g: unknown, idx: number, errors: string[]): ValidatedGroupItem | null {
  if (!isObject(g)) { errors.push(`groups[${idx}] 不是有效对象`); return null; }
  if (!g.id || typeof g.id !== 'string' || g.id.length > 64) { errors.push(`groups[${idx}].id 缺失或超长`); return null; }
  if (!g.name || typeof g.name !== 'string' || g.name.length > 128) { errors.push(`groups[${idx}].name 缺失或超长`); return null; }
  const position = isObject(g.position) ? g.position : undefined;
  const size = isObject(g.size) ? g.size : undefined;
  const posX = typeof position?.x === 'number' && Number.isFinite(position.x) ? position.x : 0;
  const posY = typeof position?.y === 'number' && Number.isFinite(position.y) ? position.y : 0;
  const width = typeof size?.width === 'number' && size.width > 0 ? Math.min(size.width, 10000) : 480;
  const height = typeof size?.height === 'number' && size.height > 0 ? Math.min(size.height, 10000) : 360;
  return { id: g.id.trim(), name: g.name.trim(), themeColor: sanitizeColor(g.themeColor), position: { x: posX, y: posY }, size: { width, height } };
}

/** 校验拓扑连线。 */
export function validateEdgeItem(e: unknown, idx: number, errors: string[]): ValidatedEdgeItem | null {
  if (!isObject(e)) { errors.push(`edges[${idx}] 不是有效对象`); return null; }
  if (!e.id || typeof e.id !== 'string' || e.id.length > 64) { errors.push(`edges[${idx}].id 无效`); return null; }
  if (!e.sourceId || typeof e.sourceId !== 'string' || !e.targetId || typeof e.targetId !== 'string') { errors.push(`edges[${idx}] sourceId 或 targetId 缺失`); return null; }
  return {
    id: e.id.trim(), sourceId: e.sourceId.trim(), sourceType: isOneOf(e.sourceType, VALID_ELEMENT_TYPES) ? e.sourceType : 'NODE',
    targetId: e.targetId.trim(), targetType: isOneOf(e.targetType, VALID_ELEMENT_TYPES) ? e.targetType : 'NODE',
    sourceAnchor: isOneOf(e.sourceAnchor, VALID_ANCHORS) ? e.sourceAnchor : 'BOTTOM',
    targetAnchor: isOneOf(e.targetAnchor, VALID_ANCHORS) ? e.targetAnchor : 'TOP', style: isOneOf(e.style, VALID_EDGE_STYLES) ? e.style : 'SOLID'
  };
}

/** 校验说明标签。 */
export function validateLabelItem(l: unknown, idx: number, errors: string[]): ValidatedLabelItem | null {
  if (!isObject(l)) { errors.push(`labels[${idx}] 不是有效对象`); return null; }
  if (!l.id || typeof l.id !== 'string' || l.id.length > 64) { errors.push(`labels[${idx}].id 无效`); return null; }
  const position = isObject(l.position) ? l.position : undefined;
  const posX = typeof position?.x === 'number' && Number.isFinite(position.x) ? position.x : 0;
  const posY = typeof position?.y === 'number' && Number.isFinite(position.y) ? position.y : 0;
  return { id: l.id.trim(), text: l.text ? String(l.text).slice(0, 256) : '', position: { x: posX, y: posY } };
}
