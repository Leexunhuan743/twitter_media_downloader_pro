# TMD Agent Rules

TMD 是 Twitter/X 媒体下载器：CLI、API Server 与内嵌 Web 控制台共用一个 Go 模块（Go 1.25，`github.com/unkmonster/tmd`）。

## 目标

下载、补档、标记已下载与库内数据管理在 CLI 与 Web 两端行为一致。Web 是唯一前端，位于 `internal/api/web/download/`，零构建。

## 输入 / 输出

- 输入：用户需求、仓库现状、`TMD_HOME` 下的 `conf.yaml`、`schedules.yaml`、`.data/foo.db`、`logs/`。
- 输出：可构建的 Go 改动与对应测试；前端为 `index.html`、`app.js`、`overview.js`、`data.js`、`schedules.js`、`logs.js`、`config.js`、`styles.css` 八个文件。

## 硬性边界

- 前端零构建：纯 HTML/CSS/JS，不引入框架、打包器或前端依赖。
- 用户可见文案中英双语；颜色只走 CSS 变量；明暗主题必须同时可用。
- 不改存储格式：`foo.db` schema、下载目录结构、`conf.yaml` 字段。
- 不做破坏性操作（`git reset --hard`、删用户数据、强推），除非用户明确要求。
- 未要求不提交；提交前通过门禁。
- 复用现有 API 与组件，不新增重复接口。
- 文档与注释只写当前事实（见 Writing Style）。

## 验收

- `go build ./...`
- `go vet ./...`
- `go test ./...`
- `node --check internal/api/web/download/*.js`

## 自主执行

默认自行判断、一次做完并给出证据；只在产品语义、破坏性操作或范围扩张时提问。回答简短：改了什么、证据、剩余风险，不复述探索过程。

## Writing Style

- Write documentation and code comments as current-state statements, not as a lab log.
- State what is true now: current values, current behavior, current constraints. The reader wants the state, not the journey.
- Drop process narration. No "之前是 A，后来改成 B", "扩容后复测", "第一次测出 X，修正为 Y", "起初失败，然后修复", "本轮验证了…". Once a fact is settled, record only the settled fact.
- Keep a measured fact only when it still holds, and present it as a fact with its date if useful: "内存 15.6 GiB，无 swap（2026-10-17）". Never present a measurement as an experiment report.
- History belongs in changelogs, commit messages, and chat replies — not in the document body or comments.
- Code comments describe what the code does and why, in present tense. No debug trail, no "临时改成…稍后改回", no test-run results.
- Same rule for reports, README, and skill files. If a section reads like a diary, rewrite it as a specification.
