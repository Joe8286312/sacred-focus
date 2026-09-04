import Database, { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import type { 
  SacredSeatConfig, 
  FocusNode, 
  FocusEdge, 
  FocusGroup, 
  FocusTreeData, 
  ResetNodeItem,
  EvolutionSnapshot, 
  EvolutionState 
} from './types.js';

// 确保数据库目录存在
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

export const db: DatabaseType = new Database(config.dbPath);

// 开启高性能 WAL 模式与外键约束
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    -- 1. 神圣座位核心配置
    CREATE TABLE IF NOT EXISTS sacred_seat_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sacredToken TEXT NOT NULL,
      reservationSignal TEXT NOT NULL,
      defaultFocusDuration INTEGER NOT NULL DEFAULT 60,
      regretWindowSeconds INTEGER NOT NULL DEFAULT 30,
      currentStreak INTEGER NOT NULL DEFAULT 0,
      maxStreak INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL
    );

    -- 2. 专注流水日志
    CREATE TABLE IF NOT EXISTS focus_session_logs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('FOCUS', 'RESERVATION')),
      startTime TEXT NOT NULL,
      endTime TEXT NOT NULL,
      targetDurationMinutes INTEGER NOT NULL,
      actualDurationSeconds INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAIL', 'REGRET')),
      note TEXT
    );

    -- 3. 下必为例判例库
    CREATE TABLE IF NOT EXISTS precedent_cases (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      behavior TEXT NOT NULL,
      verdict TEXT NOT NULL CHECK(verdict IN ('ALLOW', 'FORBID')),
      boundaryCondition TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    -- 4. 国策树分组外框
    CREATE TABLE IF NOT EXISTS focus_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      themeColor TEXT NOT NULL,
      positionX REAL NOT NULL DEFAULT 0,
      positionY REAL NOT NULL DEFAULT 0,
      width REAL NOT NULL DEFAULT 300,
      height REAL NOT NULL DEFAULT 200
    );

    -- 5. 国策节点
    CREATE TABLE IF NOT EXISTS focus_nodes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      groupId TEXT,
      triggerTime TEXT NOT NULL,
      hasExactTime INTEGER NOT NULL DEFAULT 0,
      timeValueMinutes INTEGER,
      level INTEGER NOT NULL DEFAULT 1,
      maxLevel INTEGER NOT NULL DEFAULT 3,
      isLit INTEGER NOT NULL DEFAULT 0,
      isFrozen INTEGER NOT NULL DEFAULT 0,
      positionX REAL NOT NULL DEFAULT 0,
      positionY REAL NOT NULL DEFAULT 0,
      specInstruction TEXT NOT NULL DEFAULT '',
      specFailCondition TEXT NOT NULL DEFAULT '',
      specBenefitMechanism TEXT NOT NULL DEFAULT '',
      specNotes TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (groupId) REFERENCES focus_groups (id) ON DELETE SET NULL
    );

    -- 6. 拓扑有向连线
    CREATE TABLE IF NOT EXISTS focus_edges (
      id TEXT PRIMARY KEY,
      sourceId TEXT NOT NULL,
      sourceType TEXT NOT NULL CHECK(sourceType IN ('NODE', 'GROUP')),
      targetId TEXT NOT NULL,
      targetType TEXT NOT NULL CHECK(targetType IN ('NODE', 'GROUP')),
      sourceAnchor TEXT NOT NULL CHECK(sourceAnchor IN ('TOP', 'BOTTOM', 'LEFT', 'RIGHT')),
      targetAnchor TEXT NOT NULL CHECK(targetAnchor IN ('TOP', 'BOTTOM', 'LEFT', 'RIGHT')),
      style TEXT NOT NULL CHECK(style IN ('SOLID', 'DASHED'))
    );

    -- 7. 5 槽位版本演化快照
    CREATE TABLE IF NOT EXISTS evolution_snapshots (
      slotIndex INTEGER PRIMARY KEY CHECK (slotIndex >= 0 AND slotIndex <= 4),
      id TEXT NOT NULL,
      version TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      changelogNotes TEXT NOT NULL,
      isMajor INTEGER NOT NULL DEFAULT 0,
      dataJson TEXT NOT NULL
    );

    -- 8. 演化活跃指针状态
    CREATE TABLE IF NOT EXISTS evolution_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      activePointerIndex INTEGER NOT NULL DEFAULT 0
    );

    -- 9. 系统元数据与审计标记表
    CREATE TABLE IF NOT EXISTS system_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 数据库平滑迁移：为 focus_nodes 增加 lastLitDate 与 previousLevel 字段
  const nodeCols = (db.prepare('PRAGMA table_info(focus_nodes)').all() as Array<{ name: string }>).map(c => c.name);
  if (!nodeCols.includes('lastLitDate')) {
    db.prepare('ALTER TABLE focus_nodes ADD COLUMN lastLitDate TEXT').run();
  }
  if (!nodeCols.includes('previousLevel')) {
    db.prepare('ALTER TABLE focus_nodes ADD COLUMN previousLevel INTEGER NOT NULL DEFAULT 0').run();
  }

  seedDefaultData();
}

