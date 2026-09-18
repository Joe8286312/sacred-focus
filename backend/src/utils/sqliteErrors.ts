/** SQLite 写锁竞争可在下一次同步探针重试，非锁竞争错误必须继续向上抛出。 */
export function isSqliteLockError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED';
}
