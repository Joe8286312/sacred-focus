/** 备份校验器共享的无状态基础规则。 */

export const VALID_ANCHORS = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
export const VALID_EDGE_STYLES = ['SOLID', 'DASHED'];
export const VALID_ELEMENT_TYPES = ['NODE', 'GROUP'];
export const VALID_VERDICTS = ['ALLOW', 'FORBID'];
export const VALID_LOG_TYPES = ['FOCUS', 'RESERVATION'];
export const VALID_LOG_STATUSES = ['SUCCESS', 'FAIL', 'REGRET'];

const HEX_OR_SAFE_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isObject(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function sanitizeColor(color: unknown, defaultColor = '#3B82F6'): string {
  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (HEX_OR_SAFE_COLOR_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return defaultColor;
}
