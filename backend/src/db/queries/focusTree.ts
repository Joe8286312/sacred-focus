import { db } from '../connection.js';
import { createFocusTreeRepository } from '../../repositories/focusTreeRepository.js';

/** 兼容入口：实现已迁移至 repositories/focusTreeRepository。 */
const repository = createFocusTreeRepository(db);
export const upsertFocusNode = repository.upsertFocusNode;
export const getFullFocusTreeData = repository.getFullFocusTreeData;
