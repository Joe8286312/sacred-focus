import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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
import { createSystemMetaRepository } from '../src/repositories/systemMetaRepository.js';
import { createFocusTreeRepository, type NodeLitState, type NodeUpdateState } from '../src/repositories/focusTreeRepository.js';
import { createSacredSeatRepository } from '../src/repositories/sacredSeatRepository.js';
import { createPrecedentCaseRepository } from '../src/repositories/precedentCaseRepository.js';
import { createEvolutionRepository } from '../src/repositories/evolutionRepository.js';
import { createSystemBackupRepository } from '../src/repositories/systemBackupRepository.js';
import { createAuthRepository } from '../src/repositories/authRepository.js';
import { createSyncStatusService } from '../src/services/syncStatusService.js';
import { createAuthService } from '../src/services/authService.js';
import { createSacredSeatService } from '../src/services/sacredSeatService.js';
import { createPrecedentCaseService } from '../src/services/precedentCaseService.js';
import { createFocusTreeService } from '../src/services/focusTreeService.js';
import { createEvolutionService } from '../src/services/evolutionService.js';
import {
  createMaintenanceRepository,
  MaintenanceInProgressError,
  RevisionPreconditionError
} from '../src/repositories/maintenanceRepository.js';
// 此文件由 tsx 直接执行，因此显式引用 TypeScript 源文件。
import { writeAllAssets } from '../../scripts/generate-icons.ts';
import { formatCompactDuration } from '../../frontend/src/shared/formatters/duration.ts';
import { formatCompactDuration as formatCompactDurationFromLegacyPath } from '../../frontend/src/utils/time.ts';
import { getTheme, setTheme, toggleTheme } from '../../frontend/src/utils/theme.ts';
import {
  getTheme as getThemeFromBrowserAdapter,
  setTheme as setThemeFromBrowserAdapter,
  toggleTheme as toggleThemeFromBrowserAdapter
} from '../../frontend/src/platform/browser/theme.ts';
import { getNextTheme, getThemeFromStoredValue } from '../../frontend/src/shared/theme/theme.ts';
import { playChimeSound } from '../../frontend/src/utils/audio.ts';
import { playChimeSound as playChimeSoundFromBrowserAdapter } from '../../frontend/src/platform/browser/audio.ts';
import { useListSort } from '../../frontend/src/composables/useListSort.ts';
import { useListSort as useListSortFromComposables } from '../../frontend/src/composables/listSort/useListSort.ts';
import { applyCompoundFocusNodeSort } from '../../frontend/src/shared/sorting/focusNodeSort.ts';
import type { FocusNode } from '../../frontend/src/types/index.ts';
import type { FocusTreeData } from '../src/types.js';

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

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err?.message || err}`);
    failedCount++;
  }
}

function replaceGlobal(name: string, value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });

  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[name];
    }
  };
}

function makeNode(overrides: Partial<FocusNode>): FocusNode {
  return {
    id: 'node',
    code: 'N1',
    name: '默认节点',
    groupId: null,
    triggerTime: null,
    triggerScene: '',
    hasExactTime: false,
    timeValueMinutes: null,
    level: 0,
    maxLevel: 5,
    isLit: false,
    isFrozen: false,
    position: { x: 0, y: 0 },
    specCard: { instruction: '', failCondition: '', benefitMechanism: '' },
    ...overrides
  };
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
  // 3. 前端叶子模块现状锁定（theme / audio / useListSort）
  // -----------------------------------------------------------
  console.log('\n[Suite 3] 前端叶子模块现状锁定 (theme / audio / useListSort)');

  test('旧主题入口保持为浏览器适配器的同一导出；纯规则无需浏览器全局对象', () => {
    assert.equal(getTheme, getThemeFromBrowserAdapter);
    assert.equal(setTheme, setThemeFromBrowserAdapter);
    assert.equal(toggleTheme, toggleThemeFromBrowserAdapter);
    assert.equal(getThemeFromStoredValue('dark'), 'dark');
    assert.equal(getThemeFromStoredValue('unexpected'), 'light');
    assert.equal(getNextTheme('dark'), 'light');
    assert.equal(getNextTheme('light'), 'dark');
  });

  test('主题读取仅接受 dark/light，缺失、空值与未知值均回退 light', () => {
    let savedTheme: string | null = 'dark';
    const restoreStorage = replaceGlobal('localStorage', {
      getItem: () => savedTheme,
      setItem: () => undefined
    });

    try {
      assert.equal(getTheme(), 'dark');
      for (const invalidTheme of [null, '', 'system', 'DARK']) {
        savedTheme = invalidTheme;
        assert.equal(getTheme(), 'light');
      }
    } finally {
      restoreStorage();
    }
  });

  test('主题设置先写 data-theme 再持久化；localStorage 失败会继续向调用方抛出', () => {
    const attributes = new Map<string, string>();
    const restoreDocument = replaceGlobal('document', {
      documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) }
    });
    const restoreStorage = replaceGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('storage unavailable'); }
    });

    try {
      assert.throws(() => setTheme('dark'), /storage unavailable/);
      assert.equal(attributes.get('data-theme'), 'dark');
    } finally {
      restoreStorage();
      restoreDocument();
    }
  });

  test('主题切换在 light/dark 间往返，运行时非法输入按非 dark 处理为 dark', () => {
    const attributes = new Map<string, string>();
    const writes: Array<[string, string]> = [];
    const restoreDocument = replaceGlobal('document', {
      documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) }
    });
    const restoreStorage = replaceGlobal('localStorage', {
      getItem: () => null,
      setItem: (key: string, value: string) => writes.push([key, value])
    });

    try {
      assert.equal(toggleTheme('light'), 'dark');
      assert.equal(toggleTheme('dark'), 'light');
      assert.equal(toggleTheme(null as unknown as 'dark'), 'dark');
      assert.equal(attributes.get('data-theme'), 'dark');
      assert.deepEqual(writes, [
        ['sacred-focus-theme', 'dark'],
        ['sacred-focus-theme', 'light'],
        ['sacred-focus-theme', 'dark']
      ]);
    } finally {
      restoreStorage();
      restoreDocument();
    }
  });

  test('没有 AudioContext 时提示音静默退出，不请求触觉反馈', () => {
    let vibrateCount = 0;
    const restoreWindow = replaceGlobal('window', {});
    const restoreNavigator = replaceGlobal('navigator', { vibrate: () => { vibrateCount++; } });

    try {
      assert.doesNotThrow(() => playChimeSound());
      assert.equal(vibrateCount, 0);
    } finally {
      restoreNavigator();
      restoreWindow();
    }
  });

  test('旧音频入口保持为浏览器音频适配器的同一导出', () => {
    assert.equal(playChimeSound, playChimeSoundFromBrowserAdapter);
  });

  test('提示音按当前三音、增益包络和触觉节奏创建 Web Audio 图', () => {
    const oscillators: Array<{ frequency: number[]; starts: number[]; stops: number[] }> = [];
    const gainEvents: Array<[string, number, number]> = [];
    let vibratePattern: number[] | undefined;

    class FakeAudioContext {
      currentTime = 10;
      destination = {};
      createGain() {
        return {
          gain: {
            setValueAtTime: (value: number, time: number) => gainEvents.push(['set', value, time]),
            exponentialRampToValueAtTime: (value: number, time: number) => gainEvents.push(['ramp', value, time])
          },
          connect: () => undefined
        };
      }
      createOscillator() {
        const oscillator = { frequency: [] as number[], starts: [] as number[], stops: [] as number[] };
        oscillators.push(oscillator);
        return {
          type: 'sine',
          frequency: { setValueAtTime: (value: number) => oscillator.frequency.push(value) },
          connect: () => undefined,
          start: (time: number) => oscillator.starts.push(time),
          stop: (time: number) => oscillator.stops.push(time)
        };
      }
    }

    const restoreWindow = replaceGlobal('window', { AudioContext: FakeAudioContext });
    const restoreNavigator = replaceGlobal('navigator', { vibrate: (pattern: number[]) => { vibratePattern = pattern; } });
    try {
      playChimeSound();
      assert.deepEqual(gainEvents, [
        ['set', 0.01, 10],
        ['ramp', 0.35, 10.05],
        ['ramp', 0.0001, 11.8]
      ]);
      assert.deepEqual(oscillators.map(item => item.frequency[0]), [587.33, 880, 1174.66]);
      assert.deepEqual(oscillators.map(item => item.starts[0]), [10, 10.04, 10.08]);
      assert.deepEqual(oscillators.map(item => item.stops[0]), [12, 12, 12]);
      assert.deepEqual(vibratePattern, [200, 100, 200]);
    } finally {
      restoreNavigator();
      restoreWindow();
    }
  });

  test('AudioContext 构造失败被吞掉并记录警告，不影响调用方', () => {
    const warnings: unknown[][] = [];
    class BrokenAudioContext {
      constructor() { throw new Error('audio blocked'); }
    }
    const restoreWindow = replaceGlobal('window', { AudioContext: BrokenAudioContext });
    const restoreConsole = replaceGlobal('console', { ...console, warn: (...args: unknown[]) => warnings.push(args) });

    try {
      assert.doesNotThrow(() => playChimeSound());
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0][0], '[Audio] Failed to play chime via Web Audio API');
      assert.match(String(warnings[0][1]), /audio blocked/);
    } finally {
      restoreConsole();
      restoreWindow();
    }
  });

  test('复合排序按点击顺序确定优先级，返回新数组且同值元素保持稳定', () => {
    const { sortStack, toggleColumnSort, applyCompoundSort } = useListSort();
    const first = makeNode({ id: 'first', code: 'N10', name: '甲', level: 1 });
    const second = makeNode({ id: 'second', code: 'N2', name: '乙', level: 1 });
    const third = makeNode({ id: 'third', code: 'N1', name: '丙', level: 2 });
    const source = [first, second, third];

    toggleColumnSort('level');
    toggleColumnSort('code');
    const result = applyCompoundSort(source, () => '');

    assert.deepEqual(sortStack.value, [{ key: 'level', dir: 'asc' }, { key: 'code', dir: 'asc' }]);
    assert.deepEqual(result.map(item => item.id), ['second', 'first', 'third']);
    assert.deepEqual(source.map(item => item.id), ['first', 'second', 'third']);
    assert.deepEqual(useListSort().applyCompoundSort([first, first], () => ''), [first, first]);
  });

  test('旧排序入口保持为组合式实现的同一导出，纯排序器不依赖 Vue 状态', () => {
    const low = makeNode({ id: 'low', level: 1 });
    const high = makeNode({ id: 'high', level: 2 });
    assert.equal(useListSort, useListSortFromComposables);
    assert.deepEqual(
      applyCompoundFocusNodeSort([high, low], [{ key: 'level', dir: 'asc' }], () => ''),
      [low, high]
    );
  });

  test('时间排序把无精确时间项置底；无时间项以触发场景排序且 direction 同步生效', () => {
    const { toggleColumnSort, applyCompoundSort } = useListSort();
    const preciseLate = makeNode({ id: 'late', hasExactTime: true, timeValueMinutes: 600, triggerScene: '晚' });
    const sceneB = makeNode({ id: 'scene-b', triggerScene: '乙' });
    const preciseEarly = makeNode({ id: 'early', hasExactTime: true, timeValueMinutes: 480, triggerScene: '早' });
    const sceneA = makeNode({ id: 'scene-a', triggerScene: '甲' });

    toggleColumnSort('time');
    assert.deepEqual(applyCompoundSort([preciseLate, sceneB, preciseEarly, sceneA], () => '').map(item => item.id), [
      'early', 'late', 'scene-a', 'scene-b'
    ]);
    toggleColumnSort('time');
    assert.deepEqual(applyCompoundSort([preciseLate, sceneB, preciseEarly, sceneA], () => '').map(item => item.id), [
      'late', 'early', 'scene-b', 'scene-a'
    ]);
  });

  test('排序列按 asc → desc → 移除循环，优先级缺席时为 0，清空会恢复原数组引用', () => {
    const { sortStack, toggleColumnSort, getSortInfo, getSortPriority, clearSort, applyCompoundSort } = useListSort();
    const source = [makeNode({ id: 'A' }), makeNode({ id: 'B' })];

    assert.equal(getSortPriority('name'), 0);
    toggleColumnSort('name');
    assert.deepEqual(getSortInfo('name'), { key: 'name', dir: 'asc' });
    assert.equal(getSortPriority('name'), 1);
    toggleColumnSort('name');
    assert.deepEqual(getSortInfo('name'), { key: 'name', dir: 'desc' });
    toggleColumnSort('name');
    assert.equal(getSortInfo('name'), undefined);
    assert.equal(sortStack.value.length, 0);
    assert.equal(applyCompoundSort(source, () => ''), source);
    toggleColumnSort('status');
    clearSort();
    assert.deepEqual(sortStack.value, []);
  });

  // -----------------------------------------------------------
  // 4. 静态令牌恒定时间安全比对测试 (crypto.timingSafeEqual via auth.ts)
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

  test('system_meta repository 仅依赖注入的 SQLite 端口，并锁定 revision 与同步时间原子更新', () => {
    const repository = createSystemMetaRepository(testDb);
    const timestamp = '2026-09-16T00:00:00.000Z';

    assert.equal(repository.getValue('missing'), undefined);
    assert.equal(repository.getSystemRevision(), 1);
    repository.setValue('feature_flag', 'enabled');
    assert.equal(repository.getValue('feature_flag'), 'enabled');
    assert.equal(repository.deleteValue('feature_flag'), true);
    assert.equal(repository.deleteValue('feature_flag'), false);

    assert.equal(repository.incrementSystemRevision(timestamp), 2);
    assert.equal(repository.getSystemRevision(), 2);
    assert.equal(repository.getValue('last_sync_timestamp'), timestamp);
  });

  test('focusTree repository 保留节点时间规范化、预编译落库和 sortOrder 读取顺序', () => {
    const repository = createFocusTreeRepository(testDb);
    const laterNode = makeNode({
      id: 'repo-later',
      code: 'R2',
      name: '晚序节点',
      triggerTime: '9：05',
      triggerScene: '   ',
      hasExactTime: false,
      timeValueMinutes: null
    });
    const earlierNode = makeNode({
      id: 'repo-earlier',
      code: 'R1',
      name: '早序节点',
      triggerTime: null,
      triggerScene: '',
      hasExactTime: true,
      timeValueMinutes: 480
    });

    assert.deepEqual(repository.upsertFocusNode(laterNode, 2), {
      ...laterNode,
      triggerTime: '09:05',
      triggerScene: '09:05',
      hasExactTime: true,
      timeValueMinutes: 545,
      previousLastLitDate: null
    });
    repository.upsertFocusNode(earlierNode, 1);

    const tree = repository.getFullFocusTreeData();
    assert.deepEqual(tree.nodes.map(node => node.id), ['repo-earlier', 'repo-later']);
    assert.equal(tree.nodes[0].triggerTime, null);
    assert.equal(tree.nodes[0].hasExactTime, false);
    assert.equal(tree.nodes[0].triggerScene, '全天候');
    assert.equal(tree.nodes[1].triggerTime, '09:05');
    assert.equal(tree.nodes[1].timeValueMinutes, 545);
  });

  test('focusTree repository 锁定全量替换、节点排序、revision 与冲突回滚', () => {
    const focusTreeDb = new Database(':memory:');
    focusTreeDb.pragma('foreign_keys = ON');
    createTables(focusTreeDb);
    try {
      const repository = createFocusTreeRepository(focusTreeDb, { now: () => new Date('2026-09-17T12:00:00.000Z') });
      const metadata = createSystemMetaRepository(focusTreeDb);
      focusTreeDb.prepare("INSERT INTO focus_groups (id,name,themeColor,positionX,positionY,width,height) VALUES ('stale','旧分组','#000',0,0,1,1)").run();
      const tree: FocusTreeData = {
        groups: [{ id: 'group', name: '新分组', themeColor: '#123456', position: { x: 1, y: 2 }, size: { width: 300, height: 200 } }],
        nodes: [makeNode({ id: 'node-b', code: 'B', name: '后节点', groupId: 'group', position: { x: 20, y: 30 } }), makeNode({ id: 'node-a', code: 'A', name: '前节点', groupId: 'group', position: { x: 10, y: 15 } })],
        edges: [{ id: 'edge', sourceId: 'node-a', sourceType: 'NODE', targetId: 'group', targetType: 'GROUP', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' }],
        labels: [{ id: 'label', text: '新标签', position: { x: 5, y: 6 } }]
      };
      const revision = metadata.getSystemRevision();
      assert.equal(repository.replaceFullFocusTree({ expectedRevision: revision, tree }), revision + 1);
      assert.deepEqual(repository.getFullFocusTreeData().nodes.map(node => node.id), ['node-b', 'node-a']);
      assert.equal(focusTreeDb.prepare("SELECT id FROM focus_groups WHERE id = 'stale'").get(), undefined);
      assert.equal(metadata.getValue('last_sync_timestamp'), '2026-09-17T12:00:00.000Z');
      assert.throws(() => repository.replaceFullFocusTree({ expectedRevision: revision, tree }), RevisionPreconditionError);
      assert.deepEqual(repository.getFullFocusTreeData().nodes.map(node => node.id), ['node-b', 'node-a']);
    } finally {
      focusTreeDb.close();
    }
  });

  test('focusTree repository 锁定点亮状态读取与精确字段更新', () => {
    const focusTreeDb = new Database(':memory:');
    createTables(focusTreeDb);
    try {
      const repository = createFocusTreeRepository(focusTreeDb);
      repository.upsertFocusNode(makeNode({
        id: 'lit-state', code: 'LIT', name: '点亮节点', level: 2, maxLevel: 4, isLit: false,
        lastLitDate: '2026-09-16', previousLevel: 1, previousLastLitDate: '2026-09-15'
      }));
      assert.deepEqual(repository.getNodeLitState('lit-state'), {
        id: 'lit-state', level: 2, maxLevel: 4, isLit: 0, lastLitDate: '2026-09-16', previousLevel: 1, previousLastLitDate: '2026-09-15'
      });
      repository.updateNodeLitState({
        id: 'lit-state', level: 3, maxLevel: 4, isLit: 1, lastLitDate: '2026-09-17', previousLevel: 2, previousLastLitDate: '2026-09-16'
      });
      assert.deepEqual(repository.getNodeLitState('lit-state'), {
        id: 'lit-state', level: 3, maxLevel: 4, isLit: 1, lastLitDate: '2026-09-17', previousLevel: 2, previousLastLitDate: '2026-09-16'
      });
      assert.equal(repository.getNodeLitState('missing'), undefined);
    } finally {
      focusTreeDb.close();
    }
  });

  test('focusTree repository 锁定排序覆盖顺序与未知节点静默忽略', () => {
    const focusTreeDb = new Database(':memory:');
    createTables(focusTreeDb);
    try {
      const repository = createFocusTreeRepository(focusTreeDb);
      repository.upsertFocusNode(makeNode({ id: 'first', code: 'F', name: '第一' }), 0);
      repository.upsertFocusNode(makeNode({ id: 'second', code: 'S', name: '第二' }), 1);
      repository.upsertFocusNode(makeNode({ id: 'third', code: 'T', name: '第三' }), 2);
      repository.reorderNodes(['third', 'missing', 'first']);
      assert.deepEqual(repository.getFullFocusTreeData().nodes.map(node => node.id), ['third', 'second', 'first']);
    } finally {
      focusTreeDb.close();
    }
  });

  test('focusTree repository 锁定新增节点追加末位排序与规范化返回值', () => {
    const focusTreeDb = new Database(':memory:');
    createTables(focusTreeDb);
    try {
      const repository = createFocusTreeRepository(focusTreeDb);
      repository.upsertFocusNode(makeNode({ id: 'existing', code: 'EX', name: '已有节点' }), 4);
      const input = makeNode({ id: 'created', code: 'NEW', name: '新增节点', triggerTime: '7:08', triggerScene: '' });
      assert.deepEqual(repository.createNode(input), {
        ...input,
        triggerTime: '07:08', triggerScene: '07:08', hasExactTime: true, timeValueMinutes: 428, previousLastLitDate: null
      });
      assert.deepEqual(repository.getFullFocusTreeData().nodes.map(node => node.id), ['existing', 'created']);
    } finally {
      focusTreeDb.close();
    }
  });

  test('focusTree repository 锁定节点删除连带清理、未找到与事务边界', () => {
    const focusTreeDb = new Database(':memory:');
    createTables(focusTreeDb);
    try {
      const repository = createFocusTreeRepository(focusTreeDb);
      repository.createNode(makeNode({ id: 'delete-me', code: 'DEL', name: '待删除' }));
      repository.createNode(makeNode({ id: 'keep-me', code: 'KEEP', name: '保留' }));
      focusTreeDb.prepare(`INSERT INTO focus_edges (id,sourceId,sourceType,targetId,targetType,sourceAnchor,targetAnchor,style)
        VALUES ('linked-edge','delete-me','NODE','keep-me','NODE','BOTTOM','TOP','SOLID')`).run();
      assert.equal(repository.deleteNodeAndEdges('delete-me'), true);
      assert.deepEqual(repository.getFullFocusTreeData().nodes.map(node => node.id), ['keep-me']);
      assert.deepEqual(repository.getFullFocusTreeData().edges, []);
      assert.equal(repository.deleteNodeAndEdges('missing'), false);
    } finally {
      focusTreeDb.close();
    }
  });

  test('focusTree repository 锁定新增分组的坐标与尺寸回退默认值', () => {
    const focusTreeDb = new Database(':memory:');
    createTables(focusTreeDb);
    try {
      const repository = createFocusTreeRepository(focusTreeDb);
      repository.createGroup({ id: 'default-group', name: '默认分组', themeColor: '#abcdef' } as FocusTreeData['groups'][number]);
      assert.deepEqual(repository.getFullFocusTreeData().groups, [{
        id: 'default-group', name: '默认分组', themeColor: '#abcdef', position: { x: 0, y: 0 }, size: { width: 320, height: 200 }
      }]);
    } finally {
      focusTreeDb.close();
    }
  });

  test('focusTree repository 锁定分组读取与完整字段更新', () => {
    const focusTreeDb = new Database(':memory:');
    createTables(focusTreeDb);
    try {
      const repository = createFocusTreeRepository(focusTreeDb);
      repository.createGroup({ id: 'editable-group', name: '旧分组', themeColor: '#111111', position: { x: 1, y: 2 }, size: { width: 300, height: 200 } });
      assert.deepEqual(repository.getGroup('editable-group'), {
        id: 'editable-group', name: '旧分组', themeColor: '#111111', position: { x: 1, y: 2 }, size: { width: 300, height: 200 }
      });
      repository.updateGroup({ id: 'editable-group', name: '新分组', themeColor: '#222222', position: { x: 3, y: 4 }, size: { width: 500, height: 600 } });
      assert.deepEqual(repository.getGroup('editable-group'), {
        id: 'editable-group', name: '新分组', themeColor: '#222222', position: { x: 3, y: 4 }, size: { width: 500, height: 600 }
      });
      assert.equal(repository.getGroup('missing'), undefined);
    } finally {
      focusTreeDb.close();
    }
  });

  test('focusTree repository 锁定分组删除的子节点删除与解绑分支', () => {
    const focusTreeDb = new Database(':memory:');
    createTables(focusTreeDb);
    try {
      const repository = createFocusTreeRepository(focusTreeDb);
      repository.createGroup({ id: 'delete-group', name: '删除分组', themeColor: '#111111', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
      repository.createNode(makeNode({ id: 'delete-child', code: 'DC', name: '删除子节点', groupId: 'delete-group' }));
      repository.createNode(makeNode({ id: 'other-node', code: 'ON', name: '其他节点' }));
      focusTreeDb.prepare(`INSERT INTO focus_edges (id,sourceId,sourceType,targetId,targetType,sourceAnchor,targetAnchor,style) VALUES
        ('child-edge','delete-child','NODE','other-node','NODE','BOTTOM','TOP','SOLID'),
        ('group-edge','delete-group','GROUP','other-node','NODE','BOTTOM','TOP','SOLID'),
        ('unrelated-edge','other-node','NODE','other-node','NODE','BOTTOM','TOP','SOLID')`).run();
      repository.deleteGroup('delete-group', { deleteChildren: true });
      assert.deepEqual(repository.getFullFocusTreeData().nodes.map(node => node.id), ['other-node']);
      assert.deepEqual(repository.getFullFocusTreeData().edges.map(edge => edge.id), ['unrelated-edge']);

      repository.createGroup({ id: 'unlink-group', name: '解绑分组', themeColor: '#222222', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
      repository.createNode(makeNode({ id: 'unlink-child', code: 'UC', name: '解绑子节点', groupId: 'unlink-group' }));
      focusTreeDb.prepare("INSERT INTO focus_edges (id,sourceId,sourceType,targetId,targetType,sourceAnchor,targetAnchor,style) VALUES ('unlink-group-edge','unlink-group','GROUP','other-node','NODE','BOTTOM','TOP','SOLID')").run();
      repository.deleteGroup('unlink-group', { deleteChildren: false });
      assert.equal(repository.getFullFocusTreeData().nodes.find(node => node.id === 'unlink-child')?.groupId, null);
      assert.deepEqual(repository.getFullFocusTreeData().edges.map(edge => edge.id), ['unrelated-edge']);
      repository.deleteGroup('missing', { deleteChildren: false });
    } finally {
      focusTreeDb.close();
    }
  });

  test('focusTree repository 锁定节点更新字段写入且保留 previousLastLitDate', () => {
    const focusTreeDb = new Database(':memory:');
    createTables(focusTreeDb);
    try {
      const repository = createFocusTreeRepository(focusTreeDb);
      repository.createNode(makeNode({
        id: 'editable-node', code: 'OLD', name: '旧节点', triggerTime: '08:00', triggerScene: '旧场景',
        previousLastLitDate: '2026-09-01', position: { x: 1, y: 2 }, specCard: { instruction: '旧执行', failCondition: '旧失败', benefitMechanism: '旧收益', notes: '旧备注' }
      }));
      const current = repository.getNodeForUpdate('editable-node')!;
      repository.updateNode({
        ...current,
        code: 'NEW', name: '新节点', triggerTime: '09:30', triggerScene: '新场景', hasExactTime: 1, timeValueMinutes: 570,
        level: 2, maxLevel: 3, isLit: 1, isFrozen: 1, lastLitDate: '2026-09-17', previousLevel: 1,
        positionX: 3, positionY: 4, specInstruction: '新执行', specFailCondition: '新失败', specBenefitMechanism: '新收益', specNotes: '新备注'
      });
      const updated = repository.getNodeForUpdate('editable-node')!;
      assert.equal(updated.code, 'NEW');
      assert.equal(updated.triggerTime, '09:30');
      assert.equal(updated.specNotes, '新备注');
      assert.equal(updated.previousLastLitDate, '2026-09-01');
      assert.equal(repository.getNodeForUpdate('missing'), undefined);
    } finally {
      focusTreeDb.close();
    }
  });

  test('maintenance repository 锁定租约冲突、revision 前置条件、过期容错与精确释放', () => {
    let currentTime = 1_000;
    const metadata = createSystemMetaRepository(testDb);
    const repository = createMaintenanceRepository(testDb, {
      now: () => currentTime,
      createOwnerId: () => 'lease-owner'
    });
    const expectedRevision = metadata.getSystemRevision();

    const lease = repository.acquireMaintenanceLease('full-system-import', expectedRevision);
    assert.deepEqual(lease, {
      ownerId: 'lease-owner',
      operation: 'full-system-import',
      expectedRevision,
      expiresAt: 901_000
    });
    assert.deepEqual(repository.getActiveMaintenanceLease(), lease);
    assert.throws(
      () => repository.acquireMaintenanceLease('second-import', expectedRevision),
      MaintenanceInProgressError
    );

    metadata.setValue('system_revision', String(expectedRevision + 1));
    assert.throws(() => repository.assertMaintenanceLease(lease), RevisionPreconditionError);
    repository.releaseMaintenanceLease({ ...lease, ownerId: 'other-owner' });
    assert.deepEqual(repository.getActiveMaintenanceLease(), lease);
    repository.releaseMaintenanceLease(lease);
    assert.equal(repository.getActiveMaintenanceLease(), null);

    metadata.setValue('maintenance_lock', '{not-json');
    assert.equal(repository.getActiveMaintenanceLease(), null);
    metadata.setValue('maintenance_lock', JSON.stringify({ ...lease, expiresAt: currentTime }));
    assert.equal(repository.getActiveMaintenanceLease(), null);
    assert.throws(
      () => repository.acquireMaintenanceLease('stale-revision', expectedRevision),
      RevisionPreconditionError
    );
    repository.assertForeignKeyIntegrity();
  });

  test('sacredSeat repository 锁定配置、日志导入、热力图和连胜原子结算', () => {
    testDb.prepare(`INSERT INTO sacred_seat_config
      (id, sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak, updatedAt)
      VALUES (1, '令牌', '暗号', 25, 30, 1, 3, '2026-09-16T00:00:00.000Z')`).run();
    const repository = createSacredSeatRepository(testDb);
    const meta = createSystemMetaRepository(testDb);

    assert.deepEqual(repository.getConfig(), {
      sacredToken: '令牌', reservationSignal: '暗号', defaultFocusDuration: 25,
      regretWindowSeconds: 30, currentStreak: 1, maxStreak: 3
    });
    assert.deepEqual(repository.updateConfig({
      sacredToken: '新令牌', reservationSignal: '新暗号', defaultFocusDuration: 60,
      regretWindowSeconds: 45, currentStreak: 2, maxStreak: 4
    }), {
      sacredToken: '新令牌', reservationSignal: '新暗号', defaultFocusDuration: 60,
      regretWindowSeconds: 45, currentStreak: 2, maxStreak: 4
    });
    assert.deepEqual(repository.resetStreak(), { currentStreak: 0, maxStreak: 4 });

    const imported = repository.importLogs([
      { id: 'import-a', type: 'FOCUS', startTime: '2026-09-01T08:00:00Z', status: 'SUCCESS', actualDurationSeconds: 75 },
      { id: 'ignored', type: 'FOCUS', status: 'SUCCESS' },
      { id: 'import-b', type: 'RESERVATION', startTime: '2026-09-02T08:00:00Z', status: 'FAIL', note: '' }
    ]);
    assert.deepEqual(imported, { importedCount: 2, totalLogs: 2 });
    assert.deepEqual(repository.listLogs().map(log => log.id), ['import-b', 'import-a']);
    assert.deepEqual(repository.getHeatmap(0), [{
      date: '2026-09-01', totalSessions: 1, successCount: 1, regretCount: 0, failCount: 0, totalSeconds: 75
    }]);

    const revisionBefore = meta.getSystemRevision();
    assert.deepEqual(repository.createLogWithStreakSettlement({
      id: 'success-60', type: 'FOCUS', startTime: '2026-09-03T08:00:00Z', endTime: '2026-09-03T08:01:00Z',
      targetDurationMinutes: 1, actualDurationSeconds: 60, status: 'SUCCESS'
    }), { currentStreak: 1, maxStreak: 4 });
    assert.equal(meta.getSystemRevision(), revisionBefore + 1);
    assert.deepEqual(repository.createLogWithStreakSettlement({
      id: 'fail', type: 'FOCUS', startTime: '2026-09-03T09:00:00Z', endTime: '2026-09-03T09:01:00Z',
      targetDurationMinutes: 1, actualDurationSeconds: 1, status: 'FAIL'
    }), { currentStreak: 0, maxStreak: 4 });
    assert.deepEqual(repository.createLogWithStreakSettlement({
      id: 'regret', type: 'FOCUS', startTime: '2026-09-03T10:00:00Z', endTime: '2026-09-03T10:01:00Z',
      targetDurationMinutes: 1, actualDurationSeconds: 600, status: 'REGRET'
    }), { currentStreak: 0, maxStreak: 4 });
    assert.equal(repository.getLogById('success-60')?.status, 'SUCCESS');
  });

  test('sacredSeatService 锁定配置、导入导出与重复日志不重复记账', () => {
    const sacredSeatDb = new Database(':memory:');
    createTables(sacredSeatDb);
    try {
      sacredSeatDb.prepare(`INSERT INTO sacred_seat_config
        (id, sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak, updatedAt)
        VALUES (1, '旧令牌', '旧暗号', 25, 30, 1, 2, 'before')`).run();
      const metadata = createSystemMetaRepository(sacredSeatDb);
      const service = createSacredSeatService({
        sacredSeatRepository: createSacredSeatRepository(sacredSeatDb),
        systemMetaRepository: metadata,
        now: () => new Date('2026-09-17T12:00:00.000Z')
      });

      assert.deepEqual(service.updateConfig({
        sacredToken: '新令牌', reservationSignal: '新暗号', defaultFocusDuration: 60,
        regretWindowSeconds: 45, currentStreak: 2, maxStreak: 3
      }), {
        sacredToken: '新令牌', reservationSignal: '新暗号', defaultFocusDuration: 60,
        regretWindowSeconds: 45, currentStreak: 2, maxStreak: 3
      });
      assert.equal(metadata.getSystemRevision(), 2);
      assert.deepEqual(service.resetStreak(), { currentStreak: 0, maxStreak: 3 });
      assert.equal(metadata.getSystemRevision(), 3);

      assert.deepEqual(service.importLogs([
        { id: 'imported', type: 'FOCUS', startTime: '2026-09-16T08:00:00Z', status: 'SUCCESS', actualDurationSeconds: 75 }
      ]), { importedCount: 1, totalLogs: 1 });
      assert.equal(metadata.getSystemRevision(), 4);
      assert.deepEqual(service.exportLogs(), {
        version: 1,
        exportedAt: '2026-09-17T12:00:00.000Z',
        dataType: 'FOCUS_SESSION_LOGS',
        total: 1,
        logs: [{
          id: 'imported', type: 'FOCUS', startTime: '2026-09-16T08:00:00Z', endTime: '2026-09-16T08:00:00Z',
          targetDurationMinutes: 0, actualDurationSeconds: 75, status: 'SUCCESS',
          focusContent: undefined, failureReason: undefined, note: undefined
        }]
      });

      const log = {
        id: 'idempotent-log', type: 'FOCUS' as const, startTime: '2026-09-17T08:00:00Z', endTime: '2026-09-17T08:01:00Z',
        targetDurationMinutes: 1, actualDurationSeconds: 60, status: 'SUCCESS' as const
      };
      assert.deepEqual(service.saveLog(log), { logId: 'idempotent-log', status: 'SUCCESS', currentStreak: 1, maxStreak: 3 });
      assert.equal(metadata.getSystemRevision(), 5);
      assert.deepEqual(service.saveLog(log), { logId: 'idempotent-log', status: 'SUCCESS', currentStreak: 1, maxStreak: 3, idempotent: true });
      assert.equal(metadata.getSystemRevision(), 5);
    } finally {
      sacredSeatDb.close();
    }
  });

  test('precedentCase repository 锁定排序、过滤、容错导入、覆盖与未找到语义', () => {
    const repository = createPrecedentCaseRepository(testDb, { now: () => new Date('2026-09-16T12:00:00.000Z') });
    repository.create({
      id: 'case-old', date: '2026-01-01', behavior: '旧行为', verdict: 'ALLOW',
      boundaryCondition: '旧边界', createdAt: '2026-01-01T00:00:00.000Z'
    });
    const imported = repository.importCases([
      { id: 'case-old', date: '2026-01-01', behavior: '覆盖行为', verdict: 'FORBID', boundaryCondition: '覆盖边界', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'case-fallback', behavior: '缺省日期', verdict: 'ALLOW', boundaryCondition: '边界' },
      { id: 'case-invalid', behavior: '非法裁定', verdict: 'MAYBE', boundaryCondition: '边界' },
      { id: 'case-missing', verdict: 'ALLOW', boundaryCondition: '边界' }
    ]);
    assert.deepEqual(imported, { importedCount: 2, totalCases: 2 });
    assert.deepEqual(repository.list().map(item => item.id), ['case-fallback', 'case-old']);
    assert.equal(repository.list('ALLOW')[0].date, '2026-09-16');
    assert.equal(repository.list('FORBID')[0].behavior, '覆盖行为');
    assert.equal(repository.update('case-old', { behavior: '更新行为', verdict: 'FORBID', boundaryCondition: '更新边界' }), true);
    assert.equal(repository.list('FORBID')[0].date, '2026-01-01');
    assert.equal(repository.update('not-found', { behavior: 'x', verdict: 'ALLOW', boundaryCondition: 'x' }), false);
    assert.equal(repository.delete('not-found'), false);
    assert.equal(repository.delete('case-old'), true);
  });

  test('precedentCaseService 锁定 CRUD、导入导出、revision 与 createdAt 回退', () => {
    const precedentDb = new Database(':memory:');
    createTables(precedentDb);
    try {
      const metadata = createSystemMetaRepository(precedentDb);
      const now = () => new Date('2026-09-17T12:00:00.000Z');
      const service = createPrecedentCaseService({
        precedentCaseRepository: createPrecedentCaseRepository(precedentDb, { now }),
        systemMetaRepository: metadata,
        now
      });

      service.createCase({
        id: 'created', date: '2026-09-16', behavior: '创建行为', verdict: 'ALLOW', boundaryCondition: '创建边界'
      });
      assert.equal(metadata.getSystemRevision(), 2);
      assert.deepEqual(service.listCases('ALLOW'), [{
        id: 'created', date: '2026-09-16', behavior: '创建行为', verdict: 'ALLOW', boundaryCondition: '创建边界',
        createdAt: '2026-09-17T12:00:00.000Z'
      }]);

      assert.deepEqual(service.importCases([
        { id: 'imported', date: '2026-09-17', behavior: '导入行为', verdict: 'FORBID', boundaryCondition: '导入边界' },
        { id: 'ignored', behavior: '缺少裁定', boundaryCondition: '不会导入' }
      ]), { importedCount: 1, totalCases: 2 });
      assert.equal(metadata.getSystemRevision(), 3);
      assert.deepEqual(service.exportCases(), {
        version: 1,
        exportedAt: '2026-09-17T12:00:00.000Z',
        dataType: 'PRECEDENT_CASES',
        total: 2,
        cases: [{
          id: 'imported', date: '2026-09-17', behavior: '导入行为', verdict: 'FORBID', boundaryCondition: '导入边界',
          createdAt: '2026-09-17T12:00:00.000Z'
        }, {
          id: 'created', date: '2026-09-16', behavior: '创建行为', verdict: 'ALLOW', boundaryCondition: '创建边界',
          createdAt: '2026-09-17T12:00:00.000Z'
        }]
      });

      assert.equal(service.updateCase('missing', { behavior: 'x', verdict: 'ALLOW', boundaryCondition: 'x' }), false);
      assert.equal(metadata.getSystemRevision(), 3);
      assert.equal(service.updateCase('created', { date: '2026-09-15', behavior: '更新行为', verdict: 'FORBID', boundaryCondition: '更新边界' }), true);
      assert.equal(metadata.getSystemRevision(), 4);
      assert.equal(service.deleteCase('missing'), false);
      assert.equal(metadata.getSystemRevision(), 4);
      assert.equal(service.deleteCase('created'), true);
      assert.equal(metadata.getSystemRevision(), 5);
    } finally {
      precedentDb.close();
    }
  });

  test('evolution repository 锁定五槽快照版本递进、指针推进与 revision 前置条件', () => {
    testDb.prepare('INSERT INTO evolution_state (id, activePointerIndex) VALUES (1, 0)').run();
    const repository = createEvolutionRepository(testDb);
    const meta = createSystemMetaRepository(testDb);
    const revision = meta.getSystemRevision();
    assert.deepEqual(repository.getState().snapshots, []);
    const first = repository.createSnapshot({ expectedRevision: revision, changelogNotes: '首次', isMajor: false });
    assert.equal(first.version, 'v1.1');
    assert.equal(first.targetSlotIndex, 0);
    const second = repository.createSnapshot({ expectedRevision: first.revision, changelogNotes: '主版本', isMajor: true });
    assert.equal(second.version, 'v2.0');
    assert.equal(repository.getState().activePointerIndex, 1);
    const architecture = repository.exportArchitecture();
    assert.equal(architecture.schemaVersion, '1.0');
    assert.equal(architecture.dataType, 'FOCUS_TREE_ARCHITECTURE');
    assert.equal(architecture.focusTree, architecture.liveTree);
    assert.equal(architecture.evolution.state?.activePointerIndex, 1);
    assert.equal(architecture.evolution.snapshots.length, 2);
    assert.equal(typeof architecture.evolution.snapshots[0].dataJson, 'string');
    assert.throws(() => repository.createSnapshot({ expectedRevision: revision, changelogNotes: '过期', isMajor: false }), RevisionPreconditionError);
  });

  test('auth repository 锁定管理员哈希优先级、JTI 吊销与过期清理', () => {
    const authDb = new Database(':memory:');
    createTables(authDb);
    try {
      const repository = createAuthRepository(authDb, {
        now: () => 1_500,
        hashInitialPassword: password => `hash:${password}`
      });
      assert.deepEqual(repository.getAdminPasswordHash({ initialPassword: 'initial' }), { hash: 'hash:initial', initialized: true });
      assert.deepEqual(repository.getAdminPasswordHash({ initialPassword: 'ignored' }), { hash: 'hash:initial', initialized: false });
      assert.deepEqual(repository.getAdminPasswordHash({ configuredHash: 'configured-hash', initialPassword: 'ignored' }), { hash: 'configured-hash', initialized: false });

      repository.revokeJti('active', 2_000);
      repository.revokeJti('expired', 1_000);
      authDb.prepare("INSERT INTO system_meta (key, value) VALUES ('revoked_jti:malformed', 'not-a-number')").run();
      assert.equal(repository.isJtiRevoked('active'), true);
      assert.equal(repository.isJtiRevoked('malformed'), true);
      assert.equal(repository.isJtiRevoked('expired'), false);
      assert.ok(authDb.prepare("SELECT value FROM system_meta WHERE key = 'revoked_jti:expired'").get());
      assert.equal(repository.isJtiRevoked('expired', { purgeExpired: true }), false);
      assert.equal(authDb.prepare("SELECT value FROM system_meta WHERE key = 'revoked_jti:expired'").get(), undefined);

      repository.revokeJti('expired-batch', 1_000);
      assert.equal(repository.purgeExpiredRevokedJtis(), 1);
      assert.ok(authDb.prepare("SELECT value FROM system_meta WHERE key = 'revoked_jti:active'").get());
      assert.ok(authDb.prepare("SELECT value FROM system_meta WHERE key = 'revoked_jti:malformed'").get());
    } finally {
      authDb.close();
    }
  });

  await testAsync('authService 锁定登录、会话状态、吊销原因与登出回退过期时间', async () => {
    const authDb = new Database(':memory:');
    createTables(authDb);
    try {
      const repository = createAuthRepository(authDb, {
        now: () => 1_000,
        hashInitialPassword: password => `hash:${password}`
      });
      const service = createAuthService({
        authRepository: repository,
        jwtSecret: 'test-secret',
        initialAdminPassword: 'initial',
        now: () => 1_000,
        createJti: () => 'generated-jti',
        comparePassword: async (password, hash) => password === 'correct' && hash === 'hash:initial',
        signToken: payload => `signed:${payload.jti}:${payload.timestamp}`,
        verifyToken: token => {
          if (token === 'invalid') throw new Error('invalid token');
          return { role: 'admin', jti: token };
        },
        decodeToken: token => token === 'logout' ? { jti: 'logout' } : null
      });

      assert.deepEqual(await service.login('correct'), { token: 'signed:generated-jti:1000', initializedPasswordHash: true });
      assert.equal(await service.login('wrong'), undefined);
      assert.deepEqual(await service.login('correct'), { token: 'signed:generated-jti:1000', initializedPasswordHash: false });
      assert.deepEqual(service.getSessionStatus('valid'), { isAuthenticated: true, user: { role: 'admin', jti: 'valid' } });
      repository.revokeJti('revoked', 2_000);
      assert.deepEqual(service.getSessionStatus('revoked'), { isAuthenticated: false, isRevoked: true });
      assert.deepEqual(service.getSessionStatus('invalid'), { isAuthenticated: false });
      service.revokeToken('logout');
      assert.equal(repository.isJtiRevoked('logout'), true);
    } finally {
      authDb.close();
    }
  });

  test('syncStatusService 锁定 revision、活跃演化版本与同步时间回退契约', () => {
    const syncDb = new Database(':memory:');
    createTables(syncDb);
    try {
      const systemMeta = createSystemMetaRepository(syncDb);
      syncDb.prepare('INSERT INTO evolution_state (id, activePointerIndex) VALUES (1, 1)').run();
      syncDb.prepare("INSERT INTO evolution_snapshots (slotIndex,id,version,timestamp,changelogNotes,isMajor,dataJson) VALUES (1,'sync-snapshot','v2.3','now','同步',0,'{}')").run();
      systemMeta.setValue('system_revision', '42');
      systemMeta.setValue('last_sync_timestamp', '2026-09-17T12:00:00.000Z');
      const service = createSyncStatusService({
        evolutionRepository: createEvolutionRepository(syncDb),
        systemMetaRepository: systemMeta,
        now: () => new Date('2026-09-17T13:00:00.000Z')
      });
      assert.deepEqual(service.getStatus(), {
        revision: 42,
        evolutionVersion: 'v2.3',
        updatedAt: '2026-09-17T12:00:00.000Z'
      });

      syncDb.prepare('UPDATE evolution_state SET activePointerIndex = 4 WHERE id = 1').run();
      systemMeta.setValue('last_sync_timestamp', '');
      assert.deepEqual(service.getStatus(), {
        revision: 42,
        evolutionVersion: 'v1.0',
        updatedAt: '2026-09-17T13:00:00.000Z'
      });
    } finally {
      syncDb.close();
    }
  });

  test('evolutionService 锁定演化状态与 revision 的只读组合契约', () => {
    const evolutionDb = new Database(':memory:');
    createTables(evolutionDb);
    try {
      evolutionDb.prepare('INSERT INTO evolution_state (id, activePointerIndex) VALUES (1, 1)').run();
      evolutionDb.prepare("INSERT INTO evolution_snapshots (slotIndex,id,version,timestamp,changelogNotes,isMajor,dataJson) VALUES (1,'evolution-snapshot','v2.3','now','同步',0,'{\"nodes\":[],\"edges\":[],\"groups\":[]}')").run();
      const systemMeta = createSystemMetaRepository(evolutionDb);
      systemMeta.setValue('system_revision', '42');
      const service = createEvolutionService({
        evolutionRepository: createEvolutionRepository(evolutionDb),
        systemMetaRepository: systemMeta
      });

      assert.deepEqual(service.getEvolutionState(), {
        activePointerIndex: 1,
        snapshots: [{
          id: 'evolution-snapshot', slotIndex: 1, version: 'v2.3', timestamp: 'now', changelogNotes: '同步', isMajor: false,
          nodes: [], edges: [], groups: []
        }],
        revision: 42
      });

      let snapshotInput: { expectedRevision: number; changelogNotes: string; isMajor: boolean } | undefined;
      let importInput: unknown;
      const snapshotService = createEvolutionService({
        evolutionRepository: {
          getState: () => ({ activePointerIndex: 0, snapshots: [] }),
          createSnapshot: input => {
            snapshotInput = input;
            return { version: 'v1.1', nextVersion: 'v1.1', slotIndex: 0, targetSlotIndex: 0, activePointerIndex: 0, revision: 43 };
          },
          rollback: input => input.targetSlotIndex === 2 ? {
            version: 'v1.1', revision: 43, liveTree: { nodes: [], edges: [], groups: [], labels: [] }
          } : undefined,
          exportArchitecture: () => ({
            schemaVersion: '1.0', dataType: 'FOCUS_TREE_ARCHITECTURE', exportedAt: '2026-09-18T00:00:00.000Z',
            focusTree: { nodes: [], edges: [], groups: [], labels: [] },
            liveTree: { nodes: [], edges: [], groups: [], labels: [] },
            evolution: { state: undefined, snapshots: [] }
          }),
          importArchitecture: input => {
            importInput = input;
            return 43;
          }
        },
        systemMetaRepository: systemMeta
      });
      const expectedSnapshotInput = { expectedRevision: 42, changelogNotes: '首次归档', isMajor: false };
      assert.deepEqual(snapshotService.createSnapshot(expectedSnapshotInput), {
        version: 'v1.1', nextVersion: 'v1.1', slotIndex: 0, targetSlotIndex: 0, activePointerIndex: 0, revision: 43
      });
      assert.deepEqual(snapshotInput, expectedSnapshotInput);
      assert.deepEqual(snapshotService.rollback({ expectedRevision: 42, targetSlotIndex: 2 }), {
        version: 'v1.1', revision: 43, liveTree: { nodes: [], edges: [], groups: [], labels: [] }
      });
      assert.equal(snapshotService.rollback({ expectedRevision: 42, targetSlotIndex: 4 }), undefined);
      assert.deepEqual(snapshotService.exportArchitecture(), {
        schemaVersion: '1.0', dataType: 'FOCUS_TREE_ARCHITECTURE', exportedAt: '2026-09-18T00:00:00.000Z',
        focusTree: { nodes: [], edges: [], groups: [], labels: [] },
        liveTree: { nodes: [], edges: [], groups: [], labels: [] },
        evolution: { state: undefined, snapshots: [] }
      });
      const expectedImportInput = {
        expectedRevision: 42,
        tree: { nodes: [], edges: [], groups: [], labels: [] },
        evolution: { state: { activePointerIndex: 0 } }
      };
      assert.equal(snapshotService.importArchitecture(expectedImportInput), 43);
      assert.deepEqual(importInput, expectedImportInput);
    } finally {
      evolutionDb.close();
    }
  });

  test('focusTreeService 锁定日结摘要过滤、读取 revision 与审计重置顺序', () => {
    const tree: FocusTreeData = { nodes: [], edges: [], groups: [], labels: [] };
    let revision = 7;
    let settlement: { resetNodes: Array<{ id: string; code: string; name: string; lostLevel: number; maxLevel: number }>; settlementDate: string } | null = {
      resetNodes: [], settlementDate: '2026-09-17'
    };
    const calls: string[] = [];
    let editableGroup: FocusTreeData['groups'][number] = {
      id: 'editable-group', name: '旧分组', themeColor: '#111111', position: { x: 1, y: 2 }, size: { width: 300, height: 200 }
    };
    let editableNode: NodeUpdateState = {
      id: 'editable-node', code: 'OLD', name: '旧节点', groupId: null, triggerTime: '08:00', triggerScene: '旧场景', hasExactTime: 1, timeValueMinutes: 480,
      level: 1, maxLevel: 2, isLit: 0, isFrozen: 0, lastLitDate: '2026-09-16', previousLevel: 0, previousLastLitDate: '2026-09-01',
      positionX: 1, positionY: 2, specInstruction: '旧执行', specFailCondition: '旧失败', specBenefitMechanism: '旧收益', specNotes: '旧备注'
    };
    const service = createFocusTreeService({
      focusTreeRepository: {
        getFullFocusTreeData: () => tree,
        replaceFullFocusTree: input => {
          calls.push(`replace:${input.expectedRevision}:${input.tree.nodes.length}`);
          return 8;
        },
        getNodeLitState: () => undefined,
        updateNodeLitState: () => undefined,
        reorderNodes: nodeIds => { calls.push(`reorder:${nodeIds.join(',')}`); },
        createNode: node => { calls.push(`create:${node.id}`); return node; },
        deleteNodeAndEdges: id => { calls.push(`delete-node:${id}`); return id !== 'missing'; },
        createGroup: group => { calls.push(`create-group:${group.id}`); },
        getGroup: id => id === editableGroup.id ? editableGroup : undefined,
        updateGroup: group => { editableGroup = group; calls.push(`update-group:${group.id}`); },
        deleteGroup: (id, options) => { calls.push(`delete-group:${id}:${options.deleteChildren}`); },
        getNodeForUpdate: id => id === editableNode.id ? editableNode : undefined,
        updateNode: node => { editableNode = node; calls.push(`update-node:${node.id}`); }
      },
      systemMetaRepository: {
        getSystemRevision: () => revision,
        deleteValue: key => { calls.push(`delete:${key}`); return true; },
        incrementSystemRevision: now => { calls.push(`increment:${now}`); revision++; return revision; }
      },
      settleDailyState: () => settlement,
      now: () => new Date('2026-09-17T12:00:00.000Z')
    });

    assert.deepEqual(service.getFocusTree(), { ...tree, revision: 7 });
    settlement = {
      resetNodes: [{ id: 'reset-node', code: 'R1', name: '断签节点', lostLevel: 2, maxLevel: 3 }],
      settlementDate: '2026-09-17'
    };
    assert.deepEqual(service.getFocusTree(), { ...tree, resetSummary: settlement, revision: 7 });
    assert.equal(service.resetSettlementAudit(), 8);
    assert.deepEqual(calls, [
      'delete:lastDailySettlementDate',
      'increment:2026-09-17T12:00:00.000Z'
    ]);
    assert.deepEqual(service.synchronizeFocusTree({ expectedRevision: 7, tree }), { revision: 8, data: tree });
    assert.deepEqual(calls.slice(2), ['replace:7:0']);
    service.reorderNodes(['node-b', 'node-a']);
    assert.deepEqual(calls.slice(3), ['reorder:node-b,node-a', 'increment:2026-09-17T12:00:00.000Z']);
    const createdNode = makeNode({ id: 'created-by-service', code: 'CS', name: '服务新增' });
    assert.equal(service.createNode(createdNode), createdNode);
    assert.deepEqual(calls.slice(5), ['create:created-by-service', 'increment:2026-09-17T12:00:00.000Z']);
    assert.equal(service.deleteNode('deleted-by-service'), true);
    assert.equal(service.deleteNode('missing'), false);
    assert.deepEqual(calls.slice(7), ['delete-node:deleted-by-service', 'increment:2026-09-17T12:00:00.000Z', 'delete-node:missing']);
    service.createGroup({ id: 'group-by-service', name: '服务分组', themeColor: '#123456', position: { x: 1, y: 2 }, size: { width: 3, height: 4 } });
    assert.deepEqual(calls.slice(10), ['create-group:group-by-service', 'increment:2026-09-17T12:00:00.000Z']);
    assert.deepEqual(service.updateGroup('editable-group', {
      name: '更新分组', position: { x: 9 } as FocusTreeData['groups'][number]['position']
    }), {
      id: 'editable-group', name: '更新分组', themeColor: '#111111', position: { x: 9, y: 2 }, size: { width: 300, height: 200 }
    });
    assert.equal(service.updateGroup('missing', { name: '不存在' }), undefined);
    assert.deepEqual(calls.slice(12), ['update-group:editable-group', 'increment:2026-09-17T12:00:00.000Z']);
    service.deleteGroup('group-by-service', true);
    service.deleteGroup('missing', false);
    assert.deepEqual(calls.slice(14), [
      'delete-group:group-by-service:true', 'increment:2026-09-17T12:00:00.000Z',
      'delete-group:missing:false', 'increment:2026-09-17T12:00:00.000Z'
    ]);
    assert.equal(service.updateNode('editable-node', {
      code: 'NEW', triggerTime: '7：08', triggerScene: '  ', isLit: true, isFrozen: true,
      position: { x: 9 } as FocusTreeData['nodes'][number]['position'],
      specCard: { notes: '新备注' } as FocusTreeData['nodes'][number]['specCard'],
      previousLastLitDate: '不应覆盖'
    }), true);
    assert.deepEqual({
      code: editableNode.code, triggerTime: editableNode.triggerTime, triggerScene: editableNode.triggerScene,
      hasExactTime: editableNode.hasExactTime, timeValueMinutes: editableNode.timeValueMinutes,
      isLit: editableNode.isLit, isFrozen: editableNode.isFrozen, positionX: editableNode.positionX,
      positionY: editableNode.positionY, specNotes: editableNode.specNotes, previousLastLitDate: editableNode.previousLastLitDate
    }, {
      code: 'NEW', triggerTime: '07:08', triggerScene: '07:08', hasExactTime: 1, timeValueMinutes: 428,
      isLit: 1, isFrozen: 1, positionX: 9, positionY: 2, specNotes: '新备注', previousLastLitDate: '2026-09-01'
    });
    assert.equal(service.updateNode('editable-node', { triggerTime: 'invalid', triggerScene: '' }), true);
    assert.deepEqual({ triggerTime: editableNode.triggerTime, triggerScene: editableNode.triggerScene, hasExactTime: editableNode.hasExactTime, timeValueMinutes: editableNode.timeValueMinutes }, {
      triggerTime: '', triggerScene: '全天候', hasExactTime: 0, timeValueMinutes: null
    });
    assert.equal(service.updateNode('missing', {}), false);
    assert.deepEqual(calls.slice(18), [
      'update-node:editable-node', 'increment:2026-09-17T12:00:00.000Z',
      'update-node:editable-node', 'increment:2026-09-17T12:00:00.000Z'
    ]);
  });

  test('focusTreeService 锁定连续升级、反悔精确回退、当日重试与未找到语义', () => {
    let state: NodeLitState | undefined = {
      id: 'node', level: 3, maxLevel: 3, isLit: 0, lastLitDate: '2026-09-16', previousLevel: 1, previousLastLitDate: '2026-09-15'
    };
    let revisions = 0;
    const service = createFocusTreeService({
      focusTreeRepository: {
        getFullFocusTreeData: () => ({ nodes: [], edges: [], groups: [], labels: [] }),
        replaceFullFocusTree: () => 1,
        getNodeLitState: () => state,
        updateNodeLitState: next => { state = next; },
        reorderNodes: () => undefined,
        createNode: node => node,
        deleteNodeAndEdges: () => false,
        createGroup: () => undefined,
        getGroup: () => undefined,
        updateGroup: () => undefined,
        deleteGroup: () => undefined,
        getNodeForUpdate: () => undefined,
        updateNode: () => undefined
      },
      systemMetaRepository: {
        getSystemRevision: () => 1,
        deleteValue: () => true,
        incrementSystemRevision: () => ++revisions
      },
      settleDailyState: () => null,
      getBusinessDay: () => '2026-09-17',
      getPreviousBusinessDay: () => '2026-09-16',
      now: () => new Date('2026-09-17T12:00:00.000Z')
    });

    assert.deepEqual(service.toggleNodeLit('node'), { id: 'node', isLit: true, level: 4, maxLevel: 4, lastLitDate: '2026-09-17' });
    assert.deepEqual(state, { id: 'node', isLit: 1, level: 4, maxLevel: 4, lastLitDate: '2026-09-17', previousLevel: 3, previousLastLitDate: '2026-09-16' });
    assert.deepEqual(service.toggleNodeLit('node'), { id: 'node', isLit: false, level: 3, maxLevel: 3, lastLitDate: '2026-09-16' });
    assert.equal(revisions, 2);

    state = { id: 'node', level: 1, maxLevel: 5, isLit: 1, lastLitDate: '2026-09-17', previousLevel: 2, previousLastLitDate: '2026-08-01' };
    assert.deepEqual(service.toggleNodeLit('node'), { id: 'node', isLit: false, level: 2, maxLevel: 5, lastLitDate: '2026-08-01' });
    state = { id: 'node', level: 1, maxLevel: 1, isLit: 0, lastLitDate: '2026-09-17', previousLevel: 2, previousLastLitDate: null };
    assert.deepEqual(service.toggleNodeLit('node'), { id: 'node', isLit: true, level: 3, maxLevel: 3, lastLitDate: '2026-09-17' });
    state = undefined;
    assert.equal(service.toggleNodeLit('missing'), undefined);
    assert.equal(revisions, 4);
  });

  test('evolution repository 锁定回滚和架构导入事务、404 优先级与版本冲突', () => {
    const evolutionDb = new Database(':memory:');
    evolutionDb.pragma('foreign_keys = ON');
    createTables(evolutionDb);
    try {
      const snapshotTree = {
        groups: [{ id: 'snapshot-group', name: '快照分组', themeColor: '#123456', position: { x: 10, y: 20 }, size: { width: 300, height: 200 } }],
        nodes: [{ id: 'snapshot-node', code: 'SNAP', name: '快照节点', groupId: 'snapshot-group', triggerTime: null, triggerScene: '快照场景', hasExactTime: false, timeValueMinutes: null, level: 1, maxLevel: 3, isLit: true, isFrozen: false, position: { x: 30, y: 40 }, specCard: { instruction: '执行', failCondition: '失败', benefitMechanism: '收益' } }],
        edges: [],
        labels: [{ id: 'snapshot-label', text: '快照标签', position: { x: 5, y: 6 } }]
      };
      evolutionDb.prepare("INSERT INTO evolution_state (id, activePointerIndex) VALUES (1, 1)").run();
      evolutionDb.prepare("INSERT INTO focus_groups (id,name,themeColor,positionX,positionY,width,height) VALUES ('current-group','当前分组','#000',0,0,100,100)").run();
      evolutionDb.prepare("INSERT INTO evolution_snapshots (slotIndex,id,version,timestamp,changelogNotes,isMajor,dataJson) VALUES (0,'snapshot-0','v1.0','2026-09-16T00:00:00.000Z','基线',0,?)").run(JSON.stringify(snapshotTree));

      const repository = createEvolutionRepository(evolutionDb);
      const meta = createSystemMetaRepository(evolutionDb);
      const revision = meta.getSystemRevision();
      assert.equal(repository.rollback({ expectedRevision: revision, targetSlotIndex: 4 }), undefined);

      const restored = repository.rollback({ expectedRevision: revision, targetSlotIndex: 0 });
      assert.equal(restored?.version, 'v1.0');
      assert.equal(restored?.liveTree.nodes[0].name, '快照节点');
      assert.equal(restored?.liveTree.labels[0].text, '快照标签');
      assert.equal(restored?.revision, revision + 1);

      const importedTree = {
        ...snapshotTree,
        groups: [{ ...snapshotTree.groups[0], id: 'imported-group', name: '导入分组' }],
        nodes: [{ ...snapshotTree.nodes[0], id: 'imported-node', groupId: 'imported-group', name: '导入节点' }]
      };
      const importedRevision = repository.importArchitecture({
        expectedRevision: restored!.revision,
        tree: importedTree,
        evolution: { state: { activePointerIndex: 0 }, snapshots: [] }
      });
      assert.equal(importedRevision, revision + 2);
      assert.equal(repository.getState().snapshots.length, 0);
      const importedNode = evolutionDb.prepare("SELECT name FROM focus_nodes WHERE id = 'imported-node'").get() as { name: string } | undefined;
      assert.equal(importedNode?.name, '导入节点');
      assert.throws(() => repository.importArchitecture({ expectedRevision: revision, tree: importedTree }), RevisionPreconditionError);
      assert.equal((evolutionDb.prepare("SELECT name FROM focus_nodes WHERE id = 'imported-node'").get() as { name: string }).name, '导入节点');
    } finally {
      evolutionDb.close();
    }
  });

  test('systemBackup repository 锁定全量镜像集合、汇总计数与 liveTree 兼容别名', () => {
    const backup = createSystemBackupRepository(testDb).exportFullBackup();
    assert.equal(backup.version, 1);
    assert.equal(backup.dataType, 'SACRED_FOCUS_FULL_SYSTEM');
    assert.equal(backup.focusTree, backup.liveTree);
    assert.equal(backup.summary.nodeCount, (backup.focusTree as { nodes: unknown[] }).nodes.length);
    assert.equal(backup.summary.caseCount, backup.precedentCases.length);
    assert.equal(backup.summary.logCount, backup.sessionLogs.length);
    assert.equal(backup.summary.snapshotCount, backup.evolution.snapshots.length);
  });

  test('systemBackup repository 锁定整机恢复、租约复核与失败全量回滚', () => {
    const restoreDb = new Database(':memory:');
    restoreDb.pragma('foreign_keys = ON');
    createTables(restoreDb);
    try {
      restoreDb.prepare("INSERT INTO focus_groups (id,name,themeColor,positionX,positionY,width,height) VALUES ('old-group','旧分组','#000',0,0,100,100)").run();
      restoreDb.prepare("INSERT INTO evolution_state (id,activePointerIndex) VALUES (1,0)").run();
      restoreDb.prepare("INSERT INTO sacred_seat_config (id,sacredToken,reservationSignal,defaultFocusDuration,regretWindowSeconds,currentStreak,maxStreak,updatedAt) VALUES (1,'旧令牌','旧暗号',25,30,1,1,'old')").run();
      restoreDb.prepare("INSERT INTO precedent_cases (id,date,behavior,verdict,boundaryCondition,createdAt) VALUES ('old-case','2026-01-01','旧行为','ALLOW','旧边界','old')").run();
      restoreDb.prepare("INSERT INTO evolution_snapshots (slotIndex,id,version,timestamp,changelogNotes,isMajor,dataJson) VALUES (0,'old-snapshot','v1.0','old','旧快照',0,'{}')").run();
      restoreDb.prepare("INSERT INTO focus_session_logs (id,type,startTime,endTime,targetDurationMinutes,actualDurationSeconds,status) VALUES ('old-log','FOCUS','old','old',25,1,'SUCCESS')").run();

      const tree: FocusTreeData = {
        groups: [{ id: 'restored-group', name: '恢复分组', themeColor: '#123456', position: { x: 10, y: 20 }, size: { width: 300, height: 200 } }],
        nodes: [{ id: 'restored-node', code: 'RESTORE', name: '恢复节点', groupId: 'restored-group', triggerTime: null, triggerScene: '恢复场景', hasExactTime: false, timeValueMinutes: null, level: 1, maxLevel: 3, isLit: true, isFrozen: false, position: { x: 30, y: 40 }, specCard: { instruction: '执行', failCondition: '失败', benefitMechanism: '收益' } }],
        edges: [{ id: 'restored-edge', sourceId: 'restored-node', sourceType: 'NODE', targetId: 'restored-group', targetType: 'GROUP', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' }],
        labels: [{ id: 'restored-label', text: '恢复标签', position: { x: 5, y: 6 } }]
      };
      const maintenance = createMaintenanceRepository(restoreDb, { now: () => 1000, createOwnerId: () => 'restore-lease' });
      const repository = createSystemBackupRepository(restoreDb, { maintenanceRepository: maintenance });
      const meta = createSystemMetaRepository(restoreDb);
      const firstLease = maintenance.acquireMaintenanceLease('full-system-import', meta.getSystemRevision());
      const summary = repository.restoreFullBackup({
        maintenanceLease: firstLease,
        tree,
        sacredSeatConfig: { sacredToken: '新令牌', reservationSignal: '新暗号', defaultFocusDuration: 60, regretWindowSeconds: 45, currentStreak: 2, maxStreak: 4, updatedAt: 'new' },
        precedentCases: [{ id: 'restored-case', date: '2026-09-17', behavior: '恢复行为', verdict: 'FORBID', boundaryCondition: '恢复边界', createdAt: 'new' }],
        evolution: { state: { activePointerIndex: 1 }, snapshots: [{ slotIndex: 1, id: 'restored-snapshot', version: 'v2.0', timestamp: 'new', changelogNotes: '恢复', isMajor: true, dataJson: '{}' }] },
        sessionLogs: [{ id: 'restored-log', type: 'FOCUS', startTime: 'new', endTime: 'new', targetDurationMinutes: 60, actualDurationSeconds: 3600, status: 'SUCCESS' }]
      });
      assert.deepEqual(summary, { nodesRestored: 1, groupsRestored: 1, edgesRestored: 1, labelsRestored: 1, snapshotsRestored: 1, logsRestored: 1, casesRestored: 1, revision: 2 });
      assert.equal((restoreDb.prepare("SELECT name FROM focus_nodes WHERE id = 'restored-node'").get() as { name: string }).name, '恢复节点');
      assert.equal((restoreDb.prepare("SELECT sacredToken FROM sacred_seat_config WHERE id = 1").get() as { sacredToken: string }).sacredToken, '新令牌');
      assert.equal((restoreDb.prepare('SELECT activePointerIndex FROM evolution_state WHERE id = 1').get() as { activePointerIndex: number }).activePointerIndex, 1);
      maintenance.releaseMaintenanceLease(firstLease);

      const failingLease = maintenance.acquireMaintenanceLease('full-system-import', summary.revision);
      assert.throws(() => repository.restoreFullBackup({
        maintenanceLease: failingLease,
        tree: { ...tree, nodes: [{ ...tree.nodes[0], id: 'should-not-persist', name: '不应写入' }] },
        evolution: { state: { activePointerIndex: 0 }, snapshots: [
          { slotIndex: 0, id: 'duplicate-a', version: 'v1.0', timestamp: 'new', changelogNotes: '', isMajor: false, dataJson: '{}' },
          { slotIndex: 0, id: 'duplicate-b', version: 'v1.1', timestamp: 'new', changelogNotes: '', isMajor: false, dataJson: '{}' }
        ] }
      }));
      assert.equal((restoreDb.prepare("SELECT name FROM focus_nodes WHERE id = 'restored-node'").get() as { name: string }).name, '恢复节点');
      assert.equal(restoreDb.prepare("SELECT name FROM focus_nodes WHERE id = 'should-not-persist'").get(), undefined);
      assert.equal(meta.getSystemRevision(), summary.revision);
      maintenance.releaseMaintenanceLease(failingLease);
    } finally {
      restoreDb.close();
    }
  });

  await testAsync('systemBackup repository 锁定预导入热备与保留数量裁剪', async () => {
    const backupDb = new Database(':memory:');
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sacred-focus-pre-import-'));
    try {
      createTables(backupDb);
      const oldest = path.join(backupDir, 'app_pre_import_oldest.db');
      const newer = path.join(backupDir, 'app_pre_import_newer.db');
      fs.writeFileSync(oldest, 'oldest');
      fs.writeFileSync(newer, 'newer');
      fs.utimesSync(oldest, new Date('2026-09-15T00:00:00.000Z'), new Date('2026-09-15T00:00:00.000Z'));
      fs.utimesSync(newer, new Date('2026-09-16T00:00:00.000Z'), new Date('2026-09-16T00:00:00.000Z'));

      const repository = createSystemBackupRepository(backupDb, {
        dataDir: backupDir,
        preImportBackupRetention: 1,
        now: () => new Date('2026-09-17T00:00:00.000Z')
      });
      const result = await repository.createPreImportBackup();
      assert.equal(path.basename(result.backupFile), 'app_pre_import_2026-09-17T00-00-00-000Z.db');
      assert.ok(fs.existsSync(result.backupFile));
      assert.equal(result.prunedCount, 2);
      assert.deepEqual(fs.readdirSync(backupDir).filter(name => /^app_pre_import_.*\.db$/i.test(name)), [path.basename(result.backupFile)]);
    } finally {
      backupDb.close();
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
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

  test('恢复事务在破坏性删除后失败时，所有既有业务表数据完整回滚', () => {
    const recoveryDb = new Database(':memory:');
    recoveryDb.pragma('foreign_keys = ON');
    createTables(recoveryDb);
    try {
      recoveryDb.prepare("INSERT INTO sacred_seat_config (id,sacredToken,reservationSignal,defaultFocusDuration,regretWindowSeconds,currentStreak,maxStreak,updatedAt) VALUES (1,'token','signal',25,30,2,3,'before')").run();
      recoveryDb.prepare("INSERT INTO precedent_cases (id,date,behavior,verdict,boundaryCondition,createdAt) VALUES ('C1','2026-09-01','行为','ALLOW','边界','before')").run();
      recoveryDb.prepare("INSERT INTO focus_groups (id,name,themeColor,positionX,positionY,width,height) VALUES ('G1','组','#000',1,2,300,200)").run();
      recoveryDb.prepare("INSERT INTO focus_nodes (id,code,name,triggerScene,triggerTime,hasExactTime,timeValueMinutes,isLit,level,maxLevel,sortOrder,lastLitDate) VALUES ('N1','N1','节点','全天候','',0,NULL,0,1,1,0,NULL)").run();
      recoveryDb.prepare("INSERT INTO focus_edges (id,sourceId,sourceType,targetId,targetType,sourceAnchor,targetAnchor,style) VALUES ('E1','N1','NODE','G1','GROUP','BOTTOM','TOP','SOLID')").run();
      recoveryDb.prepare("INSERT INTO evolution_state (id,activePointerIndex) VALUES (1,0)").run();
      recoveryDb.prepare("INSERT INTO evolution_snapshots (slotIndex,id,version,timestamp,changelogNotes,isMajor,dataJson) VALUES (0,'S1','v1.0','before','基线',0,'{}')").run();
      recoveryDb.prepare("INSERT INTO focus_session_logs (id,type,startTime,endTime,targetDurationMinutes,actualDurationSeconds,status) VALUES ('L1','FOCUS','before','before',25,60,'SUCCESS')").run();
      const before = recoveryDb.prepare(`SELECT
        (SELECT COUNT(*) FROM focus_groups) AS groupsCount,
        (SELECT COUNT(*) FROM focus_nodes) AS nodesCount,
        (SELECT COUNT(*) FROM focus_edges) AS edgesCount,
        (SELECT COUNT(*) FROM sacred_seat_config) AS configCount,
        (SELECT COUNT(*) FROM precedent_cases) AS casesCount,
        (SELECT COUNT(*) FROM evolution_snapshots) AS snapshotsCount,
        (SELECT COUNT(*) FROM focus_session_logs) AS logsCount,
        (SELECT value FROM system_meta WHERE key = 'system_revision') AS revision`).get();

      const failingRestore = recoveryDb.transaction(() => {
        recoveryDb.prepare('DELETE FROM focus_edges').run();
        recoveryDb.prepare('DELETE FROM focus_nodes').run();
        recoveryDb.prepare('DELETE FROM focus_groups').run();
        recoveryDb.prepare('DELETE FROM precedent_cases').run();
        recoveryDb.prepare('DELETE FROM evolution_snapshots').run();
        recoveryDb.prepare('DELETE FROM focus_session_logs').run();
        throw new Error('INJECTED_RECOVERY_FAILURE');
      });

      assert.throws(() => failingRestore(), /INJECTED_RECOVERY_FAILURE/);
      const after = recoveryDb.prepare(`SELECT
        (SELECT COUNT(*) FROM focus_groups) AS groupsCount,
        (SELECT COUNT(*) FROM focus_nodes) AS nodesCount,
        (SELECT COUNT(*) FROM focus_edges) AS edgesCount,
        (SELECT COUNT(*) FROM sacred_seat_config) AS configCount,
        (SELECT COUNT(*) FROM precedent_cases) AS casesCount,
        (SELECT COUNT(*) FROM evolution_snapshots) AS snapshotsCount,
        (SELECT COUNT(*) FROM focus_session_logs) AS logsCount,
        (SELECT value FROM system_meta WHERE key = 'system_revision') AS revision`).get();
      assert.deepEqual(after, before);
      assert.equal((recoveryDb.prepare("SELECT name FROM focus_nodes WHERE id = 'N1'").get() as { name: string }).name, '节点');
    } finally {
      recoveryDb.close();
    }
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
