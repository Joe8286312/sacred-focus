import { Router, Request, Response } from 'express';
import { config } from '../config.js';

import { db } from '../db.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import { safeCompare } from '../middleware/auth.js';
import { createAuthRepository } from '../repositories/authRepository.js';
import { createAuthService } from '../services/authService.js';

const router = Router();
const repository = createAuthRepository(db);
const service = createAuthService({
  authRepository: repository,
  jwtSecret: config.jwtSecret,
  configuredAdminPasswordHash: config.adminPasswordHash,
  initialAdminPassword: config.initialAdminPassword || 'admin123456'
});

// 获取当前系统有效管理员密码哈希
export function getAdminPasswordHash(): string {
  const result = service.getAdminPasswordHash();
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

  const result = await service.login(password);
  if (!result) {
    return res.status(401).json({
      error: 'INVALID_PASSWORD',
      message: '神圣契约拒绝访问：密码错误，请核验后重试'
    });
  }

  if (result.initializedPasswordHash) {
    console.info('[Sacred Focus Auth] 初始管理员密码哈希已生成并持久化');
  }

  // 生产环境只接受 HTTPS 会话；本地开发仍可通过 HTTP 使用 Lax Cookie。
  const isSecure = config.isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';

  res.cookie('sf_token', result.token, {
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

  const session = service.getSessionStatus(token);
  return res.json(session.isAuthenticated ? { isAuthenticated: true, user: session.user } : { isAuthenticated: false });
});

// 安全登出（清理 Cookie 并持久化吊销 JWT jti）
router.post('/logout', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'] || '';
  const headerToken = authHeader.replace(/^Bearer\s+/i, '').trim() || (req.headers['x-access-token'] as string);
  const cookieToken = req.cookies ? req.cookies['sf_token'] : undefined;
  const token = headerToken || cookieToken;

  if (token) {
    service.revokeToken(token);
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
