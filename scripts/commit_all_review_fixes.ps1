<#
.SYNOPSIS
  Sacred Focus 代码审查问题修复批量原子提交脚本 (PowerShell)
.DESCRIPTION
  本脚本将对 18 项代码审查修复进行逐项原子化 git 提交，确保 Git 历史规范清晰。
#>

$ErrorActionPreference = "Stop"

function Commit-Fix {
    param (
        [string[]]$Files,
        [string]$Message
    )
    git add $Files
    $staged = (git diff --cached --name-only)
    if ($staged) {
        git commit -m $Message
        Write-Host "✓ 已提交: $Message" -ForegroundColor Green
    } else {
        Write-Host "- 跳过 (无待提交变更): $Message" -ForegroundColor DarkGray
    }
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   Sacred Focus 代码审查修复 - 自动化原子 Git 提交    " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 0. 审查文档与修复日志
Commit-Fix @("CODE_REVIEW.md", "docs/代码审查问题修复记录.md") "docs: record code review findings and remediation log"

# 1. P0-001: 安全防御：修复反向代理真实客户端 IP 获取与伪造绕过漏洞
Commit-Fix @("backend/src/middleware/ipRules.ts") "fix(security): sanitize client IP extraction using trusted req.ip (P0-001)"

# 2. P0-002: 部署安全：消除生产环境变量中硬编码弱 JWT 密钥
Commit-Fix @("backend/src/config.ts") "fix(security): enforce strong non-default JWT secret in production mode (P0-002)"

# 3. P0-003 & P1-001: 跨天自动结算连胜重置同步递增 Revision 与冷冻节点保护
Commit-Fix @("backend/src/db/queries/settlement.ts") "fix(settlement): bump revision on streak reset and protect frozen nodes (P0-003, P1-001)"

# 4. P1-002: 数据同步：补充漏配的系统版本号自增调用
Commit-Fix @("backend/src/routes/evolution.ts") "fix(sync): bump system revision on evolution data import (P1-002)"

# 5. P1-004: 状态机安全：引入 previousLastLitDate 字段消除悔棋刷分漏洞
Commit-Fix @("backend/src/types.ts", "backend/src/db/queries/focusTree.ts", "backend/src/routes/focusTree.ts", "frontend/src/types/index.ts") "fix(focus-tree): preserve previous last lit date to prevent streak corruption on unlight (P1-004)"

# 6. P1-005 & P3-001: 神圣座位页面离开违规上报与强伪随机 Log ID 生成
Commit-Fix @("frontend/src/views/SacredSeatView.vue") "fix(seat): record fail log on route leave after regret window and use crypto UUID for logs (P1-005, P3-001)"

# 7. P2-001: 数据库性能：补全日志、判例与拓扑图核心查询的高性能复合索引
Commit-Fix @("backend/src/db/schema.ts") "perf(db): add composite indexes for logs, cases, and tree topology queries (P2-001)"

# 8. P2-002: 启动健壮性：迁移事务包裹与触发场景兼容脚本执行门禁
Commit-Fix @("backend/src/db/migrations.ts") "fix(migrations): wrap trigger scene migration in transaction and idempotency flag (P2-002)"

# 9. P2-003: 鉴权性能：登录改为异步 bcrypt 比较与常量时间比对统一
Commit-Fix @("backend/src/routes/auth.ts", "backend/src/middleware/auth.ts") "perf(auth): use async bcrypt.compare to eliminate event loop blocking and unify safeCompare (P2-003)"

# 10. P2-004: 容器时区：Dockerfile 与 Docker Compose 显式固化 Asia/Shanghai
Commit-Fix @("Dockerfile", "docker-compose.yml") "chore(docker): enforce Asia/Shanghai timezone with tzdata in container environment (P2-004)"

# 11. P2-005: 测试体系：测试用例引用真实 schema 与核心安全比对函数
Commit-Fix @("backend/test/verify.ts") "test: align verify test suite with production schema DDL and auth middleware (P2-005)"

# 12. P2-006: 运维安全：docker-update.sh 脚本采用 WAL 安全热备机制
Commit-Fix @("scripts/docker-update.sh") "fix(ops): use sqlite3 backup API for WAL-safe live database backups in docker-update.sh (P2-006)"

# 13. P3-002: 业务作弊防范：专注日志 SUCCESS 状态设置最低有效时长门槛
Commit-Fix @("backend/src/routes/sacredSeat.ts") "fix(seat): enforce 60s minimum duration threshold for successful streak increments (P3-002)"

# 14. P1-003 & P3-003: 列表排序过滤防冲掉与抽离多列复合排序至独立 Composable
Commit-Fix @("frontend/src/composables/useListSort.ts", "frontend/src/views/FocusListView.vue") "refactor(frontend): extract useListSort composable and guard partial order save during filtering (P1-003, P3-003)"

# 15. P3-004: 并发版本自增：系统全局版本号改用原子 SQL UPSERT 增量递增
Commit-Fix @("backend/src/db/revision.ts") "perf(db): make incrementSystemRevision atomic using SQL UPSERT (P3-004)"

# 16. 最终提交脚本自身
Commit-Fix @("scripts/commit_all_review_fixes.ps1", "scripts/commit_all_review_fixes.sh") "chore(scripts): add automated git commit script for code review remediations"

Write-Host "`n全部代码审查修复原子提交已顺利执行完成！" -ForegroundColor Green
