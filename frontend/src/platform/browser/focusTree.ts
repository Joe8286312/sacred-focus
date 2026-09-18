import { createFocusTreeGateway } from '../../application/focusTree/focusTreeGateway';
import { apiFetch } from '../../utils/api';

/** 浏览器 HTTP 组合适配。 */
export const focusTreeGateway = createFocusTreeGateway(apiFetch);
