import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const rawJwtSecret = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';
const trustProxy = process.env.TRUST_PROXY === '1';

const BANNED_SECRETS = [
  'sacred_focus_super_secret_jwt_key_32chars_2026',
  'sacred_focus_default_jwt_secret_change_in_production_2026',
  'SacredFocus_Production_Secure_JWT_Key_2026_ChangeMeImmediately!',
  '<GENERATE_HIGH_ENTROPY_JWT_SECRET_MIN_32_CHARS>'
];

const BANNED_ADMIN_PASSWORDS = [
  'admin123456',
  'SacredFocus@Admin2026',
  '123456',
  'admin',
  'password',
  '<SET_STRONG_ADMIN_PASSWORD_MIN_12_CHARS>'
];

function isWeakOrPlaceholderSecret(secret: string): boolean {
  const lower = secret.toLowerCase();
  return (
    secret.length < 32 ||
    lower.includes('change_in_production') ||
    lower.includes('changeme') ||
    lower.includes('example') ||
    lower.includes('placeholder') ||
    lower.includes('<generate') ||
    BANNED_SECRETS.includes(secret)
  );
}

function isWeakOrPlaceholderPassword(pwd: string): boolean {
  const lower = pwd.toLowerCase();
  return (
    pwd.length < 8 ||
    lower.includes('admin2026') ||
    lower.includes('123456') ||
    lower.includes('changeme') ||
    lower.includes('placeholder') ||
    lower.includes('<set_strong') ||
    BANNED_ADMIN_PASSWORDS.includes(pwd)
  );
}

const rawAdminPassword = process.env.ADMIN_PASSWORD;
const rawAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

// 生产环境下强制校验 JWT 密钥与管理员初始密码强度，杜绝默认弱口令与公开预设密钥 (P0-001)
if (isProduction) {
  if (!rawJwtSecret || isWeakOrPlaceholderSecret(rawJwtSecret)) {
    throw new Error('[FATAL] JWT_SECRET 未配置、包含已知预设/占位符弱口令或长度不足 32 位，生产模式拒绝启动');
  }

  if (!rawAdminPasswordHash) {
    if (!rawAdminPassword || isWeakOrPlaceholderPassword(rawAdminPassword)) {
      throw new Error('[FATAL] 生产环境下 ADMIN_PASSWORD 未配置、包含已知默认弱口令或示例占位符，生产模式拒绝启动');
    }
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
  // 仅在 Nginx 组合编排中显式开启，避免直接访问应用端口时伪造 X-Forwarded-For。
  trustProxy,
  isProduction,
  get dbPath() {
    return path.join(this.dataDir, 'app.db');
  }
};
