import { createApiClient, ApiAuthenticationError } from '../../application/http/apiClient';
import type { ApiRequestOptions } from '../../application/http/apiClient';
import { createAccountRequest } from './accountSession';

export type { ApiRequestOptions } from '../../application/http/apiClient';
export { ApiAuthenticationError, ApiHttpError } from '../../application/http/apiClient';

let unauthorizedHandler: ((error: ApiAuthenticationError) => void) | undefined;

const client = createApiClient();

/** 浏览器组合根注册导航策略；HTTP 层本身不反向依赖 router。 */
export function setUnauthorizedHandler(handler: ((error: ApiAuthenticationError) => void) | undefined) {
  unauthorizedHandler = handler;
}

export async function apiFetch<T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const session = createAccountRequest(options.signal);
  const headers = new Headers(options.headers);
  headers.set('X-SF-Account-Id', session.accountId);
  try {
    const result = await client.apiFetch<T>(url, { ...options, headers, signal: session.signal, cache: 'no-store' });
    session.ensureCurrent();
    return result;
  } catch (error) {
    // 被旧会话取消的错误也不能触发新会话的导航或重试。
    session.ensureCurrent();
    if (error instanceof ApiAuthenticationError) unauthorizedHandler?.(error);
    throw error;
  } finally {
    session.dispose();
  }
}