function seedDefaultData() {
  // 1. 初始化神圣座位配置
  const seatConfig = db.prepare('SELECT id FROM sacred_seat_config WHERE id = 1').get();
  if (!seatConfig) {
    db.prepare(`
      INSERT INTO sacred_seat_config (id, sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak, updatedAt)
      VALUES (1, '主力机开启专注模式', '反手拍手轻声说换人', 60, 30, 0, 0, datetime('now'))
    `).run();
  }

  // 2. 初始化国策树初始结构与种子节点
  const groupCount = db.prepare('SELECT count(*) as count FROM focus_groups').get() as { count: number };
  if (groupCount.count === 0) {
    // 初始分组
    const insertGroup = db.prepare(`
      INSERT INTO focus_groups (id, name, themeColor, positionX, positionY, width, height)
      VALUES (@id, @name, @themeColor, @positionX, @positionY, @width, @height)
    `);

    const g1: FocusGroup = {
      id: 'grp-dawn',
      name: '早起破晓组',
      themeColor: '#EA580C',
      position: { x: 50, y: 80 },
      size: { width: 440, height: 260 }
    };
    insertGroup.run({
      id: g1.id,
      name: g1.name,
      themeColor: g1.themeColor,
      positionX: g1.position.x,
      positionY: g1.position.y,
      width: g1.size.width,
      height: g1.size.height
    });

    const g2: FocusGroup = {
      id: 'grp-combat',
      name: '专注作战组',
      themeColor: '#0284C7',
      position: { x: 550, y: 80 },
      size: { width: 440, height: 260 }
    };
    insertGroup.run({
      id: g2.id,
      name: g2.name,
      themeColor: g2.themeColor,
      positionX: g2.position.x,
      positionY: g2.position.y,
      width: g2.size.width,
      height: g2.size.height
    });

    // 初始节点
    const insertNode = db.prepare(`
      INSERT INTO focus_nodes (
        id, code, name, groupId, triggerTime, hasExactTime, timeValueMinutes,
        level, maxLevel, isLit, isFrozen, positionX, positionY,
        specInstruction, specFailCondition, specBenefitMechanism, specNotes, sortOrder
      ) VALUES (
        @id, @code, @name, @groupId, @triggerTime, @hasExactTime, @timeValueMinutes,
        @level, @maxLevel, @isLit, @isFrozen, @positionX, @positionY,
        @specInstruction, @specFailCondition, @specBenefitMechanism, @specNotes, @sortOrder
      )
    `);

    const seedNodes: Array<FocusNode & { sortOrder: number }> = [
      {
        id: 'node-r0',
        code: 'R0',
        name: '水密隔舱',
        groupId: null,
        triggerTime: '全天候',
        hasExactTime: false,
        timeValueMinutes: undefined,
        level: 1,
        maxLevel: 1,
        isLit: true,
        isFrozen: false,
        position: { x: 250, y: -80 },
        specCard: {
          instruction: '当突发危机或精力崩溃时，启动豁免结算机制，物理切断扩散。',
          failCondition: '未切断污染源强行自我谴责。',
          benefitMechanism: '防雪崩韧性与单日损失上限锁定。'
        },
        sortOrder: 0
      },
      {
        id: 'node-m1',
        code: 'M1',
        name: '离地起爆',
        groupId: 'grp-dawn',
        triggerTime: '闹钟后3m',
        hasExactTime: false,
        timeValueMinutes: 420,
        level: 1,
        maxLevel: 3,
        isLit: false,
        isFrozen: false,
        position: { x: 80, y: 140 },
        specCard: {
          instruction: '闹钟响起后 3 分钟内双脚踩地，离开床铺。',
          failCondition: '躺在床上按掉闹钟继续赖床。',
          benefitMechanism: '打破睡眠惯性，建立第一行动势能。'
        },
        sortOrder: 1
      },
      {
        id: 'node-m2',
        code: 'M2',
        name: '冷水洗面',
        groupId: 'grp-dawn',
        triggerTime: '起爆后2m',
        hasExactTime: false,
        timeValueMinutes: 425,
        level: 1,
        maxLevel: 3,
        isLit: false,
        isFrozen: false,
        position: { x: 280, y: 140 },
        specCard: {
          instruction: '使用冷水清洗面部，彻底唤醒神经。',
          failCondition: '未完成洗漱返回卧室。',
          benefitMechanism: '哺乳动物潜水反射唤醒交感神经。'
        },
        sortOrder: 2
      },
      {
        id: 'node-f1',
        code: 'F1',
        name: '神圣首战',
        groupId: 'grp-combat',
        triggerTime: '08:30',
        hasExactTime: true,
        timeValueMinutes: 510,
        level: 1,
        maxLevel: 5,
        isLit: false,
        isFrozen: false,
        position: { x: 580, y: 140 },
        specCard: {
          instruction: '开启第一场 60 分钟深度神圣座位专注，攻克当日第一核心硬骨头。',
          failCondition: '开局浏览非工作社交资讯。',
          benefitMechanism: '早间高精力峰值价值最大化。'
        },
        sortOrder: 3
      },
      {
        id: 'node-n7',
        code: 'N7',
        name: '神圣寝域',
        groupId: null,
        triggerTime: '22:30',
        hasExactTime: true,
        timeValueMinutes: 1350,
        level: 1,
        maxLevel: 3,
        isLit: false,
        isFrozen: false,
        position: { x: 580, y: 380 },
        specCard: {
          instruction: '手机充电源移出寝室，全黑静音入眠。',
          failCondition: '手机带上床铺。',
          benefitMechanism: '构筑稳态闭环终点，保护褪黑素分泌。'
        },
        sortOrder: 4
      }
    ];

    for (const node of seedNodes) {
      insertNode.run({
        id: node.id,
        code: node.code,
        name: node.name,
        groupId: node.groupId,
        triggerTime: node.triggerTime,
        hasExactTime: node.hasExactTime ? 1 : 0,
        timeValueMinutes: node.timeValueMinutes ?? null,
        level: node.level,
        maxLevel: node.maxLevel,
        isLit: node.isLit ? 1 : 0,
        isFrozen: node.isFrozen ? 1 : 0,
        positionX: node.position.x,
        positionY: node.position.y,
        specInstruction: node.specCard.instruction,
        specFailCondition: node.specCard.failCondition,
        specBenefitMechanism: node.specCard.benefitMechanism,
        specNotes: node.specCard.notes ?? null,
        sortOrder: node.sortOrder
      });
    }

    // 初始连线
    const insertEdge = db.prepare(`
      INSERT INTO focus_edges (id, sourceId, sourceType, targetId, targetType, sourceAnchor, targetAnchor, style)
      VALUES (@id, @sourceId, @sourceType, @targetId, @targetType, @sourceAnchor, @targetAnchor, @style)
    `);

    const seedEdges: FocusEdge[] = [
      {
        id: 'edge-m1-m2',
        sourceId: 'node-m1',
        sourceType: 'NODE',
        targetId: 'node-m2',
        targetType: 'NODE',
        sourceAnchor: 'RIGHT',
        targetAnchor: 'LEFT',
        style: 'SOLID'
      },
      {
        id: 'edge-dawn-combat',
        sourceId: 'grp-dawn',
        sourceType: 'GROUP',
        targetId: 'grp-combat',
        targetType: 'GROUP',
        sourceAnchor: 'RIGHT',
        targetAnchor: 'LEFT',
        style: 'SOLID'
      },
      {
        id: 'edge-f1-n7',
        sourceId: 'node-f1',
        sourceType: 'NODE',
        targetId: 'node-n7',
        targetType: 'NODE',
        sourceAnchor: 'BOTTOM',
        targetAnchor: 'TOP',
        style: 'DASHED'
      }
    ];

    for (const edge of seedEdges) {
      insertEdge.run(edge);
    }
  }

  // 3. 初始化演化版本快照与活跃指针
  const stateRow = db.prepare('SELECT id FROM evolution_state WHERE id = 1').get();
  if (!stateRow) {
    db.prepare('INSERT INTO evolution_state (id, activePointerIndex) VALUES (1, 0)').run();
  }

  const snapshotCount = db.prepare('SELECT count(*) as count FROM evolution_snapshots').get() as { count: number };
  if (snapshotCount.count === 0) {
    // 将当前树结构保存为 v1.0 初始快照 (Slot 0)
    const nodes = getFullFocusTreeData();
    const initSnapshot: EvolutionSnapshot = {
      version: 'v1.0',
      timestamp: new Date().toISOString(),
      changelogNotes: '系统初始化基准版本：包含基础破晓组与作战组。',
      isMajor: true,
      nodes: nodes.nodes,
      edges: nodes.edges,
      groups: nodes.groups
    };

    db.prepare(`
      INSERT INTO evolution_snapshots (slotIndex, id, version, timestamp, changelogNotes, isMajor, dataJson)
      VALUES (0, 'snap-v1-0', @version, @timestamp, @changelogNotes, 1, @dataJson)
    `).run({
      version: initSnapshot.version,
      timestamp: initSnapshot.timestamp,
      changelogNotes: initSnapshot.changelogNotes,
      dataJson: JSON.stringify(initSnapshot)
    });
  }
}

