import Database, { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { config } from '../config.js';
import { createTables } from './schema.js';
import { migrateDatabase } from './migrations.js';
import { initializeMinimalState } from './seed.js';

// 确保数据库目录存在
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

function openDatabase(dbPath: string, limitMb: number): DatabaseType {
  const connection = new Database(dbPath);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');
  connection.pragma('busy_timeout = 5000');
  const pageSize = connection.pragma('page_size', { simple: true }) as number;
  // SQLite 自身执行硬上限，单次大写入也不能突破容量边界。
  connection.pragma(`max_page_count = ${Math.max(1, Math.floor(limitMb * 1024 * 1024 / pageSize))}`);
  return connection;
}

/** 原单用户数据库保留为管理员工作区及服务器账号注册表。 */
export const rootDb: DatabaseType = openDatabase(config.dbPath, config.personalDataLimitMb);

interface AccountDatabase {
  database: DatabaseType;
  dataDir: string;
  activeScopes: number;
}
const accountContext = new AsyncLocalStorage<AccountDatabase>();
const accountDatabases = new Map<string, AccountDatabase>();
const MAX_IDLE_CONNECTIONS = 8;

function getAccountDatabase(accountId: string): AccountDatabase {
  if (accountId === 'admin') return { database: rootDb, dataDir: config.dataDir, activeScopes: 0 };
  if (accountId !== 'public' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    throw new Error('INVALID_ACCOUNT_ID');
  }
  const existing = accountDatabases.get(accountId);
  if (existing) {
    accountDatabases.delete(accountId);
    accountDatabases.set(accountId, existing);
    return existing;
  }
  const dataDir = path.join(config.dataDir, 'accounts', accountId);
  fs.mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(path.join(dataDir, 'app.db'), accountId === 'public' ? config.publicDataLimitMb : config.personalDataLimitMb);
  try {
    createTables(database);
    migrateDatabase(database);
    initializeMinimalState(database);
  } catch (error) {
    database.close();
    throw error;
  }
  const entry: AccountDatabase = { database, dataDir, activeScopes: 0 };
  accountDatabases.set(accountId, entry);
  return entry;
}

function pruneIdleConnections(): void {
  let idleCount = [...accountDatabases.values()].filter(entry => entry.activeScopes === 0).length;
  for (const [id, entry] of accountDatabases) {
    if (idleCount <= MAX_IDLE_CONNECTIONS) break;
    if (entry.activeScopes !== 0) continue;
    entry.database.close();
    accountDatabases.delete(id);
    idleCount--;
  }
}

/** 异步上下文由验证后的身份创建，数据库选择不接受客户端路径或账号参数。 */
export function runWithAccountDatabase<T>(accountId: string, callback: () => T): T {
  return runWithDatabaseEntry(getAccountDatabase(accountId), callback);
}

/** 后台异步恢复即使客户端断开也持有连接，直到事务和清理都完成。 */
export function retainAccountDatabase<T>(callback: () => T): T {
  const entry = accountContext.getStore();
  return entry ? runWithDatabaseEntry(entry, callback) : callback();
}

function runWithDatabaseEntry<T>(entry: AccountDatabase, callback: () => T): T {
  entry.activeScopes++;
  const release = () => { entry.activeScopes--; pruneIdleConnections(); };
  try {
    const result = accountContext.run(entry, callback);
    if (result && typeof (result as unknown as PromiseLike<unknown>).then === 'function') {
      return Promise.resolve(result).finally(release) as T;
    }
    release();
    return result;
  } catch (error) {
    release();
    throw error;
  }
}

export function getAccountDataDir(): string { return accountContext.getStore()?.dataDir ?? config.dataDir; }

/** Repository 保持原有注入接口；每次调用绑定到当前请求的具体 SQLite 连接。 */
export const db: DatabaseType = new Proxy(rootDb, {
  get(_target, property) {
    const connection = accountContext.getStore()?.database ?? rootDb;
    const value = Reflect.get(connection, property, connection);
    return typeof value === 'function' ? value.bind(connection) : value;
  }
});

export function checkpointAllDatabases(mode: 'PASSIVE' | 'TRUNCATE' = 'PASSIVE'): void {
  for (const connection of [rootDb, ...[...accountDatabases.values()].map(entry => entry.database)]) {
    connection.pragma(`wal_checkpoint(${mode})`);
  }
}

export function closeAllDatabases(): void {
  for (const entry of accountDatabases.values()) entry.database.close();
  accountDatabases.clear();
  rootDb.close();
}
