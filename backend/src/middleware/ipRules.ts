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

  // 1. 本机回环 IP (本地单机开发免密与单机调用放行)
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '') {
    return true;
  }

  // 2. 仅当用户在环境变量中显式配置 TRUSTED_IPS 时，特定受信任局域网/公网 IP 方可豁免 (P1-SEC-01)
  // 杜绝盲目信任所有 192.168.x.x / 10.x.x.x / 172.16-31.x.x，防范公用/共享网络下的密码爆破与限流穿透
  if (config.trustedIps && config.trustedIps.length > 0 && config.trustedIps.includes(ip)) {
    return true;
  }

  return false;
}
