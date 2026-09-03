import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  appAccessToken: process.env.APP_ACCESS_TOKEN || '',
  dataDir: process.env.DATA_DIR || path.resolve(__dirname, '../data'),
  get dbPath() {
    return path.join(this.dataDir, 'app.db');
  }
};
