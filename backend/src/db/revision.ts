import { db } from './connection.js';

// 获取全局系统原子版本号
export function getSystemRevision(): number {
  const row = db.prepare("SELECT value FROM system_meta WHERE key = 'system_revision'").get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 1;
}

// 原子递增系统版本号并更新最新修改时间戳
export function incrementSystemRevision(): number {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO system_meta (key, value)
      VALUES ('system_revision', '1')
      ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(system_meta.value AS INTEGER) + 1 AS TEXT)
    `).run();

    db.prepare(`
      INSERT INTO system_meta (key, value)
      VALUES ('last_sync_timestamp', @now)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run({ now });

    const row = db.prepare("SELECT CAST(value AS INTEGER) AS rev FROM system_meta WHERE key = 'system_revision'").get() as { rev: number };
    return row.rev;
  });

  return tx();
}
