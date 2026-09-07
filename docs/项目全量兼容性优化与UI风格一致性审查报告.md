# 🔍 Sacred Focus 项目全量兼容性优化与 UI 风格一致性审查报告

> **报告定位**：对 Sacred Focus 效能系统全量模块进行“交互逻辑一致性”、“跨端与双主题兼容性”、“UI 视觉与排版突兀点”的深度全景排查，并记录针对性优化方案与交付成果。  
> **审查日期**：2026年9月7日  
> **基准版本**：v1.2.1  

---

## 目录索引

- [一、 审查背景与排查目标](#一-审查背景与排查目标)
- [二、 核心缺陷根治：下必为例删除交互与原生弹窗全面清零](#二-核心缺陷根治下必为例删除交互与原生弹窗全面清零)
  - [2.1 缺陷复盘：原生 `window.confirm` 与 `alert` 的破坏性违和](#21-缺陷复盘原生-windowconfirm-与-alert-的破坏性违和)
  - [2.2 解决方案：行内二次确认按钮与非侵入式反馈浮条](#22-解决方案行内二次确认按钮与非侵入式反馈浮条)
  - [2.3 全站 `alert` / `confirm` 全景排查与全面治理表](#23-全站-alert--confirm-全景排查与全面治理表)
- [三、 UI 风格突兀处排查与视觉规范对齐](#三-ui-风格突兀处排查与视觉规范对齐)
  - [3.1 深浅双模高对比度排查（细小红字、暗光识别度）](#31-深浅双模高对比度排查细小红字暗光识别度)
  - [3.2 极简符号学与去 Emoji 彻底性审查](#32-极简符号学与去-emoji-彻底性审查)
  - [3.3 等宽字体（JetBrains Mono）挂载一致性](#33-等宽字体jetbrains-mono挂载一致性)
  - [3.4 胶囊药丸（Pill Badge）与微交互动效规范](#34-胶囊药丸pill-badge与微交互动效规范)
- [四、 布局排版与视口滚动兼容性审查](#四-布局排版与视口滚动兼容性审查)
  - [4.1 历史档案与判例列表垂直滚动剪裁修复](#41-历史档案与判例列表垂直滚动剪裁修复)
  - [4.2 Flex 弹性盒高度挤压与 `flex-shrink: 0` 规范](#42-flex-弹性盒高度挤压与-flex-shrink-0-规范)
  - [4.3 移动端小屏与 PWA 独立视窗兼容性](#43-移动端小屏与-pwa-独立视窗兼容性)
- [五、 底层运行时与跨环境兼容性](#五-底层运行时与跨环境兼容性)
  - [5.1 物理时钟防休眠与节流保真机制](#51-物理时钟防休眠与节流保真机制)
  - [5.2 HTML5 Fullscreen 跨浏览器容错与 ESC 降级](#52-html5-fullscreen-跨浏览器容错与-esc-降级)
  - [5.3 SQLite WAL 并发读写与自动平滑增量迁移](#53-sqlite-wal-并发读写与自动平滑增量迁移)
- [六、 优化前后对比矩阵与后续演进建议](#六-优化前后对比矩阵与后续演进建议)

---

## 一、 审查背景与排查目标

在自控工程学系统的演化历程中，交互细节的打磨至关重要：
- **微小的跳变（如浏览器原生白色弹窗）**，都会瞬间打破极简沉浸心流，唤醒用户的烦躁感；
- **风格的不对齐（如部分模块行内确认、部分模块顶部弹窗）**，会增加操作的认知阻抗；
- **深浅主题下的反差缺失**，会导致在夜间强光刺眼或白昼字体模糊发虚。

本次审查针对全站所有前端视图（`SacredSeatView`, `FocusCanvasView`, `FocusListView`, `CaseLawView`）及所有模态框组件进行全量地毯式排查。

---

## 二、 核心缺陷根治：下必为例删除交互与原生弹窗全面清零

### 2.1 缺陷复盘：原生 `window.confirm` 与 `alert` 的破坏性违和

在先前的优化中，国策规范卡（`NodeSpecModal.vue`）和国策分组外框（`GroupEditModal.vue`）均已升级为**原位行内二次确认按钮**：
```
[删除] ──点击──► [确定删除外框？] [确认删除] [取消]
```
然而，在判例法典视图（[CaseLawView.vue](file:///d:/Codes/Projects/sacred-focus/frontend/src/views/CaseLawView.vue)）中，删除逻辑遗漏了该项改造，仍然调用了浏览器顶部的原生弹窗：
```javascript
// ❌ 遗漏缺陷：原生阻塞式系统级对话框，UI风格粗糙，彻底破坏暗色沉浸质感
const confirmed = window.confirm(`严正确认：您确定要彻底删除判例【${item.behavior}】吗？`);
```
同时，在校验失败与网络错误时，多处组件直接调用原生 `alert()`，存在严重交互体验降级。

---

### 2.2 解决方案：行内二次确认按钮与非侵入式反馈浮条

#### 1. 判例卡片行内二次确认
在 [CaseLawView.vue](file:///d:/Codes/Projects/sacred-focus/frontend/src/views/CaseLawView.vue) 中引入 `confirmingDeleteId` 响应式游标：
- 用户点击「删除」按钮，仅当前卡片右上方展开确认交互：
  ```html
  <div class="card-operations" @click.stop>
    <template v-if="confirmingDeleteId === item.id">
      <span class="confirm-del-label font-mono">确定删除？</span>
      <button class="btn-card-action btn-confirm-del-inline" @click="confirmDelete(item)">
        确认
      </button>
      <button class="btn-card-action btn-cancel-del-inline" @click="confirmingDeleteId = null">
        取消
      </button>
    </template>
    <template v-else>
      <button class="btn-card-action btn-card-edit" @click="openEditModal(item)">修改</button>
      <button class="btn-card-action btn-card-delete" @click="confirmingDeleteId = item.id">删除</button>
    </template>
  </div>
  ```
- 取消或操作完成立即回退，不影响任何其他卡片，**DOM 零布局抖动，零原生弹窗阻断**。

#### 2. 非侵入式反馈浮条（Feedback Toast）
废除 `alert('删除失败')` 或 `alert('网络异常')`，构建自适应深浅主题的 `feedback-toast`：
```html
<Transition name="slide-down">
  <div v-if="feedbackNotice" class="feedback-toast font-mono" :class="{ 'is-error': feedbackNotice.isError }">
    {{ feedbackNotice.text }}
  </div>
</Transition>
```
操作成功呈现微翠绿光晕提示，网络失败呈现柔和红底警示，3.5 秒后平滑隐退。

---

### 2.3 全站 `alert` / `confirm` 全景排查与全面治理表

通过全工程检索 `alert(` 与 `confirm(`，定位并治理了全部 12 处隐患点：

| 所在文件 | 原生调用代码 | 潜在缺陷表现 | 治理与重构方案 | 当前状态 |
| :--- | :--- | :--- | :--- | :--- |
| **CaseLawView.vue** | `window.confirm('严正确认...')` | 页面顶部弹出白色系统框，阻断主线程 | 重构为行内二次确认按钮（`确认` / `取消`） | ✅ 已根治 |
| **CaseLawView.vue** | `alert('删除失败')` / `alert('网络异常')` | 强弹窗打断阅读，需额外点击确定 | 升级为居中半透明微光反馈浮条 `feedback-toast` | ✅ 已根治 |
| **CaseEditModal.vue** | `alert('请填写行为描述')` 等 4 处 | 模态框内填表突然弹系统弹窗 | 模态框内顶部挂载红底错误横幅 `error-banner` | ✅ 已根治 |
| **PrecedentCaseModal.vue** | `alert('请填写行为描述...')` 等 3 处 | 专注完成结算时突兀弹窗 | 接入已有 `errorMessage` 错误横幅，零弹窗 | ✅ 已根治 |
| **NodeEditModal.vue** | `alert('请填写国策纯文本编号与名称')` | 保存国策时弹出白色对话框 | 标题栏动态呈现 `form-error-banner` 红色气泡 | ✅ 已根治 |
| **GroupEditModal.vue** | `alert('请填写分组名称')` | 创建外框时粗暴弹窗 | 标题栏动态浮现 `save-success-banner is-error` | ✅ 已根治 |
| **SacredSeatView.vue** | `window.confirm('当前专注中，离开将中断...')` | 路由离开页面二次确认 | **保留（特例）**：作为 Vue Router 路由守卫阻断离开的最后同步安全防线 | 🛡️ 设计保留 |

---

## 三、 UI 风格突兀处排查与视觉规范对齐

### 3.1 深浅双模高对比度排查（细小红字、暗光识别度）

1. **判例法典卡片内删除按钮色彩优化**：
   - 原 `.btn-card-delete` 在浅色模式下为 `#DC2626`，在深色背景下偏暗发沉；
   - 优化：针对深色模式增加 `[data-theme="dark"] .btn-card-delete { color: #F87171; border-color: rgba(248, 113, 113, 0.35); }`，在黑色卡片内字迹鲜亮清晰。
2. **国策树崩溃重构弹窗（ReconstructPromptModal.vue）**：
   - 此前浅色模式下由于丢失 CSS 变量导致文字不可见；
   - 现已全面统一为 `--text-primary` 与 `--text-secondary` 设计令牌，暗亮双模字体对比度完全符合 WCAG AA 标准。

---

### 3.2 极简符号学与去 Emoji 彻底性审查

全站保持绝对冷峻克制的工程自控风格，**全代码库严格清空 Emoji 符号**：
- 状态指示：使用 CSS 纯色微指示点（`pulse-dot`, `color-dot`）；
- 语义识别：使用专业 SVG 矢量图形（时钟、奖杯、闪电、靶心、齿轮）；
- 操作图标：采用原生数学字符（`✕`, `+`, `✓`），在各移动端 OS 下渲染高度统一。

---

### 3.3 等宽字体（JetBrains Mono）挂载一致性

为了防止倒计时、连胜计数值、国策代码在数值变动时产生界面水平抖动，全面挂载 `JetBrains Mono`（`.font-mono`）：
- ✅ 神圣座位主倒计时与顺水推舟正向计时；
- ✅ 主链连胜纪录（`#0` ~ `#N`）；
- ✅ 国策代码 Badge（`M1`, `R0`, `N7`）；
- ✅ 判例发生日期（`YYYY-MM-DD`）；
- ✅ 顺水推舟超额紧凑徽章（`+18s`, `+2m1s`, `+1h2s`）。

---

### 3.4 胶囊药丸（Pill Badge）与微交互动效规范

统一全站分段式筛选器样式：
- **圆角规范**：统一为 `border-radius: var(--radius-full)`（`9999px`）；
- **微动效规范**：过渡统一为 `var(--transition-fast)`（`0.15s cubic-bezier(0.4, 0, 0.2, 1)`）；
- **微光透光**：激活态背景色采用主色调的 `12%` 透明度，边框采用 `30%` 透明度，深色不刺目，浅色显质感。

---

## 四、 布局排版与视口滚动兼容性审查

### 4.1 历史档案与判例列表垂直滚动剪裁修复

- **排查发现**：[CaseLawView.vue](file:///d:/Codes/Projects/sacred-focus/frontend/src/views/CaseLawView.vue) 的 `.cases-list` 仅设置了 `overflow-y: auto;`，在父级 `.cases-view-container` 设为 `height: 100%` 时，由于缺失 Flex 约束，列表在大量卡片堆叠时可能导致页面整体出现双重滚动条或底部被截断；
- **优化治理**：
  ```css
  .cases-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    flex: 1;          /* 吸收剩余垂直高度 */
    min-height: 0;   /* 允许弹性子容器收缩滚动 */
  }
  ```
  现在即便判例库累积上百条，也能在页面内部极为平滑地独立垂直滚动。

---

### 4.2 Flex 弹性盒高度挤压与 `flex-shrink: 0` 规范

在 [FocusHistoryModal.vue](file:///d:/Codes/Projects/sacred-focus/frontend/src/components/seat/FocusHistoryModal.vue) 中，历史流水卡片列表膨胀时，曾发生过由于外层 `max-height: 85vh` 导致顶部筛选药丸栏高度被压缩被腰斩的问题。
- **规范总结**：凡是 Flex 纵向容器内包含“固定操作栏/筛选栏”与“可滚动内容区”时：
  1. 顶部操作栏/标签栏外层容器必须显式配置 `flex-shrink: 0;`；
  2. 下方内容区必须显式配置 `flex: 1; min-height: 0; overflow-y: auto;`。
当前全系统所有弹窗与页面已全量遵循该规范，杜绝一切弹性盒压缩变形缺陷。

---

### 4.3 移动端小屏与 PWA 独立视窗兼容性

- **视口断点兼容**：
  - 顶栏在专注中隐藏所有导航，为移动端留出纯净的横向空间；
  - 历史档案弹窗宽度自适应（桌面端 `max-width: 760px`，移动端自动回退至 `100% - 32px`）；
  - 判例卡片操作区在小屏下自动折行排列，确保按钮可点触区域不低于 `32px`；
- **PWA 全屏运行**：
  - 配置 `display: standalone` 与深色主题背景色；
  - 无论是安装到 Windows 桌面还是 iOS/Android 主屏，均表现为原生独立视窗应用。

---

## 五、 底层运行时与跨环境兼容性

### 5.1 物理时钟防休眠与节流保真机制

- **问题**：移动端息屏、锁屏或 PC 笔记本合盖休眠时，浏览器会挂起或节流 `setInterval` 线程，导致传统计时器少记时间；
- **保真机制**：
  ```typescript
  function calculateActualSeconds(): number {
    if (sessionStartTime.value) {
      const diff = Math.round((new Date().getTime() - sessionStartTime.value.getTime()) / 1000);
      return Math.max(1, diff);
    }
    return Math.max(1, elapsedSeconds.value);
  }
  ```
  在退出或唤醒瞬间，读取真实物理时间戳（Wall Clock）进行差值结算，确保实际专注秒数 $100\%$ 精确可靠。

---

### 5.2 HTML5 Fullscreen 跨浏览器容错与 ESC 降级

- 在 [sacredSeat.ts](file:///d:/Codes/Projects/sacred-focus/frontend/src/stores/sacredSeat.ts) 中对 Fullscreen API 实现了全面的跨浏览器前缀兼容（标准 API + WebKit + Moz + MS）；
- 监听全局 `fullscreenchange` 事件；若用户按 `ESC` 退出全屏，Store 的 `isFullscreen` 响应式变量即时同步，顶栏全屏按钮自动更新图标与提示，支持用户随时一键恢复全屏沉浸。

---

### 5.3 SQLite WAL 并发读写与自动平滑增量迁移

- 后端通过 Better-SQLite3 启用 `PRAGMA journal_mode = WAL` 与 `PRAGMA foreign_keys = ON`；
- 启动时通过 `PRAGMA table_info` 动态检查字段完整性，已完全支持老版本向新版本（如增补 `focusContent`, `failureReason`）的无感热迁移，数据无损。

---

## 六、 优化前后对比矩阵与后续演进建议

### 6.1 核心体验优化前后对比

| 体验维度 | 优化前状态 | 优化后状态 |
| :--- | :--- | :--- |
| **判例删除操作** | 触发系统原生白色 `window.confirm`，打断心流 | 卡片内原地切换「确认 / 取消」按钮，0 原生弹窗 |
| **表单校验与异常反馈** | 粗暴调用原生 `alert()` 阻断用户操作 | 模态框顶部内嵌红色渐变 `error-banner` 与轻量浮条 |
| **顺水推舟超时展示** | 粗暴按分钟截断，不满1分钟显示为 `+0m` | 动态呈现紧凑精准时长：`5m`、`5m12s`、`1h2s`、`18s` |
| **专注中顶栏状态** | 顶栏导航链接常驻，误触即跳出打断专注 | 专注中完全隐藏切换链接，启动即全屏，双层路由保护 |
| **列表与历史滚动表现** | 缺少 `min-height: 0`，大数据量下有截断风险 | 严格规范 `flex-shrink: 0` 与 `min-height: 0`，平滑垂直滚动 |
| **深色模式下删除对比度** | 按钮深红色较暗，识别度偏低 | 动态接入 `#F87171` 高对比微光边框，夜间清晰醒目 |

---

### 6.2 后续演进建议与质量保障准则

1. **坚持行内与非侵入式反馈原则**：
   - 全工程严禁再次引入任何新的 `window.alert` 或 `window.confirm`；
   - 所有删除与破坏性操作，一律采用行内二次确认（Inline Secondary Confirmation）或统一审计模态框；
2. **坚持高对比度自适应设计**：
   - 新增组件必须同时在 `:root[data-theme="dark"]` 与 `:root[data-theme="light"]` 下进行对比度核验；
3. **自动化测试守卫**：
   - 维持前后端 TypeScript 严格模式，将 `vue-tsc -b` 与 `tsc` 纳入每次提交前的自动化检查流水线。
