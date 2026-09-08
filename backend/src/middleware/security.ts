import { Request, Response, NextFunction } from 'express';
import { isLocalOrTrusted, getClientIp } from './ipRules.js';

const HONEYPOT_PATHS = [
  '/.env',
  '/.git',
  '/wp-login.php',
  '/admin.php',
  '/phpmyadmin',
  '/actuator'
];

const BANNED_UA_PATTERNS = [
  /python-requests/i,
  /Scrapy/i,
  /Go-http-client/i,
  /zgrab/i
];

// 内存级临时封禁黑名单 (IP -> 解封时间戳)
const ipBlacklist = new Map<string, number>();

export function securityFilter(req: Request, res: Response, next: NextFunction) {
  // 本机与可信内网完全放行
  if (isLocalOrTrusted(req)) {
    return next();
  }

  const clientIp = getClientIp(req);
  const now = Date.now();

  // 1. 检查黑名单
  const unbanTime = ipBlacklist.get(clientIp);
  if (unbanTime) {
    if (now < unbanTime) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: '由于异常网络探测行为，该 IP 已被安全系统临时封锁' });
    } else {
      ipBlacklist.delete(clientIp);
    }
  }

  // 2. 蜜罐路径拦截与封禁
  const lowerPath = req.path.toLowerCase();
  if (HONEYPOT_PATHS.some(hp => lowerPath.startsWith(hp))) {
    console.warn(`[Sacred Focus Security] Honeypot trap triggered by ${clientIp} on path ${req.path}`);
    ipBlacklist.set(clientIp, now + 72 * 60 * 60 * 1000); // 封禁 72 小时
    return res.status(403).json({ error: 'SECURITY_TRAP_TRIGGERED' });
  }

  // 3. 爬虫特征 User-Agent 过滤
  const ua = req.headers['user-agent'] || '';
  if (BANNED_UA_PATTERNS.some(re => re.test(ua))) {
    return res.status(403).json({ error: 'CRAWLER_BLOCKED', message: 'Automated scraping tools are not permitted' });
  }

  next();
}
