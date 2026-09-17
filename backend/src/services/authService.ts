import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import type { AuthJwtPayload } from '../types.js';
import type { AuthRepository } from '../repositories/authRepository.js';

const TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthSessionStatus {
  isAuthenticated: boolean;
  user?: AuthJwtPayload;
  isRevoked?: boolean;
}

export interface AuthServiceDependencies {
  authRepository: AuthRepository;
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

  async function login(password: string): Promise<{ token: string; initializedPasswordHash: boolean } | undefined> {
    const passwordHash = getAdminPasswordHash();
    const isValid = await comparePassword(password, passwordHash.hash);
    if (!isValid) return undefined;

    const token = signToken({ role: 'admin', jti: createJti(), timestamp: now() });
    return { token, initializedPasswordHash: passwordHash.initialized };
  }

  function getSessionStatus(token: string, { purgeExpiredRevocations = false }: { purgeExpiredRevocations?: boolean } = {}): AuthSessionStatus {
    try {
      const user = verifyToken(token);
      if (user.jti && authRepository.isJtiRevoked(user.jti, { purgeExpired: purgeExpiredRevocations })) {
        return { isAuthenticated: false, isRevoked: true };
      }
      return { isAuthenticated: true, user };
    } catch {
      return { isAuthenticated: false };
    }
  }

  function revokeToken(token: string): void {
    try {
      const decoded = decodeToken(token);
      if (!decoded?.jti) return;
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
