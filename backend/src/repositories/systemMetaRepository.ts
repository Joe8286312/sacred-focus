import type { SqliteDatabasePort } from './databasePort.js';

export interface SystemMetaRepository {
  getValue(key: string): string | undefined;
  setValue(key: string, value: string): void;
  deleteValue(key: string): boolean;
  getSystemRevision(): number;
  incrementSystemRevision(now: string): number;
}

/**
 * `system_meta` 的数据访问边界。
 * 该工厂接收数据库端口，便于以 :memory: SQLite 测试，也为后续 revision/maintenance 迁移提供唯一落点。
 */
export function createSystemMetaRepository(db: SqliteDatabasePort): SystemMetaRepository {
  function getValue(key: string): string | undefined {
    const row = db.prepare('SELECT value FROM system_meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  function setValue(key: string, value: string): void {
    db.prepare(`
      INSERT INTO system_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  function deleteValue(key: string): boolean {
    return db.prepare('DELETE FROM system_meta WHERE key = ?').run(key).changes > 0;
  }

  function getSystemRevision(): number {
    const value = getValue('system_revision');
    return value === undefined ? 1 : parseInt(value, 10);
  }

  function incrementSystemRevision(now: string): number {
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO system_meta (key, value)
        VALUES ('system_revision', '1')
        ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(system_meta.value AS INTEGER) + 1 AS TEXT)
      `).run();

      setValue('last_sync_timestamp', now);

      const row = db.prepare("SELECT CAST(value AS INTEGER) AS rev FROM system_meta WHERE key = 'system_revision'")
        .get() as { rev: number };
      return row.rev;
    });

    return tx();
  }

  return {
    getValue,
    setValue,
    deleteValue,
    getSystemRevision,
    incrementSystemRevision
  };
}
