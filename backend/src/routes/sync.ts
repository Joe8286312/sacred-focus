import { Router, Request, Response } from 'express';
import { db, getSystemRevision } from '../db.js';

const router = Router();

// 轻量同步探针 (响应 < 100 字节，极低消耗)
router.get('/status', (_req: Request, res: Response) => {
  try {
    const revision = getSystemRevision();
    const timeRow = db.prepare("SELECT value FROM system_meta WHERE key = 'last_sync_timestamp'").get() as { value: string } | undefined;
    
    // 获取当前活跃演化快照的宏观版本号
    const activeSnapRow = db.prepare(`
      SELECT s.version FROM evolution_snapshots s 
      JOIN evolution_state e ON s.slotIndex = e.activePointerIndex 
      WHERE e.id = 1
    `).get() as { version: string } | undefined;

    res.json({
      revision,
      evolutionVersion: activeSnapRow?.version || 'v1.0',
      updatedAt: timeRow?.value || new Date().toISOString()
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to probe sync status', details: e.message });
  }
});

export default router;
