/* TMD · 日志视图（/logs） */
(function () {
  'use strict';

  var T = window.TMD;
  if (!T) return;

  T.i18n.add({
    'zh-CN': {
      logs: {
        title: '日志',
        sub: '按级别、来源与时间检索日志，或开启实时流跟随最新输出。',
        chipAll: '全部', debug: '调试', info: '信息', warn: '警告', error: '错误',
        levelLabel: '级别', levelAll: '全部级别',
        qLabel: '关键词', qPlaceholder: '搜索日志内容…',
        domainLabel: '来源', domainPlaceholder: '例如 api',
        rangeLabel: '时间范围', rangeAll: '全部时间', range15m: '最近 15 分钟',
        range1h: '最近 1 小时', range24h: '最近 24 小时', rangeCustom: '自定义',
        startLabel: '开始时间', endLabel: '结束时间', to: '至',
        pageSizeLabel: '每页条数',
        results: '日志流', total: '共 {n} 条',
        liveCount: '实时 {n} 行',
        page: '第 {page} / {pages} 页',
        emptyTitle: '没有匹配的日志行',
        emptyHint: '放宽级别、关键词或时间范围后再试，或开启实时流等待新日志。',
        resetFilters: '清除筛选',
        loading: '正在加载日志…',
        loadFailed: '日志加载失败：{msg}',
        retry: '重试',
        timeRange: '开始时间不能晚于结束时间',
        liveStart: '开启实时', liveStop: '停止实时',
        liveStartTip: '开启后按当前筛选条件跟随最新日志',
        liveOff: '实时未开启', liveConnecting: '实时连接中', liveOn: '实时已连接', liveReconnecting: '实时重连中',
        followLabel: '自动跟随', followTip: '有新日志时保持在最新一行',
        streamError: '实时连接中断，浏览器正在自动重连…',
        needAuth: '需要登录后才能订阅实时日志',
        noSse: '当前浏览器不支持实时推送',
        export: '导出', exportTip: '导出完整日志文件 tmd2.log', exportStarted: '已开始导出日志文件',
        copyLine: '复制此行', copied: '已复制日志行', copyFailed: '复制失败',
        copyManual: '浏览器拒绝了自动复制，已选中此行，请按 Ctrl+C',
        latest: '跳到最新', prev: '上一页', next: '下一页',
        levelTitle: '级别 {level}'
      }
    },
    'en': {
      logs: {
        title: 'Logs',
        sub: 'Search logs by level, source and time range, or go live and follow the newest output.',
        chipAll: 'All', debug: 'Debug', info: 'Info', warn: 'Warn', error: 'Error',
        levelLabel: 'Level', levelAll: 'All levels',
        qLabel: 'Keyword', qPlaceholder: 'Search log content…',
        domainLabel: 'Source', domainPlaceholder: 'e.g. api',
        rangeLabel: 'Time range', rangeAll: 'All time', range15m: 'Last 15 min',
        range1h: 'Last hour', range24h: 'Last 24 h', rangeCustom: 'Custom',
        startLabel: 'Start', endLabel: 'End', to: 'to',
        pageSizeLabel: 'Page size',
        results: 'Log stream', total: '{n} total',
        liveCount: 'live {n} lines',
        page: 'Page {page} / {pages}',
        emptyTitle: 'No log lines match',
        emptyHint: 'Loosen the level, keyword or time range, or go live and wait for new output.',
        resetFilters: 'Clear filters',
        loading: 'Loading logs…',
        loadFailed: 'Could not load logs: {msg}',
        retry: 'Retry',
        timeRange: 'Start time cannot be later than end time',
        liveStart: 'Go live', liveStop: 'Stop live',
        liveStartTip: 'Follow new logs with the current filters',
        liveOff: 'Live off', liveConnecting: 'Live connecting', liveOn: 'Live on', liveReconnecting: 'Live reconnecting',
        followLabel: 'Auto-follow', followTip: 'Stay on the newest line as logs arrive',
        streamError: 'Live stream disconnected, the browser is reconnecting…',
        needAuth: 'Sign in before subscribing to the live log stream',
        noSse: 'This browser does not support live streaming',
        export: 'Export', exportTip: 'Download the full tmd2.log file', exportStarted: 'Log download started',
        copyLine: 'Copy line', copied: 'Log line copied', copyFailed: 'Copy failed',
        copyManual: 'Automatic copy was blocked; this line is selected — press Ctrl+C',
        latest: 'Jump to latest', prev: 'Previous', next: 'Next',
        levelTitle: 'Level {level}'
      }
    }
  });

  var STYLE_ID = 'view-logs-style';
  var MAX_CACHE = 3000;
  var PAGE_SIZES = [50, 100, 200];
  var LEVELS = ['all', 'debug', 'info', 'warn', 'error'];
  var LEVEL_LABEL = { all: 'chipAll', debug: 'debug', info: 'info', warn: 'warn', error: 'error' };
  var RANGES = ['', '15m', '1h', '24h', 'custom'];

  var host = null;
  var reqSeq = 0;
  var renderTimer = null;
  var cache = { countsKey: '', streamKey: '', loaded: false };
  var filters = { level: 'all', q: '', domain: '', range: '', start: '', end: '', pageSize: 100, page: 1 };
  var view = { rows: [], total: 0, page: 1, totalPages: 1, stats: { all: 0, debug: 0, info: 0, warn: 0, error: 0 } };
  var live = false;
  var liveState = 'off';
  var liveLines = 0;
  var follow = true;
  var es = null;

  function t(key, vars) { return T.t('logs.' + key, vars); }
  var esc = T.esc;

  var ICONS = {
    copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.6" y="5.6" width="7.8" height="7.8" rx="1.4"/><path d="M10.4 5.6V3.6a1 1 0 0 0-1-1H3.6a1 1 0 0 0-1 1v5.8a1 1 0 0 0 1 1h2"/></svg>',
    export: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.6v8.2M4.8 7.6 8 10.8l3.2-3.2M3 13h10"/></svg>',
    refresh: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 3.4V6.6H9.8"/></svg>',
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.2 3.4v9.2l7-4.6-7-4.6Z"/></svg>',
    stop: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.6" y="4.6" width="6.8" height="6.8" rx="1.2"/></svg>'
  };

  function injectStyle() {
    T.injectStyle(STYLE_ID, [
      '#view-logs .logfilters{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px}',
      '#view-logs .logfilters .input,#view-logs .logfilters .select{width:auto}',
      '#view-logs .logfilters__q{flex:1 1 220px;min-width:160px}',
      '#view-logs .logfilters__domain{flex:0 1 150px;min-width:120px}',
      '#view-logs .logfilters__custom{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '#view-logs .logbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;color:var(--muted);font-size:12px}',
      '#view-logs .logbar__spacer{flex:1 1 auto}',
      '#view-logs .logbar .switch{min-height:32px}',
      '#view-logs .logbox{padding:6px 8px;max-height:64vh;overscroll-behavior:contain}',
      '#view-logs .logbox[data-busy="true"]{opacity:.55}',
      '#view-logs .logline{display:grid;grid-template-columns:74px 48px minmax(0,1fr) 26px;grid-template-areas:"t l b c";gap:8px;align-items:start;padding:2px 6px;border-radius:6px}',
      '#view-logs .logline:hover{background:var(--surface-3)}',
      '#view-logs .logline__time{grid-area:t;color:var(--muted);font-size:11.5px;line-height:1.75;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '#view-logs .logline__lv{grid-area:l;justify-self:start;padding:0 6px;font-size:10.5px;font-weight:700;letter-spacing:.03em;line-height:1.7;border-radius:5px;font-family:inherit}',
      '#view-logs .logline__body{grid-area:b;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--text-soft)}',
      '#view-logs .logline__fields{color:var(--muted)}',
      '#view-logs .logline[data-level="error"] .logline__body{color:var(--danger)}',
      '#view-logs .logline[data-level="warn"] .logline__body{color:var(--warn)}',
      '#view-logs .logline[data-level="debug"] .logline__body{color:var(--muted)}',
      '#view-logs .logline[data-level="error"] .logline__lv{background:var(--danger-soft);color:var(--danger)}',
      '#view-logs .logline[data-level="warn"] .logline__lv{background:var(--warn-soft);color:var(--warn)}',
      '#view-logs .logline[data-level="info"] .logline__lv{background:var(--info-soft);color:var(--info)}',
      '#view-logs .logline[data-level="debug"] .logline__lv{background:var(--surface-3);color:var(--muted)}',
      '#view-logs .logline__copy{grid-area:c;align-self:start;padding:2px;opacity:0;transition:opacity .12s ease}',
      '#view-logs .logline:hover .logline__copy,#view-logs .logline:focus-within .logline__copy{opacity:1}',
      '#view-logs .logline__copy svg{width:12px;height:12px}',
      '#view-logs .empty__actions .btn{min-height:36px}',
      '#view-logs .notice .log-inline-btn{margin-left:10px;vertical-align:middle}',
      '@media (hover:none){#view-logs .logline__copy{opacity:1}}',
      '@media (max-width:720px){',
      '#view-logs .btn{min-height:40px}',
      '#view-logs .input,#view-logs .select{min-height:40px}',
      '#view-logs .view-head{flex-wrap:wrap;row-gap:10px}',
      '#view-logs .view-head__actions{flex-wrap:wrap;justify-content:flex-end;min-width:0}',
      '#view-logs .view-head__actions .btn{min-height:40px;min-width:40px}',
      '#view-logs .chip{min-height:40px}',
      '#view-logs .logbar .switch{min-height:40px}',
      '#view-logs .logfilters__q,#view-logs .logfilters__domain{flex:1 1 100%;min-width:0}',
      '#view-logs .logfilters .select{flex:1 1 auto;min-width:0}',
      '#view-logs .logfilters__custom{flex:1 1 100%}',
      '#view-logs .logfilters__custom .input{flex:1 1 100%;min-width:0}',
      '#view-logs .logline{grid-template-columns:auto auto minmax(0,1fr) 40px;grid-template-areas:"t l . c" "b b b b";row-gap:1px;padding:5px 6px}',
      '#view-logs .logline__body{grid-area:b}',
      '#view-logs .logline__copy{width:40px;height:40px;padding:11px}',
      '#view-logs .logline__copy svg{width:14px;height:14px}',
      '#view-logs .logbox{padding:4px;max-height:58vh}',
      '}'
    ].join(''));
  }

  /* ---------------- parsing ---------------- */

  function num(value, fallback) {
    var n = Number(value);
    return isNaN(n) ? fallback : n;
  }

  function normLevel(raw) {
    var value = String(raw || '').toLowerCase();
    if (value === 'error' || value === 'erro' || value === 'fatal' || value === 'panic') return 'error';
    if (value === 'warn' || value === 'warning') return 'warn';
    if (value === 'debug' || value === 'trace') return 'debug';
    if (value === 'info') return 'info';
    return '';
  }

  function unescapeLog(value) {
    return String(value || '')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  // 三种日志格式：logrus 文本 time="…" level=info msg="…"、logrus 终端 INFO[…]、纯时间前缀。
  function parseLine(raw) {
    var text = String(raw == null ? '' : raw);
    var row = { raw: text, time: null, level: '', domain: '', msg: text, fields: '' };
    var m = /^time="([^"]+)"/.exec(text);
    var stamp = '';
    if (m) stamp = m[1];
    if (!stamp) {
      m = /^(?:DEBU|INFO|WARN|ERRO|FATA)\[([^\]]+)\]/.exec(text);
      if (m) stamp = m[1];
    }
    if (!stamp) {
      m = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/.exec(text);
      if (m) stamp = m[1];
    }
    if (stamp) {
      var date = new Date(stamp);
      if (!isNaN(date.getTime())) row.time = date;
    }

    m = /(?:^|\s)level=("?)(trace|debug|info|warn|warning|error|fatal|panic)\1/i.exec(text);
    if (m) row.level = normLevel(m[2]);
    if (!row.level) {
      m = /^(DEBU|INFO|WARN|ERRO|FATA)\[/.exec(text);
      if (m) row.level = normLevel(m[1]);
    }

    var body = text.replace(/^time="[^"]*"\s*/, '').replace(/^level=[a-zA-Z]+\s*/, '');
    var msgMatch = /msg="((?:[^"\\]|\\.)*)"/.exec(body);
    if (msgMatch) {
      row.msg = unescapeLog(msgMatch[1]);
      var rest = (body.slice(0, msgMatch.index) + ' ' + body.slice(msgMatch.index + msgMatch[0].length)).replace(/\s+/g, ' ').trim();
      row.fields = rest;
    } else {
      var prefix = /^(?:DEBU|INFO|WARN|ERRO|FATA)\[[^\]]+\]\s*/.exec(body);
      row.msg = prefix ? body.slice(prefix[0].length) : text;
    }

    var domainMatch = /^\[([a-zA-Z0-9_-]+)\]/.exec(row.msg.trim());
    if (domainMatch) row.domain = domainMatch[1].toLowerCase();
    if (!row.level) row.level = 'info';
    return row;
  }

  /* ---------------- formatting ---------------- */

  function lang() {
    return T.state && T.state.lang ? T.state.lang : 'zh-CN';
  }

  function clock(date) {
    if (!date) return '';
    try {
      return new Intl.DateTimeFormat(lang(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
    } catch (e) {
      return date.toLocaleTimeString();
    }
  }

  function stamp(date) {
    if (!date) return '';
    var now = new Date();
    var today = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    if (today) return clock(date);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return pad(date.getMonth() + 1) + '/' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function fullTime(date) {
    if (!date) return '';
    try {
      return new Intl.DateTimeFormat(lang(), {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).format(date);
    } catch (e) {
      return date.toLocaleString();
    }
  }

  function toLocalInput(date) {
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  /* ---------------- filters ---------------- */

  function effectiveRange() {
    var now = Date.now();
    if (filters.range === '15m') return { start: new Date(now - 15 * 60000), end: new Date(now) };
    if (filters.range === '1h') return { start: new Date(now - 60 * 60000), end: new Date(now) };
    if (filters.range === '24h') return { start: new Date(now - 24 * 60 * 60000), end: new Date(now) };
    if (filters.range === 'custom') {
      var start = filters.start ? new Date(filters.start) : null;
      var end = filters.end ? new Date(filters.end) : null;
      if (start && isNaN(start.getTime())) start = null;
      if (end && isNaN(end.getTime())) end = null;
      return { start: start, end: end };
    }
    return { start: null, end: null };
  }

  function keyword() {
    return String(filters.q || '').trim().toLowerCase();
  }

  function domainParam() {
    return String(filters.domain || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  }

  // 级别、关键词、来源与时间范围都由 /api/v1/logs 过滤，前端只负责分页与展示，
  // 日志再多也不会被截断成「只检索最近 N 条」。
  function baseParams() {
    var params = {};
    var needle = keyword();
    var range = effectiveRange();
    var domain = domainParam();
    if (needle) params.q = needle;
    if (domain) params.domain = domain;
    if (range.start) params.start_time = range.start.toISOString();
    if (range.end) params.end_time = range.end.toISOString();
    return params;
  }

  function streamParams() {
    var params = {};
    var needle = keyword();
    var domain = domainParam();
    if (filters.level !== 'all') params.level = filters.level;
    if (needle) params.q = needle;
    if (domain) params.domain = domain;
    return params;
  }

  function mergeParams(base, extra) {
    var params = {};
    Object.keys(base).forEach(function (key) { params[key] = base[key]; });
    Object.keys(extra || {}).forEach(function (key) { params[key] = extra[key]; });
    return params;
  }

  function matchesRange(row, range) {
    if (!range.start && !range.end) return true;
    if (!row.time) return false;
    if (range.start && row.time.getTime() < range.start.getTime()) return false;
    if (range.end && row.time.getTime() > range.end.getTime()) return false;
    return true;
  }

  // 每个级别一个 pageSize=1 的请求，用 total 得到当前关键词 / 来源 / 时间范围下的条数。
  function loadCounts(seq, base) {
    var targets = [['all', ''], ['debug', 'debug'], ['info', 'info'], ['warn', 'warn'], ['error', 'error']];
    return Promise.all(targets.map(function (pair) {
      var params = mergeParams(base, { page: 1, pageSize: 1 });
      if (pair[1]) params.level = pair[1];
      return T.api.get('/api/v1/logs', params).then(function (res) {
        return num(res && res.total, 0);
      }, function () {
        return 0;
      });
    })).then(function (totals) {
      if (seq !== reqSeq || !host) return;
      view.stats = { all: totals[0], debug: totals[1], info: totals[2], warn: totals[3], error: totals[4] };
      renderStats();
    });
  }

  /* ---------------- markup ---------------- */

  function chip(level) {
    var pressed = filters.level === level ? 'true' : 'false';
    return '<button type="button" class="chip" data-level="' + level + '" aria-pressed="' + pressed + '">' +
      esc(t(LEVEL_LABEL[level])) +
      '<span class="chip__count" data-stat="' + level + '">—</span>' +
      '</button>';
  }

  function rangeOptions() {
    var items = [
      ['', t('rangeAll')], ['15m', t('range15m')], ['1h', t('range1h')], ['24h', t('range24h')], ['custom', t('rangeCustom')]
    ];
    return items.map(function (item) {
      return '<option value="' + esc(item[0]) + '">' + esc(item[1]) + '</option>';
    }).join('');
  }

  function sizeOptions() {
    return PAGE_SIZES.map(function (size) {
      return '<option value="' + size + '">' + size + '</option>';
    }).join('');
  }

  function toolbar() {
    return '<div class="logfilters">' +
      '<input class="input logfilters__q" type="search" data-role="q" value="' + esc(filters.q) + '" placeholder="' + esc(t('qPlaceholder')) + '" aria-label="' + esc(t('qLabel')) + '">' +
      '<input class="input logfilters__domain" type="search" data-role="domain" value="' + esc(filters.domain) + '" placeholder="' + esc(t('domainPlaceholder')) + '" aria-label="' + esc(t('domainLabel')) + '" list="log-domain-list">' +
      '<datalist id="log-domain-list" data-role="domain-list"></datalist>' +
      '<select class="select" data-role="range" aria-label="' + esc(t('rangeLabel')) + '">' + rangeOptions() + '</select>' +
      '<span class="logfilters__custom" data-role="custom-range" hidden>' +
        '<input class="input" type="datetime-local" step="1" data-role="start" value="' + esc(filters.start) + '" aria-label="' + esc(t('startLabel')) + '">' +
        '<span class="muted small">' + esc(t('to')) + '</span>' +
        '<input class="input" type="datetime-local" step="1" data-role="end" value="' + esc(filters.end) + '" aria-label="' + esc(t('endLabel')) + '">' +
      '</span>' +
      '<select class="select" data-role="pagesize" aria-label="' + esc(t('pageSizeLabel')) + '">' + sizeOptions() + '</select>' +
      '</div>';
  }

  function pager() {
    return '<div class="pager">' +
      '<button type="button" class="btn btn--sm btn--ghost" data-role="prev">' + esc(t('prev')) + '</button>' +
      '<span data-role="pageinfo"></span>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-role="next">' + esc(t('next')) + '</button>' +
      '<span class="pager__grow"></span>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-role="latest">' + esc(t('latest')) + '</button>' +
      '</div>';
  }

  function markup() {
    return '' +
      '<div class="view-head">' +
        '<div class="view-head__text">' +
          '<h1 class="view-title">' + esc(t('title')) + '</h1>' +
          '<p class="view-sub">' + esc(t('sub')) + '</p>' +
        '</div>' +
        '<div class="view-head__actions">' +
          '<button type="button" class="btn btn--primary btn--sm" data-role="live" aria-pressed="false" title="' + esc(t('liveStartTip')) + '">' +
            '<span class="log-live__icon" data-live-icon>' + ICONS.play + '</span><span data-live-text>' + esc(t('liveStart')) + '</span>' +
          '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-role="export" title="' + esc(t('exportTip')) + '" aria-label="' + esc(t('export')) + '">' + ICONS.export + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-role="refresh" title="' + esc(T.t('common.refresh')) + '" aria-label="' + esc(T.t('common.refresh')) + '">' + ICONS.refresh + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="filters" data-role="stats">' + LEVELS.map(chip).join('') + '</div>' +
      '<section class="card">' +
        '<header class="card__head">' +
          '<h3 class="card__title">' + esc(t('results')) + '</h3>' +
          '<span class="card__meta muted small" data-role="meta"></span>' +
        '</header>' +
        toolbar() +
        '<div class="logbar">' +
          '<span class="badge" data-role="live-badge">' + esc(t('liveOff')) + '</span>' +
          '<label class="switch" title="' + esc(t('followTip')) + '">' +
            '<input type="checkbox" data-role="follow"' + (follow ? ' checked' : '') + ' aria-label="' + esc(t('followLabel')) + '">' +
            '<span class="switch__track"></span>' +
            '<span>' + esc(t('followLabel')) + '</span>' +
          '</label>' +
          '<span class="logbar__spacer"></span>' +
          '<span data-role="live-count"></span>' +
        '</div>' +
        '<div class="notice notice--danger" data-role="error" hidden></div>' +
        '<div class="notice notice--warn" data-role="stream" hidden></div>' +
        '<div class="empty" data-role="empty" hidden></div>' +
        '<div class="logbox" data-role="logbox" hidden></div>' +
        '<div class="skeleton" data-role="loading" style="height:220px" hidden></div>' +
        pager() +
      '</section>';
  }

  /* ---------------- render ---------------- */

  function renderStats() {
    if (!host) return;
    var stats = view.stats || {};
    LEVELS.forEach(function (level) {
      var el = host.querySelector('[data-stat="' + level + '"]');
      if (!el) return;
      el.textContent = String(Number(stats[level]) || 0);
    });
  }

  function renderFilterState() {
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('.chip[data-level]'), function (el) {
      el.setAttribute('aria-pressed', el.getAttribute('data-level') === filters.level ? 'true' : 'false');
    });
    var rangeSelect = host.querySelector('[data-role="range"]');
    if (rangeSelect) rangeSelect.value = filters.range;
    var custom = host.querySelector('[data-role="custom-range"]');
    if (custom) custom.hidden = filters.range !== 'custom';
    var sizeSelect = host.querySelector('[data-role="pagesize"]');
    if (sizeSelect) sizeSelect.value = String(filters.pageSize);
  }

  function renderMeta() {
    if (!host) return;
    var el = host.querySelector('[data-role="meta"]');
    if (!el) return;
    var parts = [t('total', { n: String(num(view.total, 0)) })];
    if (live) parts.push(t('liveCount', { n: String(liveLines) }));
    el.textContent = parts.join(' · ');
  }

  function renderPager() {
    if (!host) return;
    var pages = Math.max(1, num(view.totalPages, 1));
    var current = Math.max(1, num(view.page, 1));
    var info = host.querySelector('[data-role="pageinfo"]');
    if (info) info.textContent = t('page', { page: current, pages: pages });
    var prev = host.querySelector('[data-role="prev"]');
    if (prev) prev.disabled = current <= 1;
    var next = host.querySelector('[data-role="next"]');
    if (next) next.disabled = current >= pages;
    var latest = host.querySelector('[data-role="latest"]');
    if (latest) latest.disabled = current <= 1 && !live;
  }

  function renderLive() {
    if (!host) return;
    var btn = host.querySelector('[data-role="live"]');
    var badge = host.querySelector('[data-role="live-badge"]');
    var textEl = host.querySelector('[data-live-text]');
    var iconEl = host.querySelector('[data-live-icon]');
    var countEl = host.querySelector('[data-role="live-count"]');
    if (textEl) textEl.textContent = live ? t('liveStop') : t('liveStart');
    if (iconEl) iconEl.innerHTML = live ? ICONS.stop : ICONS.play;
    if (btn) {
      btn.setAttribute('aria-pressed', live ? 'true' : 'false');
      btn.classList.toggle('btn--primary', !live);
      btn.classList.toggle('btn--danger', live);
    }
    if (badge) {
      var key = liveState === 'on' ? 'liveOn' : (liveState === 'connecting' ? 'liveConnecting' : (liveState === 'reconnecting' ? 'liveReconnecting' : 'liveOff'));
      badge.textContent = t(key);
      badge.className = 'badge' + (liveState === 'on' ? ' badge--ok' : (liveState === 'reconnecting' ? ' badge--warn' : (liveState === 'connecting' ? ' badge--info' : '')));
    }
    if (countEl) countEl.textContent = live ? t('liveCount', { n: String(liveLines) }) : '';
  }

  function setStreamNotice(message) {
    if (!host) return;
    var box = host.querySelector('[data-role="stream"]');
    if (!box) return;
    if (!message) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.textContent = message;
  }

  function emptyMarkup() {
    return '<p class="empty__title">' + esc(t('emptyTitle')) + '</p>' +
      '<p class="empty__hint">' + esc(t('emptyHint')) + '</p>' +
      '<div class="empty__actions">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-role="reset-filters">' + esc(t('resetFilters')) + '</button>' +
        '<button type="button" class="btn btn--primary btn--sm" data-role="empty-live">' + esc(t('liveStart')) + '</button>' +
      '</div>';
  }

  function setStatus(kind, message) {
    if (!host) return;
    var empty = host.querySelector('[data-role="empty"]');
    var box = host.querySelector('[data-role="logbox"]');
    var error = host.querySelector('[data-role="error"]');
    var loading = host.querySelector('[data-role="loading"]');
    if (error) { error.hidden = true; error.textContent = ''; }
    if (loading) loading.hidden = true;
    if (kind === 'loading') {
      if (empty) empty.hidden = true;
      if (box) { box.hidden = true; box.innerHTML = ''; }
      if (loading) loading.hidden = false;
    } else if (kind === 'empty') {
      if (empty) { empty.hidden = false; empty.innerHTML = emptyMarkup(); }
      if (box) { box.hidden = true; box.innerHTML = ''; }
    } else if (kind === 'ok') {
      if (empty) empty.hidden = true;
      if (box) box.hidden = false;
    } else if (kind === 'error') {
      if (empty) empty.hidden = true;
      if (box) { box.hidden = true; box.innerHTML = ''; }
      if (error) {
        error.hidden = false;
        error.innerHTML = esc(message || t('loadFailed', { msg: '' })) +
          '<button type="button" class="btn btn--ghost btn--sm log-inline-btn" data-role="refresh">' + esc(t('retry')) + '</button>';
      }
    }
  }

  function lineEl(row, index) {
    var el = document.createElement('div');
    el.className = 'logline';
    el.setAttribute('data-level', row.level);
    el.title = row.raw;

    var time = document.createElement('span');
    time.className = 'logline__time';
    time.textContent = row.time ? stamp(row.time) : '—';
    if (row.time) time.title = fullTime(row.time);

    var badge = document.createElement('span');
    badge.className = 'logline__lv';
    badge.textContent = row.level.toUpperCase();
    badge.title = t('levelTitle', { level: row.level });
    badge.setAttribute('aria-label', t('levelTitle', { level: row.level }));

    var body = document.createElement('span');
    body.className = 'logline__body';
    body.textContent = row.msg;
    if (row.fields) {
      var meta = document.createElement('span');
      meta.className = 'logline__fields';
      meta.textContent = '  ' + row.fields;
      body.appendChild(meta);
    }

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-btn logline__copy';
    copy.setAttribute('data-copy', String(index));
    copy.title = t('copyLine');
    copy.setAttribute('aria-label', t('copyLine'));
    copy.innerHTML = ICONS.copy;

    el.appendChild(time);
    el.appendChild(badge);
    el.appendChild(body);
    el.appendChild(copy);
    return el;
  }

  function renderLines() {
    if (!host) return;
    var box = host.querySelector('[data-role="logbox"]');
    if (!box) return;
    var stick = follow && view.page === 1;
    var prevHeight = box.scrollHeight;
    var prevTop = box.scrollTop;
    var fragment = document.createDocumentFragment();
    view.rows.forEach(function (row, index) {
      fragment.appendChild(lineEl(row, index));
    });
    box.innerHTML = '';
    box.appendChild(fragment);
    box.setAttribute('data-busy', 'false');
    if (stick) box.scrollTop = 0;
    else if (prevTop > 0) box.scrollTop = prevTop + (box.scrollHeight - prevHeight);
  }

  function renderDomains() {
    if (!host) return;
    var list = host.querySelector('[data-role="domain-list"]');
    if (!list) return;
    var seen = {};
    view.rows.forEach(function (row) {
      if (row.domain) seen[row.domain] = true;
    });
    var names = Object.keys(seen).sort();
    list.innerHTML = names.map(function (name) {
      return '<option value="' + esc(name) + '"></option>';
    }).join('');
  }

  function renderAll() {
    if (!host) return;
    renderStats();
    renderFilterState();
    renderMeta();
    renderPager();
    renderLive();
    if (!cache.loaded) {
      setStatus('loading');
      return;
    }
    if (!view.rows.length) {
      setStatus('empty');
      return;
    }
    setStatus('ok');
    renderLines();
    renderDomains();
  }

  /* ---------------- data ---------------- */

  function fetchLogs() {
    if (!host) return Promise.resolve();
    var range = effectiveRange();
    if (range.start && range.end && range.start.getTime() > range.end.getTime()) {
      T.toast('error', t('timeRange'));
      return Promise.resolve();
    }
    var seq = ++reqSeq;
    if (!cache.loaded) setStatus('loading');
    var box = host.querySelector('[data-role="logbox"]');
    if (box && cache.loaded) box.setAttribute('data-busy', 'true');

    var base = baseParams();
    var params = mergeParams(base, { page: filters.page, pageSize: filters.pageSize });
    if (filters.level !== 'all') params.level = filters.level;

    var baseKey = JSON.stringify(base);
    if (baseKey !== cache.countsKey) {
      cache.countsKey = baseKey;
      loadCounts(seq, base);
    }

    var streamKey = JSON.stringify(streamParams());
    if (live && streamKey !== cache.streamKey) startLive();

    return T.api.get('/api/v1/logs', params).then(function (res) {
      if (seq !== reqSeq || !host) return;
      res = res || {};
      var lines = Array.isArray(res.logs) ? res.logs : [];
      view.rows = lines.map(parseLine);
      view.total = num(res.total, lines.length);
      view.totalPages = Math.max(1, num(res.totalPages, 1));
      view.page = Math.max(1, num(res.page, 1));
      cache.loaded = true;
      if (filters.page > view.totalPages) {
        // 筛选后总页数变少：回到最后一页重新取。
        filters.page = view.totalPages;
        return fetchLogs();
      }
      filters.page = view.page;
      renderAll();
    }).catch(function (err) {
      if (seq !== reqSeq || !host) return;
      if (err && err.status === 401) return;
      var message = t('loadFailed', { msg: (err && err.message) ? err.message : T.t('common.fetchFailed') });
      setStatus('error', message);
    });
  }

  function refresh() {
    if (!host) return Promise.resolve();
    return fetchLogs();
  }

  // 任何筛选变化都回到第一页并重新向服务端取数。
  function reload() {
    filters.page = 1;
    return fetchLogs();
  }

  /* ---------------- live stream ---------------- */

  function closeStream() {
    if (es) {
      try { es.close(); } catch (e) { /* ignore */ }
      es = null;
    }
  }

  function stopLive(silent) {
    closeStream();
    live = false;
    liveState = 'off';
    liveLines = 0;
    setStreamNotice(null);
    if (!silent) {
      renderLive();
      renderMeta();
    }
  }

  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(function () {
      renderTimer = null;
      if (!host) return;
      renderAll();
    }, 180);
  }

  function onLogEvent(event) {
    if (!live || !host) return;
    var raw = event && typeof event.data === 'string' ? event.data : '';
    if (!raw) return;
    var lines = raw.split(/\r?\n/).filter(function (line) { return line !== ''; });
    if (!lines.length) return;
    liveLines += lines.length;
    // 级别 / 关键词 / 来源已在订阅参数里交给服务端，时间范围这里补一次本地判断。
    var range = effectiveRange();
    var parsed = lines.map(parseLine).filter(function (row) { return matchesRange(row, range); });
    if (parsed.length) {
      view.total += parsed.length;
      view.stats.all = num(view.stats.all, 0) + parsed.length;
      parsed.forEach(function (row) {
        view.stats[row.level] = num(view.stats[row.level], 0) + 1;
      });
      if (view.page === 1) {
        view.rows = parsed.concat(view.rows).slice(0, MAX_CACHE);
        view.rows = view.rows.slice(0, filters.pageSize);
      }
    }
    scheduleRender();
  }

  function startLive() {
    if (!host) return;
    if (typeof window.EventSource !== 'function') {
      T.toast('error', t('noSse'));
      return;
    }
    if (T.state && T.state.auth === 'required' && !T.token()) {
      T.toast('error', t('needAuth'));
      return;
    }
    closeStream();
    live = true;
    liveState = 'connecting';
    liveLines = 0;
    setStreamNotice(null);
    renderLive();
    renderMeta();
    try {
      var params = streamParams();
      cache.streamKey = JSON.stringify(params);
      es = new window.EventSource(T.streamUrl('/api/v1/logs/stream', params));
      es.addEventListener('log', onLogEvent);
      es.addEventListener('open', function () {
        if (!live || !host) return;
        liveState = 'on';
        setStreamNotice(null);
        renderLive();
      });
      es.onerror = function () {
        if (!live || !host) return;
        liveState = 'reconnecting';
        setStreamNotice(t('streamError'));
        renderLive();
      };
    } catch (err) {
      live = false;
      liveState = 'off';
      es = null;
      renderLive();
      T.toast('error', t('noSse'));
    }
  }

  function toggleLive() {
    if (live) stopLive(false);
    else startLive();
  }

  function exportLogs() {
    if (!host) return;
    if (T.state && T.state.auth === 'required' && !T.token()) {
      T.toast('error', t('needAuth'));
      return;
    }
    var link = document.createElement('a');
    link.href = T.streamUrl('/api/v1/logs/export', {});
    link.setAttribute('download', '');
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    T.toast('info', t('exportStarted'));
  }

  /* ---------------- copy ---------------- */

  function copyLine(index, btn) {
    var row = view.rows[index];
    if (!row) return;
    T.copyText(row.raw).then(function () {
      T.toast('success', t('copied'));
      if (btn) {
        btn.setAttribute('data-copied', 'true');
        setTimeout(function () {
          if (btn) btn.removeAttribute('data-copied');
        }, 1200);
      }
    }, function () {
      // 剪贴板 API 与 execCommand 都被拒绝：选中该行，用户按 Ctrl+C 即可。
      var line = btn && typeof btn.closest === 'function' ? btn.closest('.logline') : null;
      if (line) T.selectText(line.querySelector('.logline__body') || line);
      T.toast('error', t('copyManual'));
    });
  }

  /* ---------------- events ---------------- */

  function setLevel(level) {
    if (LEVELS.indexOf(level) === -1) level = 'all';
    filters.level = level;
    reload();
  }

  var debouncedReload = T.debounce(function () {
    if (!host) return;
    reload();
  }, 250);

  function onInput(event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    var role = target.getAttribute('data-role');
    if (role === 'q') {
      filters.q = String(target.value || '').trim();
      debouncedReload();
    } else if (role === 'domain') {
      filters.domain = String(target.value || '').trim();
      debouncedReload();
    } else if (role === 'start') {
      filters.start = String(target.value || '');
      debouncedReload();
    } else if (role === 'end') {
      filters.end = String(target.value || '');
      debouncedReload();
    }
  }

  function onChange(event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    var role = target.getAttribute('data-role');
    if (role === 'range') {
      filters.range = RANGES.indexOf(target.value) >= 0 ? target.value : '';
      renderFilterState();
      if (filters.range === 'custom') {
        if (filters.start || filters.end) debouncedReload();
        else filters.page = 1;
      } else {
        reload();
      }
    } else if (role === 'pagesize') {
      filters.pageSize = num(target.value, 100);
      reload();
    } else if (role === 'follow') {
      follow = !!target.checked;
      if (follow && view.page === 1) {
        var box = host.querySelector('[data-role="logbox"]');
        if (box) box.scrollTop = 0;
      }
    }
  }

  function resetFilters() {
    filters.level = 'all';
    filters.q = '';
    filters.domain = '';
    filters.range = '';
    filters.start = '';
    filters.end = '';
    filters.page = 1;
    if (host) {
      var q = host.querySelector('[data-role="q"]');
      if (q) q.value = '';
      var domain = host.querySelector('[data-role="domain"]');
      if (domain) domain.value = '';
      var start = host.querySelector('[data-role="start"]');
      if (start) start.value = '';
      var end = host.querySelector('[data-role="end"]');
      if (end) end.value = '';
    }
    reload();
  }

  function onClick(event) {
    if (!host) return;
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;

    var chipEl = target.closest('.chip[data-level]');
    if (chipEl && host.contains(chipEl)) {
      setLevel(chipEl.getAttribute('data-level'));
      return;
    }
    var copyEl = target.closest('[data-copy]');
    if (copyEl && host.contains(copyEl)) {
      copyLine(num(copyEl.getAttribute('data-copy'), -1), copyEl);
      return;
    }
    var btn = target.closest('[data-role]');
    if (!btn || !host.contains(btn)) return;
    var role = btn.getAttribute('data-role');
    if (role === 'refresh') {
      btn.disabled = true;
      refresh().then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
    } else if (role === 'live' || role === 'empty-live') {
      if (!live) startLive();
      else if (role === 'live') stopLive(false);
    } else if (role === 'export') {
      exportLogs();
    } else if (role === 'prev') {
      if (num(view.page, 1) <= 1) return;
      filters.page = num(view.page, 1) - 1;
      fetchLogs();
    } else if (role === 'next') {
      var pages = Math.max(1, num(view.totalPages, 1));
      if (num(view.page, 1) >= pages) return;
      filters.page = num(view.page, 1) + 1;
      fetchLogs();
    } else if (role === 'latest') {
      filters.page = 1;
      fetchLogs().then(function () {
        var box = host && host.querySelector('[data-role="logbox"]');
        if (box) box.scrollTop = 0;
      });
    } else if (role === 'reset-filters') {
      resetFilters();
    }
  }

  function bind() {
    if (!host) return;
    unbind();
    host.addEventListener('click', onClick);
    host.addEventListener('change', onChange);
    host.addEventListener('input', onInput);
  }

  function unbind() {
    if (!host) return;
    host.removeEventListener('click', onClick);
    host.removeEventListener('change', onChange);
    host.removeEventListener('input', onInput);
  }

  /* ---------------- view registration ---------------- */

  T.views.register('logs', {
    mount: function (root) {
      host = root;
      stopLive(true);
      injectStyle();
      host.innerHTML = markup();
      bind();
      renderStats();
      renderFilterState();
      renderMeta();
      renderPager();
      renderLive();
      if (cache.loaded) {
        renderAll();
      } else {
        setStatus('loading');
      }
      refresh();
      return {
        refresh: refresh,
        destroy: function () {
          stopLive(true);
          unbind();
          if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
          reqSeq++;
          host = null;
        }
      };
    }
  });
})();
