/**
 * 兼容数据库层旧导入路径。
 *
 * 业务日规则本身不访问 SQLite；新代码应从 `domain/calendar/businessDay` 导入。
 */
export { getBusinessDay, getPreviousBusinessDay } from '../domain/calendar/businessDay.js';
