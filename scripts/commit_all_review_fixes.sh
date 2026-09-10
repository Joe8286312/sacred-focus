#!/usr/bin/env bash
# ==============================================================================
# Sacred Focus 代码审查问题修复批量原子提交脚本 (Bash)
# ==============================================================================
set -e

commit_fix() {
    local msg="$1"
    shift
    local files=("$@")

    git add "${files[@]}"
    if ! git diff --cached --quiet; then
        git commit -m "${msg}"
        echo "✓ 已提交: ${msg}"
    else
        echo "- 跳过 (无待提交变更): ${msg}"
    fi
}

echo "===================================================="
echo "   Sacred Focus 代码审查修复 - 自动化原子 Git 提交    "
echo "===================================================="

# 0. 审查文档与修复日志
commit_fix "docs: record code review findings and remediation log" \
    "CODE_REVIEW.md" "docs/代码审查问题修复记录.md"

# 1. P0-001: 安全防御：修复反向代理真实客户端 IP 获取与伪造绕过漏洞
commit_fix "fix(security): sanitize client IP extraction using trusted req.ip (P0-001)" \
    "backend/src/middleware/ipRules.ts"

# 2. P0-002: 部署安全：消除生产环境变量中硬编码弱 JWT 密钥
commit_fix "fix(security): enforce strong non-default JWT secret in production mode (P0-002)" \
    "backend/src/config.ts"

# 3. P0-003 & P1-001: 跨天自动结算连胜重置同步递增 Revision 与冷冻节点保护
commit_fix "fix(settlement): bump revision on streak reset and protect frozen nodes (P0-003, P1-001)" \
    "backend/src/db/queries/settlement.ts"

# 4. P1-002: 数据同步：补充漏配的系统版本号自增调用
commit_fix "fix(sync): bump system revision on evolution data import (P1-002)" \
    "backend/src/routes/evolution.ts"

# 5. P1-004: 状态机安全：引入 previousLastLitDate 字段消除悔棋刷分漏洞
commit_fix "fix(focus-tree): preserve previous last lit date to prevent streak corruption on unlight (P1-004)" \
    "backend/src/types.ts" "backend/src/db/queries/focusTree.ts" "backend/src/routes/focusTree.ts" "frontend/src/types/index.ts"

# 6. P1-005 & P3-001: 神圣座位页面离开违规上报与强伪随机 Log ID 生成
commit_fix "fix(seat): record fail log on route leave after regret window and use crypto UUID for logs (P1-005, P3-001)" \
    "frontend/src/views/SacredSeatView.vue"

# 7. P2-001: 数据库性能：补全日志、判例与拓扑图核心查询的高性能复合索引
commit_fix "perf(db): add composite indexes for logs, cases, and tree topology queries (P2-001)" \
    "backend/src/db/schema.ts"

# 8. P2-002: 启动健壮性：迁移事务包裹与触发场景兼容脚本执行门禁
commit_fix "fix(migrations): wrap trigger scene migration in transaction and idempotency flag (P2-002)" \
    "backend/src/db/migrations.ts"

# 9. P2-003: 鉴权性能：登录改为异步 bcrypt 比较与常量时间比对统一
commit_fix "perf(auth): use async bcrypt.compare to eliminate event loop blocking and unify safeCompare (P2-003)" \
    "backend/src/routes/auth.ts" "backend/src/middleware/auth.ts"

# 10. P2-004: 容器时区：Dockerfile 与 Docker Compose 显式固化 Asia/Shanghai
commit_fix "chore(docker): enforce Asia/Shanghai timezone with tzdata in container environment (P2-004)" \
    "Dockerfile" "docker-compose.yml"

# 11. P2-005: 测试体系：测试用例引用真实 schema 与核心安全比对函数
commit_fix "test: align verify test suite with production schema DDL and auth middleware (P2-005)" \
    "backend/test/verify.ts"

# 12. P2-006: 运维安全：docker-update.sh 脚本采用 WAL 安全热备机制
commit_fix "fix(ops): use sqlite3 backup API for WAL-safe live database backups in docker-update.sh (P2-006)" \
    "scripts/docker-update.sh"

# 13. P3-002: 业务作弊防范：专注日志 SUCCESS 状态设置最低有效时长门槛
commit_fix "fix(seat): enforce 60s minimum duration threshold for successful streak increments (P3-002)" \
    "backend/src/routes/sacredSeat.ts"

# 14. P1-003 & P3-003: 列表排序过滤防冲掉与抽离多列复合排序至独立 Composable
commit_fix "refactor(frontend): extract useListSort composable and guard partial order save during filtering (P1-003, P3-003)" \
    "frontend/src/composables/useListSort.ts" "frontend/src/views/FocusListView.vue"

# 15. P3-004: 并发版本自增：系统全局版本号改用原子 SQL UPSERT 增量递增
commit_fix "perf(db): make incrementSystemRevision atomic using SQL UPSERT (P3-004)" \
    "backend/src/db/revision.ts"

# 16. 提交自动化提交脚本自身
commit_fix "chore(scripts): add automated git commit script for code review remediations" \
    "scripts/commit_all_review_fixes.ps1" "scripts/commit_all_review_fixes.sh"

echo ""
echo "全部代码审查修复原子提交已顺利执行完成！"
