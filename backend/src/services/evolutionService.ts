import type { EvolutionState } from '../types.js';
import type { EvolutionRepository } from '../repositories/evolutionRepository.js';
import type { SystemMetaRepository } from '../repositories/systemMetaRepository.js';

export interface EvolutionStatus extends EvolutionState {
  revision: number;
}

export interface EvolutionServiceDependencies {
  evolutionRepository: Pick<EvolutionRepository, 'getState' | 'createSnapshot'>;
  systemMetaRepository: Pick<SystemMetaRepository, 'getSystemRevision'>;
}

/** 演化状态的只读应用服务；组合状态快照与系统 revision。 */
export function createEvolutionService({
  evolutionRepository,
  systemMetaRepository
}: EvolutionServiceDependencies) {
  function getEvolutionState(): EvolutionStatus {
    return {
      ...evolutionRepository.getState(),
      revision: systemMetaRepository.getSystemRevision()
    };
  }

  function createSnapshot(input: Parameters<EvolutionRepository['createSnapshot']>[0]) {
    return evolutionRepository.createSnapshot(input);
  }

  return { getEvolutionState, createSnapshot };
}
