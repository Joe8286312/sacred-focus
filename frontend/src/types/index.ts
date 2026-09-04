// 1. 系统核心配置与神圣座位元数据
export interface SacredSeatConfig {
  sacredToken: string;            // 神圣信物（如：主力机开启专注模式）
  reservationSignal: string;      // 预约启动信号（如：反手拍手轻声说换人）
  defaultFocusDuration: number;   // 默认专注时长（分钟，默认 60）
  regretWindowSeconds: number;    // 后悔药熔断时限（秒，默认 30）
  currentStreak: number;          // 当前主链连胜节点数（#N）
  maxStreak: number;              // 历史最高连胜纪录
}

// 2. 专注与预约实践流水日志
export interface FocusSessionLog {
  id: string;
  type: 'FOCUS' | 'RESERVATION';
  startTime: string;              // ISO 8601 时间戳
  endTime: string;
  targetDurationMinutes: number;
  actualDurationSeconds: number;
  status: 'SUCCESS' | 'FAIL' | 'REGRET';
  note?: string;
}

// 3. 下必为例判例记录
export interface PrecedentCase {
  id: string;
  date: string;                   // YYYY-MM-DD
  behavior: string;               // 行为描述
  verdict: 'ALLOW' | 'FORBID';    // 允许 或 禁止
  boundaryCondition: string;      // 裁决说明与执行边界
  createdAt: string;
}

// 4. 国策节点定义
export interface FocusNodeSpecCard {
  instruction: string;            // 动作指令
  failCondition: string;          // 失败判定
  benefitMechanism: string;       // 机制收益与心理学解释
  notes?: string;                 // 备注
}

export interface FocusNode {
  id: string;                     // 内部唯一ID
  code: string;                   // 纯文本编号（如 R0, M1, F3, N7，严禁装饰Emoji）
  name: string;                   // 纯文本名称（如 离地起爆）
  groupId: string | null;         // 归属分组ID，新建默认 null (无外框独立国策)
  triggerTime: string;            // 纯文本触发时间或场景描述（如 "07:30", "闹钟后3m", "全天候"）
  hasExactTime: boolean;          // 是否为精确时间点（用于列表排序）
  timeValueMinutes?: number;      // 转化为分钟数便于比较大小（如 07:30 -> 450）
  level: number;                  // 当前强化等级（连续点亮天数）
  maxLevel: number;               // 历史最高强化等级（峰值）
  isLit: boolean;                 // 当前是否点亮 (已点亮 / 待命)
  isFrozen: boolean;              // 是否处于水密隔舱冻结态
  lastLitDate?: string;           // 最后一次点亮的业务日期 (YYYY-MM-DD，以凌晨4点为界)
  previousLevel?: number;         // 点亮前的备份等级（用于当天反悔回退）
  position: { x: number; y: number }; // 画布坐标
  specCard: FocusNodeSpecCard;
}

// 5. 拓扑关联连线（支持节点与节点、分组与分组、节点与分组跨层级连线）
export interface FocusEdge {
  id: string;
  sourceId: string;               // 起始端 ID (可为 Node ID 或 Group ID)
  sourceType: 'NODE' | 'GROUP';   // 起始端类型
  targetId: string;               // 目标端 ID (可为 Node ID 或 Group ID)
  targetType: 'NODE' | 'GROUP';   // 目标端类型
  sourceAnchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  targetAnchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  style: 'SOLID' | 'DASHED';      // 实线流水 或 虚线关联/代偿
}

// 6. 分组外框定义
export interface FocusGroup {
  id: string;
  name: string;                   // 分组名（纯文本，如 "早起国策组"）
  themeColor: string;             // 自定义主题边框色（支持任意 HEX/HSL，如 "#EA580C"）
  position: { x: number; y: number };
  size: { width: number; height: number };
}

// 7. 每日结算断签项定义
export interface ResetNodeItem {
  id: string;
  code: string;
  name: string;
  lostLevel: number;
  maxLevel: number;
}

// 8. 国策树全景数据包
export interface FocusTreeData {
  nodes: FocusNode[];
  edges: FocusEdge[];
  groups: FocusGroup[];
  resetSummary?: {
    resetNodes: ResetNodeItem[];
    settlementDate: string;
  };
}

// 8. 国策树演化版本快照与日志
export interface EvolutionSnapshot {
  version: string;                // 如 "v1.0", "v1.1"
  timestamp: string;
  changelogNotes: string;
  isMajor: boolean;
  nodes: FocusNode[];
  edges: FocusEdge[];
  groups: FocusGroup[];
}

export interface EvolutionState {
  activePointerIndex: number;     // 0 ~ 4，指向当前激活的快照槽位
  snapshots: EvolutionSnapshot[]; // 容量最大为 5 的环形缓存数组
}
