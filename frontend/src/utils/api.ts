import { router } from '../router';

export interface ApiRequestOptions extends RequestInit {
  expectedRevision?: number;
}

export async function apiFetch<T = any>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('sf_token') : null;
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include' // 自动携带 HttpOnly Cookie
  });

  // 1. 拦截 401 Unauthorized：未登录或凭据失效
  if (res.status === 401) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('sf_token');
    }
    const currentRoute = router.currentRoute.value;
    if (currentRoute && currentRoute.path !== '/login') {
      router.push({
        path: '/login',
        query: { redirect: currentRoute.fullPath }
      });
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || 'UNAUTHORIZED');
  }

  // 2. 拦截 409 Conflict：版本并发冲突 (OCC)
  if (res.status === 409) {
    const errData = await res.json().catch(() => ({}));
    const conflictError: any = new Error(errData.message || 'VERSION_CONFLICT');
    conflictError.status = 409;
    conflictError.details = errData;
    throw conflictError;
  }

  // 3. 拦截 429 Too Many Requests
  if (res.status === 429) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || '请求过于频繁，触发系统心流节流保护');
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || `HTTP ${res.status}`);
  }

  return res.json();
}
