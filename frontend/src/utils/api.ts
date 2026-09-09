import { router } from '../router';

export interface ApiRequestOptions extends RequestInit {
  expectedRevision?: number;
}

export async function apiFetch<T = any>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include' // 自动携带 HttpOnly Cookie，杜绝 XSS 读取令牌
  });

  const rawText = await res.text();
  let errData: any = {};
  let parsedData: any = null;
  if (rawText) {
    try {
      parsedData = JSON.parse(rawText);
      errData = parsedData;
    } catch {
      errData = { message: rawText.length < 200 ? rawText : `HTTP ${res.status}` };
    }
  }

  // 1. 拦截 401 Unauthorized：未登录或凭据失效
  if (res.status === 401) {
    const currentRoute = router.currentRoute.value;
    if (currentRoute && currentRoute.path !== '/login') {
      router.push({
        path: '/login',
        query: { redirect: currentRoute.fullPath }
      });
    }

    throw new Error(errData.message || 'UNAUTHORIZED');
  }

  // 2. 拦截 409 Conflict：版本并发冲突 (OCC)
  if (res.status === 409) {
    const conflictError: any = new Error(errData.message || 'VERSION_CONFLICT');
    conflictError.status = 409;
    conflictError.details = errData;
    throw conflictError;
  }

  // 3. 拦截 429 Too Many Requests
  if (res.status === 429) {
    throw new Error(errData.message || '请求过于频繁，触发系统心流节流保护');
  }

  if (!res.ok) {
    throw new Error(errData.message || errData.error || `HTTP ${res.status}`);
  }

  return (parsedData !== null ? parsedData : ({} as any)) as T;
}
