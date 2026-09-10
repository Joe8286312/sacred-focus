import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';

import { db } from '../db.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import { safeCompare } from '../middleware/auth.js';
import type { AuthJwtPayload } from '../types.js';

const router = Router();

// 获取当前系统有效管理员密码哈希
export function getAdminPasswordHash(): string {
  // 1. 优先采用环境变量配置的哈希
  if (config.adminPasswordHash) {
    return config.adminPasswordHash;
  }

  // 2. 其次查询数据库持久化的哈希
  const row = db.prepare("SELECT value FROM system_meta WHERE key = 'admin_password_hash'").get() as { value: string } | undefined;
  if (row && row.value) {
    return row.value;
  }

  // 3. 若均未配置，利用初始密码自动加盐哈希并持久化
  const initialPassword = config.initialAdminPassword || 'admin123456';
  const newHash = bcrypt.hashSync(initialPassword, 12);
  db.prepare("INSERT OR REPLACE INTO system_meta (key, value) VALUES ('admin_password_hash', ?)").run(newHash);
  console.log(`[Sacred Focus Auth] 初始密码已生成并持久化。默认密码: ${initialPassword}`);
  return newHash;
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

  // 写入安全 HttpOnly Cookie
  res.cookie('sf_token', token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  return res.json({
    success: true,
    token,
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
      const revoked = db.prepare("SELECT value FROM system_meta WHERE key = ?")
        .get(`revoked_jti:${decoded.jti}`) as { value: string } | undefined;
      if (revoked) {
        const exp = parseInt(revoked.value, 10);
        if (isNaN(exp) || Date.now() < exp) {
          return res.json({ isAuthenticated: false });
        }
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
        db.prepare("INSERT OR REPLACE INTO system_meta (key, value) VALUES (?, ?)")
          .run(`revoked_jti:${decoded.jti}`, String(exp));
      }
    } catch (e) {
      // 忽略解析错误
    }
  }

  res.clearCookie('sf_token');
  res.json({ success: true, message: '已安全登出自控中枢' });
});


export default router;
