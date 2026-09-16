import type * as Contract from './domain';
import type * as Backend from '../backend/src/types';
import type * as Frontend from '../frontend/src/types';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

type Assert<Value extends true> = Value;

/** 仅类型级断言：两端兼容入口必须与唯一领域契约保持等价。 */
export type ContractCompatibilityAssertions = [
  Assert<Equal<Backend.SacredSeatConfig, Contract.SacredSeatConfig>>,
  Assert<Equal<Frontend.SacredSeatConfig, Contract.SacredSeatConfig>>,
  Assert<Equal<Backend.FocusSessionLog, Contract.FocusSessionLog>>,
  Assert<Equal<Frontend.FocusSessionLog, Contract.FocusSessionLog>>,
  Assert<Equal<Backend.DailyFocusHeatmapItem, Contract.DailyFocusHeatmapItem>>,
  Assert<Equal<Frontend.DailyFocusHeatmapItem, Contract.DailyFocusHeatmapItem>>,
  Assert<Equal<Backend.PrecedentCase, Contract.PrecedentCase>>,
  Assert<Equal<Frontend.PrecedentCase, Contract.PrecedentCase>>,
  Assert<Equal<Backend.FocusNode, Contract.FocusNode>>,
  Assert<Equal<Frontend.FocusNode, Contract.FocusNode>>,
  Assert<Equal<Backend.FocusTreeData, Contract.FocusTreeData>>,
  Assert<Equal<Frontend.FocusTreeData, Contract.FocusTreeData>>,
  Assert<Equal<Backend.EvolutionState, Contract.EvolutionState>>,
  Assert<Equal<Frontend.EvolutionState, Contract.EvolutionState>>
];
