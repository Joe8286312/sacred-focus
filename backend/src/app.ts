import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { securityFilter } from './middleware/security.js';
import { apiGeneralLimiter } from './middleware/rateLimiter.js';
import { authMiddleware } from './middleware/auth.js';
import { maintenanceGuard } from './middleware/maintenance.js';
import authRouter from './routes/auth.js';
import syncRouter from './routes/sync.js';
import sacredSeatRouter from './routes/sacredSeat.js';
import casesRouter from './routes/cases.js';
import focusTreeRouter from './routes/focusTree.js';
import evolutionRouter from './routes/evolution.js';
import systemRouter from './routes/system.js';
import { getUnhandledErrorResponse } from './http/unhandledErrorResponse.js';

export interface CreateAppDependencies {
  appConfig?: Pick<typeof config, 'trustProxy' | 'isProduction' | 'allowedOrigins'>;
  frontendDist?: string | false;
  reportError?: (message: string, error: unknown) => void;
}

function resolveFrontendDist(): string {
  const defaultDist = path.resolve(__dirname, '../../frontend/dist');
  const cwdDist = path.resolve(process.cwd(), '../frontend/dist');
  return process.env.FRONTEND_DIST
    ? path.resolve(process.env.FRONTEND_DIST)
    : (fs.existsSync(defaultDist) ? defaultDist : cwdDist);
}

/** HTTP 组合根：只装配中间件、路由和静态资源，不初始化数据库或监听端口。 */
export function createApp({
  appConfig = config,
  frontendDist = resolveFrontendDist(),
  reportError = (message, error) => console.error(message, error)
}: CreateAppDependencies = {}) {
  const app = express();
  app.set('trust proxy', appConfig.trustProxy ? 1 : false);

  app.use(helmet({
    contentSecurityPolicy: appConfig.isProduction ? {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], fontSrc: ["'self'"],
        objectSrc: ["'none'"], baseUri: ["'self'"]
      }
    } : false,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    hidePoweredBy: true
  }));

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || appConfig.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS policy violation: Origin '${origin}' is not allowed`));
    },
    credentials: true
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '15mb' }));
  app.use(securityFilter);
  app.use('/api', authMiddleware);
  app.use('/api', maintenanceGuard);
  app.use('/api', apiGeneralLimiter);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: process.env.APP_VERSION || '1.0.0', timestamp: new Date().toISOString(), service: 'sacred-focus-backend' });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/sacred-seat', sacredSeatRouter);
  app.use('/api/cases', casesRouter);
  app.use('/api/focus-tree', focusTreeRouter);
  app.use('/api/evolution', evolutionRouter);
  app.use('/api/system', systemRouter);

  if (frontendDist && fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (_req: Request, res: Response) => res.sendFile(path.join(frontendDist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    reportError('[Sacred Focus Server] Unhandled internal error:', err);
    if (res.headersSent) return;
    const response = getUnhandledErrorResponse(err, appConfig.isProduction);
    res.status(response.status).json(response.body);
  });

  return app;
}
