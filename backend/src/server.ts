import express, { Request, Response, NextFunction } from 'express';

import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { db, initDatabase } from './db.js';

import { securityFilter } from './middleware/security.js';
import { apiGeneralLimiter } from './middleware/rateLimiter.js';
import { authMiddleware, purgeExpiredRevokedJtis } from './middleware/auth.js';
import { maintenanceGuard } from './middleware/maintenance.js';

import authRouter from './routes/auth.js';
import syncRouter from './routes/sync.js';
import sacredSeatRouter from './routes/sacredSeat.js';
import casesRouter from './routes/cases.js';
import focusTreeRouter from './routes/focusTree.js';
import evolutionRouter from './routes/evolution.js';
import systemRouter from './routes/system.js';

// 初始化数据库表与种子数据
initDatabase();
// 启动时清理已过期的历史 JWT 吊销黑名单 (P2-SEC-03)
purgeExpiredRevokedJtis();

const app = express();

// 信任第一层反向代理 (Nginx)，以准确提取 X-Forwarded-For 真实客户端 IP
app.set('trust proxy', 1);

// HTTP 安全头加固 (防御点击劫持、MIME嗅探、XSS注入并移除指纹)
app.use(helmet({
  contentSecurityPolicy: config.isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  } : false,
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' },
  hidePoweredBy: true
}));

const allowedOrigins = config.allowedOrigins;
app.use(cors({
  origin: (origin, callback) => {
    // 允许同源请求（无 origin）、本地脚本及白名单来源
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy violation: Origin '${origin}' is not allowed`));
  },
  credentials: true
}));


app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));

// 1. 全局爬虫特征过滤与蜜罐诱捕
app.use(securityFilter);

// 2. 全局统一身份鉴权中间件 (前置解析身份以向后继限流器提供 req.user 判定依据)
app.use('/api', authMiddleware);

// 整机恢复持有维护租约时，统一冻结所有外部写请求。
app.use('/api', maintenanceGuard);

// 3. 通用 API 请求限流器 (已认证 1000次/分，未认证 60次/分，本机豁免)
app.use('/api', apiGeneralLimiter);

// 核心业务与系统路由挂载
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    service: 'sacred-focus-backend'
  });
});

app.use('/api/auth', authRouter);
app.use('/api/sync', syncRouter);
app.use('/api/sacred-seat', sacredSeatRouter);
app.use('/api/cases', casesRouter);
app.use('/api/focus-tree', focusTreeRouter);
app.use('/api/evolution', evolutionRouter);
app.use('/api/system', systemRouter);

// 生产环境静态文件托管 (frontend/dist)
const defaultDist = path.resolve(__dirname, '../../frontend/dist');
const cwdDist = path.resolve(process.cwd(), '../frontend/dist');
const frontendDist = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : (fs.existsSync(defaultDist) ? defaultDist : cwdDist);

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 全局未捕获异常处理中间件 (防御堆栈泄漏、500 挂死与重复发送响应头)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Sacred Focus Server] Unhandled internal error:', err);
  if (res.headersSent) {
    return;
  }
  res.status(err.status || 500).json({
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: config.isProduction ? '服务器自控中枢发生内部异常，请稍后重试' : (err.message || 'Unknown Server Error')
  });
});

const PORT = config.port;
const HOST = config.host;

const server = app.listen(PORT, HOST, () => {
  console.log(`[Sacred Focus API] Server running at http://${HOST}:${PORT}`);
  console.log(`[Sacred Focus API] Mode: ${config.isProduction ? 'Production' : 'Development'}`);
  console.log(`[Sacred Focus API] Database path: ${config.dbPath}`);
});

// P3-PERF-02 空闲定时 WAL Checkpoint (每 30 分钟执行一次 PASSIVE 检查点，防范 WAL 文件长周期膨胀)
const walCheckpointTimer = setInterval(() => {
  try {
    db.pragma('wal_checkpoint(PASSIVE)');
    purgeExpiredRevokedJtis();
  } catch (err) {
    console.warn('[Sacred Focus API] 定时 WAL Checkpoint 出现偶发异常:', err);
  }
}, 30 * 60 * 1000);
walCheckpointTimer.unref();

// P2-OPS-01 优雅关机 (Graceful Shutdown) 与 SQLite WAL 归档释放
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

  // 超时 10 秒兜底，防范极端情况下挂起长连接导致容器无法停止
  setTimeout(() => {
    console.warn('[Sacred Focus API] 优雅关机等待超时，强制终止进程');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
