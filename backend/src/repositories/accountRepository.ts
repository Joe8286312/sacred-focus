import { randomUUID } from 'crypto';
import type { SqliteDatabasePort } from './databasePort.js';

export interface Account {
  id: string;
  username: string;
  passwordHash: string;
  disabled: boolean;
  sessionVersion: number;
  createdAt: string;
}

export interface AccountRepository {
  findById(id: string): Account | undefined;
  findByUsername(username: string): Account | undefined;
  list(): Account[];
  create(input: { username: string; passwordHash: string }): Account;
  setDisabled(id: string, disabled: boolean): boolean;
  setPasswordHash(id: string, passwordHash: string): boolean;
}

export function createAccountTables(db: SqliteDatabasePort): void {
  db.prepare(`CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0, 1)),
    sessionVersion INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL
  )`).run();
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isPersonalUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username) && !['admin', 'public'].includes(username);
}

/** 账号注册表只接收服务器根数据库；不随请求工作区切换。 */
export function createAccountRepository(db: SqliteDatabasePort, { maxAccounts = 20 }: { maxAccounts?: number } = {}): AccountRepository {
  function toAccount(row: unknown): Account | undefined {
    if (!row) return undefined;
    const account = row as Account;
    return { ...account, disabled: Boolean(account.disabled) };
  }
  function findById(id: string) { return toAccount(db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)); }
  function findByUsername(username: string) { return toAccount(db.prepare('SELECT * FROM accounts WHERE username = ?').get(normalizeUsername(username))); }
  function list(): Account[] { return db.prepare('SELECT * FROM accounts ORDER BY createdAt, username').all().map(row => toAccount(row)!); }
  function create(input: { username: string; passwordHash: string }): Account {
    const username = normalizeUsername(input.username);
    if (!isPersonalUsername(username)) throw new Error('用户名须为 3–32 位字母、数字、点、下划线或连字符，且不能使用 admin/public');
    return db.transaction(() => {
      if (findByUsername(username)) throw new Error('用户名已存在');
      const count = db.prepare('SELECT COUNT(*) AS count FROM accounts').get() as { count: number };
      if (count.count >= maxAccounts) throw new Error(`个人账号数量已达到上限 ${maxAccounts}（含停用账号）`);
      const account: Account = { id: randomUUID(), username, passwordHash: input.passwordHash, disabled: false, sessionVersion: 1, createdAt: new Date().toISOString() };
      db.prepare('INSERT INTO accounts (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)')
        .run(account.id, username, account.passwordHash, account.createdAt);
      return account;
    }).immediate();
  }
  function setDisabled(id: string, disabled: boolean): boolean {
    return db.prepare('UPDATE accounts SET disabled = ?, sessionVersion = sessionVersion + 1 WHERE id = ?').run(disabled ? 1 : 0, id).changes > 0;
  }
  function setPasswordHash(id: string, passwordHash: string): boolean {
    return db.prepare('UPDATE accounts SET passwordHash = ?, sessionVersion = sessionVersion + 1 WHERE id = ?').run(passwordHash, id).changes > 0;
  }
  return { findById, findByUsername, list, create, setDisabled, setPasswordHash };
}
