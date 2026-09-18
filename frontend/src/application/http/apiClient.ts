export interface ApiRequestOptions extends RequestInit {
  expectedRevision?: number;
}

export class ApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

export class ApiAuthenticationError extends ApiHttpError {
  readonly code = 'UNAUTHORIZED';

  constructor(message: string, details: unknown) {
    super(message, 401, details);
    this.name = 'ApiAuthenticationError';
  }
}

export interface ApiClientDependencies {
  fetchImpl?: typeof fetch;
  onUnauthorized?: (error: ApiAuthenticationError) => void;
}

function getErrorField(payload: unknown, field: 'message' | 'error'): unknown {
  if (typeof payload !== 'object' || payload === null || !(field in payload)) return undefined;
  return (payload as Record<string, unknown>)[field];
}

function getErrorMessage(payload: unknown, fallback: string, includeError = false): string {
  const candidates = includeError
    ? [getErrorField(payload, 'message'), getErrorField(payload, 'error')]
    : [getErrorField(payload, 'message')];
  const value = candidates.find(candidate => Boolean(candidate));
  return value === undefined ? fallback : String(value);
}

/** 纯 HTTP client：负责 Cookie、响应解析与结构化错误，不感知 Vue Router。 */
export function createApiClient({
  fetchImpl = fetch,
  onUnauthorized
}: ApiClientDependencies = {}) {
  async function apiFetch<T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetchImpl(url, { ...options, headers, credentials: 'include' });
    const rawText = await res.text();
    let parsedData: unknown = {};
    let errData: unknown = {};
    if (rawText) {
      try {
        parsedData = JSON.parse(rawText);
        errData = parsedData;
      } catch {
        errData = { message: rawText.length < 200 ? rawText : `HTTP ${res.status}` };
      }
    }

    if (res.status === 401) {
      const error = new ApiAuthenticationError(getErrorMessage(errData, 'UNAUTHORIZED'), errData);
      onUnauthorized?.(error);
      throw error;
    }
    if (res.status === 409) throw new ApiHttpError(getErrorMessage(errData, 'VERSION_CONFLICT'), 409, errData);
    if (res.status === 429) throw new ApiHttpError(getErrorMessage(errData, '请求过于频繁，触发系统心流节流保护'), 429, errData);
    if (!res.ok) throw new ApiHttpError(getErrorMessage(errData, `HTTP ${res.status}`, true), res.status, errData);

    return (parsedData === null ? {} : parsedData) as T;
  }

  return { apiFetch };
}
