import express, { Request, Response, NextFunction } from 'express';

import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { initDatabase } from './db.js';

import { securityFilter } from './middleware/security.js';
import { apiGeneralLimiter } from './middleware/rateLimiter.js';
import { authMiddleware } from './middleware/auth.js';

import authRouter from './routes/auth.js';
import syncRouter from './routes/sync.js';
import sacredSeatRouter from './routes/sacredSeat.js';
import casesRouter from './routes/cases.js';
import focusTreeRouter from './routes/focusTree.js';
import evolutionRouter from './routes/evolution.js';
import systemRouter from './routes/system.js';

// 初始化数据库表与种子数据
initDatabase();

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

// 2. 通用 API 请求限流器 (已认证 1000次/分，未认证 60次/分，本机豁免)
app.use('/api', apiGeneralLimiter);

// 3. 全局统一身份鉴权中间件 (支持白名单放行与双轨 JWT/Cookie 校验)
app.use('/api', authMiddleware);

// 核心业务与系统路由挂载
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
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

app.listen(PORT, HOST, () => {
  console.log(`[Sacred Focus API] Server running at http://${HOST}:${PORT}`);
  console.log(`[Sacred Focus API] Mode: ${config.isProduction ? 'Production' : 'Development'}`);
  console.log(`[Sacred Focus API] Database path: ${config.dbPath}`);
});
