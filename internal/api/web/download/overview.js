/* TMD · 总览视图：状态条 + 快捷动作 + 最近任务 + 系统概况 */
(function () {
  'use strict';

  var T = window.TMD;
  if (!T) return;

  T.i18n.add({
    'zh-CN': {
      ov: {
        title: '总览',
        sub: '服务状态、队列压力与最近活动；需要操作时直接跳到对应页面。',
        quickDownload: '新建下载',
        quickSchedules: '计划任务',
        quickLogs: '查看日志',
        queue: '队列',
        queueSub: '运行 {active} · 等待 {pending}',
        tasks: '任务',
        tasksSub: '完成 {done} · 失败 {failed}',
        errors: '失败记录',
        errorsSub: '账号 {users} · JSON 源 {json}',
        db: '库',
        dbSub: '列表 {lists} · 媒体 {media}',
        recent: '最近任务',
        recentHint: '点击任意一行进入下载页处理',
        recentEmpty: '还没有任务记录',
        recentEmptyHint: '从下载页粘贴 @handle 或 x.com 链接开始。',
        goDownload: '去下载',
        viewAll: '查看全部',
        system: '系统概况',
        health: '服务',
        version: '版本',
        root: '根目录',
        routines: '下载并发',
        fetchConcurrent: '取用户并发',
        schedules: '计划任务',
        schedulesSub: '{enabled} / {total} 启用',
        logs: '日志',
        logsSub: '错误 {error} · 警告 {warn}',
        uptime: '队列深度',
        queueNote: '待处理 + 运行中 + 已分离'
      }
    },
    'en': {
      ov: {
        title: 'Overview',
        sub: 'Service state, queue pressure and recent activity; jump straight to the page you need.',
        quickDownload: 'New download',
        quickSchedules: 'Schedules',
        quickLogs: 'Logs',
        queue: 'Queue',
        queueSub: '{active} running · {pending} waiting',
        tasks: 'Tasks',
        tasksSub: '{done} done · {failed} failed',
        errors: 'Failures',
        errorsSub: '{users} account(s) · {json} JSON source(s)',
        db: 'Library',
        dbSub: '{lists} lists · {media} media',
        recent: 'Recent tasks',
        recentHint: 'Open any row on the download page to act on it',
        recentEmpty: 'No tasks recorded yet',
        recentEmptyHint: 'Paste a handle or an x.com link on the download page to start.',
        goDownload: 'Go to download',
        viewAll: 'View all',
        system: 'System',
        health: 'Service',
        version: 'Version',
        root: 'Root path',
        routines: 'Download concurrency',
        fetchConcurrent: 'User fetch concurrency',
        schedules: 'Schedules',
        schedulesSub: '{enabled} / {total} enabled',
        logs: 'Logs',
        logsSub: '{error} errors · {warn} warnings',
        uptime: 'Queue depth',
        queueNote: 'pending + running + detached'
      }
    }
  });

  var STYLE_ID = 'view-overview-style';
  T.injectStyle(STYLE_ID, [
    '.ov-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
    '.ov-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; align-items: start; }',
    '.ov-row { cursor: pointer; }',
    '.ov-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }',
    '.ov-row.lrow { grid-template-columns: 92px minmax(0, 1fr) 96px; }',
    '.ov-stats { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
    '.ov-sys .kv__row { padding: 8px 12px; }',
    '.ov-sys .kv__val { max-width: 62%; }',
    '.ov-truncate { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }',
    '.ov-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 26px 16px; border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); text-align: center; }',
    '.ov-empty p { margin: 0; }',
    '.ov-empty__title { color: var(--text-soft); font-size: 13.5px; font-weight: 600; }',
    '@media (max-width: 900px) { .ov-grid { grid-template-columns: minmax(0, 1fr); } }',
    '@media (max-width: 720px) { .ov-row.lrow { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "status time" "target target"; } .ov-row .lrow__status { grid-area: status; } .ov-row .lrow__time { grid-area: time; text-align: right; } .ov-row .lrow__target { grid-area: target; } }'
  ].join('\n'));

  var host = null;
  var timer = null;
  var offTasks = null;
  var data = {
    health: null, config: null, db: null, taskStats: null,
    queue: null, logs: null, schedules: null, errors: null
  };

  function t(key, vars) { return T.t('ov.' + key, vars); }

  var esc = T.esc;

  function stat(key, value, sub, tone) {
    return '<div class="stat"' + (tone ? ' data-tone="' + tone + '"' : '') + '>' +
      '<span class="stat__label">' + esc(t(key)) + '</span>' +
      '<span class="stat__value" data-stat="' + key + '">' + esc(value) + '</span>' +
      '<span class="stat__sub" data-stat-sub="' + key + '">' + esc(sub || '') + '</span>' +
      '</div>';
  }

  function markup() {
    return '' +
      '<div class="view-head">' +
        '<div class="view-head__text">' +
          '<h1 class="view-title">' + esc(t('title')) + '</h1>' +
          '<p class="view-sub">' + esc(t('sub')) + '</p>' +
        '</div>' +
        '<div class="view-head__actions ov-actions">' +
          '<button type="button" class="btn btn--primary btn--sm" data-go="/tasks">' + esc(t('quickDownload')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-go="/schedules">' + esc(t('quickSchedules')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-go="/logs">' + esc(t('quickLogs')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-role="refresh">' + esc(T.t('common.refresh')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="statstrip" data-role="stats">' +
        stat('queue', '—', '') + stat('tasks', '—', '') +
        stat('errors', '—', '') + stat('db', '—', '') +
      '</div>' +
      '<div class="ov-grid">' +
        '<section class="card">' +
          '<header class="card__head">' +
            '<h3 class="card__title">' + esc(t('recent')) + '</h3>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-go="/tasks">' + esc(t('viewAll')) + '</button>' +
          '</header>' +
          '<div data-role="recent"></div>' +
        '</section>' +
        '<section class="card">' +
          '<header class="card__head"><h3 class="card__title">' + esc(t('system')) + '</h3></header>' +
          '<div class="kv ov-sys" data-role="system"></div>' +
        '</section>' +
      '</div>';
  }

  function setStat(key, value, sub, tone) {
    var valueEl = host.querySelector('[data-stat="' + key + '"]');
    var subEl = host.querySelector('[data-stat-sub="' + key + '"]');
    var box = valueEl ? valueEl.parentNode : null;
    if (valueEl) valueEl.textContent = value;
    if (subEl) subEl.textContent = sub || '';
    if (box) {
      if (tone) box.setAttribute('data-tone', tone);
      else box.removeAttribute('data-tone');
    }
  }

  var fmtNum = T.fmtNum;

  function fetchAll() {
    var jobs = [
      T.api.get('/api/v1/health').then(function (d) { data.health = d; }).catch(function () { data.health = null; }),
      T.api.get('/api/v1/config').then(function (d) { data.config = d; }).catch(function () { data.config = null; }),
      T.api.get('/api/v1/db/stats').then(function (d) { data.db = d; }).catch(function () { data.db = null; }),
      T.api.get('/api/v1/tasks/stats').then(function (d) { data.taskStats = d; }).catch(function () { data.taskStats = null; }),
      T.api.get('/api/v1/queue/status').then(function (d) { data.queue = d; }).catch(function () { data.queue = null; }),
      T.api.get('/api/v1/logs/stats').then(function (d) { data.logs = d; }).catch(function () { data.logs = null; }),
      T.api.get('/api/v1/schedules/stats').then(function (d) { data.schedules = d; }).catch(function () { data.schedules = null; }),
      T.api.get('/api/v1/errors').then(function (d) { data.errors = d; }).catch(function () { data.errors = null; })
    ];
    return Promise.all(jobs).then(render);
  }

  function render() {
    if (!host) return;

    var q = data.queue || {};
    setStat('queue', fmtNum(q.queue_depth), t('queueSub', {
      active: fmtNum(q.active_jobs), pending: fmtNum(q.pending_jobs)
    }));

    var ts = data.taskStats || {};
    var failed = Number(ts.failed) || 0;
    setStat('tasks', fmtNum(ts.total), t('tasksSub', {
      done: fmtNum(ts.completed), failed: fmtNum(ts.failed)
    }));

    var errors = data.errors || { regular: {}, json: [] };
    var regularIds = errors.regular ? Object.keys(errors.regular).length : 0;
    var jsonSources = errors.json ? errors.json.length : 0;
    setStat('errors', String(regularIds + jsonSources), t('errorsSub', {
      users: fmtNum(regularIds), json: fmtNum(jsonSources)
    }), regularIds + jsonSources > 0 ? 'danger' : '');

    var db = data.db || {};
    setStat('db', fmtNum(db.users), t('dbSub', {
      lists: fmtNum(db.lsts),
      media: fmtNum((db.user_entities || 0) + (db.lst_entities || 0))
    }));

    renderSystem();
    renderRecent();
  }

  function renderSystem() {
    var box = host.querySelector('[data-role="system"]');
    if (!box) return;
    var health = data.health || {};
    var config = data.config || {};
    var logs = data.logs || {};
    var sched = data.schedules || {};
    var q = data.queue || {};
    var rows = [
      [t('health'), health.status ? String(health.status) : '—'],
      [t('version'), health.version ? String(health.version) : '—'],
      [t('root'), config.root_path ? String(config.root_path) : '—', true],
      [t('routines'), fmtNum(config.max_download_routine)],
      [t('fetchConcurrent'), fmtNum(config.max_user_fetch_concurrent)],
      [t('schedules'), t('schedulesSub', { enabled: fmtNum(sched.enabled), total: fmtNum(sched.total) })],
      [t('logs'), t('logsSub', { error: fmtNum(logs.error), warn: fmtNum(logs.warn) })]
    ];
    box.innerHTML = rows.map(function (row) {
      return '<div class="kv__row">' +
        '<span class="kv__key">' + esc(row[0]) + '</span>' +
        '<span class="kv__val mono small' + (row[2] ? ' ov-truncate' : '') + '" title="' + esc(row[1]) + '">' + esc(row[1]) + '</span>' +
        '</div>';
    }).join('');
  }

  function statusPill(status) {
    return '<span class="pill" data-status="' + esc(status) + '">' + esc(T.statusLabel ? T.statusLabel(status) : status) + '</span>';
  }

  function taskLabel(task) {
    if (T.taskTarget) return T.taskTarget(task);
    var d = task.data || {};
    return d.screen_name || d.list_id || d.screen_names || d.source_path || task.type || '—';
  }

  function shortTarget(value) {
    var text = String(value || '');
    var cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf(String.fromCharCode(92)));
    if (cut > 0 && cut < text.length - 1 && text.length - cut <= 48) return text.slice(cut + 1);
    return text;
  }

  function shortId(id) {
    var text = String(id || '');
    var stripped = text.replace(/^task[_-]/, '').replace(/-.*$/, '');
    return (stripped || text).slice(0, 8);
  }

  function renderRecent() {
    var box = host.querySelector('[data-role="recent"]');
    if (!box) return;
    var tasks = (T.state.tasks || []).slice(0, 7);
    if (!tasks.length) {
      box.innerHTML = '<div class="ov-empty">' +
        '<p class="ov-empty__title">' + esc(t('recentEmpty')) + '</p>' +
        '<p class="muted small">' + esc(t('recentEmptyHint')) + '</p>' +
        '<button type="button" class="btn btn--ghost btn--sm mt-8" data-go="/tasks">' + esc(t('goDownload')) + '</button>' +
        '</div>';
      return;
    }
    box.innerHTML = tasks.map(function (task) {
      var status = task.status || 'queued';
      var label = taskLabel(task);
      var created = task.created_at || task.started_at;
      return '<div class="lrow ov-row" tabindex="0" role="link" data-go="/tasks" data-status="' + esc(status) + '" title="' + esc(t('recentHint')) + '">' +
        '<span class="lrow__status">' + statusPill(status) + '</span>' +
        '<span class="lrow__target">' +
          '<span class="lrow__name" title="' + esc(label) + '">' + esc(shortTarget(label)) + '</span>' +
          '<span class="lrow__sub"><span>' + esc(T.typeLabel ? T.typeLabel(task.type) : (task.type || '')) + '</span>' +
            '<span class="sep" aria-hidden="true">·</span>' +
            '<span class="mono">' + esc(shortId(task.task_id)) + '</span></span>' +
        '</span>' +
        '<time class="lrow__time" title="' + esc(T.fmtTime(created)) + '">' + esc(T.fmtTime(created)) + '</time>' +
        '</div>';
    }).join('');
  }

  function refresh() {
    if (!host) return Promise.resolve();
    return fetchAll().catch(function () { /* 401 已由全局处理 */ });
  }

  function bind() {
    host.addEventListener('click', function (event) {
      var go = event.target.closest('[data-go]');
      if (go) { T.navigate(go.getAttribute('data-go')); return; }
      var refreshBtn = event.target.closest('[data-role="refresh"]');
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refresh().then(function () { refreshBtn.disabled = false; });
      }
    });
    host.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var row = event.target.closest('.ov-row');
      if (!row) return;
      event.preventDefault();
      T.navigate('/tasks');
    });
  }

  T.views.register('overview', {
    mount: function (target) {
      host = target;
      host.innerHTML = markup();
      bind();
      data.health = null;
      data.queue = null;
      refresh();
      timer = setInterval(refresh, 15000);
      offTasks = T.on('tasks', function () { renderRecent(); });
      return {
        refresh: refresh,
        destroy: function () {
          if (timer) clearInterval(timer);
          timer = null;
          if (offTasks) offTasks();
          offTasks = null;
          host = null;
        }
      };
    }
  });
})();
