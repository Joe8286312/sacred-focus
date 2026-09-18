import { createPrecedentCaseGateway } from '../../application/cases/precedentCaseGateway';
import { apiFetch } from './api';

/** 浏览器 HTTP 组合适配。 */
export const precedentCaseGateway = createPrecedentCaseGateway(apiFetch);
