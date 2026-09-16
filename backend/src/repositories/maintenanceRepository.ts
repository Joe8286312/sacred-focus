import { randomUUID } from 'crypto';
import type { SqliteDatabasePort } from './databasePort.js';
import { createSystemMetaRepository } from './systemMetaRepository.js';

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

export interface MaintenanceRepository {
  getActiveMaintenanceLease(): MaintenanceLease | null;
  acquireMaintenanceLease(operation: string, expectedRevision: number): MaintenanceLease;
  assertMaintenanceLease(lease: MaintenanceLease): void;
  releaseMaintenanceLease(lease: MaintenanceLease): void;
  assertForeignKeyIntegrity(): void;
}

export interface MaintenanceRepositoryOptions {
  now?: () => number;
  createOwnerId?: () => string;
}

/** 维护租约与恢复前外键校验的数据访问边界。 */
export function createMaintenanceRepository(
  db: SqliteDatabasePort,
  { now = Date.now, createOwnerId = randomUUID }: MaintenanceRepositoryOptions = {}
): MaintenanceRepository {
  const systemMeta = createSystemMetaRepository(db);

  function readActiveLease(): MaintenanceLease | null {
    const value = systemMeta.getValue(MAINTENANCE_LOCK_KEY);
    if (value === undefined) return null;

    try {
      const lease = JSON.parse(value) as MaintenanceLease;
      if (
        typeof lease.ownerId !== 'string' ||
        typeof lease.operation !== 'string' ||
        typeof lease.expectedRevision !== 'number' ||
        typeof lease.expiresAt !== 'number'
      ) {
        return null;
      }
      return lease.expiresAt > now() ? lease : null;
    } catch {
      return null;
    }
  }

  function getActiveMaintenanceLease(): MaintenanceLease | null {
    return readActiveLease();
  }

  function acquireMaintenanceLease(operation: string, expectedRevision: number): MaintenanceLease {
    const acquireTx = db.transaction(() => {
      const activeLease = readActiveLease();
      if (activeLease) {
        throw new MaintenanceInProgressError(activeLease.expiresAt);
      }

      const currentRevision = systemMeta.getSystemRevision();
      if (expectedRevision !== currentRevision) {
        throw new RevisionPreconditionError(currentRevision);
      }

      const lease: MaintenanceLease = {
        ownerId: createOwnerId(),
        operation,
        expectedRevision,
        expiresAt: now() + MAINTENANCE_LOCK_TTL_MS
      };

      systemMeta.setValue(MAINTENANCE_LOCK_KEY, JSON.stringify(lease));
      return lease;
    });

    return acquireTx();
  }

  function assertMaintenanceLease(lease: MaintenanceLease): void {
    const activeLease = readActiveLease();
    if (!activeLease || activeLease.ownerId !== lease.ownerId) {
      throw new MaintenanceInProgressError(activeLease?.expiresAt ?? now());
    }

    const currentRevision = systemMeta.getSystemRevision();
    if (currentRevision !== lease.expectedRevision) {
      throw new RevisionPreconditionError(currentRevision);
    }
  }

  function releaseMaintenanceLease(lease: MaintenanceLease): void {
    db.prepare(`
      DELETE FROM system_meta
      WHERE key = ? AND value = ?
    `).run(MAINTENANCE_LOCK_KEY, JSON.stringify(lease));
  }

  function assertForeignKeyIntegrity(): void {
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length > 0) {
      throw new Error(`FOREIGN_KEY_INTEGRITY_FAILED: ${JSON.stringify(violations.slice(0, 5))}`);
    }
  }

  return {
    getActiveMaintenanceLease,
    acquireMaintenanceLease,
    assertMaintenanceLease,
    releaseMaintenanceLease,
    assertForeignKeyIntegrity
  };
}
