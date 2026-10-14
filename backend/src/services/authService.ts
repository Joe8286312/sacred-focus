import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import type { AuthJwtPayload, AuthUser } from '../types.js';
import type { AuthRepository } from '../repositories/authRepository.js';
import type { AccountRepository } from '../repositories/accountRepository.js';

const TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export const PUBLIC_USER: AuthUser = { id: 'public', username: 'public', role: 'public' };
export const ADMIN_USER: AuthUser = { id: 'admin', username: 'admin', role: 'admin' };

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: unknown): username is string {
  return typeof username === 'string' && /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(normalizeUsername(username));
}

export function isValidLoginPassword(password: unknown): password is string {
  // bcrypt 只处理前 72 个 UTF-8 字节，拒绝更长密码，避免不同密码被视为相同凭据。
  return typeof password === 'string' && password.length > 0 && Buffer.byteLength(password, 'utf8') <= 72;
}

export interface AuthSessionStatus {
  isAuthenticated: boolean;
  user?: AuthUser;
  isRevoked?: boolean;
}

export interface AuthServiceDependencies {
  authRepository: AuthRepository;
  accountRepository?: Pick<AccountRepository, 'findByUsername' | 'findById'>;
  jwtSecret: string;
  configuredAdminPasswordHash?: string;
  initialAdminPassword: string;
  now?: () => number;
  createJti?: () => string;
  comparePassword?: (password: string, hash: string) => Promise<boolean>;
  signToken?: (payload: AuthJwtPayload & { timestamp: number }) => string;
  verifyToken?: (token: string) => AuthJwtPayload;
  decodeToken?: (token: string) => { jti?: string; exp?: number } | null;
}

/** 认证应用服务：组合密码哈希、JWT 和吊销 repository，不感知 HTTP/Cookie。 */
export function createAuthService({
  authRepository,
  accountRepository,
  jwtSecret,
  configuredAdminPasswordHash,
  initialAdminPassword,
  now = Date.now,
  createJti = randomUUID,
  comparePassword = bcrypt.compare,
  signToken = payload => jwt.sign(payload, jwtSecret, { expiresIn: '30d' }),
  verifyToken = token => jwt.verify(token, jwtSecret) as AuthJwtPayload,
  decodeToken = token => jwt.decode(token) as { jti?: string; exp?: number } | null
}: AuthServiceDependencies) {
  function getAdminPasswordHash() {
    return authRepository.getAdminPasswordHash({
      configuredHash: configuredAdminPasswordHash,
      initialPassword: initialAdminPassword
    });
  }

  async function login(password: string, username = 'admin'): Promise<{ token: string; initializedPasswordHash: boolean; user: AuthUser } | undefined> {
    if (!isValidLoginPassword(password) || !isValidUsername(username)) return undefined;

    const normalizedUsername = normalizeUsername(username);
    const isAdmin = normalizedUsername === 'admin';
    const account = isAdmin ? undefined : accountRepository?.findByUsername(normalizedUsername);
    const passwordHash = isAdmin
      ? getAdminPasswordHash()
      : { hash: account?.passwordHash ?? getAdminPasswordHash().hash, initialized: false };
    // 对不存在的用户名也执行密码比较，避免以响应时间泄露账号是否存在。
    const isValid = await comparePassword(password, passwordHash.hash);
    if (!isValid || (!isAdmin && (!account || account.disabled || account.id === 'public' || account.id === 'admin'))) return undefined;

    const user: AuthUser = isAdmin
      ? { ...ADMIN_USER }
      : { id: account!.id, username: account!.username, role: 'user' };
    const token = signToken({
      ...user,
      ...(account ? { sessionVersion: account.sessionVersion } : {}),
      jti: createJti(),
      timestamp: now()
    });
    return { token, initializedPasswordHash: passwordHash.initialized, user };
  }

  function getSessionStatus(token: string, { purgeExpiredRevocations = false }: { purgeExpiredRevocations?: boolean } = {}): AuthSessionStatus {
    try {
      const payload = verifyToken(token);
      if (!payload || typeof payload !== 'object') return { isAuthenticated: false };
      if (payload.jti && authRepository.isJtiRevoked(payload.jti, { purgeExpired: purgeExpiredRevocations })) {
        return { isAuthenticated: false, isRevoked: true };
      }
      if (payload.role === 'admin') {
        // 升级前 JWT 只有 role/jti；仍映射到原来的管理员数据库。
        if ((payload.id !== undefined && payload.id !== 'admin') || (payload.username !== undefined && payload.username !== 'admin')) {
          return { isAuthenticated: false };
        }
        return { isAuthenticated: true, user: { ...payload, ...ADMIN_USER } };
      }
      if (payload.role !== 'user' || typeof payload.id !== 'string' || typeof payload.username !== 'string' || !Number.isSafeInteger(payload.sessionVersion)) {
        return { isAuthenticated: false };
      }
      const account = accountRepository?.findById(payload.id);
      if (!account || account.disabled || account.id === 'public' || account.id === 'admin'
        || account.username !== payload.username || account.sessionVersion !== payload.sessionVersion) {
        return { isAuthenticated: false };
      }
      return { isAuthenticated: true, user: { ...payload, id: account.id, username: account.username, role: 'user' } };
    } catch {
      return { isAuthenticated: false };
    }
  }

  function revokeToken(token: string): void {
    try {
      // 公用账号也能登出，因此不能用未核验的 JWT 向全局吊销名单写入任意记录。
      verifyToken(token);
      const decoded = decodeToken(token);
      if (typeof decoded?.jti !== 'string' || !decoded.jti || decoded.jti.length > 128) return;
      authRepository.revokeJti(decoded.jti, decoded.exp ? decoded.exp * 1000 : now() + TOKEN_LIFETIME_MS);
    } catch {
      // 与旧实现一致：无法解析的 token 仍可安全登出，但不写入吊销名单。
    }
  }

  function purgeExpiredRevocations(): number {
    return authRepository.purgeExpiredRevokedJtis();
  }

  return { getAdminPasswordHash, login, getSessionStatus, revokeToken, purgeExpiredRevocations };
}
