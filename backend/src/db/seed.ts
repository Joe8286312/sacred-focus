import type { Database as DatabaseType } from 'better-sqlite3';

/**
 * 初始化应用正常运行所需、但不属于用户内容的最小状态。
 *
 * 国策画布、分组、节点、连线与演化快照均由用户创建或导入，绝不在首次
 * 启动时注入演示数据。这样每个新部署都是空白工作区，也不会在重启时影响
 * 已有用户数据。
 */
export function initializeMinimalState(db: DatabaseType) {
  const seatConfig = db.prepare('SELECT id FROM sacred_seat_config WHERE id = 1').get();
  if (seatConfig) return;

  db.prepare(`
    INSERT INTO sacred_seat_config (id, sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak, updatedAt)
    VALUES (1, '开始专注', '轻拍双手，切换状态', 60, 30, 0, 0, datetime('now'))
  `).run();
}
