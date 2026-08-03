# web2 前端代码规范速查

## 与 web1 的核心差异

| 特性 | web1 | web2 |
|---|---|---|
| 事件系统 | `data-action` 统一 dispatch | `onclick="fn()"` 内联 + `addEventListener` |
| 函数导出 | 模块对象方法 | `window.X = X`（顶层函数） |
| Toast | `toast.show(msg, type)` 对象方法 | `toast(msg, type)` 函数 |
| Modal | `drawer.open()` 预建组件 | `openModal(html)` 动态创建 |
| 转义 | `escapeHtml(str)` / `escapeAttr(str)` | `esc(str)` — 同时用于内容和属性 |
| 状态管理 | `store.setState/subscribe` | 模块级 let 变量 + 函数内直接赋值 |
| CSS 状态类 | `tag-queued` / `tag-running` 等 | `badge-queued` / `badge-running` 等 |
| 按钮样式 | `btn btn-secondary` | `btn btn-ghost` |
| 文本颜色 | 无内置 | `.text-muted` 类（`color: var(--text-secondary)`）|

## 文件结构

```
internal/api/web/web2/
├── index.html      # 单页 HTML，加载 /static/app.js + /static/styles.css
├── app.js          # 全部 JS（~3348 行）
└── styles.css      # 全部样式（~907 行），锌灰 + 蓝色强调 + 系统字体
```

## app.js 段落布局

| 段落 | 行号 | 内容 |
|---|---|---|
| API Client | 6-133 | `API_BASE`, `apiBase`, `fetchWithTimeout`, `API` 对象（\_fetch/get/post/put/patch/del/upload/\_parse/\_tryRefreshJWT/\_doRefreshJWT）|
| Utility | 135-254 | `esc`, `jsEsc`, `stripAnsi`, `getTweetId`, `getLogLineColor`, `highlightLogTimestamp`, `relativeTime`, `formatTime`, `formatDuration`, `getTaskProgressPercent`, `getStageText`, `getTaskTarget`, `taskTypeName`, `taskTypeIcon` |
| Toast | 256-289 | `toast(msg, type)`（无 `dismissToast` 函数：关闭由 `.toast-close` 按钮内联 onclick 移除自身，app.js:280）|
| Modal | 291-327 | `openModal(html)`, `closeModal()` |
| Global State | 329-352 | `pageTasks`, `sseConnected`, `_sseAuthChecked`, `pageRenderers`, `_lastSchedulesData`, `_tasksRESTEpoch`, `_dbTabSeq`, `_logGen`, `_prependedCount`, `_actionBusy`, `debounce` |
| API Endpoints | 354-456 | `ENDPOINTS` 对象（355-448）+ `qs()` 查询串辅助（450-456）|
| Overview Page | 459-532 | `renderDashboard`, `updateDashboard` |
| Routing | 534-588 | `navigateTo`, `renderPage`, `loadPageModule`（在 SSE 段之前）|
| SSE | 589-725 | `sseSource`, `sseReconnectTimer`, `sseJWT`, `tryRefreshJWT`, `debouncedTasksUpdate`, `debouncedSchedulesUpdate`, `connectSSE` |
| Health Check | 727-751 | `checkHealth` |
| Tasks Page | 757-976 | `renderTasksPage`, `renderTaskActions`, `renderTaskRow`, `updateTaskRowDynamic`, `updateTasksView` |
| Download Forms | 978-1466 | `showBatchForm`, `doUserDownload`/`doUserProfile`/`doUserMark`, `doListDownload`/`doListProfile`/`doListMark`, `doFollowingDownload`/`doFollowingMark`, `doBatchDownload`/`doBatchMark`, `doJSONFileDownload`/`doJSONFolderDownload`, `doCancelTask`/`doRetryTask`/`doDeleteTask`, `showTaskDetail`, `cancelAllQueued`, `handleQuickDownload` |
| Data Page | 1468-1930 | `renderDataPage`, `sortDB`, `sortableTh`, `loadDBTab`, `currentDBTab`, `renderDBUsers`/`renderDBLists`/`renderDBEntities`/`renderDBPrevNames`/`renderDBStats`, `viewEntityDetail`/`saveEntityEdit`/`deleteEntity`, `viewUserDetail`/`saveUserEdit`/`viewListDetail`/`saveListEdit`, `window.dbSearch`/`dbSearchClear` 导出 |
| Schedules | 1931-2321 | `renderSchedulesPage`, `loadSchedules`, `updateSchedulesView`, `showSchedulesRawEditor`/`saveSchedulesRawEditor`, `showNewScheduleForm`, `toggleSchedTargetFields`, `saveNewSchedule`, `toggleSchedule`, `triggerSchedule`, `triggerAllSchedules`, `reloadSchedules`, `editSchedule`/`saveScheduleEdit`/`toggleEditSchedTargetFields`/`deleteSchedule` |
| System | 2323-2707 | `renderSystemPage`, `loadSystemData`, `loadConfigTab`/`renderConfigFields`/`saveConfigFields`/`renderConfigRaw`/`saveConfigRaw`, `renderCookies`/`saveCookies`/`addCookieRow`/`renderCookiesRaw`/`saveCookiesRaw`, `renderSecurityEditor`, `updateSecStatus`, `loginWithApiKey`, `saveSecKey`, `refreshSecJWT`, `clearSecKey`, `testSecKey` |
| Logs | 2709-3005 | `renderLogsPage`, `setLogTimeFilter`, `toggleLogAutoScroll`, `exportLogs`, `renderLogEntryHTML`, `copyLogTweetId`, `setLogLevel`/`setLogDomain`/`toggleLogPause`/`doLogSearch`/`scrollLogToBottom`/`refreshLogs`, `loadLogsReplace`/`loadMoreLogs`, `loadLogStats`, `logLineInTimeWindow` |
| Log SSE | 3007-3095 | `connectLogSSE`, `disconnectLogSSE`（`_logSSETimer` 等状态在此段；日志行用 `createDocumentFragment` 批量追加，app.js:3046-3055）|
| Sidebar | 3097-3115 | `toggleSidebar`, `closeSidebar` |
| Errors | 3117-3211 | `_errorsData`, `toggleErrorsPanel`, `loadErrors`, `updateErrorsPanel`, `retryAllErrors`, `clearAllErrors` |
| Auth Dialog | 3213-3295 | `showAuthDialog`, `submitAuthKey`, `checkAuth` |
| Init | 3297-3348 | unhandledrejection 兜底, DOMContentLoaded 初始化（`currentPage` 隐式全局首个赋值处，app.js:3313）, window exports（`window.ENDPOINTS`, `window.apiBase`）|

