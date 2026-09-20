import { db } from './connection.js';
import { createTables } from './schema.js';
import { migrateDatabase } from './migrations.js';
import { initializeMinimalState } from './seed.js';

export function initDatabase() {
  createTables(db);
  migrateDatabase(db);
  initializeMinimalState(db);
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
