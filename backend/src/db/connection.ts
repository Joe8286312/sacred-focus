import Database, { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import { config } from '../config.js';

// 确保数据库目录存在
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

export const db: DatabaseType = new Database(config.dbPath);

// 开启高性能 WAL 模式与外键约束
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
