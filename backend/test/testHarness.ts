export interface TestSummary {
  passedCount: number;
  failedCount: number;
}

export interface TestHarnessLogger {
  log(message: string): void;
  error(message: string): void;
}

export interface TestHarness {
  test(name: string, fn: () => void | Promise<void>): void;
  testAsync(name: string, fn: () => Promise<void>): Promise<void>;
  getSummary(): TestSummary;
}

function getFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 顺序契约测试的最小运行器。
 * 保留既有同步用例的即时执行语义；异步用例必须显式使用 testAsync。
 */
export function createTestHarness(logger: TestHarnessLogger = console): TestHarness {
  let passedCount = 0;
  let failedCount = 0;

  function test(name: string, fn: () => void | Promise<void>): void {
    try {
      fn();
      logger.log(`  [PASS] ${name}`);
      passedCount++;
    } catch (error: unknown) {
      logger.error(`  [FAIL] ${name}`);
      logger.error(`         ${getFailureMessage(error)}`);
      failedCount++;
    }
  }

  async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      logger.log(`  [PASS] ${name}`);
      passedCount++;
    } catch (error: unknown) {
      logger.error(`  [FAIL] ${name}`);
      logger.error(`         ${getFailureMessage(error)}`);
      failedCount++;
    }
  }

  return {
    test,
    testAsync,
    getSummary: () => ({ passedCount, failedCount })
  };
}
