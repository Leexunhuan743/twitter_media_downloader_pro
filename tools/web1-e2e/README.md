# web1 浏览器 E2E 测试套件

在 omp 的 `xd://browser` 中对 web1 前端做浏览器实测回归。**不依赖任何测试框架**——每个文件是可在 `tab.evaluate` 中执行的纯脚本，输出结构化检查报告。

## 为什么存在

历次手动实测沉淀的教训（见下方"陷阱清单"）需要固化：临时测试脚本每次重蹈覆辙，且首轮自动化回归曾因测试方法错误产生 4 个"假警报"。本套件把正确的交互模式（重新查询元素、可见性断言、data-action 锚点、作用域限定）固化下来。

## 使用前提

1. **隔离实例**（勿连生产 25556）：
   ```powershell
   # 临时目录 + 从 %APPDATA%\.tmd2\conf.yaml 提取凭据注入环境变量
   # TMD_HOME/TMD_ROOT_PATH 指向临时目录, TMD_API_KEY=本地测试key, TMD_DEV=1
   tmdp-test.exe -server -port 25557
   ```
2. 浏览器打开 `http://127.0.0.1:25557/` 并完成 API Key 登录（authOverlay 消失）
3. 主题处于 **web1**（08 号测试切换后会自动切回）

## 运行

```js
// xd://browser run code：
(async () => {
  const fs = await import('node:fs');
  const code = fs.readFileSync('C:/Users/leeexx/Documents/NewProject/tmd/tools/web1-e2e/run-all.js', 'utf8');
  return await eval(code);
})()
```

输出 `{ results: [{ name, passed, checks }], allPassed, total, failedCount }`。单文件运行同理（先注入 `helpers.js` 再 eval 目标文件）。

`run-all.js` 支持环境变量 `TMD_WEB1_E2E_DIR` 覆盖套件目录（默认仓库内路径）。

## 覆盖范围

| 文件 | 覆盖 |
|---|---|
| `01-navigation` | 6 主页面导航 + 渲染 |
| `02-system-tabs` | 4 tab 可见性互斥 + 三编辑器高级/简易模式（作用域限定） |
| `03-data-tabs` | 6 表 tab 的 dataSubPage 切换 |
| `04-task-tabs` | 7 任务表单渲染 |
| `05-schedules` | 添加/删除/撤销规则、无变化保存 dirty 清理（回归点）、raw 编辑器 |
| `06-logs` | 级别筛选、导出按钮 |
| `07-drawer-a11y` | 抽屉焦点、Tab 陷阱、Shift+Tab 反向、Esc |
| `08-theme-switch` | 切换器选项 + 往返切换（最后跑，含自动切回） |
| `09-task-lifecycle` | mark 任务创建→渲染→详情抽屉→Esc（不消耗 Twitter 配额） |

## 陷阱清单（写测试时必读）

1. **detached 元素点击无效**：SPA 点击常触发 `render()` 全量重建，旧元素脱离 DOM 后 `.click()` 不派发事件。**每次点击前重新 querySelector**（`h.clickByText`/`h.clickAction` 已内置）。
2. **存在性 ≠ 可见性**：所有面板预渲染在 DOM 里（隐藏的也在）。断言用 `h.vis()`（computed display/visibility）或 classList，不要 `!!document.querySelector(...)` 了事——security tab 不可见 bug 正是因此漏检。
3. **按钮找 data-action 而非文案**：文案会变（如暂停后按钮是"继续"不是"恢复"）。多编辑器页面（system 三面板各有模式按钮）必须限定 `scope`，全局第一个匹配会点到错误面板。
4. **页面重载销毁上下文**：主题切换（08）触发 `location.reload()`，evaluate 上下文销毁属预期——分阶段处理，切换后用后端 API 确认主题并切回。
5. **SSE/认证状态影响测试**：`secClear` 清 JWT 后各页面 401 弹认证框，后续测试全部失效。跑本套件前确保已登录；不要在套件中途清理会话。

## 变更时的维护约定

- 新增页面/交互：先加对应测试文件（或扩展现有文件），再改产品代码
- 按钮文案/结构变更：优先更新测试里的 data-action 锚点，文案锚点仅用于无 data-action 的元素
- 改调度保存逻辑：必须保留 `05-schedules` 的 `dirty-cleared` 检查（回归点）
