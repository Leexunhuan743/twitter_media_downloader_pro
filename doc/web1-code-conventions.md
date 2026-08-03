# web1 前端代码规范速查

> 维护说明：本文件描述 `internal/api/web/web1/` 的**结构、约定与常见陷阱**。为避免随行号漂移失效，除文件级规模外一律用**函数名/段落名**锚点，不写具体行号。改动前端行为后如涉及新约定，请同步更新本文件。

## 文件结构

```
internal/api/web/web1/
├── index.html      # 单页 HTML（~155行），含防 FOUC 内联 CSS 变量 + 全量 prefers-reduced-motion 覆盖
├── styles.css      # 全部样式（~2400行），CSS 变量体系
└── app.js          # 全部 JS（~6600行），单文件无模块
```

另有 web2/web3 主题（`internal/api/web/web2|web3/`），由 `listThemes()` 自动发现，Go handler 注入的主题切换器（`themeSwitcherHTML`）对三主题通用。

- **CSS 变量双份定义**：`index.html` 内联 `:root` 是防 FOUC 的最小变量集，`styles.css` 是全集。改配色**必须同步两处**（内联块已加注释互引）。
- **reduced-motion 单一来源**：全量覆盖在 `index.html` 内联块（`*` 通配 + 具体元素 + `.btn:active`/`.auth-modal` transform 复位）。**新增动画元素必须加入该列表**，不要在 styles.css 另写 reduced-motion 块。

## app.js 段落布局（按顺序，函数名锚点）

| 段落 | 代表内容 |
|---|---|
| Init guard | `_initComplete` / `_initPromise` / `_logGen` / `_tasksEpoch` / `_prependedCount` |
| Utility | `debounce` / `glowNewFirstItem` / `readListIDsFromTextarea` / `readTextareaLines` |
| Search Helpers | `updateSearchState` / `restoreSearchValue` |
| State Management | `store`（state + setState(deepMerge) + subscribe，通知走 Promise 微任务） |
| API Client | `api` 对象（统一 request/upload、JWT 401 自动刷新、`_tryRefreshJWT` 去重锁） |
| SSE Manager | `sseManager`（tasks/schedules 事件、onopen 重置退避、`_updateIndicator`） |
| JWT Helpers | `tryRefreshJWT` / `appendJWTToken` |
| Toast / Drawer | `toast`（aria-live 容器，error 用 role=alert）/ `drawer`（焦点管理） |
| Page Renderers | `pages` 对象（overview/tasks/data/schedules/system/logs） |
| Module State | `_state` + `makeChangeDetector` + `createDualModeEditor` 三实例 + 任务表单状态 |
| Task Helpers | `getStageText` / `getTaskProgressPercent` / `renderTaskItem` / `renderTaskForm` / `renderCheckboxes` / `createTaskFromInput` |
| DB Rendering | `renderTable` / `renderDBTable` / `renderDBMobileCards` / `renderPageNumbers` / `renderDataTables` |
| DB Actions | `refreshDBData` / `changeDBPage` / `editDBItem` / `saveDBItem` / `deleteDBItem` / `DB_TYPE_CONFIG` |
| Task Actions | `handleQuickDownload` / 各 `create*Task` / `apiTask` / `runTaskButtonAction` / `getCheckedOptions` |
| Log/Config/Schedule | `buildLogQuery` / `renderLogLines` / `renderConfigForm` / `renderCookiesForm` / `renderScheduleForm` / 各 load/save |
| Security Panel | `renderSecurityEditor` / `secLogin` / `secTest` / `secRefresh` / `secClear` |
| Schedule Diff | `scheduleStatusToFormItem` / `scheduleFormItemToEntry` / `normalizeSchedForDiff` / `saveScheduleForm` |
| Routing | `navigateTo` / `parseRoute` / `render` / `updateNavigationUI` |
| Auth Dialog | `showAuthDialog` / `hideAuthDialog` / `submitAuthKey` |
| State Sync | 4 个 detector（data/schedule/overview/system）+ `sync*Page` + `rebuild*Panel` |
| Event Listeners | data-action dispatch、`contentContainer` 委托、document keydown（Esc/Tab/导航） |
| Start | `init()` |

## 命名约定

- 模块级函数: `camelCase` — `createUserTask`, `renderTaskForm`
- 私有前导 `_`: `_initComplete`, `_tasksEpoch`, `_state._scheduleBaselineIds`
- 对象方法: ES6 简写 `method() { ... }`，不是 `method: function()`
- data-action: camelCase（与函数名一致）— `closeDrawer`, `navigateTo`, `saveScheduleForm`, `secLogin`
- API 方法: 动词 + 资源 — `createUserDownload`, `getDBUsers`, `deleteDBList`

