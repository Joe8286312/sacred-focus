import type { SqliteDatabasePort } from './databasePort.js';

export interface SecurityBanRepository {
  getBanValue(ip: string): string | undefined;
  setBanValue(ip: string, expiresAt: string): void;
  deleteBan(ip: string): boolean;
}

function getBanKey(ip: string): string {
  return `ip_ban:${ip}`;
}

/** 仅封装安全中间件的 IP 封禁持久化；封禁策略与缓存仍属于 middleware。 */
export function createSecurityBanRepository(db: SqliteDatabasePort): SecurityBanRepository {
  function getBanValue(ip: string): string | undefined {
    const row = db.prepare('SELECT value FROM system_meta WHERE key = ?').get(getBanKey(ip)) as { value: string } | undefined;
    return row?.value;
  }

  function setBanValue(ip: string, expiresAt: string): void {
    db.prepare('INSERT OR REPLACE INTO system_meta (key, value) VALUES (?, ?)')
      .run(getBanKey(ip), expiresAt);
  }

  function deleteBan(ip: string): boolean {
    return db.prepare('DELETE FROM system_meta WHERE key = ?').run(getBanKey(ip)).changes > 0;
  }

  return { getBanValue, setBanValue, deleteBan };
}
