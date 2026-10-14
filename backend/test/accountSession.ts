import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createTestHarness } from './testHarness.js';

/** Test browser session isolation without touching deployment accounts or a real browser. */
async function main() {
  const { test, testAsync, getSummary } = createTestHarness();
  const previousGlobals = new Map<string, PropertyDescriptor | undefined>();
  const storage = new Map<string, string>();
  const browserWindow = new EventTarget();
  const navigations: string[] = [];
  let handleFetch: typeof fetch = async () => { throw new Error('Unexpected request'); };

  function mockGlobal(name: string, value: unknown) {
    previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  mockGlobal('window', browserWindow);
  mockGlobal('location', {
    pathname: '/tree', search: '?view=list', hash: '', origin: 'http://localhost',
    replace: (url: string) => navigations.push(url)
  });
  mockGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  // apiClient captures fetch at composition time; the mutable delegate supplies each scenario.
  mockGlobal('fetch', ((input, init) => handleFetch(input, init)) as typeof fetch);

  try {
    const session = await import('../../frontend/src/platform/browser/accountSession.ts');
    const { apiFetch, setUnauthorizedHandler } = await import('../../frontend/src/platform/browser/api.ts');
    const { ApiAuthenticationError } = await import('../../frontend/src/application/http/apiClient.ts');
    const { useAuthStore } = await import('../../frontend/src/stores/auth.ts');
    const frontendRequire = createRequire(path.resolve(__dirname, '../../frontend/package.json'));
    const { createPinia } = frontendRequire('pinia');
    const auth = useAuthStore(createPinia());
    const transitions: boolean[] = [];
    browserWindow.addEventListener(session.ACCOUNT_TRANSITION_EVENT, event => {
      transitions.push((event as CustomEvent<boolean>).detail);
    });

    test('页面身份固定，账号相关浏览器存储按账号隔离', () => {
      assert.throws(() => session.accountStorageKey('active-timer'), /账号状态尚未加载/);
      assert.equal(session.setBrowserAccountId('friend/alpha'), true);
      assert.equal(session.setBrowserAccountId('friend/alpha'), true);
      assert.equal(session.setBrowserAccountId('public'), false);
      assert.equal(session.getBrowserAccountId(), 'friend/alpha');
      assert.equal(session.accountStorageKey('active-timer'), 'active-timer:friend%2Falpha');
      assert.equal(session.accountStorageKey('dismissedResetAlertDate'), 'dismissedResetAlertDate:friend%2Falpha');
    });

    await testAsync('业务请求绑定页面账号与 Cookie，并禁止账号数据缓存', async () => {
      let received: RequestInit | undefined;
      handleFetch = async (_input, init) => {
        received = init;
        return new Response(JSON.stringify({ name: 'alpha private data' }));
      };
      assert.deepEqual(await apiFetch('/api/focus-tree', {
        method: 'PUT', headers: { 'X-SF-Account-Id': 'public' }, body: JSON.stringify({ nodes: [] })
      }), { name: 'alpha private data' });
      assert.equal(new Headers(received?.headers).get('X-SF-Account-Id'), 'friend/alpha');
      assert.equal(received?.credentials, 'include');
      assert.equal(received?.cache, 'no-store');
    });

    await testAsync('切换账号取消进行中的请求，取消切换后也不能接收旧响应', async () => {
      let requestSignal: AbortSignal | null | undefined;
      let finishFetch: ((response: Response) => void) | undefined;
      handleFetch = (_input, init) => {
        requestSignal = init?.signal;
        // Deliberately ignore abort to simulate a response that was already in transit.
        return new Promise(resolve => { finishFetch = resolve; });
      };
      const staleRequest = apiFetch('/api/focus-tree');
      const rejected = assert.rejects(staleRequest, error => error instanceof DOMException && error.name === 'AbortError');
      session.beginAccountTransition();
      assert.equal(requestSignal?.aborted, true);
      await assert.rejects(apiFetch('/api/sacred-seat/config'), error => error instanceof DOMException && error.name === 'AbortError');
      session.cancelAccountTransition();
      finishFetch!(new Response(JSON.stringify({ name: 'obsolete data' })));
      await rejected;
      assert.equal(session.getBrowserAccountId(), 'friend/alpha');
      assert.deepEqual(transitions, [true, false]);
    });

    await testAsync('旧请求的认证失败不会干扰账号切换后的页面', async () => {
      let finishFetch: ((response: Response) => void) | undefined;
      let unauthorizedCount = 0;
      setUnauthorizedHandler(() => { unauthorizedCount += 1; });
      handleFetch = () => new Promise(resolve => { finishFetch = resolve; });
      const oldRequest = apiFetch('/api/focus-tree');
      const rejected = assert.rejects(oldRequest, error => error instanceof DOMException && error.name === 'AbortError');
      session.beginAccountTransition();
      session.cancelAccountTransition();
      finishFetch!(new Response(JSON.stringify({ error: 'ACCOUNT_CHANGED' }), { status: 401 }));
      await rejected;
      assert.equal(unauthorizedCount, 0);

      handleFetch = async () => new Response(JSON.stringify({ error: 'ACCOUNT_CHANGED' }), { status: 401 });
      await assert.rejects(apiFetch('/api/focus-tree'), error => error instanceof ApiAuthenticationError);
      assert.equal(unauthorizedCount, 1);
      setUnauthorizedHandler(undefined);
    });

    await testAsync('登录失败恢复当前账号请求，网络故障保留当前身份', async () => {
      handleFetch = async () => new Response(JSON.stringify({
        isAuthenticated: true, user: { id: 'friend/alpha', username: 'alpha', role: 'user' }
      }));
      assert.equal(await auth.checkAuthStatus(), true);

      handleFetch = async () => new Response(JSON.stringify({ message: '用户名或密码错误' }), { status: 401 });
      assert.equal(await auth.login('wrong-password', 'bob'), false);
      assert.equal(session.isAccountTransitioning(), false);
      assert.equal(auth.user?.id, 'friend/alpha');
      assert.equal(auth.authError, '用户名或密码错误');
      assert.equal(storage.has(session.ACCOUNT_CHANGE_KEY), false);

      handleFetch = async () => { throw new Error('offline'); };
      assert.equal(await auth.checkAuthStatus(), true);
      assert.equal(auth.user?.id, 'friend/alpha');
      handleFetch = async () => new Response('upstream unavailable', { status: 503 });
      assert.equal(await auth.checkAuthStatus(), true);
      assert.equal(auth.user?.id, 'friend/alpha');

      handleFetch = async (_input, init) => {
        assert.equal(new Headers(init?.headers).get('X-SF-Account-Id'), 'friend/alpha');
        assert.equal(init?.signal?.aborted, false);
        return new Response(JSON.stringify({ currentStreak: 7 }));
      };
      assert.deepEqual(await apiFetch('/api/sacred-seat/config'), { currentStreak: 7 });
    });

    test('跨标签页广播不保存账号凭证，重载前冻结旧页面', () => {
      session.announceAccountChange();
      assert(storage.get(session.ACCOUNT_CHANGE_KEY));
      assert.equal(storage.get('sf_token'), undefined);
      session.reloadAccountSession('/seat');
      assert.equal(session.isAccountTransitioning(), true);
      assert.deepEqual(navigations, ['/seat']);
    });
  } finally {
    for (const [name, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }

  const { passedCount, failedCount } = getSummary();
  console.log(`Frontend account lifecycle: ${passedCount} passed, ${failedCount} failed`);
  if (failedCount) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
