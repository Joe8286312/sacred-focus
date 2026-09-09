import { db } from './connection.js';

// 获取全局系统原子版本号
export function getSystemRevision(): number {
  const row = db.prepare("SELECT value FROM system_meta WHERE key = 'system_revision'").get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 1;
}

// 原子递增系统版本号并更新最新修改时间戳
export function incrementSystemRevision(): number {
  const current = getSystemRevision();
  const next = current + 1;
  const now = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO system_meta (key, value) VALUES ('system_revision', ?)").run(String(next));
  db.prepare("INSERT OR REPLACE INTO system_meta (key, value) VALUES ('last_sync_timestamp', ?)").run(now);
  return next;
}
