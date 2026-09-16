import { db } from './connection.js';
import { createSystemMetaRepository } from '../repositories/systemMetaRepository.js';

/** 兼容入口：revision 的 SQLite 访问已收敛至 systemMetaRepository。 */
const repository = createSystemMetaRepository(db);

export const getSystemRevision = repository.getSystemRevision;

export function incrementSystemRevision(): number {
  return repository.incrementSystemRevision(new Date().toISOString());
}
