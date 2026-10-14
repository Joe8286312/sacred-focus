import { Router, Request, Response } from 'express';
import { config } from '../config.js';

import { rootDb } from '../db/connection.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import { getRequestToken } from '../middleware/auth.js';
import { createAuthRepository } from '../repositories/authRepository.js';
import { createAccountRepository } from '../repositories/accountRepository.js';
import { PUBLIC_USER, createAuthService, isValidUsername, isValidLoginPassword } from '../services/authService.js';

const router = Router();
const repository = createAuthRepository(rootDb);
const service = createAuthService({
  authRepository: repository,
  accountRepository: createAccountRepository(rootDb),
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
async function handleLogin(req: Request, res: Response) {
  const { password, username = 'admin' } = req.body || {};

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'PASSWORD_REQUIRED', message: '请输入账号密码' });
  }
  if (!isValidLoginPassword(password)) {
    return res.status(400).json({ error: 'PASSWORD_TOO_LONG', message: '密码不能超过 72 个 UTF-8 字节' });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'INVALID_USERNAME', message: '用户名须为 3–32 位字母、数字、点、下划线或连字符' });
  }

  const result = await service.login(password, username);
  if (!result) {
    return res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: '账号或密码错误，或该账号已停用'
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
    user: result.user,
    expiresInDays: 30,
    message: '契约核验通过，欢迎进入 Sacred Focus'
  });
}

router.post('/login', loginLimiter, (req, res, next) => {
  void handleLogin(req, res).catch(next);
});

// 获取当前会话认证状态
router.get('/status', (req: Request, res: Response) => {
  // 失效 Cookie 必须移除，否则公用状态页之后的业务请求会不断触发 401 刷新。
  if (req.user?.role === 'public' && getRequestToken(req)) {
    const isSecure = config.isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie('sf_token', { httpOnly: true, secure: isSecure, sameSite: isSecure ? 'strict' : 'lax' });
  }
  return res.json({ isAuthenticated: true, user: req.user ?? PUBLIC_USER });
});

// 安全登出（清理 Cookie 并持久化吊销 JWT jti）
router.post('/logout', (req: Request, res: Response) => {
  const token = getRequestToken(req);

  if (token) {
    service.revokeToken(token);
  }

  const isSecure = config.isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie('sf_token', {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax'
  });
  res.json({ success: true, user: PUBLIC_USER, message: '已退出个人账号，返回公用空间' });
});


export default router;
