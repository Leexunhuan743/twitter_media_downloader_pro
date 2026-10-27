/* TMD 下载台 · app.js
   单页零构建：i18n + 明暗主题 + SSE 实时台账 + 表单分发。
   所有可见文案走 I18N，所有颜色走 CSS 变量（见 styles.css）。 */
(function () {
  'use strict';

  var LANG_KEY = 'tmd.lang';
  var THEME_KEY = 'tmd.theme';
  var TOKEN_KEY = 'tmd.token';
  var EXP_KEY = 'tmd.tokenExp';
  var FLAGS_KEY = 'tmd.flags';
  var MODE_KEY = 'tmd.mode';
  // 台账筛选窗口（状态/类型/阶段/关键词/分页）跨刷新保留；多标签页 last-write-wins。
  var LEDGER_VIEW_KEY = 'tmd.ledgerView';
  // 下载表单草稿（目标文本 + 标记时间）跨刷新保留；提交成功后清空。
  var DRAFT_KEY = 'tmd.draft';
  var MAX_TARGETS = 20;
  // 台账分页：默认每页 50 条，走服务端 page/pageSize，历史任务不再受 200 条上限限制。
  var LEDGER_PAGE = 50;

  /* ---------------- i18n ---------------- */

  var I18N = {
    'zh-CN': {
      a11y: { skip: '跳到主内容' },
      brand: { name: '下载台', latin: 'download desk' },
      global: { unexpected: '操作意外中断' },
      theme: { group: '外观', light: '浅色', auto: '跟随系统', dark: '深色', switched: '外观：{mode}' },
      lang: { group: '语言', switched: '界面语言：{name}' },
      status: {
        checking: '健康检查中…',
        health: '{version} · 正常',
        healthFail: '服务不可达',
        queue: '队列 {active} 活动 / {pending} 等待',
        queueEmpty: '队列 —',
        authOff: '无认证',
        authOn: '已认证',
        authRequired: '需要密钥',
        authUnknown: '认证 —',
        changeKey: '切换密钥'
      },
      banner: { shutdown: '服务器正在关闭，任务已停止接收。恢复后请刷新页面。' },
      tasksView: { title: '下载', sub: '提交下载、标记已下载与 JSON 上传；进行中与历史任务都在这一页。' },
      composer: { title: '新建下载' },
      step: { target: '目标', mode: '方式', options: '选项' },
      target: {
        placeholder: '@handle、x.com 链接、list id、JSON 路径，可多行',
        hint: '支持 @screen_name、x.com/twitter.com 链接、数字 list id、JSON 文件路径；文件路径每行一个，可含空格',
        hintUser: '识别到 {n} 个用户',
        hintList: '识别到 {n} 个列表',
        hintJson: '识别到 {n} 个 JSON 路径',
        hintMixed: '混合目标 {n} 个，批量方式会按类型分组提交',
        hintBad: '{n} 个目标无法识别'
      },
      tag: { user: '用户', list: '列表', json: 'JSON', mixed: '混合', bad: '无法识别' },
      mode: { user: '用户', following: '关注', profile: '补档', list: '列表', json: 'JSON', batch: '批量', group: '下载方式' },
      opt: {
        autoFollow: '自动关注',
        followMembers: '含关注者',
        skipProfile: '跳过 profile',
        noRetry: '失败不重试',
        none: '该方式没有额外选项'
      },
      submit: { go: '开始下载', note: '⌘/Ctrl + Enter', busy: '提交中…' },
      form: {
        empty: '请填写要下载的目标。',
        badTargets: '{n} 个目标无法识别：{list}',
        tooMany: '一次最多提交 {n} 个目标。',
        failed: '提交失败：{msg}'
      },
      batch: {
        followingLabel: '关注源',
        followingPlaceholder: '@name1, @name2（下载这些账号关注的人）',
        followingHelp: '与上方用户/列表是不同目标：这里下载这些账号关注的人。',
        badFollowing: '{n} 个关注源无法识别：{list}'
      },
      queue: {
        title: '进行中',
        cancelQueued: '取消排队',
        refresh: '刷新',
        empty: '还没有任务。在上面贴一个目标，按 ⌘/Ctrl + Enter 开始。'
      },
      ledger: {
        title: '台账',
        search: '搜索目标 / 任务 ID（/）',
        searchLabel: '搜索台账',
        filterGroup: '按状态过滤',
        empty: '没有符合条件的任务记录。',
        prevPage: '上一页',
        nextPage: '下一页',
        pageInfo: '第 {page} / {pages} 页 · 共 {total} 条',
        jump: '跳至页码',
        jumpBad: '页码超出范围',
        batchRetry: '重试失败',
        batchDelete: '清理终态',
        typeLabel: '按类型过滤',
        stageLabel: '按阶段过滤',
        failedDetails: '失败明细',
        newTasks: '{n} 个新任务 · 查看',
        rowHint: '点击打开详情',
        batchTruncated: '单次最多处理 {n} 条，已跳过 {rest} 条'
      },
      filter: { all: '全部', active: '进行中', completed: '已完成', failed: '失败', cancelled: '已取消' },
      stageFilter: { all: '全部阶段' },
      taskStatus: { queued: '排队', running: '运行中', completed: '完成', failed: '失败', cancelled: '取消' },
      taskType: {
        user_download: '用户下载',
        list_download: '列表下载',
        following_download: '关注下载',
        profile_download: '补档',
        mark_downloaded: '标记已下载',
        json_file_download: 'JSON 文件',
        json_folder_download: 'JSON 文件夹',
        batch_download: '批量下载',
        list_profile: '列表补档',
        retry_all_failed: '重试失败项'
      },
      metric: { downloaded: '已下载 {n}', failed: '失败 {n}', profile: 'profile {n}', versioned: '版本 {n}', progress: '{done} / {total}' },
      ticket: { cancel: '取消', retry: '重试', delete: '删除', stamp: '已入库', waiting: '等待调度' },
      errors: {
        title: '失败记录',
        retryAll: '全部重试',
        clear: '清除记录',
        accounts: '{n} 个账号',
        jsonSources: '{n} 个 JSON 来源'
      },
      footer: {
        root: '根目录 {path}',
        db: '库 {users} 用户 · {lists} 列表 · {entities} 媒体',
        version: '版本 {version}',
        note: 'TMD 下载台 · 单页零构建'
      },
      auth: {
        title: '需要 API Key',
        desc: '当前服务已开启访问认证。输入配置里的 api_key 换取会话令牌，令牌只保存在本机浏览器。',
        label: 'API Key',
        placeholder: '粘贴 api_key',
        cancel: '取消',
        submit: '登录',
        badKey: 'API Key 不正确。',
        network: '无法连接服务。',
        ok: '已登录，令牌 1 小时有效'
      },
      toast: {
        queued: '已入队：{name}',
        queuedN: '已入队 {n} 个任务',
        queuedPartial: '入队 {ok} 个，失败 {fail} 个',
        cancelQueued: '已取消排队中的任务',
        refreshed: '已刷新',
        cancelled: '任务已取消',
        retried: '任务已重新入队',
        deleted: '任务记录已删除',
        retryAll: '失败项重试任务已入队',
        errorsCleared: '失败记录已清除',
        online: '实时连接已恢复',
        batch: '批量操作：成功 {ok} 条，失败 {fail} 条',
        batchEmpty: '当前列表里没有可操作的任务',
        copyManual: '浏览器拒绝了自动复制，已选中文本，请按 Ctrl+C',
        copyFailed: '复制失败，请手动选中文本后按 Ctrl+C'
      },
      notify: {
        completed: '任务完成：{target}',
        failed: '任务失败：{target}',
        failedWithReason: '任务失败：{target}（{reason}）',
        cancelled: '任务已取消：{target}'
      },
      confirm: {
        delete: '删除任务 {id} 的记录？任务数据不会保留。',
        clearErrors: '清除全部失败记录？',
        cancelQueued: '取消所有排队中的任务？',
        cancelTask: '取消任务 {target}？已下载的文件会保留。',
        cancelSelected: '取消选中的 {n} 个进行中任务？已下载的文件会保留。',
        retrySelected: '重试选中的 {n} 个失败任务？',
        retryVisible: '重试当前列表里的 {n} 个失败任务？',
        batchDelete: '删除当前列表里 {n} 个已结束任务的记录？此操作不可撤销。'
      },
      rel: { now: '刚刚', min: '{n} 分钟前', hour: '{n} 小时前', day: '{n} 天前' }
    },
    en: {
      a11y: { skip: 'Skip to content' },
      brand: { name: 'Download desk', latin: 'six views, one shell' },
      global: { unexpected: 'Something went wrong' },
      theme: { group: 'Appearance', light: 'Light', auto: 'System', dark: 'Dark', switched: 'Appearance: {mode}' },
      lang: { group: 'Language', switched: 'Language: {name}' },
      status: {
        checking: 'checking…',
        health: '{version} · ok',
        healthFail: 'unreachable',
        queue: 'queue {active} active / {pending} waiting',
        queueEmpty: 'queue —',
        authOff: 'no auth',
        authOn: 'authenticated',
        authRequired: 'key required',
        authUnknown: 'auth —',
        changeKey: 'change key'
      },
      banner: { shutdown: 'Server is shutting down; new tasks are rejected. Reload when it is back.' },
      tasksView: { title: 'Download', sub: 'Queue downloads, mark items as downloaded and upload JSON exports; live and past tasks stay on this page.' },
      composer: { title: 'New download' },
      step: { target: 'Target', mode: 'Mode', options: 'Options' },
      target: {
        placeholder: '@handle, x.com link, list id or JSON path — one per line',
        hint: 'Accepts @screen_name, x.com/twitter.com links, numeric list ids, JSON paths; one path per line, spaces allowed',
        hintUser: '{n} user(s) detected',
        hintList: '{n} list(s) detected',
        hintJson: '{n} JSON path(s) detected',
        hintMixed: '{n} mixed targets — batch mode groups them by kind',
        hintBad: '{n} target(s) not recognised'
      },
      tag: { user: 'user', list: 'list', json: 'json', mixed: 'mixed', bad: 'unknown' },
      mode: { user: 'User', following: 'Following', profile: 'Profile', list: 'List', json: 'JSON', batch: 'Batch', group: 'Download mode' },
      opt: {
        autoFollow: 'auto follow',
        followMembers: 'include members',
        skipProfile: 'skip profile',
        noRetry: 'no retry',
        none: 'no extra options for this mode'
      },
      submit: { go: 'Start download', note: '⌘/Ctrl + Enter', busy: 'Sending…' },
      form: {
        empty: 'Add at least one target.',
        badTargets: '{n} target(s) not recognised: {list}',
        tooMany: 'At most {n} targets per dispatch.',
        failed: 'Dispatch failed: {msg}'
      },
      batch: {
        followingLabel: 'Following sources',
        followingPlaceholder: '@name1, @name2 (downloads who they follow)',
        followingHelp: 'Separate from the users/lists above: these download the accounts that these names follow.',
        badFollowing: '{n} following source(s) not recognised: {list}'
      },
      queue: {
        title: 'In flight',
        cancelQueued: 'Cancel queued',
        refresh: 'Refresh',
        empty: 'No tasks yet. Paste a target above, then press ⌘/Ctrl + Enter.'
      },
      ledger: {
        title: 'Ledger',
        search: 'Search target / task id (/)',
        searchLabel: 'Search ledger',
        filterGroup: 'Filter by status',
        empty: 'No records match the filter.',
        prevPage: 'Previous',
        nextPage: 'Next',
        pageInfo: 'Page {page} / {pages} · {total} total',
        jump: 'Page number',
        jumpBad: 'Page out of range',
        batchRetry: 'Retry failed',
        batchDelete: 'Clear finished',
        typeLabel: 'Filter by type',
        stageLabel: 'Filter by stage',
        failedDetails: 'Failure details',
        newTasks: '{n} new task(s) · view',
        rowHint: 'Click to open details',
        batchTruncated: 'At most {n} are processed at once; {rest} skipped'
      },
      filter: { all: 'All', active: 'Active', completed: 'Done', failed: 'Failed', cancelled: 'Cancelled' },
      stageFilter: { all: 'All stages' },
      taskStatus: { queued: 'queued', running: 'running', completed: 'done', failed: 'failed', cancelled: 'cancelled' },
      taskType: {
        user_download: 'user',
        list_download: 'list',
        following_download: 'following',
        profile_download: 'profile',
        mark_downloaded: 'mark',
        json_file_download: 'json file',
        json_folder_download: 'json folder',
        batch_download: 'batch',
        list_profile: 'list profile',
        retry_all_failed: 'retry failed'
      },
      metric: { downloaded: '{n} downloaded', failed: '{n} failed', profile: 'profile {n}', versioned: 'versions {n}', progress: '{done} / {total}' },
      ticket: { cancel: 'Cancel', retry: 'Retry', delete: 'Delete', stamp: 'filed', waiting: 'waiting for a worker' },
      errors: {
        title: 'Failure log',
        retryAll: 'Retry all',
        clear: 'Clear log',
        accountsOne: '{n} account failed',
        accountsMany: '{n} accounts failed',
        jsonOne: '{n} JSON import failed',
        jsonMany: '{n} JSON imports failed'
      },
      footer: {
        root: 'root {path}',
        db: 'db {users} users · {lists} lists · {entities} media',
        version: 'version {version}',
        note: 'TMD download desk · single page, zero build'
      },
      auth: {
        title: 'API key required',
        desc: 'Access auth is enabled. Paste the configured api_key to get a session token; it stays in this browser only.',
        label: 'API key',
        placeholder: 'paste api_key',
        cancel: 'Cancel',
        submit: 'Sign in',
        badKey: 'That API key was rejected.',
        network: 'Cannot reach the server.',
        ok: 'Signed in — token valid for 1 hour'
      },
      toast: {
        queued: 'queued: {name}',
        queuedN: '{n} task(s) queued',
        queuedPartial: '{ok} queued, {fail} failed',
        cancelQueued: 'queued tasks cancelled',
        refreshed: 'refreshed',
        cancelled: 'task cancelled',
        retried: 'task re-queued',
        deleted: 'task record deleted',
        retryAll: 'retry-all task queued',
        errorsCleared: 'failure log cleared',
        online: 'live stream restored',
        batch: 'Batch: {ok} done, {fail} failed',
        batchEmpty: 'No task in this list can be acted on',
        copyManual: 'Automatic copy was blocked; text selected — press Ctrl+C',
        copyFailed: 'Copy failed — select the text and press Ctrl+C'
      },
      notify: {
        completed: 'Task completed: {target}',
        failed: 'Task failed: {target}',
        failedWithReason: 'Task failed: {target} ({reason})',
        cancelled: 'Task cancelled: {target}'
      },
      confirm: {
        delete: 'Delete the record for task {id}?',
        clearErrors: 'Clear the whole failure log?',
        cancelQueued: 'Cancel every queued task?',
        cancelTask: 'Cancel task {target}? Files already downloaded are kept.',
        cancelSelected: 'Cancel the {n} selected in-flight tasks? Files already downloaded are kept.',
        retrySelected: 'Retry the {n} selected failed tasks?',
        retryVisible: 'Retry the {n} failed tasks in this list?',
        batchDelete: 'Delete the records of {n} finished tasks in this list? This cannot be undone.'
      },
      rel: { now: 'just now', min: '{n} min ago', hour: '{n} h ago', day: '{n} d ago' }
    }
  };

  var state = {
    lang: 'zh-CN',
    theme: 'auto',
    token: '',
    tokenExp: 0,
    tasks: [],
    errors: { regular: {}, details: [], json: [] },
    errorsOpen: false,
    filter: 'all',
    type: 'all',
    stage: 'all',
    query: '',
    detail: { id: '', task: null, json: '', busy: false },
    ledger: {
      items: [], total: 0, page: 1, pages: 1, pageSize: LEDGER_PAGE,
      loading: false, pending: null, pendingPage: 0, ready: false, fresh: []
    },
    seenLedger: {},
    select: {},
    context: null,
    mode: 'user',
    manualMode: false,
    mark: false,
    files: [],
    folderFiles: [],
    flags: { auto_follow: false, follow_members: false, skip_profile: false, no_retry: false },
    config: null,
    schedules: null,
    health: null,
    dbStats: null,
    stats: null,
    queue: null,
    auth: 'unknown',
    connected: false,
    es: null,
    authOpen: false,
    submitting: false,
    stopped: false
  };

  var MODES = [
    { id: 'user', kinds: ['user'], opts: ['skip_profile', 'no_retry'], mark: true },
    { id: 'following', kinds: ['user'], opts: ['no_retry'], mark: true },
    { id: 'profile', kinds: ['user'], opts: [] },
    { id: 'list', kinds: ['list'], opts: ['skip_profile', 'no_retry'], mark: true },
    { id: 'json', kinds: ['json'], opts: ['no_retry'] },
    { id: 'batch', kinds: ['user', 'list', 'json'], opts: ['auto_follow', 'follow_members', 'skip_profile', 'no_retry'], mark: true }
  ];

  // TYPE_FILTER 把界面上的下载方式映射到 /tasks/query 的 type 参数；一个选项可含多种任务类型。
  // 状态筛选的合法值；renderFilters 与台账窗口恢复共用。
  var FILTER_IDS = ['all', 'active', 'completed', 'failed', 'cancelled'];

  // STAGE_FILTERS 映射 /tasks/query 的 stage 参数；阶段值来自后端 TaskProgress.Stage。
  var STAGE_FILTERS = [
    { id: 'all', stages: [] },
    { id: 'resolving', stages: ['resolving'] },
    { id: 'syncing', stages: ['syncing'] },
    { id: 'downloading', stages: ['downloading'] },
    { id: 'retrying', stages: ['retrying'] },
    { id: 'profile', stages: ['profile'] },
    { id: 'profile_warning', stages: ['profile_warning'] },
    { id: 'marking', stages: ['marking'] },
    { id: 'completed', stages: ['completed'] }
  ];

  var TYPE_FILTERS = [
    { id: 'all', types: [] },
    { id: 'user', types: ['user_download'] },
    { id: 'following', types: ['following_download'] },
    { id: 'profile', types: ['profile_download'] },
    { id: 'list', types: ['list_download'] },
    { id: 'mark', types: ['mark_downloaded'] },
    { id: 'json', types: ['json_file_download', 'json_folder_download'] },
    { id: 'batch', types: ['batch_download'] },
    { id: 'listProfile', types: ['list_profile'] },
    { id: 'retryAll', types: ['retry_all_failed'] }
  ];

  var OPTION_TITLE = {
    auto_follow: 'auto_follow',
    follow_members: 'follow_members',
    skip_profile: 'skip_profile',
    no_retry: 'no_retry'
  };

  /* ---------------- tiny helpers ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function versionLabel(value) {
    var v = String(value === undefined || value === null ? '' : value).trim();
    if (!v) return '?';
    if (/^v[0-9]/i.test(v)) return v;
    if (/^[0-9]/.test(v)) return 'v' + v;
    return v;
  }

  function lookup(dict, path) {
    var parts = path.split('.');
    var node = dict;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== 'object') return undefined;
      node = node[parts[i]];
    }
    return typeof node === 'string' ? node : undefined;
  }

  function t(path, vars) {
    var text = lookup(I18N[state.lang], path);
    if (text === undefined) text = lookup(I18N['zh-CN'], path);
    if (text === undefined) return path;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (m, key) {
      return vars[key] === undefined ? m : String(vars[key]);
    });
  }

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 隐私模式忽略 */ }
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat(state.lang, {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }).format(date);
    } catch (e) {
      return date.toLocaleString();
    }
  }

  function fmtRelative(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    var diff = Date.now() - date.getTime();
    if (diff < 60000) return t('rel.now');
    if (diff < 3600000) return t('rel.min', { n: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('rel.hour', { n: Math.floor(diff / 3600000) });
    return t('rel.day', { n: Math.floor(diff / 86400000) });
  }

  /* ---------------- theme ---------------- */

  function mediaDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function resolveTheme(mode) {
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    return mediaDark() ? 'dark' : 'light';
  }

  function applyTheme(mode) {
    state.theme = mode;
    var resolved = resolveTheme(mode);
    var html = document.documentElement;
    html.setAttribute('data-theme', mode);
    html.setAttribute('data-resolved', resolved);
    html.style.colorScheme = resolved;
    lsSet(THEME_KEY, mode);
    $$('#theme-seg .seg__btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-theme-set') === mode ? 'true' : 'false');
    });
  }

  /* ---------------- language ---------------- */

  function applyLang(lang) {
    if (!I18N[lang]) lang = 'zh-CN';
    if (lang !== state.lang && !canLeaveView(currentView)) {
      // 用户拒绝丢弃改动：保持当前语言，按钮状态回到实际值。
      $$('#lang-seg .seg__btn').forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-lang-set') === state.lang ? 'true' : 'false');
      });
      return;
    }
    state.lang = lang;
    document.documentElement.lang = lang;
    lsSet(LANG_KEY, lang);
    $$('#lang-seg .seg__btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-lang-set') === lang ? 'true' : 'false');
    });

    $$('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    $$('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    $$('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });

    document.title = 'TMD · ' + t('nav.' + currentView);

    renderModes();
    renderOptions();
    renderFilters();
    renderTypeFilter();
    renderStageFilter();
    renderStatus();
    renderQueue(true);
    renderLedger();
    renderErrors();
    renderFooter();
    updateTargetHint();
    remountCurrentView();
  }

  /* ---------------- API ---------------- */

  function authHeaders() {
    var headers = {};
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    return headers;
  }

  function parseBody(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function unwrap(json) {
    if (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'success')) {
      if (json.success === false) {
        var err = new Error(json.error || json.detail || 'request failed');
        err.payload = json;
        throw err;
      }
      return json.data === undefined ? json : json.data;
    }
    return json;
  }

  // 默认 20s 超时：弱网/后端卡住时不能让界面无限停在骨架屏。调用方可传 timeout: 0 关闭。
  var REQUEST_TIMEOUT_MS = 20000;

  function request(path, options) {
    options = options || {};
    // 停机后不再发新请求：服务端已退出，重试只会刷网络错误。
    if (state.stopped) {
      var refused = new Error(t('banner.shutdown'));
      refused.stopped = true;
      return Promise.reject(refused);
    }
    var init = { method: options.method || 'GET', headers: authHeaders() };
    if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    if (options.signal) init.signal = options.signal;
    var timer = 0;
    var timeoutMs = options.timeout === undefined ? REQUEST_TIMEOUT_MS : options.timeout;
    var controller = null;
    if (timeoutMs > 0 && !options.signal && typeof AbortController === 'function') {
      controller = new AbortController();
      init.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    }
    var clear = function () { if (timer) { clearTimeout(timer); timer = 0; } };
    return fetch(path, init).catch(function (err) {
      clear();
      if (err && err.name === 'AbortError') {
        var timeoutErr = new Error(t('common.timeout'));
        timeoutErr.name = 'AbortError';
        timeoutErr.timeout = true;
        throw timeoutErr;
      }
      throw err;
    }).then(function (res) {
      clear();
      return res.text().then(function (text) {
        var json = parseBody(text);
        if (res.ok) return unwrap(json);
        if (res.status === 401) {
          // X-Token-Type: expired → 先用 refresh 续期再重试一次；missing/invalid → 弹登录
          var tokenType = res.headers.get('X-Token-Type') || '';
          if (tokenType === 'expired' && state.token && !options.retried) {
            options.retried = true;
            return tryRefresh().then(function (renewed) {
              if (renewed) return request(path, options);
              onUnauthorized();
              var expiredErr = new Error('unauthorized');
              expiredErr.status = 401;
              throw expiredErr;
            });
          }
          onUnauthorized();
          var authErr = new Error('unauthorized');
          authErr.status = 401;
          throw authErr;
        }
        var message = (json && (json.error || json.detail)) || ('HTTP ' + res.status);
        var err = new Error(message);
        err.status = res.status;
        err.payload = json;
        throw err;
      });
    }, function (err) { clear(); throw err; });
  }

  function onUnauthorized() {
    clearProactiveRefresh();
    state.token = '';
    lsSet(TOKEN_KEY, '');
    state.tokenExp = 0;
    lsSet(EXP_KEY, '0');
    state.auth = 'required';
    renderStatus();
    openAuth();
  }

  // logout 清掉本地会话但不立刻弹登录框，交给调用方决定下一步。
  function logout() {
    clearProactiveRefresh();
    state.token = '';
    lsSet(TOKEN_KEY, '');
    state.tokenExp = 0;
    lsSet(EXP_KEY, '0');
    state.auth = 'required';
    renderStatus();
  }

  function storeToken(token, expiresAt) {
    state.token = token || '';
    lsSet(TOKEN_KEY, state.token);
    if (expiresAt) {
      var ms = new Date(expiresAt).getTime();
      state.tokenExp = isNaN(ms) ? 0 : ms;
      lsSet(EXP_KEY, String(state.tokenExp));
    }
    scheduleProactiveRefresh();
  }

  var tokenTimer = null;

  function clearProactiveRefresh() {
    if (tokenTimer) { clearTimeout(tokenTimer); tokenTimer = null; }
  }

  // JWT 有效期 1 小时；到期前 5 分钟主动续期，避免所有请求同时撞 401。
  function scheduleProactiveRefresh() {
    clearProactiveRefresh();
    var exp = Number(state.tokenExp) || 0;
    if (!state.token || !exp) return;
    var delay = exp - Date.now() - 5 * 60 * 1000;
    if (delay < 5000) delay = 5000;
    tokenTimer = setTimeout(function () {
      tokenTimer = null;
      if (!state.token) return;
      tryRefresh().then(function (ok) {
        if (!ok) renderStatus();
      });
    }, delay);
  }

  // 服务器停机后界面进入只读停机态：停掉轮询与 SSE，禁掉会写服务器的操作，
  // 只留刷新页面。反复请求已关闭的服务端只会刷一堆网络错误。
  var stoppedState = false;

  function enterStoppedState() {
    var banner = $('#shutdown-banner');
    if (banner) banner.hidden = false;
    if (stoppedState) return;
    stoppedState = true;
    state.stopped = true;
    clearProactiveRefresh();
    if (state.es) { try { state.es.close(); } catch (e) { /* ignore */ } state.es = null; }
    document.documentElement.setAttribute('data-stopped', 'true');
    $$('[data-action="shutdown"], [data-action="clear-errors"], [data-action="trigger-all"], [data-action="reload"]').forEach(function (el) {
      el.disabled = true;
    });
    if (typeof state.onStopped === 'function') { try { state.onStopped(); } catch (e) { /* ignore */ } }
  }

  var lastGlobalError = { message: '', at: 0 };

  function reportGlobalError(message) {
    if (state.stopped) return;
    var text = String(message || '').trim();
    var now = Date.now();
    if (text && text === lastGlobalError.message && now - lastGlobalError.at < 5000) return;
    lastGlobalError = { message: text, at: now };
    console.error('[tmd]', text);
    toast('error', t('global.unexpected') + (text ? '：' + text.slice(0, 120) : ''));
  }

  // 兜底：异步链路上没 catch 的异常也要让用户看见，而不是只剩控制台。
  function installGlobalErrorHandlers() {
    window.addEventListener('unhandledrejection', function (event) {
      var reason = event && event.reason;
      if (reason && (reason.name === 'AbortError' || reason.status === 401)) return;
      reportGlobalError(reason && (reason.message || String(reason)));
    });
    window.addEventListener('error', function (event) {
      if (event && event.target && event.target !== window) return;
      reportGlobalError(event && event.message);
    });
  }

  function tryRefresh() {
    if (!state.token) { openAuth(); return Promise.resolve(false); }
    return fetch('/api/v1/auth/refresh', { method: 'POST', headers: authHeaders() })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = res.ok ? unwrap(parseBody(text)) : null;
          if (res.ok && data && data.token) {
            storeToken(data.token, data.expires_at);
            state.auth = 'on';
            renderStatus();
            connectSSE();
            return true;
          }
          openAuth();
          return false;
        });
      })
      .catch(function () { openAuth(); return false; });
  }

  // loadContext 一次拿到认证开关、Cookie 就绪、队列与并发上限，
  // 避免用「随便打一个受保护端点看是否 401」来推断认证状态。
  function loadContext() {
    return request('/api/v1/download/context')
      .then(function (data) {
        state.context = data || null;
        if (!data) { renderStatus(); return null; }
        state.health = { status: 'ok', version: data.version || '' };
        if (data.queue) state.queue = data.queue;
        state.auth = data.auth_enabled ? (data.authenticated ? 'on' : 'required') : 'off';
        if (data.server_shutting_down) enterStoppedState();
        renderStatus();
        renderFooter();
        return data;
      })
      .catch(function () { state.context = null; renderStatus(); return null; });
  }

  function bootstrapAuth() {
    return loadContext().then(function (ctx) {
      if (!ctx || !ctx.auth_enabled || ctx.authenticated) return ctx;
      if (!state.token) { openAuth(); return ctx; }
      return tryRefresh().then(function (ok) {
        if (!ok) return ctx;
        return loadContext();
      });
    });
  }

  function login(apiKey) {
    return fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey }
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = parseBody(text);
        if (!res.ok) {
          var message = (json && (json.error || json.detail)) || ('HTTP ' + res.status);
          var err = new Error(message);
          err.status = res.status;
          throw err;
        }
        var data = unwrap(json) || {};
        if (!data.token) throw new Error(t('auth.badKey'));
        storeToken(data.token, data.expires_at);
        state.auth = 'on';
        renderStatus();
        connectSSE();
        return loadContext().then(function () { loadAll(); return true; });
      });
    });
  }

  /* ---------------- target parsing ---------------- */

  var RE_HANDLE = /^@?[A-Za-z0-9_]{1,15}$/;
  // scheme 可省略、主机名大小写不敏感；子域名（m./www./mobile.）一并吸收，
  // 主机名后必须是路径分隔符或结尾，避免把 x.com.evil 之类当成 X 链接。
  var RE_URL = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:x|twitter)\.com(?=[/?#]|$)/i;
  var RE_LIST_URL = /\/i\/lists\/(\d+)/i;
  var RE_JSON = /\.json$/i;
  var RE_PATH = /^(?:[A-Za-z]:[\\/]|\/|\.{1,2}[\\/]|~[\\/])/;
  // X 的站内页面不是账号：/home /search /i/... /u/status/1 都不能当用户名提交。
  var URL_RESERVED = {
    home: 1, explore: 1, notifications: 1, messages: 1, search: 1, settings: 1,
    i: 1, intent: 1, share: 1, hashtag: 1, compose: 1, login: 1, logout: 1,
    signup: 1, tos: 1, privacy: 1, account: 1, jobs: 1, premium: 1, about: 1,
    lists: 1, bookmarks: 1, communities: 1, download: 1, help: 1, rules: 1,
    terms: 1, following: 1, followers: 1, verified: 1
  };
  // 用户名后面的页面段：/media /reposts /with_replies 等仍然指向同一个账号，
  // 其余段（/status/1、/lists、/communities）没有对应的下载任务。
  var URL_USER_PAGES = { media: 1, reposts: 1, with_replies: 1, highlights: 1, likes: 1, photo: 1 };
  var RE_STATUS_URL = /\/(?:status|statuses)\/\d+/i;

  function classify(token) {
    if (!token) return null;
    if (RE_URL.test(token)) {
      var listMatch = token.match(RE_LIST_URL);
      if (listMatch) return { kind: 'list', value: listMatch[1] };
      var url = token.replace(/[?#].*$/, '').replace(/\/+$/, '')
        .replace(/^https?:\/\//i, '')
        .replace(/^(?:[a-z0-9-]+\.)*(?:x|twitter)\.com/i, '');
      // 单条推文、搜索页、设置页等在下载器里没有对应任务，直接标为无法识别。
      if (RE_STATUS_URL.test(url)) return { kind: 'bad', value: token };
      var parts = url.split('/').filter(Boolean);
      var handle = (parts[0] || '').replace(/^@/, '');
      // 第二段只接受「仍是这个账号的页面」的白名单，/handle/anything 不算账号。
      var tail = parts.length > 1 ? String(parts[1]).toLowerCase() : '';
      if (tail && !URL_USER_PAGES[tail]) return { kind: 'bad', value: token };
      if (handle && RE_HANDLE.test(handle) && !URL_RESERVED[handle.toLowerCase()]) {
        return { kind: 'user', value: handle };
      }
      return { kind: 'bad', value: token };
    }
    if (/^\d+$/.test(token)) return { kind: 'list', value: token };
    if (RE_JSON.test(token) || RE_PATH.test(token)) return { kind: 'json', value: token };
    if (/^@[A-Za-z0-9_]{1,15}$/.test(token)) return { kind: 'user', value: token.slice(1) };
    if (/^[A-Za-z0-9_]{1,15}$/.test(token)) return { kind: 'user', value: token };
    return { kind: 'bad', value: token };
  }

  // 每行先按换行切，行内再按空白/逗号切成多个目标。像文件路径的行（带盘符、绝对
  // 路径、~ 或 . 开头）整行保留，因为路径可以含空格；没有空白的行也不必切。
  function parseTargets(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [];
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      var tokens = RE_PATH.test(trimmed) || !/\s/.test(trimmed)
        ? [trimmed]
        : trimmed.split(/[\s,;，、]+/).filter(Boolean);
      tokens.forEach(function (token) {
        var item = classify(token);
        if (!item) return;
        item.raw = token;
        out.push(item);
      });
    });
    return out;
  }

  // 关注源只接受用户：数字会被当成列表 ID，URL 里的用户主页会取首段；
  // 去重后返回，避免同一个人创建多个关注任务。
  function parseFollowing(text) {
    var tokens = String(text || '').split(/[\s,;，、]+/).filter(Boolean);
    var names = [];
    var bad = [];
    var seen = {};
    tokens.forEach(function (token) {
      var item = classify(token);
      if (item && item.kind === 'user') {
        var key = item.value.toLowerCase();
        if (seen[key]) return;
        seen[key] = 1;
        names.push(item.value);
      } else {
        bad.push(token);
      }
    });
    return { names: names, bad: bad };
  }

  function followingValues() {
    var input = $('#batch-following');
    return input ? parseFollowing(input.value) : { names: [], bad: [] };
  }

  function syncFollowingField() {
    var wrap = $('#batch-following-wrap');
    if (wrap) wrap.hidden = state.mode !== 'batch';
  }

  function summarizeTargets(items) {
    var counts = { user: 0, list: 0, json: 0, bad: 0 };
    items.forEach(function (item) { counts[item.kind] = (counts[item.kind] || 0) + 1; });
    var used = ['user', 'list', 'json'].filter(function (kind) { return counts[kind] > 0; });
    var kind = 'empty';
    if (counts.bad > 0 && used.length === 0) kind = 'bad';
    else if (used.length === 1) kind = used[0];
    else if (used.length > 1) kind = 'mixed';
    return { kind: kind, counts: counts, total: items.length };
  }

  function updateTargetHint() {
    var items = parseTargets($('#target-input').value);
    var summary = summarizeTargets(items);
    var hint = $('#parse-hint');
    var tag = $('#target-tag');

    if (!items.length) {
      hint.textContent = t('target.hint');
      hint.removeAttribute('data-tone');
      tag.hidden = true;
      return;
    }

    var key = summary.kind === 'mixed' ? 'target.hintMixed'
      : summary.kind === 'bad' ? 'target.hintBad'
        : summary.kind === 'user' ? 'target.hintUser'
          : summary.kind === 'list' ? 'target.hintList'
            : 'target.hintJson';
    hint.textContent = t(key, { n: summary.total });
    hint.setAttribute('data-tone', summary.kind === 'bad' ? 'bad' : 'good');

    tag.hidden = false;
    tag.setAttribute('data-kind', summary.kind);
    tag.textContent = t('tag.' + summary.kind) + ' ×' + summary.total;

    if (!state.manualMode) {
      var inferred = summary.kind === 'mixed' ? 'batch' : summary.kind;
      if (state.mark && !modeDef(inferred).mark) {
        if (summary.counts.user > 0 && summary.counts.list > 0) inferred = 'batch';
        else if (summary.counts.list > 0) inferred = 'list';
        else inferred = 'user';
      }
      if (inferred && inferred !== 'bad' && inferred !== 'empty' && state.mode !== inferred) {
        state.mode = inferred;
        renderModes();
        renderOptions();
      }
    }
  }

  /* ---------------- mode + options UI ---------------- */

  function renderModes() {
    var group = $('#mode-group');
    group.innerHTML = MODES.map(function (mode) {
      var checked = state.mode === mode.id ? ' checked' : '';
      var disabled = state.mark && !mode.mark;
      return '<div class="segmented__item"' + (disabled ? ' data-disabled="true"' : '') + '>' +
        '<input type="radio" name="mode" id="mode-' + mode.id + '" value="' + mode.id + '"' + checked + (disabled ? ' disabled' : '') + '>' +
        '<label for="mode-' + mode.id + '">' + esc(t('mode.' + mode.id)) + '</label>' +
        '</div>';
    }).join('');
  }

  function modeDef(id) {
    for (var i = 0; i < MODES.length; i++) {
      if (MODES[i].id === id) return MODES[i];
    }
    return MODES[0];
  }

  function syncUploadField() {
    var field = $('#upload-field');
    if (!field) return;
    var show = state.mode === 'json';
    field.hidden = !show;
    if (!show) {
      state.files = [];
      state.folderFiles = [];
      var input = $('#json-files');
      if (input) input.value = '';
      var folder = $('#json-folder');
      if (folder) folder.value = '';
      var label = $('#upload-files');
      if (label) label.textContent = '';
    }
  }

  function renderOptions() {
    syncUploadField();
    syncFollowingField();
    var def = modeDef(state.mode);
    var group = $('#options-group');
    if (!group) return;
    if (!def.opts.length) {
      group.innerHTML = '';
      group.setAttribute('data-empty', 'true');
      return;
    }
    group.removeAttribute('data-empty');
    group.innerHTML = def.opts.map(function (key) {
      var checked = state.flags[key] ? ' checked' : '';
      var label = t('opt.' + key.replace(/_([a-z])/g, function (m, c) { return c.toUpperCase(); }));
      return '<label class="option" title="' + esc(OPTION_TITLE[key]) + '">' +
        '<input type="checkbox" data-flag="' + key + '"' + checked + '>' +
        '<span class="option__box" aria-hidden="true"></span>' +
        '<span>' + esc(label) + '</span>' +
        '</label>';
    }).join('');
  }

  function readFlags() {
    $$('#options-group input[data-flag]').forEach(function (input) {
      state.flags[input.getAttribute('data-flag')] = input.checked;
    });
    lsSet(FLAGS_KEY, JSON.stringify(state.flags));
  }

  function flagsFor(mode) {
    var def = modeDef(mode);
    var out = {};
    def.opts.forEach(function (key) { out[key] = !!state.flags[key]; });
    return out;
  }

  /* ---------------- submit ---------------- */

  function markTimestamp() {
    var input = $('#mark-time');
    if (!input || !input.value) return '';
    var date = new Date(input.value);
    if (isNaN(date.getTime())) return '';
    return date.toISOString();
  }

  function buildRequests(mode, items, following) {
    var flags = flagsFor(mode);
    var followingNames = (mode === 'batch' && following) ? following.names : [];
    var jsonPaths = items.filter(function (i) { return i.kind === 'json'; });
    var users = items.filter(function (i) { return i.kind === 'user'; }).map(function (i) { return i.value; });
    var lists = items.filter(function (i) { return i.kind === 'list'; }).map(function (i) { return i.value; });

    if (state.mark) {
      var stamp = markTimestamp();
      var stampBody = stamp ? { timestamp: stamp } : undefined;
      if (mode === 'batch') {
        if (!users.length && !lists.length && !followingNames.length) return [];
        var markBody = { users: users, lists: lists.map(Number), following_names: followingNames };
        if (stamp) markBody.timestamp = stamp;
        return [{ path: '/api/v1/batch/mark', body: markBody, label: users.concat(lists).length + followingNames.length + ' targets' }];
      }
      if (mode === 'list') {
        return lists.map(function (id) {
          return { path: '/api/v1/lists/' + encodeURIComponent(id) + '/mark', body: stampBody, label: 'list ' + id };
        });
      }
      if (mode === 'following') {
        return users.map(function (name) {
          return { path: '/api/v1/users/' + encodeURIComponent(name) + '/following/mark', body: stampBody, label: name };
        });
      }
      if (mode === 'user') {
        return users.map(function (name) {
          return { path: '/api/v1/users/' + encodeURIComponent(name) + '/mark', body: stampBody, label: name };
        });
      }
      return [];
    }

    if (mode === 'batch') {
      var body = { users: users, lists: lists.map(Number), following_names: followingNames };
      Object.keys(flags).forEach(function (key) { body[key] = flags[key]; });
      return [{ path: '/api/v1/batch/download', body: body, label: users.concat(lists).length + followingNames.length + ' targets' }];
    }
    if (mode === 'json') {
      var paths = jsonPaths.map(function (i) { return i.value; });
      var isFolder = paths.length > 0 && paths.every(function (p) { return !RE_JSON.test(p); });
      var url = isFolder ? '/api/v1/json/folder/download' : '/api/v1/json/file/download';
      return [{ path: url, body: { paths: paths, no_retry: !!flags.no_retry }, label: paths.length + ' paths' }];
    }
    if (mode === 'profile') {
      // 补档同时支持用户与列表：列表补档走 /lists/{id}/profile。
      return users.map(function (name) {
        return { path: '/api/v1/users/' + encodeURIComponent(name) + '/profile', body: undefined, label: name };
      }).concat(lists.map(function (id) {
        return { path: '/api/v1/lists/' + encodeURIComponent(id) + '/profile', body: undefined, label: 'list ' + id };
      }));
    }
    if (mode === 'list') {
      return lists.map(function (id) {
        return { path: '/api/v1/lists/' + encodeURIComponent(id) + '/download', body: flags, label: 'list ' + id };
      });
    }
    if (mode === 'following') {
      return users.map(function (name) {
        return {
          path: '/api/v1/users/' + encodeURIComponent(name) + '/following/download',
          body: flags, label: name
        };
      });
    }
    return users.map(function (name) {
      return { path: '/api/v1/users/' + encodeURIComponent(name) + '/download', body: flags, label: name };
    });
  }

  function showFormError(message) {
    var box = $('#form-error');
    box.textContent = message;
    box.hidden = false;
  }

  function clearFormError() {
    var box = $('#form-error');
    box.hidden = true;
    box.textContent = '';
  }

  function setSubmitting(on) {
    state.submitting = on;
    var btn = $('#submit-btn');
    btn.disabled = on;
    btn.classList.toggle('btn--busy', on);
    var text = $('.btn__text', btn);
    if (text) text.textContent = on ? t('submit.busy') : t('submit.go');
  }

  function submitForm(event) {
    if (event) event.preventDefault();
    if (state.submitting) return;
    clearFormError();

    if (state.mode === 'json' && (state.files.length || state.folderFiles.length)) {
      submitUpload();
      return;
    }

    var items = parseTargets($('#target-input').value);
    var following = state.mode === 'batch' ? followingValues() : { names: [], bad: [] };
    if (following.bad.length) {
      showFormError(t('batch.badFollowing', {
        n: following.bad.length,
        list: following.bad.slice(0, 3).join(', ')
      }));
      return;
    }
    var totalTargets = items.length + following.names.length;
    if (!totalTargets) { showFormError(t('form.empty')); return; }

    var bad = items.filter(function (i) { return i.kind === 'bad'; });
    if (bad.length) {
      showFormError(t('form.badTargets', {
        n: bad.length,
        list: bad.slice(0, 3).map(function (i) { return i.raw; }).join(', ')
      }));
      return;
    }
    if (totalTargets > MAX_TARGETS) { showFormError(t('form.tooMany', { n: MAX_TARGETS })); return; }
    if (state.mark && !modeDef(state.mode).mark) { showFormError(t('mark.unsupported')); return; }

    var requests = buildRequests(state.mode, items, following);
    if (!requests.length) {
      showFormError(state.mark ? t('mark.unsupported') : t('form.empty'));
      return;
    }

    setSubmitting(true);
    var ok = 0;
    var failed = 0;
    var firstError = '';
    var failedLabels = [];
    var clearFollowing = false;
    var chain = Promise.resolve();
    requests.forEach(function (req) {
      chain = chain.then(function () {
        return request(req.path, { method: 'POST', body: req.body })
          .then(function () {
            ok += 1;
            if (following.names.length && req.path.indexOf('/api/v1/batch/') === 0) clearFollowing = true;
          })
          .catch(function (err) {
            failed += 1;
            failedLabels.push(req.label);
            if (!firstError) firstError = err.status === 401 ? '' : err.message;
            if (err.status !== 401) toast('error', req.label + ': ' + err.message);
          });
      });
    });

    chain.then(function () {
      setSubmitting(false);
      var input = $('#target-input');
      if (ok > 0) {
        // 全部成功才清空输入；有失败时只保留失败的目标，用户改完可以直接重发。
        // 批量/JSON 的 label 是「N targets」这类说明而不是可重发的目标，失败时保留原文。
        if (failed && (state.mode === 'batch' || state.mode === 'json')) {
          // keep the original input for correction and resubmit
        } else {
          input.value = failed ? failedLabels.join('\n') : '';
        }
        if (clearFollowing) {
          var followingInput = $('#batch-following');
          if (followingInput) followingInput.value = '';
        }
        updateTargetHint();
        resetTextareaHeight();
        saveDraftNow();
        if (failed) toast('error', t('toast.queuedPartial', { ok: ok, fail: failed }));
        else if (totalTargets === 1) toast('success', t('toast.queued', {
          name: items.length ? items[0].value : following.names[0]
        }));
        else toast('success', t('toast.queuedN', { n: ok }));
        loadTasks();
      } else if (failed) {
        showFormError(t('form.failed', { msg: firstError || t('auth.badKey') }));
      }
    });
  }

  function submitUpload() {
    var folder = (state.folderFiles || []).length > 0;
    var files = folder ? state.folderFiles : (state.files || []);
    if (!files.length) return;
    var form = new FormData();
    files.forEach(function (file) {
      // 文件夹上传保留相对路径，后端按目录识别重复文件名；单文件上传只发文件名。
      var name = folder ? (file.webkitRelativePath || file.name) : file.name;
      form.append('files', file, name);
    });
    if (state.flags.no_retry) form.append('no_retry', 'true');
    var endpoint = folder ? '/api/v1/json/folder/download' : '/api/v1/json/file/download';

    setSubmitting(true);
    fetch(endpoint, { method: 'POST', headers: authHeaders(), body: form })
      .then(function (res) {
        return res.text().then(function (text) {
          var json = parseBody(text);
          if (res.ok) {
            unwrap(json);
            toast('success', t('upload.ok', { n: files.length }));
            state.files = [];
            state.folderFiles = [];
            var input = $('#json-files');
            if (input) input.value = '';
            var folderInput = $('#json-folder');
            if (folderInput) folderInput.value = '';
            var filesLabel = $('#upload-files');
            if (filesLabel) filesLabel.textContent = '';
            $('#target-input').value = '';
            lsSet(DRAFT_KEY, '');
            updateTargetHint();
            resetTextareaHeight();
            loadTasks();
            return;
          }
          if (res.status === 401) { onUnauthorized(); return; }
          var message = (json && (json.error || json.detail)) || ('HTTP ' + res.status);
          throw new Error(message);
        });
      })
      .catch(function (err) {
        if (err.status !== 401) showFormError(t('upload.failed', { msg: err.message }));
      })
      .then(function () { setSubmitting(false); });
  }

  /* ---------------- SSE ---------------- */

  // 后端把 task_* 通知写成英文短句（task_manager.go:397-566）。前端按类型本地化，
  // 并借用 detail.task_id 从当前快照里取目标名，让提示能被用户对上具体任务。
  function notificationTone(type) {
    if (type === 'task_failed') return 'error';
    if (type === 'task_completed') return 'success';
    if (type === 'schedule_warning') return 'warn';
    return 'info';
  }

  function localizeNotification(payload) {
    var type = payload.type || '';
    var detail = payload.detail || {};
    var taskId = detail.task_id || '';
    var task = null;
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].task_id === taskId) { task = state.tasks[i]; break; }
    }
    var target = task ? taskTarget(task) : shortId(taskId);
    if (type === 'task_completed') return t('notify.completed', { target: target });
    if (type === 'task_failed') {
      var message = String(payload.message || '');
      var cut = message.indexOf('failed: ');
      var reason = cut >= 0 ? message.slice(cut + 8) : '';
      return t(reason ? 'notify.failedWithReason' : 'notify.failed', { target: target, reason: reason });
    }
    if (type === 'task_cancelled') return t('notify.cancelled', { target: target });
    // tasks_cancelled 与 schedule_warning 的后端文案已带数量/调度名，直接展示。
    return payload.message || '';
  }

  // tasksEpoch 在每次 SSE 快照时自增；loadTasks 丢弃发出时就已过期的响应，
  // 避免 GET 比 SSE 慢半拍时用旧快照覆盖新状态。
  var tasksEpoch = 0;

  function connectSSE() {
    // 需要密钥却没有令牌时不要连，否则 EventSource 会 4 秒一次打 401
    if (state.auth === 'required' && !state.token) return;
    if (state.stopped) return;
    if (state.es) {
      try { state.es.close(); } catch (e) { /* ignore */ }
      state.es = null;
    }
    var url = '/api/v1/sse/tasks';
    if (state.token) url += '?token=' + encodeURIComponent(state.token);
    var es = new EventSource(url);
    state.es = es;

    es.addEventListener('tasks', function (event) {
      var payload = parseBody(event.data);
      var tasks = Array.isArray(payload) ? payload : (payload && payload.tasks) || [];
      tasksEpoch += 1;
      state.tasks = tasks;
      state.connected = true;
      renderQueue();
      updateOpenTaskDetail(tasks);
      scheduleLedgerRefresh();
      emit('tasks', tasks);
    });

    es.addEventListener('schedules', function (event) {
      var payload = parseBody(event.data);
      state.schedules = payload || null;
      emit('schedules', payload);
    });

    es.addEventListener('notification', function (event) {
      var payload = parseBody(event.data);
      if (!payload) return;
      var localized = localizeNotification(payload);
      if (!localized) return;
      toast(notificationTone(payload.type), localized);
    });

    es.addEventListener('server_shutdown', function () {
      enterStoppedState();
    });

    es.onopen = function () {
      if (!state.sseOpened) {
        // 首次连接：只标记在线，不提示（否则每次进页面都弹「已恢复」）。
        state.sseOpened = true;
      } else if (!state.connected) {
        toast('info', t('toast.online'));
      }
      state.connected = true;
      loadTasks();
      // 断线期间累积的失败记录不会推事件，重连时补一次，错误条才不是旧数据。
      loadErrors();
      // 台账/统计在断线期间也会过期；重连后一起补齐，避免还显示旧总数。
      loadLedger('keep');
      loadStats();
    };

    es.onerror = function () {
      state.connected = false;
      renderStatus();
      if (state.auth === 'required' && !state.token) {
        try { es.close(); } catch (e) { /* ignore */ }
        state.es = null;
        return;
      }
      if (state.stopped) return;
      setTimeout(function () {
        if (!state.stopped && (!state.es || state.es.readyState === 2)) connectSSE();
      }, 4000);
    };
  }

  /* ---------------- data loading ---------------- */

  function normalizeTasks(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.tasks)) return data.tasks;
    return [];
  }

  function loadTasks() {
    var epoch = tasksEpoch;
    return request('/api/v1/tasks')
      .then(function (data) {
        if (epoch !== tasksEpoch) return;
        state.tasks = normalizeTasks(data);
        renderQueue();
        updateOpenTaskDetail(state.tasks);
        scheduleLedgerRefresh();
        emit('tasks', state.tasks);
      })
      .catch(function () { /* 401 已由 onUnauthorized 处理 */ });
  }

  var ledgerTimer = null;

  // 指针停在台账 / 队列上时推迟自动重绘：innerHTML 被替换后，按下与松开落在不同节点上，
  // click 不会触发，用户会看到「按钮点了没反应」。按住期间挂起刷新，松手 300ms 后补上。
  var holdUntil = 0;
  var HOLD_ZONE = '#ledger, #ledger-filters, #queue, #queue-section, #ledger-empty, #btn-batch-retry, #btn-batch-delete';

  function interactionHeld() { return holdUntil > Date.now(); }

  function trackInteraction() {
    document.addEventListener('pointerdown', function (event) {
      var el = event.target;
      if (el && el.closest && el.closest(HOLD_ZONE)) holdUntil = Date.now() + 900;
    }, true);
    document.addEventListener('pointerup', function () {
      if (holdUntil) holdUntil = Math.max(holdUntil, Date.now() + 300);
    }, true);
  }

  // SSE 每次推全量快照都会触发队列重绘；台账查询合并成 300ms 一次，避免每个事件打一次接口。
  function scheduleLedgerRefresh() {
    clearTimeout(ledgerTimer);
    var wait = 300;
    if (interactionHeld()) wait = Math.max(wait, holdUntil - Date.now() + 60);
    ledgerTimer = setTimeout(function () { loadLedger('keep'); loadStats(); }, wait);
  }

  function ledgerParams() {
    var params = { page: state.ledger.page || 1, pageSize: state.ledger.pageSize || LEDGER_PAGE };
    if (state.filter === 'active') params.status = 'queued,running';
    else if (state.filter !== 'all') params.status = state.filter;
    var typeDef = typeFilterDef(state.type);
    if (typeDef && typeDef.types.length) params.type = typeDef.types.join(',');
    var stageDef = stageFilterDef(state.stage);
    if (stageDef && stageDef.stages.length) params.stage = stageDef.stages.join(',');
    if (state.query) params.q = state.query;
    params.sortBy = 'created_at';
    params.sortOrder = 'desc';
    return params;
  }

  // 台账窗口写回 localStorage：筛选、阶段、关键词、页码刷新后保持。
  function saveLedgerView() {
    lsSet(LEDGER_VIEW_KEY, JSON.stringify({
      filter: state.filter,
      type: state.type,
      stage: state.stage,
      query: state.query,
      pageSize: state.ledger.pageSize,
      page: state.ledger.page || 1
    }));
  }

  // ledgerSeq 标记台账请求代际：筛选切换后迟到的旧响应不能写回 state。
  var ledgerSeq = 0;

  // loadLedger 走服务端过滤与分页（/tasks/query）。mode: 'reset' 回第一页、'keep' 留在当前页
  // （SSE 与轮询刷新用它）、'page' 指定 state.ledger.page。请求进行中的调用排队到本次结束后重放，
  // 否则 300ms 内的筛选切换会被静默丢弃。
  function loadLedger(mode) {
    if (state.ledger.loading) {
      state.ledger.pending = mode || 'keep';
      state.ledger.pendingPage = state.ledger.page;
      return Promise.resolve();
    }
    if (mode === 'reset') state.ledger.page = 1;
    saveLedgerView();
    var seq = ++ledgerSeq;
    var clampToLast = false;
    state.ledger.loading = true;
    return request('/api/v1/tasks/query' + buildQuery(ledgerParams()))
      .then(function (data) {
        // 迟到响应：期间用户换了筛选条件，旧结果不能再写回 state。
        if (seq !== ledgerSeq) return;
        state.ledger.total = (data && data.total) || 0;
        state.ledger.items = (data && data.items) || [];
        state.ledger.page = (data && Number(data.page)) || state.ledger.page || 1;
        var pages = (data && Number(data.total_pages)) || 0;
        state.ledger.pages = pages > 0
          ? pages
          : Math.max(1, Math.ceil(state.ledger.total / (state.ledger.pageSize || LEDGER_PAGE)));
        var fresh = [];
        state.ledger.items.forEach(function (task) {
          if (!task || !task.task_id) return;
          if (state.ledger.ready && !state.seenLedger[task.task_id]) fresh.push(task.task_id);
          state.seenLedger[task.task_id] = 1;
        });
        state.ledger.ready = true;
        state.ledger.fresh = fresh;
        // 恢复的页码可能已超过筛选后的总页数：夹到最后一页，下一次请求取真实数据。
        if (state.ledger.page > state.ledger.pages && state.ledger.pages >= 1) {
          state.ledger.page = state.ledger.pages;
          clampToLast = true;
        }
      })
      .catch(function () { })
      // loading 必须在重绘前落下，否则空结果会停在骨架屏上。
      .then(function () {
        state.ledger.loading = false;
        if (seq !== ledgerSeq) return;
        if (clampToLast) { loadLedger('keep'); return; }
        renderLedger();
        markFreshRows(state.ledger.fresh);
        state.ledger.fresh = [];
        var next = state.ledger.pending;
        if (next) {
          state.ledger.pending = null;
          if (next === 'page' && state.ledger.pendingPage) state.ledger.page = state.ledger.pendingPage;
          state.ledger.pendingPage = 0;
          loadLedger(next === 'page' ? 'current' : next);
        }
      });
  }

  // 新任务到达时给行一个短高亮，避免列表刷新后用户找不到刚提交的任务。
  function markFreshRows(ids) {
    if (!ids || !ids.length) return;
    ids.forEach(function (id) {
      var row = document.querySelector('.lrow[data-id="' + id + '"]');
      if (!row) return;
      row.classList.add('lrow--new');
      setTimeout(function () { row.classList.remove('lrow--new'); }, 3600);
    });
  }

  function typeFilterDef(id) {
    for (var i = 0; i < TYPE_FILTERS.length; i++) {
      if (TYPE_FILTERS[i].id === id) return TYPE_FILTERS[i];
    }
    return TYPE_FILTERS[0];
  }

  function stageFilterDef(id) {
    for (var i = 0; i < STAGE_FILTERS.length; i++) {
      if (STAGE_FILTERS[i].id === id) return STAGE_FILTERS[i];
    }
    return STAGE_FILTERS[0];
  }

  function renderStageFilter() {
    var select = $('#ledger-stage');
    if (!select) return;
    select.innerHTML = STAGE_FILTERS.map(function (item) {
      var label = item.id === 'all' ? t('stageFilter.all') : t('stage.' + item.id);
      return '<option value="' + item.id + '">' + esc(label) + '</option>';
    }).join('');
    select.value = stageFilterDef(state.stage).id;
  }

  // renderTypeFilter 只重建下拉选项，选中值跟随 state.type，避免整个工具栏重绘。
  function renderTypeFilter() {
    var select = $('#ledger-type');
    if (!select) return;
    select.innerHTML = TYPE_FILTERS.map(function (item) {
      return '<option value="' + item.id + '">' + esc(t('typeFilter.' + item.id)) + '</option>';
    }).join('');
    select.value = state.type;
  }

  function loadErrors() {
    return request('/api/v1/errors')
      .then(function (data) {
        state.errors = {
          regular: (data && data.regular) || {},
          details: (data && data.regular_details) || [],
          json: (data && data.json) || []
        };
        renderErrors();
      })
      .catch(function () { });
  }

  function loadStats() {
    return request('/api/v1/tasks/stats')
      .then(function (data) {
        state.stats = data || null;
        if (!interactionHeld()) renderFilters();
      })
      .catch(function () { /* 计数只用于筛选 chip，失败不影响台账 */ });
  }

  function loadAll() {
    // loadContext 让页头的版本、队列与认证状态跟着刷新走，而不是只在启动时取一次。
    // 启动时恢复了上次的页码就留在那一页；用户主动刷新/重试才回到第一页。
    var mode = state.ledger.restored ? 'keep' : 'reset';
    state.ledger.restored = false;
    return Promise.all([loadTasks(), loadErrors(), loadLedger(mode), loadStats(), loadContext()]);
  }

  /* ---------------- rendering ---------------- */

  function taskStatus(task) { return (task && task.status) || 'queued'; }

  function taskTarget(task) {
    var data = (task && task.data) || {};
    if (data.screen_name) return data.screen_name;
    if (data.list_id) return 'list ' + data.list_id;
    if (Array.isArray(data.paths) && data.paths.length) {
      return data.paths.length > 1 ? data.paths[0] + ' +' + (data.paths.length - 1) : data.paths[0];
    }
    if (Array.isArray(data.used_users) && data.used_users.length) return data.used_users.join(', ');
    if (Array.isArray(data.users) && data.users.length) return data.users[0] + ' +' + (data.users.length - 1);
    return task.task_id || '—';
  }

  function progressOf(task) {
    var p = (task && task.progress) || {};
    var total = Number(p.total) || 0;
    var done = Number(p.completed) || 0;
    var failed = Number(p.failed) || 0;
    // 进度条表示「已处理」比例，失败项也算处理过，否则部分失败的任务永远停在半格。
    var percent = total > 0 ? Math.min(100, Math.round(((done + failed) / total) * 100)) : null;
    return { total: total, done: done, failed: failed, percent: percent, stage: p.stage || '', current: p.current || '' };
  }

  // 任务 ID 形如 task_47efa400-…，列表里只展示前缀后的第一段，完整值放 title/详情。
  function shortId(id) {
    var text = String(id || '');
    var stripped = text.replace(/^task[_-]/, '').replace(/-.*$/, '');
    return (stripped || text).slice(0, 8);
  }

  function typeLabel(type) {
    var key = 'taskType.' + (type || '');
    var label = t(key);
    return label === key ? (type || '—') : label;
  }

  function statusPill(status) {
    return '<span class="pill" data-status="' + esc(status) + '">' + esc(t('taskStatus.' + status)) + '</span>';
  }

  function renderStatus() {
    var healthEl = $('#status-health');
    if (state.health && state.health.status) {
      healthEl.setAttribute('data-state', 'ok');
      healthEl.textContent = t('status.health', { version: versionLabel(state.health.version) });
    } else {
      healthEl.setAttribute('data-state', 'error');
      healthEl.textContent = t('status.healthFail');
    }

    var queueEl = $('#status-queue');
    if (state.queue) {
      queueEl.textContent = t('status.queue', {
        active: state.queue.active_jobs || 0,
        pending: state.queue.pending_jobs || 0
      });
    } else {
      queueEl.textContent = t('status.queueEmpty');
    }

    var authEl = $('#status-auth');
    var authBtn = $('#btn-auth');
    if (state.auth === 'off') {
      authEl.setAttribute('data-state', 'ok');
      authEl.textContent = t('status.authOff');
      authBtn.hidden = true;
    } else if (state.auth === 'on') {
      authEl.setAttribute('data-state', 'ok');
      authEl.textContent = t('status.authOn');
      authBtn.hidden = false;
    } else if (state.auth === 'required') {
      authEl.setAttribute('data-state', 'error');
      authEl.textContent = t('status.authRequired');
      authBtn.hidden = false;
    } else {
      authEl.setAttribute('data-state', 'loading');
      authEl.textContent = t('status.authUnknown');
      authBtn.hidden = true;
    }
    authBtn.textContent = t('status.changeKey');

    if (state.health) healthEl.setAttribute('data-state', state.connected ? 'ok' : 'warn');
  }

  function activeTaskCount() {
    return state.tasks.filter(function (task) {
      var status = taskStatus(task);
      return status === 'queued' || status === 'running';
    }).length;
  }

  // renderHead 把「当前有几个在跑」放到页头，空闲时明确写「队列空闲」，避免误以为任务丢了。
  function renderHead() {
    var el = $('#head-active');
    if (!el) return;
    var active = activeTaskCount();
    el.setAttribute('data-active', active > 0 ? 'true' : 'false');
    el.textContent = active > 0 ? t('tasksView.activeN', { n: active }) : t('tasksView.activeZero');
  }

  // 队列来自 SSE 全量快照，每几百毫秒就可能到一次。只有任务集合或顺序变化时才重建 DOM；
  // 纯进度/阶段变化只更新文本与进度条，这样正在点「取消」或键盘聚焦的按钮不会被替换掉。
  function renderQueue(force) {
    var active = state.tasks.filter(function (task) {
      var status = taskStatus(task);
      return status === 'queued' || status === 'running';
    });
    var section = $('#queue-section');
    if (section) section.hidden = active.length === 0;
    var count = $('#queue-count');
    if (count) count.textContent = String(active.length);
    var host = $('#queue');
    if (host) {
      var nodes = Array.prototype.filter.call(host.children, function (el) {
        return el.classList && el.classList.contains('ticket');
      });
      var same = !force && nodes.length === active.length;
      if (same) {
        for (var i = 0; i < active.length; i += 1) {
          if (nodes[i].getAttribute('data-task-id') !== active[i].task_id) { same = false; break; }
        }
      }
      if (same) active.forEach(function (task, index) { updateTicketNode(nodes[index], task); });
      else host.innerHTML = active.map(renderTicket).join('');
    }
    var cancel = $('#btn-cancel-queued');
    if (cancel) cancel.disabled = !active.some(function (task) { return taskStatus(task) === 'queued'; });
    updateTaskTabCount(active.length);
    renderHead();
  }

  // stageLabel 把后端的英文阶段名翻成界面语言；未知阶段原样显示。
  function stageLabel(stage) {
    if (!stage) return '';
    var key = 'stage.' + stage;
    var text = t(key);
    return text === key ? String(stage) : text;
  }

  function ticketMetaHtml(task) {
    var status = taskStatus(task);
    var progress = progressOf(task);
    var metrics = [];
    var result = task.result || {};
    if (result.main && result.main.downloaded) metrics.push(t('metric.downloaded', { n: result.main.downloaded }));
    if (result.main && result.main.failed) metrics.push(t('metric.failed', { n: result.main.failed }));
    if (result.profile && result.profile.downloaded) metrics.push(t('metric.profile', { n: result.profile.downloaded }));
    if (result.profile && result.profile.versioned) metrics.push(t('metric.versioned', { n: result.profile.versioned }));
    var stage = status === 'queued' ? t('ticket.waiting') : stageLabel(progress.stage);
    var countText = progress.total > 0 ? t('metric.progress', { done: progress.done, total: progress.total }) : '';
    return '<span>' + esc(typeLabel(task.type)) + '</span>' +
      (stage ? '<span>' + esc(stage) + '</span>' : '') +
      (countText ? '<span>' + esc(countText) + '</span>' : '') +
      metrics.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') +
      (task.error ? '<span class="pill" data-status="failed">' + esc(task.error) + '</span>' : '');
  }

  function ticketActionsHtml(task) {
    var status = taskStatus(task);
    var actions = taskActionButton(task, 'detail', t('detail.open'), 'btn--ghost');
    if (status === 'queued' || status === 'running') {
      actions += taskActionButton(task, 'cancel', t('ticket.cancel'), 'btn--ghost');
    }
    return actions;
  }

  function ticketProgressClass(task) {
    var progress = progressOf(task);
    return 'progress' + (progress.percent === null && taskStatus(task) === 'running' ? ' progress--indeterminate' : '');
  }

  function renderTicket(task) {
    var status = taskStatus(task);
    var progress = progressOf(task);
    var actions = ticketActionsHtml(task);
    var bar = '<div class="' + ticketProgressClass(task) + '">' +
      '<div class="progress__bar" style="width:' + (progress.percent === null ? 0 : progress.percent) + '%"></div>' +
      '</div>';
    return '<article class="ticket" data-status="' + esc(status) + '" data-task-id="' + esc(task.task_id) + '">' +
      '<div class="ticket__head">' +
      '<span class="ticket__id">' + esc(shortId(task.task_id)) + '</span>' +
      statusPill(status) +
      '</div>' +
      '<div class="ticket__title">' + esc(taskTarget(task)) + '</div>' +
      '<div class="ticket__meta">' + ticketMetaHtml(task) + '</div>' +
      bar +
      (actions ? '<div class="ticket__actions">' + actions + '</div>' : '') +
      (status === 'completed' ? '<div class="ticket__stamp">' + esc(t('ticket.stamp')) + '</div>' : '') +
      '</article>';
  }

  function updateTicketNode(node, task) {
    var status = taskStatus(task);
    if (node.getAttribute('data-status') !== status) node.setAttribute('data-status', status);
    var pill = node.querySelector('.ticket__head .pill');
    var pillHtml = statusPill(status);
    if (pill && pill.outerHTML !== pillHtml) pill.outerHTML = pillHtml;
    var meta = node.querySelector('.ticket__meta');
    var metaHtml = ticketMetaHtml(task);
    if (meta && meta.innerHTML !== metaHtml) meta.innerHTML = metaHtml;
    var bar = node.querySelector('.progress');
    if (bar) {
      var cls = ticketProgressClass(task);
      if (bar.className !== cls) bar.className = cls;
      var fill = bar.querySelector('.progress__bar');
      var width = (progressOf(task).percent === null ? 0 : progressOf(task).percent) + '%';
      if (fill && fill.style.width !== width) fill.style.width = width;
    }
  }

  // 目标里的长路径只显示文件名，完整值放 title，避免盘符占满一行。
  function shortTarget(value) {
    var text = String(value || '');
    var cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf(String.fromCharCode(92)));
    if (cut > 0 && cut < text.length - 1 && text.length - cut <= 48) return text.slice(cut + 1);
    return text;
  }

  var LEDGER_EXAMPLES = ['@nasa', 'https://x.com/elonmusk', '1234567890'];

  function skeletonRows(count) {
    var out = '';
    for (var i = 0; i < count; i++) {
      out += '<div class="skeleton-row" aria-hidden="true">' +
        '<span class="skeleton" style="width:64px"></span>' +
        '<span class="skeleton" style="width:60%"></span>' +
        '<span class="skeleton" style="width:80%"></span>' +
        '<span class="skeleton" style="width:48px"></span>' +
        '<span class="skeleton" style="width:96px"></span>' +
        '</div>';
    }
    return out;
  }

  // 空态分两种：筛选为空给「清除筛选」，真正没有记录时给可点击的示例目标。
  function renderLedgerEmpty(filtered) {
    var title = $('#ledger-empty-text');
    var actions = $('#ledger-empty-actions');
    if (!title || !actions) return;
    if (filtered) {
      title.textContent = t('ledger.emptyFilter');
      actions.innerHTML = '<button type="button" class="btn btn--ghost btn--sm" data-action="reset-filters">' +
        esc(t('ledger.clearFilters')) + '</button>';
      return;
    }
    title.textContent = t('ledger.emptyTitle');
    actions.innerHTML = '<p class="empty__hint">' + esc(t('ledger.emptyHint')) + '</p>' +
      LEDGER_EXAMPLES.map(function (value) {
        return '<button type="button" class="btn btn--ghost btn--sm" data-example="' + esc(value) + '">' +
          '<span class="mono">' + esc(value) + '</span></button>';
      }).join('');
  }

  function renderLedgerPager() {
    var pager = $('#ledger-pager');
    if (!pager) return;
    var pages = Math.max(1, Number(state.ledger.pages) || 1);
    var page = Math.min(Math.max(1, Number(state.ledger.page) || 1), pages);
    pager.hidden = pages <= 1 && page <= 1;
    var info = $('#ledger-pageinfo');
    if (info) {
      info.textContent = t('ledger.pageInfo', {
        page: page,
        pages: pages,
        total: Number(state.ledger.total) || 0
      });
    }
    var prev = $('#ledger-prev');
    var next = $('#ledger-next');
    if (prev) prev.disabled = state.ledger.loading || page <= 1;
    if (next) next.disabled = state.ledger.loading || page >= pages;
    var jump = $('#ledger-page-jump');
    if (jump) {
      jump.max = String(pages);
      if (document.activeElement !== jump) jump.value = String(page);
    }
  }

  function goLedgerPage(raw) {
    var pages = Math.max(1, Number(state.ledger.pages) || 1);
    var page = Number(raw);
    if (!isFinite(page) || page < 1 || page > pages || Math.floor(page) !== page) {
      toast('error', t('ledger.jumpBad'));
      renderLedgerPager();
      return;
    }
    if (page === state.ledger.page) return;
    state.ledger.page = page;
    loadLedger('page');
  }

  function renderLedger() {
    var host = $('#ledger');
    if (!host) return;
    var items = state.ledger.items || [];
    if (state.ledger.loading && !items.length) {
      host.innerHTML = skeletonRows(3);
    } else {
      // keyed 局部更新：行数与顺序不变时只就地把状态/进度/按钮刷进现有节点，
      // 避免每次 SSE 快照都整表 innerHTML 重建（吃焦点、滚动与选中态）。
      var nodes = Array.prototype.filter.call(host.children, function (el) {
        return el.classList && el.classList.contains('lrow');
      });
      var same = nodes.length === items.length;
      if (same) {
        for (var i = 0; i < items.length; i += 1) {
          if (nodes[i].getAttribute('data-id') !== items[i].task_id) { same = false; break; }
        }
      }
      if (same) items.forEach(function (task, index) { updateRowNode(nodes[index], task); });
      else host.innerHTML = items.map(renderRow).join('');
    }

    var totalEl = $('#ledger-total');
    if (totalEl) {
      var total = Number(state.ledger.total) || 0;
      totalEl.hidden = total === 0;
      totalEl.textContent = String(total);
      totalEl.title = t('ledger.total', { n: total });
    }

    var empty = $('#ledger-empty');
    if (empty) {
      var filtered = state.filter !== 'all' || !!state.query || state.type !== 'all';
      empty.hidden = items.length > 0 || (state.ledger.loading && !items.length);
      if (!empty.hidden) renderLedgerEmpty(filtered);
    }

    renderLedgerPager();
    pruneSelection();
    renderSelection();
    renderLedgerActions();
  }

  // renderLedgerActions 依据当前列表内容启用批量按钮，避免在空列表上误点。
  function renderLedgerActions() {
    var items = state.ledger.items || [];
    var retryBtn = $('#btn-batch-retry');
    var deleteBtn = $('#btn-batch-delete');
    if (!retryBtn || !deleteBtn) return;
    retryBtn.disabled = !items.some(function (task) {
      var status = taskStatus(task);
      return status === 'failed' || status === 'cancelled';
    });
    deleteBtn.disabled = !items.some(function (task) {
      var status = taskStatus(task);
      return status !== 'queued' && status !== 'running';
    });
  }

  // 选中集合按任务 ID 保存；台账刷新时只保留仍在列表里的 ID，
  // 「全选」始终作用于当前筛选结果，避免误删已不可见的记录。
  function selectedIDs() { return Object.keys(state.select); }

  function pruneSelection() {
    var alive = {};
    (state.ledger.items || []).forEach(function (task) { alive[task.task_id] = true; });
    Object.keys(state.select).forEach(function (id) {
      if (!alive[id]) delete state.select[id];
    });
  }

  function renderSelection() {
    var bar = $('#ledger-selection');
    var label = $('#ledger-selection-text');
    if (!bar || !label) return;
    var ids = selectedIDs();
    bar.hidden = ids.length === 0;
    label.textContent = t('selection.count', { n: ids.length });
    var items = state.ledger.items || [];
    var hasCancel = false, hasRetry = false, hasDelete = false;
    items.forEach(function (task) {
      if (!state.select[task.task_id]) return;
      var status = taskStatus(task);
      if (status === 'queued' || status === 'running') hasCancel = true;
      else hasRetry = true;
      if (status !== 'queued' && status !== 'running') hasDelete = true;
    });
    var cancelBtn = $('#btn-selection-cancel');
    var retryBtn = $('#btn-selection-retry');
    var deleteBtn = $('#btn-selection-delete');
    if (cancelBtn) cancelBtn.disabled = !hasCancel;
    if (retryBtn) retryBtn.disabled = !hasRetry;
    if (deleteBtn) deleteBtn.disabled = !hasDelete;

    var all = $('#ledger-select-all');
    if (all) {
      var selectable = items.filter(function (task) { return !!task.task_id; });
      var picked = selectable.filter(function (task) { return state.select[task.task_id]; }).length;
      all.checked = selectable.length > 0 && picked === selectable.length;
      all.indeterminate = picked > 0 && picked < selectable.length;
      all.disabled = selectable.length === 0;
    }
  }

  function setSelected(id, on) {
    if (on) state.select[id] = true; else delete state.select[id];
    var row = document.querySelector('.lrow[data-id="' + id + '"]');
    if (row) row.setAttribute('data-selected', on ? 'true' : 'false');
    renderSelection();
  }

  // durationText 给终态任务显示耗时，避免进度列与状态列重复同一个词。
  function durationText(task) {
    var start = task.started_at || task.created_at;
    var end = task.ended_at;
    if (!start) return '';
    var ms = (end ? Date.parse(end) : Date.now()) - Date.parse(start);
    if (!isFinite(ms) || ms < 0) return '';
    if (ms < 1000) return Math.round(ms) + ' ms';
    var sec = ms / 1000;
    if (sec < 60) return (sec < 10 ? sec.toFixed(1) : String(Math.round(sec))) + ' s';
    var min = Math.floor(sec / 60);
    var rem = Math.round(sec % 60);
    return min + ' min' + (rem ? ' ' + rem + ' s' : '');
  }

  // taskActionButton 统一渲染任务行/卡片上的操作按钮：请求进行中时直接输出 disabled，
  // 这样重绘出来的新节点也不会在请求期间可点。
  function taskActionButton(task, action, label, cls) {
    var disabled = taskPending(task.task_id) || (state.detail.id === task.task_id && state.detail.busy);
    return '<button type="button" class="btn ' + (cls || '') + '" data-action="' + action + '" data-id="' + esc(task.task_id) + '"' +
      (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }

  // rowProgressHtml 生成台账行与队列卡片共用的进度区：进度条 + 文本 + 失败摘要，
  // keyed 局部更新（updateRowProgress）也复用它，保证两处渲染结果一致。
  function rowProgressHtml(task) {
    var status = taskStatus(task);
    var progress = progressOf(task);
    var terminal = status === 'failed' || status === 'completed' || status === 'cancelled';
    var progText;
    if (status === 'queued') {
      progText = t('ticket.waiting');
    } else if (status === 'running') {
      progText = progress.total > 0
        ? t('metric.progress', { done: progress.done, total: progress.total })
        : (stageLabel(progress.stage) || t('taskStatus.running'));
    } else if (terminal) {
      var dur = durationText(task);
      progText = dur ? t('ledger.duration', { d: dur }) : t('taskStatus.' + status);
    } else {
      progText = progress.total > 0
        ? t('metric.progress', { done: progress.done, total: progress.total })
        : progress.stage || t('taskStatus.' + status);
    }
    if (progress.failed > 0 && !terminal) progText += ' · ' + t('metric.failed', { n: progress.failed });
    var unknownTotal = progress.percent === null && status === 'running';
    var percent = progress.percent === null ? 0 : progress.percent;
    var showBar = progress.total > 0 || status === 'running';
    var bar = unknownTotal
      ? '<span class="metabar metabar--indeterminate" data-status="running"><i></i></span>'
      : '<span class="metabar" data-status="' + esc(status) + '"><i style="width:' + percent + '%"></i></span>';
    return (showBar ? bar : '') +
      '<span class="lrow__progtxt">' + esc(progText) + '</span>' +
      // 失败原因摘要直接进列表，省一次点开详情；全文留在 title 与详情弹窗。
      (status === 'failed' && task.error
        ? '<span class="lrow__err" title="' + esc(task.error) + '">' + esc(task.error) + '</span>'
        : '');
  }

  function renderRow(task) {
    var status = taskStatus(task);
    var progress = progressOf(task);
    var fullTarget = taskTarget(task);
    var canCancel = status === 'queued' || status === 'running';
    var canRetry = status === 'failed' || status === 'cancelled';

    var actions = taskActionButton(task, 'detail', t('detail.open'));
    if (canCancel) actions += taskActionButton(task, 'cancel', t('ticket.cancel'));
    if (canRetry) actions += taskActionButton(task, 'retry', t('ticket.retry'));
    if (!canCancel) actions += taskActionButton(task, 'delete', t('ticket.delete'), 'btn--danger');

    var created = task.created_at || task.started_at;

    return '<div class="lrow" data-id="' + esc(task.task_id) + '" data-status="' + esc(status) + '" data-selected="' + (state.select[task.task_id] ? 'true' : 'false') + '"' +
        ' tabindex="0" role="link" title="' + esc(t('ledger.rowHint')) + '">' +
      '<span class="lrow__check"><input type="checkbox" data-select="' + esc(task.task_id) + '"' +
        (state.select[task.task_id] ? ' checked' : '') + ' aria-label="' + esc(t('selection.one')) + '"></span>' +
      '<span class="lrow__status">' + statusPill(status) + '</span>' +
      '<span class="lrow__target">' +
        '<span class="lrow__name" title="' + esc(fullTarget) + '">' + esc(shortTarget(fullTarget)) + '</span>' +
        '<span class="lrow__sub"><span>' + esc(typeLabel(task.type)) + '</span>' +
          '<span class="sep" aria-hidden="true">·</span>' +
          '<span class="mono">' + esc(shortId(task.task_id)) + '</span></span>' +
      '</span>' +
      '<span class="lrow__prog">' + rowProgressHtml(task) + '</span>' +
      '<time class="lrow__time" title="' + esc(fmtTime(created)) + '">' + esc(fmtRelative(created)) + '</time>' +
      '<span class="lrow__actions">' + actions + '</span>' +
      '</div>';
  }

  // updateRowNode 把快照差异刷进现有台账行：状态、选中态、进度区与操作按钮。
  // 目标文本与时间列在任务存在期间不变，跳过它们能保住用户正在阅读的内容。
  function updateRowNode(node, task) {
    var status = taskStatus(task);
    if (node.getAttribute('data-status') !== status) node.setAttribute('data-status', status);
    var selected = state.select[task.task_id] ? 'true' : 'false';
    if (node.getAttribute('data-selected') !== selected) node.setAttribute('data-selected', selected);
    var box = node.querySelector('input[data-select]');
    if (box && box.checked !== !!state.select[task.task_id]) box.checked = !!state.select[task.task_id];
    var pill = node.querySelector('.lrow__status');
    var pillHtml = statusPill(status);
    if (pill && pill.innerHTML !== pillHtml) pill.innerHTML = pillHtml;
    var prog = node.querySelector('.lrow__prog');
    if (prog) {
      var frag = rowProgressHtml(task);
      var tmp = document.createElement('div');
      tmp.innerHTML = frag;
      var text = tmp.querySelector('.lrow__progtxt');
      var errEl = tmp.querySelector('.lrow__err');
      var curText = prog.querySelector('.lrow__progtxt');
      var curErr = prog.querySelector('.lrow__err');
      var barHtml = tmp.querySelector('.metabar');
      var curBar = prog.querySelector('.metabar');
      if (barHtml && curBar && curBar.className !== barHtml.className) curBar.className = barHtml.className;
      if (barHtml && curBar) {
        var fill = barHtml.querySelector('i');
        var curFill = curBar.querySelector('i');
        if (fill && curFill && curFill.style.width !== fill.style.width) curFill.style.width = fill.style.width;
      }
      if (curText && text && curText.textContent !== text.textContent) curText.textContent = text.textContent;
      // 失败摘要出现/消失或状态跨越终态边界属结构变化，整行重绘。
      if (!!curErr !== !!errEl || (errEl && curErr && curErr.textContent !== errEl.textContent)) {
        node.outerHTML = renderRow(task);
        return;
      }
    }
    var actionsBox = node.querySelector('.lrow__actions');
    if (actionsBox) {
      var inFlight = status === 'queued' || status === 'running';
      var fresh = taskActionButton(task, 'detail', t('detail.open'));
      if (inFlight) fresh += taskActionButton(task, 'cancel', t('ticket.cancel'));
      if (status === 'failed' || status === 'cancelled') fresh += taskActionButton(task, 'retry', t('ticket.retry'));
      if (!inFlight) fresh += taskActionButton(task, 'delete', t('ticket.delete'), 'btn--danger');
      if (actionsBox.innerHTML !== fresh) actionsBox.innerHTML = fresh;
    }
  }

  function renderFilters() {
    var host = $('#ledger-filters');
    if (!host) return;
    var stats = state.stats || {};
    var counts = {
      all: Number(stats.total) || 0,
      active: (Number(stats.queued) || 0) + (Number(stats.running) || 0),
      completed: Number(stats.completed) || 0,
      failed: Number(stats.failed) || 0,
      cancelled: Number(stats.cancelled) || 0
    };
    var options = [
      { id: 'all', label: t('filter.all') },
      { id: 'active', label: t('filter.active') },
      { id: 'completed', label: t('filter.completed') },
      { id: 'failed', label: t('filter.failed') },
      { id: 'cancelled', label: t('filter.cancelled') }
    ];
    host.innerHTML = options.map(function (option) {
      var pressed = state.filter === option.id ? 'true' : 'false';
      var count = state.stats ? '<span class="chip__count">' + counts[option.id] + '</span>' : '';
      return '<button type="button" class="chip" data-filter="' + option.id + '" aria-pressed="' + pressed + '">' +
        esc(option.label) + count + '</button>';
    }).join('');
  }

  // 只列出非零的来源：0 个账号失败不该占据一行文案。
  function errorsSummary(users, json) {
    var en = state.lang === 'en';
    var parts = [];
    if (users > 0) parts.push(en ? t(users === 1 ? 'errors.accountsOne' : 'errors.accountsMany', { n: users }) : t('errors.accounts', { n: users }));
    if (json > 0) parts.push(en ? t(json === 1 ? 'errors.jsonOne' : 'errors.jsonMany', { n: json }) : t('errors.jsonSources', { n: json }));
    return parts.join(' · ');
  }

  // 失败记录明细：账号按失败推文数倒序、JSON 来源按条目数倒序，各最多列 100 行，其余给计数提示。
  // 服务端返回 regular_details 时显示实体名与类型，旧服务端只有 regular ID 映射时退回裸 ID。
  function errorEntityCell(item) {
    var name = String(item.name || '');
    var screen = String(item.screen_name || '');
    var kind = item.kind === 'list' ? t('errors.kindList') : (item.kind === 'user' ? t('errors.kindUser') : '');
    var title = kind ? kind + ' · ' + item.entity_id : String(item.entity_id);
    var label = name || screen || t('errors.unknownEntity');
    var sub = name && screen && screen !== name ? '@' + screen : '';
    return '<span class="err-entity" title="' + esc(title) + '">' +
      '<span class="err-entity__name">' + esc(label) + '</span>' +
      (sub ? '<span class="err-entity__screen">' + esc(sub) + '</span>' : '') +
      '<span class="err-entity__id mono">' + esc(item.entity_id) + '</span>' +
      (kind ? '<span class="err-entity__kind">' + esc(kind) + '</span>' : '') +
      '</span>';
  }

  function errorsBodyHtml() {
    var regular = state.errors.regular || {};
    var details = state.errors.details || [];
    var json = state.errors.json || [];
    var ids = Object.keys(regular).sort(function (a, b) {
      return (Number(regular[b]) || 0) - (Number(regular[a]) || 0);
    });
    if (!details.length && ids.length) {
      details = ids.map(function (id) { return { entity_id: Number(id), failed: Number(regular[id]) || 0 }; });
    }
    var out = '';
    if (details.length) {
      out += '<section class="errorspanel__group">' +
        '<h3 class="errorspanel__grouptitle">' + esc(t('errors.accountsTitle')) +
        '<span>' + esc(t('errors.accountsHint')) + '</span></h3>' +
        '<table class="errorspanel__table"><thead><tr>' +
        '<th>' + esc(t('errors.colEntity')) + '</th>' +
        '<th class="num">' + esc(t('errors.colTweets')) + '</th>' +
        '<th class="num">' + esc(t('common.actions')) + '</th>' +
        '</tr></thead><tbody>' +
        details.slice(0, 100).map(function (item) {
          return '<tr><td>' + errorEntityCell(item) + '</td>' +
            '<td class="num">' + esc(String(item.failed || 0)) + '</td>' +
            '<td class="num">' + copyButton(item.entity_id) + '</td></tr>';
        }).join('') +
        '</tbody></table>' +
        (details.length > 100 ? '<p class="errorspanel__more">' + esc(t('errors.moreRows', { n: details.length - 100 })) + '</p>' : '') +
        '</section>';
    }
    if (json.length) {
      var sorted = json.slice().sort(function (a, b) {
        return (Number(b.count) || 0) - (Number(a.count) || 0);
      });
      out += '<section class="errorspanel__group">' +
        '<h3 class="errorspanel__grouptitle">' + esc(t('errors.jsonTitle')) +
        '<span>' + esc(t('errors.jsonHint')) + '</span></h3>' +
        '<table class="errorspanel__table"><thead><tr>' +
        '<th>' + esc(t('errors.colSource')) + '</th>' +
        '<th>' + esc(t('errors.colType')) + '</th>' +
        '<th class="num">' + esc(t('errors.colTweets')) + '</th>' +
        '<th class="num"><span class="visually-hidden">' + esc(t('common.actions')) + '</span></th>' +
        '</tr></thead><tbody>' +
        sorted.slice(0, 100).map(function (item) {
          var path = String(item.source_path || '');
          var base = path.split(/[\\/]/).pop() || path;
          return '<tr><td class="src" title="' + esc(path) + '">' + esc(base) + '</td>' +
            '<td>' + esc(item.type || '—') + '</td>' +
            '<td class="num">' + esc(String(item.count || 0)) + '</td>' +
            '<td class="num">' + (path ? copyButton(path) : '') + '</td></tr>';
        }).join('') +
        '</tbody></table>' +
        (sorted.length > 100 ? '<p class="errorspanel__more">' + esc(t('errors.moreRows', { n: sorted.length - 100 })) + '</p>' : '') +
        '</section>';
    }
    return out;
  }

  function renderErrors() {
    var regular = state.errors.regular || {};
    var json = state.errors.json || [];
    var host = $('#errors-strip');
    if (!host) return;
    var ids = Object.keys(regular);
    if (!ids.length && !json.length) {
      state.errorsOpen = false;
      host.hidden = true;
      return;
    }
    host.hidden = false;
    var countEl = $('#errors-count');
    if (countEl) countEl.textContent = String(ids.length + json.length);
    var summaryEl = $('#errors-summary');
    if (summaryEl) summaryEl.textContent = errorsSummary(ids.length, json.length);
    var toggle = $('#errors-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', state.errorsOpen ? 'true' : 'false');
    var body = $('#errors-body');
    if (!body) return;
    body.hidden = !state.errorsOpen;
    if (state.errorsOpen) body.innerHTML = errorsBodyHtml();
  }

  function renderFooter() {
    var health = state.health || {};
    var version = $('#footer-version');
    if (version) version.textContent = t('footer.version', { version: health.version ? versionLabel(health.version) : '—' });
    var note = $('#footer-note');
    if (note) note.textContent = t('footer.note');
  }

  // 任务页按 / 聚焦台账搜索；输入控件内的 / 保持原样。
  function installShortcuts() {
    document.addEventListener('keydown', function (event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== '/') return;
      var el = event.target;
      var tag = (el && el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (el && el.isContentEditable)) return;
      var view = document.getElementById('view-tasks');
      if (!view || view.hidden) return;
      var search = document.getElementById('ledger-search');
      if (!search) return;
      event.preventDefault();
      search.focus();
      search.select();
    });
  }

  /* ---------------- toasts ---------------- */

  function toast(kind, message) {
    var host = $('#toasts');
    var node = document.createElement('div');
    node.className = 'toast';
    node.setAttribute('data-kind', kind || 'info');
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.setAttribute('aria-atomic', 'true');
    node.innerHTML = '<span>' + esc(message) + '</span>' +
      '<button type="button" class="toast__close" aria-label="' + esc(t('common.close')) + '">×</button>';
    host.appendChild(node);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    var close = function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    };
    node.querySelector('.toast__close').addEventListener('click', close);
    setTimeout(close, kind === 'error' ? 8000 : 4500);
  }

  /* ---------------- auth dialog ---------------- */

  function openAuth() {
    var dialog = $('#auth-dialog');
    if (!dialog || dialog.open) return;
    state.authOpen = true;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', 'open');
    var input = $('#auth-key');
    if (input) setTimeout(function () { input.focus(); }, 30);
  }

  function closeAuth() {
    var dialog = $('#auth-dialog');
    state.authOpen = false;
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function submitAuth(event) {
    if (event) event.preventDefault();
    var key = ($('#auth-key').value || '').trim();
    var errorEl = $('#auth-error');
    errorEl.hidden = true;
    if (!key) return;
    var btn = $('#auth-submit');
    btn.disabled = true;
    login(key)
      .then(function () {
        closeAuth();
        toast('success', t('auth.ok'));
        $('#auth-key').value = '';
      })
      .catch(function (err) {
        errorEl.textContent = err && err.status === 401 ? t('auth.badKey') : (err && err.message ? err.message : t('auth.network'));
        errorEl.hidden = false;
      })
      .then(function () { btn.disabled = false; });
  }

  /* ---------------- textarea auto-grow ---------------- */

  // 草稿防抖落盘：目标文本与标记时间在刷新后还在；提交成功即清除。
  var draftTimer = 0;
  function saveDraftSoon() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraftNow, 300);
  }
  function saveDraftNow() {
    var input = $('#target-input');
    var markTime = $('#mark-time');
    var value = input ? input.value : '';
    var time = markTime ? markTime.value : '';
    if (!value && !time) {
      lsSet(DRAFT_KEY, '');
      return;
    }
    lsSet(DRAFT_KEY, JSON.stringify({ targets: value.slice(0, 4000), markTime: time }));
  }
  function restoreDraft() {
    try {
      var draft = JSON.parse(lsGet(DRAFT_KEY) || 'null');
      if (!draft || typeof draft !== 'object') return;
      var input = $('#target-input');
      if (input && typeof draft.targets === 'string' && draft.targets) input.value = draft.targets;
      var markTime = $('#mark-time');
      if (markTime && typeof draft.markTime === 'string' && draft.markTime) markTime.value = draft.markTime;
    } catch (e) { /* ignore */ }
  }

  function autoGrow() {
    var el = $('#target-input');
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 148) + 'px';
  }

  function resetTextareaHeight() {
    var el = $('#target-input');
    el.style.height = 'auto';
    autoGrow();
  }

  /* ---------------- task actions ---------------- */

  // armedConfirm 两段式确认：第一次点击把按钮切成「再点一次确认」，3 秒后自动复位，
  // 第二次点击才执行。替代 window.confirm：不打断页面、不弹系统框、移动端也不会被拦。
  function armedConfirm(btn, fn) {
    if (!btn) { fn(); return; }
    var label = btn.querySelector('span') || btn;
    if (btn.getAttribute('data-armed') !== 'true') {
      btn.setAttribute('data-armed', 'true');
      btn.setAttribute('data-label', label.textContent);
      label.textContent = t('confirm.again');
      setTimeout(function () {
        if (!btn.isConnected || btn.getAttribute('data-armed') !== 'true') return;
        btn.removeAttribute('data-armed');
        if (btn.getAttribute('data-label')) label.textContent = btn.getAttribute('data-label');
        btn.removeAttribute('data-label');
      }, 3000);
      return;
    }
    btn.removeAttribute('data-armed');
    if (btn.getAttribute('data-label')) label.textContent = btn.getAttribute('data-label');
    btn.removeAttribute('data-label');
    fn();
  }

  // pendingTasks 记录正在请求中的任务操作。台账与队列里的同一任务按钮在请求结束前禁用，
  // 否则连点「重试」会在服务端建出多个任务。
  var pendingTasks = {};

  function taskPending(id) { return !!pendingTasks[id]; }

  function markTaskPending(id, busy) {
    if (busy) pendingTasks[id] = true; else delete pendingTasks[id];
    $$('[data-action][data-id]').forEach(function (btn) {
      if (btn.getAttribute('data-id') !== id) return;
      btn.disabled = !!busy;
      btn.setAttribute('data-busy', busy ? 'true' : 'false');
    });
  }

  function setTaskBusy(id, busy) {
    if (id) markTaskPending(id, busy);
    if (state.detail.id !== id) return;
    state.detail.busy = busy;
    var body = $('#task-body');
    if (!body) return;
    $$('button[data-action]', body).forEach(function (btn) { btn.disabled = busy; });
  }

  // refreshDetail 只刷新当前打开的任务详情，不关闭弹窗：取消/重试后用户应看到状态就地变化。
  function refreshDetail(id) {
    if (!state.detail.id || state.detail.id !== id) return Promise.resolve();
    return request('/api/v1/tasks/' + encodeURIComponent(id))
      .then(function (task) {
        if (state.detail.id !== id) return;
        if (task) renderTaskDetail(task);
      })
      .catch(function (err) { if (err.status !== 401) toast('error', err.message); });
  }

  function cancelTask(id) {
    if (taskPending(id) || state.detail.busy) return;
    var task = (state.tasks || []).filter(function (item) { return item.task_id === id; })[0];
    var label = task ? taskTarget(task) : shortId(id);
    if (!window.confirm(t('confirm.cancelTask', { target: label }))) return;
    setTaskBusy(id, true);
    request('/api/v1/tasks/' + encodeURIComponent(id) + '/cancel', { method: 'POST' })
      .then(function () { toast('success', t('toast.cancelled')); loadTasks(); loadLedger('keep'); return refreshDetail(id); })
      .catch(function (err) { if (err.status !== 401) toast('error', err.message); })
      .then(function () { setTaskBusy(id, false); });
  }

  function retryTask(id) {
    if (taskPending(id) || state.detail.busy) return;
    setTaskBusy(id, true);
    request('/api/v1/tasks/' + encodeURIComponent(id) + '/retry', { method: 'POST' })
      .then(function () { toast('success', t('toast.retried')); loadTasks(); loadLedger('keep'); return refreshDetail(id); })
      .catch(function (err) { if (err.status !== 401) toast('error', err.message); })
      .then(function () { setTaskBusy(id, false); });
  }

  function deleteTask(id, btn) {
    armedConfirm(btn, function () {
      if (taskPending(id) || state.detail.busy) return;
      setTaskBusy(id, true);
      request('/api/v1/tasks/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function () {
          toast('success', t('toast.deleted'));
          if (state.detail.id === id) closeTaskDialog();
          loadTasks();
          loadLedger('keep');
        })
        .catch(function (err) { if (err.status !== 401) toast('error', err.message); })
        .then(function () { setTaskBusy(id, false); });
    });
  }

  /* ---------------- clipboard ---------------- */

  // 复制路径：异步剪贴板 API → 选区 + execCommand → 失败后由调用方选中文本提示手动复制。
  // 非 HTTPS 页面、权限被拒或没有用户手势时前一步都会失败，所以 execCommand 兜底必须保留。
  function execCommandCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, String(text).length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(area);
    if (!ok) throw new Error('execCommand copy rejected');
  }

  // 复制文本；两条路径都失败时 reject，调用方负责给出可操作反馈。
  function copyValue(text) {
    var value = text === undefined || text === null ? '' : String(text);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(value).catch(function () {
        execCommandCopy(value);
      });
    }
    return new Promise(function (resolve) { execCommandCopy(value); resolve(); });
  }

  // 选中节点文本，供手动 Ctrl+C。
  function selectNodeText(node) {
    if (!node || !window.getSelection || !document.createRange) return false;
    try {
      var range = document.createRange();
      range.selectNodeContents(node);
      var selection = window.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch (e) {
      return false;
    }
  }

  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      btn.setAttribute('data-copied', 'true');
      var label = btn.querySelector('span');
      if (label) label.textContent = t('detail.copied');
      setTimeout(function () {
        btn.removeAttribute('data-copied');
        if (label) label.textContent = t('detail.copy');
      }, 1400);
    };
    copyValue(text).then(done, function () {
      // 复制被拒时把值本身选中，用户直接 Ctrl+C 就能拿到内容；选按钮只会复制按钮文字。
      var rowEl = btn && btn.closest ? btn.closest('.kv__row') : null;
      var valueEl = rowEl ? rowEl.querySelector('.kv__val') : null;
      var target = (valueEl && valueEl.querySelector('.mono')) || valueEl || btn;
      var selected = selectNodeText(target);
      toast(selected ? 'info' : 'error', t(selected ? 'toast.copyManual' : 'toast.copyFailed'));
    });
  }

  function copyButton(value) {
    return '<button type="button" class="copy-btn" data-copy="' + esc(value) + '" title="' + esc(t('detail.copy')) + '">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.2" y="5.2" width="7.6" height="7.6" rx="1.6"/><path d="M10.8 5.2V3.8A1.6 1.6 0 0 0 9.2 2.2H3.8A1.6 1.6 0 0 0 2.2 3.8v5.4A1.6 1.6 0 0 0 3.8 10.8h1.4" stroke-linecap="round"/></svg>' +
      '<span>' + esc(t('detail.copy')) + '</span></button>';
  }

  /* ---------------- task detail dialog ---------------- */

  function closeTaskDialog() {
    var dialog = $('#task-dialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    state.detail.id = '';
    state.detail.task = null;
    state.detail.json = '';
    state.detail.busy = false;
  }

  function openTaskDetail(id) {
    var dialog = $('#task-dialog');
    var body = $('#task-body');
    if (!dialog || !body) return;
    state.detail.id = id;
    state.detail.task = null;
    state.detail.json = '';
    state.detail.busy = false;
    // 先用任务快照立即渲染，避免打开弹窗时空白等接口；随后用单任务详情校正。
    var cached = (state.tasks || []).filter(function (task) { return task.task_id === id; })[0];
    if (cached) renderTaskDetail(cached);
    else body.innerHTML = '<p class="muted small">' + esc(t('detail.loading')) + '</p>';
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', 'open');
    }
    request('/api/v1/tasks/' + encodeURIComponent(id))
      .then(function (task) {
        // 打开期间用户可能切到别的任务，迟到的响应不能覆盖当前详情。
        if (state.detail.id !== id) return;
        if (task) renderTaskDetail(task);
        else body.innerHTML = '<p class="notice notice--warn">' + esc(t('detail.removed')) + '</p>';
      })
      .catch(function (err) {
        if (err.status === 401) { closeTaskDialog(); return; }
        body.innerHTML = '<p class="notice notice--danger">' + esc(err.message) + '</p>';
      });
  }

  function kv(label, value) {
    return '<div class="kv__row"><span class="kv__key">' + esc(label) + '</span>' +
      '<span class="kv__val">' + value + '</span></div>';
  }

  function detailStat(value, label, tone) {
    return '<div class="tstat"><span class="tstat__val"' + (tone ? ' data-tone="' + tone + '"' : '') + '>' +
      esc(String(value)) + '</span><span class="tstat__lbl">' + esc(label) + '</span></div>';
  }

  function detailTimeRow(label, value, tone) {
    return '<div class="ttl__row"><span class="ttl__dot"' + (tone ? ' data-tone="' + tone + '"' : '') + '></span>' +
      '<span class="ttl__key">' + esc(label) + '</span>' +
      '<span class="ttl__val">' + esc(value) + '</span></div>';
  }

  function renderTaskDetail(task) {
    var body = $('#task-body');
    if (!body || !task) return;
    state.detail.task = task;
    var serialized = JSON.stringify(task);
    // 同一份快照不重绘：SSE 高频推送时保住滚动位置与文本选区。
    if (state.detail.json === serialized) return;
    state.detail.json = serialized;
    var scrollTop = body.scrollTop;

    var status = taskStatus(task);
    var progress = progressOf(task);
    var result = task.result || {};
    var main = result.main || {};
    var profile = result.profile || {};
    var html = '';

    var detailTarget = taskTarget(task);
    html += '<div class="detail-head" data-status="' + esc(status) + '">' +
      '<div class="detail-head__main">' +
      '<div class="detail-head__title"><span class="detail-head__name" title="' + esc(detailTarget) + '">' +
        esc(shortTarget(detailTarget)) + '</span>' + statusPill(status) + '</div>' +
      '<div class="detail-head__sub"><span>' + esc(typeLabel(task.type)) + '</span>' +
      '<span class="sep" aria-hidden="true">·</span><span class="mono">' + esc(shortId(task.task_id)) + '</span>' +
      copyButton(task.task_id) + '</div>' +
      '</div></div>';

    html += '<section class="tsec"><h3 class="tsec__title">' + esc(t('detail.overview')) + '</h3><div class="kv">';
    html += kv(t('detail.type'), esc(typeLabel(task.type)));
    html += kv(t('detail.target'), esc(taskTarget(task)));
    if (task.entry_id) html += kv(t('detail.entryId'), '<span class="mono small">' + esc(task.entry_id) + '</span>' + copyButton(task.entry_id));
    var data = task.data || {};
    if (Array.isArray(data.users) && data.users.length) html += kv(t('detail.users'), esc(data.users.join(', ')));
    if (Array.isArray(data.lists) && data.lists.length) html += kv(t('detail.lists'), esc(data.lists.join(', ')));
    if (Array.isArray(data.paths) && data.paths.length) html += kv(t('detail.paths'), esc(data.paths.join(', ')));
    html += '</div></section>';

    if (progress.total > 0 || status === 'running' || status === 'queued' || progress.stage) {
      var pctText = progress.percent === null ? '—' : progress.percent + '%';
      var meta = t('metric.progress', { done: progress.done, total: progress.total }) + ' · ' + pctText;
      if (progress.stage) meta += ' · ' + stageLabel(progress.stage);
      if (progress.current) meta += ' · ' + progress.current;
      html += '<section class="tsec"><h3 class="tsec__title">' + esc(t('detail.progressTitle')) + '</h3>' +
        '<div class="progress' + (progress.percent === null && status === 'running' ? ' progress--indeterminate' : '') + '">' +
        '<div class="progress__bar" style="width:' + (progress.percent === null ? 0 : progress.percent) + '%"></div></div>' +
        '<div class="tbar"><span class="tbar__meta">' + esc(meta) + '</span></div>' +
        (progress.failed > 0 ? '<p class="notice notice--danger mt-12">' + esc(t('metric.failed', { n: progress.failed })) + '</p>' : '') +
        '</section>';
    }

    var timeline = detailTimeRow(t('detail.created'), fmtTime(task.created_at), 'info');
    if (task.started_at) timeline += detailTimeRow(t('detail.started'), fmtTime(task.started_at), 'warn');
    if (task.ended_at) timeline += detailTimeRow(t('detail.ended'), fmtTime(task.ended_at), 'ok');
    var duration = durationText(task);
    if (duration) timeline += detailTimeRow(t('detail.duration'), duration);
    html += '<section class="tsec"><h3 class="tsec__title">' + esc(t('detail.timeline')) + '</h3>' +
      '<div class="ttl">' + timeline + '</div></section>';

    var stats = [];
    if (main.downloaded !== undefined) stats.push(detailStat(main.downloaded || 0, t('detail.downloaded'), 'ok'));
    if (main.failed) stats.push(detailStat(main.failed, t('detail.failedCount'), 'danger'));
    if (profile.downloaded !== undefined) stats.push(detailStat(profile.downloaded || 0, t('detail.profile'), 'ok'));
    if (profile.failed) stats.push(detailStat(profile.failed, t('detail.profileFailed'), 'danger'));
    if (profile.versioned) stats.push(detailStat(profile.versioned, t('detail.versioned'), 'info'));
    if (stats.length || result.message) {
      html += '<section class="tsec"><h3 class="tsec__title">' + esc(t('detail.result')) + '</h3>' +
        (stats.length ? '<div class="tstats">' + stats.join('') + '</div>' : '') +
        (result.message ? '<p class="notice mt-12">' + esc(result.message) + '</p>' : '') +
        '</section>';
    }

    if (task.error) {
      html += '<section class="tsec"><h3 class="tsec__title">' + esc(t('detail.errorTitle')) + '</h3>' +
        '<p class="notice notice--danger">' + esc(task.error) + '</p></section>';
    }

    var details = Array.isArray(result.failed_details) ? result.failed_details : [];
    if (details.length) {
      html += '<section class="tsec"><h3 class="tsec__title">' + esc(t('detail.failedDetails')) +
        ' <span class="count" data-tone="danger">' + details.length + '</span></h3>' +
        '<ul class="detail-failed">' + details.map(function (item) {
          return '<li><span class="detail-failed__text mono">' + esc(item) + '</span>' + copyButton(item) + '</li>';
        }).join('') + '</ul></section>';
    }

    var busy = taskPending(task.task_id) || state.detail.busy;
    var actions = '';
    if (status === 'queued' || status === 'running') {
      actions += '<button type="button" class="btn btn--ghost" data-action="cancel" data-id="' + esc(task.task_id) + '"' + (busy ? ' disabled' : '') + '><span>' + esc(t('ticket.cancel')) + '</span></button>';
    }
    if (status === 'failed' || status === 'cancelled') {
      actions += '<button type="button" class="btn btn--ghost" data-action="retry" data-id="' + esc(task.task_id) + '"' + (busy ? ' disabled' : '') + '><span>' + esc(t('ticket.retry')) + '</span></button>';
    }
    if (status !== 'queued' && status !== 'running') {
      actions += '<button type="button" class="btn btn--ghost btn--danger" data-action="delete" data-id="' + esc(task.task_id) + '"' + (busy ? ' disabled' : '') + '><span>' + esc(t('ticket.delete')) + '</span></button>';
    }
    if (actions) html += '<div class="detail-actions">' + actions + '</div>';

    html += '<details class="mt-12"><summary class="small muted">' + esc(t('detail.raw')) + '</summary>' +
      '<pre class="code">' + esc(JSON.stringify(task, null, 2)) + '</pre></details>';
    body.innerHTML = html;
    body.scrollTop = scrollTop;
  }

  // updateOpenTaskDetail 让打开中的详情跟随 SSE 快照就地刷新（保持滚动位置），
  // 任务从快照里消失时给出提示而不是让弹窗静默停留在旧数据上。
  function updateOpenTaskDetail(tasks) {
    if (!state.detail.id || state.detail.busy) return;
    var dialog = $('#task-dialog');
    if (!dialog || !dialog.open) return;
    var found = null;
    (tasks || []).forEach(function (task) {
      if (task.task_id === state.detail.id) found = task;
    });
    if (found) { renderTaskDetail(found); return; }
    var body = $('#task-body');
    if (body && state.detail.task) {
      body.innerHTML = '<p class="notice notice--warn">' + esc(t('detail.removed')) + '</p>';
    }
  }

  // batchTasks 对一批任务执行 cancel/retry/delete，逐条结果汇总成一条 toast。
  function batchTasks(action, taskIDs) {
    return request('/api/v1/tasks/batch/' + action, {
      method: 'POST',
      body: { task_ids: taskIDs }
    }).then(function (data) {
      var ok = (data && data.succeeded) || 0;
      var fail = (data && data.failed) || 0;
      toast(fail ? 'info' : 'success', t('toast.batch', { ok: ok, fail: fail }));
      loadTasks();
      loadLedger('reset');
      return data;
    });
  }

  var BATCH_LIMIT = 200;

  // batchScope 把批量操作的目标限定在当前已加载的台账行内，并按上限截断；
  // 截断发生时提示跳过数量，避免「看起来全处理了」的错觉。
  function batchScope(statuses) {
    var all = state.ledger.items.filter(function (task) {
      return statuses.indexOf(taskStatus(task)) !== -1;
    });
    var ids = all.slice(0, BATCH_LIMIT).map(function (task) { return task.task_id; });
    if (all.length > ids.length) toast('info', t('ledger.batchTruncated', { n: BATCH_LIMIT, rest: all.length - ids.length }));
    return ids;
  }

  function visibleIDs(statuses) {
    return batchScope(statuses);
  }

  // runSelection 只对选中项中符合动作前提的任务生效：勾选里混着运行中和已取消时，
  // 「取消任务」不会把已结束的记录也发给 cancel 接口。
  function runSelection(action, allowed, btn) {
    var ids = [];
    var picked = 0;
    (state.ledger.items || []).forEach(function (task) {
      if (!state.select[task.task_id]) return;
      picked += 1;
      if (allowed.indexOf(taskStatus(task)) !== -1) ids.push(task.task_id);
    });
    if (!picked) { toast('info', t('selection.count', { n: 0 })); return; }
    if (!ids.length) { toast('info', t('toast.batchEmpty')); return; }
    if (action === 'cancel' && !window.confirm(t('confirm.cancelSelected', { n: ids.length }))) return;
    if (action === 'retry' && !window.confirm(t('confirm.retrySelected', { n: ids.length }))) return;
    var run = function () {
      batchTasks(action, ids.slice(0, BATCH_LIMIT)).then(function () {
        ids.forEach(function (id) { delete state.select[id]; });
        renderSelection();
      }).catch(function (err) {
        if (err.status !== 401) toast('error', err.message);
      });
    };
    if (action === 'delete') armedConfirm(btn, run);
    else run();
  }

  function batchRetryVisible() {
    var ids = visibleIDs(['failed', 'cancelled']);
    if (!ids.length) { toast('info', t('toast.batchEmpty')); return; }
    if (!window.confirm(t('confirm.retryVisible', { n: ids.length }))) return;
    batchTasks('retry', ids).catch(function (err) {
      if (err.status !== 401) toast('error', err.message);
    });
  }

  function batchDeleteVisible(btn) {
    var ids = visibleIDs(['completed', 'failed', 'cancelled']);
    if (!ids.length) { toast('info', t('toast.batchEmpty')); return; }
    armedConfirm(btn, function () {
      batchTasks('delete', ids).catch(function (err) {
        if (err.status !== 401) toast('error', err.message);
      });
    });
  }

  function cancelQueued(btn) {
    armedConfirm(btn, function () {
      request('/api/v1/tasks/cancel-queued', { method: 'POST' })
        .then(function () { toast('success', t('toast.cancelQueued')); loadTasks(); })
        .catch(function (err) { if (err.status !== 401) toast('error', err.message); });
    });
  }

  function retryAllFailed() {
    request('/api/v1/errors/retry', { method: 'POST' })
      .then(function () { toast('success', t('toast.retryAll')); loadTasks(); })
      .catch(function (err) { if (err.status !== 401) toast('error', err.message); });
  }

  function clearErrors(btn) {
    armedConfirm(btn, function () {
      request('/api/v1/errors', { method: 'DELETE' })
        .then(function () { toast('success', t('toast.errorsCleared')); loadErrors(); })
        .catch(function (err) { if (err.status !== 401) toast('error', err.message); });
    });
  }

  /* ---------------- wiring ---------------- */

  function bind() {
    trackInteraction();
    $('#dispatch-form').addEventListener('submit', submitForm);

    var input = $('#target-input');
    input.addEventListener('input', function () {
      autoGrow();
      updateTargetHint();
      saveDraftSoon();
    });
    var markTimeInput = $('#mark-time');
    if (markTimeInput) {
      markTimeInput.addEventListener('input', saveDraftSoon);
      markTimeInput.addEventListener('change', saveDraftSoon);
    }
    // 标签页关闭/切走前落盘，避免 300ms 防抖还没触发就丢草稿。
    window.addEventListener('pagehide', saveDraftNow);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) saveDraftNow();
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
        event.preventDefault();
        submitForm(event);
      }
    });

    $('#mode-group').addEventListener('change', function (event) {
      if (event.target.name !== 'mode') return;
      state.mode = event.target.value;
      state.manualMode = true;
      lsSet(MODE_KEY, state.mode);
      renderOptions();
    });

    $('#options-group').addEventListener('change', readFlags);

    var fileInput = $('#json-files');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        state.files = Array.prototype.slice.call(fileInput.files || []);
        state.folderFiles = [];
        var folder = $('#json-folder');
        if (folder) folder.value = '';
        var label = $('#upload-files');
        if (label) label.textContent = state.files.length ? t('upload.files', { n: state.files.length }) : '';
        clearFormError();
      });
    }
    var folderInput = $('#json-folder');
    if (folderInput) {
      folderInput.addEventListener('change', function () {
        state.folderFiles = Array.prototype.slice.call(folderInput.files || []);
        state.files = [];
        var file = $('#json-files');
        if (file) file.value = '';
        var label = $('#upload-files');
        if (label) label.textContent = state.folderFiles.length ? t('upload.folderFiles', { n: state.folderFiles.length }) : '';
        clearFormError();
      });
    }

    var markToggle = $('#mark-toggle');
    if (markToggle) {
      markToggle.addEventListener('change', function () {
        state.mark = !!markToggle.checked;
        if (state.mark && !modeDef(state.mode).mark) {
          state.mode = 'user';
          lsSet(MODE_KEY, state.mode);
        }
        $('#mark-time-wrap').hidden = !state.mark;
        renderModes();
        renderOptions();
        clearFormError();
      });
    }

    $$('#theme-seg .seg__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(btn.getAttribute('data-theme-set'));
        toast('info', t('theme.switched', { mode: t('theme.' + btn.getAttribute('data-theme-set')) }));
      });
    });

    $$('#lang-seg .seg__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyLang(btn.getAttribute('data-lang-set'));
        toast('info', t('lang.switched', { name: state.lang === 'en' ? 'English' : '中文' }));
      });
    });

    var query = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (query && query.addEventListener) {
      query.addEventListener('change', function () {
        if (state.theme === 'auto') applyTheme('auto');
      });
    }

    $('#btn-refresh').addEventListener('click', function () {
      loadAll().then(function () { toast('info', t('toast.refreshed')); });
    });
    $('#btn-cancel-queued').addEventListener('click', function (event) { cancelQueued(event.currentTarget); });
    $('#btn-retry-all').addEventListener('click', retryAllFailed);
    $('#btn-clear-errors').addEventListener('click', function (event) { clearErrors(event.currentTarget); });

    var errorsToggle = $('#errors-toggle');
    if (errorsToggle) {
      errorsToggle.addEventListener('click', function () {
        state.errorsOpen = !state.errorsOpen;
        renderErrors();
      });
    }
    var errorsBody = $('#errors-body');
    if (errorsBody) errorsBody.addEventListener('click', onListAction);

    var typeSelect = $('#ledger-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', function () {
        state.type = typeSelect.value;
        loadLedger('reset');
      });
    }
    var stageSelect = $('#ledger-stage');
    if (stageSelect) {
      stageSelect.addEventListener('change', function () {
        state.stage = stageSelect.value;
        loadLedger('reset');
      });
    }
    $('#btn-auth').addEventListener('click', openAuth);

    $('#queue').addEventListener('click', onListAction);
    $('#ledger').addEventListener('click', onListAction);

    // 复选框用 change 委托：行会被批量重绘，逐节点绑定会丢监听。
    $('#ledger').addEventListener('change', function (event) {
      var box = event.target.closest('[data-select]');
      if (!box) return;
      setSelected(box.getAttribute('data-select'), box.checked);
    });

    // 行有 tabindex 与 role=link：Enter / Space 打开详情，键盘用户不必 Tab 到行内按钮。
    $('#ledger').addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('input, button, a, select, textarea')) return;
      var row = event.target.closest('.lrow[data-id]');
      if (!row) return;
      event.preventDefault();
      openTaskDetail(row.getAttribute('data-id'));
    });

    $('#ledger-filters').addEventListener('click', function (event) {
      var chip = event.target.closest('[data-filter]');
      if (!chip) return;
      state.filter = chip.getAttribute('data-filter');
      renderFilters();
      loadLedger('reset');
    });

    var search = $('#ledger-search');
    var searchTimer = null;
    search.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !search.value) return;
      event.preventDefault();
      search.value = '';
      state.query = '';
      loadLedger('reset');
    });
    search.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = search.value.trim();
        loadLedger('reset');
      }, 300);
    });

    $('#ledger-prev').addEventListener('click', function () {
      if (state.ledger.loading || state.ledger.page <= 1) return;
      state.ledger.page -= 1;
      loadLedger('page');
    });
    $('#ledger-next').addEventListener('click', function () {
      if (state.ledger.loading || state.ledger.page >= state.ledger.pages) return;
      state.ledger.page += 1;
      loadLedger('page');
    });
    $('#ledger-page-jump').addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      goLedgerPage(event.target.value);
    });
    $('#ledger-page-jump').addEventListener('change', function (event) {
      goLedgerPage(event.target.value);
    });

    $('#btn-batch-retry').addEventListener('click', function () { batchRetryVisible(); });
    $('#btn-batch-delete').addEventListener('click', function (event) { batchDeleteVisible(event.currentTarget); });

    var selectAll = $('#ledger-select-all');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        var on = selectAll.checked;
        (state.ledger.items || []).forEach(function (task) {
          if (on) state.select[task.task_id] = true; else delete state.select[task.task_id];
        });
        renderLedger();
      });
    }
    var selClear = $('#btn-selection-clear');
    if (selClear) selClear.addEventListener('click', function () { state.select = {}; renderLedger(); });
    var selCancel = $('#btn-selection-cancel');
    if (selCancel) selCancel.addEventListener('click', function () { runSelection('cancel', ['queued', 'running'], selCancel); });
    var selRetry = $('#btn-selection-retry');
    if (selRetry) selRetry.addEventListener('click', function () { runSelection('retry', ['failed', 'cancelled'], selRetry); });
    var selDelete = $('#btn-selection-delete');
    if (selDelete) selDelete.addEventListener('click', function () { runSelection('delete', ['completed', 'failed', 'cancelled'], selDelete); });

    var emptyActions = $('#ledger-empty-actions');
    if (emptyActions) emptyActions.addEventListener('click', onListAction);

    $('#task-body').addEventListener('click', onListAction);
    $('#task-close').addEventListener('click', closeTaskDialog);
    $('#task-dialog-close').addEventListener('click', closeTaskDialog);
    $('#task-dialog').addEventListener('cancel', closeTaskDialog);
    // 点击遮罩关闭：target 是 dialog 本身才算遮罩（点内容区 target 在内部节点上）。
    $('#task-dialog').addEventListener('click', function (event) {
      if (event.target === event.currentTarget) closeTaskDialog();
    });

    $('#auth-form').addEventListener('submit', submitAuth);
    $('#auth-cancel').addEventListener('click', closeAuth);
    $('#auth-dialog').addEventListener('cancel', function () { state.authOpen = false; });

    // 页面重新可见时补一次全量状态，避免后台标签页漏掉 SSE 快照
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      var exp = Number(state.tokenExp) || 0;
      if (state.auth === 'on' && state.token && exp && exp - Date.now() < 5 * 60 * 1000) {
        tryRefresh().then(function (ok) { if (ok) loadAll(); });
        return;
      }
      loadAll();
    });

    setInterval(function () {
      request('/api/v1/queue/status')
        .then(function (data) { state.queue = data || null; renderStatus(); })
        .catch(function () { });
    }, 15000);
  }

  function onListAction(event) {
    var copy = event.target.closest('[data-copy]');
    if (copy) { copyText(copy.getAttribute('data-copy'), copy); return; }

    var example = event.target.closest('[data-example]');
    if (example) {
      var input = $('#target-input');
      if (!input) return;
      input.value = example.getAttribute('data-example');
      input.focus();
      autoGrow();
      updateTargetHint();
      return;
    }

    var btn = event.target.closest('[data-action]');
    if (!btn) {
      // 整行点击打开详情：只在行/卡片本身（非按钮、复选框、链接）上生效，与 web1 行为一致。
      if (event.target.closest('[data-select], a, input, button, label')) return;
      var row = event.target.closest('.lrow[data-id], .ticket[data-task-id]');
      if (row) {
        var rowId = row.classList.contains('ticket') ? row.getAttribute('data-task-id') : row.getAttribute('data-id');
        if (rowId) openTaskDetail(rowId);
      }
      return;
    }
    var action = btn.getAttribute('data-action');
    if (action === 'reset-filters') {
      state.filter = 'all';
      state.type = 'all';
      state.stage = 'all';
      state.query = '';
      var search = $('#ledger-search');
      if (search) search.value = '';
      renderFilters();
      renderTypeFilter();
      renderStageFilter();
      loadLedger('reset');
      return;
    }
    var id = btn.getAttribute('data-id');
    if (action === 'detail') openTaskDetail(id);
    else if (action === 'cancel') cancelTask(id);
    else if (action === 'retry') retryTask(id);
    else if (action === 'delete') deleteTask(id, btn);
  }

  /* ---------------- shell: shared i18n words ---------------- */

  var SHELL_I18N = {
    'zh-CN': {
      nav: {
        group: '主导航', overview: '总览', tasks: '下载', data: '数据',
        schedules: '计划', logs: '日志', system: '系统'
      },
      common: {
        loading: '加载中…', refresh: '刷新', save: '保存', cancel: '取消', close: '关闭',
        delete: '删除', retry: '重试', edit: '编辑', reset: '重置', error: '出错了',
        previous: '上一页', next: '下一页', saved: '已保存', deleted: '已删除',
        failed: '操作失败', fetchFailed: '加载失败', total: '共 {n} 条', all: '全部',
        actions: '操作', yes: '是', no: '否', never: '从未',
        page: '第 {page} / {pages} 页', pageSize: '每页',
        timeout: '请求超时，请稍后重试'
      }
    },
    en: {
      nav: {
        group: 'Main navigation', overview: 'Overview', tasks: 'Download', data: 'Data',
        schedules: 'Schedules', logs: 'Logs', system: 'System'
      },
      common: {
        loading: 'Loading…', refresh: 'Refresh', save: 'Save', cancel: 'Cancel', close: 'Close',
        delete: 'Delete', retry: 'Retry', edit: 'Edit', reset: 'Reset', error: 'Something went wrong',
        previous: 'Previous', next: 'Next', saved: 'Saved', deleted: 'Deleted', failed: 'Action failed',
        fetchFailed: 'Could not load data', total: '{n} items', all: 'All', actions: 'Actions',
        yes: 'Yes', no: 'No', never: 'Never', page: 'Page {page} / {pages}', pageSize: 'Per page',
        timeout: 'Request timed out, please try again'
      }
    }
  };

  function mergeDict(target, source) {
    if (!source) return target;
    Object.keys(source).forEach(function (key) {
      var value = source[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        mergeDict(target[key], value);
      } else if (typeof value === 'string') {
        target[key] = value;
      }
    });
    return target;
  }

  mergeDict(I18N['zh-CN'], SHELL_I18N['zh-CN']);
  mergeDict(I18N['en'], SHELL_I18N['en']);

  var TASKS_I18N = {
    'zh-CN': {
      mark: {
        label: '动作',
        toggle: '仅标记为已下载（不下载媒体）',
        timeLabel: '标记时间（可选）',
        timeHelp: '留空表示标记到此刻；接口不支持「全量标记」。',
        unsupported: '这种目标类型不支持仅标记，请换成用户 / 列表 / 关注。'
      },
      upload: {
        label: '上传 .json 文件',
        folder: '上传文件夹',
        files: '已选择 {n} 个文件',
        folderFiles: '已选择 {n} 个文件（按目录上传）',
        help: '单文件 ≤400MB，仅 .json；上传生成的任务不可重试。',
        failed: '上传失败：{msg}',
        ok: '已上传 {n} 个文件，任务已入队'
      },
      detail: {
        title: '任务详情', close: '关闭', open: '详情', loading: '正在加载任务详情…',
        status: '状态', type: '类型', target: '目标', taskId: '任务 ID', entryId: '条目 ID',
        created: '创建时间', started: '开始时间', ended: '结束时间', stage: '阶段',
        progress: '进度', downloaded: '已下载', failedCount: '失败数', profile: '补档',
        message: '结果信息', raw: '原始 JSON', failedDetails: '失败明细',
        overview: '概览', progressTitle: '进度', timeline: '时间线', result: '结果',
        duration: '耗时', users: '用户', lists: '列表', paths: '文件路径',
        profileFailed: '补档失败', versioned: '版本化更新',
        errorTitle: '错误', removed: '该任务已不在任务列表中（可能已被删除）。'
      }
    },
    'en': {
      mark: {
        label: 'Action',
        toggle: 'Mark as downloaded only (no media)',
        timeLabel: 'Mark timestamp (optional)',
        timeHelp: 'Leave empty to mark up to now. “Mark everything” is not available over HTTP.',
        unsupported: 'This target type cannot be marked. Use users, lists or following.'
      },
      upload: {
        label: 'Upload .json files',
        folder: 'Upload a folder',
        files: '{n} file(s) selected',
        folderFiles: '{n} file(s) selected (uploaded as a folder)',
        help: 'Up to 400MB per file, .json only. Uploaded tasks cannot be retried.',
        failed: 'Upload failed: {msg}',
        ok: 'Uploaded {n} files, task queued'
      },
      detail: {
        title: 'Task details', close: 'Close', open: 'Details', loading: 'Loading task details…',
        status: 'Status', type: 'Type', target: 'Target', taskId: 'Task ID', entryId: 'Entry ID',
        created: 'Created', started: 'Started', ended: 'Ended', stage: 'Stage',
        progress: 'Progress', downloaded: 'Downloaded', failedCount: 'Failed', profile: 'Profile',
        message: 'Result', raw: 'Raw JSON', failedDetails: 'Failure details',
        overview: 'Overview', progressTitle: 'Progress', timeline: 'Timeline', result: 'Result',
        duration: 'Duration', users: 'Users', lists: 'Lists', paths: 'Paths',
        profileFailed: 'Profile failed', versioned: 'Versioned',
        errorTitle: 'Error', removed: 'This task is no longer in the task list (it may have been deleted).'
      }
    }
  };

  mergeDict(I18N['zh-CN'], TASKS_I18N['zh-CN']);
  mergeDict(I18N['en'], TASKS_I18N['en']);

  /* 下载页控制台化后的文案（台账列头、空态动作、进行中计数、复制） */
  var CONSOLE_I18N = {
    'zh-CN': {
      tasksView: { activeZero: '队列空闲', activeN: '{n} 个进行中' },
      ledger: {
        colStatus: '状态', colTarget: '目标', colProgress: '进度', colTime: '时间', colActions: '操作',
        emptyTitle: '台账还是空的',
        emptyHint: '在上方粘贴 @handle、x.com 链接、列表 id 或 JSON 路径，开始第一个下载。',
        emptyFilter: '当前筛选下没有任务',
        clearFilters: '清除筛选',
        total: '共 {n} 条',
        duration: '耗时 {d}',
        copyId: '复制任务 ID'
      },
      stage: {
        syncing: '同步媒体', downloading: '下载中', retrying: '重试中', resolving: '解析目标',
        profile: '获取资料', profile_warning: '资料警告', marking: '标记已下载', completed: '已完成'
      },
      detail: { copy: '复制', copied: '已复制' },
      upload: { hint: '上传的文件按来源目录分组导入' },
      typeFilter: {
        all: '全部类型', user: '用户下载', following: '关注下载', profile: '仅补档',
        list: '列表下载', mark: '标记已下载', json: 'JSON 导入', batch: '混合批量',
        listProfile: '列表补档', retryAll: '全量重试'
      },
      confirm: { again: '再点一次确认' },
      errors: {
        title: '失败记录',
        details: '明细',
        accountsTitle: '账号失败',
        accountsHint: '实体 ID · 失败推文数',
        jsonTitle: 'JSON 来源失败',
        jsonHint: '按来源文件统计',
        colEntity: '实体', colTweets: '失败推文', colSource: '来源文件', colType: '来源类型',
        moreRows: '另有 {n} 条未展开',
        kindUser: '用户', kindList: '列表', unknownEntity: '未知实体'
      },
      selection: {
        count: '已选 {n} 项',
        clear: '取消选择',
        cancel: '取消任务',
        retry: '重试任务',
        delete: '删除记录',
        all: '选择当前列表全部任务',
        one: '选择任务',
        empty: '当前列表没有选中项'
      }
    },
    en: {
      tasksView: { activeZero: 'queue idle', activeN: '{n} in flight' },
      ledger: {
        colStatus: 'Status', colTarget: 'Target', colProgress: 'Progress', colTime: 'When', colActions: 'Actions',
        emptyTitle: 'The ledger is empty',
        emptyHint: 'Paste a handle, an x.com link, a list id or a JSON path above to start the first download.',
        emptyFilter: 'No tasks match this filter',
        clearFilters: 'Clear filters',
        total: '{n} total',
        duration: 'took {d}',
        copyId: 'Copy task id'
      },
      stage: {
        syncing: 'syncing media', downloading: 'downloading', retrying: 'retrying', resolving: 'resolving',
        profile: 'fetching profile', profile_warning: 'profile warning', marking: 'marking downloaded', completed: 'done'
      },
      detail: { copy: 'Copy', copied: 'Copied' },
      upload: { hint: 'Uploaded files are grouped by their source directory' },
      typeFilter: {
        all: 'All types', user: 'User download', following: 'Following download', profile: 'Profile only',
        list: 'List download', mark: 'Mark downloaded', json: 'JSON import', batch: 'Mixed batch',
        listProfile: 'List profile', retryAll: 'Retry all failed'
      },
      confirm: { again: 'Click again to confirm' },
      errors: {
        title: 'Failure log',
        details: 'Details',
        accountsTitle: 'Account failures',
        accountsHint: 'entity id · failed tweets',
        jsonTitle: 'JSON source failures',
        jsonHint: 'grouped by source file',
        colEntity: 'Entity', colTweets: 'Failed', colSource: 'Source file', colType: 'Source type',
        moreRows: '{n} more rows not shown',
        kindUser: 'user', kindList: 'list', unknownEntity: 'Unknown entity'
      },
      selection: {
        count: '{n} selected',
        clear: 'Clear selection',
        cancel: 'Cancel tasks',
        retry: 'Retry tasks',
        delete: 'Delete records',
        all: 'Select every task in this list',
        one: 'Select task',
        empty: 'Nothing selected in this list'
      }
    }
  };
  mergeDict(I18N['zh-CN'], CONSOLE_I18N['zh-CN']);
  mergeDict(I18N['en'], CONSOLE_I18N['en']);

  function i18nAdd(dict) {
    if (!dict) return;
    ['zh-CN', 'en'].forEach(function (lang) {
      if (dict[lang]) mergeDict(I18N[lang], dict[lang]);
    });
  }

  /* ---------------- shell: event bus ---------------- */

  var busListeners = {};

  function on(event, fn) {
    if (typeof fn !== 'function') return function () { };
    if (!busListeners[event]) busListeners[event] = [];
    busListeners[event].push(fn);
    return function () { offBus(event, fn); };
  }

  function offBus(event, fn) {
    var list = busListeners[event];
    if (!list) return;
    var index = list.indexOf(fn);
    if (index >= 0) list.splice(index, 1);
  }

  function emit(event, payload) {
    var list = busListeners[event];
    if (!list || !list.length) return;
    list.slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error(e); }
    });
  }

  /* ---------------- shell: routes + view registry ---------------- */

  var VIEW_ROUTES = [
    { id: 'overview', path: '/', key: 'nav.overview' },
    { id: 'tasks', path: '/tasks', key: 'nav.tasks' },
    { id: 'data', path: '/data', key: 'nav.data' },
    { id: 'schedules', path: '/schedules', key: 'nav.schedules' },
    { id: 'logs', path: '/logs', key: 'nav.logs' },
    { id: 'system', path: '/system', key: 'nav.system' }
  ];

  var viewDefs = {};
  var viewInstances = {};
  var currentView = 'tasks';

  function routeId(pathname) {
    var path = String(pathname || '/').replace(/\/+$/, '') || '/';
    for (var i = 0; i < VIEW_ROUTES.length; i++) {
      if (VIEW_ROUTES[i].path === path) return VIEW_ROUTES[i].id;
    }
    return null;
  }

  function routePath(id) {
    for (var i = 0; i < VIEW_ROUTES.length; i++) {
      if (VIEW_ROUTES[i].id === id) return VIEW_ROUTES[i].path;
    }
    return '/';
  }

  function viewRoot(id) {
    return document.getElementById('view-' + id);
  }

  function viewNotice(root, message, kind) {
    if (!root) return;
    root.innerHTML = '';
    var p = document.createElement('p');
    p.className = 'notice' + (kind ? ' notice--' + kind : '');
    p.textContent = message;
    root.appendChild(p);
  }

  function mountView(id) {
    var def = viewDefs[id];
    var root = viewRoot(id);
    if (!def || !root) return;
    unmountView(id);
    try {
      var instance = def.mount(root, API);
      viewInstances[id] = instance || {};
    } catch (e) {
      console.error('[tmd] view "' + id + '" failed to mount', e);
      viewInstances[id] = {};
      viewNotice(root, t('common.error') + ': ' + (e && e.message ? e.message : e), 'danger');
    }
  }

  function unmountView(id) {
    var instance = viewInstances[id];
    if (!instance) return;
    if (typeof instance.destroy === 'function') {
      try { instance.destroy(); } catch (e) { console.error(e); }
    }
    viewInstances[id] = null;
    var root = viewRoot(id);
    if (root) root.innerHTML = '';
  }

  function registerView(id, def) {
    if (!id || !def || typeof def.mount !== 'function') {
      console.warn('[tmd] views.register: invalid definition for', id);
      return;
    }
    viewDefs[id] = def;
    if (id === currentView && !viewInstances[id] && document.readyState !== 'loading') {
      mountView(id);
    }
  }

  function activateView(id) {
    if (!routePath(id) || !routeId(routePath(id))) id = 'overview';
    if (!viewRoot(id)) id = 'overview';
    currentView = id;
    $$('.view').forEach(function (section) {
      section.hidden = section.getAttribute('data-view') !== id;
    });
    $$('#nav [data-nav]').forEach(function (link) {
      if (link.getAttribute('data-nav') === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    var activeTab = document.querySelector('#nav [data-nav="' + id + '"]');
    if (activeTab && activeTab.parentNode) {
      var nav = activeTab.parentNode;
      var left = activeTab.offsetLeft - (nav.clientWidth - activeTab.offsetWidth) / 2;
      if (Math.abs(nav.scrollLeft - left) > 4) {
        if (nav.scrollTo) nav.scrollTo({ left: left, behavior: 'smooth' });
        else nav.scrollLeft = left;
      }
    }
    document.title = 'TMD · ' + t('nav.' + id);
    if (viewDefs[id]) {
      if (!viewInstances[id]) mountView(id);
    } else if (id !== 'tasks') {
      viewNotice(viewRoot(id), t('common.loading'));
    }
    try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
    emit('view', { id: id, path: routePath(id) });
  }

  // 视图可以在卸载前拒绝离开（例如配置页有未保存改动），返回 false 表示取消导航。
  function canLeaveView(id) {
    var instance = viewInstances[id];
    if (!instance || typeof instance.canLeave !== 'function') return true;
    try { return instance.canLeave() !== false; } catch (e) { return true; }
  }

  function navigate(path, options) {
    options = options || {};
    var id = routeId(path);
    if (!id) { path = '/'; id = 'overview'; }
    var same = id === currentView && window.location.pathname === routePath(id);
    if (!same && !canLeaveView(currentView)) return;
    if (same) {
      var instance = viewInstances[id];
      if (instance && typeof instance.refresh === 'function') instance.refresh();
      else if (viewDefs[id]) { unmountView(id); mountView(id); }
      return;
    }
    if (options.replace) window.history.replaceState({ view: id }, '', path);
    else window.history.pushState({ view: id }, '', path);
    activateView(id);
  }

  function remountCurrentView() {
    if (viewInstances[currentView]) {
      unmountView(currentView);
      mountView(currentView);
    }
    document.title = 'TMD · ' + t('nav.' + currentView);
  }

  function startRouter() {
    var nav = $('#nav');
    if (nav) {
      nav.addEventListener('click', function (event) {
        var link = event.target.closest('[data-nav]');
        if (!link) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(link.getAttribute('href'));
      });
    }
    window.addEventListener('popstate', function () {
      var id = routeId(window.location.pathname);
      if (!id) {
        window.history.replaceState({ view: 'overview' }, '', '/');
        id = 'overview';
      }
      // 浏览器后退已经改掉 URL，视图拒绝离开时把地址推回当前视图，避免地址与内容脱节。
      if (id !== currentView && !canLeaveView(currentView)) {
        window.history.pushState({ view: currentView }, '', routePath(currentView));
        return;
      }
      activateView(id);
    });
    var startId = routeId(window.location.pathname);
    if (!startId) {
      window.history.replaceState({ view: 'overview' }, '', '/');
      startId = 'overview';
    }
    activateView(startId);
  }

  function updateTaskTabCount(activeCount) {
    var link = document.querySelector('#nav [data-nav="tasks"]');
    if (!link) return;
    var badge = link.querySelector('.tab__count');
    if (!activeCount) {
      if (badge) badge.hidden = true;
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tab__count';
      link.appendChild(badge);
    }
    badge.hidden = false;
    badge.textContent = String(activeCount);
  }

  /* ---------------- shell: public API ---------------- */

  function buildQuery(params) {
    if (!params) return '';
    var parts = [];
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      if (typeof value === 'boolean') value = value ? 'true' : 'false';
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  var API = {
    get: function (path, params, options) {
      return request(path + buildQuery(params), options);
    },
    post: function (path, body) {
      return request(path, body === undefined ? { method: 'POST' } : { method: 'POST', body: body });
    },
    put: function (path, body) {
      return request(path, body === undefined ? { method: 'PUT' } : { method: 'PUT', body: body });
    },
    patch: function (path, body) {
      return request(path, body === undefined ? { method: 'PATCH' } : { method: 'PATCH', body: body });
    },
    del: function (path) {
      return request(path, { method: 'DELETE' });
    }
  };

  // showTasks 让其它视图带筛选条件打开台账：总览的状态卡与失败卡走这里，
  // 不必在路由查询参数与视图状态之间维护第二份筛选真值。
  function showTasks(opts) {
    opts = opts || {};
    if (opts.status) state.filter = opts.status;
    if (opts.type) state.type = opts.type;
    if (opts.stage) state.stage = opts.stage;
    if (opts.q !== undefined) {
      state.query = opts.q;
      var search = $('#ledger-search');
      if (search) search.value = opts.q;
    }
    if (opts.errors) state.errorsOpen = true;
    navigate('/tasks');
    renderFilters();
    renderTypeFilter();
    renderStageFilter();
    renderErrors();
    loadLedger('reset');
    loadStats();
  }

  var TMD = {
    t: t,
    esc: esc,
    injectStyle: function (id, text) {
      if (document.getElementById(id)) return;
      var style = document.createElement('style');
      style.id = id;
      style.textContent = text;
      document.head.appendChild(style);
    },
    fmtNum: function (value) {
      var n = Number(value);
      return isNaN(n) ? '—' : String(n);
    },
    api: API,
    toast: toast,
    confirm: function (message) { return window.confirm(message); },
    fmtTime: fmtTime,
    typeLabel: typeLabel,
    statusLabel: function (status) { return t('taskStatus.' + (status || 'queued')); },
    openTaskDetail: openTaskDetail,
    showTasks: showTasks,
    login: login,
    refreshToken: tryRefresh,
    logout: logout,
    classify: classify,
    parseTargets: parseTargets,
    taskTarget: taskTarget,
    debounce: function (fn, wait) {
      var timer = null;
      return function () {
        var self = this;
        var args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(self, args); }, wait || 200);
      };
    },
    state: state,
    i18n: { add: i18nAdd },
    views: { register: registerView },
    on: on,
    markServerStopped: enterStoppedState,
    navigate: navigate,
    streamUrl: function (path, params) {
      var query = buildQuery(params);
      if (state.token) query += (query ? '&' : '?') + 'token=' + encodeURIComponent(state.token);
      return path + query;
    },
    token: function () { return state.token; },
    copyText: copyValue,
    selectText: selectNodeText,
    reload: function () { return loadAll(); }
  };

  window.TMD = TMD;

  /* ---------------- boot ---------------- */


  function restorePrefs() {
    var lang = lsGet(LANG_KEY);
    if (!lang) {
      var nav = (navigator.language || 'zh-CN').toLowerCase();
      lang = nav.indexOf('zh') === 0 ? 'zh-CN' : 'en';
    }
    state.lang = I18N[lang] ? lang : 'zh-CN';

    state.theme = lsGet(THEME_KEY) || 'auto';
    state.token = lsGet(TOKEN_KEY) || '';
    state.tokenExp = Number(lsGet(EXP_KEY)) || 0;
    // ?theme=dark&lang=en 便于分享/截图验收，临时覆盖本地偏好而不写回
    try {
      var params = new URLSearchParams(window.location.search);
      var qTheme = params.get('theme');
      if (qTheme === 'light' || qTheme === 'dark' || qTheme === 'auto') state.theme = qTheme;
      var qLang = params.get('lang');
      if (qLang && I18N[qLang]) state.lang = qLang;
    } catch (e) { /* 旧浏览器忽略 */ }

    var savedMode = lsGet(MODE_KEY);
    if (savedMode && modeDef(savedMode).id === savedMode) state.mode = savedMode;

    try {
      var view = JSON.parse(lsGet(LEDGER_VIEW_KEY) || '{}');
      if (view && typeof view === 'object') {
        if (FILTER_IDS.indexOf(view.filter) >= 0) state.filter = view.filter;
        if (typeof view.type === 'string' && typeFilterDef(view.type)) state.type = view.type;
        if (typeof view.stage === 'string' && stageFilterDef(view.stage)) state.stage = view.stage;
        if (typeof view.query === 'string') state.query = view.query.slice(0, 200);
        if ([20, 50, 100, 200].indexOf(view.pageSize) >= 0) state.ledger.pageSize = view.pageSize;
        if (Number(view.page) >= 1) {
          state.ledger.page = Math.floor(Number(view.page));
          state.ledger.restored = true;
        }
      }
    } catch (e) { /* ignore */ }
    try {
      var flags = JSON.parse(lsGet(FLAGS_KEY) || '{}');
      Object.keys(state.flags).forEach(function (key) {
        if (typeof flags[key] === 'boolean') state.flags[key] = flags[key];
      });
    } catch (e) { /* ignore */ }
  }

  /* 滚动条只在滚动过程中显形：滚动时给容器加 .is-scrolling，停止 900ms 后移除。 */
  function initScrollReveal() {
    var timer = 0;
    var active = null;
    function clear() {
      timer = 0;
      if (!active) return;
      active.classList.remove('is-scrolling');
      active = null;
    }
    document.addEventListener('scroll', function (event) {
      var el = event.target;
      if (!el || el === document || el === window) el = document.documentElement;
      if (!el.classList) return;
      if (active && active !== el) active.classList.remove('is-scrolling');
      active = el;
      el.classList.add('is-scrolling');
      if (timer) clearTimeout(timer);
      timer = setTimeout(clear, 900);
    }, true);
  }

  // applyTasksDeepLink 让 /tasks?status=failed&type=user&q=nasa 直接落到对应筛选，
  // 通知、总览等入口可以用链接打开已过滤的台账。
  function applyTasksDeepLink() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    var status = params.get('status') || '';
    var type = params.get('type') || '';
    var stage = params.get('stage') || '';
    var query = (params.get('q') || '').trim();
    if (['all', 'active', 'completed', 'failed', 'cancelled'].indexOf(status) >= 0) state.filter = status;
    if (type && typeFilterDef(type).id === type) state.type = type;
    if (stage && stageFilterDef(stage).id === stage) state.stage = stage;
    if (params.get('errors') === '1') state.errorsOpen = true;
    if (query) {
      state.query = query;
      var search = $('#ledger-search');
      if (search) search.value = query;
    }
  }

  function boot() {
    restorePrefs();
    applyTheme(state.theme);
    applyLang(state.lang);
    bind();
    restoreDraft();
    autoGrow();
    updateTargetHint();
    applyTasksDeepLink();
    renderFilters();
    renderTypeFilter();
    renderStageFilter();
    var search = $('#ledger-search');
    if (search && state.query) search.value = state.query;
    renderLedger();
    renderHead();
    readFlagsPersisted();
    initScrollReveal();
    installGlobalErrorHandlers();
    installShortcuts();
    scheduleProactiveRefresh();
    startRouter();
    // 从其它视图回到下载页时补一次快照：SSE 断开或页面在后台时状态可能已经过期。
    // 首次进入由 loadAll 负责，这里用时间戳跳过启动时的重复请求。
    var lastTasksViewRefresh = Date.now();
    on('view', function (payload) {
      if (!payload || payload.id !== 'tasks') return;
      var now = Date.now();
      if (now - lastTasksViewRefresh < 1500) return;
      lastTasksViewRefresh = now;
      loadTasks();
      loadLedger('keep');
      loadStats();
      loadErrors();
    });

    bootstrapAuth().then(function (ctx) {
      loadAll();
      if (!ctx || ctx.authenticated || state.auth === 'off') connectSSE();
    });
  }

  function readFlagsPersisted() {
    $$('#options-group input[data-flag]').forEach(function (input) {
      var key = input.getAttribute('data-flag');
      input.checked = !!state.flags[key];
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

