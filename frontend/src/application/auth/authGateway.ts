import type { AccountIdentity as AuthUser } from '../../types';
export type { AccountIdentity as AuthUser } from '../../types';

export interface AuthResponseBody {
  message?: string;
  error?: string;
  isAuthenticated?: boolean;
  user?: AuthUser;
  [key: string]: unknown;
}

export interface AuthLoginResponse {
  ok: boolean;
  body: AuthResponseBody;
}

export type AuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AuthGateway {
  login(password: string, username?: string): Promise<AuthLoginResponse>;
  logout(): Promise<void>;
  getStatus(): Promise<boolean>;
  getSession(): Promise<AuthResponseBody>;
}

/** 保留登录接口的历史容错文案，避免非 JSON 反向代理错误泄露到底层调用方。 */
export async function readAuthResponse(res: Response): Promise<AuthResponseBody> {
  const rawText = await res.text();
  if (!rawText.trim()) {
    return { message: `登录服务返回空响应（HTTP ${res.status}）。请确认本机后端正在运行。` };
  }
  try {
    return JSON.parse(rawText) as AuthResponseBody;
  } catch {
    return { message: `登录服务返回了无法识别的响应（HTTP ${res.status}）。请检查后端终端日志。` };
  }
}

/** Cookie 会话 HTTP 协议的纯适配规则，store 负责认证状态与导航编排。 */
export function createAuthGateway(request: AuthFetch): AuthGateway {
  async function getSession(): Promise<AuthResponseBody> {
    const response = await request('/api/auth/status', { credentials: 'include', cache: 'no-store' });
    if (response.status === 401) return { isAuthenticated: false };
    if (!response.ok) throw new Error(`账号状态暂时无法加载（HTTP ${response.status}）`);
    return response.json() as Promise<AuthResponseBody>;
  }

  return {
    async login(password, username) {
      const response = await request('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(username === undefined ? { password } : { username, password }), credentials: 'include'
      });
      return { ok: response.ok, body: await readAuthResponse(response) };
    },
    async logout() {
      const response = await request('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('退出失败，请稍后重试');
    },
    async getStatus() {
      try {
        const body = await getSession();
        return Boolean(body.isAuthenticated);
      } catch {
        return false;
      }
    },
    getSession
  };
}