// 辅助查询：获取当前全量国策树数据
export function getFullFocusTreeData(): FocusTreeData {
  const groupRows = db.prepare('SELECT * FROM focus_groups').all() as any[];
  const groups: FocusGroup[] = groupRows.map(row => ({
    id: row.id,
    name: row.name,
    themeColor: row.themeColor,
    position: { x: row.positionX, y: row.positionY },
    size: { width: row.width, height: row.height }
  }));

  const nodeRows = db.prepare('SELECT * FROM focus_nodes ORDER BY sortOrder ASC').all() as any[];
  const nodes: FocusNode[] = nodeRows.map(row => ({
    id: row.id,
    code: row.code,
    name: row.name,
    groupId: row.groupId,
    triggerTime: row.triggerTime,
    hasExactTime: Boolean(row.hasExactTime),
    timeValueMinutes: row.timeValueMinutes ?? undefined,
    level: row.level,
    maxLevel: row.maxLevel,
    isLit: Boolean(row.isLit),
    isFrozen: Boolean(row.isFrozen),
    lastLitDate: row.lastLitDate || undefined,
    previousLevel: row.previousLevel ?? 0,
    position: { x: row.positionX, y: row.positionY },
    specCard: {
      instruction: row.specInstruction,
      failCondition: row.specFailCondition,
      benefitMechanism: row.specBenefitMechanism,
      notes: row.specNotes ?? undefined
    }
  }));

  const edgeRows = db.prepare('SELECT * FROM focus_edges').all() as any[];
  const edges: FocusEdge[] = edgeRows.map(row => ({
    id: row.id,
    sourceId: row.sourceId,
    sourceType: row.sourceType,
    targetId: row.targetId,
    targetType: row.targetType,
    sourceAnchor: row.sourceAnchor,
    targetAnchor: row.targetAnchor,
    style: row.style
  }));

  return { nodes, edges, groups };
}

