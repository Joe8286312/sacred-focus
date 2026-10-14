import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { createTestHarness } from './testHarness.js';
import type { FocusNode, FocusTreeData, PrecedentCase } from '../src/types.js';

interface Actor {
  id: string;
  username: string;
  cookie?: string;
}

interface HttpResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

const environmentKeys = ['DATA_DIR', 'NODE_ENV', 'JWT_SECRET', 'ADMIN_PASSWORD', 'ADMIN_PASSWORD_HASH', 'APP_ACCESS_TOKEN',
  'MAX_PERSONAL_ACCOUNTS', 'PUBLIC_DATA_LIMIT_MB', 'PERSONAL_DATA_LIMIT_MB'] as const;

function makeTree(owner: string): FocusTreeData {
  const node: FocusNode = {
    id: 'shared-node', code: 'N1', name: `${owner} node`, groupId: 'shared-group',
    triggerTime: null, triggerScene: '全天候', hasExactTime: false, timeValueMinutes: null,
    level: 0, maxLevel: 1, isLit: false, isFrozen: false, position: { x: 0, y: 0 },
    specCard: { instruction: '', failCondition: '', benefitMechanism: '' }
  };
  return {
    nodes: [node], edges: [],
    groups: [{ id: 'shared-group', name: `${owner} group`, themeColor: '#3b82f6', position: { x: 0, y: 0 }, size: { width: 300, height: 200 } }],
    labels: [{ id: 'shared-label', text: `${owner} label`, position: { x: 10, y: 20 } }]
  };
}

function makeCase(owner: string, id = 'shared-case'): PrecedentCase {
  return { id, date: '2026-10-14', behavior: `${owner} behavior`, verdict: 'ALLOW',
    boundaryCondition: `${owner} boundary`, createdAt: '2026-10-14T08:00:00.000Z' };
}

function makeLog(owner: string) {
  return { id: 'shared-log', type: 'FOCUS', startTime: '2026-10-14T08:00:00.000Z',
    endTime: '2026-10-14T08:01:00.000Z', targetDurationMinutes: 1,
    actualDurationSeconds: 60, status: 'REGRET', focusContent: `${owner} focus`, failureReason: null, note: owner };
}

