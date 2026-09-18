import { createApiClient, type ApiAuthenticationError } from '../../application/http/apiClient';

export type { ApiRequestOptions } from '../../application/http/apiClient';
export { ApiAuthenticationError, ApiHttpError } from '../../application/http/apiClient';

let unauthorizedHandler: ((error: ApiAuthenticationError) => void) | undefined;

const client = createApiClient({ onUnauthorized: error => unauthorizedHandler?.(error) });

/** 浏览器组合根注册导航策略；HTTP 层本身不反向依赖 router。 */
export function setUnauthorizedHandler(handler: ((error: ApiAuthenticationError) => void) | undefined) {
  unauthorizedHandler = handler;
}

export const apiFetch = client.apiFetch;
