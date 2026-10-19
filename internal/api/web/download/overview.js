/* TMD · 总览视图 */
(function () {
  'use strict';

  var T = window.TMD;
  if (!T) return;

  T.i18n.add({
    'zh-CN': {
      overview: {
        title: '总览', sub: '服务健康、队列与最近活动的集中视图',
        queue: '队列', tasks: '任务', errors: '失败记录', db: '数据库',
        queueSub: '运行 {active} · 待处理 {pending}', tasksSub: '完成 {done} · 失败 {failed}',
        errorsSub: '用户 {users} · JSON 源 {json}', dbSub: '列表 {lists} · 实体 {entities}',
        recent: '最近任务', recentEmpty: '还没有任务记录', viewAll: '查看全部',
        system: '系统概况', health: '服务健康', version: '版本', root: '根目录',
        routines: '下载并发', fetchConcurrent: '取用户并发', schedules: '计划任务',
        schedulesSub: '启用 {enabled} / 共 {total}', logs: '日志', logsSub: '错误 {error} · 警告 {warn}',
        queueNote: '队列深度 = 待处理 + 运行中 + 已分离'
      }
    },
    'en': {
      overview: {
        title: 'Overview', sub: 'Service health, queue pressure and recent activity in one place',
        queue: 'Queue', tasks: 'Tasks', errors: 'Failures', db: 'Database',
        queueSub: '{active} running · {pending} pending', tasksSub: '{done} done · {failed} failed',
        errorsSub: '{users} users · {json} JSON sources', dbSub: '{lists} lists · {entities} entities',
        recent: 'Recent tasks', recentEmpty: 'No tasks recorded yet', viewAll: 'View all',
        system: 'System', health: 'Health', version: 'Version', root: 'Root path',
        routines: 'Download concurrency', fetchConcurrent: 'User fetch concurrency', schedules: 'Schedules',
        schedulesSub: '{enabled} enabled / {total} total', logs: 'Logs', logsSub: '{error} errors · {warn} warnings',
        queueNote: 'Queue depth = pending + active + detached'
      }
    }
  });

  var host = null;
  var timer = null;
  var offTasks = null;
  var data = {
    health: null, config: null, db: null, taskStats: null,
    queue: null, logs: null, schedules: null, errors: null
  };

  function t(key, vars) { return T.t('overview.' + key, vars); }

  var esc = T.esc;

  function markup() {
    return '' +
      '<div class="view-head">' +
        '<div class="view-head__text">' +
          '<h1 class="view-title">' + esc(t('title')) + '</h1>' +
          '<p class="view-sub">' + esc(t('sub')) + '</p>' +
        '</div>' +
        '<div class="view-head__actions">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-role="refresh">' + esc(T.t('common.refresh')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="grid-4" data-role="kpis">' +
        kpi('queue', '—', '—') + kpi('tasks', '—', '—') +
        kpi('errors', '—', '—') + kpi('db', '—', '—') +
      '</div>' +
      '<div class="grid-2 mt-16">' +
        '<section class="card">' +
          '<header class="card__head">' +
            '<h3 class="card__title">' + esc(t('recent')) + '</h3>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-go="/tasks">' + esc(t('viewAll')) + '</button>' +
          '</header>' +
          '<div data-role="recent"></div>' +
        '</section>' +
        '<section class="card">' +
          '<header class="card__head"><h3 class="card__title">' + esc(t('system')) + '</h3></header>' +
          '<div class="stack" data-role="system"></div>' +
        '</section>' +
      '</div>';
  }

  function kpi(key, value, sub) {
    return '<div class="kpi">' +
      '<div class="kpi__label">' + esc(t(key)) + '</div>' +
      '<div class="kpi__value" data-kpi="' + key + '">' + esc(value) + '</div>' +
      '<div class="kpi__sub" data-kpi-sub="' + key + '">' + esc(sub) + '</div>' +
      '</div>';
  }

  function setKpi(key, value, sub) {
    var valueEl = host.querySelector('[data-kpi="' + key + '"]');
    var subEl = host.querySelector('[data-kpi-sub="' + key + '"]');
    if (valueEl) valueEl.textContent = value;
    if (subEl) subEl.textContent = sub || '';
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
    var depth = Number(q.queue_depth) || 0;
    setKpi('queue', fmtNum(depth), t('queueSub', {
      active: fmtNum(q.active_jobs), pending: fmtNum(q.pending_jobs)
    }));

    var ts = data.taskStats || {};
    setKpi('tasks', fmtNum(ts.total), t('tasksSub', {
      done: fmtNum(ts.completed), failed: fmtNum(ts.failed)
    }));

    var errors = data.errors || { regular: {}, json: [] };
    var regularIds = errors.regular ? Object.keys(errors.regular).length : 0;
    var jsonSources = errors.json ? errors.json.length : 0;
    setKpi('errors', String(regularIds + jsonSources), t('errorsSub', {
      users: fmtNum(regularIds), json: fmtNum(jsonSources)
    }));

    var db = data.db || {};
    setKpi('db', fmtNum(db.users), t('dbSub', { lists: fmtNum(db.lsts), entities: fmtNum(db.user_entities) }));

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
    var rows = [
      [t('health'), health.status ? String(health.status) : '—'],
      [t('version'), health.version ? String(health.version) : '—'],
      [t('root'), config.root_path ? String(config.root_path) : '—'],
      [t('routines'), fmtNum(config.max_download_routine)],
      [t('fetchConcurrent'), fmtNum(config.max_user_fetch_concurrent)],
      [t('schedules'), t('schedulesSub', { enabled: fmtNum(sched.enabled), total: fmtNum(sched.total) })],
      [t('logs'), t('logsSub', { error: fmtNum(logs.error), warn: fmtNum(logs.warn) })],
      [t('queue'), t('queueNote')]
    ];
    box.innerHTML = rows.map(function (row) {
      return '<div class="row-flex" style="justify-content:space-between;gap:16px">' +
        '<span class="muted small">' + esc(row[0]) + '</span>' +
        '<span class="mono small" style="text-align:right;word-break:break-all">' + esc(row[1]) + '</span>' +
        '</div>';
    }).join('');
  }

  function statusBadge(status) {
    var map = { queued: 'badge', running: 'badge badge--info', completed: 'badge badge--ok', failed: 'badge badge--danger', cancelled: 'badge badge--warn' };
    var text = T.statusLabel ? T.statusLabel(status) : status;
    return '<span class="' + (map[status] || 'badge') + '">' + esc(text) + '</span>';
  }

  function taskLabel(task) {
    if (T.taskTarget) return T.taskTarget(task);
    var d = task.data || {};
    return d.screen_name || d.list_id || d.screen_names || d.source_path || task.type || '—';
  }

  function renderRecent() {
    var box = host.querySelector('[data-role="recent"]');
    if (!box) return;
    var tasks = (T.state.tasks || []).slice(0, 8);
    if (!tasks.length) {
      box.innerHTML = '<p class="empty">' + esc(t('recentEmpty')) + '</p>';
      return;
    }
    var rows = tasks.map(function (task) {
      var label = taskLabel(task);
      return '<tr>' +
        '<td>' + statusBadge(task.status || 'queued') + '</td>' +
        '<td class="table__num small muted">' + esc(T.typeLabel ? T.typeLabel(task.type) : (task.type || '')) + '</td>' +
        '<td class="table__cell-wrap mono small">' + esc(label) + '</td>' +
        '<td class="table__num small muted">' + esc(T.fmtTime(task.created_at)) + '</td>' +
        '</tr>';
    }).join('');
    box.innerHTML = '<div class="tablewrap"><table class="table">' +
      '<thead><tr><th>Status</th><th>Type</th><th>Target</th><th>Created</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
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
