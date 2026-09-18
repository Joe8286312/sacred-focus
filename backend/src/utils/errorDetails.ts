/**
 * 将未知异常转换为现有 HTTP details 字段的值。
 *
 * 有 truthy `message` 时原样保留，以兼容历史上非字符串 message；否则保持
 * `String(error)` 的回退语义，供路由层安全地序列化未知异常。
 */
export function getErrorDetails(error: unknown): unknown {
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? (error as { message?: unknown }).message
    : undefined;
  return message || String(error);
}
