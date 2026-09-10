import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';
import { db } from '../db.js';
import type { AuthJwtPayload } from '../types.js';

// 免鉴权白名单子路径（相对于 /api）
const PUBLIC_PATHS = [
  '/health',
  '/auth/login',
  '/auth/status',
  '/sync/status'
];

export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. 白名单接口直接放行
  if (PUBLIC_PATHS.some(p => req.path === p)) {
    return next();
  }

  // 2. 提取凭据（优先请求头 Authorization: Bearer，备选 Cookie 中的 sf_token）
  const authHeader = req.headers['authorization'] || '';
  const headerToken = authHeader.replace(/^Bearer\s+/i, '').trim() || (req.headers['x-access-token'] as string);
  const cookieToken = req.cookies ? req.cookies['sf_token'] : undefined;
  const token = headerToken || cookieToken;

  // 向下兼容支持静态 APP_ACCESS_TOKEN（如果配置了），使用常量时间比较抵御时序攻击
  if (config.appAccessToken && token && safeCompare(token, config.appAccessToken)) {
    req.user = { role: 'admin', staticToken: true };
    return next();
  }


  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: '神圣契约拒绝未授权访问，请先验证管理员身份'
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthJwtPayload;

    // 检查 jti 是否已在系统吊销黑名单中
    if (decoded?.jti) {
      const revoked = db.prepare("SELECT value FROM system_meta WHERE key = ?")
        .get(`revoked_jti:${decoded.jti}`) as { value: string } | undefined;
      if (revoked) {
        const exp = parseInt(revoked.value, 10);
        if (isNaN(exp) || Date.now() < exp) {
          return res.status(401).json({
            error: 'TOKEN_REVOKED',
            message: '该登录凭证已被安全注销，请重新登录'
          });
        }
      }
    }

    req.user = decoded;
    next();

  } catch (err: any) {
    return res.status(401).json({
      error: 'TOKEN_EXPIRED_OR_INVALID',
      message: '登录凭证已过期或无效，请重新登录'
    });
  }
}

