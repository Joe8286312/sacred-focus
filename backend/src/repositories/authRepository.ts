import bcrypt from 'bcryptjs';
import type { SqliteDatabasePort } from './databasePort.js';

const ADMIN_PASSWORD_HASH_KEY = 'admin_password_hash';
const REVOKED_JTI_PREFIX = 'revoked_jti:';

export interface AuthRepositoryOptions {
  now?: () => number;
  hashInitialPassword?: (password: string) => string;
}

export interface AuthRepository {
  getAdminPasswordHash(input: { configuredHash?: string; initialPassword: string }): { hash: string; initialized: boolean };
  revokeJti(jti: string, expiresAt: number): void;
  isJtiRevoked(jti: string, options?: { purgeExpired?: boolean }): boolean;
  purgeExpiredRevokedJtis(): number;
}

/** 管理员凭据哈希与 JWT 吊销名单的 SQLite 数据访问边界。 */
export function createAuthRepository(
  db: SqliteDatabasePort,
  { now = Date.now, hashInitialPassword = password => bcrypt.hashSync(password, 12) }: AuthRepositoryOptions = {}
): AuthRepository {
  function getAdminPasswordHash({ configuredHash, initialPassword }: { configuredHash?: string; initialPassword: string }) {
    if (configuredHash) return { hash: configuredHash, initialized: false };

    const row = db.prepare('SELECT value FROM system_meta WHERE key = ?').get(ADMIN_PASSWORD_HASH_KEY) as { value: string } | undefined;
    if (row?.value) return { hash: row.value, initialized: false };

    const newHash = hashInitialPassword(initialPassword);
    db.prepare('INSERT OR REPLACE INTO system_meta (key, value) VALUES (?, ?)').run(ADMIN_PASSWORD_HASH_KEY, newHash);
    return { hash: newHash, initialized: true };
  }

  function revokeJti(jti: string, expiresAt: number): void {
    db.prepare("INSERT OR REPLACE INTO system_meta (key, value) VALUES (?, ?)")
      .run(`${REVOKED_JTI_PREFIX}${jti}`, String(expiresAt));
  }

  function isJtiRevoked(jti: string, { purgeExpired = false }: { purgeExpired?: boolean } = {}): boolean {
    const key = `${REVOKED_JTI_PREFIX}${jti}`;
    const revoked = db.prepare('SELECT value FROM system_meta WHERE key = ?').get(key) as { value: string } | undefined;
    if (!revoked) return false;

    const expiresAt = parseInt(revoked.value, 10);
    if (Number.isNaN(expiresAt) || now() < expiresAt) return true;

    if (purgeExpired) {
      try {
        db.prepare('DELETE FROM system_meta WHERE key = ?').run(key);
      } catch {
        // 过期记录清理是最佳努力，不应阻断一个已经自然失效的 token。
      }
    }
    return false;
  }

  function purgeExpiredRevokedJtis(): number {
    const rows = db.prepare("SELECT key, value FROM system_meta WHERE key LIKE 'revoked_jti:%'").all() as Array<{ key: string; value: string }>;
    const currentTime = now();
    const deleteStatement = db.prepare('DELETE FROM system_meta WHERE key = ?');
    let purgedCount = 0;
    db.transaction(() => {
      for (const row of rows) {
        const expiresAt = parseInt(row.value, 10);
        if (!Number.isNaN(expiresAt) && currentTime >= expiresAt) {
          deleteStatement.run(row.key);
          purgedCount++;
        }
      }
    })();
    return purgedCount;
  }

  return { getAdminPasswordHash, revokeJti, isJtiRevoked, purgeExpiredRevokedJtis };
}
