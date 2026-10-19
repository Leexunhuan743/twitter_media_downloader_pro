/* TMD · 计划任务视图（schedules） */
(function () {
  'use strict';

  var T = window.TMD;
  if (!T) return;

  T.i18n.add({
    'zh-CN': {
      schedules: {
        title: '计划任务',
        sub: '按固定间隔或每日时刻自动触发下载；可启停、立即触发，也能直接编辑 schedules.yaml。',
        schedulerRunning: '调度器运行中',
        schedulerStopped: '调度器已停止',
        schedulerUnknown: '调度器状态未知',
        kpiTotal: '计划总数',
        kpiEnabled: '已启用',
        kpiDisabled: '已停用',
        kpiFailures: '连续失败',
        kpiTotalSub: '配置文件中的条目',
        kpiEnabledSub: '会按时触发',
        kpiDisabledSub: '暂停触发',
        kpiFailuresSub: '连续失败 > 0 的条目',
        listTitle: '计划列表',
        listMeta: '共 {n} 条 · 启用 {active}',
        listEmpty: '还没有计划任务。点右上角「新建计划」创建第一条。',
        listEmptyMissing: '还没有计划任务，schedules.yaml 也尚未创建；新建一条会自动生成配置文件。',
        loading: '正在加载计划…',
        loadFailed: '加载计划失败',
        configMissing: '配置文件不存在',
        colName: '名称',
        colType: '类型',
        colTarget: '目标',
        colSchedule: '计划',
        colNext: '下次运行',
        colLast: '最近运行',
        colRunCount: '运行次数',
        colFailures: '连续失败',
        colEnabled: '启用',
        colActions: '操作',
        typeList: '列表',
        typeUser: '用户',
        typeFollowing: '关注',
        typeMixed: '混合',
        targetUsers: '用户',
        targetLists: '列表',
        targetFollowing: '关注',
        create: '新建计划',
        createTitle: '新建计划任务',
        editTitle: '编辑计划任务',
        createDesc: '保存前会先调用校验接口，校验通过才写入 schedules.yaml。',
        editDesc: '正在编辑 {id}；保存会覆盖该条目的全部字段。',
        nameField: '名称',
        typeField: '类型',
        scheduleField: '计划表达式',
        targetField: '目标',
        scheduleHelp: '支持 interval:2h（最小 1m）或 daily:07:00,21:00（逗号分隔，最多 96 个时刻）。',
        targetHelp: 'user/following 填裸 screen name（如 alice）；list 填数字列表 ID。',
        usersField: '用户（users）',
        listsField: '列表 ID（lists）',
        followingField: '关注对象（following_names）',
        mixedHelp: '混合类型至少填一项；多个值用逗号或换行分隔。',
        enabledField: '启用',
        runOnStart: '启动时运行',
        autoFollow: '自动关注',
        followMembers: '关注成员',
        skipProfile: '跳过 Profile',
        noRetry: '不重试失败',
        validationFailed: '校验未通过，请修正后再保存。',
        saveFailed: '保存失败',
        saved: '计划已保存',
        updateFailed: '更新失败',
        enabledToast: '计划已启用',
        disabledToast: '计划已停用',
        deleteConfirm: '确定删除计划「{name}」？该操作会立即改写 schedules.yaml。',
        deleteFailed: '删除失败',
        triggerNow: '立即触发',
        triggering: '触发中',
        triggerQueued: '已触发，任务 ID：{id}',
        triggerFailed: '触发失败',
        triggerAll: '触发全部',
        triggerAllResult: '触发全部完成：成功 {ok} · 失败 {failed}',
        triggerAllResultWithError: '触发全部完成：成功 {ok} · 失败 {failed}（{error}）',
        triggerTaskState: '触发任务 {id} 当前状态：{status}',
        reload: '重载配置',
        reloaded: '计划配置已重载',
        reloadFailed: '重载失败',
        rawTitle: '原始 YAML（高级）',
        rawHelp: '直接编辑 schedules.yaml；保存前会校验 YAML 与每条计划，写入前自动备份。',
        rawExpand: '展开编辑器',
        rawCollapse: '收起编辑器',
        rawMissing: '（文件不存在，保存后创建）',
        rawConfirm: '确定用编辑器内容覆盖 schedules.yaml？写入前会自动备份。',
        rawSaved: 'YAML 已保存并重载',
        rawSaveFailed: '保存 YAML 失败',
        rawLoadFailed: '读取 YAML 失败',
        rawEmpty: '内容不能为空',
        rawLoad: '重新读取',
        save: '保存'
      }
    },
    'en': {
      schedules: {
        title: 'Schedules',
        sub: 'Automatically trigger downloads on an interval or at fixed daily times. Toggle, trigger, or edit schedules.yaml directly.',
        schedulerRunning: 'Scheduler running',
        schedulerStopped: 'Scheduler stopped',
        schedulerUnknown: 'Scheduler state unknown',
        kpiTotal: 'Total',
        kpiEnabled: 'Enabled',
        kpiDisabled: 'Disabled',
        kpiFailures: 'Failing',
        kpiTotalSub: 'Entries in the config file',
        kpiEnabledSub: 'Will fire on time',
        kpiDisabledSub: 'Paused',
        kpiFailuresSub: 'Entries with failures > 0',
        listTitle: 'Schedule list',
        listMeta: '{n} entries · {active} enabled',
        listEmpty: 'No schedules yet. Use “New schedule” in the top right to create the first one.',
        listEmptyMissing: 'No schedules yet and schedules.yaml does not exist; creating one will generate the file.',
        loading: 'Loading schedules…',
        loadFailed: 'Could not load schedules',
        configMissing: 'config file missing',
        colName: 'Name',
        colType: 'Type',
        colTarget: 'Target',
        colSchedule: 'Schedule',
        colNext: 'Next run',
        colLast: 'Last run',
        colRunCount: 'Runs',
        colFailures: 'Failures',
        colEnabled: 'Enabled',
        colActions: 'Actions',
        typeList: 'List',
        typeUser: 'User',
        typeFollowing: 'Following',
        typeMixed: 'Mixed',
        targetUsers: 'users',
        targetLists: 'lists',
        targetFollowing: 'following',
        create: 'New schedule',
        createTitle: 'New schedule',
        editTitle: 'Edit schedule',
        createDesc: 'The entry is validated before saving; only a valid config is written to schedules.yaml.',
        editDesc: 'Editing {id}; saving replaces every field of this entry.',
        nameField: 'Name',
        typeField: 'Type',
        scheduleField: 'Schedule expression',
        targetField: 'Target',
        scheduleHelp: 'Use interval:2h (minimum 1m) or daily:07:00,21:00 (comma separated, up to 96 times).',
        targetHelp: 'user/following take a bare screen name (e.g. alice); list takes a numeric list ID.',
        usersField: 'Users (users)',
        listsField: 'List IDs (lists)',
        followingField: 'Following names',
        mixedHelp: 'Mixed type needs at least one value; separate multiple values with commas or newlines.',
        enabledField: 'Enabled',
        runOnStart: 'Run on start',
        autoFollow: 'Auto follow',
        followMembers: 'Follow members',
        skipProfile: 'Skip profile',
        noRetry: 'No retry',
        validationFailed: 'Validation failed. Fix the errors before saving.',
        saveFailed: 'Save failed',
        saved: 'Schedule saved',
        updateFailed: 'Update failed',
        enabledToast: 'Schedule enabled',
        disabledToast: 'Schedule disabled',
        deleteConfirm: 'Delete schedule “{name}”? This rewrites schedules.yaml immediately.',
        deleteFailed: 'Delete failed',
        triggerNow: 'Trigger now',
        triggering: 'Triggering',
        triggerQueued: 'Triggered, task ID: {id}',
        triggerFailed: 'Trigger failed',
        triggerAll: 'Trigger all',
        triggerAllResult: 'Trigger all finished: {ok} succeeded · {failed} failed',
        triggerAllResultWithError: 'Trigger all finished: {ok} succeeded · {failed} failed ({error})',
        triggerTaskState: 'Triggered task {id} is now {status}',
        reload: 'Reload config',
        reloaded: 'Schedules reloaded',
        reloadFailed: 'Reload failed',
        rawTitle: 'Raw YAML (advanced)',
        rawHelp: 'Edit schedules.yaml directly. YAML and every entry are validated before saving; a backup is created first.',
        rawExpand: 'Open editor',
        rawCollapse: 'Close editor',
        rawMissing: '(file missing, will be created on save)',
        rawConfirm: 'Overwrite schedules.yaml with the editor content? A backup is created first.',
        rawSaved: 'YAML saved and reloaded',
        rawSaveFailed: 'Could not save YAML',
        rawLoadFailed: 'Could not read YAML',
        rawEmpty: 'Content cannot be empty',
        rawLoad: 'Reload',
        save: 'Save'
      }
    }
  });

  function ensureStyle() {
    T.injectStyle('view-schedules-style',
      '#view-schedules .sch-dot{display:inline-block;width:8px;height:8px;border-radius:50%;' +
      'background:var(--muted);vertical-align:middle;flex:none}' +
      '#view-schedules .sch-dot--on{background:var(--ok)}' +
      '#view-schedules .sch-dot--off{background:var(--danger)}' +
      '#view-schedules .sch-name{font-weight:600}' +
      '#view-schedules .sch-sub{color:var(--muted);font-size:11.5px;margin-top:2px}');
  }

  ensureStyle();

  var host = null;
  var timer = null;
  var offSchedules = null;
  var offTasks = null;

  var state = {
    entries: [],
    running: null,
    exists: null,
    stats: null,
    loaded: false,
    error: '',
    editing: null,
    submitting: false,
    rawLoaded: false,
    raw: null,
    lastTriggerTaskId: ''
  };

  function t(key, vars) { return T.t('schedules.' + key, vars); }
  function esc(value) { return T.esc(value); }

  /* ---------------- markup ---------------- */

  function kpi(label, key, sub) {
    return '<div class="kpi">' +
      '<div class="kpi__label">' + esc(label) + '</div>' +
      '<div class="kpi__value" data-kpi="' + key + '">—</div>' +
      '<div class="kpi__sub">' + esc(sub) + '</div>' +
      '</div>';
  }

  function typeOptions() {
    return [
      '<option value="user">' + esc(t('typeUser')) + '</option>',
      '<option value="following">' + esc(t('typeFollowing')) + '</option>',
      '<option value="list">' + esc(t('typeList')) + '</option>',
      '<option value="mixed">' + esc(t('typeMixed')) + '</option>'
    ].join('');
  }

  function flag(name, label) {
    return '<label class="check"><input type="checkbox" data-field="' + name + '">' +
      '<span>' + esc(label) + '</span></label>';
  }

  function editorMarkup() {
    return '<dialog class="modal modal--wide" data-role="editor" aria-labelledby="sch-editor-title">' +
      '<form class="modal__form" data-role="editor-form" novalidate autocomplete="off">' +
        '<div class="modal__head">' +
          '<h3 class="modal__title" id="sch-editor-title" data-role="editor-title"></h3>' +
          '<button type="button" class="modal__close" data-action="close-editor" aria-label="' + esc(T.t('common.close')) + '">×</button>' +
        '</div>' +
        '<p class="modal__desc" data-role="editor-desc"></p>' +
        '<div class="notice notice--danger" data-role="editor-error" hidden></div>' +
        '<div class="form-grid mt-12">' +
          '<div class="field-box">' +
            '<label class="field-box__label" for="sch-name">' + esc(t('nameField')) + '</label>' +
            '<input class="input" id="sch-name" data-field="name" spellcheck="false" autocomplete="off">' +
          '</div>' +
          '<div class="field-box">' +
            '<label class="field-box__label" for="sch-type">' + esc(t('typeField')) + '</label>' +
            '<select class="select" id="sch-type" data-field="type">' + typeOptions() + '</select>' +
          '</div>' +
          '<div class="field-box field-box--wide">' +
            '<label class="field-box__label" for="sch-schedule">' + esc(t('scheduleField')) + '</label>' +
            '<input class="input mono" id="sch-schedule" data-field="schedule" spellcheck="false" autocomplete="off" placeholder="interval:2h / daily:07:00,21:00">' +
            '<p class="field-box__help">' + esc(t('scheduleHelp')) + '</p>' +
          '</div>' +
          '<div class="field-box field-box--wide" data-role="target-box">' +
            '<label class="field-box__label" for="sch-target">' + esc(t('targetField')) + '</label>' +
            '<input class="input" id="sch-target" data-field="target" spellcheck="false" autocomplete="off">' +
            '<p class="field-box__help">' + esc(t('targetHelp')) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="stack mt-12" data-role="mixed-box" hidden>' +
          '<div class="field-box">' +
            '<label class="field-box__label" for="sch-users">' + esc(t('usersField')) + '</label>' +
            '<textarea class="textarea" id="sch-users" data-field="users" rows="2" spellcheck="false" placeholder="alice, bob"></textarea>' +
          '</div>' +
          '<div class="field-box">' +
            '<label class="field-box__label" for="sch-lists">' + esc(t('listsField')) + '</label>' +
            '<textarea class="textarea" id="sch-lists" data-field="lists" rows="2" spellcheck="false" placeholder="1234567890, 987654321"></textarea>' +
          '</div>' +
          '<div class="field-box">' +
            '<label class="field-box__label" for="sch-following">' + esc(t('followingField')) + '</label>' +
            '<textarea class="textarea" id="sch-following" data-field="following_names" rows="2" spellcheck="false"></textarea>' +
          '</div>' +
          '<p class="field-box__help">' + esc(t('mixedHelp')) + '</p>' +
        '</div>' +
        '<div class="row-flex mt-16">' +
          flag('enabled', t('enabledField')) +
          flag('run_on_start', t('runOnStart')) +
          flag('auto_follow', t('autoFollow')) +
          flag('follow_members', t('followMembers')) +
          flag('skip_profile', t('skipProfile')) +
          flag('no_retry', t('noRetry')) +
        '</div>' +
        '<div class="modal__actions">' +
          '<button type="button" class="btn btn--ghost" data-action="close-editor">' + esc(T.t('common.cancel')) + '</button>' +
          '<button type="submit" class="btn btn--primary" data-role="editor-save">' + esc(t('save')) + '</button>' +
        '</div>' +
      '</form>' +
    '</dialog>';
  }

  function markup() {
    return '' +
      '<div class="view-head">' +
        '<div class="view-head__text">' +
          '<h1 class="view-title">' + esc(t('title')) + '</h1>' +
          '<p class="view-sub">' + esc(t('sub')) + '</p>' +
        '</div>' +
        '<div class="view-head__actions">' +
          '<span class="badge" data-role="run-badge"></span>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="refresh">' + esc(T.t('common.refresh')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="reload">' + esc(t('reload')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="trigger-all">' + esc(t('triggerAll')) + '</button>' +
          '<button type="button" class="btn btn--primary btn--sm" data-action="create">' + esc(t('create')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="notice notice--danger" data-role="error" hidden></div>' +
      '<div class="notice" data-role="note" hidden></div>' +
      '<div class="grid-4 mt-12">' +
        kpi(t('kpiTotal'), 'total', t('kpiTotalSub')) +
        kpi(t('kpiEnabled'), 'enabled', t('kpiEnabledSub')) +
        kpi(t('kpiDisabled'), 'disabled', t('kpiDisabledSub')) +
        kpi(t('kpiFailures'), 'failures', t('kpiFailuresSub')) +
      '</div>' +
      '<section class="card mt-16">' +
        '<header class="card__head">' +
          '<h3 class="card__title">' + esc(t('listTitle')) + '</h3>' +
          '<span class="card__meta small" data-role="list-meta"></span>' +
        '</header>' +
        '<div data-role="list"></div>' +
      '</section>' +
      '<section class="card mt-16">' +
        '<header class="card__head">' +
          '<h3 class="card__title">' + esc(t('rawTitle')) + '</h3>' +
          '<span class="card__meta mono small" data-role="raw-path"></span>' +
          '<div class="card__actions">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-action="toggle-raw">' + esc(t('rawExpand')) + '</button>' +
          '</div>' +
        '</header>' +
        '<div data-role="raw-panel" hidden>' +
          '<p class="field-box__help">' + esc(t('rawHelp')) + '</p>' +
          '<textarea class="textarea textarea--code mt-8" data-role="raw-editor" rows="16" spellcheck="false" aria-label="' + esc(t('rawTitle')) + '"></textarea>' +
          '<div class="form-actions">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-action="raw-load">' + esc(t('rawLoad')) + '</button>' +
            '<button type="button" class="btn btn--primary btn--sm" data-action="raw-save">' + esc(t('save')) + '</button>' +
          '</div>' +
        '</div>' +
      '</section>' +
      editorMarkup();
  }

  /* ---------------- render ---------------- */

  function renderRunState() {
    if (!host) return;
    var badge = host.querySelector('[data-role="run-badge"]');
    if (!badge) return;
    var running = state.running;
    var text = running === true ? t('schedulerRunning') : (running === false ? t('schedulerStopped') : t('schedulerUnknown'));
    var dot = running === true ? ' sch-dot--on' : (running === false ? ' sch-dot--off' : '');
    badge.className = 'badge' + (running === true ? ' badge--ok' : (running === false ? ' badge--danger' : ''));
    badge.innerHTML = '<span class="sch-dot' + dot + '"></span>' + esc(text);
  }

  function renderKpis() {
    if (!host) return;
    var stats = state.stats || computeStats(state.entries);
    ['total', 'enabled', 'disabled', 'failures'].forEach(function (key) {
      var el = host.querySelector('[data-kpi="' + key + '"]');
      if (el) el.textContent = String(Number(stats[key]) || 0);
    });
  }

  function renderListMeta() {
    if (!host) return;
    var el = host.querySelector('[data-role="list-meta"]');
    if (!el) return;
    if (!state.loaded) { el.textContent = ''; return; }
    var text = t('listMeta', { n: state.entries.length, active: countEnabled() });
    if (state.exists === false) text += ' · ' + t('configMissing');
    el.textContent = text;
  }

  function typeLabel(type) {
    if (type === 'user') return t('typeUser');
    if (type === 'following') return t('typeFollowing');
    if (type === 'list') return t('typeList');
    if (type === 'mixed') return t('typeMixed');
    return String(type || '—');
  }

  function targetSummary(entry) {
    if (!entry) return '—';
    if (entry.type === 'mixed') {
      var parts = [];
      if (entry.users && entry.users.length) parts.push(t('targetUsers') + ': ' + entry.users.join(', '));
      if (entry.lists && entry.lists.length) parts.push(t('targetLists') + ': ' + entry.lists.join(', '));
      if (entry.following_names && entry.following_names.length) parts.push(t('targetFollowing') + ': ' + entry.following_names.join(', '));
      return parts.length ? parts.join(' · ') : '—';
    }
    return entry.target ? String(entry.target) : '—';
  }

  function renderRow(status) {
    var entry = (status && status.entry) || {};
    var id = entry.id || '';
    var failures = Number(status && status.consecutive_failures) || 0;
    var triggering = !!(status && status.triggering);
    var nextRun = status && status.next_run_at ? T.fmtTime(status.next_run_at) : T.t('common.never');
    var lastRun = status && status.last_run_at ? T.fmtTime(status.last_run_at) : T.t('common.never');
    var rawSchedule = entry.schedule ? String(entry.schedule) : '';
    var display = status && status.schedule_display ? String(status.schedule_display) : '';
    var name = entry.name ? String(entry.name) : (id || '—');
    return '<tr>' +
      '<td>' +
        '<div class="sch-name">' + esc(name) + '</div>' +
        '<div class="sch-sub mono">' + esc(id || '—') + (triggering ? ' <span class="badge badge--warn">' + esc(t('triggering')) + '</span>' : '') + '</div>' +
      '</td>' +
      '<td><span class="badge">' + esc(typeLabel(entry.type)) + '</span></td>' +
      '<td class="table__cell-wrap small">' + esc(targetSummary(entry)) + '</td>' +
      '<td class="small">' +
        '<div class="mono">' + esc(rawSchedule || '—') + '</div>' +
        (display ? '<div class="sch-sub">' + esc(display) + '</div>' : '') +
      '</td>' +
      '<td class="table__num small">' + esc(nextRun) + '</td>' +
      '<td class="table__num small">' + esc(lastRun) + '</td>' +
      '<td class="table__num">' + esc(String(Number(status && status.run_count) || 0)) + '</td>' +
      '<td class="table__num">' +
        (failures > 0
          ? '<span class="badge badge--danger">' + esc(String(failures)) + '</span>'
          : '<span class="muted">0</span>') +
      '</td>' +
      '<td>' +
        '<label class="check">' +
          '<input type="checkbox" data-action="toggle" data-id="' + esc(id) + '"' + (entry.enabled ? ' checked' : '') + '>' +
          '<span class="visually-hidden">' + esc(t('colEnabled')) + '</span>' +
        '</label>' +
      '</td>' +
      '<td class="table__actions">' +
        '<div class="row-flex">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="edit" data-id="' + esc(id) + '">' + esc(T.t('common.edit')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="trigger" data-id="' + esc(id) + '"' + (triggering ? ' disabled' : '') + '>' + esc(t('triggerNow')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-action="delete" data-id="' + esc(id) + '">' + esc(T.t('common.delete')) + '</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }

  function renderList() {
    if (!host) return;
    var box = host.querySelector('[data-role="list"]');
    if (!box) return;
    if (!state.loaded) {
      box.innerHTML = '<p class="empty">' + esc(t('loading')) + '</p>';
      return;
    }
    if (!state.entries.length) {
      box.innerHTML = '<p class="empty">' + esc(state.exists === false ? t('listEmptyMissing') : t('listEmpty')) + '</p>';
      return;
    }
    var headers = [
      t('colName'), t('colType'), t('colTarget'), t('colSchedule'),
      t('colNext'), t('colLast'), t('colRunCount'), t('colFailures'),
      t('colEnabled'), t('colActions')
    ];
    box.innerHTML = '<div class="tablewrap"><table class="table">' +
      '<thead><tr>' + headers.map(function (label) {
        return '<th>' + esc(label) + '</th>';
      }).join('') + '</tr></thead>' +
      '<tbody>' + state.entries.map(renderRow).join('') + '</tbody>' +
      '</table></div>';
  }

  function renderAll() {
    renderRunState();
    renderKpis();
    renderListMeta();
    renderList();
  }

  function showError(message) {
    if (!host) return;
    var el = host.querySelector('[data-role="error"]');
    if (!el) return;
    if (!message) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = message;
  }

  function showNote(message, kind) {
    if (!host) return;
    var el = host.querySelector('[data-role="note"]');
    if (!el) return;
    if (!message) { el.hidden = true; el.textContent = ''; el.className = 'notice'; return; }
    el.hidden = false;
    el.textContent = message;
    el.className = 'notice' + (kind === 'ok' ? ' notice--ok' : (kind === 'danger' ? ' notice--danger' : (kind === 'warn' ? ' notice--warn' : '')));
  }

  /* ---------------- data ---------------- */

  function computeStats(entries) {
    var stats = { total: entries.length, enabled: 0, disabled: 0, failures: 0 };
    entries.forEach(function (status) {
      if (status && status.entry && status.entry.enabled) stats.enabled++;
      else stats.disabled++;
      if (status && Number(status.consecutive_failures) > 0) stats.failures++;
    });
    return stats;
  }

  function countEnabled() {
    var count = 0;
    state.entries.forEach(function (status) {
      if (status && status.entry && status.entry.enabled) count++;
    });
    return count;
  }

  function normalizeStats(data) {
    data = data || {};
    return {
      total: Number(data.total) || 0,
      enabled: Number(data.enabled) || 0,
      disabled: Number(data.disabled) || 0,
      failures: Number(data.failures) || 0
    };
  }

  function refresh() {
    if (!host) return Promise.resolve();
    var listJob = T.api.get('/api/v1/schedules');
    var statsJob = T.api.get('/api/v1/schedules/stats').catch(function () { return null; });
    return Promise.all([listJob, statsJob]).then(function (results) {
      if (!host) return;
      var list = results[0] || {};
      state.entries = Array.isArray(list.entries) ? list.entries : [];
      state.running = typeof list.scheduler_running === 'boolean' ? list.scheduler_running : null;
      state.exists = typeof list.exists === 'boolean' ? list.exists : null;
      state.stats = results[1] ? normalizeStats(results[1]) : computeStats(state.entries);
      state.loaded = true;
      state.error = '';
      showError('');
      renderAll();
    }).catch(function (err) {
      if (!host) return;
      state.loaded = true;
      state.error = err && err.message ? err.message : t('loadFailed');
      showError(state.error);
      renderList();
      renderListMeta();
    });
  }

  function findStatus(id) {
    for (var i = 0; i < state.entries.length; i++) {
      var status = state.entries[i];
      if (status && status.entry && status.entry.id === id) return status;
    }
    return null;
  }

  /* ---------------- actions ---------------- */

  function setBusy(el, busy) {
    if (!el) return;
    el.disabled = !!busy;
    if (busy) el.classList.add('btn--busy');
    else el.classList.remove('btn--busy');
  }

  function reloadConfig(btn) {
    setBusy(btn, true);
    return T.api.post('/api/v1/schedules/reload').then(function () {
      T.toast('success', t('reloaded'));
      return refresh();
    }).catch(function (err) {
      T.toast('error', (err && err.message) || t('reloadFailed'));
    }).then(function () {
      setBusy(btn, false);
    });
  }

  function triggerOne(id, btn) {
    setBusy(btn, true);
    return T.api.post('/api/v1/schedules/' + encodeURIComponent(id) + '/trigger').then(function (data) {
      var taskId = data && data.task_id ? String(data.task_id) : '';
      state.lastTriggerTaskId = taskId;
      var message = t('triggerQueued', { id: taskId || '—' });
      showNote(message, 'ok');
      T.toast('success', message);
    }).catch(function (err) {
      var message = (err && err.message) || t('triggerFailed');
      showNote(message, 'danger');
      T.toast('error', message);
    }).then(function () {
      setBusy(btn, false);
    });
  }

  function triggerAll(btn) {
    setBusy(btn, true);
    state.lastTriggerTaskId = '';
    return T.api.post('/api/v1/schedules/trigger-all').then(function (data) {
      var ok = Number(data && data.succeeded) || 0;
      var failed = Number(data && data.failed) || 0;
      var firstError = '';
      if (data && Array.isArray(data.results)) {
        for (var i = 0; i < data.results.length; i++) {
          if (data.results[i] && data.results[i].error) { firstError = String(data.results[i].error); break; }
        }
      }
      var message = firstError
        ? t('triggerAllResultWithError', { ok: ok, failed: failed, error: firstError })
        : t('triggerAllResult', { ok: ok, failed: failed });
      showNote(message, failed > 0 ? 'warn' : 'ok');
      T.toast(failed > 0 ? 'error' : 'success', message);
      return refresh();
    }).catch(function (err) {
      var message = (err && err.message) || t('triggerFailed');
      showNote(message, 'danger');
      T.toast('error', message);
    }).then(function () {
      setBusy(btn, false);
    });
  }

  function toggleEnabled(id, checked, input) {
    if (!id) return;
    input.disabled = true;
    T.api.patch('/api/v1/schedules/' + encodeURIComponent(id) + '/enabled', { enabled: checked }).then(function () {
      T.toast('success', checked ? t('enabledToast') : t('disabledToast'));
      return refresh();
    }).catch(function (err) {
      input.checked = !checked;
      input.disabled = false;
      T.toast('error', (err && err.message) || t('updateFailed'));
    });
  }

  function deleteSchedule(id, name) {
    if (!T.confirm(t('deleteConfirm', { name: name || id }))) return;
    T.api.del('/api/v1/schedules/' + encodeURIComponent(id)).then(function () {
      T.toast('success', T.t('common.deleted'));
      return refresh();
    }).catch(function (err) {
      T.toast('error', (err && err.message) || t('deleteFailed'));
    });
  }

  /* ---------------- editor ---------------- */

  function formEl() {
    return host ? host.querySelector('[data-role="editor-form"]') : null;
  }

  function fieldEl(name) {
    var form = formEl();
    return form ? form.querySelector('[data-field="' + name + '"]') : null;
  }

  function setField(name, value) {
    var el = fieldEl(name);
    if (el) el.value = value;
  }

  function defaultEntry() {
    return {
      type: 'user', name: '', schedule: 'interval:2h', target: '',
      enabled: true, run_on_start: false, auto_follow: false,
      follow_members: false, skip_profile: false, no_retry: false
    };
  }

  function updateTypeVisibility() {
    var typeEl = fieldEl('type');
    var type = typeEl ? typeEl.value : 'user';
    var form = formEl();
    if (!form) return;
    var targetBox = form.querySelector('[data-role="target-box"]');
    var mixedBox = form.querySelector('[data-role="mixed-box"]');
    if (targetBox) targetBox.hidden = type === 'mixed';
    if (mixedBox) mixedBox.hidden = type !== 'mixed';
  }

  function fillForm(entry) {
    entry = entry || defaultEntry();
    setField('name', entry.name || '');
    setField('type', entry.type || 'user');
    setField('schedule', entry.schedule || 'interval:2h');
    setField('target', entry.target || '');
    setField('users', (entry.users || []).join('\n'));
    setField('lists', (entry.lists || []).join('\n'));
    setField('following_names', (entry.following_names || []).join('\n'));
    ['enabled', 'run_on_start', 'auto_follow', 'follow_members', 'skip_profile', 'no_retry'].forEach(function (key) {
      var el = fieldEl(key);
      if (el) el.checked = !!entry[key];
    });
    updateTypeVisibility();
  }

  function showEditorError(message) {
    if (!host) return;
    var el = host.querySelector('[data-role="editor-error"]');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = String(message).split('\n').map(esc).join('<br>');
  }

  function openEditor(status) {
    if (!host) return;
    var dialog = host.querySelector('[data-role="editor"]');
    if (!dialog) return;
    state.editing = status && status.entry && status.entry.id ? status.entry.id : null;
    state.submitting = false;
    fillForm(status && status.entry ? status.entry : defaultEntry());
    var titleEl = host.querySelector('[data-role="editor-title"]');
    if (titleEl) titleEl.textContent = state.editing ? t('editTitle') : t('createTitle');
    var descEl = host.querySelector('[data-role="editor-desc"]');
    if (descEl) descEl.textContent = state.editing ? t('editDesc', { id: state.editing }) : t('createDesc');
    showEditorError('');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeEditor() {
    if (!host) return;
    state.editing = null;
    var dialog = host.querySelector('[data-role="editor"]');
    if (dialog && dialog.open && typeof dialog.close === 'function') dialog.close();
  }

  function splitValues(raw) {
    return String(raw || '').split(/[,\n]/).map(function (item) {
      return item.trim();
    }).filter(function (item) {
      return item !== '';
    });
  }

  function collectEntry() {
    var typeEl = fieldEl('type');
    var type = typeEl ? typeEl.value : 'user';
    var entry = {
      type: type,
      name: String((fieldEl('name') || {}).value || '').trim(),
      schedule: String((fieldEl('schedule') || {}).value || '').trim(),
      enabled: !!(fieldEl('enabled') && fieldEl('enabled').checked),
      run_on_start: !!(fieldEl('run_on_start') && fieldEl('run_on_start').checked),
      auto_follow: !!(fieldEl('auto_follow') && fieldEl('auto_follow').checked),
      follow_members: !!(fieldEl('follow_members') && fieldEl('follow_members').checked),
      skip_profile: !!(fieldEl('skip_profile') && fieldEl('skip_profile').checked),
      no_retry: !!(fieldEl('no_retry') && fieldEl('no_retry').checked)
    };
    if (type === 'mixed') {
      entry.users = splitValues((fieldEl('users') || {}).value);
      entry.lists = splitValues((fieldEl('lists') || {}).value);
      entry.following_names = splitValues((fieldEl('following_names') || {}).value);
    } else {
      entry.target = String((fieldEl('target') || {}).value || '').trim();
    }
    return entry;
  }

  function saveEditor() {
    if (!host || state.submitting) return;
    var form = formEl();
    if (!form) return;
    var saveBtn = form.querySelector('[data-role="editor-save"]');
    var entry = collectEntry();
    state.submitting = true;
    setBusy(saveBtn, true);
    showEditorError('');

    T.api.post('/api/v1/schedules/validate', { entry: entry }).then(function (result) {
      if (!result || result.valid !== true) {
        var errors = result && Array.isArray(result.errors) && result.errors.length ? result.errors : [t('validationFailed')];
        showEditorError(errors.join('\n'));
        throw { handled: true };
      }
      if (state.editing) {
        return T.api.put('/api/v1/schedules/' + encodeURIComponent(state.editing), entry);
      }
      return T.api.post('/api/v1/schedules', entry);
    }).then(function () {
      T.toast('success', t('saved'));
      state.editing = null;
      closeEditor();
      return refresh();
    }).catch(function (err) {
      if (err && err.handled) return;
      var message = (err && err.message) || t('saveFailed');
      showEditorError(message);
      T.toast('error', message);
    }).then(function () {
      state.submitting = false;
      setBusy(saveBtn, false);
    });
  }

  /* ---------------- raw yaml ---------------- */

  function loadRaw() {
    if (!host) return Promise.resolve();
    return T.api.get('/api/v1/schedules/raw').then(function (data) {
      if (!host) return;
      state.raw = data || {};
      state.rawLoaded = true;
      var editor = host.querySelector('[data-role="raw-editor"]');
      if (editor) editor.value = state.raw.content || '';
      var pathEl = host.querySelector('[data-role="raw-path"]');
      if (pathEl) {
        pathEl.textContent = (state.raw.path || '') + (state.raw.exists ? '' : ' ' + t('rawMissing'));
      }
    }).catch(function (err) {
      T.toast('error', (err && err.message) || t('rawLoadFailed'));
    });
  }

  function toggleRaw() {
    if (!host) return;
    var panel = host.querySelector('[data-role="raw-panel"]');
    var btn = host.querySelector('[data-action="toggle-raw"]');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (btn) btn.textContent = panel.hidden ? t('rawExpand') : t('rawCollapse');
    if (!panel.hidden && !state.rawLoaded) loadRaw();
  }

  function saveRaw() {
    if (!host) return;
    var editor = host.querySelector('[data-role="raw-editor"]');
    if (!editor) return;
    var content = editor.value;
    if (!content || !content.trim()) {
      T.toast('error', t('rawEmpty'));
      return;
    }
    if (!T.confirm(t('rawConfirm'))) return;
    var btn = host.querySelector('[data-action="raw-save"]');
    setBusy(btn, true);
    T.api.put('/api/v1/schedules/raw', { content: content }).then(function () {
      T.toast('success', t('rawSaved'));
      return loadRaw().then(refresh);
    }).catch(function (err) {
      T.toast('error', (err && err.message) || t('rawSaveFailed'));
    }).then(function () {
      setBusy(btn, false);
    });
  }

  /* ---------------- events ---------------- */

  function onClick(event) {
    var btn = event.target.closest('[data-action]');
    if (!btn || !host || !host.contains(btn)) return;
    var action = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id') || '';
    if (action === 'refresh') {
      setBusy(btn, true);
      refresh().then(function () { setBusy(btn, false); });
      return;
    }
    if (action === 'reload') { reloadConfig(btn); return; }
    if (action === 'trigger-all') { triggerAll(btn); return; }
    if (action === 'create') { openEditor(null); return; }
    if (action === 'edit') {
      var status = findStatus(id);
      if (status) openEditor(status);
      return;
    }
    if (action === 'trigger') { triggerOne(id, btn); return; }
    if (action === 'delete') {
      var found = findStatus(id);
      var name = found && found.entry ? (found.entry.name || id) : id;
      deleteSchedule(id, name);
      return;
    }
    if (action === 'close-editor') { closeEditor(); return; }
    if (action === 'toggle-raw') { toggleRaw(); return; }
    if (action === 'raw-load') { loadRaw(); return; }
    if (action === 'raw-save') { saveRaw(); return; }
  }

  function onChange(event) {
    var input = event.target;
    if (!input) return;
    if (input.getAttribute && input.getAttribute('data-action') === 'toggle') {
      var id = input.getAttribute('data-id') || '';
      toggleEnabled(id, !!input.checked, input);
      return;
    }
    if (input.getAttribute && input.getAttribute('data-field') === 'type') {
      updateTypeVisibility();
    }
  }

  function onSubmit(event) {
    var form = event.target;
    if (!form || !form.getAttribute || form.getAttribute('data-role') !== 'editor-form') return;
    event.preventDefault();
    saveEditor();
  }

  function onSchedules(payload) {
    if (!host || !payload || !Array.isArray(payload.entries)) return;
    state.entries = payload.entries;
    state.loaded = true;
    state.stats = computeStats(state.entries);
    if (typeof payload.scheduler_running === 'boolean') state.running = payload.scheduler_running;
    state.error = '';
    showError('');
    renderAll();
  }

  function onTasks(tasks) {
    if (!host || !state.lastTriggerTaskId || !Array.isArray(tasks)) return;
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      if (task && task.task_id === state.lastTriggerTaskId) {
        showNote(t('triggerTaskState', {
          id: task.task_id,
          status: task.status || 'unknown'
        }), task.status === 'failed' ? 'danger' : 'ok');
        return;
      }
    }
  }

  function bind() {
    if (!host) return;
    host.addEventListener('click', onClick);
    host.addEventListener('change', onChange);
    host.addEventListener('submit', onSubmit);
  }

  /* ---------------- mount ---------------- */

  T.views.register('schedules', {
    mount: function (root) {
      host = root;
      state = {
        entries: [],
        running: null,
        exists: null,
        stats: null,
        loaded: false,
        error: '',
        editing: null,
        submitting: false,
        rawLoaded: false,
        raw: null,
        lastTriggerTaskId: ''
      };
      host.innerHTML = markup();
      bind();
      renderAll();
      refresh();
      offSchedules = T.on('schedules', onSchedules);
      offTasks = T.on('tasks', onTasks);
      timer = setInterval(function () {
        if (host) refresh();
      }, 30000);
      return {
        refresh: refresh,
        destroy: function () {
          if (timer) clearInterval(timer);
          timer = null;
          if (offSchedules) offSchedules();
          offSchedules = null;
          if (offTasks) offTasks();
          offTasks = null;
          var dialog = host ? host.querySelector('[data-role="editor"]') : null;
          if (dialog && dialog.open && typeof dialog.close === 'function') dialog.close();
          host = null;
        }
      };
    }
  });
})();
