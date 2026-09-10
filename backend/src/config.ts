import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const rawJwtSecret = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

const BANNED_SECRETS = [
  'sacred_focus_super_secret_jwt_key_32chars_2026',
  'sacred_focus_default_jwt_secret_change_in_production_2026'
];

// 生产环境下强制校验 JWT 密钥强度，杜绝默认弱口令哑弹与公开预设密钥 (P0-002)
if (isProduction) {
  if (
    !rawJwtSecret ||
    rawJwtSecret.length < 32 ||
    rawJwtSecret.includes('change_in_production') ||
    BANNED_SECRETS.includes(rawJwtSecret)
  ) {
    throw new Error('[FATAL] JWT_SECRET 未配置、包含已知预设弱口令或长度不足 32 位，生产模式拒绝启动');
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  appAccessToken: process.env.APP_ACCESS_TOKEN || '',
  dataDir: process.env.DATA_DIR || path.resolve(__dirname, '../data'),
  jwtSecret: rawJwtSecret || 'sacred_focus_default_jwt_secret_change_in_production_2026',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  initialAdminPassword: process.env.ADMIN_PASSWORD || 'admin123456',
  trustedIps: (process.env.TRUSTED_IPS || '').split(',').map(s => s.trim()).filter(Boolean),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5180,http://127.0.0.1:5173,http://127.0.0.1:5180')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  isProduction,
  get dbPath() {
    return path.join(this.dataDir, 'app.db');
  }
};

