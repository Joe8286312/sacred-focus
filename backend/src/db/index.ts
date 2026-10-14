import { rootDb } from './connection.js';
import { createTables } from './schema.js';
import { migrateDatabase } from './migrations.js';
import { initializeMinimalState } from './seed.js';
import { createAccountTables } from '../repositories/accountRepository.js';

export function initDatabase() {
  createTables(rootDb);
  migrateDatabase(rootDb);
  initializeMinimalState(rootDb);
  createAccountTables(rootDb);
}

export * from './connection.js';
export * from './schema.js';
export * from './migrations.js';
export * from './revision.js';
export * from './maintenance.js';
export * from './dateUtils.js';
export * from './queries/focusTree.js';
export * from './queries/settlement.js';
export * from './seed.js';
