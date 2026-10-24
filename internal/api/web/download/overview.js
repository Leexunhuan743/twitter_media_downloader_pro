/* TMD · 总览视图：快速下载 + 可点击状态条 + 最近任务 + 失败/计划/系统概况 */
(function () {
  'use strict';

  var T = window.TMD;
  if (!T) return;

  T.i18n.add({
    'zh-CN': {
      ov: {
        title: '总览',
        sub: '一眼看清服务状态与队列压力，常用操作不用切页：粘贴目标即可开始下载。',
        quickTitle: '快速下载',
        quickSub: '粘贴 @handle、x.com 链接或列表 id，回车即入队；更多选项在下载页。',
        quickPlaceholder: '@nasa、https://x.com/elonmusk、1234567890',
        quickGo: '开始下载',
        quickBusy: '提交中…',
        quickHint: '支持空格或换行分隔多个目标',
        quickEmpty: '先粘贴一个目标',
        quickClipboardUnsupported: '当前环境无法读取剪贴板，请手动粘贴',
        quickClipboardDenied: '剪贴板读取被拒绝，请手动粘贴',
        quickClipboardEmpty: '剪贴板里没有可用的目标',
        quickBad: '{n} 个目标无法识别',
        quickJson: 'JSON 文件请到下载页以文件方式上传',
        quickTooMany: '一次最多 {n} 个目标',
        quickOk: '已入队：{names}',
        quickPartial: '入队 {ok} 个，失败 {fail} 个',
        refresh: '刷新',
        updated: '更新于 {time}',
        stale: '刷新失败，显示的是上一次数据',
        retry: '重试',
        statQueue: '队列',
        statQueueSub: '运行 {active} · 等待 {pending}',
        statTasks: '任务',
        statTasksSub: '完成 {done} · 失败 {failed}',
        statErrors: '失败记录',
        statErrorsSub: '账号 {users} · JSON 源 {json}',
        statDb: '库',
        statDbSub: '用户 {users} · 媒体 {media}',
        recent: '最近任务',
        recentHint: '点行打开详情，行内可直接取消或重试',
        recentEmpty: '还没有任务记录',
        recentEmptyHint: '在上面粘贴 @handle 或 x.com 链接开始第一个下载。',
        viewAll: '查看全部',
        failures: '失败记录',
        failuresEmpty: '没有失败记录',
        failuresMore: '另有 {n} 条',
        failuresAll: '查看明细',
        failuresRetry: '全部重试',
        failuresClear: '清除',
        schedules: '接下来的计划',
        schedulesEmpty: '没有启用的计划任务',
        schedulesEmptyHint: '在计划页新建并启用计划后，下次运行时间会显示在这里。',
        schedulesAll: '管理计划',
        systems: '系统概况',
        sysHealth: '服务',
        sysVersion: '版本',
        sysRoot: '根目录',
        sysRoutines: '下载并发',
        sysFetch: '取用户并发',
        sysQueue: '队列深度',
        sysLogs: '日志',
        sysLogsValue: '错误 {error} · 警告 {warn}',
        sysSchedules: '计划',
        sysSchedulesValue: '{enabled} / {total} 启用',
        openTask: '详情',
        cancelTask: '取消',
        retryTask: '重试',
        removeFailed: '清除失败记录？失败会持续累积。',
        purged: '失败记录已清除',
        retryQueued: '失败项重试任务已入队',
        nextAt: '{when}',
        noNext: '未排期',
        a11yStat: '前往 {name}'
      }
    },
    'en': {
      ov: {
        title: 'Overview',
        sub: 'Service state and queue pressure at a glance; common actions without switching pages.',
        quickTitle: 'Quick download',
        quickSub: 'Paste a handle, an x.com link or a list id; Enter queues it. More options on the download page.',
        quickPlaceholder: '@nasa, https://x.com/elonmusk, 1234567890',
        quickGo: 'Start download',
        quickBusy: 'Submitting…',
        quickHint: 'Separate multiple targets with spaces or newlines',
        quickEmpty: 'Paste a target first',
        quickClipboardUnsupported: 'Clipboard is unavailable here; paste manually',
        quickClipboardDenied: 'Clipboard access was denied; paste manually',
        quickClipboardEmpty: 'No usable target in the clipboard',
        quickBad: '{n} target(s) not recognised',
        quickJson: 'Upload JSON files on the download page instead',
        quickTooMany: 'At most {n} targets at once',
        quickOk: 'Queued: {names}',
        quickPartial: '{ok} queued, {fail} failed',
        refresh: 'Refresh',
        updated: 'Updated {time}',
        stale: 'Refresh failed; showing the previous snapshot',
        retry: 'Retry',
        statQueue: 'Queue',
        statQueueSub: '{active} running · {pending} waiting',
        statTasks: 'Tasks',
        statTasksSub: '{done} done · {failed} failed',
        statErrors: 'Failures',
        statErrorsSub: '{users} accounts · {json} JSON sources',
        statDb: 'Library',
        statDbSub: '{users} users · {media} media',
        recent: 'Recent tasks',
        recentHint: 'Click a row for details; cancel or retry inline',
        recentEmpty: 'No tasks recorded yet',
        recentEmptyHint: 'Paste a handle or an x.com link above to start the first download.',
        viewAll: 'View all',
        failures: 'Failure log',
        failuresEmpty: 'No failures recorded',
        failuresMore: '{n} more',
        failuresAll: 'See details',
        failuresRetry: 'Retry all',
        failuresClear: 'Clear',
        schedules: 'Next up',
        schedulesEmpty: 'No enabled schedules',
  schedulesEmptyHint: 'Create and enable a schedule on the schedules page; upcoming runs will appear here.',
        schedulesAll: 'Manage schedules',
        systems: 'System',
        sysHealth: 'Service',
        sysVersion: 'Version',
        sysRoot: 'Root path',
        sysRoutines: 'Download concurrency',
        sysFetch: 'User fetch concurrency',
        sysQueue: 'Queue depth',
        sysLogs: 'Logs',
        sysLogsValue: '{error} errors · {warn} warnings',
        sysSchedules: 'Schedules',
        sysSchedulesValue: '{enabled} / {total} enabled',
        openTask: 'Details',
        cancelTask: 'Cancel',
        retryTask: 'Retry',
        removeFailed: 'Clear the failure log? It keeps growing until you do.',
        purged: 'Failure log cleared',
        retryQueued: 'Retry-all task queued',
        nextAt: '{when}',
        noNext: 'not scheduled',
        a11yStat: 'Go to {name}'
      }
    }
  });

  var STYLE_ID = 'view-overview-style';
  T.injectStyle(STYLE_ID, [
    '.ov-hero { display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; margin-bottom: 14px; }',
    '.ov-hero__text { display: flex; flex-direction: column; gap: 2px; }',
    '.ov-hero__text p { margin: 0; }',
    '.ov-quick { display: flex; gap: 8px; align-items: stretch; }',
    '.ov-quick__input { flex: 1 1 auto; min-width: 0; min-height: 40px; font-size: 14px; }',
    '.ov-quick__hint { margin: 0; color: var(--muted); font-size: 12px; }',
    '.ov-quick__hint[data-tone="good"] { color: var(--ok); }',
    '.ov-quick__hint[data-tone="bad"] { color: var(--danger); }',
    '.ov-stats { margin-bottom: 14px; }',
    '.stat--link { text-decoration: none; color: inherit; cursor: pointer; }',
    '.stat--link:hover { background: var(--surface-2); }',
    '.stat--link:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }',
    '.stat__arrow { margin-left: auto; color: var(--muted); font-size: 12px; }',
    '.ov-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 16px; align-items: start; }',
    '.ov-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }',
    '.ov-updated { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }',
    '.ov-stale { margin: 0 0 12px; }',
    '.ov-row.lrow { grid-template-columns: 78px minmax(0, 1fr) 128px 78px 88px; }',
    '.ov-row__acts { display: flex; justify-content: flex-end; gap: 2px; }',
    '.ov-row__acts .btn { padding: 3px 7px; border-color: transparent; background: transparent; color: var(--muted); font-size: 12px; }',
    '.ov-row__acts .btn:hover:not(:disabled) { background: var(--surface-3); color: var(--text); }',
    '.ov-row { cursor: pointer; }',
    '.ov-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }',
    '.ov-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 24px 16px; border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); text-align: center; }',
    '.ov-empty p { margin: 0; }',
    '.ov-empty__title { color: var(--text-soft); font-size: 13.5px; font-weight: 600; }',
    '.ov-fail { display: flex; flex-direction: column; }',
    '.ov-fail__row { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-top: 1px solid var(--border); font-size: 12.5px; }',
    '.ov-fail__row:first-child { border-top: 0; }',
    '.ov-fail__name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.ov-fail__count { color: var(--danger); font-variant-numeric: tabular-nums; }',
    '.ov-fail__foot { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--border); flex-wrap: wrap; }',
    '.ov-sched { display: flex; flex-direction: column; }',
    '.ov-sched__row { display: flex; align-items: baseline; gap: 8px; padding: 8px 14px; border-top: 1px solid var(--border); font-size: 12.5px; }',
    '.ov-sched__row:first-child { border-top: 0; }',
    '.ov-sched__name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.ov-sched__when { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.ov-sys .kv__row { padding: 8px 12px; }',
    '.ov-sys .kv__val { max-width: 62%; }',
    '.ov-truncate { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }',
    '.mt-12 { margin-top: 12px; }',
    '@media (max-width: 900px) { .ov-grid { grid-template-columns: minmax(0, 1fr); } }',
    '@media (max-width: 720px) {',
    '  .ov-quick { flex-wrap: wrap; }',
    '  .ov-quick .btn { width: 100%; }',
    '  .ov-row.lrow { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "status time" "target target" "prog prog" "actions actions"; }',
    '  .ov-row .lrow__status { grid-area: status; }',
    '  .ov-row .lrow__time { grid-area: time; text-align: right; }',
    '  .ov-row .lrow__target { grid-area: target; }',
    '  .ov-row .lrow__prog { grid-area: prog; }',
    '  .ov-row__acts { grid-area: actions; justify-content: flex-start; }',
    '}'
  ].join('\n'));

  var host = null;
  var timer = null;
  var offTasks = null;
  var quickBusy = false;
  var data = {
    health: null, config: null, db: null, taskStats: null, queue: null,
    logs: null, schedules: null, scheduleEntries: null, errors: null,
    failed: 0, updatedAt: 0
  };

  var esc = T.esc;
  function t(key, vars) { return T.t('ov.' + key, vars); }
  var fmtNum = T.fmtNum;

  function relTime(iso) {
    if (!iso) return '—';
    var ms = Date.parse(iso);
    if (!isFinite(ms)) return '—';
    var diff = ms - Date.now();
    var abs = Math.abs(diff);
    var future = diff > 0;
    var text;
    if (abs < 60000) text = future ? 'in <1m' : '<1m';
    else if (abs < 3600000) text = Math.round(abs / 60000) + 'm';
    else if (abs < 86400000) text = Math.round(abs / 3600000) + 'h';
    else text = Math.round(abs / 86400000) + 'd';
    return future ? '+ ' + text : text;
  }

  function statusPill(status) {
    return '<span class="pill" data-status="' + esc(status) + '">' + esc(T.statusLabel(status)) + '</span>';
  }

  function progressOf(task) {
    var p = task.progress || {};
    var total = Number(p.total) || 0;
    var done = (Number(p.completed) || 0) + (Number(p.failed) || 0);
    var percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
    return { total: total, done: done, failed: Number(p.failed) || 0, stage: p.stage || '', percent: percent, current: p.current || '' };
  }

  function statLink(key, go, value, sub, tone, name) {
    return '<a class="stat stat--link"' + (tone ? ' data-tone="' + tone + '"' : '') +
      ' href="' + esc(go.path) + '" data-go="' + esc(go.path) + '"' +
      (go.status ? ' data-filter="' + esc(go.status) + '"' : '') +
      (go.errors ? ' data-errors="1"' : '') +
      ' aria-label="' + esc(t('a11yStat', { name: name })) + '">' +
      '<span class="stat__label">' + esc(name) + '</span>' +
      '<span class="stat__value" data-stat="' + key + '">' + esc(value) + '</span>' +
      '<span class="stat__sub" data-stat-sub="' + key + '">' + esc(sub) + '</span>' +
      '<span class="stat__arrow" aria-hidden="true">→</span>' +
      '</a>';
  }

  function markup() {
    return '' +
      '<div class="view-head">' +
        '<div class="view-head__text">' +
          '<h1 class="view-title">' + esc(t('title')) + '</h1>' +
          '<p class="view-sub">' + esc(t('sub')) + '</p>' +
        '</div>' +
        '<div class="view-head__actions">' +
          '<span class="ov-updated" id="ov-updated"></span>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-role="refresh">' + esc(t('refresh')) + '</button>' +
        '</div>' +
      '</div>' +
      '<p class="notice notice--warn ov-stale" id="ov-stale" hidden></p>' +
      '<section class="card ov-hero">' +
        '<div class="ov-hero__text">' +
          '<h2 class="card__title">' + esc(t('quickTitle')) + '</h2>' +
          '<p class="muted small">' + esc(t('quickSub')) + '</p>' +
        '</div>' +
        '<form class="ov-quick" id="ov-quick-form" novalidate>' +
          '<input class="input ov-quick__input" id="ov-quick-input" autocomplete="off" spellcheck="false" placeholder="' + esc(t('quickPlaceholder')) + '" aria-label="' + esc(t('quickTitle')) + '">' +
          '<button type="submit" class="btn btn--primary" id="ov-quick-go">' + esc(t('quickGo')) + '</button>' +
        '</form>' +
        '<p class="ov-quick__hint" id="ov-quick-hint" aria-live="polite">' + esc(t('quickHint')) + '</p>' +
      '</section>' +
      '<div class="statstrip ov-stats" data-role="stats">' +
        statLink('queue', { path: '/tasks', status: 'active' }, '—', '', '', t('statQueue')) +
        statLink('tasks', { path: '/tasks' }, '—', '', '', t('statTasks')) +
        statLink('errors', { path: '/tasks', status: 'failed', errors: true }, '—', '', '', t('statErrors')) +
        statLink('db', { path: '/data' }, '—', '', '', t('statDb')) +
      '</div>' +
      '<div class="ov-grid">' +
        '<section class="card">' +
          '<header class="card__head">' +
            '<h3 class="card__title">' + esc(t('recent')) + '</h3>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-go="/tasks">' + esc(t('viewAll')) + '</button>' +
          '</header>' +
          '<div data-role="recent"></div>' +
        '</section>' +
        '<div class="ov-side">' +
          '<section class="card" data-role="failures-card" hidden>' +
            '<header class="card__head"><h3 class="card__title">' + esc(t('failures')) + '</h3></header>' +
            '<div class="ov-fail" data-role="failures"></div>' +
          '</section>' +
          '<section class="card">' +
            '<header class="card__head">' +
              '<h3 class="card__title">' + esc(t('schedules')) + '</h3>' +
              '<button type="button" class="btn btn--ghost btn--sm" data-go="/schedules">' + esc(t('schedulesAll')) + '</button>' +
            '</header>' +
            '<div class="ov-sched" data-role="schedules"></div>' +
          '</section>' +
        '</div>' +
      '</div>' +
      '<section class="card mt-12">' +
        '<header class="card__head"><h3 class="card__title">' + esc(t('systems')) + '</h3></header>' +
        '<div class="kv ov-sys" data-role="system"></div>' +
      '</section>';
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

  function fetchJSON(path, key) {
    return T.api.get(path).then(function (d) { data[key] = d; }, function () { data[key] = null; data.failed += 1; });
  }

  function fetchAll() {
    data.failed = 0;
    return Promise.all([
      fetchJSON('/api/v1/health', 'health'),
      fetchJSON('/api/v1/config', 'config'),
      fetchJSON('/api/v1/db/stats', 'db'),
      fetchJSON('/api/v1/tasks/stats', 'taskStats'),
      fetchJSON('/api/v1/queue/status', 'queue'),
      fetchJSON('/api/v1/logs/stats', 'logs'),
      fetchJSON('/api/v1/schedules/stats', 'schedules'),
      fetchJSON('/api/v1/schedules', 'scheduleEntries'),
      fetchJSON('/api/v1/errors', 'errors')
    ]).then(function () {
      data.updatedAt = Date.now();
      render();
    });
  }

  function render() {
    if (!host) return;
    var stale = host.querySelector('#ov-stale');
    if (stale) stale.hidden = data.failed === 0;
    var updated = host.querySelector('#ov-updated');
    if (updated && data.updatedAt) {
      updated.textContent = t('updated', {
        time: new Date(data.updatedAt).toLocaleTimeString(T.state && T.state.lang === 'en' ? 'en' : 'zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });
    }

    var q = data.queue || {};
    setStat('queue', fmtNum(q.queue_depth), t('statQueueSub', {
      active: fmtNum(q.active_jobs), pending: fmtNum(q.pending_jobs)
    }), Number(q.active_jobs) > 0 ? 'ok' : '');

    var ts = data.taskStats || {};
    setStat('tasks', fmtNum(ts.total), t('statTasksSub', {
      done: fmtNum(ts.completed), failed: fmtNum(ts.failed)
    }), Number(ts.failed) > 0 ? 'warn' : '');

    var errors = data.errors || { regular: {}, json: [] };
    var regularIds = errors.regular ? Object.keys(errors.regular).length : 0;
    var jsonSources = errors.json ? errors.json.length : 0;
    var errTotal = regularIds + jsonSources;
    setStat('errors', String(errTotal), t('statErrorsSub', {
      users: fmtNum(regularIds), json: fmtNum(jsonSources)
    }), errTotal > 0 ? 'danger' : '');

    var db = data.db || {};
    setStat('db', fmtNum(db.users), t('statDbSub', {
      users: fmtNum(db.users),
      media: fmtNum((db.user_entities || 0) + (db.lst_entities || 0))
    }));

    renderSystem();
    renderRecent();
    renderFailures(errors, regularIds, jsonSources);
    renderSchedules();
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
      [t('sysHealth'), health.status ? String(health.status) : '—'],
      [t('sysVersion'), health.version ? String(health.version) : '—'],
      [t('sysRoot'), config.root_path ? String(config.root_path) : '—', true],
      [t('sysRoutines'), fmtNum(config.max_download_routine)],
      [t('sysFetch'), fmtNum(config.max_user_fetch_concurrent)],
      [t('sysQueue'), fmtNum(q.queue_depth)],
      [t('sysSchedules'), t('sysSchedulesValue', { enabled: fmtNum(sched.enabled), total: fmtNum(sched.total) })],
      [t('sysLogs'), t('sysLogsValue', { error: fmtNum(logs.error), warn: fmtNum(logs.warn) })]
    ];
    box.innerHTML = rows.map(function (row) {
      return '<div class="kv__row">' +
        '<span class="kv__key">' + esc(row[0]) + '</span>' +
        '<span class="kv__val mono small' + (row[2] ? ' ov-truncate' : '') + '" title="' + esc(row[1]) + '">' + esc(row[1]) + '</span>' +
        '</div>';
    }).join('');
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
    var tasks = (T.state.tasks || []).slice(0, 4);
    if (!tasks.length) {
      box.innerHTML = '<div class="ov-empty">' +
        '<p class="ov-empty__title">' + esc(t('recentEmpty')) + '</p>' +
        '<p class="muted small">' + esc(t('recentEmptyHint')) + '</p>' +
        '</div>';
      return;
    }
    box.innerHTML = tasks.map(function (task) {
      var status = task.status || 'queued';
      var label = T.taskTarget(task);
      var created = task.created_at || task.started_at;
      var progress = progressOf(task);
      var running = status === 'running';
      var queued = status === 'queued';
      var failed = status === 'failed' || status === 'cancelled';
      var progText = queued ? T.t('ticket.waiting') : (progress.total > 0
        ? T.t('metric.progress', { done: progress.done, total: progress.total })
        : (progress.stage ? T.t('stage.' + progress.stage) === 'stage.' + progress.stage ? progress.stage : T.t('stage.' + progress.stage) : T.statusLabel(status)));
      var bar = running || progress.total > 0
        ? '<span class="metabar' + (progress.percent === null && running ? ' metabar--indeterminate' : '') + '" data-status="' + esc(status) + '"><i style="width:' + (progress.percent === null ? 0 : progress.percent) + '%"></i></span>'
        : '';
      var acts = '<button type="button" class="btn" data-task-act="detail" data-id="' + esc(task.task_id) + '">' + esc(t('openTask')) + '</button>';
      if (running || queued) acts += '<button type="button" class="btn" data-task-act="cancel" data-id="' + esc(task.task_id) + '">' + esc(t('cancelTask')) + '</button>';
      if (failed) acts += '<button type="button" class="btn" data-task-act="retry" data-id="' + esc(task.task_id) + '">' + esc(t('retryTask')) + '</button>';
      return '<div class="lrow ov-row" tabindex="0" role="link" data-status="' + esc(status) + '" data-id="' + esc(task.task_id) + '" title="' + esc(t('recentHint')) + '">' +
        '<span class="lrow__status">' + statusPill(status) + '</span>' +
        '<span class="lrow__target">' +
          '<span class="lrow__name" title="' + esc(label) + '">' + esc(shortTarget(label)) + '</span>' +
          '<span class="lrow__sub"><span>' + esc(T.typeLabel(task.type)) + '</span>' +
            '<span class="sep" aria-hidden="true">·</span>' +
            '<span class="mono">' + esc(shortId(task.task_id)) + '</span></span>' +
        '</span>' +
        '<span class="lrow__prog">' + bar + '<span class="lrow__progtxt">' + esc(progText) + '</span></span>' +
        '<time class="lrow__time" title="' + esc(T.fmtTime(created)) + '">' + esc(relTime(created)) + '</time>' +
        '<span class="ov-row__acts">' + acts + '</span>' +
        '</div>';
    }).join('');
  }

  function renderFailures(errors, regularIds, jsonSources) {
    var card = host.querySelector('[data-role="failures-card"]');
    var box = host.querySelector('[data-role="failures"]');
    if (!card || !box) return;
    var rows = [];
    var regular = errors.regular || {};
    Object.keys(regular).sort(function (a, b) { return (regular[b] || 0) - (regular[a] || 0); }).slice(0, 4).forEach(function (id) {
      rows.push('<div class="ov-fail__row"><span class="ov-fail__name mono" title="' + esc(id) + '">' + esc(id) + '</span>' +
        '<span class="ov-fail__count">' + fmtNum(regular[id]) + '</span></div>');
    });
    (errors.json || []).slice(0, 3).forEach(function (item) {
      var name = String(item.source_path || '').split(/[\\/]/).pop() || String(item.source_path || '');
      rows.push('<div class="ov-fail__row"><span class="ov-fail__name" title="' + esc(item.source_path || '') + '">' + esc(name) + '</span>' +
        '<span class="ov-fail__count">' + fmtNum(item.count) + '</span></div>');
    });
    card.hidden = rows.length === 0;
    if (!rows.length) return;
    var more = (regularIds + jsonSources) - (Math.min(4, regularIds) + Math.min(3, jsonSources));
    box.innerHTML = rows.join('') +
      (more > 0 ? '<div class="ov-fail__row muted small">' + esc(t('failuresMore', { n: more })) + '</div>' : '') +
      '<div class="ov-fail__foot">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-role="errors-open">' + esc(t('failuresAll')) + '</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-role="errors-retry">' + esc(t('failuresRetry')) + '</button>' +
        '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-role="errors-clear">' + esc(t('failuresClear')) + '</button>' +
      '</div>';
  }

  function renderSchedules() {
    var box = host.querySelector('[data-role="schedules"]');
    if (!box) return;
    var entries = (data.scheduleEntries && data.scheduleEntries.entries) || [];
    var upcoming = entries.filter(function (item) { return item.entry && item.entry.enabled; })
      .sort(function (a, b) {
        var am = a.next_run_at ? Date.parse(a.next_run_at) : Infinity;
        var bm = b.next_run_at ? Date.parse(b.next_run_at) : Infinity;
        return am - bm;
      }).slice(0, 4);
    if (!upcoming.length) {
      box.innerHTML = '<div class="ov-empty">' +
        '<p class="ov-empty__title">' + esc(t('schedulesEmpty')) + '</p>' +
        '<p class="muted small">' + esc(t('schedulesEmptyHint')) + '</p></div>';
      return;
    }
    box.innerHTML = upcoming.map(function (item) {
      var entry = item.entry || {};
      var when = item.next_run_at ? relTime(item.next_run_at) : t('noNext');
      return '<div class="ov-sched__row">' +
        '<span class="ov-sched__name" title="' + esc(entry.name || entry.id || '') + '">' + esc(entry.name || entry.id || '—') + '</span>' +
        '<span class="muted small">' + esc(item.schedule_display || entry.schedule || '') + '</span>' +
        '<span class="ov-sched__when" title="' + esc(T.fmtTime(item.next_run_at)) + '">' + esc(when) + '</span>' +
        '</div>';
    }).join('');
  }

  /* ---------------- 快速下载 ---------------- */

  function quickHint(text, tone) {
    var hint = host.querySelector('#ov-quick-hint');
    if (!hint) return;
    hint.textContent = text;
    if (tone) hint.setAttribute('data-tone', tone);
    else hint.removeAttribute('data-tone');
  }

  function setQuickBusy(on) {
    quickBusy = on;
    var input = host.querySelector('#ov-quick-input');
    var btn = host.querySelector('#ov-quick-go');
    if (input) input.disabled = on;
    if (btn) {
      btn.disabled = on;
      btn.textContent = on ? t('quickBusy') : t('quickGo');
    }
  }

  function requestFor(item) {
    if (item.kind === 'user') return { path: '/api/v1/users/' + encodeURIComponent(item.value) + '/download', label: item.value };
    if (item.kind === 'list') return { path: '/api/v1/lists/' + encodeURIComponent(item.value) + '/download', label: 'list ' + item.value };
    return null;
  }

  // 剪贴板兜底的三种失败各有专属文案：不支持（非安全上下文）、被拒绝、内容为空。
  function readClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return Promise.reject({ empty: false, unsupported: true });
    return navigator.clipboard.readText().then(function (value) {
      return { empty: !String(value || '').trim(), text: String(value || '').trim() };
    }, function () { return Promise.reject({ empty: false, denied: true }); });
  }

  function submitQuick(event) {
    if (event) event.preventDefault();
    if (quickBusy) return;
    var input = host.querySelector('#ov-quick-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) {
      // 空输入时尝试读剪贴板；读取期间用户手动输入则不覆盖。
      setQuickBusy(true);
      readClipboard().then(function (result) {
        setQuickBusy(false);
        if (result.empty) { quickHint(t('quickClipboardEmpty'), 'bad'); return; }
        if (!input.value.trim()) {
          input.value = result.text;
          submitQuick(null);
        }
      }, function (reason) {
        setQuickBusy(false);
        quickHint(reason.unsupported ? t('quickClipboardUnsupported') : t('quickClipboardDenied'), 'bad');
      });
      return;
    }
    var items = T.parseTargets(text);
    var bad = items.filter(function (item) { return item.kind === 'bad'; });
    if (bad.length) { quickHint(t('quickBad', { n: bad.length }), 'bad'); return; }
    var json = items.filter(function (item) { return item.kind === 'json'; });
    if (json.length) { quickHint(t('quickJson'), 'bad'); return; }
    if (items.length > 20) { quickHint(t('quickTooMany', { n: 20 }), 'bad'); return; }

    setQuickBusy(true);
    quickHint(t('quickBusy'));
    var ok = 0;
    var failed = 0;
    var lastError = '';
    var chain = Promise.resolve();
    items.forEach(function (item) {
      chain = chain.then(function () {
        var req = requestFor(item);
        if (!req) { failed += 1; return; }
        return T.api.post(req.path, {}).then(function () { ok += 1; }, function (err) {
          failed += 1;
          if (!lastError) lastError = err.message;
        });
      });
    });
    chain.then(function () {
      setQuickBusy(false);
      if (ok > 0) {
        input.value = '';
        quickHint(failed ? t('quickPartial', { ok: ok, fail: failed }) : t('quickOk', {
          names: items.slice(0, 3).map(function (item) { return item.value; }).join(', ') + (items.length > 3 ? ' …' : '')
        }), failed ? 'bad' : 'good');
        T.toast(failed ? 'info' : 'success', failed ? t('quickPartial', { ok: ok, fail: failed }) : T.t('toast.queuedN', { n: ok }));
        T.reload().catch(function () { });
      } else {
        quickHint(lastError || t('quickBad', { n: items.length }), 'bad');
      }
    });
  }

  /* ---------------- 行内操作 ---------------- */

  function updateRowActs(id, busy) {
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('[data-task-act][data-id]'), function (btn) {
      if (btn.getAttribute('data-id') !== id) return;
      btn.disabled = busy;
    });
  }

  function cancelTask(id) {
    updateRowActs(id, true);
    T.api.post('/api/v1/tasks/' + encodeURIComponent(id) + '/cancel').then(function () {
      T.toast('success', T.t('toast.cancelled'));
      return T.reload();
    }, function (err) {
      if (err.status !== 401) T.toast('error', err.message);
    }).then(function () { updateRowActs(id, false); });
  }

  function retryTask(id) {
    updateRowActs(id, true);
    T.api.post('/api/v1/tasks/' + encodeURIComponent(id) + '/retry').then(function () {
      T.toast('success', T.t('toast.retried'));
      return T.reload();
    }, function (err) {
      if (err.status !== 401) T.toast('error', err.message);
    }).then(function () { updateRowActs(id, false); });
  }

  function retryAllErrors() {
    T.api.post('/api/v1/errors/retry').then(function () {
      T.toast('success', T.t('toast.retryAll'));
      return refresh();
    }, function (err) { if (err.status !== 401) T.toast('error', err.message); });
  }

  function clearErrors() {
    if (!window.confirm(t('removeFailed'))) return;
    T.api.del('/api/v1/errors').then(function () {
      T.toast('success', t('purged'));
      return refresh();
    }, function (err) { if (err.status !== 401) T.toast('error', err.message); });
  }

  function refresh() {
    if (!host) return Promise.resolve();
    return fetchAll().catch(function () { /* 401 已由全局处理 */ });
  }

  function goTarget(link) {
    var path = link.getAttribute('data-go');
    if (!path) return;
    if (path === '/tasks') T.showTasks({});
    else if (path.indexOf('/tasks') === 0) T.showTasks({ status: 'active' });
    else T.navigate(path);
  }

  function openStat(stat) {
    var path = stat.getAttribute('data-go') || '';
    if (path !== '/tasks') { T.navigate(path); return; }
    T.showTasks({
      status: stat.getAttribute('data-filter') || 'all',
      errors: stat.hasAttribute('data-errors')
    });
  }

  function bind() {
    host.addEventListener('click', function (event) {
      var stat = event.target.closest('.stat--link');
      if (stat) {
        event.preventDefault();
        openStat(stat);
        return;
      }
      var go = event.target.closest('[data-go]');
      if (go) { T.navigate(go.getAttribute('data-go')); return; }
      var act = event.target.closest('[data-task-act]');
      if (act) {
        event.stopPropagation();
        var action = act.getAttribute('data-task-act');
        var id = act.getAttribute('data-id');
        if (action === 'detail') T.openTaskDetail(id);
        else if (action === 'cancel') cancelTask(id);
        else if (action === 'retry') retryTask(id);
        return;
      }
      var role = event.target.closest('[data-role]');
      if (role) {
        var kind = role.getAttribute('data-role');
        if (kind === 'refresh') {
          role.disabled = true;
          refresh().then(function () { role.disabled = false; });
        } else if (kind === 'errors-open') {
          T.showTasks({ status: 'failed', errors: true });
        } else if (kind === 'errors-retry') {
          retryAllErrors();
        } else if (kind === 'errors-clear') {
          clearErrors();
        }
        return;
      }
      var row = event.target.closest('.ov-row');
      if (row) T.openTaskDetail(row.getAttribute('data-id'));
    });

    host.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('button, a, input')) return;
      var row = event.target.closest('.ov-row');
      if (!row) return;
      event.preventDefault();
      T.openTaskDetail(row.getAttribute('data-id'));
    });

    var form = host.querySelector('#ov-quick-form');
    if (form) form.addEventListener('submit', submitQuick);
  }

  T.views.register('overview', {
    mount: function (target) {
      host = target;
      host.innerHTML = markup();
      bind();
      data.health = null;
      data.queue = null;
      refresh();
      timer = setInterval(function () {
        if (document.hidden) return;
        refresh();
      }, 15000);
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
