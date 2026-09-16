import type { Database as SqliteDatabase } from 'better-sqlite3';

/**
 * Repository 可使用的最小 SQLite 能力集合。
 * 具体连接生命周期仍由 db/connection 负责；repository 不感知 Express 或全局单例。
 */
export type SqliteDatabasePort = Pick<SqliteDatabase, 'prepare' | 'transaction'>;
