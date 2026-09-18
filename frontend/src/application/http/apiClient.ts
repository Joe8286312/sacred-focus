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

/** 纯 HTTP client：负责 Cookie、响应解析与结构化错误，不感知 Vue Router。 */
export function createApiClient({
  fetchImpl = fetch,
  onUnauthorized
}: ApiClientDependencies = {}) {
  async function apiFetch<T = any>(url: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetchImpl(url, { ...options, headers, credentials: 'include' });
    const rawText = await res.text();
    let parsedData: any = null;
    let errData: any = {};
    if (rawText) {
      try {
        parsedData = JSON.parse(rawText);
        errData = parsedData;
      } catch {
        errData = { message: rawText.length < 200 ? rawText : `HTTP ${res.status}` };
      }
    }

    if (res.status === 401) {
      const error = new ApiAuthenticationError(errData.message || 'UNAUTHORIZED', errData);
      onUnauthorized?.(error);
      throw error;
    }
    if (res.status === 409) throw new ApiHttpError(errData.message || 'VERSION_CONFLICT', 409, errData);
    if (res.status === 429) throw new ApiHttpError(errData.message || '请求过于频繁，触发系统心流节流保护', 429, errData);
    if (!res.ok) throw new ApiHttpError(errData.message || errData.error || `HTTP ${res.status}`, res.status, errData);

    return (parsedData !== null ? parsedData : ({} as any)) as T;
  }

  return { apiFetch };
}
