import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';
import { db } from '../db.js';
import { createAuthRepository } from '../repositories/authRepository.js';
import { createAuthService } from '../services/authService.js';

// 免鉴权白名单子路径（相对于 /api）
const PUBLIC_PATHS = [
  '/health',
  '/auth/login',
  '/auth/status',
  '/sync/status'
];
const repository = createAuthRepository(db);
const service = createAuthService({
  authRepository: repository,
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

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const isPublic = PUBLIC_PATHS.some(p => req.path === p);

  // 提取凭据（优先请求头 Authorization: Bearer，备选 Cookie 中的 sf_token）
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
    if (isPublic) return next();
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: '神圣契约拒绝未授权访问，请先验证管理员身份'
    });
  }

  const session = service.getSessionStatus(token, { purgeExpiredRevocations: true });
  if (session.isAuthenticated && session.user) {
    req.user = session.user;
    return next();
  }

  if (isPublic) return next();
  if (session.isRevoked) {
    return res.status(401).json({
      error: 'TOKEN_REVOKED',
      message: '该登录凭证已被安全注销，请重新登录'
    });
  }
  return res.status(401).json({
    error: 'TOKEN_EXPIRED_OR_INVALID',
    message: '登录凭证已过期或无效，请重新登录'
  });
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
