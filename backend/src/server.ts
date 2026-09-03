import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { initDatabase } from './db.js';

import sacredSeatRouter from './routes/sacredSeat.js';
import casesRouter from './routes/cases.js';
import focusTreeRouter from './routes/focusTree.js';
import evolutionRouter from './routes/evolution.js';

// 初始化数据库表与种子数据
initDatabase();

const app = express();

app.use(cors());
app.use(express.json());

// Token 鉴权中间件 (如果服务端配置了 APP_ACCESS_TOKEN)
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health') {
    return next();
  }

  if (config.appAccessToken) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '') || (req.headers['x-access-token'] as string);
    if (token !== config.appAccessToken) {
      return res.status(401).json({ error: 'Unauthorized: Invalid access token' });
    }
  }

  next();
});

// 核心业务路由
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'sacred-focus-backend'
  });
});

app.use('/api/sacred-seat', sacredSeatRouter);
app.use('/api/cases', casesRouter);
app.use('/api/focus-tree', focusTreeRouter);
app.use('/api/evolution', evolutionRouter);

// 生产环境静态文件托管 (frontend/dist)
const frontendDist = path.resolve(process.cwd(), '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`[Sacred Focus API] Server running at http://localhost:${PORT}`);
  console.log(`[Sacred Focus API] Database path: ${config.dbPath}`);
});
