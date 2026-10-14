import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';
import { rootDb, runWithAccountDatabase } from '../db/connection.js';
import { createAuthRepository } from '../repositories/authRepository.js';
import { createAccountRepository } from '../repositories/accountRepository.js';
import { ADMIN_USER, PUBLIC_USER, createAuthService } from '../services/authService.js';
import type { AuthUser } from '../types.js';

// 这些端点在旧凭据失效时仍可查询状态或切换账号。
const SESSION_PATHS = [
  '/health',
  '/auth/login',
  '/auth/status',
  '/auth/logout'
];
const repository = createAuthRepository(rootDb);
const service = createAuthService({
  authRepository: repository,
  accountRepository: createAccountRepository(rootDb),
  jwtSecret: config.jwtSecret,
  configuredAdminPasswordHash: config.adminPasswordHash,
  initialAdminPassword: config.initialAdminPassword || 'admin123456'
});

export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function getRequestToken(req: Request): string | undefined {
  // 提取凭据（优先请求头 Authorization: Bearer，备选 Cookie 中的 sf_token）
  const authHeader = req.headers.authorization;
  const accessToken = req.headers['x-access-token'];
  const headerToken = (typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '')
    || (typeof accessToken === 'string' ? accessToken : '');
  const cookieToken = req.cookies?.sf_token;
  return headerToken || (typeof cookieToken === 'string' ? cookieToken : undefined);
}

function enterAccountScope(req: Request, res: Response, next: NextFunction, user: AuthUser): void {
  req.user = user;
  try {
    // 数据库连接保持到响应完成；异步路由和并发请求均继承同一账号上下文。
    const completion = runWithAccountDatabase(user.id, () => new Promise<void>((resolve, reject) => {
      function finish() {
        res.removeListener('finish', finish);
        res.removeListener('close', finish);
        resolve();
      }
      res.once('finish', finish);
      res.once('close', finish);
      try {
        next();
      } catch (error) {
        res.removeListener('finish', finish);
        res.removeListener('close', finish);
        reject(error);
      }
    }));
    void completion.catch(next);
  } catch (error) {
    next(error);
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestPath = req.path.replace(/\/+$/, '').toLowerCase();
  const isSessionPath = SESSION_PATHS.includes(requestPath);
  const token = getRequestToken(req);
  let user: AuthUser = { ...PUBLIC_USER };

  // 向下兼容支持静态 APP_ACCESS_TOKEN（如果配置了），使用常量时间比较抵御时序攻击
  if (config.appAccessToken && token && safeCompare(token, config.appAccessToken)) {
    user = { ...ADMIN_USER, staticToken: true };
  } else if (token) {
    const session = service.getSessionStatus(token, { purgeExpiredRevocations: true });
    if (session.isAuthenticated && session.user) {
      user = session.user;
    } else if (!isSessionPath) {
      return res.status(401).json({
        error: session.isRevoked ? 'TOKEN_REVOKED' : 'TOKEN_EXPIRED_OR_INVALID',
        message: session.isRevoked ? '该登录凭证已被安全注销，请重新登录' : '登录凭证已过期或无效，请重新登录'
      });
    }
  }

  // 旧标签页保留的草稿不能在 Cookie 已切换后写入另一个账号。
  const expectedAccountId = req.get('X-SF-Account-Id');
  if (!isSessionPath && expectedAccountId && expectedAccountId !== user.id) {
    return res.status(401).json({ error: 'ACCOUNT_CHANGED', message: '当前账号已切换，请刷新页面后继续操作' });
  }
  if (requestPath === '/health') {
    req.user = user;
    return next();
  }
  return enterAccountScope(req, res, next, user);
}

/**
 * 自动清理并淘汰已超期的 JWT 吊销黑名单记录，防范 system_meta 表无限膨胀 (P2-SEC-03)
 */
export function purgeExpiredRevokedJtis(): number {
  try {
    const purgedCount = service.purgeExpiredRevocations();
    if (purgedCount > 0) {
      console.log(`[Sacred Focus Auth] 已清理 ${purgedCount} 条过期 JWT 吊销记录`);
    }
    return purgedCount;
  } catch (err) {
    console.error('[Sacred Focus Auth] 清理过期 JTI 黑名单失败:', err);
    return 0;
  }
}
