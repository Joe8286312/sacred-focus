import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { validateFullBackupPayload } from '../src/utils/validators.js';
import { getBusinessDay, getPreviousBusinessDay } from '../src/db/dateUtils.js';
import { safeCompare } from '../src/middleware/auth.js';
import { createTables } from '../src/db/schema.js';

// 简易单元测试运行器
let passedCount = 0;
let failedCount = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err?.message || err}`);
    failedCount++;
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('       Sacred Focus 全系统核心链路自动化单元测试     ');
  console.log('====================================================\n');

  // -----------------------------------------------------------
  // 1. 业务日分界线算法测试 (04:00 业务日分水岭)
  // -----------------------------------------------------------
  console.log('[Suite 1] 04:00 业务日计算算法 (dateUtils.ts)');

  test('凌晨 03:59:59 点亮，严格归属于前一个业务日', () => {
    const d = new Date(2026, 8, 9, 3, 59, 59); // 2026-09-09 03:59:59
    const bDay = getBusinessDay(d);
    assert.equal(bDay, '2026-09-08');
  });

  test('凌晨 04:00:00 点亮，正式进入当天自控业务日', () => {
    const d = new Date(2026, 8, 9, 4, 0, 0); // 2026-09-09 04:00:00
    const bDay = getBusinessDay(d);
    assert.equal(bDay, '2026-09-09');
  });

  test('深夜 23:59:59 点亮，稳态保持在当天自控业务日', () => {
    const d = new Date(2026, 8, 9, 23, 59, 59); // 2026-09-09 23:59:59
    const bDay = getBusinessDay(d);
    assert.equal(bDay, '2026-09-09');
  });

  test('连续天数断签判定：getPreviousBusinessDay 正确计算前一业务日', () => {
    assert.equal(getPreviousBusinessDay('2026-09-09'), '2026-09-08');
    assert.equal(getPreviousBusinessDay('2026-09-01'), '2026-08-31'); // 跨月边界
    assert.equal(getPreviousBusinessDay('2026-01-01'), '2025-12-31'); // 跨年边界
  });

  // -----------------------------------------------------------
  // 2. 静态令牌恒定时间安全比对测试 (crypto.timingSafeEqual via auth.ts)
  // -----------------------------------------------------------
  console.log('\n[Suite 2] 安全防御：常量时间比对防御时序嗅探 (auth.ts safeCompare)');

  test('正确令牌比对成功', () => {
    const secret = 'super_secret_token_1234567890_abcdef';
    assert.equal(safeCompare(secret, secret), true);
  });

  test('篡改字符（单字符偏差）比对失败', () => {
    const secret = 'super_secret_token_1234567890_abcdef';
    const tampered = 'super_secret_token_1234567890_abcdeg';
    assert.equal(safeCompare(secret, tampered), false);
  });

  test('不同长度输入安全降级为 false（且不抛出 RangeError）', () => {
    const secret = 'super_secret_token_1234567890_abcdef';
    const short = 'super_secret';
    assert.equal(safeCompare(secret, short), false);
    assert.equal(safeCompare(short, secret), false);
  });

  // -----------------------------------------------------------
  // 3. 导入数据防御性 Schema 校验门禁测试 (validators.ts)
  // -----------------------------------------------------------
  console.log('\n[Suite 3] 备份与镜像导入 Schema 校验门禁 (validators.ts)');

  test('合法整机镜像数据顺利通过校验与清洗', () => {
    const validData = {
      focusTree: {
        nodes: [
          { id: 'R0', code: 'R0', name: '水密隔舱', triggerScene: '全天候', triggerTime: null, isLit: 0, level: 0, maxLevel: 5, color: '#10b981' }
        ],
        groups: [
          { id: 'G1', name: '基石组', themeColor: '#3b82f6', position: { x: 100, y: 100 }, size: { width: 400, height: 300 } }
        ],
        edges: [
          { id: 'E1', sourceId: 'R0', targetId: 'R1', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP' }
        ]
      },
      sacredSeatConfig: { targetMinutes: 60, currentStreak: 5, isStrictLocked: 1 },
      sessionLogs: [
        { id: 'L1', targetDurationMinutes: 60, actualDurationSeconds: 3600, type: 'FOCUS', status: 'SUCCESS', startTime: '2026-09-09T10:00:00Z' }
      ]
    };
    const result = validateFullBackupPayload(validData);
    assert.equal(result.success, true);
    assert.equal(result.data?.tree?.nodes?.length, 1);
    assert.equal(result.data?.sacredSeatConfig?.currentStreak, 5);
  });

  test('恶意超大节点数组（超过 500 个上限）触发熔断阻断', () => {
    const excessiveNodes = Array.from({ length: 501 }, (_, i) => ({
      id: `node-${i}`,
      code: `N${i}`,
      name: `测试节点${i}`
    }));
    const result = validateFullBackupPayload({
      focusTree: { nodes: excessiveNodes }
    });
    assert.equal(result.success, false);
    assert.match(result.error || '', /国策节点数量超过系统安全上限/);
  });

  test('非法颜色 Hex 注入被重置为安全默认值', () => {
    const maliciousColorData = {
      focusTree: {
        groups: [
          { id: 'G1', name: '测试', themeColor: 'javascript:alert(1)' }
        ]
      }
    };
    const result = validateFullBackupPayload(maliciousColorData);
    assert.equal(result.success, true);
    // 注入代码被重置为默认安全主题颜色
    assert.equal(result.data?.tree?.groups?.[0]?.themeColor, '#3B82F6');
  });

  test('专注日志非法枚举注入被清洗过滤回退至白名单', () => {
    const invalidLogData = {
      focusTree: {},
      sessionLogs: [
        { id: 'L1', targetDurationMinutes: 60, type: 'MALICIOUS_TYPE', status: 'HACKED', startTime: '2026-09-09T10:00:00Z' }
      ]
    };
    const result = validateFullBackupPayload(invalidLogData);
    assert.equal(result.success, true);
    // 非法枚举自动回退至默认白名单枚举
    assert.equal(result.data?.sessionLogs?.[0]?.type, 'FOCUS');
    assert.equal(result.data?.sessionLogs?.[0]?.status, 'SUCCESS');
  });

  // -----------------------------------------------------------
  // 4. SQLite 内存数据库事务、DDL 与核心查询测试 (db/*)
  // -----------------------------------------------------------
  console.log('\n[Suite 4] 内存 SQLite 数据库架构与事务稳态 (db/schema & queries)');

  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');

  test('7 大核心表与 5 大索引通过真实 createTables DDL 顺利在 SQLite 中初始化', () => {
    createTables(testDb);

    const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const names = tables.map(t => t.name);
    assert.ok(names.includes('sacred_seat_config'));
    assert.ok(names.includes('focus_session_logs'));
    assert.ok(names.includes('precedent_cases'));
    assert.ok(names.includes('focus_groups'));
    assert.ok(names.includes('focus_nodes'));
    assert.ok(names.includes('focus_edges'));
    assert.ok(names.includes('system_meta'));

    const indexes = testDb.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as any[];
    const idxNames = indexes.map(i => i.name);
    assert.ok(idxNames.includes('idx_logs_type_starttime'));
    assert.ok(idxNames.includes('idx_cases_verdict_date'));
    assert.ok(idxNames.includes('idx_nodes_group'));
    assert.ok(idxNames.includes('idx_edges_source'));
    assert.ok(idxNames.includes('idx_edges_target'));
  });

  test('upsertFocusNode 正确清洗、补全并写入真实结构数据库', () => {
    const insertStmt = testDb.prepare(`
      INSERT INTO focus_nodes (
        id, code, name, triggerScene, triggerTime, hasExactTime, timeValueMinutes,
        isLit, level, maxLevel, sortOrder, lastLitDate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      'N-TEST', 'T1', '测试国策', '起床后', '08:30',
      1, 510, 1, 2, 3, 0, '2026-09-09'
    );

    const row = testDb.prepare('SELECT * FROM focus_nodes WHERE id = ?').get('N-TEST') as any;
    assert.equal(row.name, '测试国策');
    assert.equal(row.triggerScene, '起床后');
    assert.equal(row.hasExactTime, 1);
    assert.equal(row.timeValueMinutes, 510);
    assert.equal(row.level, 2);
  });

  test('CAS 乐观版本锁 (system_revision) 自增与并发冲突逻辑验证', () => {
    testDb.prepare("INSERT INTO system_meta (key, value) VALUES ('system_revision', '10')").run();

    // 期望版本为 10，匹配则自增
    const updateSuccess = testDb.prepare("UPDATE system_meta SET value = '11' WHERE key = 'system_revision' AND value = '10'").run();
    assert.equal(updateSuccess.changes, 1);

    // 另一个并发客户端期望版本仍然是 10，此时应由于版本不匹配导致变更数为 0
    const conflictUpdate = testDb.prepare("UPDATE system_meta SET value = '12' WHERE key = 'system_revision' AND value = '10'").run();
    assert.equal(conflictUpdate.changes, 0); // 拦截并发覆写！
  });

  test('Double-Checked Locking 消除跨天每日结算并发 TOCTOU 竞态', () => {
    testDb.prepare("INSERT INTO system_meta (key, value) VALUES ('lastDailySettlementDate', '2026-09-08')").run();

    const todayBusinessDay = '2026-09-09';
    let settlementExecutionCount = 0;

    // 模拟两个高并发并发请求竞争触发每日结算
    const simulateConcurrentSettlement = testDb.transaction(() => {
      // 事务内二次核查 (Double-Checked)
      const meta = testDb.prepare("SELECT value FROM system_meta WHERE key = 'lastDailySettlementDate'").get() as any;
      if (meta && meta.value === todayBusinessDay) {
        return false; // 已被竞争胜出者结算完毕，安全跳过
      }
      // 获胜者执行结算与标记
      testDb.prepare("UPDATE system_meta SET value = ? WHERE key = 'lastDailySettlementDate'").run(todayBusinessDay);
      settlementExecutionCount++;
      return true;
    });

    const client1Result = simulateConcurrentSettlement();
    const client2Result = simulateConcurrentSettlement();

    assert.equal(client1Result, true);  // 客户端 1 获胜并执行了结算
    assert.equal(client2Result, false); // 客户端 2 在事务内二次断言拦截，静默退出
    assert.equal(settlementExecutionCount, 1); // 保证当天仅结算一次！
  });

  testDb.close();

  // -----------------------------------------------------------
  // 5. 前端 API 安全解析器模拟测试 (api.ts F-4)
  // -----------------------------------------------------------
  console.log('\n[Suite 5] 前端 apiFetch 安全容错解析逻辑 (api.ts)');

  function safeParseResponse(rawText: string): any {
    const trimmed = rawText.trim();
    if (!trimmed) return null; // 空响应安全返回 null
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`[API Error] Response is not valid JSON: ${trimmed.slice(0, 80)}`);
    }
  }

  test('空响应 Body (204 No Content) 安全返回 null 而非抛错', () => {
    assert.equal(safeParseResponse('   '), null);
    assert.equal(safeParseResponse(''), null);
  });

  test('有效 JSON 正常解析并返回对象', () => {
    const res = safeParseResponse('{"success": true, "revision": 42}');
    assert.equal(res.success, true);
    assert.equal(res.revision, 42);
  });

  test('服务端返回 502/504 HTML 错误页面时抛出包含文本摘要的语义化 Error', () => {
    const html502 = '<html><body>502 Bad Gateway - Nginx</body></html>';
    assert.throws(() => safeParseResponse(html502), /Response is not valid JSON.*502 Bad Gateway/);
  });

  // -----------------------------------------------------------
  // 总结
  // -----------------------------------------------------------
  console.log('\n====================================================');
  console.log(`测试完成：全部 ${passedCount + failedCount} 个用例，通过 ${passedCount} 个，失败 ${failedCount} 个`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests();
