import { createSacredSeatGateway } from '../../application/sacredSeat/sacredSeatGateway';
import { apiFetch } from '../../utils/api';

/** 浏览器 HTTP 组合适配。 */
export const sacredSeatGateway = createSacredSeatGateway(apiFetch);
