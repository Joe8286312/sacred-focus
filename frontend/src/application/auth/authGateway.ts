export interface AuthResponseBody {
  message?: string;
  error?: string;
  isAuthenticated?: boolean;
  [key: string]: unknown;
}

export interface AuthLoginResponse {
  ok: boolean;
  body: AuthResponseBody;
}

export type AuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AuthGateway {
  login(password: string): Promise<AuthLoginResponse>;
  logout(): Promise<void>;
  getStatus(): Promise<boolean>;
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
  return {
    async login(password) {
      const response = await request('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }), credentials: 'include'
      });
      return { ok: response.ok, body: await readAuthResponse(response) };
    },
    async logout() {
      await request('/api/auth/logout', { method: 'POST', credentials: 'include' });
    },
    async getStatus() {
      const response = await request('/api/auth/status', { credentials: 'include' });
      if (!response.ok) return false;
      const body = await response.json() as AuthResponseBody;
      return Boolean(body.isAuthenticated);
    }
  };
}