// -----------------------------------------------------------------------------
// 自控工程学：业务日计算与每日首次上线结算系统 (以凌晨 04:00 为分界)
// -----------------------------------------------------------------------------

// 计算当前所属的业务日（以每天凌晨 04:00 为新一天开始，早于 4 点归属前一日）
export function getBusinessDay(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() - 4 * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 计算前一个业务日
export function getPreviousBusinessDay(businessDay: string): string {
  const [y, m, d] = businessDay.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const prevY = date.getFullYear();
  const prevM = String(date.getMonth() + 1).padStart(2, '0');
  const prevD = String(date.getDate()).padStart(2, '0');
  return `${prevY}-${prevM}-${prevD}`;
}

// 每日首次上线结算引擎：
// 严格确保每天仅在第一次上线时执行断签判断，后续刷新绝不重复触发
export function settleFocusTreeDailyState(): { resetNodes: ResetNodeItem[]; settlementDate: string } | null {
  const today = getBusinessDay();
  const yesterday = getPreviousBusinessDay(today);

  // 1. 读取数据库中持久化的“最后每日结算日期”
  const metaRow = db.prepare('SELECT value FROM system_meta WHERE key = ?').get('lastDailySettlementDate') as { value: string } | undefined;
  if (metaRow && metaRow.value === today) {
    // 当日已经完成过首次上线结算，直接静默跳过
    return null;
  }

  const resetNodes: ResetNodeItem[] = [];

  const settleTx = db.transaction(() => {
    const allNodes = db.prepare('SELECT id, code, name, level, maxLevel, isLit, lastLitDate FROM focus_nodes').all() as any[];

    for (const node of allNodes) {
      const isLitToday = node.lastLitDate === today;
      const isLitYesterday = node.lastLitDate === yesterday;

      if (!isLitToday && !isLitYesterday) {
        // 昨日未能点亮（发生断签）
        if (node.level > 0) {
          resetNodes.push({
            id: node.id,
            code: node.code,
            name: node.name,
            lostLevel: node.level,
            maxLevel: node.maxLevel
          });
          // 当前等级清空至 0 级，待命熄灭，保留历史最高等级
          db.prepare('UPDATE focus_nodes SET level = 0, previousLevel = 0, isLit = 0 WHERE id = ?').run(node.id);
        } else if (node.isLit === 1) {
          db.prepare('UPDATE focus_nodes SET isLit = 0 WHERE id = ?').run(node.id);
        }
      } else if (isLitYesterday && !isLitToday) {
        // 昨日已点亮，今日尚未点亮：重置为待命状态，保留 level 等待今日点亮升级
        db.prepare('UPDATE focus_nodes SET isLit = 0 WHERE id = ?').run(node.id);
      }
    }

    // 2. 写入/更新今日结算标记，确保当天后续所有刷新绝不再重复触发
    db.prepare('INSERT OR REPLACE INTO system_meta (key, value) VALUES (?, ?)').run('lastDailySettlementDate', today);
  });

  settleTx();

  return { resetNodes, settlementDate: today };
}
