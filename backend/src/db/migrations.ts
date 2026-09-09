import type { Database as DatabaseType } from 'better-sqlite3';

export function migrateDatabase(db: DatabaseType) {
  // 数据库平滑迁移：为 focus_nodes 增加 lastLitDate、previousLevel 与 triggerScene 字段
  const nodeCols = (db.prepare('PRAGMA table_info(focus_nodes)').all() as Array<{ name: string }>).map(c => c.name);
  if (!nodeCols.includes('lastLitDate')) {
    db.prepare('ALTER TABLE focus_nodes ADD COLUMN lastLitDate TEXT').run();
  }
  if (!nodeCols.includes('previousLevel')) {
    db.prepare('ALTER TABLE focus_nodes ADD COLUMN previousLevel INTEGER NOT NULL DEFAULT 0').run();
  }
  if (!nodeCols.includes('triggerScene')) {
    db.prepare("ALTER TABLE focus_nodes ADD COLUMN triggerScene TEXT NOT NULL DEFAULT '全天候'").run();
  }

  // 数据库平滑迁移：为 focus_session_logs 增加 focusContent 与 failureReason 字段
  const sessionLogCols = (db.prepare('PRAGMA table_info(focus_session_logs)').all() as Array<{ name: string }>).map(c => c.name);
  if (!sessionLogCols.includes('focusContent')) {
    db.prepare('ALTER TABLE focus_session_logs ADD COLUMN focusContent TEXT').run();
  }
  if (!sessionLogCols.includes('failureReason')) {
    db.prepare('ALTER TABLE focus_session_logs ADD COLUMN failureReason TEXT').run();
  }

  // 历史数据平滑回填与校准迁移：确保旧节点时间与场景正确分离
  const existingNodes = db.prepare('SELECT id, triggerTime, triggerScene FROM focus_nodes').all() as Array<{ id: string; triggerTime: string | null; triggerScene: string | null }>;
  const updateStmt = db.prepare('UPDATE focus_nodes SET triggerScene = ?, triggerTime = ?, hasExactTime = ?, timeValueMinutes = ? WHERE id = ?');
  for (const n of existingNodes) {
    if (n.triggerTime) {
      const match = n.triggerTime.match(/^(\d{1,2})[:：](\d{2})$/);
      if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const standardTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const scene = (!n.triggerScene || n.triggerScene === '全天候') ? standardTime : n.triggerScene;
        updateStmt.run(scene, standardTime, 1, h * 60 + m, n.id);
      } else {
        // 若 triggerTime 是诸如 "全天候"、"闹钟后3m" 等中文场景描述，将其移至 triggerScene，并将 triggerTime 置为空字符串满足 SQLite 约束
        const scene = (n.triggerScene && n.triggerScene !== '全天候') ? n.triggerScene : (n.triggerTime || '全天候');
        updateStmt.run(scene, '', 0, null, n.id);
      }
    }
  }
}
