import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  appAccessToken: process.env.APP_ACCESS_TOKEN || '',
  dataDir: process.env.DATA_DIR || path.resolve(__dirname, '../data'),
  jwtSecret: process.env.JWT_SECRET || 'sacred_focus_default_jwt_secret_change_in_production_2026',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  initialAdminPassword: process.env.ADMIN_PASSWORD || 'admin123456',
  trustedIps: (process.env.TRUSTED_IPS || '').split(',').map(s => s.trim()).filter(Boolean),
  isProduction: process.env.NODE_ENV === 'production',
  get dbPath() {
    return path.join(this.dataDir, 'app.db');
  }
};