async function main() {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'sacred-focus-multiuser-'));
  const savedEnvironment = new Map(environmentKeys.map(key => [key, process.env[key]]));
  const secret = `multiuser-tests-${randomUUID()}-${randomUUID()}`;
  const adminPassword = 'IntegrationAdmin!42';
  const personalPassword = 'IntegrationFriend!42';
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = secret;
  process.env.ADMIN_PASSWORD = adminPassword;
  process.env.ADMIN_PASSWORD_HASH = '';
  process.env.APP_ACCESS_TOKEN = 'integration-static-admin-token';
  process.env.MAX_PERSONAL_ACCOUNTS = '20';
  process.env.PUBLIC_DATA_LIMIT_MB = '2';
  process.env.PERSONAL_DATA_LIMIT_MB = '4';

  let server: Server | undefined;
  let databaseModule: typeof import('../src/db.js') | undefined;
  const { testAsync, getSummary } = createTestHarness();

  try {
    // Config/database imports must happen after DATA_DIR is isolated from deployment data.
    databaseModule = await import('../src/db.js');
    const database = databaseModule;
    database.initDatabase();
    const { createAccountRepository } = await import('../src/repositories/accountRepository.js');
    const { createAuthRepository } = await import('../src/repositories/authRepository.js');
    const { createAuthService } = await import('../src/services/authService.js');
    const { createApp } = await import('../src/app.js');
    const accounts = createAccountRepository(database.rootDb);
    const hash = await bcrypt.hash(personalPassword, 4);
    const aliceAccount = accounts.create({ username: 'alice', passwordHash: hash });
    const bobAccount = accounts.create({ username: 'bob', passwordHash: hash });

    // This is existing owner data, deliberately inserted in the legacy database before any visitor request.
    database.rootDb.prepare('INSERT INTO focus_labels (id, text, positionX, positionY) VALUES (?, ?, 0, 0)')
      .run('legacy-private-label', 'legacy owner private content');
    database.rootDb.prepare('INSERT INTO precedent_cases (id, date, behavior, verdict, boundaryCondition, createdAt) VALUES (@id, @date, @behavior, @verdict, @boundaryCondition, @createdAt)')
      .run(makeCase('legacy owner', 'legacy-private-case'));

    const app = createApp({ frontendDist: false, reportError: (message, error) => console.error(message, error) });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => { server!.once('listening', resolve); server!.once('error', reject); });
    const address = server.address();
    assert(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    async function request<T = any>(route: string, actor?: Actor, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<HttpResult<T>> {
      const headers: Record<string, string> = { ...options.headers };
      if (actor?.cookie) headers.Cookie = actor.cookie;
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(`${baseUrl}/api${route}`, {
        method: options.method || 'GET', headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      const text = await response.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = text; }
      return { status: response.status, body: body as T, headers: response.headers };
    }

    async function login(username: string | undefined, password: string, expectedId: string): Promise<Actor> {
      const response = await request('/auth/login', undefined, { method: 'POST', body: { username, password } });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      assert(cookie?.startsWith('sf_token='), 'login must issue an HttpOnly session cookie');
      assert.match(response.headers.get('set-cookie') || '', /HttpOnly/i);
      const actor = { id: expectedId, username: username || 'admin', cookie };
      const status = await request('/auth/status', actor);
      assert.equal(status.body.isAuthenticated, true);
      assert.equal(status.body.user.id, expectedId);
      assert.equal(status.body.user.username, actor.username);
      return actor;
    }

    const guest: Actor = { id: 'public', username: 'public' };
    const admin = await login(undefined, adminPassword, 'admin');
    let alice = await login('alice', personalPassword, aliceAccount.id);
    let bob = await login('bob', personalPassword, bobAccount.id);
    const actors = [guest, admin, alice, bob];
    async function revision(actor: Actor): Promise<number> {
      const response = await request('/sync/status', actor);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response.body.revision;
    }
    async function tree(actor: Actor) {
      const response = await request<FocusTreeData & { revision: number }>('/focus-tree', actor);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response.body;
    }
    async function saveTree(actor: Actor, owner: string, expectedRevision = undefined as number | undefined) {
      const response = await request('/focus-tree', actor, { method: 'PUT', body: { ...makeTree(owner), expectedRevision: expectedRevision ?? await revision(actor) } });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response.body;
    }

    console.log('\nSacred Focus 多用户隔离与会话集成测试');

    await testAsync('未登录进入公共账户，所有访客共享它且无法读取旧管理员数据', async () => {
      const status = await request('/auth/status');
      assert.equal(status.body.isAuthenticated, true);
      assert.deepEqual(status.body.user, { id: 'public', username: 'public', role: 'public' });
      const visitorTree = await tree(guest);
      assert.deepEqual(visitorTree.nodes, []);
      assert.deepEqual(visitorTree.labels, []);
      const backup = await request('/system/export');
      assert.equal(backup.status, 200);
      assert(!JSON.stringify(backup.body).includes('legacy owner'));
      const ownerTree = await tree(admin);
      assert.equal(ownerTree.labels?.[0].text, 'legacy owner private content');
      const cases = await request('/cases');
      assert.deepEqual(cases.body, []);
      const spoofed = await request('/focus-tree', guest, { headers: { 'X-Account-Id': alice.id, 'X-User-Id': 'admin' } });
      assert.deepEqual(spoofed.body.labels, []);
    });

    await testAsync('没有开放注册入口，保留账户名称不可创建，账号名重复不可创建', async () => {
      const registration = await request('/auth/register', guest, { method: 'POST', body: { username: 'intruder', password: personalPassword } });
      assert.equal(registration.status, 404);
      assert.throws(() => accounts.create({ username: 'admin', passwordHash: hash }));
      assert.throws(() => accounts.create({ username: 'public', passwordHash: hash }));
      assert.throws(() => accounts.create({ username: 'ALICE', passwordHash: hash }));
      const limitedAccounts = createAccountRepository(database.rootDb, { maxAccounts: 2 });
      assert.throws(() => limitedAccounts.create({ username: 'third-account', passwordHash: hash }), /上限/);
      assert.equal(accounts.list().length, 2);
      assert.equal((await request('/auth/login', undefined, { method: 'POST', body: { username: 'public', password: personalPassword } })).status, 401);
      assert.equal((await request('/auth/login', undefined, { method: 'POST', body: { username: 'unknown', password: personalPassword } })).status, 401);
    });

    await testAsync('无效 Cookie/JWT 拒绝业务请求，状态探针回退公共账户，旧管理员 JWT 保持兼容', async () => {
      const invalid = { id: 'invalid', username: 'invalid', cookie: 'sf_token=invalid-token' };
      assert.equal((await request('/focus-tree', invalid)).status, 401);
      assert.equal((await request('/sync/status', invalid)).status, 401);
      const mismatched = await request('/focus-tree', alice, { method: 'PUT', headers: { 'X-SF-Account-Id': bob.id }, body: { ...makeTree('wrong tab'), expectedRevision: await revision(alice) } });
      assert.equal(mismatched.status, 401);
      assert.equal(mismatched.body.error, 'ACCOUNT_CHANGED');
      assert.equal((await request('/sync/status', alice, { headers: { 'X-SF-Account-Id': 'public' } })).status, 401);
      const status = await request('/auth/status', invalid);
      assert.equal(status.body.user.id, 'public');
      assert.match(status.headers.get('set-cookie') || '', /sf_token=;/, 'status fallback must clear the invalid browser cookie');
      assert.match(status.headers.get('cache-control') || '', /no-store/i, 'account status must not be cached');
      const legacy = jwt.sign({ role: 'admin', jti: randomUUID() }, secret, { expiresIn: '1h' });
      const legacyStatus = await request('/auth/status', undefined, { headers: { Authorization: `Bearer ${legacy}` } });
      assert.equal(legacyStatus.body.user.id, 'admin');
      assert.equal(legacyStatus.body.user.username, 'admin');
      const legacyRead = await request('/focus-tree', undefined, { headers: { Authorization: `Bearer ${legacy}` } });
      assert.equal(legacyRead.body.labels[0].text, 'legacy owner private content');
      const staticStatus = await request('/auth/status', undefined, { headers: { 'X-Access-Token': process.env.APP_ACCESS_TOKEN! } });
      assert.equal(staticStatus.body.user.id, 'admin');
      const missingAccount = jwt.sign({ role: 'user', id: randomUUID(), username: 'missing', sessionVersion: 1 }, secret, { expiresIn: '1h' });
      assert.equal((await request('/focus-tree', undefined, { headers: { Authorization: `Bearer ${missingAccount}` } })).status, 401);
    });

    await testAsync('UTF-8 密码超过 bcrypt 的 72 字节上限时，比较密码之前拒绝', async () => {
      let comparisons = 0;
      const service = createAuthService({ authRepository: createAuthRepository(database.rootDb), accountRepository: accounts,
        jwtSecret: secret, initialAdminPassword: adminPassword,
        comparePassword: async () => { comparisons++; return true; } });
      assert.equal(await service.login('密'.repeat(25), 'alice'), undefined);
      assert.equal(await service.login('x'.repeat(73), 'admin'), undefined);
      assert.equal(comparisons, 0);
      const response = await request('/auth/login', undefined, { method: 'POST', body: { username: 'alice', password: '密'.repeat(25) } });
      assert.equal(response.status, 400);
    });

    await testAsync('并发账户可以使用相同节点/分组/标签/判例/日志 ID，数据和导出互相隔离', async () => {
      await Promise.all(actors.map(async actor => {
        await tree(actor); // Finish this account's first daily settlement before optimistic writes.
        await saveTree(actor, actor.username);
        const caseResponse = await request('/cases', actor, { method: 'POST', body: makeCase(actor.username) });
        assert.equal(caseResponse.status, 201, JSON.stringify(caseResponse.body));
        const logResponse = await request('/sacred-seat/logs', actor, { method: 'POST', body: makeLog(actor.username) });
        assert.equal(logResponse.status, 201, JSON.stringify(logResponse.body));
        const config = await request('/sacred-seat/config', actor, { method: 'PUT', body: { sacredToken: `${actor.username} token` } });
        assert.equal(config.status, 200, JSON.stringify(config.body));
      }));
      await Promise.all(actors.map(async actor => {
        const [data, backup, cases, logs, config] = await Promise.all([tree(actor), request('/system/export', actor), request('/cases', actor), request('/sacred-seat/logs', actor), request('/sacred-seat/config', actor)]);
        assert.equal(data.nodes[0].name, `${actor.username} node`);
        assert.equal(data.groups[0].name, `${actor.username} group`);
        assert.equal(data.labels?.[0].text, `${actor.username} label`);
        assert.equal(backup.body.focusTree.nodes[0].name, `${actor.username} node`);
        assert.equal(cases.body.find((item: PrecedentCase) => item.id === 'shared-case').behavior, `${actor.username} behavior`);
        assert.equal(logs.body[0].focusContent, `${actor.username} focus`);
        assert.equal(config.body.sacredToken, `${actor.username} token`);
      }));
      assert.equal((await tree({ id: 'public', username: 'another visitor' })).labels?.[0].text, 'public label');
    });

    await testAsync('异步交错数据库上下文保持当前账户，嵌套上下文退出后恢复外层账户', async () => {
      await Promise.all(actors.map(actor => database.runWithAccountDatabase(actor.id, async () => {
        const accountDir = database.getAccountDataDir();
        assert.equal(accountDir, actor.id === 'admin' ? dataDir : path.join(dataDir, 'accounts', actor.id));
        for (let index = 0; index < 4; index++) {
          await delay(index + 1);
          const row = database.db.prepare('SELECT text FROM focus_labels WHERE id = ?').get('shared-label') as { text: string };
          assert.equal(row.text, `${actor.username} label`);
          assert.equal(database.getAccountDataDir(), accountDir);
        }
      })));
      database.runWithAccountDatabase(alice.id, () => {
        database.runWithAccountDatabase(bob.id, () => assert.equal(database.getAccountDataDir(), path.join(dataDir, 'accounts', bob.id)));
        assert.equal(database.getAccountDataDir(), path.join(dataDir, 'accounts', alice.id));
      });
    });

    await testAsync('乐观版本号按账户独立递增，一个账户的更新不使另一账户版本过期', async () => {
      const before = await Promise.all(actors.map(revision));
      await saveTree(alice, 'alice revision', before[2]);
      const stale = await request('/focus-tree', alice, { method: 'PUT', body: { ...makeTree('stale'), expectedRevision: before[2] } });
      assert.equal(stale.status, 409);
      assert.equal(await revision(guest), before[0]);
      assert.equal(await revision(admin), before[1]);
      assert.equal(await revision(bob), before[3]);
      await saveTree(bob, 'bob revision', before[3]);
      await saveTree(alice, 'alice');
      await saveTree(bob, 'bob');
    });

    await testAsync('维护租约只冻结当前账户写入，公共账户维护期间仍可登录', async () => {
      const lease = database.runWithAccountDatabase(alice.id, () => database.acquireMaintenanceLease('integration-lock', database.getSystemRevision()));
      try {
        assert.equal((await request('/cases', alice, { method: 'POST', body: makeCase('locked', 'blocked-case') })).status, 503);
        const otherWrites = await Promise.all([guest, admin, bob].map(actor => request('/cases', actor, { method: 'POST', body: makeCase(actor.username, 'during-other-maintenance') })));
        otherWrites.forEach(response => assert.equal(response.status, 201, JSON.stringify(response.body)));
      } finally {
        database.runWithAccountDatabase(alice.id, () => database.releaseMaintenanceLease(lease));
      }
      const publicLease = database.runWithAccountDatabase('public', () => database.acquireMaintenanceLease('integration-public-lock', database.getSystemRevision()));
      try {
        assert.equal((await request('/auth/login', undefined, { method: 'POST', body: { username: 'bob', password: personalPassword } })).status, 200);
      } finally {
        database.runWithAccountDatabase('public', () => database.releaseMaintenanceLease(publicLease));
      }
    });

    await testAsync('快照和回滚按账户隔离，即使同一个槽位也只能恢复自己的画布', async () => {
      const snapshots = await Promise.all([alice, bob].map(async actor => request('/evolution/snapshot', actor, {
        method: 'POST', body: { expectedRevision: await revision(actor), changelogNotes: `${actor.username} snapshot`, isMajor: false }
      })));
      snapshots.forEach(response => assert.equal(response.status, 201, JSON.stringify(response.body)));
      assert.equal(snapshots[0].body.slotIndex, snapshots[1].body.slotIndex);
      await Promise.all([alice, bob].map(actor => saveTree(actor, `${actor.username} changed`)));
      const rollback = await request('/evolution/rollback', alice, { method: 'POST', body: { expectedRevision: await revision(alice), targetSlotIndex: snapshots[0].body.slotIndex } });
      assert.equal(rollback.status, 200, JSON.stringify(rollback.body));
      assert.equal((await tree(alice)).labels?.[0].text, 'alice label');
      assert.equal((await tree(alice)).nodes[0].name, 'alice node');
      assert.equal((await tree(bob)).labels?.[0].text, 'bob changed label');
      assert.equal((await tree(bob)).nodes[0].name, 'bob changed node');
      await saveTree(bob, 'bob');
    });

    await testAsync('公共账户不能执行整机恢复，个人账户可并发恢复且热备目录及备份内容独立', async () => {
      const denied = await request('/system/import', guest, { method: 'POST', body: { focusTree: makeTree('denied'), expectedRevision: await revision(guest) } });
      assert.equal(denied.status, 403);
      for (const route of ['/system/import/', '/SYSTEM/IMPORT']) {
        assert.equal((await request(route, guest, { method: 'POST', body: {} })).status, 403);
      }
      const guestBefore = await tree(guest);
      const adminBefore = await tree(admin);
      const imports = await Promise.all([alice, bob].map(async actor => {
        const backup = await request('/system/export', actor);
        return { actor, body: { ...backup.body, focusTree: makeTree(`${actor.username} restored`), liveTree: makeTree(`${actor.username} restored`), expectedRevision: await revision(actor) } };
      }));
      const responses = await Promise.all([
        ...imports.map(({ actor, body }) => request('/system/import', actor, { method: 'POST', body })),
        request('/cases', guest, { method: 'POST', body: makeCase('public', 'concurrent-import') })
      ]);
      responses.slice(0, 2).forEach(response => assert.equal(response.status, 200, JSON.stringify(response.body)));
      assert.equal(responses[2].status, 201);
      for (const actor of [alice, bob]) {
        const restored = await tree(actor);
        assert.equal(restored.labels?.[0].text, `${actor.username} restored label`);
        assert.equal(restored.nodes[0].name, `${actor.username} restored node`);
        const directory = path.join(dataDir, 'accounts', actor.id);
        const files = (await readdir(directory)).filter(name => /^app_pre_import_.*\.db$/.test(name));
        assert.equal(files.length, 1);
        const backupDb = new Database(path.join(directory, files[0]), { readonly: true, fileMustExist: true });
        try {
          const label = backupDb.prepare('SELECT text FROM focus_labels WHERE id = ?').get('shared-label') as { text: string };
          assert.equal(label.text, `${actor.username} label`);
          const row = backupDb.prepare('SELECT behavior FROM precedent_cases WHERE id = ?').get('shared-case') as { behavior: string };
          assert.equal(row.behavior, `${actor.username} behavior`);
        } finally { backupDb.close(); }
      }
      assert.deepEqual((await tree(guest)).labels, guestBefore.labels);
      assert.deepEqual((await tree(admin)).labels, adminBefore.labels);
      assert.equal((await readdir(dataDir)).filter(name => /^app_pre_import_.*\.db$/.test(name)).length, 0);
      assert.equal((await readdir(path.join(dataDir, 'accounts', 'public'))).filter(name => /^app_pre_import_.*\.db$/.test(name)).length, 0);
    });

    await testAsync('停用账户立即吊销会话，重新启用不会恢复旧 Cookie，重置密码也立即吊销', async () => {
      const oldAlice = alice;
      accounts.setDisabled(alice.id, true);
      assert.throws(() => createAccountRepository(database.rootDb, { maxAccounts: 2 }).create({ username: 'disabled-does-not-free-slot', passwordHash: hash }), /上限/);
      assert.equal((await request('/focus-tree', oldAlice)).status, 401);
      assert.equal((await request('/auth/status', oldAlice)).body.user.id, 'public');
      assert.equal((await request('/auth/login', undefined, { method: 'POST', body: { username: 'alice', password: personalPassword } })).status, 401);
      accounts.setDisabled(alice.id, false);
      assert.equal((await request('/focus-tree', oldAlice)).status, 401);
      alice = await login('alice', personalPassword, alice.id);
      assert.equal((await tree(alice)).labels?.[0].text, 'alice restored label');
      const oldBob = bob;
      const newPassword = 'ChangedFriendPassword!42';
      accounts.setPasswordHash(bob.id, await bcrypt.hash(newPassword, 4));
      assert.equal((await request('/focus-tree', oldBob)).status, 401);
      assert.equal((await request('/auth/login', undefined, { method: 'POST', body: { username: 'bob', password: personalPassword } })).status, 401);
      bob = await login('bob', newPassword, bob.id);
      assert.equal((await tree(bob)).labels?.[0].text, 'bob restored label');
      assert.equal((await request('/focus-tree', alice)).status, 200);
    });

    await testAsync('登出后已吊销凭证不能写入公共账户，无凭证的下一次访问回到公共账户', async () => {
      const result = await request('/auth/logout', alice, { method: 'POST' });
      assert.equal(result.status, 200);
      assert.match(result.headers.get('set-cookie') || '', /sf_token=;/);
      assert.equal((await request('/cases', alice, { method: 'POST', body: makeCase('revoked', 'revoked-write') })).status, 401);
      assert.equal((await request('/auth/status', alice)).body.user.id, 'public');
      const visitorCases = await request('/cases', guest);
      assert(!visitorCases.body.some((item: PrecedentCase) => item.id === 'revoked-write'));
      assert.equal((await tree(guest)).labels?.[0].text, 'public label');
    });

    await testAsync('SQLite 硬容量上限拒绝单次超限写入，容量不足只影响当前账户', async () => {
      const capacity = database.runWithAccountDatabase('public', () => {
        const pages = database.db.pragma('page_count', { simple: true }) as number;
        const maxPages = database.db.pragma('max_page_count', { simple: true }) as number;
        const pageSize = database.db.pragma('page_size', { simple: true }) as number;
        assert.equal(maxPages * pageSize, 2 * 1024 * 1024);
        database.db.pragma(`max_page_count = ${pages + 1}`);
        try {
          assert.throws(() => database.db.prepare('INSERT INTO focus_labels (id, text, positionX, positionY) VALUES (?, ?, 0, 0)')
            .run('too-large-label', 'x'.repeat(512 * 1024)), (error: unknown) => (error as { code?: string }).code === 'SQLITE_FULL');
          assert.equal(database.db.prepare('SELECT id FROM focus_labels WHERE id = ?').get('too-large-label'), undefined);
          database.db.pragma(`max_page_count = ${pages}`);
          return maxPages;
        } catch (error) {
          database.db.pragma(`max_page_count = ${maxPages}`);
          throw error;
        }
      });
      try {
        const blocked = await request('/cases', guest, { method: 'POST', body: makeCase('capacity-blocked', 'capacity-blocked') });
        assert.equal(blocked.status, 507);
        assert.equal(blocked.body.error, 'ACCOUNT_STORAGE_LIMIT');
        assert.equal((await request('/cases/missing-case', guest, { method: 'DELETE' })).status, 404);
        const personal = await request('/cases', bob, { method: 'POST', body: makeCase('bob', 'other-account-has-space') });
        assert.equal(personal.status, 201);
      } finally {
        database.runWithAccountDatabase('public', () => database.db.pragma(`max_page_count = ${capacity}`));
      }
      assert.equal((await tree(guest)).labels?.[0].text, 'public label');
      database.runWithAccountDatabase(bob.id, () => {
        const maxPages = database.db.pragma('max_page_count', { simple: true }) as number;
        const pageSize = database.db.pragma('page_size', { simple: true }) as number;
        assert.equal(maxPages * pageSize, 4 * 1024 * 1024);
      });
    });

    await testAsync('连接池淘汰后重新打开仍可写入，外层请求结束后的保留操作不会被淘汰', async () => {
      let releaseOperation!: () => void;
      const gate = new Promise<void>(resolve => { releaseOperation = resolve; });
      let retainedOperation!: Promise<void>;
      const bobConnection = database.runWithAccountDatabase(bob.id, () => database.db.prepare('SELECT 1').database);
      database.runWithAccountDatabase(alice.id, () => {
        retainedOperation = database.retainAccountDatabase(async () => {
          const statement = database.db.prepare('SELECT name FROM focus_nodes WHERE id = ?');
          // The outer scope has ended before churn; only retainAccountDatabase keeps this handle alive.
          await gate;
          const node = statement.get('shared-node') as { name: string };
          assert.equal(node.name, 'alice restored node');
          assert.equal(database.getAccountDataDir(), path.join(dataDir, 'accounts', alice.id));
        });
      });
      try {
        for (let index = 0; index < 10; index++) {
          const account = accounts.create({ username: `pool-user-${index}`, passwordHash: hash });
          database.runWithAccountDatabase(account.id, () => {
            database.db.prepare('INSERT INTO focus_labels (id, text, positionX, positionY) VALUES (?, ?, 0, 0)')
              .run('pool-label', `pool ${index}`);
          });
        }
        assert.equal(bobConnection.open, false, 'an idle connection must be evicted under pool churn');
      } finally {
        releaseOperation();
        await retainedOperation;
      }
      await saveTree(bob, 'bob reopened');
      const reopened = await tree(bob);
      assert.equal(reopened.nodes[0].name, 'bob reopened node');
      assert.equal(reopened.labels?.[0].text, 'bob reopened label');
      assert.equal((await tree(guest)).labels?.[0].text, 'public label');
    });

    const summary = getSummary();
    console.log(`多用户集成测试: ${summary.passedCount} passed, ${summary.failedCount} failed`);
    if (summary.failedCount > 0) process.exitCode = 1;
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (databaseModule) {
      // Close every connection before removing a temporary SQLite directory on Windows.
      databaseModule.closeAllDatabases();
    }
    for (const [key, value] of savedEnvironment) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(tmpdir()));
    assert(path.basename(dataDir).startsWith('sacred-focus-multiuser-'));
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
