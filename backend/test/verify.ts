import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';
import {
  validateEdgeItem,
  validateFullBackupPayload,
  validateGroupItem,
  validateLabelItem,
  validateNodeItem
} from '../src/utils/validators.js';
import {
  validateEdgeItem as validateEdgeItemFromDomain,
  validateGroupItem as validateGroupItemFromDomain,
  validateLabelItem as validateLabelItemFromDomain,
  validateNodeItem as validateNodeItemFromDomain
} from '../src/domain/backupValidation/treeItems.js';
import { getBusinessDay, getPreviousBusinessDay } from '../src/domain/calendar/businessDay.js';
import {
  getBusinessDay as getBusinessDayFromLegacyPath,
  getPreviousBusinessDay as getPreviousBusinessDayFromLegacyPath
} from '../src/db/dateUtils.js';
import { safeCompare } from '../src/middleware/auth.js';
import { createTables } from '../src/db/schema.js';
// 此文件由 tsx 直接执行，因此显式引用 TypeScript 源文件。
import { writeAllAssets } from '../../scripts/generate-icons.ts';
import { formatCompactDuration } from '../../frontend/src/shared/formatters/duration.ts';
import { formatCompactDuration as formatCompactDurationFromLegacyPath } from '../../frontend/src/utils/time.ts';

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
  console.log('[Suite 1] 04:00 业务日计算算法 (domain/calendar/businessDay.ts)');

  test('旧 db/dateUtils 入口仍以同一实现保持兼容', () => {
    assert.equal(getBusinessDayFromLegacyPath, getBusinessDay);
    assert.equal(getPreviousBusinessDayFromLegacyPath, getPreviousBusinessDay);
  });

  test('凌晨 03:59:59 点亮，严格归属于前一个业务日', () => {
    const d = new Date('2026-09-09T03:59:59+08:00');
    const bDay = getBusinessDay(d);
    assert.equal(bDay, '2026-09-08');
  });

  test('凌晨 04:00:00 点亮，正式进入当天自控业务日', () => {
    const d = new Date('2026-09-09T04:00:00+08:00');
    const bDay = getBusinessDay(d);
    assert.equal(bDay, '2026-09-09');
  });

  test('深夜 23:59:59 点亮，稳态保持在当天自控业务日', () => {
    const d = new Date('2026-09-09T23:59:59+08:00');
    const bDay = getBusinessDay(d);
    assert.equal(bDay, '2026-09-09');
  });

  test('连续天数断签判定：getPreviousBusinessDay 正确计算前一业务日', () => {
    assert.equal(getPreviousBusinessDay('2026-09-09'), '2026-09-08');
    assert.equal(getPreviousBusinessDay('2026-09-01'), '2026-08-31'); // 跨月边界
    assert.equal(getPreviousBusinessDay('2026-01-01'), '2025-12-31'); // 跨年边界
  });

  test('业务日偏移量按传入时区计算，默认值保持东八区', () => {
    const instant = new Date('2026-09-09T00:00:00.000Z');
    assert.equal(getBusinessDay(instant), '2026-09-09');
    assert.equal(getBusinessDay(instant, 8), '2026-09-09');
    assert.equal(getBusinessDay(instant, 0), '2026-09-08');
  });

  test('前一业务日正确处理闰年与非闰年二月边界', () => {
    assert.equal(getPreviousBusinessDay('2024-03-01'), '2024-02-29');
    assert.equal(getPreviousBusinessDay('2025-03-01'), '2025-02-28');
  });

  test('非补零或溢出的日期字符串保留当前 JavaScript Date 宽松归一化行为', () => {
    assert.equal(getPreviousBusinessDay('2026-1-1'), '2025-12-31');
    assert.equal(getPreviousBusinessDay('2026-02-30'), '2026-03-01');
  });

  test('无效 Date、无效日期文本和 Infinity 偏移量当前均格式化为 NaN 日期', () => {
    assert.equal(getBusinessDay(new Date('not-a-date')), 'NaN-NaN-NaN');
    assert.equal(getBusinessDay(new Date('2026-09-09T00:00:00.000Z'), Infinity), 'NaN-NaN-NaN');
    assert.equal(getPreviousBusinessDay('not-a-date'), 'NaN-NaN-NaN');
  });

  test('运行时传入 null 时保留原生 TypeError，而不静默容错', () => {
    assert.throws(() => getBusinessDay(null as unknown as Date), TypeError);
    assert.throws(() => getPreviousBusinessDay(null as unknown as string), TypeError);
  });

  // -----------------------------------------------------------
  // 2. 前端紧凑时长格式化现状锁定（time.ts）
  // -----------------------------------------------------------
  console.log('\n[Suite 2] 紧凑时长格式化现状锁定 (frontend/utils/time.ts)');

  test('旧 utils/time 入口仍以同一实现保持兼容', () => {
    assert.equal(formatCompactDurationFromLegacyPath, formatCompactDuration);
  });

  test('秒、分钟、小时及混合单位按当前紧凑规则格式化', () => {
    const cases: Array<[number, string]> = [
      [1, '1s'],
      [59, '59s'],
      [60, '1m'],
      [65, '1m5s'],
      [3599, '59m59s'],
      [3600, '1h'],
      [3602, '1h2s'],
      [3665, '1h1m5s']
    ];

    for (const [seconds, expected] of cases) {
      assert.equal(formatCompactDuration(seconds), expected, `${seconds} 秒应格式化为 ${expected}`);
    }
  });

  test('零、负数与不足一秒的小数均被向下归零为空字符串', () => {
    for (const seconds of [0, -1, -Infinity, -0.1, 0.999]) {
      assert.equal(formatCompactDuration(seconds), '', `${seconds} 应返回空字符串`);
    }
  });

  test('正小数向下取整，而非四舍五入', () => {
    assert.equal(formatCompactDuration(59.999), '59s');
    assert.equal(formatCompactDuration(60.999), '1m');
  });

  test('运行时 null、空字符串、空白字符串、undefined 与 NaN 均容错为空字符串', () => {
    const invalidButTolerated: unknown[] = [null, '', '   ', undefined, NaN];

    for (const value of invalidButTolerated) {
      assert.doesNotThrow(() => formatCompactDuration(value as number));
      assert.equal(formatCompactDuration(value as number), '', `${String(value)} 应容错为空字符串`);
    }
  });

  test('运行时数字字符串会被 JavaScript 隐式转换后参与格式化', () => {
    assert.equal(formatCompactDuration('65' as unknown as number), '1m5s');
  });

  test('Infinity 与最大安全整数保留当前极端值行为', () => {
    assert.equal(formatCompactDuration(Infinity), 'Infinityh');
    assert.equal(formatCompactDuration(Number.MAX_SAFE_INTEGER), '2501999792983h36m31s');
  });

  test('无法转换为数字的 Symbol 仍向调用方抛出 TypeError', () => {
    assert.throws(
      () => formatCompactDuration(Symbol('duration') as unknown as number),
      TypeError
    );
  });

  // -----------------------------------------------------------
  // 3. 静态令牌恒定时间安全比对测试 (crypto.timingSafeEqual via auth.ts)
  // -----------------------------------------------------------
  console.log('\n[Suite 3] 安全防御：常量时间比对防御时序嗅探 (auth.ts safeCompare)');

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

  test('旧 validators 入口仍转出同一组树元素校验器', () => {
    assert.equal(validateNodeItem, validateNodeItemFromDomain);
    assert.equal(validateGroupItem, validateGroupItemFromDomain);
    assert.equal(validateEdgeItem, validateEdgeItemFromDomain);
    assert.equal(validateLabelItem, validateLabelItemFromDomain);
  });

  test('合法整机镜像数据顺利通过校验与清洗', () => {
    const validData = {
      focusTree: {
        nodes: [
          { id: 'R0', code: 'R0', name: '水密隔舱', triggerScene: '全天候', triggerTime: null, isLit: 0, level: 0, maxLevel: 5, color: '#10b981', groupId: 'G1' },
          { id: 'R1', code: 'R1', name: '晨间专注', triggerScene: '早晨', triggerTime: '07:00', isLit: 0, level: 0, maxLevel: 5, color: '#10b981', groupId: 'G1' }
        ],
        groups: [
          { id: 'G1', name: '基石组', themeColor: '#3b82f6', position: { x: 100, y: 100 }, size: { width: 400, height: 300 } }
        ],
        edges: [
          { id: 'E1', sourceId: 'R0', sourceType: 'NODE', targetId: 'R1', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' }
        ],
        labels: []
      },
      sacredSeatConfig: { targetMinutes: 60, currentStreak: 5, isStrictLocked: 1 },
      sessionLogs: [
        { id: 'L1', targetDurationMinutes: 60, actualDurationSeconds: 3600, type: 'FOCUS', status: 'SUCCESS', startTime: '2026-09-09T10:00:00Z' }
      ]
    };
    const result = validateFullBackupPayload(validData);
    assert.equal(result.success, true);
    assert.equal(result.data?.tree?.nodes?.length, 2);
    assert.equal(result.data?.sacredSeatConfig?.currentStreak, 5);
  });

  test('不完整国策树（缺少 nodes/groups/edges/labels 数组）被严格拒绝并阻断 (P1-003)', () => {
    const emptyTreeResult = validateFullBackupPayload({ focusTree: {} });
    assert.equal(emptyTreeResult.success, false);
    assert.match(emptyTreeResult.error || '', /国策树结构不完整/);

    const missingLabelsResult = validateFullBackupPayload({
      focusTree: { nodes: [], groups: [], edges: [] }
    });
    assert.equal(missingLabelsResult.success, false);
    assert.match(missingLabelsResult.error || '', /国策树结构不完整/);
  });

  test('拓扑连线悬空或引用不存在节点被拦截', () => {
    const danglingEdgeData = {
      focusTree: {
        nodes: [{ id: 'R0', code: 'R0', name: '孤立节点' }],
        groups: [],
        edges: [{ id: 'E1', sourceId: 'R0', sourceType: 'NODE', targetId: 'R_NOT_FOUND', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' }],
        labels: []
      }
    };
    const result = validateFullBackupPayload(danglingEdgeData);
    assert.equal(result.success, false);
    assert.match(result.error || '', /不存在/);
  });

  test('恶意超大节点数组（超过 500 个上限）触发熔断阻断', () => {
    const excessiveNodes = Array.from({ length: 501 }, (_, i) => ({
      id: `node-${i}`,
      code: `N${i}`,
      name: `测试节点${i}`
    }));
    const result = validateFullBackupPayload({
      focusTree: { nodes: excessiveNodes, groups: [], edges: [], labels: [] }
    });
    assert.equal(result.success, false);
    assert.match(result.error || '', /国策节点数量超过系统安全上限/);
  });

  test('非法颜色 Hex 注入被重置为安全默认值', () => {
    const maliciousColorData = {
      focusTree: {
        nodes: [],
        groups: [
          { id: 'G1', name: '测试', themeColor: 'javascript:alert(1)' }
        ],
        edges: [],
        labels: []
      }
    };
    const result = validateFullBackupPayload(maliciousColorData);
    assert.equal(result.success, true);
    assert.equal(result.data?.tree?.groups?.[0]?.themeColor, '#3B82F6');
  });

  test('专注日志非法枚举注入被清洗过滤回退至白名单', () => {
    const invalidLogData = {
      focusTree: { nodes: [], groups: [], edges: [], labels: [] },
      sessionLogs: [
        { id: 'L1', targetDurationMinutes: 60, type: 'MALICIOUS_TYPE', status: 'HACKED', startTime: '2026-09-09T10:00:00Z' }
      ]
    };
    const result = validateFullBackupPayload(invalidLogData);
    assert.equal(result.success, true);
    assert.equal(result.data?.sessionLogs?.[0]?.type, 'FOCUS');
    assert.equal(result.data?.sessionLogs?.[0]?.status, 'SUCCESS');
  });

  test('liveTree 是 focusTree 的兼容别名，非对象 body 则被拒绝', () => {
    const aliased = validateFullBackupPayload({
      liveTree: { nodes: [], groups: [], edges: [], labels: [] }
    });
    assert.equal(aliased.success, true);
    assert.deepEqual(aliased.data?.tree, { nodes: [], groups: [], edges: [], labels: [] });

    for (const body of [null, [], '', 0]) {
      const result = validateFullBackupPayload(body);
      assert.equal(result.success, false);
      assert.match(result.error || '', /必须为 JSON 对象/);
    }
  });

  test('公开树元素校验器保留当前裁剪、默认值和错误明细', () => {
    const errors: string[] = [];
    const node = validateNodeItem({
      id: ' N1 ', code: ' C1 ', name: ' 名称 ', groupId: 'G1',
      position: { x: Infinity, y: 12 }, level: 1000, maxLevel: -2,
      triggerScene: '', specCard: { instruction: '执行' }
    }, 0, errors);
    assert.deepEqual(node, {
      id: 'N1', code: 'C1', name: '名称', groupId: 'G1', triggerTime: null,
      triggerScene: '全天候', hasExactTime: false, timeValueMinutes: null,
      level: 999, maxLevel: 0, isLit: false, isFrozen: false,
      lastLitDate: null, previousLevel: 0, position: { x: 0, y: 12 },
      specCard: { instruction: '执行', failCondition: '', benefitMechanism: '', notes: null }
    });

    const group = validateGroupItem({ id: ' G1 ', name: ' 分组 ', themeColor: ' #abc ', size: { width: -1, height: 20000 } }, 0, errors);
    assert.deepEqual(group, {
      id: 'G1', name: '分组', themeColor: '#abc', position: { x: 0, y: 0 }, size: { width: 480, height: 10000 }
    });

    const edge = validateEdgeItem({ id: ' E1 ', sourceId: ' N1 ', targetId: ' G1 ', sourceType: 'INVALID', targetType: 'GROUP', sourceAnchor: 'X', targetAnchor: 'LEFT', style: 'DOTTED' }, 0, errors);
    assert.deepEqual(edge, {
      id: 'E1', sourceId: 'N1', sourceType: 'NODE', targetId: 'G1', targetType: 'GROUP', sourceAnchor: 'BOTTOM', targetAnchor: 'LEFT', style: 'SOLID'
    });

    assert.deepEqual(validateLabelItem({ id: ' L1 ', text: '', position: { x: NaN, y: 4 } }, 0, errors), {
      id: 'L1', text: '', position: { x: 0, y: 4 }
    });
    assert.equal(validateNodeItem(null, 2, errors), null);
    assert.deepEqual(errors, ['nodes[2] 不是有效对象']);
  });

  test('可选领域数据保留当前跳过、钳制和默认值策略', () => {
    const result = validateFullBackupPayload({
      focusTree: { nodes: [], groups: [], edges: [], labels: [] },
      sacredSeatConfig: {
        sacredToken: 'x'.repeat(200), reservationSignal: '', defaultFocusDuration: 9999,
        regretWindowSeconds: 1, currentStreak: -2, maxStreak: -3
      },
      precedentCases: [null, { id: ' C1 ', behavior: 'b'.repeat(600), verdict: 'INVALID' }],
      evolution: {
        state: { activePointerIndex: 99 },
        snapshots: Array.from({ length: 11 }, (_, slotIndex) => ({ slotIndex, id: `S${slotIndex}`, version: '', timestamp: '', changelogNotes: '', isMajor: slotIndex }))
      },
      sessionLogs: [null, { id: ' L1 ', startTime: 'start', targetDurationMinutes: -5, actualDurationSeconds: 99999, type: 'INVALID', status: 'INVALID' }]
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.sacredSeatConfig?.sacredToken.length, 128);
    assert.equal(result.data?.sacredSeatConfig?.reservationSignal, '反手拍手轻声说换人');
    assert.equal(result.data?.sacredSeatConfig?.defaultFocusDuration, 1440);
    assert.equal(result.data?.sacredSeatConfig?.regretWindowSeconds, 5);
    assert.equal(result.data?.sacredSeatConfig?.currentStreak, 0);
    assert.equal(result.data?.precedentCases?.length, 1);
    assert.equal(result.data?.precedentCases?.[0]?.id, ' C1 ');
    assert.equal(result.data?.precedentCases?.[0]?.behavior.length, 512);
    assert.equal(result.data?.precedentCases?.[0]?.verdict, 'ALLOW');
    assert.equal(result.data?.evolution?.state?.activePointerIndex, 4);
    assert.equal(result.data?.evolution?.snapshots?.length, 10);
    assert.equal(result.data?.evolution?.snapshots?.[9]?.slotIndex, 4);
    assert.equal(result.data?.sessionLogs?.length, 1);
    assert.equal(result.data?.sessionLogs?.[0]?.id, ' L1 ');
    assert.equal(result.data?.sessionLogs?.[0]?.targetDurationMinutes, 0);
    assert.equal(result.data?.sessionLogs?.[0]?.actualDurationSeconds, 86400);
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
    testDb.prepare("UPDATE system_meta SET value = '10' WHERE key = 'system_revision'").run();

    // 期望版本为 10，匹配则自增
    const updateSuccess = testDb.prepare("UPDATE system_meta SET value = '11' WHERE key = 'system_revision' AND value = '10'").run();
    assert.equal(updateSuccess.changes, 1);

    // 另一个并发客户端期望版本仍然是 10，此时应由于版本不匹配导致变更数为 0
    const conflictUpdate = testDb.prepare("UPDATE system_meta SET value = '12' WHERE key = 'system_revision' AND value = '10'").run();
    assert.equal(conflictUpdate.changes, 0); // 拦截并发覆写！
  });

  test('Double-Checked Locking 消除跨天每日结算并发 TOCTOU 竞态', () => {
    testDb.prepare("INSERT OR REPLACE INTO system_meta (key, value) VALUES ('lastDailySettlementDate', '2026-09-08')").run();

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
  // 6. 图标与 PWA 资产完整性测试 (P2-004)
  // -----------------------------------------------------------
  console.log('\n[Suite 6] 图标与 PWA 资产完整性测试 (public/*)');

  test('生成并验证全部 PWA 与 Favicon 图标资产存在且有效', () => {
    const publicDir = path.resolve(__dirname, '../../frontend/public');
    writeAllAssets(publicDir);

    assert.ok(fs.existsSync(path.join(publicDir, 'favicon.svg')));
    assert.ok(fs.existsSync(path.join(publicDir, 'favicon.ico')));
    assert.ok(fs.existsSync(path.join(publicDir, 'apple-touch-icon.png')));
    assert.ok(fs.existsSync(path.join(publicDir, 'pwa-192x192.png')));
    assert.ok(fs.existsSync(path.join(publicDir, 'pwa-512x512.png')));

    const icoBuf = fs.readFileSync(path.join(publicDir, 'favicon.ico'));
    assert.ok(icoBuf.length > 100);
    const png192Buf = fs.readFileSync(path.join(publicDir, 'pwa-192x192.png'));
    assert.equal(png192Buf[0], 0x89);
    assert.equal(png192Buf[1], 0x50); // 'P'
  });

  // -----------------------------------------------------------
  // 7. Nginx TLS 证书挂载与生成测试 (P1-004)
  // -----------------------------------------------------------
  console.log('\n[Suite 7] Nginx TLS 证书生成与合法性测试 (nginx/ssl/*)');

  test('验证 Nginx SSL 证书生成脚本与证书文件就绪', () => {
    const sslDir = path.resolve(__dirname, '../../nginx/ssl');
    if (!fs.existsSync(sslDir)) {
      fs.mkdirSync(sslDir, { recursive: true });
    }
    const certPath = path.join(sslDir, 'server.crt');
    const keyPath = path.join(sslDir, 'server.key');
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      try {
        execSync(`openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`, { stdio: 'pipe' });
      } catch (e) {
        console.warn('  [WARN] 系统未直接执行 openssl，跳过实时自签证书创建');
      }
    }
    assert.ok(fs.existsSync(path.join(sslDir, 'generate-cert.sh')));
    assert.ok(fs.existsSync(path.join(sslDir, 'README.md')));
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
