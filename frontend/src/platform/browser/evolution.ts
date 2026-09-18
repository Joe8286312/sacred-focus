import { createEvolutionGateway } from '../../application/evolution/evolutionGateway';
import { apiFetch } from './api';

/** 浏览器 HTTP 组合适配。 */
export const evolutionGateway = createEvolutionGateway(apiFetch);
