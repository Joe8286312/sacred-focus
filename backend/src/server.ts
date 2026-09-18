import { config } from './config.js';
import { db, initDatabase } from './db.js';
import { purgeExpiredRevokedJtis } from './middleware/auth.js';
import { createApp } from './app.js';

interface ServerInstance {
  close(callback: () => void): unknown;
}

interface StartableApplication {
  listen(port: number, host: string, callback: () => void): ServerInstance;
}

interface LifecycleTimer {
  unref(): unknown;
}

export interface ServerLifecycleRuntime {
  setInterval(callback: () => void, delay: number): LifecycleTimer;
  clearInterval(timer: LifecycleTimer): void;
  setTimeout(callback: () => void, delay: number): LifecycleTimer;
}

export interface ServerLifecycleProcess {
  on(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  exit(code: number): void;
}

export interface StartServerDependencies {
  initializeDatabase?: () => void;
  purgeExpiredRevokedJtis?: () => void;
  appFactory?: () => StartableApplication;
  database?: Pick<typeof db, 'pragma' | 'close'>;
  serverConfig?: Pick<typeof config, 'port' | 'host' | 'isProduction' | 'dbPath'>;
  runtime?: ServerLifecycleRuntime;
  processRef?: ServerLifecycleProcess;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

/** 启动层：初始化持久化、监听端口并管理进程生命周期。 */
export function startServer(dependencies: StartServerDependencies = {}): ServerInstance {
  const initializeDatabase = dependencies.initializeDatabase ?? initDatabase;
  const purgeExpiredJtis = dependencies.purgeExpiredRevokedJtis ?? purgeExpiredRevokedJtis;
  const appFactory = dependencies.appFactory ?? createApp;
  const database = dependencies.database ?? db;
  const serverConfig = dependencies.serverConfig ?? config;
  const runtime = dependencies.runtime ?? {
    setInterval: (callback: () => void, delay: number) => setInterval(callback, delay),
    clearInterval: (timer: LifecycleTimer) => clearInterval(timer as NodeJS.Timeout),
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay)
  };
  const processRef = dependencies.processRef ?? process;
  const logger = dependencies.logger ?? console;

  initializeDatabase();
  purgeExpiredJtis();

  const app = appFactory();
  const server = app.listen(serverConfig.port, serverConfig.host, () => {
    logger.log(`[Sacred Focus API] Server running at http://${serverConfig.host}:${serverConfig.port}`);
    logger.log(`[Sacred Focus API] Mode: ${serverConfig.isProduction ? 'Production' : 'Development'}`);
    logger.log(`[Sacred Focus API] Database path: ${serverConfig.dbPath}`);
  });

  const walCheckpointTimer = runtime.setInterval(() => {
    try {
      database.pragma('wal_checkpoint(PASSIVE)');
      purgeExpiredJtis();
    } catch (err) {
      logger.warn('[Sacred Focus API] 定时 WAL Checkpoint 出现偶发异常:', err);
    }
  }, 30 * 60 * 1000);
  walCheckpointTimer.unref();

  function gracefulShutdown(signal: string) {
    logger.log(`[Sacred Focus API] 接收到 ${signal} 信号，正在平滑关闭 HTTP 服务与归档 SQLite WAL...`);
    runtime.clearInterval(walCheckpointTimer);
    server.close(() => {
      try {
        database.pragma('wal_checkpoint(TRUNCATE)');
        database.close();
        logger.log('[Sacred Focus API] SQLite 数据库已安全 Checkpoint 截断并关闭，进程正常退出');
        processRef.exit(0);
      } catch (err) {
        logger.error('[Sacred Focus API] 优雅关机过程中关闭数据库异常:', err);
        processRef.exit(1);
      }
    });
    runtime.setTimeout(() => {
      logger.warn('[Sacred Focus API] 优雅关机等待超时，强制终止进程');
      processRef.exit(1);
    }, 10000).unref();
  }

  processRef.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  processRef.on('SIGINT', () => gracefulShutdown('SIGINT'));
  return server;
}

const isDirectEntry = Boolean(process.argv[1] && /(?:^|[\\/])server\.(?:ts|js)$/.test(process.argv[1]));
if (isDirectEntry) {
  startServer();
}
