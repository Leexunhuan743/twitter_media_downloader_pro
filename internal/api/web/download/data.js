/* TMD · 数据视图（/data）—— 6 个子标签 + KPI + 搜索/排序/分页 + 编辑/删除 */
(function () {
  'use strict';

  var T = window.TMD;
  if (!T) return;

  /* ---------------- i18n（data.* 命名空间，双语） ---------------- */

  T.i18n.add({
    'zh-CN': {
      data: {
        title: '数据',
        sub: '用户、列表、媒体实体、链接与改名历史的浏览与维护',
        kpiUsers: '用户数',
        kpiUsersSub: '曾用名 {n}',
        kpiLists: '列表数',
        kpiListsSub: '列表媒体 {n}',
        kpiEntities: '媒体实体数',
        kpiEntitiesSub: '用户媒体 {n} · 列表媒体 {m}',
        kpiLinks: '链接数',
        statsError: '统计数据加载失败',
        tabsLabel: '数据表',
        tabUsers: '用户',
        tabLists: '列表',
        tabUserEntities: '用户媒体',
        tabListEntities: '列表媒体',
        tabUserLinks: '用户链接',
        tabPreviousNames: '改名历史',
        searchPlaceholder: '搜索名称 / 用户名',
        filterAccessible: '可访问',
        filterProtected: '受保护',
        filterOwner: '所属用户 ID',
        filterUser: '用户 ID',
        filterList: '列表 ID',
        filterListEntity: '列表媒体 ID',
        colId: 'ID',
        colScreenName: '用户名',
        colName: '名称',
        colProtected: '受保护',
        colFriends: '关注数',
        colAccessible: '可访问',
        colOwner: '所属用户',
        colUserId: '用户 ID',
        colMediaCount: '媒体数',
        colLatestRelease: '最近发布',
        colParentDir: '目录',
        colListId: '列表 ID',
        colListName: '列表名',
        colParentEntity: '所属列表媒体',
        colParentEntityName: '列表媒体名',
        colRecordDate: '记录时间',
        colCurrentScreenName: '当前用户名',
        colCurrentName: '当前名称',
        empty: '没有匹配的记录',
        expand: '展开',
        collapse: '收起',
        editTitle: '编辑记录',
        editDesc: 'ID {id} · 只会提交改动过的字段',
        noChanges: '没有改动',
        confirmDelete: '确定删除「{name}」？此操作不可撤销。',
        invalidNumber: '请输入有效数字',
        subEntities: '媒体实体',
        subLinks: '用户链接',
        subNames: '改名历史',
        subEmpty: '没有子记录',
        searchLabel: '搜索'
      }
    },
    'en': {
      data: {
        title: 'Data',
        sub: 'Browse and maintain users, lists, media entities, links and rename history',
        kpiUsers: 'Users',
        kpiUsersSub: '{n} previous names',
        kpiLists: 'Lists',
        kpiListsSub: '{n} list entities',
        kpiEntities: 'Media entities',
        kpiEntitiesSub: '{n} user · {m} list',
        kpiLinks: 'Links',
        statsError: 'Could not load database stats',
        tabsLabel: 'Data tables',
        tabUsers: 'Users',
        tabLists: 'Lists',
        tabUserEntities: 'User media',
        tabListEntities: 'List media',
        tabUserLinks: 'User links',
        tabPreviousNames: 'Rename history',
        searchPlaceholder: 'Search name / screen name',
        filterAccessible: 'Accessible',
        filterProtected: 'Protected',
        filterOwner: 'Owner user ID',
        filterUser: 'User ID',
        filterList: 'List ID',
        filterListEntity: 'List entity ID',
        colId: 'ID',
        colScreenName: 'Screen name',
        colName: 'Name',
        colProtected: 'Protected',
        colFriends: 'Friends',
        colAccessible: 'Accessible',
        colOwner: 'Owner',
        colUserId: 'User ID',
        colMediaCount: 'Media',
        colLatestRelease: 'Latest release',
        colParentDir: 'Directory',
        colListId: 'List ID',
        colListName: 'List name',
        colParentEntity: 'Parent list entity',
        colParentEntityName: 'List entity name',
        colRecordDate: 'Recorded at',
        colCurrentScreenName: 'Current screen name',
        colCurrentName: 'Current name',
        empty: 'No matching records',
        expand: 'Expand',
        collapse: 'Collapse',
        editTitle: 'Edit record',
        editDesc: 'ID {id} · only changed fields are submitted',
        noChanges: 'No changes',
        confirmDelete: 'Delete “{name}”? This cannot be undone.',
        invalidNumber: 'Enter a valid number',
        subEntities: 'Media entities',
        subLinks: 'User links',
        subNames: 'Rename history',
        subEmpty: 'No sub-records',
        searchLabel: 'Search'
      }
    }
  });

  /* ---------------- 视图私有样式（仅一次注入，前缀 data-） ---------------- */

  (function injectStyle() {
    if (document.getElementById('view-data-style')) return;
    var style = document.createElement('style');
    style.id = 'view-data-style';
    style.textContent =
      '.data-sub{margin:4px 0 12px;padding-left:12px;border-left:2px solid var(--border)}' +
      '.data-sub + .data-sub{margin-top:14px}' +
      '.data-sub__title{margin:0 0 6px;color:var(--muted);font-size:12px;font-weight:650;letter-spacing:.02em}' +
      '.data-sub .tablewrap{background:var(--surface-2)}';
    document.head.appendChild(style);
  })();

  /* ---------------- 依赖与工具 ---------------- */

  var TAB_ORDER = ['users', 'lists', 'userEntities', 'listEntities', 'userLinks', 'previousNames'];

  var TABS = {
    users: {
      api: '/api/v1/db/users',
      label: 'tabUsers',
      editable: true,
      expandable: true,
      columns: [
        { key: 'id', label: 'colId', sort: 'id', mono: true },
        { key: 'screen_name', label: 'colScreenName', sort: 'screen_name' },
        { key: 'name', label: 'colName', sort: 'name' },
        { key: 'protected', label: 'colProtected', render: function (row) { return boolBadge(!!row.protected, row.protected ? 'warn' : 'ok'); } },
        { key: 'friends_count', label: 'colFriends', sort: 'friends_count', num: true },
        { key: 'is_accessible', label: 'colAccessible', sort: 'is_accessible', render: function (row) { return boolBadge(!!row.is_accessible, row.is_accessible ? 'ok' : 'danger'); } }
      ],
      filters: [
        { key: 'q', type: 'search', placeholder: 'searchPlaceholder' },
        { key: 'accessible', type: 'select', label: 'filterAccessible' },
        { key: 'protected', type: 'select', label: 'filterProtected' }
      ],
      fields: [
        { key: 'screen_name', kind: 'text', label: 'colScreenName' },
        { key: 'name', kind: 'text', label: 'colName' },
        { key: 'friends_count', kind: 'number', label: 'colFriends' },
        { key: 'protected', kind: 'checkbox', label: 'colProtected' },
        { key: 'is_accessible', kind: 'checkbox', label: 'colAccessible' }
      ]
    },
    lists: {
      api: '/api/v1/db/lists',
      label: 'tabLists',
      editable: true,
      expandable: true,
      columns: [
        { key: 'id', label: 'colId', sort: 'id', mono: true },
        { key: 'name', label: 'colName', sort: 'name' },
        { key: 'owner_user_id', label: 'colOwner', sort: 'owner_id', num: true }
      ],
      filters: [
        { key: 'q', type: 'search', placeholder: 'searchPlaceholder' },
        { key: 'ownerId', type: 'number', label: 'filterOwner' }
      ],
      fields: [
        { key: 'name', kind: 'text', label: 'colName' },
        { key: 'owner_user_id', kind: 'text', label: 'colOwner' }
      ]
    },
    userEntities: {
      api: '/api/v1/db/user-entities',
      label: 'tabUserEntities',
      editable: true,
      expandable: false,
      columns: [
        { key: 'id', label: 'colId', sort: 'id', mono: true },
        { key: 'user_id', label: 'colUserId', sort: 'user_id', num: true },
        { key: 'name', label: 'colName', sort: 'name' },
        { key: 'media_count', label: 'colMediaCount', sort: 'media_count', num: true },
        { key: 'latest_release_time', label: 'colLatestRelease', sort: 'latest_release_time', render: function (row) { return T.fmtTime(row.latest_release_time); } }
      ],
      filters: [
        { key: 'q', type: 'search', placeholder: 'searchPlaceholder' },
        { key: 'userId', type: 'number', label: 'filterUser' }
      ],
      fields: [
        { key: 'name', kind: 'text', label: 'colName' },
        { key: 'media_count', kind: 'number', label: 'colMediaCount' },
        { key: 'latest_release_time', kind: 'datetime', label: 'colLatestRelease' }
      ]
    },
    listEntities: {
      api: '/api/v1/db/list-entities',
      label: 'tabListEntities',
      editable: true,
      expandable: false,
      columns: [
        { key: 'id', label: 'colId', sort: 'id', mono: true },
        { key: 'lst_id', label: 'colListId', sort: 'lst_id', num: true },
        { key: 'name', label: 'colName', sort: 'name' },
        { key: 'list_name', label: 'colListName' }
      ],
      filters: [
        { key: 'q', type: 'search', placeholder: 'searchPlaceholder' },
        { key: 'listId', type: 'number', label: 'filterList' }
      ],
      fields: [
        { key: 'name', kind: 'text', label: 'colName' }
      ]
    },
    userLinks: {
      api: '/api/v1/db/user-links',
      label: 'tabUserLinks',
      editable: true,
      expandable: false,
      columns: [
        { key: 'id', label: 'colId', sort: 'id', mono: true },
        { key: 'user_id', label: 'colUserId', sort: 'user_id', num: true },
        { key: 'name', label: 'colName', sort: 'name' },
        { key: 'parent_lst_entity_id', label: 'colParentEntity', sort: 'parent_lst_entity_id', num: true },
        { key: 'parent_lst_entity_name', label: 'colParentEntityName' }
      ],
      filters: [
        { key: 'q', type: 'search', placeholder: 'searchPlaceholder' },
        { key: 'userId', type: 'number', label: 'filterUser' },
        { key: 'listEntityId', type: 'number', label: 'filterListEntity' }
      ],
      fields: [
        { key: 'name', kind: 'text', label: 'colName' }
      ]
    },
    previousNames: {
      api: '/api/v1/db/user-previous-names',
      label: 'tabPreviousNames',
      editable: false,
      expandable: false,
      columns: [
        { key: 'id', label: 'colId', sort: 'id', mono: true },
        { key: 'user_id', label: 'colUserId', sort: 'user_id', num: true },
        { key: 'screen_name', label: 'colScreenName', sort: 'screen_name' },
        { key: 'name', label: 'colName', sort: 'name' },
        { key: 'record_date', label: 'colRecordDate', sort: 'record_date', render: function (row) { return T.fmtTime(row.record_date); } },
        { key: 'current_screen_name', label: 'colCurrentScreenName', sort: 'current_screen_name' },
        { key: 'current_name', label: 'colCurrentName' }
      ],
      filters: [
        { key: 'q', type: 'search', placeholder: 'searchPlaceholder' },
        { key: 'userId', type: 'number', label: 'filterUser' }
      ],
      fields: []
    }
  };

  function t(key, vars) { return T.t('data.' + key, vars); }
  function labelOf(key) { return key.indexOf('common.') === 0 ? T.t(key) : t(key); }
  var esc = T.esc;

  function boolBadge(value, kind) {
    return '<span class="badge badge--' + kind + '">' +
      esc(value ? T.t('common.yes') : T.t('common.no')) + '</span>';
  }

  var fmtNum = T.fmtNum;

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function toLocalInput(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      'T' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  function sameDateTime(a, b) {
    var ea = !a, eb = !b;
    if (ea && eb) return true;
    if (ea !== eb) return false;
    var ta = Date.parse(a), tb = Date.parse(b);
    if (isNaN(ta) || isNaN(tb)) return String(a) === String(b);
    // UI 的 datetime-local 只到分钟精度：按分钟比较，避免未改动的秒被误判为变更
    return Math.floor(ta / 60000) === Math.floor(tb / 60000);
  }

  function sameValue(kind, oldValue, next) {
    if (kind === 'checkbox') return !!oldValue === !!next;
    if (kind === 'number') return Number(oldValue || 0) === Number(next || 0);
    if (kind === 'datetime') return sameDateTime(oldValue, next);
    return String(oldValue === undefined || oldValue === null ? '' : oldValue) ===
      String(next === undefined || next === null ? '' : next);
  }

  /* ---------------- 视图状态 ---------------- */

  var host = null;
  var st = {
    tab: 'users',
    stats: null,
    statsError: '',
    editing: null,
    tabs: {}
  };

  function tabState(id) {
    if (!st.tabs[id]) {
      st.tabs[id] = {
        filters: {},
        page: 1,
        pageSize: 20,
        sortBy: 'id',
        sortOrder: 'desc',
        rows: [],
        total: 0,
        totalPages: 1,
        loading: true,
        error: '',
        seq: 0,
        expanded: {},
        subCache: {}
      };
    }
    return st.tabs[id];
  }

  function visibleColumns(tab) {
    var def = TABS[tab];
    var cols = def.columns.slice();
    if (def.editable || def.expandable) {
      cols.push({ key: '__actions', label: 'common.actions', actions: true });
    }
    return cols;
  }

  /* ---------------- 骨架 ---------------- */

  function kpi(key, label) {
    return '<div class="kpi">' +
      '<div class="kpi__label">' + esc(label) + '</div>' +
      '<div class="kpi__value" data-kpi="' + key + '">—</div>' +
      '<div class="kpi__sub" data-kpi-sub="' + key + '"></div>' +
      '</div>';
  }

  function modalMarkup() {
    return '<dialog class="modal modal--wide" data-role="edit-modal">' +
      '<form class="modal__form" data-role="edit-form" novalidate>' +
        '<div class="modal__head">' +
          '<div>' +
            '<h3 class="modal__title" data-role="modal-title"></h3>' +
            '<p class="modal__desc" data-role="modal-desc"></p>' +
          '</div>' +
          '<button type="button" class="modal__close" data-act="modal-close" aria-label="' + esc(T.t('common.close')) + '">×</button>' +
        '</div>' +
        '<p class="notice notice--danger" data-role="modal-error" hidden></p>' +
        '<div class="form-grid" data-role="modal-fields"></div>' +
        '<div class="modal__actions">' +
          '<button type="button" class="btn btn--ghost" data-act="modal-close">' + esc(T.t('common.cancel')) + '</button>' +
          '<button type="submit" class="btn btn--primary">' + esc(T.t('common.save')) + '</button>' +
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
          '<button type="button" class="btn btn--ghost btn--sm" data-act="refresh">' + esc(T.t('common.refresh')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="grid-4" data-role="kpis">' +
        kpi('users', t('kpiUsers')) +
        kpi('lists', t('kpiLists')) +
        kpi('entities', t('kpiEntities')) +
        kpi('links', t('kpiLinks')) +
      '</div>' +
      '<p class="notice notice--danger mt-12" data-role="stats-error" hidden></p>' +
      '<section class="card mt-16">' +
        '<div class="filters" data-role="tabs" role="group" aria-label="' + esc(t('tabsLabel')) + '"></div>' +
        '<div class="toolbar" data-role="toolbar"></div>' +
        '<div data-role="table"></div>' +
        '<div class="pager" data-role="pager"></div>' +
      '</section>' +
      modalMarkup();
  }

  /* ---------------- KPI ---------------- */

  function setKpi(key, value, sub) {
    if (!host) return;
    var valueEl = host.querySelector('[data-kpi="' + key + '"]');
    var subEl = host.querySelector('[data-kpi-sub="' + key + '"]');
    if (valueEl) valueEl.textContent = value;
    if (subEl) subEl.textContent = sub || '';
  }

  function renderStats() {
    if (!host) return;
    var stats = st.stats || {};
    setKpi('users', fmtNum(stats.users), t('kpiUsersSub', { n: fmtNum(stats.user_previous_names) }));
    setKpi('lists', fmtNum(stats.lsts), t('kpiListsSub', { n: fmtNum(stats.lst_entities) }));
    setKpi('entities', fmtNum(stats.user_entities), t('kpiEntitiesSub', { n: fmtNum(stats.user_entities), m: fmtNum(stats.lst_entities) }));
    setKpi('links', fmtNum(stats.user_links), '');

    var errBox = host.querySelector('[data-role="stats-error"]');
    if (!errBox) return;
    if (st.statsError) {
      errBox.hidden = false;
      errBox.innerHTML = '<span>' + esc(t('statsError')) + ' · ' + esc(st.statsError) + '</span> ' +
        '<button type="button" class="btn btn--ghost btn--sm" data-act="retry-stats">' + esc(T.t('common.retry')) + '</button>';
    } else {
      errBox.hidden = true;
      errBox.innerHTML = '';
    }
  }

  function loadStats() {
    return T.api.get('/api/v1/db/stats').then(function (data) {
      st.stats = data || {};
      st.statsError = '';
      renderStats();
    }).catch(function (err) {
      if (err && err.status === 401) return;
      st.stats = null;
      st.statsError = (err && err.message) || T.t('common.fetchFailed');
      renderStats();
    });
  }

  /* ---------------- 子标签 / 工具栏 ---------------- */

  function renderTabs() {
    if (!host) return;
    var box = host.querySelector('[data-role="tabs"]');
    if (!box) return;
    box.innerHTML = TAB_ORDER.map(function (id) {
      var active = st.tab === id;
      return '<button type="button" class="chip" aria-pressed="' + (active ? 'true' : 'false') +
        '" data-tab="' + id + '">' + esc(t(TABS[id].label)) + '</button>';
    }).join('');
  }

  function selectOptions(field, value) {
    var options = [{ value: '', label: 'common.all' }];
    if (field.key === 'accessible' || field.key === 'protected') {
      options.push({ value: 'true', label: 'common.yes' }, { value: 'false', label: 'common.no' });
    }
    return options.map(function (option) {
      return '<option value="' + esc(option.value) + '"' + (String(value || '') === option.value ? ' selected' : '') + '>' +
        esc(labelOf(option.label)) + '</option>';
    }).join('');
  }

  function renderToolbar() {
    if (!host) return;
    var box = host.querySelector('[data-role="toolbar"]');
    if (!box) return;
    var def = TABS[st.tab];
    var s = tabState(st.tab);
    var html = def.filters.map(function (field) {
      var value = s.filters[field.key] === undefined ? '' : s.filters[field.key];
      if (field.type === 'search') {
        return '<div class="toolbar__grow">' +
          '<label class="visually-hidden" for="data-filter-' + esc(field.key) + '">' + esc(t('searchLabel')) + '</label>' +
          '<input class="input" id="data-filter-' + esc(field.key) + '" type="search" data-filter="' + esc(field.key) + '"' +
            ' placeholder="' + esc(labelOf(field.placeholder || 'searchPlaceholder')) + '"' +
            ' value="' + esc(value) + '" autocomplete="off">' +
          '</div>';
      }
      if (field.type === 'select') {
        return '<label class="row-flex small muted"><span>' + esc(labelOf(field.label)) + '</span>' +
          '<select class="select" data-filter="' + esc(field.key) + '" aria-label="' + esc(labelOf(field.label)) + '">' +
          selectOptions(field, value) + '</select></label>';
      }
      return '<input class="input" style="width:150px" type="number" min="1" data-filter="' + esc(field.key) + '"' +
        ' placeholder="' + esc(labelOf(field.label)) + '" aria-label="' + esc(labelOf(field.label)) + '"' +
        ' value="' + esc(value) + '" autocomplete="off">';
    }).join('');
    html += '<button type="button" class="btn btn--ghost btn--sm" data-act="reset-filters">' + esc(T.t('common.reset')) + '</button>';
    box.innerHTML = html;
  }

  /* ---------------- 表格 ---------------- */

  function tdClass(col) {
    var cls = [];
    if (col.num) cls.push('table__num');
    if (col.mono) cls.push('mono');
    return cls.length ? ' class="' + cls.join(' ') + '"' : '';
  }

  function cellHtml(col, row) {
    if (col.render) return col.render(row);
    var value = row[col.key];
    return esc(value === undefined || value === null ? '' : value);
  }

  function thHtml(col, s) {
    var label = esc(labelOf(col.label));
    if (!col.sort) return '<th scope="col">' + label + '</th>';
    var aria = s.sortBy === col.sort
      ? ' aria-sort="' + (s.sortOrder === 'asc' ? 'ascending' : 'descending') + '"'
      : '';
    return '<th scope="col" data-sortable="true" data-sort="' + esc(col.sort) + '" tabindex="0"' + aria + '>' + label + '</th>';
  }

  function actionBtn(act, id, label, extraClass, extraAttrs) {
    return '<button type="button" class="btn btn--ghost btn--sm' + (extraClass ? ' ' + extraClass : '') + '"' +
      ' data-act="' + act + '" data-id="' + esc(id) + '"' + (extraAttrs || '') + '>' + esc(label) + '</button>';
  }

  function actionsHtml(def, s, row) {
    var id = String(row.id);
    var expanded = !!s.expanded[id];
    var parts = [];
    if (def.expandable) {
      parts.push(actionBtn('expand', id, expanded ? t('collapse') : t('expand'), '', ' aria-expanded="' + (expanded ? 'true' : 'false') + '"'));
    }
    if (def.editable) {
      parts.push(actionBtn('edit', id, T.t('common.edit')));
      parts.push(actionBtn('del', id, T.t('common.delete'), 'btn--danger'));
    }
    return '<div class="row-flex">' + parts.join('') + '</div>';
  }

  function rowLabel(def, row) {
    return row.name || row.screen_name || row.current_screen_name || ('#' + String(row.id));
  }

  function dataRow(def, s, row, cols) {
    var id = String(row.id);
    var expanded = !!s.expanded[id];
    var cells = cols.map(function (col) {
      if (col.actions) return '<td class="table__actions">' + actionsHtml(def, s, row) + '</td>';
      return '<td' + tdClass(col) + '>' + cellHtml(col, row) + '</td>';
    }).join('');
    var html = '<tr data-id="' + esc(id) + '">' + cells + '</tr>';
    if (expanded) html += subRow(def, s, row, cols.length);
    return html;
  }

  function tableHtml(def, s, cols) {
    var head = '<thead><tr>' + cols.map(function (col) { return thHtml(col, s); }).join('') + '</tr></thead>';
    var body = '<tbody>' + s.rows.map(function (row) { return dataRow(def, s, row, cols); }).join('') + '</tbody>';
    return '<div class="tablewrap"><table class="table">' + head + body + '</table></div>';
  }

  function renderTable() {
    if (!host) return;
    var box = host.querySelector('[data-role="table"]');
    if (!box) return;
    var def = TABS[st.tab];
    var s = tabState(st.tab);
    var cols = visibleColumns(st.tab);
    var html;
    if (s.loading) {
      html = '<p class="empty small">' + esc(T.t('common.loading')) + '</p>';
    } else if (s.error) {
      html = '<p class="notice notice--danger">' + esc(s.error) + ' ' +
        '<button type="button" class="btn btn--ghost btn--sm" data-act="retry-tab">' + esc(T.t('common.retry')) + '</button>' +
        '</p>';
    } else if (!s.rows.length) {
      html = '<p class="empty">' + esc(t('empty')) + '</p>';
    } else {
      html = tableHtml(def, s, cols);
    }
    box.innerHTML = html;
  }

  /* ---------------- 展开子资源 ---------------- */

  function unwrapList(res) {
    return (res && Array.isArray(res.data)) ? res.data : [];
  }

  function miniTable(cols, rows) {
    if (!rows || !rows.length) return '<p class="empty small">' + esc(t('subEmpty')) + '</p>';
    var head = cols.map(function (col) { return '<th scope="col">' + esc(labelOf(col.label)) + '</th>'; }).join('');
    var body = rows.map(function (row) {
      return '<tr>' + cols.map(function (col) {
        return '<td' + (col.num ? ' class="table__num"' : '') + '>' + esc(col.get(row)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="tablewrap"><table class="table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function subBlock(title, html) {
    return '<div class="data-sub"><p class="data-sub__title">' + esc(title) + '</p>' + html + '</div>';
  }

  function subRow(def, s, row, colspan) {
    var id = String(row.id);
    var cache = s.subCache[id];
    var inner;
    if (!cache || cache.loading) {
      inner = '<p class="empty small">' + esc(T.t('common.loading')) + '</p>';
    } else if (cache.error) {
      inner = '<p class="notice notice--danger">' + esc(cache.error) + '</p>';
    } else if (st.tab === 'users') {
      inner = subBlock(t('subEntities'), miniTable([
        { label: 'colName', get: function (r) { return r.name || ''; } },
        { label: 'colMediaCount', num: true, get: function (r) { return String(Number(r.media_count) || 0); } },
        { label: 'colLatestRelease', get: function (r) { return T.fmtTime(r.latest_release_time); } }
      ], cache.entities)) +
        subBlock(t('subLinks'), miniTable([
          { label: 'colName', get: function (r) { return r.name || ''; } },
          { label: 'colParentEntityName', get: function (r) { return r.parent_lst_entity_name || ''; } }
        ], cache.links)) +
        subBlock(t('subNames'), miniTable([
          { label: 'colScreenName', get: function (r) { return r.screen_name || ''; } },
          { label: 'colName', get: function (r) { return r.name || ''; } },
          { label: 'colRecordDate', get: function (r) { return T.fmtTime(r.record_date); } }
        ], cache.names));
    } else {
      inner = subBlock(t('subEntities'), miniTable([
        { label: 'colName', get: function (r) { return r.name || ''; } },
        { label: 'colParentDir', get: function (r) { return r.parent_dir || ''; } }
      ], cache.entities));
    }
    return '<tr class="data-sub-row"><td colspan="' + colspan + '" class="table__cell-wrap">' + inner + '</td></tr>';
  }

  function fetchSub(tab, id) {
    var s = tabState(tab);
    var cache = { loading: true, entities: [], links: [], names: [] };
    s.subCache[id] = cache;

    function fail(err) {
      cache.loading = false;
      cache.error = (err && err.message) || T.t('common.fetchFailed');
      if (host && st.tab === tab) renderTable();
    }

    if (tab === 'users') {
      Promise.all([
        T.api.get('/api/v1/db/users/' + encodeURIComponent(id) + '/entities', { page: 1, pageSize: 5 }),
        T.api.get('/api/v1/db/users/' + encodeURIComponent(id) + '/links', { page: 1, pageSize: 5 }),
        T.api.get('/api/v1/db/users/' + encodeURIComponent(id) + '/previous-names', { page: 1, pageSize: 5 })
      ]).then(function (res) {
        cache.entities = unwrapList(res[0]);
        cache.links = unwrapList(res[1]);
        cache.names = unwrapList(res[2]);
        cache.loading = false;
        if (host && st.tab === tab) renderTable();
      }).catch(fail);
    } else {
      T.api.get('/api/v1/db/lists/' + encodeURIComponent(id) + '/entities', { page: 1, pageSize: 5 })
        .then(function (res) {
          cache.entities = unwrapList(res);
          cache.loading = false;
          if (host && st.tab === tab) renderTable();
        }).catch(fail);
    }
  }

  function toggleExpand(tab, id) {
    id = String(id);
    var s = tabState(tab);
    if (s.expanded[id]) {
      delete s.expanded[id];
      renderTable();
      return;
    }
    s.expanded[id] = true;
    if (!s.subCache[id]) fetchSub(tab, id);
    renderTable();
  }

  /* ---------------- 分页 ---------------- */

  function pageSizeOptions(current) {
    var sizes = [20, 50, 100];
    if (sizes.indexOf(Number(current)) < 0) sizes.push(Number(current));
    return sizes.filter(function (n) { return n > 0; }).map(function (n) {
      return '<option value="' + n + '"' + (Number(current) === n ? ' selected' : '') + '>' + n + '</option>';
    }).join('');
  }

  function renderPager() {
    if (!host) return;
    var box = host.querySelector('[data-role="pager"]');
    if (!box) return;
    var s = tabState(st.tab);
    var info = T.t('common.total', { n: s.total }) + ' · ' + T.t('common.page', { page: s.page, pages: s.totalPages });
    box.innerHTML =
      '<button type="button" class="btn btn--ghost btn--sm" data-act="prev"' + (s.page <= 1 ? ' disabled' : '') + '>' +
        esc(T.t('common.previous')) + '</button>' +
      '<span class="pager__grow">' + esc(info) + '</span>' +
      '<label class="row-flex small muted"><span>' + esc(T.t('common.pageSize')) + '</span>' +
        '<select class="select" data-role="pagesize" aria-label="' + esc(T.t('common.pageSize')) + '">' +
          pageSizeOptions(s.pageSize) + '</select></label>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-act="next"' + (s.page >= s.totalPages ? ' disabled' : '') + '>' +
        esc(T.t('common.next')) + '</button>';
  }

  /* ---------------- 数据加载 ---------------- */

  function buildParams(s) {
    var params = { page: s.page, pageSize: s.pageSize, sortBy: s.sortBy, sortOrder: s.sortOrder };
    Object.keys(s.filters).forEach(function (key) {
      var value = s.filters[key];
      if (value === undefined || value === null || value === '') return;
      params[key] = value;
    });
    return params;
  }

  function loadTab(tab) {
    var s = tabState(tab);
    s.loading = true;
    s.error = '';
    s.seq += 1;
    var seq = s.seq;
    if (host && st.tab === tab) { renderTable(); renderPager(); }

    return T.api.get(TABS[tab].api, buildParams(s)).then(function (res) {
      if (s.seq !== seq) return;
      var rows = (res && res.data) || [];
      if (!Array.isArray(rows)) rows = [];
      s.rows = rows;
      s.total = Number(res && res.total) || 0;
      s.page = Number(res && res.page) || 1;
      if (res && res.pageSize) s.pageSize = Number(res.pageSize);
      s.totalPages = Number(res && res.totalPages) || 1;
      s.loading = false;
      if (!s.rows.length && s.page > 1) {
        s.page = Math.max(1, s.totalPages);
        return loadTab(tab);
      }
      if (host && st.tab === tab) { renderTable(); renderPager(); }
    }).catch(function (err) {
      if (s.seq !== seq) return;
      s.loading = false;
      if (err && err.status === 401) return;
      s.error = (err && err.message) || T.t('common.fetchFailed');
      if (host && st.tab === tab) { renderTable(); renderPager(); }
    });
  }

  function switchTab(id) {
    if (!TABS[id] || st.tab === id) return;
    st.tab = id;
    renderTabs();
    renderToolbar();
    renderTable();
    renderPager();
    loadTab(id);
  }

  function changePage(delta) {
    var s = tabState(st.tab);
    var next = s.page + delta;
    if (next < 1 || next > s.totalPages || next === s.page) return;
    s.page = next;
    loadTab(st.tab);
  }

  function resetFilters() {
    var s = tabState(st.tab);
    s.filters = {};
    s.page = 1;
    renderToolbar();
    loadTab(st.tab);
  }

  /* ---------------- 编辑弹窗 ---------------- */

  function fieldHtml(field, row) {
    var label = labelOf(field.label);
    var raw = row[field.key];
    if (field.kind === 'checkbox') {
      return '<div class="field-box"><span class="field-box__label">' + esc(label) + '</span>' +
        '<label class="check"><input type="checkbox" data-field="' + esc(field.key) + '" aria-label="' + esc(label) + '"' +
        (raw ? ' checked' : '') + '></label></div>';
    }
    var type = field.kind === 'number' ? 'number' : (field.kind === 'datetime' ? 'datetime-local' : 'text');
    var value = field.kind === 'datetime' ? toLocalInput(raw) : (raw === undefined || raw === null ? '' : String(raw));
    return '<div class="field-box">' +
      '<label class="field-box__label" for="data-field-' + esc(field.key) + '">' + esc(label) + '</label>' +
      '<input class="input" id="data-field-' + esc(field.key) + '" type="' + type + '"' +
        ' data-field="' + esc(field.key) + '" value="' + esc(value) + '" autocomplete="off" spellcheck="false"' +
        (type === 'number' ? ' step="1"' : '') + '>' +
      '</div>';
  }

  function showModalError(message) {
    if (!host) return;
    var box = host.querySelector('[data-role="modal-error"]');
    if (!box) return;
    if (message) {
      box.textContent = message;
      box.hidden = false;
    } else {
      box.textContent = '';
      box.hidden = true;
    }
  }

  function openEdit(tab, id) {
    if (!host) return;
    var def = TABS[tab];
    if (!def || !def.editable) return;
    var s = tabState(tab);
    var row = null;
    for (var i = 0; i < s.rows.length; i++) {
      if (String(s.rows[i].id) === String(id)) { row = s.rows[i]; break; }
    }
    if (!row) return;

    st.editing = { tab: tab, id: String(id), row: row };

    var dialog = host.querySelector('[data-role="edit-modal"]');
    var form = host.querySelector('[data-role="edit-form"]');
    if (!dialog || !form) return;

    dialog.querySelector('[data-role="modal-title"]').textContent = t('editTitle');
    dialog.querySelector('[data-role="modal-desc"]').textContent = t('editDesc', { id: String(id) });
    form.querySelector('[data-role="modal-fields"]').innerHTML = def.fields.map(function (field) {
      return fieldHtml(field, row);
    }).join('');
    showModalError('');
    var save = form.querySelector('button[type="submit"]');
    if (save) save.disabled = false;
    if (!dialog.open) dialog.showModal();
    var first = form.querySelector('input');
    if (first) first.focus();
  }

  function closeEdit() {
    if (!host) return;
    var dialog = host.querySelector('[data-role="edit-modal"]');
    if (dialog && dialog.open) {
      try { dialog.close(); } catch (e) { /* ignore */ }
    }
    st.editing = null;
  }

  function saveEdit() {
    if (!host || !st.editing) return;
    var editing = st.editing;
    var def = TABS[editing.tab];
    var form = host.querySelector('[data-role="edit-form"]');
    if (!form) return;

    var changes = {};
    var problems = [];

    def.fields.forEach(function (field) {
      var el = form.querySelector('[data-field="' + field.key + '"]');
      if (!el) return;
      var next;
      if (field.kind === 'checkbox') {
        next = !!el.checked;
      } else if (field.kind === 'number') {
        var raw = String(el.value).trim();
        if (raw === '' || !isFinite(Number(raw))) {
          problems.push(labelOf(field.label) + ' · ' + t('invalidNumber'));
          return;
        }
        next = Math.trunc(Number(raw));
      } else if (field.kind === 'datetime') {
        var value = String(el.value).trim();
        if (!value) {
          next = '';
        } else {
          var date = new Date(value);
          if (isNaN(date.getTime())) {
            problems.push(labelOf(field.label) + ' · ' + t('invalidNumber'));
            return;
          }
          next = date.toISOString();
        }
      } else {
        next = String(el.value);
      }
      if (!sameValue(field.kind, editing.row[field.key], next)) changes[field.key] = next;
    });

    if (problems.length) {
      showModalError(problems.join('；'));
      return;
    }
    if (!Object.keys(changes).length) {
      closeEdit();
      T.toast('info', t('noChanges'));
      return;
    }

    var saveBtn = form.querySelector('button[type="submit"]');
    if (saveBtn) saveBtn.disabled = true;
    showModalError('');

    T.api.patch(def.api + '/' + encodeURIComponent(editing.id), changes).then(function () {
      var tab = editing.tab;
      var id = editing.id;
      T.toast('success', T.t('common.saved'));
      closeEdit();
      var s = tabState(tab);
      delete s.subCache[id];
      loadTab(tab);
    }).catch(function (err) {
      if (err && err.status === 401) return;
      showModalError((err && err.message) || T.t('common.failed'));
    }).then(function () {
      if (saveBtn) saveBtn.disabled = false;
    });
  }

  /* ---------------- 删除 ---------------- */

  function doDelete(tab, id) {
    var def = TABS[tab];
    var s = tabState(tab);
    var row = null;
    for (var i = 0; i < s.rows.length; i++) {
      if (String(s.rows[i].id) === String(id)) { row = s.rows[i]; break; }
    }
    var name = row ? rowLabel(def, row) : ('#' + String(id));
    if (!T.confirm(t('confirmDelete', { name: name }))) return;

    T.api.del(def.api + '/' + encodeURIComponent(id)).then(function () {
      T.toast('success', T.t('common.deleted'));
      delete s.subCache[String(id)];
      delete s.expanded[String(id)];
      loadTab(tab);
      loadStats();
    }).catch(function (err) {
      if (err && err.status === 401) return;
      T.toast('error', (err && err.message) || T.t('common.failed'));
    });
  }

  /* ---------------- 事件 ---------------- */

  var debouncedFilter = T.debounce(function () {
    if (!host) return;
    var s = tabState(st.tab);
    s.page = 1;
    loadTab(st.tab);
  }, 300);

  function onHeaderSort(el) {
    var field = el.getAttribute('data-sort');
    if (!field) return;
    var s = tabState(st.tab);
    if (s.sortBy === field) s.sortOrder = s.sortOrder === 'asc' ? 'desc' : 'asc';
    else { s.sortBy = field; s.sortOrder = 'asc'; }
    s.page = 1;
    loadTab(st.tab);
  }

  function onClick(event) {
    var tabBtn = event.target.closest('[data-tab]');
    if (tabBtn) { switchTab(tabBtn.getAttribute('data-tab')); return; }

    var th = event.target.closest('th[data-sort]');
    if (th) { onHeaderSort(th); return; }

    var act = event.target.closest('[data-act]');
    if (!act) return;
    var name = act.getAttribute('data-act');
    var id = act.getAttribute('data-id');
    switch (name) {
      case 'refresh': loadStats(); loadTab(st.tab); break;
      case 'retry-stats': loadStats(); break;
      case 'retry-tab': loadTab(st.tab); break;
      case 'prev': changePage(-1); break;
      case 'next': changePage(1); break;
      case 'edit': openEdit(st.tab, id); break;
      case 'del': doDelete(st.tab, id); break;
      case 'expand': toggleExpand(st.tab, id); break;
      case 'modal-close': closeEdit(); break;
      case 'reset-filters': resetFilters(); break;
      default: break;
    }
  }

  function onInput(event) {
    var el = event.target && event.target.closest ? event.target.closest('[data-filter]') : null;
    if (!el || el.tagName === 'SELECT') return;
    var s = tabState(st.tab);
    s.filters[el.getAttribute('data-filter')] = el.value;
    debouncedFilter();
  }

  function onChange(event) {
    var ps = event.target.closest('[data-role="pagesize"]');
    if (ps) {
      var s = tabState(st.tab);
      s.pageSize = Number(ps.value) || 20;
      s.page = 1;
      loadTab(st.tab);
      return;
    }
    var el = event.target.closest('[data-filter]');
    if (el && el.tagName === 'SELECT') {
      var state = tabState(st.tab);
      state.filters[el.getAttribute('data-filter')] = el.value;
      state.page = 1;
      loadTab(st.tab);
    }
  }

  function onKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var th = event.target && event.target.closest ? event.target.closest('th[data-sort]') : null;
    if (!th) return;
    event.preventDefault();
    onHeaderSort(th);
  }

  function onSubmit(event) {
    var form = event.target;
    if (!form || form.getAttribute('data-role') !== 'edit-form') return;
    event.preventDefault();
    saveEdit();
  }

  function bind() {
    if (!host) return;
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    host.addEventListener('change', onChange);
    host.addEventListener('keydown', onKeydown);
    host.addEventListener('submit', onSubmit);
    var dialog = host.querySelector('[data-role="edit-modal"]');
    if (dialog) {
      dialog.addEventListener('close', function () { st.editing = null; });
    }
  }

  function unbind() {
    if (!host) return;
    host.removeEventListener('click', onClick);
    host.removeEventListener('input', onInput);
    host.removeEventListener('change', onChange);
    host.removeEventListener('keydown', onKeydown);
    host.removeEventListener('submit', onSubmit);
    var dialog = host.querySelector('[data-role="edit-modal"]');
    if (dialog && dialog.open) {
      try { dialog.close(); } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- 挂载 ---------------- */

  function refresh() {
    if (!host) return Promise.resolve();
    return Promise.all([loadStats(), loadTab(st.tab)]);
  }

  T.views.register('data', {
    mount: function (root) {
      host = root;
      st.tab = 'users';
      st.tabs = {};
      st.stats = null;
      st.statsError = '';
      st.editing = null;
      host.innerHTML = markup();
      bind();
      renderTabs();
      renderToolbar();
      renderTable();
      renderPager();
      renderStats();
      loadStats();
      loadTab('users');
      return {
        refresh: refresh,
        destroy: function () {
          unbind();
          host = null;
          st.editing = null;
        }
      };
    }
  });
})();
