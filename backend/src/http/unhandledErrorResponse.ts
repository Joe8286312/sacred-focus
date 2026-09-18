export interface UnhandledErrorResponse {
  status: number;
  body: { error: string; message: string };
}

function getErrorField(error: unknown, field: 'status' | 'code' | 'message'): unknown {
  if (typeof error !== 'object' || error === null || !(field in error)) return undefined;
  return (error as Record<string, unknown>)[field];
}

/** 全局异常边界只暴露合法 HTTP 状态与文本字段，生产环境不泄露内部错误详情。 */
export function getUnhandledErrorResponse(error: unknown, isProduction: boolean): UnhandledErrorResponse {
  const rawStatus = getErrorField(error, 'status');
  const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
    ? rawStatus
    : 500;
  const rawCode = getErrorField(error, 'code');
  const rawMessage = getErrorField(error, 'message');
  return {
    status,
    body: {
      error: typeof rawCode === 'string' && rawCode ? rawCode : 'INTERNAL_SERVER_ERROR',
      message: isProduction
        ? '服务器自控中枢发生内部异常，请稍后重试'
        : (typeof rawMessage === 'string' && rawMessage ? rawMessage : 'Unknown Server Error')
    }
  };
}
