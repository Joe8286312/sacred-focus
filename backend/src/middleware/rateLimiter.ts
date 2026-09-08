import rateLimit from 'express-rate-limit';
import { isLocalOrTrusted } from './ipRules.js';

// 1. 登录防爆破限流器 (15 分钟限 5 次，公网生效，本机/内网豁免)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: (req) => isLocalOrTrusted(req),
  message: {
    error: 'TOO_MANY_ATTEMPTS',
    message: '触发安全防爆破保护：连续错误尝试过多，请 15 分钟后再试'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 2. 通用业务 API 限流器 (已认证 1000 次/分钟，未认证 60 次/分钟，本机/内网完全豁免)
export const apiGeneralLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => ((req as any).user ? 1000 : 60),
  skip: (req) => isLocalOrTrusted(req),
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: '请求过于频繁，触发系统心流节流保护'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 3. 全量整机导出限流器 (15 次 / 10 分钟，防批量拖库与内存打满)
export const exportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  skip: (req) => isLocalOrTrusted(req),
  message: {
    error: 'EXPORT_LIMIT_EXCEEDED',
    message: '系统全量导出频次超限，请 10 分钟后再试'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 4. 全量整机导入限流器 (10 次 / 小时，极低频容错)
export const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  skip: (req) => isLocalOrTrusted(req),
  message: {
    error: 'IMPORT_LIMIT_EXCEEDED',
    message: '整机数据导入频次达到上限，请 1 小时后再试'
  },
  standardHeaders: true,
  legacyHeaders: false
});
