/* TMD · 系统设置视图（/system）
   结构化配置字段 + 原始 conf.yaml + Cookie 账号 + 只读运行信息 + 危险操作。
   零依赖 IIFE；所有可见文案走 system.* i18n（zh-CN + en），颜色只用 CSS 变量。 */
(function () {
  'use strict';

  var T = window.TMD;
  if (!T) return;

  T.i18n.add({
    'zh-CN': {
      system: {
        title: '系统设置',
        sub: '配置字段、原始文件、Cookie 账号与运行状态；多数改动保存后需重启 TMD 生效。',
        discard: '当前有未保存的修改，确定重新加载并放弃这些修改？',
        runtime: {
          title: '运行信息',
          checkedAt: '采样 {time}',
          health: '服务状态',
          healthy: '正常',
          unhealthy: '异常',
          version: '版本 {version}',
          queue: '队列深度',
          queueSub: '运行 {active} · 等待 {pending} · 分离 {detached}',
          routine: '下载并发',
          routineSub: '取用户并发 {n}',
          db: '数据库',
          dbSub: '列表 {lists} · 媒体实体 {entities}',
          params: '只读参数',
          dbDetail: '数据库统计',
          rootPath: '存储根目录',
          maxRoutine: '最大下载并发',
          maxFetch: '取用户并发上限',
          maxFileName: '文件名长度上限',
          versionLabel: '版本',
          statusLabel: '健康状态',
          queueDetail: '队列明细',
          users: '用户',
          lists: '列表',
          userEntities: '用户媒体',
          lstEntities: '列表媒体',
          userLinks: '用户链接',
          prevNames: '改名记录',
          unavailable: '运行信息暂不可用，请稍后刷新。'
        },
        fields: {
          title: '结构化配置',
          metaExists: 'conf.yaml 已存在',
          metaMissing: 'conf.yaml 尚未创建，保存后生成',
          save: '保存配置',
          saving: '保存中…',
          reset: '放弃修改',
          clear: '清空',
          undoClear: '取消清空',
          required: '必填',
          currentMasked: '当前值 {mask}（已脱敏）',
          defaultHint: '默认 {value}',
          sensitiveHint: '已脱敏：不修改则保留；点「清空」提交 __CLEAR__。',
          saved: '配置已保存',
          restart: '部分字段（Cookie、并发等）需要重启 TMD 后才能生效。',
          none: '没有需要提交的修改。',
          empty: '没有可编辑的配置字段。',
          loadFailed: '配置字段加载失败：{msg}',
          saveFailed: '保存配置失败：{msg}',
          resetDone: '已放弃未保存的修改',
          name: {
            root_path: '存储根目录',
            auth_token: 'Auth Token',
            ct0: 'CT0',
            max_download_routine: '最大下载并发',
            max_user_fetch_concurrent: '取用户并发上限',
            max_file_name_len: '文件名长度上限',
            proxy_url: '代理地址',
            api_key: 'API Key'
          },
          group: {
            basic: '基础',
            cookie: 'Cookie',
            advanced: '高级',
            security: '安全'
          }
        },
        raw: {
          title: '原始配置 YAML',
          save: '保存 YAML',
          reload: '重新加载',
          loaded: '已加载 {path}',
          missing: '{path}（文件不存在）',
          confirm: '用编辑器内容覆盖 conf.yaml？保存前会自动备份。',
          saved: 'conf.yaml 已保存，需重启生效。',
          restart: '配置已写入，部分字段需重启 TMD 后生效。',
          empty: '内容为空，无法保存。',
          loadFailed: '原始配置加载失败：{msg}',
          saveFailed: '保存原始配置失败：{msg}'
        },
        cookies: {
          title: 'Cookie 账号',
          add: '添加账号',
          save: '保存账号',
          account: '账号 #{n}',
          isNew: '新增',
          empty: '还没有附加账号，当前只使用主账号。',
          keepHint: '脱敏值保持原样即表示保留旧值；保存后需重启 TMD 生效。',
          metaCount: '{n} 个账号',
          metaMissing: 'additional_cookies.yaml 不存在',
          saved: 'Cookie 账号已保存',
          restart: 'Cookie 改动需要重启 TMD 后才能生效。',
          none: '没有需要保存的修改。',
          bothEmpty: '第 {n} 个账号的 Auth Token 与 CT0 不能同时为空。',
          loadFailed: 'Cookie 加载失败：{msg}',
          saveFailed: '保存 Cookie 失败：{msg}',
          remove: '删除账号'
        },
        cookiesRaw: {
          title: 'Cookie 原始文本',
          save: '保存文本',
          reload: '重新加载',
          confirm: '用编辑器内容覆盖 additional_cookies.yaml？保存前会自动备份。',
          saved: 'Cookie 文件已保存，需重启生效。',
          empty: '内容为空，无法保存。',
          loadFailed: 'Cookie 原始文本加载失败：{msg}',
          saveFailed: '保存 Cookie 原始文本失败：{msg}'
        },
        danger: {
          title: '危险区',
          sub: '以下操作会中断服务或清空数据，不可撤销。',
          clearErrors: '清空失败记录',
          clearErrorsConfirm: '确定清空全部失败记录？该操作不可撤销。',
          clearErrorsDone: '失败记录已清空。',
          clearErrorsFailed: '清空失败记录失败：{msg}',
          shutdown: '关闭服务器',
          shutdownConfirm1: '确定要关闭 TMD 服务器？正在运行的任务会被中断。',
          shutdownConfirm2: '再次确认：关闭后必须手动重启服务才能恢复，继续吗？',
          shutdownRequested: '已发送关闭指令…',
          shutdownDone: '服务已关闭。请到服务器上手动重启 TMD 后再刷新此页。',
          shutdownFailed: '关闭服务器失败：{msg}'
        }
      }
    },
    'en': {
      system: {
        title: 'System',
        sub: 'Config fields, raw files, cookie accounts and runtime status. Most changes need a TMD restart.',
        discard: 'You have unsaved changes. Reload anyway and discard them?',
        runtime: {
          title: 'Runtime',
          checkedAt: 'sampled {time}',
          health: 'Service',
          healthy: 'healthy',
          unhealthy: 'unhealthy',
          version: 'version {version}',
          queue: 'Queue depth',
          queueSub: '{active} running · {pending} pending · {detached} detached',
          routine: 'Download concurrency',
          routineSub: 'user fetch {n}',
          db: 'Database',
          dbSub: '{lists} lists · {entities} media entities',
          params: 'Read-only parameters',
          dbDetail: 'Database stats',
          rootPath: 'Storage root',
          maxRoutine: 'Max download concurrency',
          maxFetch: 'Max user fetch concurrency',
          maxFileName: 'Max file name length',
          versionLabel: 'Version',
          statusLabel: 'Health',
          queueDetail: 'Queue detail',
          users: 'Users',
          lists: 'Lists',
          userEntities: 'User media',
          lstEntities: 'List media',
          userLinks: 'User links',
          prevNames: 'Renamed records',
          unavailable: 'Runtime info is unavailable. Try refreshing later.'
        },
        fields: {
          title: 'Structured config',
          sub: 'Only changed fields are submitted. Password fields are masked; leave blank to keep the current value.',
          metaExists: 'conf.yaml exists',
          metaMissing: 'conf.yaml not created yet; it will be written on save',
          save: 'Save config',
          saving: 'Saving…',
          reset: 'Discard changes',
          clear: 'Clear',
          undoClear: 'Undo clear',
          required: 'required',
          currentMasked: 'current value {mask} (masked)',
          defaultHint: 'default {value}',
          sensitiveHint: 'Masked: leave untouched to keep it; use Clear to submit __CLEAR__.',
          saved: 'Configuration saved',
          restart: 'Some fields (cookies, concurrency, …) take effect only after restarting TMD.',
          none: 'Nothing to submit.',
          empty: 'No editable config fields.',
          loadFailed: 'Could not load config fields: {msg}',
          saveFailed: 'Could not save config: {msg}',
          resetDone: 'Unsaved changes discarded',
          name: {
            root_path: 'Storage root',
            auth_token: 'Auth Token',
            ct0: 'CT0',
            max_download_routine: 'Max download concurrency',
            max_user_fetch_concurrent: 'Max user fetch concurrency',
            max_file_name_len: 'Max file name length',
            proxy_url: 'Proxy URL',
            api_key: 'API Key'
          },
          group: {
            basic: 'Basic',
            cookie: 'Cookie',
            advanced: 'Advanced',
            security: 'Security'
          }
        },
        raw: {
          title: 'Raw config YAML',
          sub: 'Edit conf.yaml directly. The server validates the YAML and keeps a backup before writing.',
          save: 'Save YAML',
          reload: 'Reload',
          loaded: 'loaded {path}',
          missing: '{path} (file missing)',
          confirm: 'Overwrite conf.yaml with the editor content? A backup is created first.',
          saved: 'conf.yaml saved. Restart TMD to apply.',
          restart: 'Config written. Some fields take effect after a TMD restart.',
          empty: 'Content is empty; nothing to save.',
          loadFailed: 'Could not load raw config: {msg}',
          saveFailed: 'Could not save raw config: {msg}'
        },
        cookies: {
          title: 'Cookie accounts',
          sub: 'Additional accounts (additional_cookies.yaml). Unchanged masked values submit __KEEP_OLD__.',
          add: 'Add account',
          save: 'Save accounts',
          account: 'Account #{n}',
          isNew: 'new',
          empty: 'No additional accounts yet; only the primary account is used.',
          keepHint: 'Leaving a masked value untouched keeps the old one. Restart TMD after saving.',
          metaCount: '{n} account(s)',
          metaMissing: 'additional_cookies.yaml does not exist',
          saved: 'Cookie accounts saved',
          restart: 'Cookie changes take effect after restarting TMD.',
          none: 'Nothing to save.',
          bothEmpty: 'Account #{n}: Auth Token and CT0 cannot both be empty.',
          loadFailed: 'Could not load cookies: {msg}',
          saveFailed: 'Could not save cookies: {msg}',
          remove: 'Remove account'
        },
        cookiesRaw: {
          title: 'Raw cookie text',
          sub: 'Edit additional_cookies.yaml directly: a list of auth_token / ct0 accounts.',
          save: 'Save text',
          reload: 'Reload',
          confirm: 'Overwrite additional_cookies.yaml with the editor content? A backup is created first.',
          saved: 'Cookie file saved. Restart TMD to apply.',
          empty: 'Content is empty; nothing to save.',
          loadFailed: 'Could not load raw cookies: {msg}',
          saveFailed: 'Could not save raw cookies: {msg}'
        },
        danger: {
          title: 'Danger zone',
          sub: 'These actions interrupt the service or erase data and cannot be undone.',
          clearErrors: 'Clear failure log',
          clearErrorsConfirm: 'Clear the whole failure log? This cannot be undone.',
          clearErrorsDone: 'Failure log cleared.',
          clearErrorsFailed: 'Could not clear failure log: {msg}',
          shutdown: 'Shut down server',
          shutdownConfirm1: 'Shut down the TMD server? Running tasks will be interrupted.',
          shutdownConfirm2: 'Confirm again: the server must be started manually afterwards. Continue?',
          shutdownRequested: 'Shutdown requested…',
          shutdownDone: 'Server is shut down. Start TMD manually on the host, then reload this page.',
          shutdownFailed: 'Could not shut down the server: {msg}'
        }
      }
    }
  });

  var GROUPS = ['basic', 'cookie', 'advanced', 'security'];

  var host = null;
  var timer = null;
  var busy = { fields: false, raw: false, cookies: false, cookiesRaw: false };

  var S = {
    fields: [],
    fieldsExists: false,
    fieldsError: null,
    raw: { content: '', path: '', exists: false },
    rawError: null,
    cookies: [],
    cookieExists: false,
    cookiesError: null,
    cookieDraft: [],
    cookiesRaw: { content: '', path: '', exists: false },
    cookiesRawError: null,
    info: { config: null, health: null, queue: null, db: null }
  };

  function t(key, vars) { return T.t('system.' + key, vars); }
  function esc(v) { return T.esc(v); }
  function isMasked(v) {
    var s = String(v === undefined || v === null ? '' : v);
    return s === '***' || s.indexOf('•••') !== -1;
  }
  function errText(err) {
    return err && err.message ? err.message : String(err);
  }

  /* ---------------- view-local styles ---------------- */

  function injectStyle() {
    T.injectStyle('view-system-style', [
      '.sys-acct + .sys-acct { margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--border); }',
      '.sys-info-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 6px 0; }',
      '.sys-info-row + .sys-info-row { border-top: 1px dashed var(--border); }',
      '.sys-info-key { flex: none; color: var(--muted); font-size: 12.5px; }',
      '.sys-info-val { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size: 12.5px; text-align: right; overflow-wrap: anywhere; }',
      '.field-box[data-clearing="1"] [data-input] { opacity: .55; text-decoration: line-through; }',
      '.sys-inline-actions { display: flex; align-items: center; gap: 6px; flex: none; }'
    ].join('\n'));
  }

  /* ---------------- markup ---------------- */

  function notice(kind, text) {
    return '<p class="notice' + (kind ? ' notice--' + kind : '') + '">' + esc(text) + '</p>';
  }

  function infoRow(label, value) {
    return '<div class="sys-info-row">' +
      '<span class="sys-info-key">' + esc(label) + '</span>' +
      '<span class="sys-info-val">' + esc(value) + '</span>' +
      '</div>';
  }

  function kpiBox(key, label, value, sub) {
    return '<div class="kpi">' +
      '<div class="kpi__label">' + esc(label) + '</div>' +
      '<div class="kpi__value kpi__value--sm" data-kpi="' + esc(key) + '">' + esc(value) + '</div>' +
      '<div class="kpi__sub" data-kpi="' + esc(key) + '-sub">' + esc(sub) + '</div>' +
      '</div>';
  }

  function skeletonKpis() {
    var html = '';
    for (var i = 0; i < 4; i++) {
      html += '<div class="kpi">' +
        '<div class="skeleton" style="height:12px;width:46%"></div>' +
        '<div class="skeleton mt-8" style="height:22px;width:64%"></div>' +
        '<div class="skeleton mt-8" style="height:11px;width:76%"></div>' +
        '</div>';
    }
    return html;
  }

  function markup() {
    return '' +
      '<div class="view-head">' +
        '<div class="view-head__text">' +
          '<h1 class="view-title">' + esc(t('title')) + '</h1>' +
          '<p class="view-sub">' + esc(t('sub')) + '</p>' +
        '</div>' +
        '<div class="view-head__actions">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="refresh">' + esc(T.t('common.refresh')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="stack">' +

        '<section class="card">' +
          '<header class="card__head">' +
            '<h3 class="card__title">' + esc(t('fields.title')) + '</h3>' +
            '<span class="card__meta" data-role="fields-meta"></span>' +
          '</header>' +
          '<div data-role="fields-body"></div>' +
        '</section>' +

        '<section class="card">' +
          '<header class="card__head">' +
            '<h3 class="card__title">' + esc(t('cookies.title')) + '</h3>' +
            '<span class="card__meta" data-role="cookies-meta"></span>' +
            '<div class="card__actions">' +
              '<button type="button" class="btn btn--ghost btn--sm" data-action="cookie-add">' + esc(t('cookies.add')) + '</button>' +
              '<button type="button" class="btn btn--primary btn--sm" data-action="cookie-save">' + esc(t('cookies.save')) + '</button>' +
            '</div>' +
          '</header>' +
          '<div data-role="cookies-body"></div>' +
          '<div class="mt-12" data-role="cookies-msg"></div>' +
        '</section>' +

        '<div class="grid-2">' +
          '<section class="card">' +
            '<header class="card__head">' +
              '<h3 class="card__title">' + esc(t('raw.title')) + '</h3>' +
            '</header>' +
            '<span class="small muted mono" data-role="raw-meta"></span>' +
            '<textarea class="textarea textarea--code mt-8" rows="16" spellcheck="false" autocomplete="off" data-role="raw-editor" aria-label="' + esc(t('raw.title')) + '" disabled></textarea>' +
            '<div class="mt-12" data-role="raw-msg"></div>' +
            '<div class="form-actions">' +
              '<button type="button" class="btn btn--ghost" data-action="raw-reload">' + esc(t('raw.reload')) + '</button>' +
              '<button type="button" class="btn btn--primary" data-action="raw-save">' + esc(t('raw.save')) + '</button>' +
            '</div>' +
          '</section>' +
          '<section class="card">' +
            '<header class="card__head">' +
              '<h3 class="card__title">' + esc(t('cookiesRaw.title')) + '</h3>' +
            '</header>' +
            '<span class="small muted mono" data-role="cookies-raw-meta"></span>' +
            '<textarea class="textarea textarea--code mt-8" rows="16" spellcheck="false" autocomplete="off" data-role="cookies-raw-editor" aria-label="' + esc(t('cookiesRaw.title')) + '" disabled></textarea>' +
            '<div class="mt-12" data-role="cookies-raw-msg"></div>' +
            '<div class="form-actions">' +
              '<button type="button" class="btn btn--ghost" data-action="cookies-raw-reload">' + esc(t('cookiesRaw.reload')) + '</button>' +
              '<button type="button" class="btn btn--primary" data-action="cookies-raw-save">' + esc(t('cookiesRaw.save')) + '</button>' +
            '</div>' +
          '</section>' +
        '</div>' +

        '<section class="card">' +
          '<header class="card__head">' +
            '<h3 class="card__title">' + esc(t('runtime.title')) + '</h3>' +
            '<span class="card__meta" data-role="runtime-meta"></span>' +
          '</header>' +
          '<div class="grid-4" data-role="runtime-kpis"></div>' +
          '<div class="grid-2 mt-16" data-role="runtime-detail"></div>' +
          '<div class="mt-12" data-role="runtime-msg"></div>' +
        '</section>' +

        '<section class="card">' +
          '<header class="card__head">' +
            '<h3 class="card__title">' + esc(t('danger.title')) + '</h3>' +
          '</header>' +
          '<p class="small muted">' + esc(t('danger.sub')) + '</p>' +
          '<div class="mt-12" data-role="danger-msg"></div>' +
          '<div class="row-flex mt-12">' +
            '<button type="button" class="btn btn--ghost btn--danger" data-action="clear-errors">' + esc(t('danger.clearErrors')) + '</button>' +
            '<button type="button" class="btn btn--ghost btn--danger" data-action="shutdown">' + esc(t('danger.shutdown')) + '</button>' +
          '</div>' +
        '</section>' +

      '</div>';
  }

  function renderLoading() {
    if (!host) return;
    var fieldsBody = host.querySelector('[data-role="fields-body"]');
    if (fieldsBody) fieldsBody.innerHTML = '<p class="empty">' + esc(T.t('common.loading')) + '</p>';
    var cookiesBody = host.querySelector('[data-role="cookies-body"]');
    if (cookiesBody) cookiesBody.innerHTML = '<p class="empty">' + esc(T.t('common.loading')) + '</p>';
    var kpis = host.querySelector('[data-role="runtime-kpis"]');
    if (kpis) kpis.innerHTML = skeletonKpis();
    var detail = host.querySelector('[data-role="runtime-detail"]');
    if (detail) detail.innerHTML = '';
  }

  function setMsg(role, text, kind) {
    if (!host) return;
    var el = host.querySelector('[data-role="' + role + '"]');
    if (!el) return;
    el.innerHTML = text ? notice(kind || '', text) : '';
  }

  /* ---------------- structured config fields ---------------- */

  function groupFields(fields) {
    var map = {};
    var order = [];
    fields.forEach(function (field) {
      var group = field.group || 'basic';
      if (!map[group]) { map[group] = []; order.push(group); }
      map[group].push(field);
    });
    var known = GROUPS.filter(function (group) { return map[group] && map[group].length; });
    var extra = order.filter(function (group) { return GROUPS.indexOf(group) === -1; });
    return known.concat(extra).map(function (group) {
      return { id: group, fields: map[group] };
    });
  }

  function fieldLabel(field) {
    var translated = t('fields.name.' + field.name);
    if (translated === 'system.fields.name.' + field.name) return field.label || field.name;
    return translated;
  }

  function groupLabel(group) {
    var translated = t('fields.group.' + group);
    if (translated === 'system.fields.group.' + group) return group;
    return translated;
  }

  function fieldControl(field, attrs) {
    var value = field.value === undefined || field.value === null ? '' : String(field.value);
    var type = field.type || 'text';
    if (type === 'number') {
      return '<input class="input" type="number" inputmode="numeric"' + attrs + ' value="' + esc(value) + '">';
    }
    if (type === 'password') {
      return '<input class="input" type="password" autocomplete="new-password"' + attrs + '>';
    }
    if (type === 'textarea') {
      return '<textarea class="textarea"' + attrs + ' rows="3">' + esc(value) + '</textarea>';
    }
    if (type === 'select' && Object.prototype.toString.call(field.options) === '[object Array]') {
      var options = ['<option value="">' + esc(field.placeholder || '—') + '</option>'];
      field.options.forEach(function (option) {
        var optValue = option && typeof option === 'object' ? option.value : option;
        var optLabel = option && typeof option === 'object' ? (option.label || option.value) : option;
        var selected = String(optValue) === value ? ' selected' : '';
        options.push('<option value="' + esc(optValue) + '"' + selected + '>' + esc(optLabel) + '</option>');
      });
      return '<select class="select"' + attrs + '>' + options.join('') + '</select>';
    }
    return '<input class="input" type="text"' + attrs + ' value="' + esc(value) + '">';
  }

  function fieldBox(field) {
    var type = field.type || 'text';
    var sensitive = type === 'password';
    var masked = isMasked(field.value);
    var wide = type === 'textarea' || field.name === 'root_path' || field.name === 'proxy_url' || field.name === 'api_key';
    var id = 'cfg-' + field.name;
    var extras = [];
    if (masked) extras.push(t('fields.currentMasked', { mask: field.value }));
    if (field.default && type === 'number') extras.push(t('fields.defaultHint', { value: field.default }));
    if (sensitive) extras.push(t('fields.sensitiveHint'));

    var attrs = ' id="' + esc(id) + '" data-input' +
      ' data-orig="' + esc(sensitive ? '' : (field.value === undefined || field.value === null ? '' : field.value)) + '"' +
      (sensitive ? ' data-masked="1"' : '') +
      ' placeholder="' + esc(field.placeholder || '') + '"' +
      ' autocomplete="off" spellcheck="false"';

    return '<div class="field-box' + (wide ? ' field-box--wide' : '') + '" data-field="' + esc(field.name) + '">' +
      '<label class="field-box__label" for="' + esc(id) + '">' +
        esc(fieldLabel(field)) +
        (field.required ? ' <span class="badge">' + esc(t('fields.required')) + '</span>' : '') +
      '</label>' +
      '<div class="row-flex">' +
        fieldControl(field, attrs) +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="field-clear" data-field="' + esc(field.name) + '">' + esc(t('fields.clear')) + '</button>' +
      '</div>' +
      (field.prompt ? '<p class="field-box__help">' + esc(field.prompt) + '</p>' : '') +
      (extras.length ? '<p class="field-box__help">' + esc(extras.join(' · ')) + '</p>' : '') +
      '</div>';
  }

  function fieldsMarkup() {
    if (S.fieldsError) return notice('danger', t('fields.loadFailed', { msg: S.fieldsError }));
    if (!S.fields.length) return '<p class="empty">' + esc(t('fields.empty')) + '</p>';

    var groups = groupFields(S.fields);
    var html = '<form data-role="fields-form" novalidate autocomplete="off">';
    groups.forEach(function (group) {
      html += '<div class="mt-16" data-group="' + esc(group.id) + '">' +
        '<div class="row-flex"><span class="badge badge--info">' + esc(groupLabel(group.id)) + '</span></div>' +
        '<div class="form-grid mt-8">' + group.fields.map(fieldBox).join('') + '</div>' +
        '</div>';
    });
    html += '<div class="mt-12" data-role="fields-msg"></div>' +
      '<div class="form-actions">' +
        '<button type="button" class="btn btn--ghost" data-action="fields-reset">' + esc(t('fields.reset')) + '</button>' +
        '<button type="submit" class="btn btn--primary"' + (busy.fields ? ' disabled' : '') + '>' +
          esc(busy.fields ? t('fields.saving') : t('fields.save')) +
        '</button>' +
      '</div></form>';
    return html;
  }

  function renderFields() {
    if (!host) return;
    var body = host.querySelector('[data-role="fields-body"]');
    if (body) body.innerHTML = fieldsMarkup();
    var meta = host.querySelector('[data-role="fields-meta"]');
    if (meta) meta.textContent = S.fieldsExists ? t('fields.metaExists') : t('fields.metaMissing');
    if (!S.fieldsError) setMsg('fields-msg', '', '');
  }

  function collectFields() {
    var out = {};
    if (!host) return out;
    S.fields.forEach(function (field) {
      var box = host.querySelector('[data-field="' + field.name + '"]');
      if (!box) return;
      if (box.getAttribute('data-clearing') === '1') { out[field.name] = '__CLEAR__'; return; }
      var input = box.querySelector('[data-input]');
      if (!input) return;
      var value = String(input.value);
      if (value === input.getAttribute('data-orig')) return;
      if (value.trim() === '') {
        if (input.getAttribute('data-masked') === '1') return;
        out[field.name] = '__CLEAR__';
        return;
      }
      out[field.name] = value;
    });
    return out;
  }

  function toggleFieldClear(name) {
    if (!host) return;
    var box = host.querySelector('[data-field="' + name + '"]');
    if (!box) return;
    var input = box.querySelector('[data-input]');
    var button = box.querySelector('[data-action="field-clear"]');
    var clearing = box.getAttribute('data-clearing') === '1';
    if (clearing) {
      box.removeAttribute('data-clearing');
      if (input && input._prevValue !== undefined) input.value = input._prevValue;
      if (input) input.disabled = false;
      if (button) button.textContent = t('fields.clear');
    } else {
      box.setAttribute('data-clearing', '1');
      if (input) {
        input._prevValue = input.value;
        input.value = '';
        input.disabled = true;
      }
      if (button) button.textContent = t('fields.undoClear');
    }
  }

  function saveFields() {
    if (busy.fields) return;
    var payload = collectFields();
    if (!Object.keys(payload).length) {
      T.toast('info', t('fields.none'));
      return;
    }
    busy.fields = true;
    renderFields();
    T.api.put('/api/v1/config/fields', { fields: payload }).then(function (res) {
      if (res && Object.prototype.toString.call(res.fields) === '[object Array]') S.fields = res.fields;
      S.fieldsError = null;
      busy.fields = false;
      renderFields();
      setMsg('fields-msg', t('fields.restart'), 'warn');
      T.toast('success', t('fields.saved'));
      loadRuntime();
      T.reload();
    }, function (err) {
      busy.fields = false;
      renderFields();
      setMsg('fields-msg', t('fields.saveFailed', { msg: errText(err) }), 'danger');
      if (!err || err.status !== 401) T.toast('error', errText(err));
    });
  }

  function loadFields() {
    return T.api.get('/api/v1/config/fields').then(function (res) {
      S.fields = (res && Object.prototype.toString.call(res.fields) === '[object Array]') ? res.fields : [];
      S.fieldsExists = !!(res && res.exists);
      S.fieldsError = null;
    }, function (err) {
      S.fieldsError = errText(err);
    }).then(renderFields);
  }

  /* ---------------- raw config editor ---------------- */

  function renderRaw() {
    if (!host) return;
    var editor = host.querySelector('[data-role="raw-editor"]');
    var meta = host.querySelector('[data-role="raw-meta"]');
    if (!editor) return;
    if (S.rawError) {
      editor.value = '';
      editor.disabled = true;
      if (meta) meta.textContent = '';
      setMsg('raw-msg', t('raw.loadFailed', { msg: S.rawError }), 'danger');
      return;
    }
    editor.value = S.raw.content;
    editor.disabled = false;
    setMsg('raw-msg', '', '');
    if (meta) {
      meta.textContent = S.raw.path
        ? (S.raw.exists ? t('raw.loaded', { path: S.raw.path }) : t('raw.missing', { path: S.raw.path }))
        : '';
    }
  }

  function loadRaw() {
    return T.api.get('/api/v1/config/raw').then(function (res) {
      S.raw = {
        content: (res && res.content) || '',
        path: (res && res.path) || '',
        exists: !!(res && res.exists)
      };
      S.rawError = null;
    }, function (err) {
      S.rawError = errText(err);
    }).then(renderRaw);
  }

  function rawDirty() {
    if (!host) return false;
    var editor = host.querySelector('[data-role="raw-editor"]');
    return !!(editor && editor.value !== S.raw.content);
  }

  function saveRaw() {
    if (busy.raw || !host) return;
    var editor = host.querySelector('[data-role="raw-editor"]');
    if (!editor) return;
    var content = editor.value;
    if (!content.trim()) { T.toast('error', t('raw.empty')); return; }
    if (!T.confirm(t('raw.confirm'))) return;
    busy.raw = true;
    T.api.put('/api/v1/config/raw', { content: content }).then(function () {
      S.raw.content = content;
      busy.raw = false;
      setMsg('raw-msg', t('raw.restart'), 'warn');
      T.toast('success', t('raw.saved'));
      loadFields();
      loadRuntime();
      T.reload();
    }, function (err) {
      busy.raw = false;
      setMsg('raw-msg', t('raw.saveFailed', { msg: errText(err) }), 'danger');
      if (!err || err.status !== 401) T.toast('error', errText(err));
    });
  }

  /* ---------------- cookie accounts ---------------- */

  function cookieRow(row, index) {
    var existing = row.index !== null && row.index !== undefined;
    var tokenId = 'cookie-' + index + '-auth_token';
    var ct0Id = 'cookie-' + index + '-ct0';
    return '<div class="sys-acct" data-cookie-row="' + index + '"' +
      ' data-source-index="' + (existing ? esc(row.index) : '') + '">' +
      '<div class="row-flex">' +
        '<span class="badge">' + esc(t('cookies.account', { n: index + 1 })) + '</span>' +
        (existing ? '' : '<span class="badge badge--info">' + esc(t('cookies.isNew')) + '</span>') +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-action="cookie-remove" title="' + esc(t('cookies.remove')) + '">' + esc(T.t('common.delete')) + '</button>' +
      '</div>' +
      '<div class="form-grid mt-8">' +
        '<div class="field-box">' +
          '<label class="field-box__label" for="' + esc(tokenId) + '">Auth Token</label>' +
          '<input class="input mono" id="' + esc(tokenId) + '" type="text" spellcheck="false" autocomplete="off"' +
            ' data-cookie="auth_token" data-orig="' + esc(row.origAuth) + '"' +
            ' value="' + esc(row.auth_token) + '" placeholder="auth_token">' +
        '</div>' +
        '<div class="field-box">' +
          '<label class="field-box__label" for="' + esc(ct0Id) + '">CT0</label>' +
          '<input class="input mono" id="' + esc(ct0Id) + '" type="text" spellcheck="false" autocomplete="off"' +
            ' data-cookie="ct0" data-orig="' + esc(row.origCt0) + '"' +
            ' value="' + esc(row.ct0) + '" placeholder="ct0">' +
        '</div>' +
      '</div>' +
      '</div>';
  }

  function renderCookies() {
    if (!host) return;
    var body = host.querySelector('[data-role="cookies-body"]');
    var meta = host.querySelector('[data-role="cookies-meta"]');
    if (!body) return;
    if (S.cookiesError) {
      body.innerHTML = notice('danger', t('cookies.loadFailed', { msg: S.cookiesError }));
      if (meta) meta.textContent = '';
      return;
    }
    if (!S.cookieDraft.length) {
      body.innerHTML = '<p class="empty">' + esc(t('cookies.empty')) + '</p>';
    } else {
      body.innerHTML = S.cookieDraft.map(cookieRow).join('') +
        '<p class="field-box__help mt-12">' + esc(t('cookies.keepHint')) + '</p>';
    }
    if (meta) {
      meta.textContent = S.cookieExists
        ? t('cookies.metaCount', { n: S.cookies.length })
        : t('cookies.metaMissing');
    }
    setMsg('cookies-msg', '', '');
  }

  function loadCookies() {
    return T.api.get('/api/v1/cookies').then(function (res) {
      S.cookies = (res && Object.prototype.toString.call(res.items) === '[object Array]') ? res.items : [];
      S.cookieExists = !!(res && res.exists);
      S.cookiesError = null;
      S.cookieDraft = S.cookies.map(function (item) {
        return {
          index: item.index,
          auth_token: item.auth_token || '',
          ct0: item.ct0 || '',
          origAuth: item.auth_token || '',
          origCt0: item.ct0 || ''
        };
      });
    }, function (err) {
      S.cookiesError = errText(err);
    }).then(renderCookies);
  }

  function syncCookieDraft() {
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('[data-cookie-row]'), function (rowEl) {
      var index = Number(rowEl.getAttribute('data-cookie-row'));
      var draft = S.cookieDraft[index];
      if (!draft) return;
      var token = rowEl.querySelector('[data-cookie="auth_token"]');
      var ct0 = rowEl.querySelector('[data-cookie="ct0"]');
      if (token) draft.auth_token = token.value;
      if (ct0) draft.ct0 = ct0.value;
    });
  }

  function addCookie() {
    syncCookieDraft();
    S.cookieDraft.push({ index: null, auth_token: '', ct0: '', origAuth: '', origCt0: '' });
    renderCookies();
    var rows = host ? host.querySelectorAll('[data-cookie-row]') : [];
    var last = rows.length ? rows[rows.length - 1] : null;
    if (last) {
      var input = last.querySelector('[data-cookie="auth_token"]');
      if (input) input.focus();
    }
  }

  function removeCookie(rowEl) {
    if (!rowEl) return;
    syncCookieDraft();
    var index = Number(rowEl.getAttribute('data-cookie-row'));
    if (isNaN(index) || index < 0 || index >= S.cookieDraft.length) return;
    S.cookieDraft.splice(index, 1);
    renderCookies();
  }

  function cookiesDirty() {
    if (!host) return false;
    if (S.cookieDraft.length !== S.cookies.length) return true;
    var dirty = false;
    for (var i = 0; i < S.cookieDraft.length; i++) {
      var draft = S.cookieDraft[i];
      if (!draft || draft.index === null || draft.index === undefined) return true;
    }
    Array.prototype.forEach.call(host.querySelectorAll('[data-cookie-row]'), function (rowEl) {
      if (dirty) return;
      var inputs = rowEl.querySelectorAll('[data-cookie]');
      Array.prototype.forEach.call(inputs, function (input) {
        if (input.value !== input.getAttribute('data-orig')) dirty = true;
      });
    });
    return dirty;
  }

  function collectCookies() {
    var payload = [];
    var emptyAccounts = [];
    if (!host) return { payload: payload, emptyAccounts: emptyAccounts };
    Array.prototype.forEach.call(host.querySelectorAll('[data-cookie-row]'), function (rowEl, index) {
      var sourceIndex = rowEl.getAttribute('data-source-index');
      var existing = sourceIndex !== null && sourceIndex !== '';
      var tokenInput = rowEl.querySelector('[data-cookie="auth_token"]');
      var ct0Input = rowEl.querySelector('[data-cookie="ct0"]');
      var token = tokenInput ? tokenInput.value : '';
      var ct0 = ct0Input ? ct0Input.value : '';
      var origToken = tokenInput ? tokenInput.getAttribute('data-orig') : '';
      var origCt0 = ct0Input ? ct0Input.getAttribute('data-orig') : '';
      var item = {};
      var resolvedToken;
      var resolvedCt0;
      if (existing) item.index = Number(sourceIndex);
      if (existing && token === origToken) {
        item.auth_token = '__KEEP_OLD__';
        resolvedToken = origToken;
      } else {
        item.auth_token = token;
        resolvedToken = token;
      }
      if (existing && ct0 === origCt0) {
        item.ct0 = '__KEEP_OLD__';
        resolvedCt0 = origCt0;
      } else {
        item.ct0 = ct0;
        resolvedCt0 = ct0;
      }
      if (!String(resolvedToken).trim() && !String(resolvedCt0).trim()) {
        emptyAccounts.push(index + 1);
        return;
      }
      payload.push(item);
    });
    return { payload: payload, emptyAccounts: emptyAccounts };
  }

  function saveCookies() {
    if (busy.cookies) return;
    var result = collectCookies();
    if (result.emptyAccounts.length) {
      T.toast('error', t('cookies.bothEmpty', { n: result.emptyAccounts[0] }));
      return;
    }
    if (!result.payload.length && !S.cookies.length) {
      T.toast('info', t('cookies.none'));
      return;
    }
    busy.cookies = true;
    T.api.put('/api/v1/cookies', { cookies: result.payload }).then(function () {
      busy.cookies = false;
      T.toast('success', t('cookies.saved'));
      return loadCookies().then(function () {
        setMsg('cookies-msg', t('cookies.restart'), 'warn');
      });
    }, function (err) {
      busy.cookies = false;
      setMsg('cookies-msg', t('cookies.saveFailed', { msg: errText(err) }), 'danger');
      if (!err || err.status !== 401) T.toast('error', errText(err));
    });
  }

  /* ---------------- raw cookies editor ---------------- */

  function renderCookiesRaw() {
    if (!host) return;
    var editor = host.querySelector('[data-role="cookies-raw-editor"]');
    var meta = host.querySelector('[data-role="cookies-raw-meta"]');
    if (!editor) return;
    if (S.cookiesRawError) {
      editor.value = '';
      editor.disabled = true;
      if (meta) meta.textContent = '';
      setMsg('cookies-raw-msg', t('cookiesRaw.loadFailed', { msg: S.cookiesRawError }), 'danger');
      return;
    }
    editor.value = S.cookiesRaw.content;
    editor.disabled = false;
    setMsg('cookies-raw-msg', '', '');
    if (meta) {
      meta.textContent = S.cookiesRaw.path
        ? (S.cookiesRaw.exists ? t('raw.loaded', { path: S.cookiesRaw.path }) : t('raw.missing', { path: S.cookiesRaw.path }))
        : '';
    }
  }

  function loadCookiesRaw() {
    return T.api.get('/api/v1/cookies/raw').then(function (res) {
      S.cookiesRaw = {
        content: (res && res.content) || '',
        path: (res && res.path) || '',
        exists: !!(res && res.exists)
      };
      S.cookiesRawError = null;
    }, function (err) {
      S.cookiesRawError = errText(err);
    }).then(renderCookiesRaw);
  }

  function cookiesRawDirty() {
    if (!host) return false;
    var editor = host.querySelector('[data-role="cookies-raw-editor"]');
    return !!(editor && editor.value !== S.cookiesRaw.content);
  }

  function saveCookiesRaw() {
    if (busy.cookiesRaw || !host) return;
    var editor = host.querySelector('[data-role="cookies-raw-editor"]');
    if (!editor) return;
    var content = editor.value;
    if (!content.trim()) { T.toast('error', t('cookiesRaw.empty')); return; }
    if (!T.confirm(t('cookiesRaw.confirm'))) return;
    busy.cookiesRaw = true;
    T.api.put('/api/v1/cookies/raw', { content: content }).then(function () {
      S.cookiesRaw.content = content;
      busy.cookiesRaw = false;
      setMsg('cookies-raw-msg', t('cookies.restart'), 'warn');
      T.toast('success', t('cookiesRaw.saved'));
      loadCookies();
    }, function (err) {
      busy.cookiesRaw = false;
      setMsg('cookies-raw-msg', t('cookiesRaw.saveFailed', { msg: errText(err) }), 'danger');
      if (!err || err.status !== 401) T.toast('error', errText(err));
    });
  }

  /* ---------------- runtime info ---------------- */

  function renderRuntime() {
    if (!host) return;
    var kpis = host.querySelector('[data-role="runtime-kpis"]');
    var detail = host.querySelector('[data-role="runtime-detail"]');
    var meta = host.querySelector('[data-role="runtime-meta"]');
    if (!kpis || !detail) return;

    var config = S.info.config;
    var health = S.info.health;
    var queue = S.info.queue;
    var db = S.info.db;
    var any = !!(config || health || queue || db);

    if (!any) {
      kpis.innerHTML = '';
      detail.innerHTML = '';
      if (meta) meta.textContent = '';
      setMsg('runtime-msg', t('runtime.unavailable'), 'danger');
      return;
    }

    var statusText = health ? (health.status === 'ok' ? t('runtime.healthy') : (health.status || t('runtime.unhealthy'))) : '—';
    var entities = (Number(db && db.user_entities) || 0) + (Number(db && db.lst_entities) || 0);
    kpis.innerHTML = [
      kpiBox('health', t('runtime.health'), statusText, t('runtime.version', { version: (health && health.version) || '—' })),
      kpiBox('queue', t('runtime.queue'), String(queue ? (Number(queue.queue_depth) || 0) : '—'), t('runtime.queueSub', {
        active: queue ? (Number(queue.active_jobs) || 0) : '—',
        pending: queue ? (Number(queue.pending_jobs) || 0) : '—',
        detached: queue ? (Number(queue.detached_jobs) || 0) : '—'
      })),
      kpiBox('routine', t('runtime.routine'), config ? String(Number(config.max_download_routine) || 0) : '—', t('runtime.routineSub', {
        n: config ? (Number(config.max_user_fetch_concurrent) || 0) : '—'
      })),
      kpiBox('db', t('runtime.db'), db ? String(Number(db.users) || 0) : '—', t('runtime.dbSub', {
        lists: db ? (Number(db.lsts) || 0) : '—',
        entities: db ? entities : '—'
      }))
    ].join('');

    detail.innerHTML = '<div>' +
        '<p class="field-box__label">' + esc(t('runtime.params')) + '</p>' +
        infoRow(t('runtime.rootPath'), config && config.root_path ? config.root_path : '—') +
        infoRow(t('runtime.maxRoutine'), config ? String(config.max_download_routine) : '—') +
        infoRow(t('runtime.maxFetch'), config ? String(config.max_user_fetch_concurrent) : '—') +
        infoRow(t('runtime.maxFileName'), config ? String(config.max_file_name_len) : '—') +
        infoRow(t('runtime.statusLabel'), health ? String(health.status || '—') : '—') +
        infoRow(t('runtime.versionLabel'), health ? String(health.version || '—') : '—') +
        infoRow(t('runtime.queueDetail'), queue
          ? t('runtime.queueSub', {
            active: Number(queue.active_jobs) || 0,
            pending: Number(queue.pending_jobs) || 0,
            detached: Number(queue.detached_jobs) || 0
          })
          : '—') +
      '</div>' +
      '<div>' +
        '<p class="field-box__label">' + esc(t('runtime.dbDetail')) + '</p>' +
        infoRow(t('runtime.users'), db ? String(db.users || 0) : '—') +
        infoRow(t('runtime.lists'), db ? String(db.lsts || 0) : '—') +
        infoRow(t('runtime.userEntities'), db ? String(db.user_entities || 0) : '—') +
        infoRow(t('runtime.lstEntities'), db ? String(db.lst_entities || 0) : '—') +
        infoRow(t('runtime.userLinks'), db ? String(db.user_links || 0) : '—') +
        infoRow(t('runtime.prevNames'), db ? String(db.user_previous_names || 0) : '—') +
      '</div>';

    setMsg('runtime-msg', '', '');
    if (meta) meta.textContent = t('runtime.checkedAt', { time: T.fmtTime(new Date().toISOString()) });
  }

  function loadRuntime() {
    function swallow(fn) {
      return function (err) {
        fn(null);
        return err;
      };
    }
    var jobs = [
      T.api.get('/api/v1/config').then(function (data) { S.info.config = data || null; }, swallow(function () { S.info.config = null; })),
      T.api.get('/api/v1/health').then(function (data) { S.info.health = data || null; }, swallow(function () { S.info.health = null; })),
      T.api.get('/api/v1/queue/status').then(function (data) { S.info.queue = data || null; }, swallow(function () { S.info.queue = null; })),
      T.api.get('/api/v1/db/stats').then(function (data) { S.info.db = data || null; }, swallow(function () { S.info.db = null; }))
    ];
    return Promise.all(jobs).then(renderRuntime);
  }

  /* ---------------- danger zone ---------------- */

  function clearErrors(button) {
    if (!T.confirm(t('danger.clearErrorsConfirm'))) return;
    if (button) button.disabled = true;
    T.api.del('/api/v1/errors').then(function () {
      if (button) button.disabled = false;
      setMsg('danger-msg', t('danger.clearErrorsDone'), 'ok');
      T.toast('success', t('danger.clearErrorsDone'));
      T.reload();
    }, function (err) {
      if (button) button.disabled = false;
      setMsg('danger-msg', t('danger.clearErrorsFailed', { msg: errText(err) }), 'danger');
      if (!err || err.status !== 401) T.toast('error', errText(err));
    });
  }

  function shutdownServer(button) {
    if (!T.confirm(t('danger.shutdownConfirm1'))) return;
    if (!T.confirm(t('danger.shutdownConfirm2'))) return;
    setMsg('danger-msg', t('danger.shutdownRequested'), 'warn');
    if (button) button.disabled = true;
    if (timer) { clearInterval(timer); timer = null; }
    T.api.post('/api/v1/server/shutdown').then(function () {
      setMsg('danger-msg', t('danger.shutdownDone'), 'danger');
      if (host) {
        var buttons = host.querySelectorAll('[data-action="clear-errors"], [data-action="shutdown"]');
        Array.prototype.forEach.call(buttons, function (item) { item.disabled = true; });
      }
    }, function (err) {
      if (button) button.disabled = false;
      if (!timer) timer = setInterval(loadRuntime, 30000);
      setMsg('danger-msg', t('danger.shutdownFailed', { msg: errText(err) }), 'danger');
      if (!err || err.status !== 401) T.toast('error', errText(err));
    });
  }

  /* ---------------- load / dirty / refresh ---------------- */

  function fieldsDirty() {
    return Object.keys(collectFields()).length > 0;
  }

  function isDirty() {
    return fieldsDirty() || rawDirty() || cookiesDirty() || cookiesRawDirty();
  }

  function refresh() {
    return Promise.all([
      loadFields(),
      loadRaw(),
      loadCookies(),
      loadCookiesRaw(),
      loadRuntime()
    ]);
  }

  /* ---------------- events ---------------- */

  function onClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest('[data-action]');
    if (!button) return;
    var action = button.getAttribute('data-action');

    if (action === 'refresh') {
      if (isDirty() && !T.confirm(t('discard'))) return;
      button.disabled = true;
      refresh().then(function () { button.disabled = false; });
      return;
    }
    if (action === 'field-clear') {
      toggleFieldClear(button.getAttribute('data-field'));
      return;
    }
    if (action === 'fields-reset') {
      renderFields();
      setMsg('fields-msg', t('fields.resetDone'), 'info');
      return;
    }
    if (action === 'raw-reload') {
      if (rawDirty() && !T.confirm(t('discard'))) return;
      loadRaw();
      return;
    }
    if (action === 'raw-save') { saveRaw(); return; }
    if (action === 'cookie-add') { addCookie(); return; }
    if (action === 'cookie-remove') { removeCookie(button.closest('[data-cookie-row]')); return; }
    if (action === 'cookie-save') { saveCookies(); return; }
    if (action === 'cookies-raw-reload') {
      if (cookiesRawDirty() && !T.confirm(t('discard'))) return;
      loadCookiesRaw();
      return;
    }
    if (action === 'cookies-raw-save') { saveCookiesRaw(); return; }
    if (action === 'clear-errors') { clearErrors(button); return; }
    if (action === 'shutdown') { shutdownServer(button); return; }
  }

  function onSubmit(event) {
    var form = event.target;
    if (!form || form.getAttribute('data-role') !== 'fields-form') return;
    event.preventDefault();
    saveFields();
  }

  /* ---------------- view registration ---------------- */

  T.views.register('system', {
    mount: function (root) {
      host = root;
      injectStyle();

      S.fields = [];
      S.fieldsExists = false;
      S.fieldsError = null;
      S.raw = { content: '', path: '', exists: false };
      S.rawError = null;
      S.cookies = [];
      S.cookieExists = false;
      S.cookiesError = null;
      S.cookieDraft = [];
      S.cookiesRaw = { content: '', path: '', exists: false };
      S.cookiesRawError = null;
      S.info = { config: null, health: null, queue: null, db: null };
      busy = { fields: false, raw: false, cookies: false, cookiesRaw: false };

      host.innerHTML = markup();
      renderLoading();
      host.addEventListener('click', onClick);
      host.addEventListener('submit', onSubmit);

      refresh();
      timer = setInterval(loadRuntime, 30000);

      return {
        refresh: function () { return refresh(); },
        destroy: function () {
          if (timer) { clearInterval(timer); timer = null; }
          if (host) {
            host.removeEventListener('click', onClick);
            host.removeEventListener('submit', onSubmit);
          }
          host = null;
        }
      };
    }
  });
})();