## 事件系统

### onclick 模式（主要）

```html
<button class="btn btn-primary" onclick="saveConfigFields()">Save</button>
<button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
```

对应函数在文件底部导出：

```js
window.ENDPOINTS = ENDPOINTS;
window.apiBase = apiBase;
```

### addEventListener 模式（导航/标签切换）

```js
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => navigateTo(el.dataset.page));
});
configTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-configtab]');
  if (!tab) return;
  // ...
});
```

## API 调用模式

```js
// API 调用通过 ENDPOINTS 对象
const r = await ENDPOINTS.tasks();
const stats = await ENDPOINTS.queueStatus(); // 无 taskStats 成员；统计用 queueStatus()/getTask(id)
await ENDPOINTS.cancelTask(taskId);

// 标准 try/catch + toast 错误处理
try {
  const r = await ENDPOINTS.xxx();
  toast('Success message', 'success');
} catch(e) {
  toast(e.message, 'error');
}
```

## 渲染模式

### 函数签名

```js
async function renderTasksPage(container) { ... }
function renderSystemPage(container) { ... }
```

### 容器赋值

```js
// 设置
container.innerHTML = `
  <div class="section">
    ...
  </div>`;

// 追加（全文件无 innerHTML +=）
// 任务行增量：createElement('tbody') + appendChild（app.js:968-969）
// 日志流批量：document.createDocumentFragment() + appendChild（app.js:3046-3055）
```

### 局部更新（特殊场景）

```js
// 逐元素更新（错误面板、安全状态）
function updateSecStatus(msg, color) {
  const st = document.getElementById('sec-status');
  if (st) { st.textContent = msg; st.style.color = color || 'var(--text)'; }
}
```

## XSS 安全

