/**
 * Sacred Focus 跨端领域契约。
 *
 * 仅允许声明可跨 HTTP/API 边界传递的领域数据；禁止加入 SQLite 行模型、
 * Express 请求对象、JWT 载荷、Vue 响应式对象或任何运行时代码。
 */

export interface SacredSeatConfig {
  sacredToken: string;
  reservationSignal: string;
  defaultFocusDuration: number;
  regretWindowSeconds: number;
  currentStreak: number;
  maxStreak: number;
}

export interface FocusSessionLog {
  id: string;
  type: 'FOCUS' | 'RESERVATION';
  startTime: string;
  endTime: string;
  targetDurationMinutes: number;
  actualDurationSeconds: number;
  status: 'SUCCESS' | 'FAIL' | 'REGRET';
  focusContent?: string;
  failureReason?: string;
  note?: string;
}

export interface DailyFocusHeatmapItem {
  date: string;
  totalSessions: number;
  successCount: number;
  regretCount: number;
  failCount: number;
  totalSeconds: number;
}

export type CaseVerdict = 'ALLOW' | 'FORBID';

export interface PrecedentCase {
  id: string;
  date: string;
  behavior: string;
  verdict: CaseVerdict;
  boundaryCondition: string;
  createdAt: string;
}

export interface FocusNodeSpecCard {
  instruction: string;
  failCondition: string;
  benefitMechanism: string;
  notes?: string;
}

export interface FocusNode {
  id: string;
  code: string;
  name: string;
  groupId: string | null;
  triggerTime: string | null;
  triggerScene: string;
  hasExactTime: boolean;
  timeValueMinutes?: number | null;
  level: number;
  maxLevel: number;
  isLit: boolean;
  isFrozen: boolean;
  lastLitDate?: string;
  previousLevel?: number;
  previousLastLitDate?: string | null;
  position: { x: number; y: number };
  specCard: FocusNodeSpecCard;
}

export interface FocusEdge {
  id: string;
  sourceId: string;
  sourceType: 'NODE' | 'GROUP';
  targetId: string;
  targetType: 'NODE' | 'GROUP';
  sourceAnchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  targetAnchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  style: 'SOLID' | 'DASHED';
}

export interface FocusGroup {
  id: string;
  name: string;
  themeColor: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface FocusLabel {
  id: string;
  text: string;
  position: { x: number; y: number };
}

export interface ResetNodeItem {
  id: string;
  code: string;
  name: string;
  lostLevel: number;
  maxLevel: number;
}

export interface FocusTreeData {
  nodes: FocusNode[];
  edges: FocusEdge[];
  groups: FocusGroup[];
  labels: FocusLabel[];
  resetSummary?: {
    resetNodes: ResetNodeItem[];
    settlementDate: string;
  };
}

export interface EvolutionSnapshot {
  id?: string;
  slotIndex?: number;
  version: string;
  timestamp: string;
  changelogNotes: string;
  isMajor: boolean;
  nodes: FocusNode[];
  edges: FocusEdge[];
  groups: FocusGroup[];
  labels?: FocusLabel[];
}

export interface EvolutionState {
  activePointerIndex: number;
  snapshots: EvolutionSnapshot[];
}
