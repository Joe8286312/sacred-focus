export interface LogoutCompletionDependencies {
  markUnauthenticated: () => void;
  markAuthChecked: () => void;
  onLoggedOut?: () => void;
}

/** 登出请求无论成功或失败都必须完成的本地会话收尾。 */
export function completeLogout({
  markUnauthenticated,
  markAuthChecked,
  onLoggedOut
}: LogoutCompletionDependencies) {
  markUnauthenticated();
  markAuthChecked();
  onLoggedOut?.();
}
