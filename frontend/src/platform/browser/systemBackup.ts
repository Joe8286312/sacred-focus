import { createSystemBackupGateway } from '../../application/systemBackup/systemBackupGateway';
import { apiFetch } from './api';

/** 浏览器 HTTP 组合适配。 */
export const systemBackupGateway = createSystemBackupGateway(apiFetch);
