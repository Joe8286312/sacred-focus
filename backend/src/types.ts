/** 后端兼容入口：跨端领域契约的唯一来源位于 contracts/domain.d.ts。 */
export type {
  CaseVerdict,
  DailyFocusHeatmapItem,
  EvolutionSnapshot,
  EvolutionState,
  FocusEdge,
  FocusGroup,
  FocusLabel,
  FocusNode,
  FocusNodeSpecCard,
  FocusSessionLog,
  FocusTreeData,
  PrecedentCase,
  ResetNodeItem,
  SacredSeatConfig
} from '@sacred-focus/contracts';

// 严密数据库行类型定义：仅后端持久化层使用，不属于跨端 API 契约。
export interface SacredSeatConfigRow {
  id: number;
  sacredToken: string;
  reservationSignal: string;
  defaultFocusDuration: number;
  regretWindowSeconds: number;
  currentStreak: number;
  maxStreak: number;
  updatedAt: string;
}

export interface FocusSessionLogRow {
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

export interface DailyFocusHeatmapRow {
  date: string;
  totalSessions: number;
  successCount: number;
  regretCount: number;
  failCount: number;
  totalSeconds: number;
}

export interface PrecedentCaseRow {
  id: string;
  date: string;
  behavior: string;
  verdict: 'ALLOW' | 'FORBID';
  boundaryCondition: string;
  createdAt: string;
}

export interface FocusGroupRow {
  id: string;
  name: string;
  themeColor: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
}

export interface FocusNodeRow {
  id: string;
  code: string;
  name: string;
  groupId: string | null;
  triggerTime: string | null;
  triggerScene: string;
  hasExactTime: number;
  timeValueMinutes: number | null;
  level: number;
  maxLevel: number;
  isLit: number;
  isFrozen: number;
  lastLitDate: string | null;
  previousLevel: number;
  previousLastLitDate: string | null;
  positionX: number;
  positionY: number;
  specInstruction: string;
  specFailCondition: string;
  specBenefitMechanism: string;
  specNotes: string | null;
  sortOrder: number;
}

export interface FocusEdgeRow {
  id: string;
  sourceId: string;
  sourceType: 'NODE' | 'GROUP';
  targetId: string;
  targetType: 'NODE' | 'GROUP';
  sourceAnchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  targetAnchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  style: 'SOLID' | 'DASHED';
}

export interface FocusLabelRow {
  id: string;
  text: string;
  positionX: number;
  positionY: number;
}

export interface EvolutionSnapshotRow {
  slotIndex: number;
  id: string;
  version: string;
  timestamp: string;
  changelogNotes: string;
  isMajor: number;
  dataJson: string;
}

export interface EvolutionStateRow {
  id: number;
  activePointerIndex: number;
}

export interface SystemMetaRow {
  key: string;
  value: string;
}

export interface AuthJwtPayload {
  role: string;
  jti?: string;
  staticToken?: boolean;
  iat?: number;
  exp?: number;
}
