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

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthJwtPayload;

    // 检查 jti 是否已在系统吊销黑名单中
    if (decoded?.jti) {
      const revoked = db.prepare("SELECT value FROM system_meta WHERE key = ?")
        .get(`revoked_jti:${decoded.jti}`) as { value: string } | undefined;
      if (revoked) {
        const exp = parseInt(revoked.value, 10);
        if (isNaN(exp) || Date.now() < exp) {
          if (isPublic) return next();
          return res.status(401).json({
            error: 'TOKEN_REVOKED',
            message: '该登录凭证已被安全注销，请重新登录'
          });
        } else {
          // 该 token 自然过期时间已过，自动物理淘汰该吊销记录 (P2-SEC-03)
          try {
            db.prepare("DELETE FROM system_meta WHERE key = ?").run(`revoked_jti:${decoded.jti}`);
          } catch (_) {}
        }
      }
    }

    req.user = decoded;
    return next();

  } catch (err: any) {
    if (isPublic) return next();
    return res.status(401).json({
      error: 'TOKEN_EXPIRED_OR_INVALID',
      message: '登录凭证已过期或无效，请重新登录'
    });
  }
}

/**
 * 自动清理并淘汰已超期的 JWT 吊销黑名单记录，防范 system_meta 表无限膨胀 (P2-SEC-03)
 */
export function purgeExpiredRevokedJtis(): number {
  try {
    const rows = db.prepare("SELECT key, value FROM system_meta WHERE key LIKE 'revoked_jti:%'").all() as Array<{ key: string; value: string }>;
    const now = Date.now();
    let purgedCount = 0;
    const deleteStmt = db.prepare("DELETE FROM system_meta WHERE key = ?");
    const purgeTx = db.transaction(() => {
      for (const r of rows) {
        const exp = parseInt(r.value, 10);
        if (!isNaN(exp) && now >= exp) {
          deleteStmt.run(r.key);
          purgedCount++;
        }
      }
    });
    purgeTx();
    if (purgedCount > 0) {
      console.log(`[Sacred Focus Auth] 已清理 ${purgedCount} 条过期 JWT 吊销记录`);
    }
    return purgedCount;
  } catch (err) {
    console.error('[Sacred Focus Auth] 清理过期 JTI 黑名单失败:', err);
    return 0;
  }
}