## 事件系统

### 统一 data-action dispatch

```js
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  switch (action) { /* 每个 case 一行，按页面分组注释 */ }
});
```

所有交互按钮使用 `data-action` 属性，不要用 `onclick=`. 唯一保留 onclick 的例外:
- `toast-close` — 动态创建的元素
- `menuToggle` / `sseIndicator` — 非简单 set 的专用逻辑

新增按钮 = 在 `pages` 模板加 `data-action` + dispatch switch 加 case。**case 名与函数名一致**（如 `reloadSchedules` → `reloadSchedulesConfig(el)`，`secLogin` → `secLogin()`）。

### DOM 事件监听分布

| 监听目标 | 用途 |
|---|---|
| `document` click | data-action 统一分发 |
| `document` keydown | **Esc 关闭抽屉/认证弹窗；Tab 焦点陷阱循环；导航项 Enter/Space** |
| `#contentContainer` click/input/change/focusout/keydown | 数据绑定与表单联动 |
| `window` resize | 响应式 + 数据页断点补渲染 |
| `window` unhandledrejection / `window.onerror` | 全局错误兜底 |
| `#app` keydown | Enter 提交 auth dialog |

### 无障碍（键盘可达性，新增交互必须遵守）

- 导航项：`role="link"` + `tabindex="0"`，Enter/Space 触发导航；`aria-current="page"` 由 `updateNavigationUI` 维护
- 抽屉/认证弹窗：`role="dialog"` + `aria-modal="true"` + `aria-labelledby`；打开时记录触发元素并移焦，关闭还原；**Esc 关闭；Tab/Shift+Tab 在容器内循环**（document keydown 统一实现，新弹窗只需符合该结构）
- toast 容器 `aria-live="polite"`，error 类型元素加 `role="alert"`
- SSE 指示器 `role="status"` + `aria-live="polite"`，`_updateIndicator` 同步 aria-label
- 动画必须支持 `prefers-reduced-motion`（见文件结构节）

## 渲染模式

### 模板字面量

所有渲染函数返回 HTML 字符串：

```js
function renderXxx(data) {
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(data.title)}</div>
      <div>${renderActionButtons(data)}</div>
    </div>
  `;
}
```

### XSS 安全 — 必须遵守

| 场景 | 函数 | 说明 |
|---|---|---|
| 内容插值 `${...}` | `escapeHtml(str)` | 所有用户/后端数据必须包裹 |
| 属性插值 `value="..."` | `escapeAttr(str)` | 所有用户数据属性必须包裹（**含 placeholder**，不要用 escapeHtml） |
| 不要使用 | 裸 `${}` 在 innerHTML 中 | 除非值来自代码常量 |

### 空状态 / Loading 模板

```html
<div class="empty-state">
  <div class="empty-icon">📊</div>
  <div class="empty-title">暂无数据</div>
  <div class="empty-desc">数据库中还没有记录</div>
</div>
```

```html
<div class="empty-state">
  <div class="skeleton skeleton-icon"></div>
  <div class="empty-title">加载中...</div>
  <div class="empty-desc">正在加载...</div>
</div>
```

按钮忙碌态：`runTaskButtonAction`（spinner + disabled + aria-disabled + 防重入），不要手写。

## 数据流

### 状态管理

```
store.setState({ key: value }) → deepMerge → Promise 微任务 → store.subscribe 回调
```

- 读: `store.state.xxx`；写: `store.setState({ xxx: value })`；监听: `store.subscribe(fn)` 返回 unsubscribe
- **通知是异步微任务**：`setMode` 类"同步重建 + 跳过下次微任务重建"的机制依赖这一点（见 DualModeEditor）
- 4 个 `makeChangeDetector`：dataDetector / scheduleDetector / overviewDetector / systemDetector

### 变化检测器（makeChangeDetector）

- 用途：按 state key 的 JSON 快照检测"哪些变了"，实现手术刀局部更新
- **铁律：`render()` 全量重建页面后，必须对所有 detector 调 `.sync(state)`**，否则快照过期，后续真实变化会被误判"无变化"导致 UI 卡死（SPA 切页后卡 loading 的经典根因）
- 新增页面状态 key 时：加入对应 detector 的 keys 列表，并在 `sync*Page` 里处理

### 请求代际守卫（防旧响应覆盖新响应）

| 场景 | 机制 |
|---|---|
| 任务快照 | `_tasksEpoch`：SSE 应用新快照时递增；`loadOverviewData`/`refreshTasks` 捕获发起时 epoch，返回后不一致即丢弃 |
| 日志分页 | `_logGen`：refresh/筛选时递增；`loadMoreLogs` 过期响应丢弃且不回退页码 |
| DB 分页/搜索 | AbortController + requestSeq（`refreshDBData` 等） |
| 表单校验 | AbortController + seq（`validateScheduleField`） |

新增异步加载路径时**必须**选择一种守卫，否则快速切页/翻页会出现旧响应覆盖新响应。

### DB 数据流

```
refreshDBData() → api.getDBXxx(params) → store.setState({ dbData, dbPagination })
  → syncDataPage (store.subscribe) → renderDataTables (惰性：按视口只重建可见容器)
