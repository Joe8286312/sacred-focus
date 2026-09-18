import { config } from './config.js';
import { db, initDatabase } from './db.js';
import { purgeExpiredRevokedJtis } from './middleware/auth.js';
import { createApp } from './app.js';

/** 启动层：初始化持久化、监听端口并管理进程生命周期。 */
export function startServer() {
  initDatabase();
  purgeExpiredRevokedJtis();

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`[Sacred Focus API] Server running at http://${config.host}:${config.port}`);
    console.log(`[Sacred Focus API] Mode: ${config.isProduction ? 'Production' : 'Development'}`);
    console.log(`[Sacred Focus API] Database path: ${config.dbPath}`);
  });

  const walCheckpointTimer = setInterval(() => {
    try {
      db.pragma('wal_checkpoint(PASSIVE)');
      purgeExpiredRevokedJtis();
    } catch (err) {
      console.warn('[Sacred Focus API] 定时 WAL Checkpoint 出现偶发异常:', err);
    }
  }, 30 * 60 * 1000);
  walCheckpointTimer.unref();

  function gracefulShutdown(signal: string) {
    console.log(`[Sacred Focus API] 接收到 ${signal} 信号，正在平滑关闭 HTTP 服务与归档 SQLite WAL...`);
    clearInterval(walCheckpointTimer);
    server.close(() => {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
        console.log('[Sacred Focus API] SQLite 数据库已安全 Checkpoint 截断并关闭，进程正常退出');
        process.exit(0);
      } catch (err) {
        console.error('[Sacred Focus API] 优雅关机过程中关闭数据库异常:', err);
        process.exit(1);
      }
    });
    setTimeout(() => {
      console.warn('[Sacred Focus API] 优雅关机等待超时，强制终止进程');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  return server;
}

const isDirectEntry = Boolean(process.argv[1] && /(?:^|[\\/])server\.(?:ts|js)$/.test(process.argv[1]));
if (isDirectEntry) {
  startServer();
}
