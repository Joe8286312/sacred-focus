import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';

import { db } from '../db.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import { safeCompare } from '../middleware/auth.js';
import type { AuthJwtPayload } from '../types.js';
import { createAuthRepository } from '../repositories/authRepository.js';

const router = Router();
const repository = createAuthRepository(db);

// 获取当前系统有效管理员密码哈希
export function getAdminPasswordHash(): string {
  const result = repository.getAdminPasswordHash({
    configuredHash: config.adminPasswordHash,
    initialPassword: config.initialAdminPassword || 'admin123456'
  });
  if (result.initialized) {
    console.info('[Sacred Focus Auth] 初始管理员密码哈希已生成并持久化');
  }
  return result.hash;
}

// 登录验证并签发 30 天凭证
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { password } = req.body || {};

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'PASSWORD_REQUIRED', message: '请输入管理员访问密码' });
  }

  const hash = getAdminPasswordHash();
  // P2-003 性能治理：使用非阻塞异步 bcrypt.compare，彻底消除主线程 150-300ms 事件循环阻塞卡死风险
  const isValid = await bcrypt.compare(password, hash);

  if (!isValid) {
    return res.status(401).json({
      error: 'INVALID_PASSWORD',
      message: '神圣契约拒绝访问：密码错误，请核验后重试'
    });
  }

  // 签发 30 天有效期的 JWT，附加唯一 jti 防重放与支持主动吊销
  const jti = crypto.randomUUID();

  const token = jwt.sign(
    { role: 'admin', jti, timestamp: Date.now() },
    config.jwtSecret,
    { expiresIn: '30d' }
  );

  // 生产环境只接受 HTTPS 会话；本地开发仍可通过 HTTP 使用 Lax Cookie。
  const isSecure = config.isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';

  res.cookie('sf_token', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  return res.json({
    success: true,
    expiresInDays: 30,
    message: '契约核验通过，欢迎进入 Sacred Focus'
  });
});

// 获取当前会话认证状态
router.get('/status', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'] || '';
  const headerToken = authHeader.replace(/^Bearer\s+/i, '').trim() || (req.headers['x-access-token'] as string);
  const cookieToken = req.cookies ? req.cookies['sf_token'] : undefined;
  const token = headerToken || cookieToken;

  if (config.appAccessToken && token && safeCompare(token, config.appAccessToken)) {
    return res.json({ isAuthenticated: true, role: 'admin', staticToken: true });
  }

  if (!token) {
    return res.json({ isAuthenticated: false });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthJwtPayload;
    if (decoded?.jti) {
      if (repository.isJtiRevoked(decoded.jti)) {
        return res.json({ isAuthenticated: false });
      }
    }
    return res.json({ isAuthenticated: true, user: decoded });
  } catch (e) {
    return res.json({ isAuthenticated: false });
  }
});

// 安全登出（清理 Cookie 并持久化吊销 JWT jti）
router.post('/logout', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'] || '';
  const headerToken = authHeader.replace(/^Bearer\s+/i, '').trim() || (req.headers['x-access-token'] as string);
  const cookieToken = req.cookies ? req.cookies['sf_token'] : undefined;
  const token = headerToken || cookieToken;

  if (token) {
    try {
      const decoded = jwt.decode(token) as { jti?: string; exp?: number } | null;
      if (decoded?.jti) {
        const exp = decoded.exp ? decoded.exp * 1000 : Date.now() + 30 * 24 * 60 * 60 * 1000;
        repository.revokeJti(decoded.jti, exp);
      }
    } catch (e) {
      // 忽略解析错误
    }
  }

  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie('sf_token', {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax'
  });
  res.json({ success: true, message: '已安全登出自控中枢' });
});


export default router;
