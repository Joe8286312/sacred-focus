import express, { Request, Response } from 'express';
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
  contentSecurityPolicy: false, // 前后端同源静态托管或按需自定义
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' },
  hidePoweredBy: true
}));

app.use(cors({
  origin: true,
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
const frontendDist = path.resolve(process.cwd(), '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

const PORT = config.port;
const HOST = config.isProduction ? '127.0.0.1' : '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`[Sacred Focus API] Server running at http://${HOST}:${PORT}`);
  console.log(`[Sacred Focus API] Mode: ${config.isProduction ? 'Production (Loopback Only)' : 'Development'}`);
  console.log(`[Sacred Focus API] Database path: ${config.dbPath}`);
});
