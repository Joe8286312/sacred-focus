import type { AuthResponseBody } from './authGateway';
import { getErrorMessage } from '../../shared/errors/errorMessage';

/**
 * 保留登录接口的历史文案优先级：服务端 message 优先于 error，空值回退到通用提示。
 */
export function getLoginResponseFailureMessage(body: AuthResponseBody): string {
  return getErrorMessage(body) || body.error || '密码核验失败';
}

/** 登录请求本身失败时，避免把非 Error 异常直接渲染到 UI。 */
export function getLoginRequestFailureMessage(error: unknown): string {
  return getErrorMessage(error) || '网络连接异常，请检查后端服务';
}
