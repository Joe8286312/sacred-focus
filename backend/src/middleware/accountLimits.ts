import type { Request, Response, NextFunction } from 'express';
import { db } from '../db.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function accountLimits(req: Request, res: Response, next: NextFunction) {
  const path = req.path.toLowerCase().replace(/\/+$/, '');
  if (!WRITE_METHODS.has(req.method) || path.startsWith('/auth/')) return next();
  if (req.user?.role === 'public' && path === '/system/import') {
    return res.status(403).json({ error: 'PERSONAL_ACCOUNT_REQUIRED', message: '公用账号不支持覆盖整个工作区，请先登录个人账号' });
  }
  const pages = db.pragma('page_count', { simple: true }) as number;
  const maxPages = db.pragma('max_page_count', { simple: true }) as number;
  if (pages >= maxPages && req.method !== 'DELETE') {
    return res.status(507).json({ error: 'ACCOUNT_STORAGE_LIMIT', message: '当前账号存储空间已达到服务器上限，请清理数据或联系管理员' });
  }
  return next();
}