```

### Task 创建数据流

单输入任务（user/list/following 的创建/Profile/标记）：统一走 `createTaskFromInput(button, { inputId, emptyMsg, numericOnly, actionKeyPrefix, makeApi, successMsg })` — 读输入 → 空/数字校验 → `runTaskButtonAction` + `apiTask` → 成功清空输入。**新增单输入任务入口直接复用，不要复制骨架**。

多输入/复杂任务（batch/json/mark 多目标）：保留 `runTaskButtonAction` + `apiTask` 组合。

## 错误处理

```js
try {
  await api.xxx();
  toast.show('成功消息');
} catch (err) {
  toast.show(err.message, 'error');
}
```

- 简单任务创建用 `apiTask()`；按钮级防重入 + loading 用 `runTaskButtonAction()`
- **AbortError 分支必须特判**（`if (err.name === 'AbortError') return;`）— 导航中止在途请求时不弹虚假错误、不残留 loading
- 登录/导出等绕过 `api.request` 的裸 fetch：401 时接入 `api._tryRefreshJWT()` 刷新重试链，刷新失败才 `requireAuthentication`

## 已存在的复用模式（新增代码优先复用）

| 抽象 | 用途 |
|---|---|
| `api.request/upload` | 统一请求层（60s/5min 超时、JWT 401 刷新重试、`_tryRefreshJWT` 去重） |
| `createDualModeEditor` | config/cookies/schedules 三处 raw/form 双模式编辑器工厂（setMode/skipNextRebuild/生命周期） |
| `makeChangeDetector` | state 变化检测（见上） |
| `buildLogQuery` | 日志查询参数构建（loadLogsReplace / loadMoreLogs / connectLogSSE 共用；page 可选） |
| `scheduleStatusToFormItem` / `scheduleFormItemToEntry` | 调度条目 ↔ 表单 item 双向转换（**字段映射只允许在这两处**） |
| `createTaskFromInput` | 单输入任务创建模板（见上） |
| `renderTable(columns, data, sort)` | 列定义驱动表格渲染 |
| `renderCheckboxes(prefix)` / `getCheckedOptions(prefix)` | 4 个标准 checkbox（auto_follow/follow_members/skip_profile/no_retry） |
| `DB_TYPE_CONFIG[type].list/get/update/delete` | 表类型 → API 方法查表（`refreshDBData`/`editDBItem`/`saveDBItem`/`deleteDBItem` 共用） |
| `tryRefreshJWT` / `appendJWTToken` | JWT 预刷新与 token 参数追加 |
| `debounce` | 高频输入/SSE 合并 |
| `toast` / `drawer` | 通知与侧滑详情 |

## 调度保存（diff CRUD）约定

- 保存流程：`readScheduleFormItemsFromDOM` → 校验 → 与基线 diff → `POST /schedules`（新增）/ `PUT /schedules/{id}`（修改）/ `DELETE /schedules/{id}`（删除）→ 刷新基线
- 基线 = 表单初始化时 `loadSchedules` 记录的 `_state._scheduleBaselineIds` + `store.state._schedules`；**空数组也是有效基线**
- 兜底：基线从未加载（null/undefined）才走全量 `PUT /schedules`
- 无变化早退分支：**必须清 `_scheduleFormDirty` + undo 状态**（否则 SSE/重连同步永久跳过表单更新）
- 新字段加入调度条目时：同步更新 `scheduleStatusToFormItem` 与 `scheduleFormItemToEntry`（表单展示与保存两方向）

## 日志流约定

- 参数构建一律 `buildLogQuery`；SSE 流不分页（page 省略）
- DOM 上限 `LOG_STREAM_MAX_LINES`（5000），`trimLogStream` 保留 `_prependedCount` 行前置页
- 前置页计数在 `loadMoreLogs` 成功后累加、`refreshLogs` 时清零
- SSE 重连：`onopen` 与每条 log 事件都重置 `_logReconnectAttempts`（安静流不累计）

## Security 面板约定

- `renderSecurityEditor` + `secLogin/secTest/secRefresh/secClear`，全部 data-action 分发
- **不持久化 API Key 明文到 localStorage**（只存 JWT：`tmd_jwt_token` / `tmd_jwt_expiry`）；JWT 状态变化后调 `refreshSecStatusHeader`
- 密码掩码哨兵：`__KEEP_OLD__`（保留原值）/ `__CLEAR__`（仅 api_key 可清空=关闭认证）；保存前检测用户粘贴的掩码占位文本（含 `•••`）并提示留空

## CSS 变量体系

| 变量 | 用途 |
|---|---|
| `--bg-primary/secondary/tertiary/elevated` | 背景色 |
| `--text-primary/secondary/tertiary` | 文字色（tertiary 已提亮至 WCAG AA，勿回退暗色） |
| `--border-primary/secondary/focus` | 边框色 |
| `--accent-primary/hover/active` | 主题色 |
| `--success/danger/warning/info` + `-bg` | 语义色 |
| `--radius-md/lg` | 圆角 |
| `--space-[2-8]` | 间距 |
| `--duration-fast(150ms)/normal(250ms)/slow(350ms)` | 过渡时长（**一律用变量，禁止硬编码 0.2s/0.3s 之类**；循环动画 shimmer/spin/pulse 除外） |
| `--ease-out` | 缓动 |

状态标签使用预定义 CSS 类: `.tag-queued` / `.tag-running` / `.tag-completed` / `.tag-failed` / `.tag-cancelled`。

## 常见陷阱

1. **go build 必须通过**: 前端文件通过 `//go:embed` 打包，JS/CSS/HTML 语法错误会让 Go 编译失败（提交前 `node --check` + CSS 括号平衡）
2. **不要写 `innerHTML +=`**: 用字符串拼接 + 一次 `innerHTML =`（或 createElement + append）
3. **不要在渲染函数中直接引用 `document.getElementById`**: 应通过参数或 `store.state` 取值（渲染时元素可能尚未存在）
4. **data-action 元素在 #app 外部**: 事件监听器是 `document` 级别，外部元素也能触发
5. **render() 后必须 detector.sync**: 见变化检测器铁律
6. **AbortError 特判**: catch 分支先判断 `e.name === 'AbortError'` 再决定是否显示错误
7. **新异步路径必须有代际守卫**: 见请求代际守卫表
8. **sf_* 表单控件按 id/data-binding 读取**: 调度表单字段的 id（`sf_target_{idx}` 等）与 `data-binding="sf_field"` 是读回与事件分发的契约，改模板时逐字符保留；input 事件只触发校验不写 store，type/mode 的 change 才会重建表单（读当时 DOM）
9. **新增 tab/面板**: system 页新增 tab 需同时：`pages.system()` 模板加 tab + panel、`systemDetector` keys（若需响应式重建）、sync 分支（若异步）
10. **主题切换按钮**: web1 用 Go handler 注入的 🎨（`themeSwitcherHTML`），前端不要自建
11. **新增动画**: 用 `--duration-*` 变量 + 加入 `index.html` reduced-motion 列表；不要另写 reduced-motion 块

## 修改前必读

- 新功能先检查 `pages` 对象中是否有对应的模板入口
- 新 API 端点先在 `api` 对象中添加方法
- 新交互按钮使用 `data-action` + 在 dispatch switch 中添加 case
- 新 task 类型需要: `api` 方法 → `createXxxTask` 函数（或 `createTaskFromInput`）→ `renderTaskForm` 模板 → dispatch case
- DB 表类型需要: `DB_TYPE_CONFIG` 条目 → `renderTable` 列定义 → `renderDBMobileCards` renderer → `HASH_TO_SUB`/`SUB_TO_HASH` 路由映射条目
- 新调度字段: `scheduleStatusToFormItem` + `scheduleFormItemToEntry` 两方向同步
- 改动后: `node --check`、CSS 括号平衡、隔离实例浏览器实测（见 tmd-web1-frontend-verification skill）、`lat check`
