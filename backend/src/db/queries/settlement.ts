import { db } from '../connection.js';
import { getBusinessDay, getPreviousBusinessDay } from '../dateUtils.js';
import { incrementSystemRevision } from '../revision.js';
import type { ResetNodeItem, FocusNodeRow } from '../../types.js';

// 每日首次上线结算引擎：
// 严格确保每天仅在第一次上线时执行断签判断，后续刷新绝不重复触发
export function settleFocusTreeDailyState(): { resetNodes: ResetNodeItem[]; settlementDate: string } | null {
  const today = getBusinessDay();
  const yesterday = getPreviousBusinessDay(today);

  // 1. 读取数据库中持久化的“最后每日结算日期”
  const metaRow = db.prepare('SELECT value FROM system_meta WHERE key = ?').get('lastDailySettlementDate') as { value: string } | undefined;
  if (metaRow && metaRow.value === today) {
    // 当日已经完成过首次上线结算，直接静默跳过
    return null;
  }

  const resetNodes: ResetNodeItem[] = [];

  const settleTx = db.transaction(() => {
    // 事务内二次核查，消除多并发冷启动请求下的 TOCTOU 竞态漏洞 (D-4)
    const lockedMeta = db.prepare('SELECT value FROM system_meta WHERE key = ?').get('lastDailySettlementDate') as { value: string } | undefined;
    if (lockedMeta && lockedMeta.value === today) {
      return false;
    }

    // P1-001: 查询中必须包含 isFrozen 字段
    const allNodes = db.prepare('SELECT id, code, name, level, maxLevel, isLit, isFrozen, lastLitDate FROM focus_nodes').all() as Array<Pick<FocusNodeRow, 'id' | 'code' | 'name' | 'level' | 'maxLevel' | 'isLit' | 'isFrozen' | 'lastLitDate'>>;

    for (const node of allNodes) {
      // P1-001: 处于冰蓝冻结保全态的节点豁免断签归零惩罚，完整保留现有等级与最高等级
      if (node.isFrozen) {
        continue;
      }

      const isLitToday = node.lastLitDate === today;
      const isLitYesterday = node.lastLitDate === yesterday;

      if (!isLitToday && !isLitYesterday) {
        // 昨日未能点亮（发生断签）
        if (node.level > 0) {
          resetNodes.push({
            id: node.id,
            code: node.code,
            name: node.name,
            lostLevel: node.level,
            maxLevel: node.maxLevel
          });
          // 当前等级清空至 0 级，待命熄灭，保留历史最高等级
          db.prepare('UPDATE focus_nodes SET level = 0, previousLevel = 0, isLit = 0 WHERE id = ?').run(node.id);
        } else if (node.isLit === 1) {
          db.prepare('UPDATE focus_nodes SET isLit = 0 WHERE id = ?').run(node.id);
        }
      } else if (isLitYesterday && !isLitToday) {
        // 昨日已点亮，今日尚未点亮：重置为待命状态，保留 level 等待今日点亮升级
        db.prepare('UPDATE focus_nodes SET isLit = 0 WHERE id = ?').run(node.id);
      }
    }

    // 2. 写入/更新今日结算标记，确保当天后续所有刷新绝不再重复触发
    db.prepare('INSERT OR REPLACE INTO system_meta (key, value) VALUES (?, ?)').run('lastDailySettlementDate', today);

    // P0-003: 若结算产生了实际的断签清零，必须原子递增系统版本号，防止旧客户端带旧 expectedRevision 覆写逆转
    if (resetNodes.length > 0) {
      incrementSystemRevision();
    }

    return true;
  });

  const executed = settleTx();
  if (!executed) {
    return null;
  }

  return { resetNodes, settlementDate: today };
}
