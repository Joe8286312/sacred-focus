import type { Database as DatabaseType } from 'better-sqlite3';
import { createSystemMetaRepository } from '../repositories/systemMetaRepository.js';

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
  if (!nodeCols.includes('previousLastLitDate')) {
    db.prepare('ALTER TABLE focus_nodes ADD COLUMN previousLastLitDate TEXT').run();
  }

  // 数据库平滑迁移：为 focus_session_logs 增加 focusContent 与 failureReason 字段
  const sessionLogCols = (db.prepare('PRAGMA table_info(focus_session_logs)').all() as Array<{ name: string }>).map(c => c.name);
  if (!sessionLogCols.includes('focusContent')) {
    db.prepare('ALTER TABLE focus_session_logs ADD COLUMN focusContent TEXT').run();
  }
  if (!sessionLogCols.includes('failureReason')) {
    db.prepare('ALTER TABLE focus_session_logs ADD COLUMN failureReason TEXT').run();
  }

  // P2-002 幂等迁移治理：使用持久化版本标记与事务，避免服务每次启动重复遍历写盘
  const migrationApplied = db.prepare("SELECT value FROM system_meta WHERE key = 'migration:trigger_scene_v1'").get() as { value: string } | undefined;
  if (!migrationApplied) {
    const existingNodes = db.prepare('SELECT id, triggerTime, triggerScene FROM focus_nodes').all() as Array<{ id: string; triggerTime: string | null; triggerScene: string | null }>;
    const updateStmt = db.prepare('UPDATE focus_nodes SET triggerScene = ?, triggerTime = ?, hasExactTime = ?, timeValueMinutes = ? WHERE id = ?');
    const runMigrationTx = db.transaction(() => {
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
      db.prepare("INSERT OR REPLACE INTO system_meta (key, value) VALUES ('migration:trigger_scene_v1', 'done')").run();
    });
    runMigrationTx();
  }

  migrateSacredSeatDefaults(db);
}

/** 只升级已知旧默认文案；保留个人设置、时长、连胜和其他业务数据。 */
function migrateSacredSeatDefaults(db: DatabaseType): void {
  const migrationKey = 'migration:sacred_seat_defaults_v1';
  const systemMeta = createSystemMetaRepository(db);
  if (systemMeta.getValue(migrationKey)) return;
  db.transaction(() => {
    if (systemMeta.getValue(migrationKey)) return;
    const current = db.prepare('SELECT sacredToken, reservationSignal FROM sacred_seat_config WHERE id = 1')
      .get() as { sacredToken: string; reservationSignal: string } | undefined;
    if (current) {
      const sacredToken = ['开始专注', '主力机开启专注模式'].includes(current.sacredToken) ? '图书馆坐上特定座位' : current.sacredToken;
      const reservationSignal = ['轻拍双手，切换状态', '反手拍手轻声说换人'].includes(current.reservationSignal) ? '打响指' : current.reservationSignal;
      if (sacredToken !== current.sacredToken || reservationSignal !== current.reservationSignal) {
        db.prepare("UPDATE sacred_seat_config SET sacredToken = ?, reservationSignal = ?, updatedAt = datetime('now') WHERE id = 1")
          .run(sacredToken, reservationSignal);
        systemMeta.incrementSystemRevision(new Date().toISOString());
      }
    }
    systemMeta.setValue(migrationKey, 'done');
  }).immediate();
}
