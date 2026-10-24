/* TMD · 计划任务视图（schedules） */
(function () {
  'use strict';

  var T = window.TMD;
  if (!T) return;

  T.i18n.add({
    'zh-CN': {
      schedules: {
        title: '计划任务',
        sub: '按固定间隔或每日时刻自动触发下载；开关立即生效，点「新建计划」添加下一条。',
        schedulerRunning: '调度器运行中',
        schedulerStopped: '调度器已停止',
        schedulerUnknown: '调度器状态未知',
        statTotal: '计划总数',
        statEnabled: '已启用',
        statDisabled: '已停用',
        statFailures: '连续失败',
        listTitle: '计划列表',
        listMeta: '共 {n} 条 · 启用 {active}',
        configMissing: '配置文件不存在',
        loading: '正在加载计划…',
        loadFailed: '加载计划失败',
        emptyTitle: '还没有计划任务',
        emptyHint: '创建一条计划，按间隔或每日时刻自动下载；保存前会校验表达式。',
        emptyHintMissing: 'schedules.yaml 尚未创建，新建一条计划会自动生成配置文件。',
        create: '新建计划',
        retry: '重试',
        colPlan: '计划',
        colTypeTarget: '类型 / 目标',
        colSchedule: '频率',
        colNext: '下次运行',
        colLast: '最近运行',
        colFailures: '连续失败',
        colEnabled: '启用',
        colActions: '操作',
        typeUser: '用户',
        typeFollowing: '关注',
        typeList: '列表',
        typeMixed: '混合',
        targetUsers: '用户',
        targetLists: '列表',
        targetFollowing: '关注',
        nextDisabled: '已停用',
        nextNever: '无',
        lastNever: '从未运行',
        lastOk: '成功',
        lastFailed: '失败',
        failuresNone: '—',
        failuresCount: '{n} 次',
        lastError: '最近错误',
        switchOn: '启用',
        switchOff: '停用',
        saving: '保存中…',
        triggering: '触发中',
        triggerNow: '立即触发',
        triggerQueued: '已触发，任务 ID：{id}',
        triggerFailed: '触发失败',
        triggerAll: '触发全部',
        triggerAllResult: '触发全部完成：成功 {ok} · 失败 {failed}',
        triggerAllResultWithError: '触发全部完成：成功 {ok} · 失败 {failed}（{error}）',
        triggerTaskState: '触发任务 {id} 当前状态：{status}',
        reload: '重载配置',
        reloaded: '计划配置已重载',
        reloadFailed: '重载失败',
        createTitle: '新建计划任务',
        editTitle: '编辑计划任务',
        createDesc: '保存前会先调用校验接口，校验通过才写入 schedules.yaml。',
        editDesc: '正在编辑 {id}；保存会覆盖该条目的全部字段。',
        nameField: '名称',
        typeField: '类型',
        scheduleField: '计划表达式',
        scheduleHelp: 'interval:2h（最小 1m）或 daily:07:00,21:00（逗号分隔，最多 96 个时刻）。',
        presetsLabel: '常用计划',
        presetHourly: '每 1 小时',
        preset6h: '每 6 小时',
        presetDaily: '每天 07:00',
        presetCustom: '自定义',
        targetField: '目标',
        targetUserLabel: '用户（目标）',
        targetFollowingLabel: '关注对象（目标）',
        targetListLabel: '列表 ID（目标）',
        targetHelpUser: '填写裸 screen name，如 nasa。',
        targetHelpFollowing: '填写裸 screen name，如 nasa；会下载其关注列表。',
        targetHelpList: '填写数字列表 ID，如 2003。',
        targetPlaceholderUser: 'nasa',
        targetPlaceholderFollowing: 'nasa',
        targetPlaceholderList: '2003',
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
        errName: '请填写计划名称。',
        errSchedule: '计划表达式无效，例：interval:2h 或 daily:07:00。',
        errTarget: '请填写目标。',
        errMixed: '混合类型至少填写用户、列表或关注对象中的一项。',
        errFix: '请修正标红的字段。',
        validationFailed: '校验未通过，请修正后再保存。',
        saveFailed: '保存失败',
        saved: '计划已保存',
        updateFailed: '更新失败',
        enabledToast: '计划已启用',
        disabledToast: '计划已停用',
        deleteConfirm: '确定删除计划「{name}」？该操作会立即改写 schedules.yaml。',
        deleteFailed: '删除失败',
        notRunningHint: '调度器未运行，定时任务不会自动执行。检查配置后重载配置（或重启 TMD）。',
        triggerAllConfirm: '确定立即触发全部 {n} 个已启用的计划？',
        triggerAllNone: '没有已启用的计划可触发。',
        deleteUndo: '已删除「{name}」',
        undoDelete: '撤销删除',
        undone: '计划已恢复（新记录）',
        rawDirty: 'schedules.yaml 有未保存的修改。',
        rawDiscard: '放弃 schedules.yaml 的未保存修改？',
        discardEdit: '计划表单有未保存的修改，确定关闭？',
        rawTitle: '高级：直接编辑 schedules.yaml',
        rawHint: '直接编辑 YAML；保存前会校验 YAML 与每条计划，写入前自动备份。',
        rawMissing: '（文件不存在，保存后创建）',
        rawConfirm: '确定用编辑器内容覆盖 schedules.yaml？写入前会自动备份。',
        rawOverwritesForm: '编辑器中仍有未保存的计划修改，保存原始 YAML 会覆盖它们。继续？',
        rawSaved: 'YAML 已保存并重载',
        rawSaveFailed: '保存 YAML 失败',
        rawLoadFailed: '读取 YAML 失败',
        rawEmpty: '内容不能为空',
        rawLoad: '重新读取',
        save: '保存',
        scheduleEvery: '每 {n} {unit}',
        scheduleDailyAt: '每天 {times}',
        unitSec: '秒',
        unitMin: '分钟',
        unitHour: '小时',
        relNow: '即将运行',
        relFutureMin: '{n} 分钟后',
        relFutureHour: '{n} 小时后',
        relFutureDay: '{n} 天后',
        relPastMin: '{n} 分钟前',
        relPastHour: '{n} 小时前',
        relPastDay: '{n} 天前'
      }
    },
    'en': {
      schedules: {
        title: 'Schedules',
        sub: 'Run downloads on an interval or at fixed daily times. Toggles apply immediately; use “New schedule” to add one.',
        schedulerRunning: 'Scheduler running',
        schedulerStopped: 'Scheduler stopped',
        schedulerUnknown: 'Scheduler state unknown',
        notRunningHint: 'The scheduler is not running, so schedules will not fire. Reload the config (or restart TMD) after fixing it.',
        triggerAllConfirm: 'Trigger all {n} enabled schedules now?',
        triggerAllNone: 'No enabled schedules to trigger.',
        deleteUndo: 'Deleted "{name}"',
        undoDelete: 'Undo',
        undone: 'Schedule restored (as a new record)',
        rawDirty: 'schedules.yaml has unsaved changes.',
        rawDiscard: 'Discard the unsaved schedules.yaml edits?',
        discardEdit: 'The schedule form has unsaved changes. Close anyway?',
        statTotal: 'Total',
        statEnabled: 'Enabled',
        statDisabled: 'Disabled',
        statFailures: 'Failing',
        listTitle: 'Schedule list',
        listMeta: '{n} entries · {active} enabled',
        configMissing: 'config file missing',
        loading: 'Loading schedules…',
        loadFailed: 'Could not load schedules',
        emptyTitle: 'No schedules yet',
        emptyHint: 'Create a schedule to download on an interval or at daily times. The expression is validated before saving.',
        emptyHintMissing: 'schedules.yaml does not exist yet; creating a schedule generates the file.',
        create: 'New schedule',
        retry: 'Retry',
        colPlan: 'Schedule',
        colTypeTarget: 'Type / target',
        colSchedule: 'Timing',
        colNext: 'Next run',
        colLast: 'Last run',
        colFailures: 'Failures',
        colEnabled: 'Enabled',
        colActions: 'Actions',
        typeUser: 'User',
        typeFollowing: 'Following',
        typeList: 'List',
        typeMixed: 'Mixed',
        targetUsers: 'users',
        targetLists: 'lists',
        targetFollowing: 'following',
        nextDisabled: 'Disabled',
        nextNever: 'None',
        lastNever: 'Never run',
        lastOk: 'Success',
        lastFailed: 'Failed',
        failuresNone: '—',
        failuresCount: '{n}',
        lastError: 'Last error',
        switchOn: 'On',
        switchOff: 'Off',
        saving: 'Saving…',
        triggering: 'Triggering',
        triggerNow: 'Trigger now',
        triggerQueued: 'Triggered, task ID: {id}',
        triggerFailed: 'Trigger failed',
        triggerAll: 'Trigger all',
        triggerAllResult: 'Trigger all finished: {ok} succeeded · {failed} failed',
        triggerAllResultWithError: 'Trigger all finished: {ok} succeeded · {failed} failed ({error})',
        triggerTaskState: 'Triggered task {id} is now {status}',
        reload: 'Reload config',
        reloaded: 'Schedules reloaded',
        reloadFailed: 'Reload failed',
        createTitle: 'New schedule',
        editTitle: 'Edit schedule',
        createDesc: 'The entry is validated before saving; only a valid config is written to schedules.yaml.',
        editDesc: 'Editing {id}; saving replaces every field of this entry.',
        nameField: 'Name',
        typeField: 'Type',
        scheduleField: 'Timing expression',
        scheduleHelp: 'Use interval:2h (minimum 1m) or daily:07:00,21:00 (comma separated, up to 96 times).',
        presetsLabel: 'Presets',
        presetHourly: 'Every hour',
        preset6h: 'Every 6 hours',
        presetDaily: 'Daily 07:00',
        presetCustom: 'Custom',
        targetField: 'Target',
        targetUserLabel: 'User (target)',
        targetFollowingLabel: 'Following (target)',
        targetListLabel: 'List ID (target)',
        targetHelpUser: 'A bare screen name, e.g. nasa.',
        targetHelpFollowing: 'A bare screen name, e.g. nasa; its following list is downloaded.',
        targetHelpList: 'A numeric list ID, e.g. 2003.',
        targetPlaceholderUser: 'nasa',
        targetPlaceholderFollowing: 'nasa',
        targetPlaceholderList: '2003',
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
        errName: 'Enter a schedule name.',
        errSchedule: 'Invalid expression; use interval:2h or daily:07:00.',
        errTarget: 'Enter a target.',
        errMixed: 'Mixed type needs at least one user, list or following value.',
        errFix: 'Fix the highlighted fields.',
        validationFailed: 'Validation failed. Fix the errors before saving.',
        saveFailed: 'Save failed',
        saved: 'Schedule saved',
        updateFailed: 'Update failed',
        enabledToast: 'Schedule enabled',
        disabledToast: 'Schedule disabled',
        deleteConfirm: 'Delete schedule “{name}”? This rewrites schedules.yaml immediately.',
        deleteFailed: 'Delete failed',
        rawTitle: 'Advanced: edit schedules.yaml directly',
        rawHint: 'Edit the YAML directly. YAML and every entry are validated before saving; a backup is created first.',
        rawMissing: '(file missing, will be created on save)',
        rawConfirm: 'Overwrite schedules.yaml with the editor content? A backup is created first.',
        rawOverwritesForm: 'The editor still has unsaved schedule changes; saving the raw YAML discards them. Continue?',
        rawSaved: 'YAML saved and reloaded',
        rawSaveFailed: 'Could not save YAML',
        rawLoadFailed: 'Could not read YAML',
        rawEmpty: 'Content cannot be empty',
        rawLoad: 'Reload',
        save: 'Save',
        scheduleEvery: 'Every {n} {unit}',
        scheduleDailyAt: 'Daily {times}',
        unitSec: 's',
        unitMin: 'min',
        unitHour: 'h',
        relNow: 'Due now',
        relFutureMin: 'in {n} min',
        relFutureHour: 'in {n} h',
        relFutureDay: 'in {n} d',
        relPastMin: '{n} min ago',
        relPastHour: '{n} h ago',
        relPastDay: '{n} d ago'
      }
    }
  });

  var STYLE_ID = 'view-schedules-style';

  function injectStyle() {
    T.injectStyle(STYLE_ID, [
      '#view-schedules .sch-name{display:block;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#view-schedules .sch-id{display:block;margin-top:1px;color:var(--muted);font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#view-schedules .sch-row-badges{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:4px}',
      '#view-schedules .sch-target{display:flex;align-items:center;gap:6px;min-width:0}',
      '#view-schedules .sch-target__text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-soft)}',
      '#view-schedules .sch-display{display:block;font-weight:600}',
      '#view-schedules .sch-sub{display:block;margin-top:1px;color:var(--muted);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#view-schedules .sch-num{font-variant-numeric:tabular-nums}',
      '#view-schedules .sch-actions{display:flex;gap:4px;justify-content:flex-end}',
      '#view-schedules .sch-icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text-soft);cursor:pointer;transition:background .14s ease,color .14s ease,border-color .14s ease}',
      '#view-schedules .sch-icon:hover:not(:disabled){background:var(--surface-2);color:var(--text)}',
      '#view-schedules .sch-icon:disabled{opacity:.45;cursor:not-allowed}',
      '#view-schedules .sch-icon--danger{color:var(--danger)}',
      '#view-schedules .sch-icon--danger:hover:not(:disabled){background:var(--danger-soft);border-color:color-mix(in srgb,var(--danger) 30%,var(--border))}',
      '#view-schedules .sch-icon svg{width:15px;height:15px}',
      '#view-schedules .sch-switch{padding:4px 0;min-height:32px}',
      '#view-schedules .sch-switch__text{font-size:12px;color:var(--text-soft);min-width:30px;font-variant-numeric:tabular-nums}',
      '#view-schedules tr[data-pending="true"]{opacity:.72}',
      '#view-schedules tr[data-pending="true"] .sch-switch__text{color:var(--accent)}',
      '#view-schedules .sch-field-error{margin:5px 0 0;color:var(--danger);font-size:12px}',
      '#view-schedules .sch-presets{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
      '#view-schedules .sch-preset.is-active{border-color:color-mix(in srgb,var(--accent) 42%,var(--border));background:var(--accent-soft);color:var(--accent);font-weight:650}',
      '#view-schedules .sch-raw{padding:0;overflow:hidden}',
      '#view-schedules .sch-raw>summary{display:flex;align-items:center;gap:10px;padding:14px 18px;cursor:pointer;list-style:none}',
      '#view-schedules .sch-raw>summary::-webkit-details-marker{display:none}',
      '#view-schedules .sch-raw__title{font-size:14px;font-weight:650}',
      '#view-schedules .sch-raw__path{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11.5px}',
      '#view-schedules .sch-raw__chev{margin-left:auto;display:inline-flex;color:var(--muted);transition:transform .16s ease}',
      '#view-schedules .sch-raw[open] .sch-raw__chev{transform:rotate(180deg)}',
      '#view-schedules .sch-raw__body{padding:0 18px 18px;border-top:1px solid var(--border)}',
      '#view-schedules .sch-skeleton{height:46px;margin:10px 0;border-radius:var(--radius-xs)}',
      '#view-schedules .notice .sch-inline-btn{margin-left:10px;vertical-align:middle}',
      '#view-schedules .empty__actions .btn{min-height:36px}',
      '@media (max-width:820px){',
      '#view-schedules .sch-table thead{display:none}',
      '#view-schedules .sch-table,#view-schedules .sch-table tbody,#view-schedules .sch-table tr,#view-schedules .sch-table td{display:block;width:100%}',
      '#view-schedules .sch-table tr{margin:0 0 10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface)}',
      '#view-schedules .sch-table tr:last-child{margin-bottom:0}',
      '#view-schedules .sch-table td{display:grid;grid-template-columns:94px minmax(0,1fr);gap:10px;align-items:center;padding:4px 0;border:0;text-align:left}',
      '#view-schedules .sch-table td::before{content:attr(data-label);color:var(--muted);font-size:12px;font-weight:650}',
      '#view-schedules .sch-table td>span,#view-schedules .sch-table td>.sch-target{grid-column:2}',
      '#view-schedules .sch-table td[data-label=""]::before{display:none}',
      '#view-schedules .sch-table td.sch-cell-actions{grid-template-columns:1fr;padding-top:8px}',
      '#view-schedules .sch-actions{justify-content:flex-start;margin-top:2px;padding-top:8px;border-top:1px dashed var(--border)}',
      '#view-schedules .sch-icon{width:40px;height:40px}',
      '#view-schedules .sch-name{white-space:normal}',
      '#view-schedules .sch-switch{min-height:40px;padding:8px 0}',
      '#view-schedules .sch-raw>summary{padding:12px 14px}',
      '#view-schedules .sch-raw__body{padding:0 14px 14px}',
      '#view-schedules .btn{min-height:40px}',
      '#view-schedules .view-head{flex-wrap:wrap;row-gap:10px}',
      '#view-schedules .view-head__actions{flex-wrap:wrap;justify-content:flex-start;min-width:0}',
      '#view-schedules .view-head__actions .btn{min-height:40px;min-width:40px}',
      '#view-schedules .sch-preset{min-height:40px}',
      '#view-schedules .sch-raw>summary{min-height:44px}',
      '#view-schedules .sch-runbanner{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '#view-schedules .sch-runbanner[hidden]{display:none}',
      '#view-schedules .sch-undo{display:flex;align-items:center;gap:10px;justify-content:flex-end;border-top:1px solid var(--border);padding:10px 18px}',
      '#view-schedules .sch-undo[hidden]{display:none}',
      '#view-schedules .sch-undo [data-role="undo-text"]{margin-right:auto;font-size:11.5px;color:var(--muted)}',
      '}'
    ].join(''));
  }

  injectStyle();

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
    lastTriggerTaskId: '',
    undo: null,
    editorSnapshot: ''
  };

  var undoTimer = null;
  var fieldValidateTimer = null;

  function t(key, vars) { return T.t('schedules.' + key, vars); }
  function esc(value) { return T.esc(value); }

  var ICONS = {
    edit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.6 3.4 12.6 6.4M3.2 12.8l3.5-.7 6.9-6.9a1.4 1.4 0 0 0-2-2l-6.9 6.9-.7 3.5Z"/></svg>',
    trigger: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.2 3.4v9.2l7-4.6-7-4.6Z"/></svg>',
    trash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h10M6.4 5V3.4h3.2V5M5 5l.6 8h4.8L11 5"/></svg>',
    refresh: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 3.4V6.6H9.8"/></svg>',
    reload: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 3.4V6.6h3.2"/></svg>',
    zap: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8.7 2.2 4 9h3.4l-.6 4.8L12 7H8.4l.3-4.8Z"/></svg>',
    plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.4v9.2M3.4 8h9.2"/></svg>'
  };

  function iconBtn(action, id, icon, label, extraClass) {
    return '<button type="button" class="sch-icon' + (extraClass || '') + '" data-action="' + action + '" data-id="' + esc(id) + '"' +
      ' title="' + esc(label) + '" aria-label="' + esc(label) + '">' + ICONS[icon] + '</button>';
  }

  /* ---------------- time helpers ---------------- */

  function fullTime(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(T.state && T.state.lang ? T.state.lang : 'zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).format(date);
    } catch (e) {
      return date.toLocaleString();
    }
  }

  function relNow(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    var diff = date.getTime() - Date.now();
    var abs = Math.abs(diff);
    if (abs < 45000) return t('relNow');
    if (abs < 3600000) return t(diff < 0 ? 'relPastMin' : 'relFutureMin', { n: Math.floor(abs / 60000) });
    if (abs < 86400000) return t(diff < 0 ? 'relPastHour' : 'relFutureHour', { n: Math.floor(abs / 3600000) });
    return t(diff < 0 ? 'relPastDay' : 'relFutureDay', { n: Math.floor(abs / 86400000) });
  }

  /* ---------------- schedule helpers ---------------- */

  function humanSchedule(expr) {
    var value = String(expr || '').trim();
    var m = /^interval:(\d+)([smh])$/i.exec(value);
    if (m) {
      var n = Number(m[1]) || 0;
      var unit = m[2].toLowerCase();
      return t('scheduleEvery', {
        n: n,
        unit: unit === 's' ? t('unitSec') : (unit === 'm' ? t('unitMin') : t('unitHour'))
      });
    }
    m = /^daily:(.+)$/i.exec(value);
    if (m) return t('scheduleDailyAt', { times: m[1].split(',').join(' / ') });
    return '';
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

  /* ---------------- markup ---------------- */

  function stat(label, key, tone) {
    return '<div class="stat"' + (tone ? ' data-tone="' + tone + '"' : '') + ' data-role="' + (key === 'failures' ? 'fail-stat' : 'stat-' + key) + '">' +
      '<span class="stat__label">' + esc(label) + '</span>' +
      '<span class="stat__value" data-stat="' + key + '">—</span>' +
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

  function presetButtons() {
    var items = [
      { expr: 'interval:1h', label: t('presetHourly') },
      { expr: 'interval:6h', label: t('preset6h') },
      { expr: 'daily:07:00', label: t('presetDaily') },
      { expr: '', label: t('presetCustom') }
    ];
    return '<div class="sch-presets" role="group" aria-label="' + esc(t('presetsLabel')) + '">' +
      items.map(function (item) {
        return '<button type="button" class="btn btn--ghost btn--sm sch-preset" data-action="preset" data-preset="' + esc(item.expr) + '" aria-pressed="false">' + esc(item.label) + '</button>';
      }).join('') + '</div>';
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
            '<p class="sch-field-error" data-error-for="name" hidden></p>' +
          '</div>' +
          '<div class="field-box">' +
            '<label class="field-box__label" for="sch-type">' + esc(t('typeField')) + '</label>' +
            '<select class="select" id="sch-type" data-field="type">' + typeOptions() + '</select>' +
          '</div>' +
          '<div class="field-box field-box--wide">' +
            '<label class="field-box__label" for="sch-schedule">' + esc(t('scheduleField')) + '</label>' +
            '<input class="input mono" id="sch-schedule" data-field="schedule" spellcheck="false" autocomplete="off" placeholder="interval:2h / daily:07:00,21:00">' +
            presetButtons() +
            '<p class="field-box__help">' + esc(t('scheduleHelp')) + '</p>' +
            '<p class="sch-field-error" data-error-for="schedule" hidden></p>' +
          '</div>' +
          '<div class="field-box field-box--wide" data-role="target-box">' +
            '<label class="field-box__label" for="sch-target" data-role="target-label">' + esc(t('targetUserLabel')) + '</label>' +
            '<input class="input" id="sch-target" data-field="target" spellcheck="false" autocomplete="off">' +
            '<p class="field-box__help" data-role="target-help"></p>' +
            '<p class="sch-field-error" data-error-for="target" hidden></p>' +
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
          '<p class="sch-field-error" data-error-for="mixed" hidden></p>' +
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
          '<button type="button" class="btn btn--ghost btn--sm" data-action="refresh" title="' + esc(T.t('common.refresh')) + '">' + esc(T.t('common.refresh')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="reload" title="' + esc(t('reload')) + '">' + esc(t('reload')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="trigger-all" title="' + esc(t('triggerAll')) + '">' + esc(t('triggerAll')) + '</button>' +
          '<button type="button" class="btn btn--primary btn--sm" data-action="create">' + esc(t('create')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="notice notice--danger" data-role="error" hidden></div>' +
      '<div class="notice" data-role="note" hidden></div>' +
      '<div class="notice notice--warn sch-runbanner" data-role="run-banner" hidden>' +
        '<span data-role="run-banner-text"></span> ' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="reload">' + esc(t('reload')) + '</button>' +
      '</div>' +
      '<div class="statstrip">' +
        stat(t('statTotal'), 'total') +
        stat(t('statEnabled'), 'enabled') +
        stat(t('statDisabled'), 'disabled') +
        stat(t('statFailures'), 'failures') +
      '</div>' +
      '<section class="card">' +
        '<header class="card__head">' +
          '<h3 class="card__title">' + esc(t('listTitle')) + '</h3>' +
          '<span class="card__meta small" data-role="list-meta"></span>' +
        '</header>' +
        '<div data-role="list"></div>' +
        '<div class="sch-undo" data-role="undo" hidden>' +
          '<span data-role="undo-text"></span>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="undo-delete">' + esc(t('undoDelete')) + '</button>' +
        '</div>' +
      '</section>' +
      '<details class="card sch-raw mt-16" data-role="raw-details">' +
        '<summary>' +
          '<span class="sch-raw__title">' + esc(t('rawTitle')) + '</span>' +
          '<span class="sch-raw__path mono" data-role="raw-path"></span>' +
          '<span class="sch-raw__chev" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 6.5 8 10.5 12 6.5"/></svg></span>' +
        '</summary>' +
        '<div class="sch-raw__body">' +
          '<p class="field-box__help">' + esc(t('rawHint')) + '</p>' +
          '<textarea class="textarea textarea--code mt-8" data-role="raw-editor" rows="16" spellcheck="false" aria-label="' + esc(t('rawTitle')) + '"></textarea>' +
          '<div class="form-actions">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-action="raw-load">' + esc(t('rawLoad')) + '</button>' +
            '<button type="button" class="btn btn--primary btn--sm" data-action="raw-save">' + esc(t('save')) + '</button>' +
          '</div>' +
        '</div>' +
      '</details>' +
      editorMarkup();
  }

  /* ---------------- render ---------------- */

  function renderRunState() {
    if (!host) return;
    var badge = host.querySelector('[data-role="run-badge"]');
    var banner = host.querySelector('[data-role="run-banner"]');
    var bannerText = host.querySelector('[data-role="run-banner-text"]');
    var running = state.running;
    if (badge) {
      var text = running === true ? t('schedulerRunning') : (running === false ? t('schedulerStopped') : t('schedulerUnknown'));
      badge.className = 'badge' + (running === true ? ' badge--ok' : (running === false ? ' badge--danger' : ''));
      badge.textContent = text;
    }
    // 未运行不等于「一切正常」：明确告诉用户计划不会自动触发，并给重载入口。
    if (banner) banner.hidden = running !== false;
    if (bannerText) bannerText.textContent = t('notRunningHint');
  }

  function renderStats() {
    if (!host) return;
    var stats = state.stats || computeStats(state.entries);
    ['total', 'enabled', 'disabled', 'failures'].forEach(function (key) {
      var el = host.querySelector('[data-stat="' + key + '"]');
      if (el) el.textContent = String(Number(stats[key]) || 0);
    });
    var failStat = host.querySelector('[data-role="fail-stat"]');
    if (failStat) failStat.setAttribute('data-tone', (Number(stats.failures) || 0) > 0 ? 'danger' : '');
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

  function renderRow(status) {
    var entry = (status && status.entry) || {};
    var id = entry.id || '';
    var name = entry.name ? String(entry.name) : (id || '—');
    var failures = Number(status && status.consecutive_failures) || 0;
    var triggering = !!(status && status.triggering);
    var enabled = !!entry.enabled;
    var display = status && status.schedule_display ? String(status.schedule_display) : (humanSchedule(entry.schedule) || '—');
    var rawSchedule = entry.schedule ? String(entry.schedule) : '';
    var nextIso = status && status.next_run_at ? String(status.next_run_at) : '';
    var lastIso = status && status.last_run_at ? String(status.last_run_at) : '';
    var lastError = status && status.last_error ? String(status.last_error) : '';

    var nextCell;
    if (!enabled) {
      nextCell = '<span class="muted small">' + esc(t('nextDisabled')) + '</span>';
    } else if (nextIso) {
      nextCell = '<span class="sch-num">' + esc(relNow(nextIso)) + '</span>' +
        '<span class="sch-sub" title="' + esc(fullTime(nextIso)) + '">' + esc(T.fmtTime(nextIso)) + '</span>';
    } else {
      nextCell = '<span class="muted small">' + esc(t('nextNever')) + '</span>';
    }

    var lastCell;
    if (lastError) {
      lastCell = '<span class="badge badge--danger" title="' + esc(lastError) + '">' + esc(t('lastFailed')) + '</span>' +
        (lastIso ? '<span class="sch-sub">' + esc(relNow(lastIso)) + '</span>' : '');
    } else if (lastIso) {
      lastCell = '<span class="badge badge--ok">' + esc(t('lastOk')) + '</span>' +
        '<span class="sch-sub">' + esc(relNow(lastIso)) + '</span>';
    } else {
      lastCell = '<span class="muted small">' + esc(t('lastNever')) + '</span>';
    }

    var failCell = failures > 0
      ? '<span class="badge badge--danger" title="' + esc(lastError || t('colFailures')) + '">' + esc(t('failuresCount', { n: failures })) + '</span>'
      : '<span class="muted">' + esc(t('failuresNone')) + '</span>';

    var target = targetSummary(entry);

    return '<tr data-id="' + esc(id) + '">' +
      '<td class="sch-cell-plan" data-label="' + esc(t('colPlan')) + '">' +
        '<span class="sch-name" title="' + esc(name) + '">' + esc(name) + '</span>' +
        '<span class="sch-id">' + esc(id || '—') + '</span>' +
        (triggering ? '<span class="sch-row-badges"><span class="badge badge--warn">' + esc(t('triggering')) + '</span></span>' : '') +
      '</td>' +
      '<td data-label="' + esc(t('colTypeTarget')) + '">' +
        '<div class="sch-target">' +
          '<span class="badge">' + esc(typeLabel(entry.type)) + '</span>' +
          '<span class="sch-target__text" title="' + esc(target) + '">' + esc(target) + '</span>' +
        '</div>' +
      '</td>' +
      '<td data-label="' + esc(t('colSchedule')) + '">' +
        '<span class="sch-display">' + esc(display) + '</span>' +
        (rawSchedule && rawSchedule !== display ? '<span class="sch-sub mono">' + esc(rawSchedule) + '</span>' : '') +
      '</td>' +
      '<td data-label="' + esc(t('colNext')) + '">' + nextCell + '</td>' +
      '<td data-label="' + esc(t('colLast')) + '">' + lastCell + '</td>' +
      '<td data-label="' + esc(t('colFailures')) + '">' + failCell + '</td>' +
      '<td data-label="' + esc(t('colEnabled')) + '">' +
        '<label class="switch sch-switch">' +
          '<input type="checkbox" data-action="toggle" data-id="' + esc(id) + '"' + (enabled ? ' checked' : '') + ' aria-label="' + esc(t('colEnabled')) + '">' +
          '<span class="switch__track"></span>' +
          '<span class="sch-switch__text">' + esc(enabled ? t('switchOn') : t('switchOff')) + '</span>' +
        '</label>' +
      '</td>' +
      '<td class="sch-cell-actions" data-label="' + esc(t('colActions')) + '">' +
        '<div class="sch-actions">' +
          iconBtn('edit', id, 'edit', T.t('common.edit')) +
          iconBtn('trigger', id, 'trigger', t('triggerNow')) +
          iconBtn('delete', id, 'trash', T.t('common.delete'), ' sch-icon--danger') +
        '</div>' +
      '</td>' +
    '</tr>';
  }

  function skeletonMarkup() {
    var rows = '';
    for (var i = 0; i < 3; i++) rows += '<div class="skeleton sch-skeleton"></div>';
    return rows;
  }

  function emptyMarkup() {
    if (state.error) {
      return '<div class="empty">' +
        '<p class="empty__title">' + esc(t('loadFailed')) + '</p>' +
        '<p class="empty__hint mono">' + esc(state.error) + '</p>' +
        '<div class="empty__actions"><button type="button" class="btn btn--ghost btn--sm" data-action="refresh">' + esc(t('retry')) + '</button></div>' +
        '</div>';
    }
    var hint = state.exists === false ? t('emptyHintMissing') : t('emptyHint');
    return '<div class="empty">' +
      '<p class="empty__title">' + esc(t('emptyTitle')) + '</p>' +
      '<p class="empty__hint">' + esc(hint) + '</p>' +
      '<div class="empty__actions"><button type="button" class="btn btn--primary btn--sm" data-action="create">' + esc(t('create')) + '</button></div>' +
      '</div>';
  }

  function renderList() {
    if (!host) return;
    var box = host.querySelector('[data-role="list"]');
    if (!box) return;
    if (!state.loaded) {
      box.innerHTML = skeletonMarkup();
      return;
    }
    if (!state.entries.length) {
      box.innerHTML = emptyMarkup();
      return;
    }
    var headers = [
      t('colPlan'), t('colTypeTarget'), t('colSchedule'), t('colNext'),
      t('colLast'), t('colFailures'), t('colEnabled'), t('colActions')
    ];
    var wrap = box.querySelector('.tablewrap');
    var top = wrap ? wrap.scrollTop : 0;
    box.innerHTML = '<div class="tablewrap"><table class="table sch-table">' +
      '<thead><tr>' + headers.map(function (label) {
        return '<th>' + esc(label) + '</th>';
      }).join('') + '</tr></thead>' +
      '<tbody>' + state.entries.map(renderRow).join('') + '</tbody>' +
      '</table></div>';
    // SSE 快照与 30s 轮询都会整表重绘；保住用户的滚动位置。
    var fresh = box.querySelector('.tablewrap');
    if (fresh && top > 0) fresh.scrollTop = top;
  }

  function renderAll() {
    if (!host) return;
    renderRunState();
    renderStats();
    renderListMeta();
    renderList();
  }

  function showError(message) {
    if (!host) return;
    var el = host.querySelector('[data-role="error"]');
    if (!el) return;
    if (!message) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.innerHTML = esc(message) +
      '<button type="button" class="btn btn--ghost btn--sm sch-inline-btn" data-action="refresh">' + esc(t('retry')) + '</button>';
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
      renderStats();
      renderListMeta();
      renderList();
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
      // 立即回读 last_run / 触发状态，不等 30s 轮询或 SSE。
      refresh();
    }).catch(function (err) {
      var message = (err && err.message) || t('triggerFailed');
      showNote(message, 'danger');
      T.toast('error', message);
    }).then(function () {
      setBusy(btn, false);
    });
  }

  function triggerAll(btn) {
    var enabled = state.entries.filter(function (item) {
      return item && item.entry && item.entry.enabled;
    }).length;
    if (!enabled) { showNote(t('triggerAllNone'), 'info'); return; }
    if (!T.confirm(t('triggerAllConfirm', { n: enabled }))) return;
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
    var row = input.closest ? input.closest('tr') : null;
    var textEl = row ? row.querySelector('.sch-switch__text') : null;
    input.disabled = true;
    if (row) row.setAttribute('data-pending', 'true');
    if (textEl) textEl.textContent = t('saving');
    T.api.patch('/api/v1/schedules/' + encodeURIComponent(id) + '/enabled', { enabled: checked }).then(function () {
      T.toast('success', checked ? t('enabledToast') : t('disabledToast'));
      return refresh();
    }).catch(function (err) {
      input.checked = !checked;
      input.disabled = false;
      if (row) row.removeAttribute('data-pending');
      if (textEl) textEl.textContent = input.checked ? t('switchOn') : t('switchOff');
      T.toast('error', (err && err.message) || t('updateFailed'));
    });
  }

  function renderUndo() {
    if (!host) return;
    var bar = host.querySelector('[data-role="undo"]');
    var text = host.querySelector('[data-role="undo-text"]');
    if (!bar || !text) return;
    if (!state.undo) { bar.hidden = true; text.textContent = ''; return; }
    bar.hidden = false;
    text.textContent = t('deleteUndo', { name: state.undo.name || state.undo.entry.id || '' });
  }

  function deleteSchedule(id, name) {
    var found = findStatus(id);
    var entry = found && found.entry ? found.entry : null;
    if (!T.confirm(t('deleteConfirm', { name: name || id }))) return;
    T.api.del('/api/v1/schedules/' + encodeURIComponent(id)).then(function () {
      T.toast('success', T.t('common.deleted'));
      if (entry) {
        state.undo = { entry: entry, name: name || entry.name || id };
        renderUndo();
        if (undoTimer) clearTimeout(undoTimer);
        undoTimer = setTimeout(function () { state.undo = null; renderUndo(); }, 20000);
      }
      return refresh();
    }).catch(function (err) {
      T.toast('error', (err && err.message) || t('deleteFailed'));
    });
  }

  function undoDelete(btn) {
    if (!state.undo) return;
    var payload = JSON.parse(JSON.stringify(state.undo.entry));
    delete payload.id;
    setBusy(btn, true);
    T.api.post('/api/v1/schedules', payload).then(function () {
      T.toast('success', t('undone'));
      state.undo = null;
      if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
      renderUndo();
      return refresh();
    }).catch(function (err) {
      T.toast('error', (err && err.message) || t('saveFailed'));
    }).then(function () { setBusy(btn, false); });
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

  function checkField(name, value) {
    var el = fieldEl(name);
    if (el) el.checked = !!value;
  }

  function defaultEntry() {
    return {
      type: 'user', name: '', schedule: 'interval:2h', target: '',
      enabled: true, run_on_start: false, auto_follow: false,
      follow_members: false, skip_profile: false, no_retry: false
    };
  }

  function clearFieldError(name) {
    var input = fieldEl(name === 'mixed' ? 'users' : name);
    if (input) input.removeAttribute('aria-invalid');
    var form = formEl();
    var errorEl = form ? form.querySelector('[data-error-for="' + name + '"]') : null;
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  }

  function markFieldError(name, message) {
    var inputName = name === 'mixed' ? 'users' : name;
    var input = fieldEl(inputName);
    if (input) input.setAttribute('aria-invalid', 'true');
    var form = formEl();
    var errorEl = form ? form.querySelector('[data-error-for="' + name + '"]') : null;
    if (errorEl) { errorEl.hidden = false; errorEl.textContent = message; }
  }

  function clearAllFieldErrors() {
    ['name', 'schedule', 'target', 'mixed'].forEach(clearFieldError);
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
    if (type !== 'mixed') {
      var labelEl = form.querySelector('[data-role="target-label"]');
      var helpEl = form.querySelector('[data-role="target-help"]');
      var targetInput = fieldEl('target');
      var labelKey = type === 'list' ? 'targetListLabel' : (type === 'following' ? 'targetFollowingLabel' : 'targetUserLabel');
      var helpKey = type === 'list' ? 'targetHelpList' : (type === 'following' ? 'targetHelpFollowing' : 'targetHelpUser');
      var phKey = type === 'list' ? 'targetPlaceholderList' : (type === 'following' ? 'targetPlaceholderFollowing' : 'targetPlaceholderUser');
      if (labelEl) labelEl.textContent = t(labelKey);
      if (helpEl) helpEl.textContent = t(helpKey);
      if (targetInput) targetInput.placeholder = t(phKey);
    }
    clearFieldError('target');
    clearFieldError('mixed');
  }

  function updatePresetState() {
    var form = formEl();
    if (!form) return;
    var input = fieldEl('schedule');
    var value = input ? String(input.value || '').trim() : '';
    var matched = false;
    Array.prototype.forEach.call(form.querySelectorAll('[data-preset]'), function (btn) {
      var preset = btn.getAttribute('data-preset') || '';
      var active = preset !== '' && preset === value;
      if (active) matched = true;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (!matched) {
      Array.prototype.forEach.call(form.querySelectorAll('[data-preset=""]'), function (btn) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
      });
    }
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
      checkField(key, entry[key]);
    });
    updateTypeVisibility();
    updatePresetState();
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
    state.editingOriginal = status && status.entry ? status.entry : null;
    state.submitting = false;
    fillForm(status && status.entry ? status.entry : defaultEntry());
    clearAllFieldErrors();
    var titleEl = host.querySelector('[data-role="editor-title"]');
    if (titleEl) titleEl.textContent = state.editing ? t('editTitle') : t('createTitle');
    var descEl = host.querySelector('[data-role="editor-desc"]');
    if (descEl) descEl.textContent = state.editing ? t('editDesc', { id: state.editing }) : t('createDesc');
    showEditorError('');
    state.editorSnapshot = JSON.stringify(collectEntry());
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function editorDirty() {
    if (!host) return false;
    var dialog = host.querySelector('[data-role="editor"]');
    if (!dialog || !dialog.open || !formEl()) return false;
    if (!state.editorSnapshot) return false;
    try {
      return JSON.stringify(collectEntry()) !== state.editorSnapshot;
    } catch (e) {
      return false;
    }
  }

  // force=true 用于保存成功后的关闭；其它入口（取消/Esc/遮罩）在脏状态下先确认。
  function closeEditor(force) {
    if (!host) return false;
    if (!force && editorDirty() && !T.confirm(t('discardEdit'))) return false;
    state.editing = null;
    state.editingOriginal = null;
    state.editorSnapshot = '';
    var dialog = host.querySelector('[data-role="editor"]');
    if (dialog && dialog.open && typeof dialog.close === 'function') dialog.close();
    return true;
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

  function validSchedule(expr) {
    var value = String(expr || '').trim();
    return /^interval:\d+[smh]$/i.test(value) || /^daily:\d{1,2}:\d{2}(,\d{1,2}:\d{2})*$/.test(value);
  }

  function validateEntry(entry) {
    clearAllFieldErrors();
    var errors = [];
    // 服务端不要求名称（renderRow 回退显示 id）；仅当原条目有名称却被清空时拦截，
    // 避免历史无名条目无法原样保存。
    if (!entry.name && state.editingOriginal && state.editingOriginal.name) {
      markFieldError('name', t('errName'));
      errors.push(t('errName'));
    }
    if (!validSchedule(entry.schedule)) {
      markFieldError('schedule', t('errSchedule'));
      errors.push(t('errSchedule'));
    }
    if (entry.type === 'mixed') {
      if (!entry.users.length && !entry.lists.length && !entry.following_names.length) {
        markFieldError('mixed', t('errMixed'));
        errors.push(t('errMixed'));
      }
    } else if (!entry.target) {
      markFieldError('target', t('errTarget'));
      errors.push(t('errTarget'));
    }
    return errors;
  }

  function applyServerErrors(errors) {
    var list = Array.isArray(errors) ? errors : [];
    list.forEach(function (raw) {
      var message = String(raw || '');
      if (!message) return;
      var lower = message.toLowerCase();
      if (lower.indexOf('schedule') >= 0 && lower.indexOf('name') < 0) markFieldError('schedule', message);
      else if (lower.indexOf('name') >= 0) markFieldError('name', message);
      else if (lower.indexOf('target') >= 0) markFieldError('target', message);
      else if (lower.indexOf('users') >= 0 || lower.indexOf('lists') >= 0 || lower.indexOf('following') >= 0) markFieldError('mixed', message);
    });
  }

  function saveEditor() {
    if (!host || state.submitting) return;
    var form = formEl();
    if (!form) return;
    var saveBtn = form.querySelector('[data-role="editor-save"]');
    var entry = collectEntry();
    var localErrors = validateEntry(entry);
    if (localErrors.length) {
      showEditorError(localErrors.join('\n'));
      return;
    }
    state.submitting = true;
    setBusy(saveBtn, true);
    showEditorError('');

    T.api.post('/api/v1/schedules/validate', { entry: entry }).then(function (result) {
      if (!result || result.valid !== true) {
        var errors = result && Array.isArray(result.errors) && result.errors.length ? result.errors : [t('validationFailed')];
        applyServerErrors(errors);
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
      closeEditor(true);
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

  function rawDirty() {
    if (!host || !state.rawLoaded) return false;
    var editor = host.querySelector('[data-role="raw-editor"]');
    return !!(editor && editor.value !== ((state.raw && state.raw.content) || ''));
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
    // raw 覆盖整个 schedules.yaml：编辑器里有未保存修改时先说清楚后果。
    if (editorDirty() && !T.confirm(t('rawOverwritesForm'))) return;
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
    var btn = event.target.closest ? event.target.closest('[data-action]') : null;
    if (!btn || !host || !host.contains(btn)) return;
    var action = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id') || '';
    if (action === 'refresh') {
      setBusy(btn, true);
      refresh().then(function () { setBusy(btn, false); }, function () { setBusy(btn, false); });
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
    if (action === 'raw-load') {
      if (rawDirty() && !T.confirm(t('rawDiscard'))) return;
      loadRaw();
      return;
    }
    if (action === 'undo-delete') { undoDelete(btn); return; }
    if (action === 'raw-save') { saveRaw(); return; }
    if (action === 'preset') {
      var expr = btn.getAttribute('data-preset') || '';
      var input = fieldEl('schedule');
      if (input) {
        input.value = expr;
        clearFieldError('schedule');
        updatePresetState();
      }
      return;
    }
  }

  function onChange(event) {
    var input = event.target;
    if (!input || !input.getAttribute) return;
    if (input.getAttribute('data-action') === 'toggle') {
      toggleEnabled(input.getAttribute('data-id') || '', !!input.checked, input);
      return;
    }
    if (input.getAttribute('data-field') === 'type') {
      updateTypeVisibility();
      return;
    }
  }

  function validateEditorField() {
    if (!host || !formEl() || state.submitting) return;
    var entry = collectEntry();
    if (!validSchedule(entry.schedule)) return;
    T.api.post('/api/v1/schedules/validate', { entry: entry }).then(function (res) {
      if (!formEl()) return;
      if (res && res.valid === false) applyServerErrors(res.errors || []);
    }).catch(function () { /* 输入过程中的校验失败不打扰用户，保存时仍会拦截 */ });
  }

  function onInput(event) {
    var input = event.target;
    if (!input || !input.getAttribute) return;
    if (input.getAttribute('data-field') === 'schedule') {
      clearFieldError('schedule');
      updatePresetState();
      if (fieldValidateTimer) clearTimeout(fieldValidateTimer);
      fieldValidateTimer = setTimeout(validateEditorField, 600);
    }
  }

  function onSubmit(event) {
    var form = event.target;
    if (!form || !form.getAttribute || form.getAttribute('data-role') !== 'editor-form') return;
    event.preventDefault();
    saveEditor();
  }

  function onDetailToggle(event) {
    var details = event.target;
    if (!details || details.getAttribute('data-role') !== 'raw-details') return;
    if (details.open) {
      if (!state.rawLoaded) loadRaw();
      return;
    }
    // 收起面板等于离开 raw 编辑器：有未保存内容时先确认，取消则重新展开。
    if (rawDirty() && !T.confirm(t('rawDiscard'))) details.open = true;
  }

  function onEditorClose() {
    state.editing = null;
    state.submitting = false;
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
    host.addEventListener('input', onInput);
    host.addEventListener('submit', onSubmit);
    host.addEventListener('toggle', onDetailToggle, true);
    var dialog = host.querySelector('[data-role="editor"]');
    if (dialog) {
      dialog.addEventListener('close', onEditorClose);
      dialog.addEventListener('cancel', function (event) {
        if (editorDirty() && !T.confirm(t('discardEdit'))) event.preventDefault();
      });
    }
  }

  function unbind() {
    if (!host) return;
    host.removeEventListener('click', onClick);
    host.removeEventListener('change', onChange);
    host.removeEventListener('input', onInput);
    host.removeEventListener('submit', onSubmit);
    host.removeEventListener('toggle', onDetailToggle, true);
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
        if (!host || document.hidden) return;
        refresh();
      }, 30000);
      return {
        refresh: refresh,
        canLeave: function () {
          if (editorDirty() && !T.confirm(t('discardEdit'))) return false;
          return !rawDirty() || T.confirm(t('rawDiscard'));
        },
        destroy: function () {
          if (timer) clearInterval(timer);
          timer = null;
          if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
          if (fieldValidateTimer) { clearTimeout(fieldValidateTimer); fieldValidateTimer = null; }
          if (offSchedules) offSchedules();
          offSchedules = null;
          if (offTasks) offTasks();
          offTasks = null;
          var dialog = host ? host.querySelector('[data-role="editor"]') : null;
          if (dialog && dialog.open && typeof dialog.close === 'function') dialog.close();
          unbind();
          host = null;
        }
      };
    }
  });
})();
