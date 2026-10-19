/* TMD · 系统设置视图（/system）
   配置字段 + Cookie 账号 + 运行信息 + 危险操作。
   零依赖 IIFE；所有可见文案走 system.* i18n（zh-CN + en），颜色只用 CSS 变量。 */
(function () {
  'use strict';

  var T = window.TMD;
  if (!T) return;

  T.i18n.add({
    'zh-CN': {
      system: {
        title: '系统设置',
        sub: '配置字段、Cookie 账号与运行状态；多数字段保存后需重启 TMD 生效。',
        discard: '当前有未保存的修改，确定重新加载并放弃这些修改？',
        state: {
          clean: '无未保存修改',
          dirtyOne: '1 项未保存',
          dirty: '{n} 项未保存'
        },
        nav: {
          aria: '设置分区',
          runtime: '运行信息',
          danger: '危险操作'
        },
        group: {
          basic: { title: '基础', desc: '存储位置；重启后生效。' },
          cookie: { title: 'Cookie', desc: '主账号 Cookie 与附加账号；重启后生效。' },
          advanced: { title: '高级', desc: '并发、文件名与代理；重启后生效。' },
          security: { title: '安全', desc: '访问认证；改动立即生效。' }
        },
        fields: {
          title: '配置字段',
          metaExists: 'conf.yaml 已存在',
          metaMissing: 'conf.yaml 尚未创建，保存后生成',
          required: '必填',
          modified: '已修改',
          clear: '清除此值',
          undoClear: '取消清除',
          clearConfirm: '清除「{label}」？保存后该字段会被写为空值（接口以 __CLEAR__ 表示删除该值）。',
          clearHint: '保存后将清空此项（提交 __CLEAR__）',
          masked: '当前值 {mask}（已脱敏）',
          notSet: '当前未设置',
          defaultValue: '默认 {value}',
          maskedPlaceholder: '已设置 · 留空则保留',
          invalidNumber: '请填 {min}–{max} 之间的整数',
          save: '保存配置',
          saving: '保存中…',
          discard: '放弃修改',
          dirtyHint: '保存后多数字段需重启 TMD 生效；API Key 立即生效。',
          none: '没有需要保存的修改。',
          saved: '配置已保存',
          savedRestart: '配置已保存；部分字段需重启 TMD 后生效。',
          savedApiKey: '配置已保存；API Key 已更新并立即生效。',
          resetDone: '已放弃未保存的修改',
          loadFailed: '配置字段加载失败：{msg}',
          saveFailed: '保存配置失败：{msg}',
          empty: '没有可编辑的配置字段。',
          retry: '重新加载',
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
          help: {
            root_path: '媒体与数据库的存放目录，下载按用户/列表分目录写入；新路径从下次启动开始使用。',
            auth_token: 'X 主账号的 auth_token（浏览器 Cookie），下载需要登录的内容时使用。',
            ct0: '与 auth_token 配套的 CSRF token（浏览器 Cookie 里的 ct0）。',
            max_download_routine: '同时下载的任务数上限（1–100）；越大越快，也更容易触发限流。',
            max_user_fetch_concurrent: '同时抓取用户信息的并发数（0–35）；0 表示使用默认值。',
            max_file_name_len: '媒体文件名最大长度（50–245），超出部分会被截断。',
            proxy_url: '下载与请求使用的代理，例如 http://127.0.0.1:7897；留空使用系统代理。',
            api_key: '访问本控制台的密钥；留空即关闭认证。改动立即生效，无需重启。'
          },
          placeholder: {
            proxy_url: 'http://127.0.0.1:7897，或留空不使用代理'
          }
        },
        cookies: {
          title: 'Cookie 账号',
          sub: '附加账号用于轮换下载；未改动的值保存时保持原样（__KEEP_OLD__）。',
          add: '添加账号',
          addFirst: '添加第一个账号',
          save: '保存账号',
          saving: '保存中…',
          empty: '还没有附加账号，当前只使用主账号下载。',
          keepHint: '脱敏显示：留空即保留，填写新值才会覆盖。保存后需重启 TMD 生效。',
          metaCount: '{n} 个账号',
          metaMissing: 'additional_cookies.yaml 不存在',
          headerIndex: '#',
          headerToken: 'Auth Token',
          headerCt0: 'CT0',
          headerState: '状态',
          headerActions: '操作',
          stateNew: '新增',
          stateChanged: '已修改',
          stateKeep: '未改动',
          placeholderKeep: '已设置 · 留空保留',
          remove: '删除',
          removeConfirm: '删除账号 #{n}？保存后该账号会从文件中移除。',
          saved: 'Cookie 账号已保存',
          restart: 'Cookie 改动需要重启 TMD 后才能生效。',
          none: '没有需要保存的修改。',
          bothEmpty: '第 {n} 个账号的 Auth Token 与 CT0 不能同时为空。',
          loadFailed: 'Cookie 加载失败：{msg}',
          saveFailed: '保存 Cookie 失败：{msg}',
          retry: '重新加载',
          dirty: '未保存'
        },
        raw: {
          summary: '高级：直接编辑 conf.yaml',
          title: 'conf.yaml 原始内容',
          secret: '原始内容包含明文密钥（api_key、Cookie），请勿分享或截图外传。',
          save: '保存 YAML',
          reload: '重新加载',
          loaded: '已加载 {path}',
          missing: '{path}（文件不存在）',
          confirm: '用编辑器内容覆盖 conf.yaml？保存前会自动备份。',
          saved: 'conf.yaml 已保存，需重启生效。',
          restart: '配置已写入，部分字段需重启 TMD 后生效。',
          stale: '已有未保存的表单修改，表单未同步；请刷新页面后重新编辑。',
          empty: '内容为空，无法保存。',
          loadFailed: '原始配置加载失败：{msg}',
          saveFailed: '保存原始配置失败：{msg}'
        },
        cookiesRaw: {
          summary: '高级：直接编辑 additional_cookies.yaml',
          title: 'additional_cookies.yaml 原始内容',
          save: '保存文本',
          reload: '重新加载',
          confirm: '用编辑器内容覆盖 additional_cookies.yaml？保存前会自动备份。',
          saved: 'Cookie 文件已保存，需重启生效。',
          empty: '内容为空，无法保存。',
          loadFailed: 'Cookie 原始文本加载失败：{msg}',
          saveFailed: '保存 Cookie 原始文本失败：{msg}'
        },
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
        danger: {
          title: '危险操作',
          badge: '不可撤销',
          sub: '以下操作会中断服务或清空数据。',
          clearErrors: '清空失败记录',
          clearErrorsDesc: '删除失败队列里的记录，不影响已下载的数据。',
          clearErrorsConfirm: '确定清空全部失败记录？该操作不可撤销。',
          clearErrorsDone: '失败记录已清空。',
          clearErrorsFailed: '清空失败记录失败：{msg}',
          shutdown: '关闭服务器',
          shutdownDesc: '停止 TMD 服务，进行中的任务会被中断；恢复需在服务器上手动重启。',
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
        sub: 'Config fields, cookie accounts and runtime status. Most changes need a TMD restart.',
        discard: 'You have unsaved changes. Reload anyway and discard them?',
        state: {
          clean: 'No unsaved changes',
          dirtyOne: '1 unsaved change',
          dirty: '{n} unsaved changes'
        },
        nav: {
          aria: 'Settings sections',
          runtime: 'Runtime',
          danger: 'Danger zone'
        },
        group: {
          basic: { title: 'Basic', desc: 'Storage location; applies after a restart.' },
          cookie: { title: 'Cookie', desc: 'Primary cookie and extra accounts; applies after a restart.' },
          advanced: { title: 'Advanced', desc: 'Concurrency, file names and proxy; applies after a restart.' },
          security: { title: 'Security', desc: 'Access auth; takes effect immediately.' }
        },
        fields: {
          title: 'Config fields',
          metaExists: 'conf.yaml found',
          metaMissing: 'conf.yaml not created yet; it is written on save',
          required: 'required',
          modified: 'changed',
          clear: 'Clear value',
          undoClear: 'Undo clear',
          clearConfirm: 'Clear "{label}"? On save the field is written as empty (the API uses __CLEAR__ to delete a value).',
          clearHint: 'This field will be emptied on save (__CLEAR__).',
          masked: 'current value {mask} (masked)',
          notSet: 'not set',
          defaultValue: 'default {value}',
          maskedPlaceholder: 'set · leave empty to keep',
          invalidNumber: 'Enter an integer between {min} and {max}',
          save: 'Save config',
          saving: 'Saving…',
          discard: 'Discard',
          dirtyHint: 'Most fields take effect after restarting TMD; the API Key applies immediately.',
          none: 'Nothing to save.',
          saved: 'Configuration saved',
          savedRestart: 'Configuration saved; some fields take effect after restarting TMD.',
          savedApiKey: 'Configuration saved; the API Key is updated and applies immediately.',
          resetDone: 'Unsaved changes discarded',
          loadFailed: 'Could not load config fields: {msg}',
          saveFailed: 'Could not save config: {msg}',
          empty: 'No editable config fields.',
          retry: 'Reload',
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
          help: {
            root_path: 'Folder for media and the database. Downloads go into per-user / per-list subfolders; a new path applies from the next start.',
            auth_token: 'auth_token of the primary X account (browser cookie). Used for content that requires a login.',
            ct0: 'CSRF token that goes with auth_token (the ct0 browser cookie).',
            max_download_routine: 'Upper bound of concurrent downloads (1–100). Higher is faster but likelier to hit rate limits.',
            max_user_fetch_concurrent: 'Concurrent user-info fetches (0–35). 0 uses the default.',
            max_file_name_len: 'Max length of media file names (50–245); longer names are truncated.',
            proxy_url: 'Proxy for downloads and requests, e.g. http://127.0.0.1:7897. Empty uses the system proxy.',
            api_key: 'Key for this web console. Leave empty to disable auth. Changes apply immediately.'
          },
          placeholder: {
            proxy_url: 'http://127.0.0.1:7897, or empty for no proxy'
          }
        },
        cookies: {
          title: 'Cookie accounts',
          sub: 'Extra accounts rotate downloads. Unchanged values are kept as-is on save (__KEEP_OLD__).',
          add: 'Add account',
          addFirst: 'Add the first account',
          save: 'Save accounts',
          saving: 'Saving…',
          empty: 'No extra accounts yet; only the primary account is used.',
          keepHint: 'Masked values: leave empty to keep, type a new value to replace. Restart TMD after saving.',
          metaCount: '{n} account(s)',
          metaMissing: 'additional_cookies.yaml does not exist',
          headerIndex: '#',
          headerToken: 'Auth Token',
          headerCt0: 'CT0',
          headerState: 'State',
          headerActions: 'Actions',
          stateNew: 'new',
          stateChanged: 'changed',
          stateKeep: 'unchanged',
          placeholderKeep: 'set · leave empty to keep',
          remove: 'Remove',
          removeConfirm: 'Remove account #{n}? It is deleted from the file on save.',
          saved: 'Cookie accounts saved',
          restart: 'Cookie changes take effect after restarting TMD.',
          none: 'Nothing to save.',
          bothEmpty: 'Account #{n}: Auth Token and CT0 cannot both be empty.',
          loadFailed: 'Could not load cookies: {msg}',
          saveFailed: 'Could not save cookies: {msg}',
          retry: 'Reload',
          dirty: 'unsaved'
        },
        raw: {
          summary: 'Advanced: edit conf.yaml directly',
          title: 'Raw conf.yaml',
          secret: 'The raw file contains plain-text secrets (api_key, cookies). Do not share it.',
          save: 'Save YAML',
          reload: 'Reload',
          loaded: 'loaded {path}',
          missing: '{path} (file missing)',
          confirm: 'Overwrite conf.yaml with the editor content? A backup is created first.',
          saved: 'conf.yaml saved. Restart TMD to apply.',
          restart: 'Config written. Some fields take effect after a TMD restart.',
          stale: 'The form has unsaved edits and was not refreshed; reload the page to edit again.',
          empty: 'Content is empty; nothing to save.',
          loadFailed: 'Could not load raw config: {msg}',
          saveFailed: 'Could not save raw config: {msg}'
        },
        cookiesRaw: {
          summary: 'Advanced: edit additional_cookies.yaml directly',
          title: 'Raw additional_cookies.yaml',
          save: 'Save text',
          reload: 'Reload',
          confirm: 'Overwrite additional_cookies.yaml with the editor content? A backup is created first.',
          saved: 'Cookie file saved. Restart TMD to apply.',
          empty: 'Content is empty; nothing to save.',
          loadFailed: 'Could not load raw cookies: {msg}',
          saveFailed: 'Could not save raw cookies: {msg}'
        },
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
        danger: {
          title: 'Danger zone',
          badge: 'irreversible',
          sub: 'These actions interrupt the service or erase data.',
          clearErrors: 'Clear failure log',
          clearErrorsDesc: 'Delete the failure queue. Already downloaded data is untouched.',
          clearErrorsConfirm: 'Clear the whole failure log? This cannot be undone.',
          clearErrorsDone: 'Failure log cleared.',
          clearErrorsFailed: 'Could not clear failure log: {msg}',
          shutdown: 'Shut down server',
          shutdownDesc: 'Stop TMD; running tasks are interrupted and must be restarted manually on the host.',
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
  var NAV_ORDER = ['basic', 'cookie', 'advanced', 'security', 'runtime', 'danger'];
  var NAV_OFFSET = 158;
  var NUM_RANGE = {
    max_download_routine: [1, 100],
    max_user_fetch_concurrent: [0, 35],
    max_file_name_len: [50, 245]
  };

  var host = null;
  var timer = null;
  var rafId = 0;
  var activeNav = 'basic';
  var busy = { fields: false, cookies: false, raw: false, cookiesRaw: false };

  var S = {
    fields: [],
    fieldsExists: false,
    fieldsError: null,
    cleared: {},
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

  /* ---------------- helpers ---------------- */

  function t(key, vars) { return T.t('system.' + key, vars); }
  function esc(v) { return T.esc(v); }
  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function str(v) { return v === undefined || v === null ? '' : String(v); }
  function errText(err) {
    return err && err.message ? err.message : String(err);
  }
  function isMasked(v) {
    var s = str(v);
    return s === '***' || s.indexOf('•••') !== -1;
  }
  function isSensitive(field) {
    return (field && field.type) === 'password';
  }
  function navLabel(id) {
    if (GROUPS.indexOf(id) !== -1) return t('group.' + id + '.title');
    return t('nav.' + id);
  }
  function dismiss(msg) {
    try { T.toast('info', msg); } catch (e) { /* ignore */ }
  }

  /* ---------------- view-local styles ---------------- */

  function injectStyle() {
    T.injectStyle('view-system-style', [
      /* 分区锚点 */
      '.sys-nav { position: sticky; top: 102px; z-index: 18; margin: 0 0 14px; padding: 4px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); box-shadow: var(--shadow-sm); }',
      '.sys-nav__inner { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }',
      '.sys-nav__inner::-webkit-scrollbar { display: none; }',
      '.sys-nav__item { flex: 0 0 auto; display: inline-flex; align-items: center; min-height: 34px; padding: 0 12px; border-radius: 7px; color: var(--text-soft); font-size: 13px; font-weight: 550; text-decoration: none; white-space: nowrap; }',
      '.sys-nav__item:hover { background: var(--surface-2); color: var(--text); }',
      '.sys-nav__item[aria-current="true"] { background: var(--accent-soft); color: var(--accent); font-weight: 650; }',
      /* 卡片内分区 */
      '.sys-group { scroll-margin-top: 168px; }',
      '.sys-group + .sys-group { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border); }',
      '.sys-group__head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }',
      '.sys-group__title { font-size: 13.5px; font-weight: 650; letter-spacing: -.01em; }',
      '.sys-group__desc { color: var(--muted); font-size: 12.5px; }',
      /* 字段 */
      '.sys-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }',
      '.sys-field { min-width: 0; }',
      '.sys-field--wide { grid-column: 1 / -1; }',
      '.sys-field__head { display: flex; align-items: center; gap: 8px; min-height: 26px; margin-bottom: 6px; }',
      '.sys-field__label { color: var(--muted); font-size: 12px; font-weight: 650; letter-spacing: .02em; }',
      '.sys-field__req { color: var(--danger); font-size: 11px; font-weight: 600; }',
      '.sys-field__dirty { color: var(--accent); font-size: 11px; font-weight: 600; }',
      '.sys-field__clear { margin-left: auto; min-height: 26px; padding: 2px 8px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--muted); font-size: 12px; font-weight: 550; white-space: nowrap; cursor: pointer; }',
      '.sys-field__clear:hover { background: var(--surface-2); color: var(--text); border-color: var(--border); }',
      '.sys-field__clear[data-clearing="1"] { background: var(--accent-soft); color: var(--accent); border-color: var(--accent-soft); }',
      '.sys-field__help { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }',
      '.sys-field__meta { margin: 3px 0 0; color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
      '.sys-field__error { margin: 5px 0 0; color: var(--danger); font-size: 12px; font-weight: 550; }',
      '.sys-field__clearhint { margin: 5px 0 0; color: var(--warn); font-size: 12px; }',
      '.sys-field[data-clearing="1"] .input, .sys-field[data-clearing="1"] .textarea { opacity: .5; text-decoration: line-through; }',
      '.sys-field[data-dirty="1"] .sys-field__label { color: var(--accent); }',
      /* Cookie 账号表 */
      '.sys-accounts { margin-top: 18px; padding-top: 16px; border-top: 1px dashed var(--border); }',
      '.sys-accounts__head { gap: 8px; margin-bottom: 4px; }',
      '.sys-subtitle { font-size: 13px; font-weight: 650; }',
      '.sys-cookie-table td { vertical-align: middle; }',
      '.sys-cookie-table .input { width: 100%; min-width: 0; }',
      '.sys-cookie-idx { width: 42px; color: var(--muted); font-variant-numeric: tabular-nums; }',
      '.sys-cookie-state { white-space: nowrap; }',
      /* 运行信息 */
      '.sys-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--border); overflow: hidden; }',
      '.sys-stat { min-width: 0; padding: 10px 12px; background: var(--surface); }',
      '.sys-stat__label { color: var(--muted); font-size: 11.5px; font-weight: 600; letter-spacing: .02em; }',
      '.sys-stat__value { margin-top: 3px; font-size: 16px; font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
      '.sys-stat__sub { margin-top: 2px; color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }',
      '.sys-skel { height: 12px; width: 42%; }',
      '.sys-skel--tall { height: 34px; width: 100%; margin-top: 8px; }',
      /* 折叠原始文件 */
      '.sys-details { margin-top: 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); }',
      '.sys-details > summary { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 12px; color: var(--text-soft); font-size: 12.5px; font-weight: 600; cursor: pointer; list-style: none; }',
      '.sys-details > summary::-webkit-details-marker { display: none; }',
      '.sys-details > summary::before { content: "▸"; color: var(--muted); font-size: 11px; }',
      '.sys-details[open] > summary::before { content: "▾"; }',
      '.sys-details__body { padding: 0 12px 12px; }',
      /* 危险操作 */
      '.sys-danger__row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-top: 1px solid var(--border); }',
      '.sys-danger__row:first-of-type { border-top: 0; padding-top: 0; }',
      '.sys-danger__text { flex: 1 1 auto; min-width: 0; }',
      '.sys-danger__title { font-size: 13px; font-weight: 600; }',
      '.sys-danger__desc { margin-top: 2px; color: var(--muted); font-size: 12px; }',
      /* 未保存操作条 */
      '.sys-savebar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 26; padding: 10px 20px calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--surface); box-shadow: 0 -6px 20px -18px var(--text); }',
      '.sys-savebar__inner { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; max-width: 1180px; margin: 0 auto; }',
      '.sys-savebar__count { font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; }',
      '.sys-savebar__hint { color: var(--muted); font-size: 12px; }',
      '.sys-savebar__actions { display: flex; gap: 8px; margin-left: auto; }',
      '.view--dirty { padding-bottom: 84px; }',
      /* 移动端 */
      '@media (max-width: 700px) {',
      '  .sys-nav { margin-left: -8px; margin-right: -8px; border-radius: 0; border-left: 0; border-right: 0; }',
      '  .sys-nav__item { min-height: 40px; padding: 0 10px; }',
      '  .sys-fields { grid-template-columns: minmax(0, 1fr); }',
      '  .sys-field__head { min-height: 40px; }',
      '  .sys-field__clear { min-height: 40px; padding: 0 12px; }',
      '  .sys-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
      '  .sys-cookie-table thead { display: none; }',
      '  .sys-cookie-table tbody tr { display: block; padding: 10px 0; border-bottom: 1px solid var(--border); }',
      '  .sys-cookie-table tbody tr:last-child { border-bottom: 0; }',
      '  .sys-cookie-table td { display: block; width: auto !important; padding: 4px 0 !important; border: 0 !important; }',
      '  .sys-cookie-table td::before { content: attr(data-label); display: block; margin-bottom: 3px; color: var(--muted); font-size: 11.5px; font-weight: 600; }',
      '  .sys-cookie-table td.sys-cookie-idx { color: var(--muted); }',
      '  .sys-cookie-table .btn { min-height: 40px; width: 100%; }',
      '  .sys-danger__row { flex-direction: column; align-items: stretch; gap: 8px; }',
      '  .sys-danger__row .btn { width: 100%; min-height: 40px; }',
      '  .sys-savebar__inner { flex-wrap: wrap; gap: 8px; }',
      '  .sys-savebar__hint { flex: 1 1 100%; }',
      '  .sys-savebar__actions { flex: 1 1 100%; margin-left: 0; }',
      '  .sys-savebar__actions .btn { flex: 1 1 0; min-height: 40px; }',
      '  #view-system .btn { min-height: 40px; }',
      '  #view-system .sys-details > summary { min-height: 40px; }',
      '}'
    ].join('\n'));
  }

  /* ---------------- markup ---------------- */

  function notice(kind, text) {
    return '<p class="notice' + (kind ? ' notice--' + kind : '') + '">' + esc(text) + '</p>';
  }

  function navMarkup() {
    return '<nav class="sys-nav" aria-label="' + esc(t('nav.aria')) + '">' +
      '<div class="sys-nav__inner" data-role="sys-nav"></div>' +
      '</nav>';
  }

  function runtimeCardMarkup() {
    return '<section class="card" id="sys-runtime" data-section="runtime" aria-labelledby="sys-runtime-title">' +
        '<header class="card__head">' +
          '<h2 class="card__title" id="sys-runtime-title">' + esc(t('runtime.title')) + '</h2>' +
          '<span class="card__meta" data-role="runtime-meta"></span>' +
        '</header>' +
        '<div class="sys-stats" data-role="runtime-stats"></div>' +
        '<div class="grid-2 mt-16" data-role="runtime-detail"></div>' +
        '<div class="mt-12" data-role="runtime-msg"></div>' +
      '</section>';
  }

  function dangerCardMarkup() {
    return '<section class="card" id="sys-danger" data-section="danger" aria-labelledby="sys-danger-title">' +
        '<header class="card__head">' +
          '<h2 class="card__title" id="sys-danger-title">' + esc(t('danger.title')) + '</h2>' +
          '<span class="badge badge--danger">' + esc(t('danger.badge')) + '</span>' +
        '</header>' +
        '<p class="small muted">' + esc(t('danger.sub')) + '</p>' +
        '<div class="mt-8">' +
          '<div class="sys-danger__row">' +
            '<div class="sys-danger__text">' +
              '<p class="sys-danger__title">' + esc(t('danger.clearErrors')) + '</p>' +
              '<p class="sys-danger__desc">' + esc(t('danger.clearErrorsDesc')) + '</p>' +
            '</div>' +
            '<button type="button" class="btn btn--ghost btn--danger" data-action="clear-errors">' + esc(t('danger.clearErrors')) + '</button>' +
          '</div>' +
          '<div class="sys-danger__row">' +
            '<div class="sys-danger__text">' +
              '<p class="sys-danger__title">' + esc(t('danger.shutdown')) + '</p>' +
              '<p class="sys-danger__desc">' + esc(t('danger.shutdownDesc')) + '</p>' +
            '</div>' +
            '<button type="button" class="btn btn--ghost btn--danger" data-action="shutdown">' + esc(t('danger.shutdown')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="mt-12" data-role="danger-msg"></div>' +
      '</section>';
  }

  function savebarMarkup() {
    return '<div class="sys-savebar" data-role="savebar" hidden>' +
      '<div class="sys-savebar__inner">' +
        '<span class="sys-savebar__count" data-role="dirty-count"></span>' +
        '<span class="sys-savebar__hint">' + esc(t('fields.dirtyHint')) + '</span>' +
        '<div class="sys-savebar__actions">' +
          '<button type="button" class="btn btn--ghost" data-action="fields-reset">' + esc(t('fields.discard')) + '</button>' +
          '<button type="button" class="btn btn--primary" data-action="fields-save">' + esc(t('fields.save')) + '</button>' +
        '</div>' +
      '</div>' +
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
          '<span class="badge" data-role="save-state">' + esc(t('state.clean')) + '</span>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="refresh">' + esc(T.t('common.refresh')) + '</button>' +
        '</div>' +
      '</div>' +
      navMarkup() +
      '<div class="stack">' +
        '<section class="card" aria-labelledby="sys-fields-title">' +
          '<header class="card__head">' +
            '<h2 class="card__title" id="sys-fields-title">' + esc(t('fields.title')) + '</h2>' +
            '<span class="card__meta" data-role="fields-meta"></span>' +
          '</header>' +
          '<div data-role="groups"></div>' +
          '<div class="mt-12" data-role="fields-msg"></div>' +
        '</section>' +
        runtimeCardMarkup() +
        dangerCardMarkup() +
      '</div>' +
      savebarMarkup();
  }

  function skeletonStats() {
    var html = '';
    for (var i = 0; i < 4; i++) {
      html += '<div class="sys-stat">' +
        '<div class="skeleton sys-skel"></div>' +
        '<div class="skeleton sys-skel--tall"></div>' +
        '</div>';
    }
    return html;
  }

  function skeletonFields() {
    var html = '';
    for (var i = 0; i < 4; i++) {
      html += '<div class="sys-field sys-field--wide">' +
        '<div class="skeleton sys-skel"></div>' +
        '<div class="skeleton sys-skel--tall"></div>' +
        '</div>';
    }
    return '<div class="sys-fields">' + html + '</div>';
  }

  function renderLoading() {
    if (!host) return;
    var groups = host.querySelector('[data-role="groups"]');
    if (groups) groups.innerHTML = skeletonFields();
    var stats = host.querySelector('[data-role="runtime-stats"]');
    if (stats) stats.innerHTML = skeletonStats();
    var detail = host.querySelector('[data-role="runtime-detail"]');
    if (detail) detail.innerHTML = '';
    var meta = host.querySelector('[data-role="fields-meta"]');
    if (meta) meta.textContent = '';
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

  function findField(name) {
    for (var i = 0; i < S.fields.length; i++) {
      if (S.fields[i].name === name) return S.fields[i];
    }
    return null;
  }

  function origValue(field) {
    return str(field && field.value);
  }

  function fieldLabel(field) {
    var translated = t('fields.name.' + field.name);
    if (translated === 'system.fields.name.' + field.name) return field.label || field.name;
    return translated;
  }

  function fieldHelp(field) {
    var translated = t('fields.help.' + field.name);
    if (translated === 'system.fields.help.' + field.name) return field.prompt || '';
    return translated;
  }

  function fieldPlaceholder(field) {
    var translated = t('fields.placeholder.' + field.name);
    if (translated === 'system.fields.placeholder.' + field.name) return field.placeholder || '';
    return translated;
  }

  function groupTitle(group) {
    var translated = t('group.' + group + '.title');
    if (translated === 'system.group.' + group + '.title') return group;
    return translated;
  }

  function groupDesc(group) {
    var translated = t('group.' + group + '.desc');
    if (translated === 'system.group.' + group + '.desc') return '';
    return translated;
  }

  function fieldControl(field, attrs) {
    var value = origValue(field);
    var type = field.type || 'text';
    if (type === 'number') {
      return '<input class="input" type="number" inputmode="numeric" step="1"' + attrs + ' value="' + esc(value) + '">';
    }
    if (type === 'password') {
      return '<input class="input" type="password" autocomplete="new-password"' + attrs + '>';
    }
    if (type === 'textarea') {
      return '<textarea class="textarea"' + attrs + ' rows="3">' + esc(value) + '</textarea>';
    }
    if (type === 'select' && isArray(field.options)) {
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
    var sensitive = isSensitive(field);
    var value = origValue(field);
    var masked = isMasked(value);
    var hasValue = sensitive ? (masked || value !== '') : value !== '';
    var wide = type !== 'number';
    // 主账号的两个 Cookie 成对填写，并排更紧凑
    if (wide && (field.name === 'auth_token' || field.name === 'ct0')) wide = false;
    var id = 'cfg-' + field.name;
    var meta = [];
    if (sensitive) {
      if (masked) meta.push(t('fields.masked', { mask: value }));
      else if (!value) meta.push(t('fields.notSet'));
    }
    if (field.default && type === 'number') meta.push(t('fields.defaultValue', { value: field.default }));

    var placeholder = fieldPlaceholder(field);
    if (sensitive && hasValue) placeholder = t('fields.maskedPlaceholder');

    var attrs = ' id="' + esc(id) + '" data-input' +
      ' data-orig="' + esc(sensitive ? '' : value) + '"' +
      ' placeholder="' + esc(placeholder) + '"' +
      ' autocomplete="off" spellcheck="false"';

    return '<div class="sys-field' + (wide ? ' sys-field--wide' : '') + '" data-field="' + esc(field.name) + '">' +
      '<div class="sys-field__head">' +
        '<label class="sys-field__label" for="' + esc(id) + '">' + esc(fieldLabel(field)) + '</label>' +
        (field.required ? '<span class="sys-field__req">' + esc(t('fields.required')) + '</span>' : '') +
        '<span class="sys-field__dirty" data-role="field-dirty" hidden>' + esc(t('fields.modified')) + '</span>' +
        (hasValue
          ? '<button type="button" class="sys-field__clear" data-action="field-clear" data-field="' + esc(field.name) + '">' +
              '<span data-role="clear-label">' + esc(t('fields.clear')) + '</span></button>'
          : '') +
      '</div>' +
      fieldControl(field, attrs) +
      '<p class="sys-field__help">' + esc(fieldHelp(field)) + '</p>' +
      (meta.length ? '<p class="sys-field__meta">' + esc(meta.join(' · ')) + '</p>' : '') +
      '<p class="sys-field__error" data-role="field-error" hidden></p>' +
      '<p class="sys-field__clearhint" data-role="clear-hint" hidden>' + esc(t('fields.clearHint')) + '</p>' +
      '</div>';
  }

  function groupsMarkup() {
    var groups = groupFields(S.fields);
    if (!groups.length) return '<p class="empty">' + esc(t('fields.empty')) + '</p>';
    return groups.map(function (group) {
      return '<section class="sys-group" id="sys-' + esc(group.id) + '" data-section="' + esc(group.id) + '">' +
        '<header class="sys-group__head">' +
          '<h3 class="sys-group__title">' + esc(groupTitle(group.id)) + '</h3>' +
          '<p class="sys-group__desc">' + esc(groupDesc(group.id)) + '</p>' +
        '</header>' +
        '<div class="sys-fields">' + group.fields.map(fieldBox).join('') + '</div>' +
        (group.id === 'cookie' ? cookieAccountsMarkup() + cookiesDetailsMarkup() : '') +
        (group.id === 'advanced' ? rawDetailsMarkup() : '') +
        '</section>';
    }).join('');
  }

  function renderFields() {
    if (!host) return;
    syncCookieDraft();
    var body = host.querySelector('[data-role="groups"]');
    S.cleared = {};
    if (S.fieldsError) {
      if (body) {
        body.innerHTML = notice('danger', t('fields.loadFailed', { msg: S.fieldsError })) +
          '<div class="mt-8"><button type="button" class="btn btn--ghost btn--sm" data-action="fields-reload">' +
          esc(t('fields.retry')) + '</button></div>';
      }
    } else if (body) {
      body.innerHTML = S.fields.length ? groupsMarkup() : '<p class="empty">' + esc(t('fields.empty')) + '</p>';
    }
    var meta = host.querySelector('[data-role="fields-meta"]');
    if (meta) meta.textContent = S.fieldsExists ? t('fields.metaExists') : t('fields.metaMissing');
    renderCookies();
    renderRaw();
    renderCookiesRaw();
    renderNav();
    updateDirtyState();
  }

  function renderNav() {
    if (!host) return;
    var holder = host.querySelector('[data-role="sys-nav"]');
    if (!holder) return;
    var groups = groupFields(S.fields).map(function (group) { return group.id; });
    if (!groups.length && !S.fieldsError) groups = GROUPS.slice();
    var items = groups.concat(['runtime', 'danger']);
    holder.innerHTML = items.map(function (id) {
      return '<a class="sys-nav__item" href="#sys-' + esc(id) + '" data-nav-target="' + esc(id) + '">' +
        esc(navLabel(id)) + '</a>';
    }).join('');
    syncActiveNav(activeNav);
  }

  function syncActiveNav(id) {
    if (!host) return;
    activeNav = id;
    Array.prototype.forEach.call(host.querySelectorAll('[data-nav-target]'), function (item) {
      if (item.getAttribute('data-nav-target') === id) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
  }

  function fieldBoxEl(name) {
    return host ? host.querySelector('.sys-field[data-field="' + name + '"]') : null;
  }

  function collectFields() {
    var payload = {};
    var errors = [];
    var count = 0;
    S.fields.forEach(function (field) {
      var box = fieldBoxEl(field.name);
      if (!box) return;
      if (S.cleared[field.name]) { payload[field.name] = '__CLEAR__'; count += 1; return; }
      var input = box.querySelector('[data-input]');
      if (!input) return;
      var value = String(input.value);
      var sensitive = isSensitive(field);
      var orig = sensitive ? '' : origValue(field);
      if (value === orig) return;
      if (value.trim() === '') {
        if (sensitive) return;
        payload[field.name] = '__CLEAR__';
        count += 1;
        return;
      }
      var range = NUM_RANGE[field.name];
      if ((field.type === 'number') && range && !isValidInt(value, range)) {
        errors.push({ name: field.name, message: t('fields.invalidNumber', { min: range[0], max: range[1] }) });
        return;
      }
      payload[field.name] = value;
      count += 1;
    });
    return { payload: payload, errors: errors, count: count };
  }

  function isValidInt(value, range) {
    if (!/^\d+$/.test(String(value).trim())) return false;
    var n = parseInt(String(value).trim(), 10);
    return n >= range[0] && n <= range[1];
  }

  function setFieldError(name, message) {
    var box = fieldBoxEl(name);
    if (!box) return;
    var el = box.querySelector('[data-role="field-error"]');
    var input = box.querySelector('[data-input]');
    if (message) {
      if (el) { el.textContent = message; el.hidden = false; }
      if (input) input.setAttribute('aria-invalid', 'true');
    } else {
      if (el) { el.textContent = ''; el.hidden = true; }
      if (input) input.removeAttribute('aria-invalid');
    }
  }

  function clearFieldErrors() {
    if (!host) return;
    S.fields.forEach(function (field) { setFieldError(field.name, ''); });
  }

  function applyErrors(errors) {
    clearFieldErrors();
    errors.forEach(function (item) { setFieldError(item.name, item.message); });
  }

  function clearState(box) {
    var clearing = !!box && box.getAttribute('data-clearing') === '1';
    var input = box ? box.querySelector('[data-input]') : null;
    if (input) input.disabled = clearing;
    var hint = box ? box.querySelector('[data-role="clear-hint"]') : null;
    if (hint) hint.hidden = !clearing;
    var label = box ? box.querySelector('[data-role="clear-label"]') : null;
    if (label) label.textContent = clearing ? t('fields.undoClear') : t('fields.clear');
    var button = box ? box.querySelector('[data-action="field-clear"]') : null;
    if (button) {
      if (clearing) button.setAttribute('data-clearing', '1');
      else button.removeAttribute('data-clearing');
    }
  }

  function toggleClear(name) {
    var field = findField(name);
    var box = fieldBoxEl(name);
    if (!field || !box) return;
    if (box.getAttribute('data-clearing') === '1') {
      delete S.cleared[name];
      box.removeAttribute('data-clearing');
      var input = box.querySelector('[data-input]');
      if (input) input.value = input._prevValue === undefined ? '' : input._prevValue;
      clearState(box);
      updateDirtyState();
      return;
    }
    if (!T.confirm(t('fields.clearConfirm', { label: fieldLabel(field) }))) return;
    S.cleared[name] = true;
    box.setAttribute('data-clearing', '1');
    var target = box.querySelector('[data-input]');
    if (target) {
      target._prevValue = target.value;
      target.value = '';
    }
    clearState(box);
    updateDirtyState();
  }

  function updateDirtyState() {
    if (!host) return;
    var res = collectFields();
    S.fields.forEach(function (field) {
      var box = fieldBoxEl(field.name);
      if (!box) return;
      var dirty = !!S.cleared[field.name];
      if (!dirty) {
        var input = box.querySelector('[data-input]');
        if (input) {
          var orig = isSensitive(field) ? '' : origValue(field);
          dirty = String(input.value) !== orig;
        }
      }
      if (dirty) box.setAttribute('data-dirty', '1');
      else box.removeAttribute('data-dirty');
      var tag = box.querySelector('[data-role="field-dirty"]');
      if (tag) tag.hidden = !dirty;
      clearState(box);
    });

    var count = res.count;
    var bar = host.querySelector('[data-role="savebar"]');
    if (bar) {
      bar.hidden = count === 0;
      var countEl = bar.querySelector('[data-role="dirty-count"]');
      if (countEl) countEl.textContent = count === 1 ? t('state.dirtyOne') : t('state.dirty', { n: count });
      var saveButton = bar.querySelector('[data-action="fields-save"]');
      if (saveButton) {
        saveButton.textContent = busy.fields ? t('fields.saving') : t('fields.save');
        saveButton.disabled = busy.fields;
      }
      var discardButton = bar.querySelector('[data-action="fields-reset"]');
      if (discardButton) discardButton.disabled = busy.fields;
    }
    if (host.classList) {
      if (count > 0) host.classList.add('view--dirty');
      else host.classList.remove('view--dirty');
    } else {
      host.className = count > 0 ? 'view view--dirty' : 'view';
    }

    var stateBadge = host.querySelector('[data-role="save-state"]');
    if (stateBadge) {
      stateBadge.textContent = count ? (count === 1 ? t('state.dirtyOne') : t('state.dirty', { n: count })) : t('state.clean');
      stateBadge.className = count ? 'badge badge--warn' : 'badge';
    }
  }

  function scrollToField(name) {
    var box = fieldBoxEl(name);
    if (!box) return;
    var top = box.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0) - (NAV_OFFSET + 12);
    try { window.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, top < 0 ? 0 : top); }
  }

  function saveFields() {
    if (busy.fields) return;
    var res = collectFields();
    applyErrors(res.errors);
    if (res.errors.length) {
      T.toast('error', res.errors[0].message);
      scrollToField(res.errors[0].name);
      return;
    }
    if (!res.count) { dismiss(t('fields.none')); return; }
    busy.fields = true;
    updateDirtyState();
    setMsg('fields-msg', '', '');
    T.api.put('/api/v1/config/fields', { fields: res.payload }).then(function (data) {
      busy.fields = false;
      if (data && isArray(data.fields)) S.fields = data.fields;
      S.fieldsError = null;
      renderFields();
      var apiKeyChanged = Object.prototype.hasOwnProperty.call(res.payload, 'api_key');
      setMsg('fields-msg', t(apiKeyChanged ? 'fields.savedApiKey' : 'fields.savedRestart'), apiKeyChanged ? 'ok' : 'warn');
      T.toast('success', t('fields.saved'));
      loadRuntime();
      T.reload();
    }, function (err) {
      busy.fields = false;
      updateDirtyState();
      setMsg('fields-msg', t('fields.saveFailed', { msg: errText(err) }), 'danger');
      if (!err || err.status !== 401) T.toast('error', errText(err));
    });
  }

  function discardFields() {
    if (busy.fields) return;
    renderFields();
    setMsg('fields-msg', t('fields.resetDone'), 'info');
  }

  function loadFields() {
    return T.api.get('/api/v1/config/fields').then(function (res) {
      S.fields = res && isArray(res.fields) ? res.fields : [];
      S.fieldsExists = !!(res && res.exists);
      S.fieldsError = null;
    }, function (err) {
      S.fieldsError = errText(err);
    }).then(renderFields);
  }

  /* ---------------- raw config editor ---------------- */

  function rawDetailsMarkup() {
    return '<details class="sys-details" data-role="raw-details">' +
      '<summary>' + esc(t('raw.summary')) + '</summary>' +
      '<div class="sys-details__body">' +
        '<p class="small muted mono" data-role="raw-meta"></p>' +
        '<p class="small muted mt-8">' + esc(t('raw.secret')) + '</p>' +
        '<textarea class="textarea textarea--code mt-8" rows="14" spellcheck="false" autocomplete="off" data-role="raw-editor" aria-label="' + esc(t('raw.title')) + '" disabled></textarea>' +
        '<div class="mt-12" data-role="raw-msg"></div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn--ghost" data-action="raw-reload">' + esc(t('raw.reload')) + '</button>' +
          '<button type="button" class="btn btn--primary" data-action="raw-save">' + esc(t('raw.save')) + '</button>' +
        '</div>' +
      '</div>' +
    '</details>';
  }

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
      T.reload();
      if (collectFields().count === 0) loadFields();
      else setMsg('fields-msg', t('raw.stale'), 'warn');
      loadRuntime();
    }, function (err) {
      busy.raw = false;
      setMsg('raw-msg', t('raw.saveFailed', { msg: errText(err) }), 'danger');
      if (!err || err.status !== 401) T.toast('error', errText(err));
    });
  }

  /* ---------------- cookie accounts ---------------- */

  function cookieRowMarkup(row, index) {
    var existing = row.index !== null && row.index !== undefined;
    var changed = !!row.token || !!row.ct0;
    var stateText = !existing ? t('cookies.stateNew') : (changed ? t('cookies.stateChanged') : t('cookies.stateKeep'));
    var stateClass = !existing ? 'badge badge--info' : (changed ? 'badge badge--warn' : 'badge');
    var tokenPlaceholder = existing ? t('cookies.placeholderKeep') : 'auth_token';
    var ct0Placeholder = existing ? t('cookies.placeholderKeep') : 'ct0';
    return '<tr data-cookie-row="' + index + '"' +
      (existing ? ' data-source-index="' + esc(row.index) + '"' : '') + '>' +
      '<td class="sys-cookie-idx" data-label="' + esc(t('cookies.headerIndex')) + '">' + (index + 1) + '</td>' +
      '<td data-label="' + esc(t('cookies.headerToken')) + '">' +
        '<input class="input mono" type="text" data-cookie="auth_token" value="' + esc(row.token || '') + '"' +
          ' placeholder="' + esc(tokenPlaceholder) + '" autocomplete="off" spellcheck="false"' +
          ' aria-label="' + esc(t('cookies.headerToken') + ' #' + (index + 1)) + '">' +
      '</td>' +
      '<td data-label="' + esc(t('cookies.headerCt0')) + '">' +
        '<input class="input mono" type="text" data-cookie="ct0" value="' + esc(row.ct0 || '') + '"' +
          ' placeholder="' + esc(ct0Placeholder) + '" autocomplete="off" spellcheck="false"' +
          ' aria-label="' + esc(t('cookies.headerCt0') + ' #' + (index + 1)) + '">' +
      '</td>' +
      '<td class="sys-cookie-state" data-label="' + esc(t('cookies.headerState')) + '">' +
        '<span class="' + stateClass + '" data-role="cookie-state">' + esc(stateText) + '</span>' +
      '</td>' +
      '<td class="table__actions" data-label="' + esc(t('cookies.headerActions')) + '">' +
        '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-action="cookie-remove" data-index="' + index + '">' +
          esc(t('cookies.remove')) + '</button>' +
      '</td>' +
      '</tr>';
  }

  function cookieAccountsMarkup() {
    return '<div class="sys-accounts">' +
      '<div class="row-flex sys-accounts__head">' +
        '<h4 class="sys-subtitle">' + esc(t('cookies.title')) + '</h4>' +
        '<span class="small muted" data-role="cookies-meta"></span>' +
        '<span class="badge badge--warn" data-role="cookies-dirty" hidden>' + esc(t('cookies.dirty')) + '</span>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="cookie-add">' + esc(t('cookies.add')) + '</button>' +
        '<button type="button" class="btn btn--primary btn--sm" data-action="cookie-save">' + esc(t('cookies.save')) + '</button>' +
      '</div>' +
      '<p class="small muted">' + esc(t('cookies.sub')) + '</p>' +
      '<div class="mt-8" data-role="cookies-body"></div>' +
      '<div class="mt-12" data-role="cookies-msg"></div>' +
      '</div>';
  }

  function cookiesBodyMarkup() {
    if (S.cookiesError) return notice('danger', t('cookies.loadFailed', { msg: S.cookiesError }));
    if (!S.cookieDraft.length) {
      return '<div class="empty"><p>' + esc(t('cookies.empty')) + '</p>' +
        '<button type="button" class="btn btn--ghost btn--sm mt-8" data-action="cookie-add">' +
        esc(t('cookies.addFirst')) + '</button></div>';
    }
    return '<div class="tablewrap"><table class="table sys-cookie-table"><thead><tr>' +
      '<th>' + esc(t('cookies.headerIndex')) + '</th>' +
      '<th>' + esc(t('cookies.headerToken')) + '</th>' +
      '<th>' + esc(t('cookies.headerCt0')) + '</th>' +
      '<th>' + esc(t('cookies.headerState')) + '</th>' +
      '<th class="table__actions">' + esc(t('cookies.headerActions')) + '</th>' +
      '</tr></thead><tbody>' + S.cookieDraft.map(cookieRowMarkup).join('') + '</tbody></table></div>' +
      '<p class="small muted mt-8">' + esc(t('cookies.keepHint')) + '</p>';
  }

  function renderCookies() {
    if (!host) return;
    var body = host.querySelector('[data-role="cookies-body"]');
    var meta = host.querySelector('[data-role="cookies-meta"]');
    if (!body) return;
    body.innerHTML = cookiesBodyMarkup();
    if (meta) {
      meta.textContent = S.cookieExists
        ? t('cookies.metaCount', { n: S.cookies.length })
        : t('cookies.metaMissing');
    }
    updateCookieState();
  }

  function loadCookies() {
    return T.api.get('/api/v1/cookies').then(function (res) {
      S.cookies = res && isArray(res.items) ? res.items : [];
      S.cookieExists = !!(res && res.exists);
      S.cookiesError = null;
      S.cookieDraft = S.cookies.map(function (item) {
        var token = str(item.auth_token);
        var ct0 = str(item.ct0);
        return {
          index: item.index,
          token: '',
          ct0: '',
          hasValue: !!(token || ct0)
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
      draft.token = token ? token.value : '';
      draft.ct0 = ct0 ? ct0.value : '';
    });
  }

  function cookiesDirty() {
    if (!host) return false;
    syncCookieDraft();
    for (var i = 0; i < S.cookieDraft.length; i++) {
      var draft = S.cookieDraft[i];
      if (!draft) continue;
      if (draft.index === null || draft.index === undefined) return true;
      if (draft.token || draft.ct0) return true;
    }
    return false;
  }

  function updateCookieState() {
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('[data-cookie-row]'), function (rowEl) {
      var index = Number(rowEl.getAttribute('data-cookie-row'));
      var draft = S.cookieDraft[index];
      if (!draft) return;
      var existing = draft.index !== null && draft.index !== undefined;
      var token = rowEl.querySelector('[data-cookie="auth_token"]');
      var ct0 = rowEl.querySelector('[data-cookie="ct0"]');
      var changed = !!(token && token.value) || !!(ct0 && ct0.value);
      var badge = rowEl.querySelector('[data-role="cookie-state"]');
      if (badge) {
        if (!existing) { badge.textContent = t('cookies.stateNew'); badge.className = 'badge badge--info'; }
        else if (changed) { badge.textContent = t('cookies.stateChanged'); badge.className = 'badge badge--warn'; }
        else { badge.textContent = t('cookies.stateKeep'); badge.className = 'badge'; }
      }
    });
    var dirtyBadge = host.querySelector('[data-role="cookies-dirty"]');
    if (dirtyBadge) dirtyBadge.hidden = !cookiesDirty();
    var saveButton = host.querySelector('[data-action="cookie-save"]');
    if (saveButton) {
      saveButton.textContent = busy.cookies ? t('cookies.saving') : t('cookies.save');
      saveButton.disabled = busy.cookies;
    }
  }

  function addCookie() {
    syncCookieDraft();
    S.cookieDraft.push({ index: null, token: '', ct0: '', hasValue: false });
    renderCookies();
    var rows = host ? host.querySelectorAll('[data-cookie-row]') : [];
    var last = rows.length ? rows[rows.length - 1] : null;
    if (last) {
      var input = last.querySelector('[data-cookie="auth_token"]');
      if (input) input.focus();
    }
  }

  function removeCookie(index) {
    syncCookieDraft();
    if (isNaN(index) || index < 0 || index >= S.cookieDraft.length) return;
    if (!T.confirm(t('cookies.removeConfirm', { n: index + 1 }))) return;
    S.cookieDraft.splice(index, 1);
    renderCookies();
  }

  function collectCookies() {
    syncCookieDraft();
    var payload = [];
    var emptyAccounts = [];
    S.cookieDraft.forEach(function (draft, index) {
      var token = String(draft.token || '').trim();
      var ct0 = String(draft.ct0 || '').trim();
      var existing = draft.index !== null && draft.index !== undefined;
      if (!existing && !token && !ct0) return;
      if (existing && !token && !ct0) {
        payload.push({ index: draft.index, auth_token: '__KEEP_OLD__', ct0: '__KEEP_OLD__' });
        return;
      }
      var item = {};
      if (existing) item.index = draft.index;
      item.auth_token = token ? token : (existing ? '__KEEP_OLD__' : '');
      item.ct0 = ct0 ? ct0 : (existing ? '__KEEP_OLD__' : '');
      var resolvedToken = item.auth_token === '__KEEP_OLD__' ? 'kept' : item.auth_token;
      var resolvedCt0 = item.ct0 === '__KEEP_OLD__' ? 'kept' : item.ct0;
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
    if (!cookiesDirty()) { dismiss(t('cookies.none')); return; }
    busy.cookies = true;
    updateCookieState();
    T.api.put('/api/v1/cookies', { cookies: result.payload }).then(function () {
      busy.cookies = false;
      T.toast('success', t('cookies.saved'));
      return loadCookies().then(function () {
        setMsg('cookies-msg', t('cookies.restart'), 'warn');
      });
    }, function (err) {
      busy.cookies = false;
      updateCookieState();
      setMsg('cookies-msg', t('cookies.saveFailed', { msg: errText(err) }), 'danger');
      if (!err || err.status !== 401) T.toast('error', errText(err));
    });
  }

  /* ---------------- raw cookies editor ---------------- */

  function cookiesDetailsMarkup() {
    return '<details class="sys-details" data-role="cookies-raw-details">' +
      '<summary>' + esc(t('cookiesRaw.summary')) + '</summary>' +
      '<div class="sys-details__body">' +
        '<p class="small muted mono" data-role="cookies-raw-meta"></p>' +
        '<textarea class="textarea textarea--code mt-8" rows="12" spellcheck="false" autocomplete="off" data-role="cookies-raw-editor" aria-label="' + esc(t('cookiesRaw.title')) + '" disabled></textarea>' +
        '<div class="mt-12" data-role="cookies-raw-msg"></div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn--ghost" data-action="cookies-raw-reload">' + esc(t('cookiesRaw.reload')) + '</button>' +
          '<button type="button" class="btn btn--primary" data-action="cookies-raw-save">' + esc(t('cookiesRaw.save')) + '</button>' +
        '</div>' +
      '</div>' +
    '</details>';
  }

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
      if (!cookiesDirty()) loadCookies();
    }, function (err) {
      busy.cookiesRaw = false;
      setMsg('cookies-raw-msg', t('cookiesRaw.saveFailed', { msg: errText(err) }), 'danger');
      if (!err || err.status !== 401) T.toast('error', errText(err));
    });
  }

  /* ---------------- runtime info ---------------- */

  function statItem(key, label, value, sub) {
    return '<div class="sys-stat" data-stat="' + esc(key) + '">' +
      '<div class="sys-stat__label">' + esc(label) + '</div>' +
      '<div class="sys-stat__value">' + esc(value) + '</div>' +
      (sub ? '<div class="sys-stat__sub">' + esc(sub) + '</div>' : '') +
      '</div>';
  }

  function kvRows(rows) {
    return '<div class="kv">' + rows.map(function (row) {
      return '<div class="kv__row">' +
        '<span class="kv__key">' + esc(row[0]) + '</span>' +
        '<span class="kv__val">' + esc(row[1]) + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderRuntime() {
    if (!host) return;
    var stats = host.querySelector('[data-role="runtime-stats"]');
    var detail = host.querySelector('[data-role="runtime-detail"]');
    var meta = host.querySelector('[data-role="runtime-meta"]');
    if (!stats || !detail) return;

    var config = S.info.config;
    var health = S.info.health;
    var queue = S.info.queue;
    var db = S.info.db;
    var any = !!(config || health || queue || db);

    if (!any) {
      stats.innerHTML = '';
      detail.innerHTML = '';
      if (meta) meta.textContent = '';
      setMsg('runtime-msg', t('runtime.unavailable'), 'danger');
      return;
    }

    var statusText = health ? (health.status === 'ok' ? t('runtime.healthy') : (health.status || t('runtime.unhealthy'))) : '—';
    var entities = (Number(db && db.user_entities) || 0) + (Number(db && db.lst_entities) || 0);
    stats.innerHTML = [
      statItem('health', t('runtime.health'), statusText, t('runtime.version', { version: (health && health.version) || '—' })),
      statItem('queue', t('runtime.queue'), String(queue ? (Number(queue.queue_depth) || 0) : '—'), t('runtime.queueSub', {
        active: queue ? (Number(queue.active_jobs) || 0) : '—',
        pending: queue ? (Number(queue.pending_jobs) || 0) : '—',
        detached: queue ? (Number(queue.detached_jobs) || 0) : '—'
      })),
      statItem('routine', t('runtime.routine'), config ? String(Number(config.max_download_routine) || 0) : '—', t('runtime.routineSub', {
        n: config ? (Number(config.max_user_fetch_concurrent) || 0) : '—'
      })),
      statItem('db', t('runtime.db'), db ? String(Number(db.users) || 0) : '—', t('runtime.dbSub', {
        lists: db ? (Number(db.lsts) || 0) : '—',
        entities: db ? entities : '—'
      }))
    ].join('');

    detail.innerHTML = kvRows([
      [t('runtime.rootPath'), config && config.root_path ? config.root_path : '—'],
      [t('runtime.maxRoutine'), config ? String(config.max_download_routine) : '—'],
      [t('runtime.maxFetch'), config ? String(config.max_user_fetch_concurrent) : '—'],
      [t('runtime.maxFileName'), config ? String(config.max_file_name_len) : '—'],
      [t('runtime.statusLabel'), health ? String(health.status || '—') : '—'],
      [t('runtime.versionLabel'), health ? String(health.version || '—') : '—'],
      [t('runtime.queueDetail'), queue
        ? t('runtime.queueSub', {
          active: Number(queue.active_jobs) || 0,
          pending: Number(queue.pending_jobs) || 0,
          detached: Number(queue.detached_jobs) || 0
        })
        : '—']
    ]) + kvRows([
      [t('runtime.users'), db ? String(db.users || 0) : '—'],
      [t('runtime.lists'), db ? String(db.lsts || 0) : '—'],
      [t('runtime.userEntities'), db ? String(db.user_entities || 0) : '—'],
      [t('runtime.lstEntities'), db ? String(db.lst_entities || 0) : '—'],
      [t('runtime.userLinks'), db ? String(db.user_links || 0) : '—'],
      [t('runtime.prevNames'), db ? String(db.user_previous_names || 0) : '—']
    ]);

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

  /* ---------------- dirty / refresh ---------------- */

  function isDirty() {
    return collectFields().count > 0 || rawDirty() || cookiesDirty() || cookiesRawDirty();
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

  /* ---------------- scroll spy ---------------- */

  function onScroll() {
    if (!host || rafId) return;
    rafId = window.requestAnimationFrame(function () {
      rafId = 0;
      if (!host) return;
      var sections = host.querySelectorAll('[data-section]');
      if (!sections.length) return;
      var line = NAV_OFFSET + 16;
      var current = sections[0].getAttribute('data-section');
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top - line <= 0) {
          current = sections[i].getAttribute('data-section');
        }
      }
      var doc = document.documentElement;
      if (window.pageYOffset + window.innerHeight >= doc.scrollHeight - 2) {
        current = sections[sections.length - 1].getAttribute('data-section');
      }
      syncActiveNav(current);
    });
  }

  function onNavClick(event) {
    var link = event.target && event.target.closest ? event.target.closest('[data-nav-target]') : null;
    if (!link || !host) return;
    event.preventDefault();
    var id = link.getAttribute('data-nav-target');
    var section = host.querySelector('[data-section="' + id + '"]');
    if (!section) return;
    var top = section.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0) - NAV_OFFSET;
    try { window.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, top < 0 ? 0 : top); }
    syncActiveNav(id);
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
      toggleClear(button.getAttribute('data-field'));
      return;
    }
    if (action === 'fields-save') { saveFields(); return; }
    if (action === 'fields-reset') { discardFields(); return; }
    if (action === 'fields-reload') { loadFields(); return; }
    if (action === 'raw-reload') {
      if (rawDirty() && !T.confirm(t('discard'))) return;
      loadRaw();
      return;
    }
    if (action === 'raw-save') { saveRaw(); return; }
    if (action === 'cookie-add') { addCookie(); return; }
    if (action === 'cookie-remove') { removeCookie(Number(button.getAttribute('data-index'))); return; }
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

  function onInput(event) {
    var target = event.target;
    if (!target) return;
    if (target.hasAttribute('data-input')) { updateDirtyState(); return; }
    if (target.hasAttribute && target.hasAttribute('data-cookie')) updateCookieState();
  }

  function onLeaveGuard(event) {
    if (!isDirty()) return;
    var target = event.target;
    var trigger = target && target.closest ? target.closest('[data-nav],[data-lang-set]') : null;
    if (!trigger) return;
    if (T.confirm(t('discard'))) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onBeforeUnload(event) {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
    return '';
  }

  function onKeydown(event) {
    if (!(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== 's') return;
    if (!host || !host.parentNode) return;
    event.preventDefault();
    if (collectFields().count > 0) saveFields();
  }

  /* ---------------- view registration ---------------- */

  T.views.register('system', {
    mount: function (root) {
      host = root;
      injectStyle();

      S.fields = [];
      S.fieldsExists = false;
      S.fieldsError = null;
      S.cleared = {};
      S.raw = { content: '', path: '', exists: false };
      S.rawError = null;
      S.cookies = [];
      S.cookieExists = false;
      S.cookiesError = null;
      S.cookieDraft = [];
      S.cookiesRaw = { content: '', path: '', exists: false };
      S.cookiesRawError = null;
      S.info = { config: null, health: null, queue: null, db: null };
      busy = { fields: false, cookies: false, raw: false, cookiesRaw: false };
      activeNav = 'basic';
      rafId = 0;

      host.innerHTML = markup();
      renderLoading();
      renderNav();
      host.addEventListener('click', onClick);
      host.addEventListener('input', onInput);
      host.addEventListener('keydown', onKeydown);
      window.addEventListener('scroll', onScroll, { passive: true });
      document.addEventListener('click', onLeaveGuard, true);
      window.addEventListener('beforeunload', onBeforeUnload);

      refresh();
      timer = setInterval(loadRuntime, 30000);

      return {
        refresh: function () { return refresh(); },
        destroy: function () {
          if (timer) { clearInterval(timer); timer = null; }
          window.removeEventListener('scroll', onScroll);
          document.removeEventListener('click', onLeaveGuard, true);
          window.removeEventListener('beforeunload', onBeforeUnload);
          if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
          if (host) {
            host.removeEventListener('click', onClick);
            host.removeEventListener('input', onInput);
            host.removeEventListener('keydown', onKeydown);
          }
          host = null;
        }
      };
    }
  });
})();
