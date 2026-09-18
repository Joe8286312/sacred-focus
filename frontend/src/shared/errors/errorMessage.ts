/** 从未知异常中读取当前 UI 可展示的非空字符串 message。 */
export function getErrorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('message' in error)) return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message ? message : undefined;
}