| 场景 | 函数 | 说明 |
|---|---|---|
| HTML 内容插值 | `esc(str)` | 使用 `document.createTextNode` 白名单方式 |
| JS 字符串插值 | `jsEsc(str)` | 用于内联 onclick 参数中的字符串 |
| 属性 | 不常用 — 模板字面量中很少拼接属性值 | 但若需要，使用 `esc()` 也可以 |

## 状态管理

### 全局变量

```js
let pageTasks = [];
let sseConnected = false;
let _sseAuthChecked = false;
let pageRenderers = {};
let _lastSchedulesData = null;
let _tasksRESTEpoch = 0;
let _dbTabSeq = 0;
let _logGen = 0;
let _prependedCount = 0;
let _actionBusy = false;
```

> 注意：上表仅列出 Global State 段（329-352）的真实成员。其余模块级变量按段声明：`currentPage` 无 `let` 声明，属隐式全局，首个赋值在 Init 段（app.js:3313）；`_errorsData` 在 Errors 段（app.js:3118）；`_logSSETimer` 在 Logs/Log SSE 段（app.js:2794）；SSE 状态（`sseSource`/`sseReconnectTimer` 等）在 SSE 段（589-725）。

### SSE 数据流

```js
// SSE 事件 → debounce → 更新变量 → 重新渲染当前页面
sseSource.addEventListener('tasks', (e) => {
  const tasks = JSON.parse(e.data);
  if (Array.isArray(tasks)) {
    debouncedTasksUpdate(tasks);  // → pageTasks = tasks → updateTasksView()
    loadErrors();                 // 在 tasks SSE 到达时自动刷新错误
  }
});
```

## 错误处理标准模式

```js
try { await ENDPOINTS.xxx(); toast('Success', 'success'); }
catch(e) { toast(e.message, 'error'); }
```

## Modal 使用

```js
openModal(`
  <div class="modal-header"><h2>Title</h2></div>
  <div class="modal-body">
    <p>Content</p>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="submitAction()">Confirm</button>
  </div>
`);
```

## CSS 变量（与 web1 相同体系，不同类名）

| web2 类 | web1 类 | 用途 |
|---|---|---|
| `.badge-{queued,running,completed,failed,cancelled}` | `.tag-{queued,running,completed,failed,cancelled}` | 状态标签 |
| `.btn-ghost` | `.btn-secondary` | 次要/幽灵按钮 |
| `.text-muted` | 无内置 | 次要文字颜色 |
| `.mono` 类 | `.font-mono` 内联 | 等宽字体 |
| `.form-row` | `.form-group` 内 flex | 表单行 |
| `.form-row-flex` | 无 | 动态 cookie 行的 flex 变体 |

变量系统完全相同（`--bg`、`--text`、`--accent`、`--green`、`--red`、`--border` 等）。

## 常见陷阱

1. **onclick 函数必须在 `window` 上**：所有被 onclick 调用的函数需在底部 `window.X = X` 导出
2. **`esc()` 先转义**：所有模板中的用户输入内容先经 `esc()` 处理
3. **没有 store**：直接操纵 `let` 变量 + `container.innerHTML = '...'`。注意不要在异步函数之间共享可变的 `container` 引用
4. **JWT 令牌**：全部来自 `localStorage.getItem('tmd_jwt_token')`，由 `API._fetch` 自动注入
5. **Log SSE**：有自己的 `connectLogSSE`/`disconnectLogSSE` 和 `_logSSETimer`/`_logReconnectAttempts` 状态
6. **`connectSSE` 的首次延迟**：若无 JWT，`connectSSE` 通过模块级 `let _sseAuthChecked`（app.js:332，不是 window 属性）延迟到 `checkAuth` 确认后才真正连接

## 修改前必读

- 新功能：在相应的 `render*Page` 函数中添加模板，并在 `ENDPOINTS` 中添加 API 调用
- 新 System tab：将标签按钮添加到 `#config-tabs`，并在 `loadConfigTab` 的 switch 中添加 case
- 新函数若需 onclick 访问：在文件底部 `window.X = X` 导出
- 新 endpoint 方法：在 `API` 对象中方法存在于 `get/post/put/patch/del`，在 `ENDPOINTS` 中添加绑定
- 新任务/交互：使用 `<button onclick="fn()">`，不要使用 web1 的 `data-action` 模式
