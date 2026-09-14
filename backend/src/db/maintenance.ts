import { randomUUID } from 'crypto';
import { db } from './connection.js';
import { getSystemRevision } from './revision.js';

const MAINTENANCE_LOCK_KEY = 'maintenance_lock';
const MAINTENANCE_LOCK_TTL_MS = 15 * 60 * 1000;

export interface MaintenanceLease {
  ownerId: string;
  operation: string;
  expectedRevision: number;
  expiresAt: number;
}

export class MaintenanceInProgressError extends Error {
  constructor(public readonly expiresAt: number) {
    super('MAINTENANCE_IN_PROGRESS');
    this.name = 'MaintenanceInProgressError';
  }
}

export class RevisionPreconditionError extends Error {
  constructor(public readonly currentRevision: number) {
    super('VERSION_CONFLICT');
    this.name = 'RevisionPreconditionError';
  }
}

function readActiveLease(): MaintenanceLease | null {
  const row = db.prepare('SELECT value FROM system_meta WHERE key = ?').get(MAINTENANCE_LOCK_KEY) as { value: string } | undefined;
  if (!row) return null;

  try {
    const lease = JSON.parse(row.value) as MaintenanceLease;
    if (
      typeof lease.ownerId !== 'string' ||
      typeof lease.operation !== 'string' ||
      typeof lease.expectedRevision !== 'number' ||
      typeof lease.expiresAt !== 'number'
    ) {
      return null;
    }
    return lease.expiresAt > Date.now() ? lease : null;
  } catch {
    return null;
  }
}

export function getActiveMaintenanceLease(): MaintenanceLease | null {
  return readActiveLease();
}

export function acquireMaintenanceLease(operation: string, expectedRevision: number): MaintenanceLease {
  const acquireTx = db.transaction(() => {
    const activeLease = readActiveLease();
    if (activeLease) {
      throw new MaintenanceInProgressError(activeLease.expiresAt);
    }

    const currentRevision = getSystemRevision();
    if (expectedRevision !== currentRevision) {
      throw new RevisionPreconditionError(currentRevision);
    }

    const lease: MaintenanceLease = {
      ownerId: randomUUID(),
      operation,
      expectedRevision,
      expiresAt: Date.now() + MAINTENANCE_LOCK_TTL_MS
    };

    db.prepare(`
      INSERT INTO system_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(MAINTENANCE_LOCK_KEY, JSON.stringify(lease));

    return lease;
  });

  return acquireTx();
}

export function assertMaintenanceLease(lease: MaintenanceLease) {
  const activeLease = readActiveLease();
  if (!activeLease || activeLease.ownerId !== lease.ownerId) {
    throw new MaintenanceInProgressError(activeLease?.expiresAt ?? Date.now());
  }

  const currentRevision = getSystemRevision();
  if (currentRevision !== lease.expectedRevision) {
    throw new RevisionPreconditionError(currentRevision);
  }
}

export function releaseMaintenanceLease(lease: MaintenanceLease) {
  db.prepare(`
    DELETE FROM system_meta
    WHERE key = ? AND value = ?
  `).run(MAINTENANCE_LOCK_KEY, JSON.stringify(lease));
}

// 在恢复事务提交前再次核验 SQLite 外键完整性；任何异常都将使当前事务整体回滚。
export function assertForeignKeyIntegrity() {
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  if (violations.length > 0) {
    throw new Error(`FOREIGN_KEY_INTEGRITY_FAILED: ${JSON.stringify(violations.slice(0, 5))}`);
  }
}
