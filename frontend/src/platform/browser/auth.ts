import { createAuthGateway } from '../../application/auth/authGateway';

/** 浏览器 Cookie 会话组合适配。 */
export const authGateway = createAuthGateway((input, init) => fetch(input, init));
