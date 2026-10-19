/* TMD · 日志视图（/logs） */
(function () {
  'use strict';

  var T = window.TMD;
  if (!T) return;

  T.i18n.add({
    'zh-CN': {
      logs: {
        title: '日志', sub: '按级别、来源与时间检索日志，或订阅实时日志流',
        chipAll: '全部', debug: '调试', info: '信息', warn: '警告', error: '错误',
        levelLabel: '级别', levelAll: '全部级别',
        qLabel: '关键词', qPlaceholder: '搜索日志内容…',
        domainLabel: '来源', domainPlaceholder: '例如 api',
        startLabel: '开始时间', endLabel: '结束时间', to: '至',
        pageSizeLabel: '每页条数',
        results: '日志流', total: '共 {n} 条', liveCount: '实时 {n} 行',
        page: '第 {page} / {pages} 页',
        empty: '没有匹配的日志行', loading: '正在加载日志…',
        loadFailed: '日志加载失败：{msg}',
        timeRange: '开始时间不能晚于结束时间',
        liveStart: '开启实时', liveStop: '停止实时',
        liveStartTip: '按当前级别 / 关键词 / 来源订阅推送',
        streamError: '实时连接中断，浏览器正在自动重连…',
        needAuth: '需要登录后才能订阅实时日志',
        noSse: '当前浏览器不支持实时推送',
        export: '导出', exportTip: '导出完整日志文件 tmd2.log', exportStarted: '已开始导出日志文件',
        latest: '跳到最新', prev: '上一页', next: '下一页'
      }
    },
    'en': {
      logs: {
        title: 'Logs', sub: 'Search logs by level, source and time, or subscribe to a live stream',
        chipAll: 'All', debug: 'Debug', info: 'Info', warn: 'Warn', error: 'Error',
        levelLabel: 'Level', levelAll: 'All levels',
        qLabel: 'Keyword', qPlaceholder: 'Search log content…',
        domainLabel: 'Source', domainPlaceholder: 'e.g. api',
        startLabel: 'Start time', endLabel: 'End time', to: 'to',
        pageSizeLabel: 'Page size',
        results: 'Log stream', total: '{n} total', liveCount: 'live {n} lines',
        page: 'Page {page} / {pages}',
        empty: 'No log lines match these filters', loading: 'Loading logs…',
        loadFailed: 'Could not load logs: {msg}',
        timeRange: 'Start time cannot be later than end time',
        liveStart: 'Go live', liveStop: 'Stop live',
        liveStartTip: 'Subscribe with the current level / keyword / source filters',
        streamError: 'Live stream disconnected, the browser is reconnecting…',
        needAuth: 'Sign in before subscribing to the live log stream',
        noSse: 'This browser does not support live streaming',
        export: 'Export', exportTip: 'Download the full tmd2.log file', exportStarted: 'Log download started',
        latest: 'Jump to latest', prev: 'Previous', next: 'Next'
      }
    }
  });

  var STYLE_ID = 'view-logs-style';
  var MAX_LINES = 2000;
  var LEVELS = ['all', 'debug', 'info', 'warn', 'error'];
  var PAGE_SIZES = [50, 100, 200];
  var LEVEL_LABEL = { all: 'chipAll', debug: 'debug', info: 'info', warn: 'warn', error: 'error' };

  var host = null;
  var reqSeq = 0;
  var stats = null;
  var page = { logs: [], total: 0, page: 1, pageSize: 100, totalPages: 1 };
  var filters = { level: 'all', q: '', domain: '', start_time: '', end_time: '', pageSize: 100, page: 1 };
  var live = false;
  var es = null;
  var liveCount = 0;

  function t(key, vars) { return T.t('logs.' + key, vars); }
  var esc = T.esc;

  /* ---------------- helpers ---------------- */

  function injectStyle() {
    T.injectStyle(STYLE_ID,
      '#view-logs [hidden]{display:none!important}' +
      '#view-logs .logline__text{flex:1 1 auto;min-width:0}' +
      '#view-logs .logline__time{font-variant-numeric:tabular-nums}' +
      '#view-logs .chip__count{margin-left:6px;font-variant-numeric:tabular-nums;opacity:.8;font-weight:600}' +
      '#view-logs .logbox{max-height:62vh;overscroll-behavior:contain}');
  }

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

  // 兼容三种常见日志格式：logrus 彩色文本 INFO[...]、logrus 文本 level=warning、JSON "level":"error"
  function levelOf(line) {
    var m = /^(DEBU|INFO|WARN|ERRO|FATA)\[/.exec(line);
    if (m) return normLevel(m[1]);
    m = /(?:^|[\s,{])level=("?)(trace|debug|info|warn|warning|error|fatal|panic)\1/i.exec(line);
    if (m) return normLevel(m[2]);
    m = /"level"\s*:\s*"([a-zA-Z]+)"/.exec(line);
    if (m) return normLevel(m[1]);
    return '';
  }

  function timeOf(line) {
    var m = /^time="([^"]+)"/.exec(line) ||
      /^(?:DEBU|INFO|WARN|ERRO|FATA)\[([^\]]+)\]/.exec(line) ||
      /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/.exec(line);
    return m ? m[1] : '';
  }

  function makeLine(text) {
    var row = document.createElement('div');
    row.className = 'logline';
    var level = levelOf(text);
    if (level) row.setAttribute('data-level', level);
    var stamp = timeOf(text);
    if (stamp) {
      var timeEl = document.createElement('span');
      timeEl.className = 'logline__time';
      var pretty = T.fmtTime(stamp);
      timeEl.textContent = pretty && pretty !== '—' ? pretty : stamp;
      row.appendChild(timeEl);
    }
    var body = document.createElement('span');
    body.className = 'logline__text';
    body.textContent = text;
    row.appendChild(body);
    return row;
  }

  function nearBottom(box) {
    return box.scrollHeight - box.scrollTop - box.clientHeight < 48;
  }

  /* ---------------- markup ---------------- */

  function chip(level) {
    var pressed = filters.level === level ? 'true' : 'false';
    return '<button type="button" class="chip" data-level="' + level + '" aria-pressed="' + pressed + '">' +
      esc(t(LEVEL_LABEL[level])) +
      '<span class="chip__count" data-stat="' + level + '">—</span>' +
      '</button>';
  }

  function toolbar() {
    var levelOptions = LEVELS.map(function (level) {
      var label = level === 'all' ? t('levelAll') : t(LEVEL_LABEL[level]);
      return '<option value="' + level + '">' + esc(label) + '</option>';
    }).join('');
    var sizeOptions = PAGE_SIZES.map(function (size) {
      return '<option value="' + size + '">' + size + '</option>';
    }).join('');
    return '<div class="toolbar">' +
      '<select class="select" data-role="level" aria-label="' + esc(t('levelLabel')) + '">' + levelOptions + '</select>' +
      '<input class="input toolbar__grow" type="search" data-role="q" value="' + esc(filters.q) + '" placeholder="' + esc(t('qPlaceholder')) + '" aria-label="' + esc(t('qLabel')) + '">' +
      '<input class="input" type="search" data-role="domain" value="' + esc(filters.domain) + '" placeholder="' + esc(t('domainPlaceholder')) + '" aria-label="' + esc(t('domainLabel')) + '" style="max-width:150px">' +
      '<input class="input" type="datetime-local" step="1" data-role="start" value="' + esc(filters.start_time) + '" aria-label="' + esc(t('startLabel')) + '">' +
      '<span class="muted small">' + esc(t('to')) + '</span>' +
      '<input class="input" type="datetime-local" step="1" data-role="end" value="' + esc(filters.end_time) + '" aria-label="' + esc(t('endLabel')) + '">' +
      '<select class="select" data-role="pagesize" aria-label="' + esc(t('pageSizeLabel')) + '">' + sizeOptions + '</select>' +
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
          '<button type="button" class="btn btn--primary btn--sm" data-role="live" aria-pressed="false" title="' + esc(t('liveStartTip')) + '">' + esc(t('liveStart')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-role="export" title="' + esc(t('exportTip')) + '">' + esc(t('export')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-role="refresh">' + esc(T.t('common.refresh')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="filters" data-role="stats">' + LEVELS.map(chip).join('') + '</div>' +
      '<section class="card">' +
        '<header class="card__head">' +
          '<h3 class="card__title">' + esc(t('results')) + '</h3>' +
          '<span class="card__meta muted small" data-role="meta"></span>' +
        '</header>' +
        toolbar() +
        '<div class="notice notice--danger" data-role="error" hidden></div>' +
        '<div class="notice notice--warn" data-role="stream" hidden></div>' +
        '<p class="empty" data-role="empty" hidden></p>' +
        '<div class="logbox" data-role="logbox" hidden></div>' +
        pager() +
      '</section>';
  }

  /* ---------------- state renderers ---------------- */

  function renderStats() {
    if (!host) return;
    var source = stats || {};
    LEVELS.forEach(function (level) {
      var el = host.querySelector('[data-stat="' + level + '"]');
      if (!el) return;
      var value = level === 'all' ? source.total : source[level];
      el.textContent = value === undefined || value === null ? '—' : String(value);
    });
  }

  function renderFilterState() {
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('.chip[data-level]'), function (el) {
      el.setAttribute('aria-pressed', el.getAttribute('data-level') === filters.level ? 'true' : 'false');
    });
    var levelSelect = host.querySelector('[data-role="level"]');
    if (levelSelect) levelSelect.value = filters.level;
    var sizeSelect = host.querySelector('[data-role="pagesize"]');
    if (sizeSelect) sizeSelect.value = String(filters.pageSize);
  }

  function renderMeta() {
    if (!host) return;
    var el = host.querySelector('[data-role="meta"]');
    if (!el) return;
    var parts = [t('total', { n: String(num(page.total, 0)) })];
    if (live) parts.push(t('liveCount', { n: String(liveCount) }));
    el.textContent = parts.join(' · ');
  }

  function renderPager() {
    if (!host) return;
    var pages = Math.max(1, num(page.totalPages, 1));
    var current = Math.max(1, num(page.page, 1));
    var info = host.querySelector('[data-role="pageinfo"]');
    if (info) info.textContent = t('page', { page: current, pages: pages });
    var prev = host.querySelector('[data-role="prev"]');
    if (prev) prev.disabled = current <= 1;
    var next = host.querySelector('[data-role="next"]');
    if (next) next.disabled = current >= pages;
    var latest = host.querySelector('[data-role="latest"]');
    if (latest) latest.disabled = current <= 1;
  }

  function renderLiveButton() {
    if (!host) return;
    var btn = host.querySelector('[data-role="live"]');
    if (!btn) return;
    btn.setAttribute('aria-pressed', live ? 'true' : 'false');
    btn.textContent = live ? t('liveStop') : t('liveStart');
    btn.classList.toggle('btn--primary', !live);
    btn.classList.toggle('btn--danger', live);
  }

  function setStreamNotice(message) {
    if (!host) return;
    var box = host.querySelector('[data-role="stream"]');
    if (!box) return;
    if (!message) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.textContent = message;
  }

  function setStatus(kind, message) {
    if (!host) return;
    var empty = host.querySelector('[data-role="empty"]');
    var box = host.querySelector('[data-role="logbox"]');
    var error = host.querySelector('[data-role="error"]');
    if (error) { error.hidden = true; error.textContent = ''; }
    if (kind === 'loading') {
      if (empty) { empty.hidden = false; empty.textContent = t('loading'); }
      if (box) { box.hidden = true; box.innerHTML = ''; }
    } else if (kind === 'empty') {
      if (empty) { empty.hidden = false; empty.textContent = t('empty'); }
      if (box) { box.hidden = true; box.innerHTML = ''; }
    } else if (kind === 'ok') {
      if (empty) empty.hidden = true;
      if (box) box.hidden = false;
    } else if (kind === 'error') {
      if (empty) empty.hidden = true;
      if (box) { box.hidden = true; box.innerHTML = ''; }
      if (error) { error.hidden = false; error.textContent = message || t('loadFailed', { msg: '' }); }
    }
  }

  /* ---------------- data ---------------- */

  function filterParams() {
    return {
      level: filters.level === 'all' ? '' : filters.level,
      q: filters.q,
      domain: filters.domain,
      start_time: filters.start_time,
      end_time: filters.end_time
    };
  }

  function listParams() {
    var params = filterParams();
    params.page = filters.page;
    params.pageSize = filters.pageSize;
    return params;
  }

  function streamParams() {
    return {
      level: filters.level === 'all' ? '' : filters.level,
      q: filters.q,
      domain: filters.domain
    };
  }

  function loadStats() {
    if (!host) return Promise.resolve();
    return T.api.get('/api/v1/logs/stats').then(function (data) {
      stats = data && typeof data === 'object' ? data : null;
      renderStats();
    }).catch(function () {
      stats = null;
      renderStats();
    });
  }

  function renderLines(lines) {
    if (!host) return;
    var box = host.querySelector('[data-role="logbox"]');
    if (!box) return;
    box.innerHTML = '';
    for (var i = 0; i < lines.length; i++) {
      box.appendChild(makeLine(String(lines[i])));
    }
    box.scrollTop = 0;
  }

  function loadLogs() {
    if (!host) return Promise.resolve();
    if (filters.start_time && filters.end_time && filters.start_time > filters.end_time) {
      T.toast('error', t('timeRange'));
      return Promise.resolve();
    }
    var seq = ++reqSeq;
    setStatus('loading');
    return T.api.get('/api/v1/logs', listParams()).then(function (res) {
      if (seq !== reqSeq || !host) return;
      res = res || {};
      var lines = Array.isArray(res.logs) ? res.logs : [];
      var total = num(res.total, 0);
      var totalPages = Math.max(1, num(res.totalPages, 1));
      var responsePage = Math.max(1, num(res.page, filters.page));
      if (responsePage > totalPages) {
        // 过滤后页码越界：回落到最后一页重新拉取
        filters.page = totalPages;
        return loadLogs();
      }
      filters.page = responsePage;
      var responseSize = num(res.pageSize, filters.pageSize);
      if (responseSize > 0) filters.pageSize = responseSize;
      page = {
        logs: lines,
        total: total,
        page: responsePage,
        pageSize: responseSize,
        totalPages: totalPages
      };
      renderFilterState();
      renderMeta();
      renderPager();
      if (!lines.length) {
        setStatus('empty');
        return;
      }
      renderLines(lines);
      setStatus('ok');
    }).catch(function (err) {
      if (seq !== reqSeq || !host) return;
      if (err && err.status === 401) return;
      var message = t('loadFailed', { msg: (err && err.message) ? err.message : T.t('common.fetchFailed') });
      setStatus('error', message);
    });
  }

  function refresh() {
    if (!host) return Promise.resolve();
    return Promise.all([loadStats(), loadLogs()]);
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
    liveCount = 0;
    setStreamNotice(null);
    renderLiveButton();
    renderMeta();
    if (!silent) loadStats();
  }

  function appendLines(lines) {
    if (!host) return;
    var box = host.querySelector('[data-role="logbox"]');
    if (!box) return;
    var stick = box.hidden || nearBottom(box);
    if (box.hidden) setStatus('ok');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] === '') continue;
      box.appendChild(makeLine(lines[i]));
    }
    while (box.childElementCount > MAX_LINES) {
      box.removeChild(box.firstElementChild);
    }
    if (stick) box.scrollTop = box.scrollHeight;
  }

  function onLogEvent(event) {
    if (!live || !host) return;
    var raw = event && typeof event.data === 'string' ? event.data : '';
    if (!raw) return;
    var lines = raw.split(/\r?\n/);
    appendLines(lines);
    liveCount += lines.length;
    renderMeta();
  }

  function onStreamOpen() {
    setStreamNotice(null);
  }

  function onStreamError() {
    if (!live || !host) return;
    setStreamNotice(t('streamError'));
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
    liveCount = 0;
    setStreamNotice(null);
    try {
      es = new window.EventSource(T.streamUrl('/api/v1/logs/stream', streamParams()));
      es.addEventListener('log', onLogEvent);
      es.addEventListener('open', onStreamOpen);
      es.onerror = onStreamError;
    } catch (err) {
      live = false;
      es = null;
      T.toast('error', t('noSse'));
    }
    renderLiveButton();
    renderMeta();
  }

  function toggleLive() {
    if (live) stopLive(false);
    else startLive();
  }

  function restartStreamIfLive() {
    if (live) startLive();
  }

  function exportLogs() {
    if (!host) return;
    if (T.state && T.state.auth === 'required' && !T.token()) {
      T.toast('error', t('needAuth'));
      return;
    }
    var link = document.createElement('a');
    link.href = T.streamUrl('/api/v1/logs/export', filterParams());
    link.setAttribute('download', '');
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    T.toast('info', t('exportStarted'));
  }

  /* ---------------- filters + events ---------------- */

  function setLevel(level) {
    if (LEVELS.indexOf(level) === -1) level = 'all';
    filters.level = level;
    filters.page = 1;
    renderFilterState();
    loadLogs();
    restartStreamIfLive();
  }

  var debouncedReload = T.debounce(function () {
    if (!host) return;
    filters.page = 1;
    loadLogs();
    restartStreamIfLive();
  }, 300);

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
      filters.start_time = String(target.value || '');
      debouncedReload();
    } else if (role === 'end') {
      filters.end_time = String(target.value || '');
      debouncedReload();
    }
  }

  function onChange(event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    var role = target.getAttribute('data-role');
    if (role === 'level') {
      setLevel(target.value);
    } else if (role === 'pagesize') {
      filters.pageSize = num(target.value, 100);
      filters.page = 1;
      renderFilterState();
      loadLogs();
    }
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
    var btn = target.closest('[data-role]');
    if (!btn || !host.contains(btn)) return;
    var role = btn.getAttribute('data-role');
    if (role === 'refresh') {
      btn.disabled = true;
      refresh().then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
    } else if (role === 'live') {
      toggleLive();
    } else if (role === 'export') {
      exportLogs();
    } else if (role === 'prev') {
      if (num(page.page, 1) <= 1) return;
      filters.page = num(page.page, 1) - 1;
      loadLogs();
    } else if (role === 'next') {
      var pages = Math.max(1, num(page.totalPages, 1));
      if (num(page.page, 1) >= pages) return;
      filters.page = num(page.page, 1) + 1;
      loadLogs();
    } else if (role === 'latest') {
      filters.page = 1;
      loadLogs();
    }
  }

  function bind() {
    if (!host) return;
    host.removeEventListener('click', onClick);
    host.removeEventListener('change', onChange);
    host.removeEventListener('input', onInput);
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
      if (live) stopLive(true);
      injectStyle();
      host.innerHTML = markup();
      bind();
      renderStats();
      renderFilterState();
      renderLiveButton();
      renderMeta();
      renderPager();
      if (page.logs && page.logs.length) {
        renderLines(page.logs);
        setStatus('ok');
      } else {
        setStatus('loading');
      }
      refresh();
      return {
        refresh: refresh,
        destroy: function () {
          stopLive(true);
          unbind();
          reqSeq++;
          host = null;
        }
      };
    }
  });
})();
