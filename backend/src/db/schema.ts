import type { Database as DatabaseType } from 'better-sqlite3';

export function createTables(db: DatabaseType) {
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
      focusContent TEXT,
      failureReason TEXT,
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
      triggerTime TEXT,
      triggerScene TEXT NOT NULL DEFAULT '全天候',
      hasExactTime INTEGER NOT NULL DEFAULT 0,
      timeValueMinutes INTEGER,
      level INTEGER NOT NULL DEFAULT 1,
      maxLevel INTEGER NOT NULL DEFAULT 1,
      isLit INTEGER NOT NULL DEFAULT 0,
      isFrozen INTEGER NOT NULL DEFAULT 0,
      lastLitDate TEXT,
      previousLevel INTEGER NOT NULL DEFAULT 0,
      previousLastLitDate TEXT,
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

    -- 6.1 纯文本说明标签框（如“专注间歇”等极简流转说明）
    CREATE TABLE IF NOT EXISTS focus_labels (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      positionX REAL NOT NULL DEFAULT 0,
      positionY REAL NOT NULL DEFAULT 0
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

    -- 10. 高频检索与级联关联关键索引 (P2-001 性能治理)
    CREATE INDEX IF NOT EXISTS idx_logs_type_starttime ON focus_session_logs(type, startTime);
    CREATE INDEX IF NOT EXISTS idx_cases_verdict_date ON precedent_cases(verdict, date DESC);
    CREATE INDEX IF NOT EXISTS idx_nodes_group ON focus_nodes(groupId);
    CREATE INDEX IF NOT EXISTS idx_edges_source ON focus_edges(sourceId);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON focus_edges(targetId);
  `);

  // 初始化原子系统版本号与最后同步时间戳
  db.prepare("INSERT OR IGNORE INTO system_meta (key, value) VALUES ('system_revision', '1')").run();
  db.prepare("INSERT OR IGNORE INTO system_meta (key, value) VALUES ('last_sync_timestamp', ?)").run(new Date().toISOString());
}
