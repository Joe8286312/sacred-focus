import { Request } from 'express';
import { config } from '../config.js';

export function getClientIp(req: Request): string {
  // 生产环境下借助 Express app.set('trust proxy', 1) 获取受信任代理传递的真实客户端 IP
  // 杜绝直接提取 req.headers['x-forwarded-for'].split(',')[0] 造成的伪造标头与限流绕过 (P0-001)
  const rawIp = req.ip || req.socket.remoteAddress || '';
  return rawIp.replace(/^::ffff:/i, '').trim();
}

export function isLocalOrTrusted(req: Request): boolean {
  const ip = getClientIp(req);

  // 1. 本机回环 IP
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '') {
    return true;
  }

  // 2. 局域网私有网段 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
  ) {
    return true;
  }

  // 3. 用户显式配置的受信任公网 IP 白名单
  if (config.trustedIps && config.trustedIps.includes(ip)) {
    return true;
  }

  return false;
}
