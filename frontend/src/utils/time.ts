/**
 * 兼容旧导入路径。
 *
 * 新调用方应从 `shared/formatters/duration` 导入；在所有下游完成迁移前，
 * 此入口只负责转出，不能加入额外逻辑。
 */
export { formatCompactDuration } from '../shared/formatters/duration';
