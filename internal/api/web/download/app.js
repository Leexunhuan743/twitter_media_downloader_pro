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
  var MAX_TARGETS = 20;
  var LEDGER_PAGE = 20;

  /* ---------------- i18n ---------------- */

  var I18N = {
    'zh-CN': {
      a11y: { skip: '跳到主内容' },
      brand: { name: '媒体控制台', latin: 'media console' },
      theme: { group: '外观', light: '浅色', auto: '跟随系统', dark: '深色', switched: '外观：{mode}' },
      lang: { group: '语言', switched: '界面语言：{name}' },
      status: {
        checking: '健康检查中…',
        health: 'v{version} · 正常',
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
        hint: '支持 @screen_name、x.com/twitter.com 链接、数字 list id、JSON 文件路径',
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
      queue: {
        title: '进行中',
        cancelQueued: '取消排队',
        refresh: '刷新',
        empty: '还没有任务。在上面贴一个目标，按 Enter 开始。'
      },
      ledger: {
        title: '台账',
        search: '搜索目标 / 任务 ID',
        searchLabel: '搜索台账',
        filterGroup: '按状态过滤',
        empty: '没有符合条件的任务记录。',
        more: '显示更多记录',
        limited: '显示前 {shown} / {total} 条',
        batchRetry: '重试失败',
        batchDelete: '清理终态',
        failedDetails: '失败明细'
      },
      filter: { all: '全部', active: '进行中', completed: '已完成', failed: '失败', cancelled: '已取消' },
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
        summary: '{users} 个账号 · {json} 个 JSON 来源'
      },
      footer: {
        root: '根目录 {path}',
        db: '库 {users} 用户 · {lists} 列表 · {entities} 媒体',
        version: '版本 {version}',
        note: 'TMD 媒体控制台 · 单页零构建'
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
        copyManual: '浏览器拒绝了自动复制，已选中文本，请按 Ctrl+C'
      },
      confirm: {
        delete: '删除任务 {id} 的记录？任务数据不会保留。',
        clearErrors: '清除全部失败记录？',
        cancelQueued: '取消所有排队中的任务？'
      },
      rel: { now: '刚刚', min: '{n} 分钟前', hour: '{n} 小时前', day: '{n} 天前' }
    },
    en: {
      a11y: { skip: 'Skip to content' },
      brand: { name: 'Media console', latin: 'six views, one shell' },
      theme: { group: 'Appearance', light: 'Light', auto: 'System', dark: 'Dark', switched: 'Appearance: {mode}' },
      lang: { group: 'Language', switched: 'Language: {name}' },
      status: {
        checking: 'checking…',
        health: 'v{version} · ok',
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
        hint: 'Accepts @screen_name, x.com/twitter.com links, numeric list ids, JSON paths',
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
      queue: {
        title: 'In flight',
        cancelQueued: 'Cancel queued',
        refresh: 'Refresh',
        empty: 'No tasks yet. Paste a target above and press Enter.'
      },
      ledger: {
        title: 'Ledger',
        search: 'Search target / task id',
        searchLabel: 'Search ledger',
        filterGroup: 'Filter by status',
        empty: 'No records match the filter.',
        more: 'Show more',
        limited: 'showing {shown} of {total}',
        batchRetry: 'Retry failed',
        batchDelete: 'Clear finished',
        failedDetails: 'Failure details'
      },
      filter: { all: 'All', active: 'Active', completed: 'Done', failed: 'Failed', cancelled: 'Cancelled' },
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
        summary: '{users} account(s) · {json} JSON source(s)'
      },
      footer: {
        root: 'root {path}',
        db: 'db {users} users · {lists} lists · {entities} media',
        version: 'version {version}',
        note: 'TMD media console · single page, zero build'
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
        copyManual: 'Automatic copy was blocked; text selected — press Ctrl+C'
      },
      confirm: {
        delete: 'Delete the record for task {id}?',
        clearErrors: 'Clear the whole failure log?',
        cancelQueued: 'Cancel every queued task?'
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
    errors: { regular: {}, json: [] },
    filter: 'all',
    query: '',
    ledger: { items: [], total: 0, page: 1, pageSize: LEDGER_PAGE, loading: false },
    context: null,
    mode: 'user',
    manualMode: false,
    mark: false,
    files: [],
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
    submitting: false
  };

  var MODES = [
    { id: 'user', kinds: ['user'], opts: ['skip_profile', 'no_retry'], mark: true },
    { id: 'following', kinds: ['user'], opts: ['no_retry'], mark: true },
    { id: 'profile', kinds: ['user'], opts: [] },
    { id: 'list', kinds: ['list'], opts: ['skip_profile', 'no_retry'], mark: true },
    { id: 'json', kinds: ['json'], opts: ['no_retry'] },
    { id: 'batch', kinds: ['user', 'list', 'json'], opts: ['auto_follow', 'follow_members', 'skip_profile', 'no_retry'], mark: true }
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
    renderStatus();
    renderQueue();
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

  function request(path, options) {
    options = options || {};
    var init = { method: options.method || 'GET', headers: authHeaders() };
    if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    return fetch(path, init).then(function (res) {
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
    });
  }

  function onUnauthorized() {
    state.token = '';
    lsSet(TOKEN_KEY, '');
    state.auth = 'required';
    renderStatus();
    openAuth();
  }

  function storeToken(token, expiresAt) {
    state.token = token || '';
    lsSet(TOKEN_KEY, state.token);
    if (expiresAt) {
      var ms = new Date(expiresAt).getTime();
      state.tokenExp = isNaN(ms) ? 0 : ms;
      lsSet(EXP_KEY, String(state.tokenExp));
    }
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
        if (data.server_shutting_down) $('#shutdown-banner').hidden = false;
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
  var RE_URL = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\//i;
  var RE_LIST_URL = /\/i\/lists\/(\d+)/i;
  var RE_JSON = /\.json$/i;
  var RE_PATH = /^(?:[A-Za-z]:[\\/]|\/|\.{1,2}[\\/]|~[\\/])/;

  function classify(token) {
    if (!token) return null;
    if (RE_URL.test(token)) {
      var listMatch = token.match(RE_LIST_URL);
      if (listMatch) return { kind: 'list', value: listMatch[1] };
      var url = token.replace(/[?#].*$/, '').replace(/\/+$/, '');
      var parts = url.split('/');
      var handle = parts[parts.length - 1];
      if (handle && RE_HANDLE.test(handle)) return { kind: 'user', value: handle.replace(/^@/, '') };
      return { kind: 'bad', value: token };
    }
    if (/^\d+$/.test(token)) return { kind: 'list', value: token };
    if (RE_JSON.test(token) || RE_PATH.test(token)) return { kind: 'json', value: token };
    if (/^@[A-Za-z0-9_]{1,15}$/.test(token)) return { kind: 'user', value: token.slice(1) };
    if (/^[A-Za-z0-9_]{1,15}$/.test(token)) return { kind: 'user', value: token };
    return { kind: 'bad', value: token };
  }

  function parseTargets(text) {
    var tokens = String(text || '').split(/[\s,;，、]+/).filter(Boolean);
    var out = [];
    tokens.forEach(function (token) {
      var item = classify(token);
      if (!item) return;
      item.raw = token;
      out.push(item);
    });
    return out;
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
      var input = $('#json-files');
      if (input) input.value = '';
    }
  }

  function renderOptions() {
    syncUploadField();
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

  function buildRequests(mode, items) {
    var flags = flagsFor(mode);
    var jsonPaths = items.filter(function (i) { return i.kind === 'json'; });
    var users = items.filter(function (i) { return i.kind === 'user'; }).map(function (i) { return i.value; });
    var lists = items.filter(function (i) { return i.kind === 'list'; }).map(function (i) { return i.value; });

    if (state.mark) {
      var stamp = markTimestamp();
      var stampBody = stamp ? { timestamp: stamp } : undefined;
      if (mode === 'batch') {
        if (!users.length && !lists.length) return [];
        var markBody = { users: users, lists: lists.map(Number), following_names: [] };
        if (stamp) markBody.timestamp = stamp;
        return [{ path: '/api/v1/batch/mark', body: markBody, label: users.concat(lists).length + ' targets' }];
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
      var body = { users: users, lists: lists.map(Number), following_names: [] };
      Object.keys(flags).forEach(function (key) { body[key] = flags[key]; });
      return [{ path: '/api/v1/batch/download', body: body, label: users.concat(lists).length + ' targets' }];
    }
    if (mode === 'json') {
      var paths = jsonPaths.map(function (i) { return i.value; });
      var isFolder = paths.length > 0 && paths.every(function (p) { return !RE_JSON.test(p); });
      var url = isFolder ? '/api/v1/json/folder/download' : '/api/v1/json/file/download';
      return [{ path: url, body: { paths: paths, no_retry: !!flags.no_retry }, label: paths.length + ' paths' }];
    }
    if (mode === 'profile') {
      return users.map(function (name) {
        return { path: '/api/v1/users/' + encodeURIComponent(name) + '/profile', body: undefined, label: name };
      });
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

    if (state.mode === 'json' && state.files.length) {
      submitUpload();
      return;
    }

    var items = parseTargets($('#target-input').value);
    if (!items.length) { showFormError(t('form.empty')); return; }

    var bad = items.filter(function (i) { return i.kind === 'bad'; });
    if (bad.length) {
      showFormError(t('form.badTargets', {
        n: bad.length,
        list: bad.slice(0, 3).map(function (i) { return i.raw; }).join(', ')
      }));
      return;
    }
    if (items.length > MAX_TARGETS) { showFormError(t('form.tooMany', { n: MAX_TARGETS })); return; }
    if (state.mark && !modeDef(state.mode).mark) { showFormError(t('mark.unsupported')); return; }

    var requests = buildRequests(state.mode, items);
    if (!requests.length) {
      showFormError(state.mark ? t('mark.unsupported') : t('form.empty'));
      return;
    }

    setSubmitting(true);
    var ok = 0;
    var failed = 0;
    var chain = Promise.resolve();
    requests.forEach(function (req) {
      chain = chain.then(function () {
        return request(req.path, { method: 'POST', body: req.body })
          .then(function () { ok += 1; })
          .catch(function (err) {
            failed += 1;
            if (err.status !== 401) toast('error', req.label + ': ' + err.message);
          });
      });
    });

    chain.then(function () {
      setSubmitting(false);
      if (ok > 0) {
        $('#target-input').value = '';
        updateTargetHint();
        resetTextareaHeight();
        if (failed) toast('error', t('toast.queuedPartial', { ok: ok, fail: failed }));
        else if (items.length === 1) toast('success', t('toast.queued', { name: items[0].value }));
        else toast('success', t('toast.queuedN', { n: ok }));
        loadTasks();
      } else if (failed) {
        showFormError(t('form.failed', { msg: t('auth.badKey') }));
      }
    });
  }

  function submitUpload() {
    var files = state.files || [];
    if (!files.length) return;
    var form = new FormData();
    files.forEach(function (file) { form.append('files', file, file.name); });
    if (state.flags.no_retry) form.append('no_retry', 'true');

    setSubmitting(true);
    fetch('/api/v1/json/file/download', { method: 'POST', headers: authHeaders(), body: form })
      .then(function (res) {
        return res.text().then(function (text) {
          var json = parseBody(text);
          if (res.ok) {
            unwrap(json);
            toast('success', t('upload.ok', { n: files.length }));
            state.files = [];
            var input = $('#json-files');
            if (input) input.value = '';
            var filesLabel = $('#upload-files');
            if (filesLabel) filesLabel.textContent = '';
            $('#target-input').value = '';
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

  function connectSSE() {
    // 需要密钥却没有令牌时不要连，否则 EventSource 会 4 秒一次打 401
    if (state.auth === 'required' && !state.token) return;
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
      state.tasks = tasks;
      state.connected = true;
      renderQueue();
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
      if (payload && payload.message) {
        toast(payload.type === 'error' ? 'error' : 'info', payload.message);
      }
    });

    es.addEventListener('server_shutdown', function () {
      $('#shutdown-banner').hidden = false;
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
    };

    es.onerror = function () {
      state.connected = false;
      renderStatus();
      if (state.auth === 'required' && !state.token) {
        try { es.close(); } catch (e) { /* ignore */ }
        state.es = null;
        return;
      }
      setTimeout(function () {
        if (!state.es || state.es.readyState === 2) connectSSE();
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
    return request('/api/v1/tasks')
      .then(function (data) {
        state.tasks = normalizeTasks(data);
        renderQueue();
        scheduleLedgerRefresh();
        emit('tasks', state.tasks);
      })
      .catch(function () { /* 401 已由 onUnauthorized 处理 */ });
  }

  var ledgerTimer = null;

  // SSE 每次推全量快照都会触发队列重绘；台账查询合并成 300ms 一次，避免每个事件打一次接口。
  function scheduleLedgerRefresh() {
    clearTimeout(ledgerTimer);
    ledgerTimer = setTimeout(function () { loadLedger(true); loadStats(); }, 300);
  }

  function ledgerParams() {
    var params = { page: state.ledger.page, pageSize: state.ledger.pageSize };
    if (state.filter === 'active') params.status = 'queued,running';
    else if (state.filter !== 'all') params.status = state.filter;
    if (state.query) params.q = state.query;
    params.sortBy = 'created_at';
    params.sortOrder = 'desc';
    return params;
  }

  // loadLedger 走服务端过滤分页（/tasks/query）；reset=true 表示回到第 1 页并替换列表。
  function loadLedger(reset) {
    if (state.ledger.loading) return Promise.resolve();
    if (reset) state.ledger.page = 1;
    state.ledger.loading = true;
    return request('/api/v1/tasks/query' + buildQuery(ledgerParams()))
      .then(function (data) {
        var items = (data && data.items) || [];
        state.ledger.total = (data && data.total) || 0;
        state.ledger.items = reset ? items : state.ledger.items.concat(items);
      })
      .catch(function () { })
      // loading 必须在重绘前落下，否则空结果会停在骨架屏上。
      .then(function () { state.ledger.loading = false; renderLedger(); });
  }

  // loadMeta 只取 download/context 没有的字段（根目录、库统计）；
  // 版本、队列与并发上限已由 loadContext 一次带回。
  function loadMeta() {
    request('/api/v1/config')
      .then(function (data) { state.config = data || null; renderFooter(); })
      .catch(function () { });

    request('/api/v1/db/stats')
      .then(function (data) { state.dbStats = data || null; renderFooter(); })
      .catch(function () { });
  }

  function loadErrors() {
    return request('/api/v1/errors')
      .then(function (data) {
        state.errors = {
          regular: (data && data.regular) || {},
          json: (data && data.json) || []
        };
        renderErrors();
      })
      .catch(function () { });
  }

  function loadStats() {
    return request('/api/v1/tasks/stats')
      .then(function (data) { state.stats = data || null; renderFilters(); })
      .catch(function () { /* 计数只用于筛选 chip，失败不影响台账 */ });
  }

  function loadAll() {
    return Promise.all([loadTasks(), loadErrors(), loadMeta(), loadLedger(true), loadStats()]);
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
    var percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
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
      healthEl.textContent = t('status.health', { version: state.health.version || '?' });
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

  function renderQueue() {
    var active = state.tasks.filter(function (task) {
      var status = taskStatus(task);
      return status === 'queued' || status === 'running';
    });
    var section = $('#queue-section');
    if (section) section.hidden = active.length === 0;
    var count = $('#queue-count');
    if (count) count.textContent = String(active.length);
    var host = $('#queue');
    if (host) host.innerHTML = active.map(renderTicket).join('');
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

  function renderTicket(task) {
    var status = taskStatus(task);
    var progress = progressOf(task);
    var data = task.data || {};
    var metrics = [];
    var result = task.result || {};
    if (result.main && result.main.downloaded) metrics.push(t('metric.downloaded', { n: result.main.downloaded }));
    if (result.main && result.main.failed) metrics.push(t('metric.failed', { n: result.main.failed }));
    if (result.profile && result.profile.downloaded) metrics.push(t('metric.profile', { n: result.profile.downloaded }));
    if (result.profile && result.profile.versioned) metrics.push(t('metric.versioned', { n: result.profile.versioned }));

    var bar = '<div class="progress' + (progress.percent === null && status === 'running' ? ' progress--indeterminate' : '') + '">' +
      '<div class="progress__bar" style="width:' + (progress.percent === null ? 0 : progress.percent) + '%"></div>' +
      '</div>';

    var stage = status === 'queued' ? t('ticket.waiting') : stageLabel(progress.stage);
    var countText = progress.total > 0 ? t('metric.progress', { done: progress.done, total: progress.total }) : '';

    var actions = '';
    if (status === 'queued' || status === 'running') {
      actions = '<button type="button" class="btn btn--ghost" data-action="cancel" data-id="' + esc(task.task_id) + '">' + esc(t('ticket.cancel')) + '</button>';
    }

    return '<article class="ticket" data-status="' + esc(status) + '">' +
      '<div class="ticket__head">' +
      '<span class="ticket__id">' + esc(shortId(task.task_id)) + '</span>' +
      statusPill(status) +
      '</div>' +
      '<div class="ticket__title">' + esc(taskTarget(task)) + '</div>' +
      '<div class="ticket__meta">' +
      '<span>' + esc(typeLabel(task.type)) + '</span>' +
      (stage ? '<span>' + esc(stage) + '</span>' : '') +
      (countText ? '<span>' + esc(countText) + '</span>' : '') +
      metrics.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') +
      (task.error ? '<span class="pill" data-status="failed">' + esc(task.error) + '</span>' : '') +
      '</div>' +
      bar +
      (actions ? '<div class="ticket__actions">' + actions + '</div>' : '') +
      (status === 'completed' ? '<div class="ticket__stamp">' + esc(t('ticket.stamp')) + '</div>' : '') +
      '</article>';
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

  function renderLedger() {
    var host = $('#ledger');
    if (!host) return;
    var items = state.ledger.items || [];
    if (state.ledger.loading && !items.length) host.innerHTML = skeletonRows(3);
    else host.innerHTML = items.map(renderRow).join('');

    var totalEl = $('#ledger-total');
    if (totalEl) {
      var total = Number(state.ledger.total) || 0;
      totalEl.hidden = total === 0;
      totalEl.textContent = String(total);
      totalEl.title = t('ledger.total', { n: total });
    }

    var empty = $('#ledger-empty');
    if (empty) {
      var filtered = state.filter !== 'all' || !!state.query;
      empty.hidden = items.length > 0 || (state.ledger.loading && !items.length);
      if (!empty.hidden) renderLedgerEmpty(filtered);
    }

    var more = $('#ledger-more');
    if (more) {
      if (state.ledger.total > items.length) {
        more.hidden = false;
        more.textContent = t('ledger.limited', { shown: items.length, total: state.ledger.total });
      } else {
        more.hidden = true;
        more.textContent = t('ledger.more');
      }
    }
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

  function renderRow(task) {
    var status = taskStatus(task);
    var progress = progressOf(task);
    var fullTarget = taskTarget(task);
    var canCancel = status === 'queued' || status === 'running';
    var canRetry = status === 'failed' || status === 'cancelled';

    var actions = '<button type="button" class="btn" data-action="detail" data-id="' + esc(task.task_id) + '">' + esc(t('detail.open')) + '</button>';
    if (canCancel) actions += '<button type="button" class="btn" data-action="cancel" data-id="' + esc(task.task_id) + '">' + esc(t('ticket.cancel')) + '</button>';
    if (canRetry) actions += '<button type="button" class="btn" data-action="retry" data-id="' + esc(task.task_id) + '">' + esc(t('ticket.retry')) + '</button>';
    if (!canCancel) actions += '<button type="button" class="btn btn--danger" data-action="delete" data-id="' + esc(task.task_id) + '">' + esc(t('ticket.delete')) + '</button>';

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
    var percent = progress.percent === null ? (status === 'running' ? 32 : 0) : progress.percent;
    var showBar = progress.total > 0 || status === 'running';
    var created = task.created_at || task.started_at;

    return '<div class="lrow" data-id="' + esc(task.task_id) + '" data-status="' + esc(status) + '">' +
      '<span class="lrow__status">' + statusPill(status) + '</span>' +
      '<span class="lrow__target">' +
        '<span class="lrow__name" title="' + esc(fullTarget) + '">' + esc(shortTarget(fullTarget)) + '</span>' +
        '<span class="lrow__sub"><span>' + esc(typeLabel(task.type)) + '</span>' +
          '<span class="sep" aria-hidden="true">·</span>' +
          '<span class="mono">' + esc(shortId(task.task_id)) + '</span></span>' +
      '</span>' +
      '<span class="lrow__prog">' +
        (showBar ? '<span class="metabar" data-status="' + esc(status) + '"><i style="width:' + percent + '%"></i></span>' : '') +
        '<span class="lrow__progtxt">' + esc(progText) + '</span>' +
      '</span>' +
      '<time class="lrow__time" title="' + esc(fmtTime(created)) + '">' + esc(fmtRelative(created)) + '</time>' +
      '<span class="lrow__actions">' + actions + '</span>' +
      '</div>';
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

  function renderErrors() {
    var regular = Object.keys(state.errors.regular || {});
    var json = state.errors.json || [];
    var host = $('#errors-strip');
    if (!host) return;
    if (!regular.length && !json.length) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    var summary = t('errors.summary', { users: regular.length, json: json.length });
    $('#errors-summary').textContent = summary + ' · ' + t('errors.hint');
  }

  function renderFooter() {
    var health = state.health || {};
    var version = $('#footer-version');
    if (version) version.textContent = t('footer.version', { version: health.version || '—' });
    var note = $('#footer-note');
    if (note) note.textContent = t('footer.note');
  }

  /* ---------------- toasts ---------------- */

  function toast(kind, message) {
    var host = $('#toasts');
    var node = document.createElement('div');
    node.className = 'toast';
    node.setAttribute('data-kind', kind || 'info');
    node.innerHTML = '<span>' + esc(message) + '</span>' +
      '<button type="button" class="toast__close" aria-label="close">×</button>';
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

  function cancelTask(id) {
    request('/api/v1/tasks/' + encodeURIComponent(id) + '/cancel', { method: 'POST' })
      .then(function () { closeTaskDialog(); toast('success', t('toast.cancelled')); loadTasks(); })
      .catch(function (err) { if (err.status !== 401) toast('error', err.message); });
  }

  function retryTask(id) {
    request('/api/v1/tasks/' + encodeURIComponent(id) + '/retry', { method: 'POST' })
      .then(function () { closeTaskDialog(); toast('success', t('toast.retried')); loadTasks(); })
      .catch(function (err) { if (err.status !== 401) toast('error', err.message); });
  }

  function deleteTask(id) {
    if (!window.confirm(t('confirm.delete', { id: String(id).slice(0, 8) }))) return;
    request('/api/v1/tasks/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () { closeTaskDialog(); toast('success', t('toast.deleted')); loadTasks(); })
      .catch(function (err) { if (err.status !== 401) toast('error', err.message); });
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
      if (btn) selectNodeText(btn);
      toast('error', t('toast.copyManual'));
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
  }

  function openTaskDetail(id) {
    var dialog = $('#task-dialog');
    var body = $('#task-body');
    if (!dialog || !body) return;
    body.innerHTML = '<p class="muted small">' + esc(t('detail.loading')) + '</p>';
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', 'open');
    }
    request('/api/v1/tasks/' + encodeURIComponent(id))
      .then(function (task) { renderTaskDetail(task); })
      .catch(function (err) {
        if (err.status === 401) { closeTaskDialog(); return; }
        body.innerHTML = '<p class="notice notice--danger">' + esc(err.message) + '</p>';
      });
  }

  function kv(label, value) {
    return '<div class="kv__row"><span class="kv__key">' + esc(label) + '</span>' +
      '<span class="kv__val">' + value + '</span></div>';
  }

  function renderTaskDetail(task) {
    var body = $('#task-body');
    if (!body || !task) return;
    var progress = task.progress || {};
    var result = task.result || {};
    var main = result.main || {};
    var profile = result.profile || {};
    var status = taskStatus(task);
    var html = '<div class="kv">';
    html += kv(t('detail.status'), statusPill(status));
    html += kv(t('detail.type'), esc(typeLabel(task.type)));
    html += kv(t('detail.target'), esc(taskTarget(task)));
    html += kv(t('detail.taskId'), '<span class="mono small">' + esc(task.task_id) + '</span>' + copyButton(task.task_id));
    if (task.entry_id) html += kv(t('detail.entryId'), '<span class="mono small">' + esc(task.entry_id) + '</span>' + copyButton(task.entry_id));
    html += kv(t('detail.created'), esc(fmtTime(task.created_at)));
    if (task.started_at) html += kv(t('detail.started'), esc(fmtTime(task.started_at)));
    if (task.ended_at) html += kv(t('detail.ended'), esc(fmtTime(task.ended_at)));
    if (progress.stage) html += kv(t('detail.stage'), esc(progress.stage));
    if (progress.total || progress.completed || progress.failed) {
      html += kv(t('detail.progress'), esc(t('metric.progress', {
        done: progress.completed || 0, total: progress.total || 0
      })));
    }
    if (main.downloaded !== undefined) html += kv(t('detail.downloaded'), esc(String(main.downloaded)));
    if (main.failed !== undefined) html += kv(t('detail.failedCount'), esc(String(main.failed)));
    if (profile.downloaded !== undefined) html += kv(t('detail.profile'), esc(String(profile.downloaded)));
    if (result.message) html += kv(t('detail.message'), esc(result.message));
    html += '</div>';
    if (task.error) html += '<p class="notice notice--danger mt-12">' + esc(task.error) + '</p>';
    if (Array.isArray(result.failed_details) && result.failed_details.length) {
      html += '<div class="kv mt-12">' + kv(t('detail.failedDetails'), esc(String(result.failed_details.length))) + '</div>';
      html += '<ul class="details-list">' + result.failed_details.map(function (item) {
        return '<li>' + esc(item) + '</li>';
      }).join('') + '</ul>';
    }
    var actions = '';
    if (status === 'queued' || status === 'running') {
      actions += '<button type="button" class="btn btn--ghost" data-action="cancel" data-id="' + esc(task.task_id) + '">' + esc(t('ticket.cancel')) + '</button>';
    }
    if (status === 'failed' || status === 'cancelled') {
      actions += '<button type="button" class="btn btn--ghost" data-action="retry" data-id="' + esc(task.task_id) + '">' + esc(t('ticket.retry')) + '</button>';
    }
    if (status !== 'queued' && status !== 'running') {
      actions += '<button type="button" class="btn btn--ghost btn--danger" data-action="delete" data-id="' + esc(task.task_id) + '">' + esc(t('ticket.delete')) + '</button>';
    }
    if (actions) html += '<div class="row-flex mt-16">' + actions + '</div>';
    html += '<details class="mt-12"><summary class="small muted">' + esc(t('detail.raw')) + '</summary>' +
      '<pre class="code">' + esc(JSON.stringify(task, null, 2)) + '</pre></details>';
    body.innerHTML = html;
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
      loadLedger(true);
      return data;
    });
  }

  function visibleIDs(statuses) {
    return state.ledger.items
      .filter(function (task) { return statuses.indexOf(taskStatus(task)) !== -1; })
      .slice(0, 100)
      .map(function (task) { return task.task_id; });
  }

  function batchRetryVisible() {
    var ids = visibleIDs(['failed', 'cancelled']);
    if (!ids.length) { toast('info', t('toast.batchEmpty')); return; }
    batchTasks('retry', ids).catch(function (err) {
      if (err.status !== 401) toast('error', err.message);
    });
  }

  function batchDeleteVisible() {
    var ids = visibleIDs(['completed', 'failed', 'cancelled']);
    if (!ids.length) { toast('info', t('toast.batchEmpty')); return; }
    batchTasks('delete', ids).catch(function (err) {
      if (err.status !== 401) toast('error', err.message);
    });
  }

  function cancelQueued() {
    if (!window.confirm(t('confirm.cancelQueued'))) return;
    request('/api/v1/tasks/cancel-queued', { method: 'POST' })
      .then(function () { toast('success', t('toast.cancelQueued')); loadTasks(); })
      .catch(function (err) { if (err.status !== 401) toast('error', err.message); });
  }

  function retryAllFailed() {
    request('/api/v1/errors/retry', { method: 'POST' })
      .then(function () { toast('success', t('toast.retryAll')); loadTasks(); })
      .catch(function (err) { if (err.status !== 401) toast('error', err.message); });
  }

  function clearErrors() {
    if (!window.confirm(t('confirm.clearErrors'))) return;
    request('/api/v1/errors', { method: 'DELETE' })
      .then(function () { toast('success', t('toast.errorsCleared')); loadErrors(); })
      .catch(function (err) { if (err.status !== 401) toast('error', err.message); });
  }

  /* ---------------- wiring ---------------- */

  function bind() {
    $('#dispatch-form').addEventListener('submit', submitForm);

    var input = $('#target-input');
    input.addEventListener('input', function () {
      autoGrow();
      updateTargetHint();
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
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
        var label = $('#upload-files');
        if (label) label.textContent = state.files.length ? t('upload.files', { n: state.files.length }) : '';
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
    $('#btn-cancel-queued').addEventListener('click', cancelQueued);
    $('#btn-retry-all').addEventListener('click', retryAllFailed);
    $('#btn-clear-errors').addEventListener('click', clearErrors);
    $('#btn-auth').addEventListener('click', openAuth);

    $('#queue').addEventListener('click', onListAction);
    $('#ledger').addEventListener('click', onListAction);

    $('#ledger-filters').addEventListener('click', function (event) {
      var chip = event.target.closest('[data-filter]');
      if (!chip) return;
      state.filter = chip.getAttribute('data-filter');
      renderFilters();
      loadLedger(true);
    });

    var search = $('#ledger-search');
    var searchTimer = null;
    search.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = search.value.trim();
        loadLedger(true);
      }, 300);
    });

    $('#ledger-more').addEventListener('click', function () {
      state.ledger.page += 1;
      loadLedger(false);
    });

    $('#btn-batch-retry').addEventListener('click', batchRetryVisible);
    $('#btn-batch-delete').addEventListener('click', batchDeleteVisible);

    var emptyActions = $('#ledger-empty-actions');
    if (emptyActions) emptyActions.addEventListener('click', onListAction);

    $('#task-body').addEventListener('click', onListAction);
    $('#task-close').addEventListener('click', closeTaskDialog);
    $('#task-dialog-close').addEventListener('click', closeTaskDialog);
    $('#task-dialog').addEventListener('cancel', closeTaskDialog);

    $('#auth-form').addEventListener('submit', submitAuth);
    $('#auth-cancel').addEventListener('click', closeAuth);
    $('#auth-dialog').addEventListener('cancel', function () { state.authOpen = false; });

    // 页面重新可见时补一次全量状态，避免后台标签页漏掉 SSE 快照
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) loadAll();
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
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'reset-filters') {
      state.filter = 'all';
      state.query = '';
      var search = $('#ledger-search');
      if (search) search.value = '';
      renderFilters();
      loadLedger(true);
      return;
    }
    var id = btn.getAttribute('data-id');
    if (action === 'detail') openTaskDetail(id);
    else if (action === 'cancel') cancelTask(id);
    else if (action === 'retry') retryTask(id);
    else if (action === 'delete') deleteTask(id);
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
        page: '第 {page} / {pages} 页', pageSize: '每页'
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
        yes: 'Yes', no: 'No', never: 'Never', page: 'Page {page} / {pages}', pageSize: 'Per page'
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
        label: '或上传 .json 文件',
        help: '单文件 ≤400MB，仅 .json；上传生成的任务不可重试。',
        failed: '上传失败：{msg}',
        ok: '已上传 {n} 个文件，任务已入队'
      },
      detail: {
        title: '任务详情', close: '关闭', open: '详情', loading: '正在加载任务详情…',
        status: '状态', type: '类型', target: '目标', taskId: '任务 ID', entryId: '条目 ID',
        created: '创建时间', started: '开始时间', ended: '结束时间', stage: '阶段',
        progress: '进度', downloaded: '已下载', failedCount: '失败数', profile: '补档',
        message: '结果信息', raw: '原始 JSON', failedDetails: '失败明细'
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
        label: 'Or upload .json files',
        help: 'Up to 400MB per file, .json only. Uploaded tasks cannot be retried.',
        failed: 'Upload failed: {msg}',
        ok: 'Uploaded {n} files, task queued'
      },
      detail: {
        title: 'Task details', close: 'Close', open: 'Details', loading: 'Loading task details…',
        status: 'Status', type: 'Type', target: 'Target', taskId: 'Task ID', entryId: 'Entry ID',
        created: 'Created', started: 'Started', ended: 'Ended', stage: 'Stage',
        progress: 'Progress', downloaded: 'Downloaded', failedCount: 'Failed', profile: 'Profile',
        message: 'Result', raw: 'Raw JSON', failedDetails: 'Failure details'
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
      upload: { files: '已选择 {n} 个文件' },
      errors: { hint: '失败项可重试或清除，失败会持续累积。' }
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
        duration: '{d}',
        copyId: 'Copy task id'
      },
      stage: {
        syncing: 'syncing media', downloading: 'downloading', retrying: 'retrying', resolving: 'resolving',
        profile: 'fetching profile', profile_warning: 'profile warning', marking: 'marking downloaded', completed: 'done'
      },
      detail: { copy: 'Copy', copied: 'Copied' },
      upload: { files: '{n} file(s) selected' },
      errors: { hint: 'Retry or clear failures; the log keeps growing until you do.' }
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

  function navigate(path, options) {
    options = options || {};
    var id = routeId(path);
    if (!id) { path = '/'; id = 'overview'; }
    var same = id === currentView && window.location.pathname === routePath(id);
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
    get: function (path, params) {
      return request(path + buildQuery(params));
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
      var flags = JSON.parse(lsGet(FLAGS_KEY) || '{}');
      Object.keys(state.flags).forEach(function (key) {
        if (typeof flags[key] === 'boolean') state.flags[key] = flags[key];
      });
    } catch (e) { /* ignore */ }
  }

  function boot() {
    restorePrefs();
    applyTheme(state.theme);
    applyLang(state.lang);
    bind();
    autoGrow();
    updateTargetHint();
    renderFilters();
    renderLedger();
    renderHead();
    readFlagsPersisted();
    startRouter();

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
