/* TMD · 数据视图（/data）—— 6 个子标签 + 紧凑统计条 + 搜索/排序/分页 + 详情/编辑/删除 */
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
        statsLabel: '数据概览',
        statsError: '统计数据加载失败',
        switchTo: '切换到{name}',
        tabsLabel: '数据表',
        tabUsers: '用户',
        tabLists: '列表',
        tabUserEntities: '用户媒体',
        tabListEntities: '列表媒体',
        tabUserLinks: '用户链接',
        tabPreviousNames: '改名历史',
        searchPlaceholder: '搜索名称 / 用户名',
        searchLabel: '搜索',
        filterAccessible: '可访问',
        filterProtected: '受保护',
        filterAccessibleYes: '可访问',
        filterAccessibleNo: '不可访问',
        filterProtectedYes: '受保护',
        filterProtectedNo: '不受保护',
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
        colParentDir: '父目录',
        colListId: '列表 ID',
        colListName: '列表名',
        colParentEntity: '所属列表媒体',
        colParentEntityName: '列表媒体名',
        colRecordDate: '记录时间',
        colCurrentScreenName: '当前用户名',
        colCurrentName: '当前名称',
        stateProtected: '受保护',
        statePublic: '公开',
        stateAccessible: '可访问',
        stateInaccessible: '不可访问',
        detailAction: '详情',
        detailTitle: '记录详情',
        detailDesc: '{type} · ID {id}',
        groupIdentity: '标识',
        groupState: '状态',
        groupData: '数据',
        groupRelation: '关系',
        groupPath: '路径',
        relatedTitle: '关联记录',
        relatedEntities: '用户媒体',
        relatedLinks: '用户链接',
        relatedNames: '改名历史',
        relatedListEntities: '列表媒体',
        relatedEmpty: '没有关联记录',
        relatedError: '关联记录加载失败',
        viewAll: '查看全部 {n} 条',
        metaMedia: '{n} 个媒体',
        copy: '复制',
        copyId: '复制 ID',
        copied: '已复制到剪贴板',
        copyFailed: '复制失败，请手动选择文本',
        copyError: '复制错误信息',
        editTitle: '编辑记录',
        editDesc: '{type} · ID {id} · 只提交改动过的字段',
        noChanges: '没有改动',
        invalidNumber: '请输入有效数字',
        invalidEmpty: '不能为空',
        invalidDigits: '只能填数字',
        invalidScreenName: '用户名为 1-15 位字母、数字或下划线',
        invalidNameChars: '不能包含 / \\ : * ? " < > | 等字符',
        invalidNameDot: '不能以空格或句点结尾',
        invalidTooLong: '不能超过 250 个字符',
        invalidTime: '请输入有效时间',
        renameHint: '改名会同步重命名磁盘上的媒体目录。',
        deleteTitle: '删除记录',
        deleteDesc: '{type} · {name}（ID {id}）',
        deleteUserWarn: '删除用户会级联删除其用户媒体目录（磁盘文件一并移除）、用户链接与改名历史。',
        deleteListWarn: '删除列表会级联删除该列表下的列表媒体目录（磁盘文件一并移除）。',
        deleteEntityWarn: '删除会移除该媒体目录以及目录中的本地文件，不可撤销。',
        deleteLinkWarn: '只删除这条链接记录，不影响本地文件。',
        deleteHint: '此操作不可撤销，请确认 ID 无误。',
        emptyTitle: '暂无数据',
        emptyDesc: '数据来自已完成的下载。先下载一个用户或列表，对应记录会出现在这里。',
        emptyFilteredTitle: '没有匹配的记录',
        emptyFilteredDesc: '换个关键词或清除筛选条件再试。',
        clearFilters: '清除筛选',
        goDownload: '去下载'
      }
    },
    'en': {
      data: {
        title: 'Data',
        sub: 'Browse and maintain users, lists, media entities, links and rename history',
        statsLabel: 'Data overview',
        statsError: 'Could not load database stats',
        switchTo: 'Switch to {name}',
        tabsLabel: 'Data tables',
        tabUsers: 'Users',
        tabLists: 'Lists',
        tabUserEntities: 'User media',
        tabListEntities: 'List media',
        tabUserLinks: 'User links',
        tabPreviousNames: 'Rename history',
        searchPlaceholder: 'Search name / screen name',
        searchLabel: 'Search',
        filterAccessible: 'Accessible',
        filterProtected: 'Protected',
        filterAccessibleYes: 'Accessible',
        filterAccessibleNo: 'Unreachable',
        filterProtectedYes: 'Protected',
        filterProtectedNo: 'Public',
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
        colParentDir: 'Parent directory',
        colListId: 'List ID',
        colListName: 'List name',
        colParentEntity: 'Parent list entity',
        colParentEntityName: 'List entity name',
        colRecordDate: 'Recorded',
        colCurrentScreenName: 'Current screen name',
        colCurrentName: 'Current name',
        stateProtected: 'Protected',
        statePublic: 'Public',
        stateAccessible: 'Accessible',
        stateInaccessible: 'Unreachable',
        detailAction: 'Details',
        detailTitle: 'Record details',
        detailDesc: '{type} · ID {id}',
        groupIdentity: 'Identity',
        groupState: 'State',
        groupData: 'Numbers',
        groupRelation: 'Relation',
        groupPath: 'Path',
        relatedTitle: 'Related records',
        relatedEntities: 'User media',
        relatedLinks: 'User links',
        relatedNames: 'Rename history',
        relatedListEntities: 'List media',
        relatedEmpty: 'No related records',
        relatedError: 'Could not load related records',
        viewAll: 'View all {n}',
        metaMedia: '{n} media',
        copy: 'Copy',
        copyId: 'Copy ID',
        copied: 'Copied to clipboard',
        copyFailed: 'Copy failed — select the text manually',
        copyError: 'Copy error',
        editTitle: 'Edit record',
        editDesc: '{type} · ID {id} · only changed fields are submitted',
        noChanges: 'No changes',
        invalidNumber: 'Enter a valid number',
        invalidEmpty: 'Required',
        invalidDigits: 'Digits only',
        invalidScreenName: '1-15 letters, digits or underscores',
        invalidNameChars: 'Cannot contain / \\ : * ? " < > |',
        invalidNameDot: 'Cannot end with a space or dot',
        invalidTooLong: 'Must not exceed 250 characters',
        invalidTime: 'Enter a valid time',
        renameHint: 'Renaming also renames the media directory on disk.',
        deleteTitle: 'Delete record',
        deleteDesc: '{type} · {name} (ID {id})',
        deleteUserWarn: 'Deleting the user also deletes its user media directories (local files included), user links and rename history.',
        deleteListWarn: 'Deleting the list also deletes its list media directories (local files included).',
        deleteEntityWarn: 'This removes the media directory and its local files. It cannot be undone.',
        deleteLinkWarn: 'Only this link record is deleted; local files are untouched.',
        deleteHint: 'This cannot be undone. Check the ID first.',
        emptyTitle: 'No data yet',
        emptyDesc: 'Data comes from finished downloads. Download a user or a list first and records show up here.',
        emptyFilteredTitle: 'No matching records',
        emptyFilteredDesc: 'Try another keyword or clear the filters.',
        clearFilters: 'Clear filters',
        goDownload: 'Go to downloads'
      }
    }
  });

  /* ---------------- 视图私有样式（id: view-data-style，选择器前缀 data-） ---------------- */

  T.injectStyle('view-data-style', `
.data-stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));margin-top:16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow-sm);overflow:hidden}
.data-stat{display:flex;flex-direction:column;gap:3px;align-items:flex-start;padding:10px 14px;border:0;background:transparent;text-align:left;cursor:pointer;transition:background .14s ease}
.data-stat + .data-stat{border-left:1px solid var(--border)}
.data-stat:hover{background:var(--surface-2)}
.data-stat[aria-pressed="true"]{background:var(--accent-soft)}
.data-stat__label{color:var(--muted);font-size:11.5px;font-weight:650;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.data-stat__value{color:var(--text);font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em;line-height:1.2}
.data-stat[aria-pressed="true"] .data-stat__label,.data-stat[aria-pressed="true"] .data-stat__value{color:var(--accent)}
.data-stats-error{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.data-card{padding:16px 16px 12px}
.data-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.data-tab{display:inline-flex;align-items:center;gap:7px;min-height:34px}
.data-tab .count{min-width:18px;height:18px;padding:0 6px;font-size:11px}
.data-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}
.data-search{position:relative;display:flex;align-items:center;flex:1 1 220px;min-width:180px}
.data-search svg{position:absolute;left:10px;width:15px;height:15px;color:var(--muted);pointer-events:none}
.data-search .input{width:100%;padding-left:32px}
.data-filter{display:inline-flex;align-items:center;gap:6px;min-width:0}
.data-filter__label{color:var(--muted);font-size:12px;font-weight:600;white-space:nowrap}
.data-filter .select{width:auto;min-width:84px}
.data-num{width:110px}
.data-refresh{margin-left:auto}
.data-tablewrap{overflow:hidden}
.data-tablewrap.is-busy{opacity:.55;pointer-events:none;transition:opacity .15s ease}
.data-table{table-layout:fixed}
.data-table th,.data-table td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.data-table th{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.35}
.data-table .data-th-actions{text-align:right}
.data-ell{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.data-id{display:inline-flex;align-items:center;gap:4px;margin:-2px -6px;padding:2px 6px;border:0;border-radius:6px;background:transparent;color:var(--text-soft);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;font-variant-numeric:tabular-nums;cursor:pointer}
.data-id:hover{background:var(--surface-3);color:var(--accent)}
.data-id svg{width:12px;height:12px;opacity:0;transition:opacity .12s ease}
.data-id:hover svg,.data-id:focus-visible svg{opacity:.75}
.data-actions{display:flex;align-items:center;justify-content:flex-end;gap:3px}
.data-iconbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:32px;height:32px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--text-soft);cursor:pointer;transition:background .12s ease,color .12s ease,border-color .12s ease}
.data-iconbtn:hover{background:var(--surface-2);border-color:var(--border);color:var(--text)}
.data-iconbtn--danger:hover{background:var(--danger-soft);border-color:color-mix(in srgb,var(--danger) 34%,var(--border));color:var(--danger)}
.data-iconbtn__label{display:none;font-size:12.5px;font-weight:600}
.data-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:30px 16px}
.data-empty__title{color:var(--text);font-size:14px;font-weight:650}
.data-empty__desc{max-width:52ch;color:var(--muted);font-size:12.5px}
.data-empty__actions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:10px}
.data-error{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.data-error__text{margin:0;word-break:break-word}
.data-error__actions{display:flex;flex-wrap:wrap;gap:8px}
.data-skel td{padding:8px 12px}
.data-group{margin-top:16px}
.data-group__title{margin:0 0 6px;color:var(--muted);font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.data-kv .kv__row{align-items:flex-start}
.data-kv .kv__val{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;min-width:0}
.data-kv .data-kv-wrap{display:block;text-align:right;word-break:break-all}
.data-brk{word-break:break-all}
.data-copy{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--muted);cursor:pointer;flex:none}
.data-copy:hover{background:var(--surface-3);color:var(--accent)}
.data-copy svg{width:13px;height:13px}
.data-subhead{display:flex;align-items:center;gap:8px;margin:12px 0 6px;flex-wrap:wrap}
.data-subhead__title{color:var(--text-soft);font-size:12.5px;font-weight:650}
.data-subhead .data-more{margin-left:auto}
.data-rel-list{display:flex;flex-direction:column;margin:0;padding:0;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;list-style:none}
.data-rel{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:13px}
.data-rel:last-child{border-bottom:0}
.data-rel:nth-child(odd){background:var(--surface-2)}
.data-rel__name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.data-rel__meta{flex:none;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.data-actions-sticky{position:sticky;bottom:0;z-index:2;margin:16px 0 0;padding:12px 0;background:var(--surface);border-top:1px solid var(--border)}
.modal[data-role="detail-modal"]:focus,.modal[data-role="detail-modal"]:focus-visible,.modal[data-role="delete-modal"]:focus,.modal[data-role="delete-modal"]:focus-visible{outline:none}
.data-rename-hint{margin:6px 0 0;color:var(--warn);font-size:12px}
.data-required{color:var(--danger);font-weight:700}
@media (max-width:900px){
  .data-stats{grid-template-columns:repeat(3,minmax(0,1fr))}
  .data-stat:nth-child(3n+1){border-left:0}
  .data-stat:nth-child(n+4){border-top:1px solid var(--border)}
  .data-stat__value{font-size:17px}
}
@media (max-width:720px){
  .data-card{padding:14px 12px 10px}
  .data-toolbar{gap:10px}
  .data-search{flex:1 1 100%}
  .data-search .input{min-height:40px}
  .data-filter{flex:1 1 132px;justify-content:space-between;gap:8px}
  .data-filter .select,.data-filter .input{flex:1 1 auto;min-height:40px}
  .data-num{width:100%}
  .data-refresh{flex:1 1 auto;min-height:40px}
  .data-reset{min-height:40px}
  .data-tabs{flex-wrap:wrap;gap:6px}
  .data-tab{flex:0 1 auto;min-height:40px;padding:0 12px}
  .data-tablewrap{overflow:visible;border:0;background:transparent}
  .data-table,.data-table tbody{display:block;width:100%}
  .data-table thead{display:none}
  .data-table tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;row-gap:4px;margin-bottom:10px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);box-shadow:var(--shadow-sm)}
  .data-table td{display:block;min-width:0;padding:3px 0;border:0;white-space:normal;overflow:visible;text-overflow:clip;text-align:left}
  .data-table td::before{content:attr(data-label);display:block;margin-bottom:1px;color:var(--muted);font-size:11px;font-weight:650;letter-spacing:.02em;white-space:normal;word-break:break-word}
  .data-table td .data-ell{white-space:normal;word-break:break-word;overflow:visible}
  .data-table td > .badge{justify-self:start}
  .data-table td.data-cell--actions{grid-column:1 / -1;margin-top:4px;padding:8px 0 0;border-top:1px solid var(--border)}
  .data-table td.data-cell--actions::before{display:none}
  .data-actions{justify-content:flex-start;gap:8px}
  .data-iconbtn{width:auto;min-width:44px;height:40px;padding:0 12px;border-color:var(--border)}
  .data-iconbtn__label{display:inline}
  .data-id{font-size:13px}
  .data-kv .kv__row{flex-direction:column;gap:3px}
  .data-kv .kv__val,.data-kv .data-kv-wrap{justify-content:flex-start;text-align:left}
  .data-actions-sticky{margin-top:14px;padding:10px 0}
  .modal__actions{flex-wrap:wrap}
}
`);

  /* ---------------- 数据表定义 ---------------- */

  var ICONS = {
    search: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7.1" cy="7.1" r="4.3"/><path d="M10.4 10.4L14 14" stroke-linecap="round"/></svg>',
    copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.6" y="5.6" width="7.8" height="7.8" rx="1.6"/><path d="M10.4 3.4v-.5a1.6 1.6 0 0 0-1.6-1.6H3.3a1.6 1.6 0 0 0-1.6 1.6v5.5a1.6 1.6 0 0 0 1.6 1.6h.5"/></svg>',
    eye: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.6 8S3.9 3.9 8 3.9 14.4 8 14.4 8 12.1 12.1 8 12.1 1.6 8 1.6 8z"/><circle cx="8" cy="8" r="2.4"/></svg>',
    pencil: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.4l2.6 2.6L5.2 13.4l-3.2.6.6-3.2 8.4-8.4z"/></svg>',
    trash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.9 4.4h10.2M6.4 4.4V2.9h3.2v1.5M4.3 4.4l.6 8.7h6.2l.6-8.7"/></svg>'
  };

  var TABS = {
    users: {
      api: '/api/v1/db/users',
      label: 'tabUsers',
      editable: true,
      related: 'users',
      columns: [
        { key: 'id', label: 'colId', sort: 'id', w: 96, render: idCell },
        { key: 'screen_name', label: 'colScreenName', sort: 'screen_name', w: 176, render: textCellOf('screen_name') },
        { key: 'name', label: 'colName', sort: 'name', render: textCellOf('name') },
        { key: 'protected', label: 'colProtected', w: 104, render: function (row) { return badgeCell(!!row.protected, 'warn', 'ok', t('stateProtected'), t('statePublic')); } },
        { key: 'friends_count', label: 'colFriends', sort: 'friends_count', w: 96, num: true, render: numCellOf('friends_count') },
        { key: 'is_accessible', label: 'colAccessible', sort: 'is_accessible', w: 108, render: function (row) { return badgeCell(!!row.is_accessible, 'ok', 'danger', t('stateAccessible'), t('stateInaccessible')); } }
      ],
      filters: [
        { key: 'q', type: 'search' },
        { key: 'accessible', type: 'select', label: 'filterAccessible', options: [
          { value: '', label: 'common.all' }, { value: 'true', label: 'filterAccessibleYes' }, { value: 'false', label: 'filterAccessibleNo' }
        ] },
        { key: 'protected', type: 'select', label: 'filterProtected', options: [
          { value: '', label: 'common.all' }, { value: 'true', label: 'filterProtectedYes' }, { value: 'false', label: 'filterProtectedNo' }
        ] }
      ],
      fields: [
        { key: 'screen_name', kind: 'text', label: 'colScreenName', required: true, pattern: 'screen' },
        { key: 'name', kind: 'text', label: 'colName', required: true, max: 250 },
        { key: 'protected', kind: 'checkbox', label: 'colProtected' },
        { key: 'is_accessible', kind: 'checkbox', label: 'colAccessible' },
        { key: 'friends_count', kind: 'number', label: 'colFriends', min: 0 }
      ]
    },
    lists: {
      api: '/api/v1/db/lists',
      label: 'tabLists',
      editable: true,
      related: 'lists',
      columns: [
        { key: 'id', label: 'colId', sort: 'id', w: 96, render: idCell },
        { key: 'name', label: 'colName', sort: 'name', render: textCellOf('name') },
        { key: 'owner_user_id', label: 'colOwner', sort: 'owner_id', w: 156, render: monoCellOf('owner_user_id') }
      ],
      filters: [
        { key: 'q', type: 'search' },
        { key: 'ownerId', type: 'number', label: 'filterOwner' }
      ],
      fields: [
        { key: 'name', kind: 'text', label: 'colName', required: true, max: 250 },
        { key: 'owner_user_id', kind: 'text', label: 'colOwner', required: true, pattern: 'digits' }
      ]
    },
    userEntities: {
      api: '/api/v1/db/user-entities',
      label: 'tabUserEntities',
      editable: true,
      related: '',
      columns: [
        { key: 'id', label: 'colId', sort: 'id', w: 84, render: idCell },
        { key: 'user_id', label: 'colUserId', sort: 'user_id', w: 116, render: monoCellOf('user_id') },
        { key: 'name', label: 'colName', sort: 'name', render: textCellOf('name') },
        { key: 'media_count', label: 'colMediaCount', sort: 'media_count', w: 96, num: true, render: numCellOf('media_count') },
        { key: 'latest_release_time', label: 'colLatestRelease', sort: 'latest_release_time', w: 140, render: function (row) { return timeCell(row.latest_release_time); } }
      ],
      filters: [
        { key: 'q', type: 'search' },
        { key: 'userId', type: 'number', label: 'filterUser' }
      ],
      fields: [
        { key: 'name', kind: 'text', label: 'colName', required: true, entityName: true, hint: 'renameHint' },
        { key: 'media_count', kind: 'number', label: 'colMediaCount', min: 0 },
        { key: 'latest_release_time', kind: 'datetime', label: 'colLatestRelease' }
      ]
    },
    listEntities: {
      api: '/api/v1/db/list-entities',
      label: 'tabListEntities',
      editable: true,
      related: '',
      columns: [
        { key: 'id', label: 'colId', sort: 'id', w: 84, render: idCell },
        { key: 'lst_id', label: 'colListId', sort: 'lst_id', w: 108, render: monoCellOf('lst_id') },
        { key: 'name', label: 'colName', sort: 'name', render: textCellOf('name') },
        { key: 'list_name', label: 'colListName', render: textCellOf('list_name') }
      ],
      filters: [
        { key: 'q', type: 'search' },
        { key: 'listId', type: 'number', label: 'filterList' }
      ],
      fields: [
        { key: 'name', kind: 'text', label: 'colName', required: true, entityName: true, hint: 'renameHint' }
      ]
    },
    userLinks: {
      api: '/api/v1/db/user-links',
      label: 'tabUserLinks',
      editable: true,
      related: '',
      columns: [
        { key: 'id', label: 'colId', sort: 'id', w: 84, render: idCell },
        { key: 'user_id', label: 'colUserId', sort: 'user_id', w: 116, render: monoCellOf('user_id') },
        { key: 'name', label: 'colName', sort: 'name', render: textCellOf('name') },
        { key: 'parent_lst_entity_id', label: 'colParentEntity', sort: 'parent_lst_entity_id', w: 140, render: monoCellOf('parent_lst_entity_id') },
        { key: 'parent_lst_entity_name', label: 'colParentEntityName', render: textCellOf('parent_lst_entity_name') }
      ],
      filters: [
        { key: 'q', type: 'search' },
        { key: 'userId', type: 'number', label: 'filterUser' },
        { key: 'listEntityId', type: 'number', label: 'filterListEntity' }
      ],
      fields: [
        { key: 'name', kind: 'text', label: 'colName', required: true, max: 250 }
      ]
    },
    previousNames: {
      api: '/api/v1/db/user-previous-names',
      label: 'tabPreviousNames',
      editable: false,
      related: '',
      columns: [
        { key: 'id', label: 'colId', sort: 'id', w: 84, render: idCell },
        { key: 'user_id', label: 'colUserId', sort: 'user_id', w: 108, render: monoCellOf('user_id') },
        { key: 'screen_name', label: 'colScreenName', sort: 'screen_name', w: 170, render: textCellOf('screen_name') },
        { key: 'name', label: 'colName', sort: 'name', render: textCellOf('name') },
        { key: 'record_date', label: 'colRecordDate', sort: 'record_date', w: 124, render: function (row) { return dateCell(row.record_date); } },
        { key: 'current_screen_name', label: 'colCurrentScreenName', sort: 'current_screen_name', render: textCellOf('current_screen_name') },
        { key: 'current_name', label: 'colCurrentName', render: textCellOf('current_name') }
      ],
      filters: [
        { key: 'q', type: 'search' },
        { key: 'userId', type: 'number', label: 'filterUser' }
      ],
      fields: []
    }
  };

  var TAB_ORDER = ['users', 'lists', 'userEntities', 'listEntities', 'userLinks', 'previousNames'];

  var STATS = [
    { tab: 'users', key: 'users' },
    { tab: 'lists', key: 'lsts' },
    { tab: 'userEntities', key: 'user_entities' },
    { tab: 'listEntities', key: 'lst_entities' },
    { tab: 'userLinks', key: 'user_links' },
    { tab: 'previousNames', key: 'user_previous_names' }
  ];

  var PAGE_SIZES = [20, 50, 100, 200];

  /* ---------------- 工具 ---------------- */

  function t(key, vars) { return T.t('data.' + key, vars); }
  function labelOf(key) {
    if (!key) return '';
    return key.indexOf('common.') === 0 ? T.t(key) : t(key);
  }
  var esc = T.esc;
  var fmtNum = T.fmtNum;

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function toLocalInput(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      'T' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  function fmtDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat(T.state.lang, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    } catch (e) {
      return String(value).slice(0, 10);
    }
  }

  function sameDateTime(a, b) {
    var ea = !a, eb = !b;
    if (ea && eb) return true;
    if (ea !== eb) return false;
    var ta = Date.parse(a), tb = Date.parse(b);
    if (isNaN(ta) || isNaN(tb)) return String(a) === String(b);
    // datetime-local 只到分钟精度：按分钟比较，避免未改动的秒被误判为变更
    return Math.floor(ta / 60000) === Math.floor(tb / 60000);
  }

  function sameValue(kind, oldValue, next) {
    if (kind === 'checkbox') return !!oldValue === !!next;
    if (kind === 'number') return Number(oldValue || 0) === Number(next || 0);
    if (kind === 'datetime') return sameDateTime(oldValue, next);
    return String(oldValue === undefined || oldValue === null ? '' : oldValue) ===
      String(next === undefined || next === null ? '' : next);
  }

  function numText(value) {
    var n = Number(value);
    return isNaN(n) ? '0' : String(n);
  }

  function copyIcon() { return ICONS.copy; }

  function copyButton(value, label) {
    var text = value === undefined || value === null ? '' : String(value);
    var name = label || t('copy');
    return '<button type="button" class="data-copy" data-act="copy" data-copy="' + esc(text) +
      '" title="' + esc(name) + '" aria-label="' + esc(name) + '">' + copyIcon() + '</button>';
  }

  function textCell(value) {
    if (value === undefined || value === null || String(value) === '') return '<span class="muted">—</span>';
    var text = String(value);
    return '<span class="data-ell" title="' + esc(text) + '">' + esc(text) + '</span>';
  }

  function textCellOf(key) {
    return function (row) { return textCell(row[key]); };
  }

  function monoCell(value) {
    if (value === undefined || value === null || String(value) === '') return '<span class="muted">—</span>';
    var text = String(value);
    return '<span class="data-ell mono" title="' + esc(text) + '">' + esc(text) + '</span>';
  }

  function monoCellOf(key) {
    return function (row) { return monoCell(row[key]); };
  }

  function numCell(value) {
    return '<span class="mono">' + esc(numText(value)) + '</span>';
  }

  function numCellOf(key) {
    return function (row) { return numCell(row[key]); };
  }

  function timeCell(value) {
    if (!value) return '<span class="muted">—</span>';
    return '<span class="data-ell" title="' + esc(value) + '">' + esc(T.fmtTime(value)) + '</span>';
  }

  function dateCell(value) {
    if (!value) return '<span class="muted">—</span>';
    return '<span class="data-ell" title="' + esc(value) + '">' + esc(fmtDate(value)) + '</span>';
  }

  function badgeCell(value, trueKind, falseKind, trueLabel, falseLabel) {
    return '<span class="badge badge--' + (value ? trueKind : falseKind) + '">' +
      esc(value ? trueLabel : falseLabel) + '</span>';
  }

  function idCell(row) {
    var id = row.id === undefined || row.id === null ? '' : String(row.id);
    var label = t('copyId') + ' ' + id;
    return '<button type="button" class="data-id" data-act="copy" data-copy="' + esc(id) +
      '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + esc(id) + copyIcon() + '</button>';
  }

  function rowLabel(row) {
    if (!row) return '';
    return row.name || row.screen_name || row.current_screen_name || ('#' + String(row.id));
  }

  function rowTitle(row) {
    var label = rowLabel(row);
    var id = row && row.id !== undefined ? String(row.id) : '';
    return id && label !== ('#' + id) ? label + ' (#' + id + ')' : label;
  }

  /* ---------------- 视图状态 ---------------- */

  var host = null;
  var detailSeq = 0;
  var st = {
    tab: 'users',
    stats: null,
    statsError: '',
    tabs: {},
    detail: null,
    editing: null,
    deleting: null
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
        seq: 0
      };
    }
    return st.tabs[id];
  }

  function findRow(tab, id) {
    var rows = tabState(tab).rows;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === String(id)) return rows[i];
    }
    return null;
  }

  function visibleColumns(tab) {
    var def = TABS[tab];
    var cols = def.columns.slice();
    cols.push({ key: '__actions', label: 'common.actions', actions: true, w: 132 });
    return cols;
  }

  /* ---------------- 骨架 ---------------- */

  function statButton(item) {
    var active = st.tab === item.tab;
    return '<button type="button" class="data-stat" data-stat-tab="' + item.tab + '"' +
      ' aria-pressed="' + (active ? 'true' : 'false') + '"' +
      ' title="' + esc(t('switchTo', { name: t(TABS[item.tab].label) })) + '">' +
      '<span class="data-stat__label">' + esc(t(TABS[item.tab].label)) + '</span>' +
      '<span class="data-stat__value" data-stat="' + item.tab + '">—</span>' +
      '</button>';
  }

  function markup() {
    return '' +
      '<div class="view-head">' +
        '<div class="view-head__text">' +
          '<h1 class="view-title">' + esc(t('title')) + '</h1>' +
          '<p class="view-sub">' + esc(t('sub')) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="data-stats" data-role="stats" role="group" aria-label="' + esc(t('statsLabel')) + '">' +
        STATS.map(statButton).join('') +
      '</div>' +
      '<p class="notice notice--danger data-stats-error" data-role="stats-error" hidden></p>' +
      '<section class="card mt-16 data-card">' +
        '<div class="data-tabs" data-role="tabs" role="group" aria-label="' + esc(t('tabsLabel')) + '"></div>' +
        '<div class="data-toolbar" data-role="toolbar"></div>' +
        '<div class="data-result" data-role="table"></div>' +
        '<div class="pager" data-role="pager"></div>' +
      '</section>' +
      detailModal() +
      editModal() +
      deleteModal();
  }

  function detailModal() {
    return '<dialog class="modal modal--wide" data-role="detail-modal" tabindex="-1" aria-labelledby="data-detail-title">' +
      '<div class="modal__form">' +
        '<div class="modal__head">' +
          '<div>' +
            '<h3 class="modal__title" id="data-detail-title" data-role="detail-title"></h3>' +
            '<p class="modal__desc" data-role="detail-desc"></p>' +
          '</div>' +
          '<button type="button" class="modal__close" data-act="detail-close" aria-label="' + esc(T.t('common.close')) + '">×</button>' +
        '</div>' +
        '<div data-role="detail-fields" class="data-kv"></div>' +
        '<div class="data-group" data-role="detail-related" hidden>' +
          '<p class="data-group__title">' + esc(t('relatedTitle')) + '</p>' +
          '<div data-role="detail-related-body"></div>' +
        '</div>' +
        '<div class="modal__actions data-actions-sticky">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-act="detail-close">' + esc(T.t('common.close')) + '</button>' +
          '<button type="button" class="btn btn--ghost btn--sm btn--danger" data-act="detail-delete">' + esc(T.t('common.delete')) + '</button>' +
          '<button type="button" class="btn btn--primary btn--sm" data-act="detail-edit">' + esc(T.t('common.edit')) + '</button>' +
        '</div>' +
      '</div>' +
    '</dialog>';
  }

  function editModal() {
    return '<dialog class="modal modal--wide" data-role="edit-modal" aria-labelledby="data-edit-title">' +
      '<form class="modal__form" data-role="edit-form" novalidate>' +
        '<div class="modal__head">' +
          '<div>' +
            '<h3 class="modal__title" id="data-edit-title" data-role="modal-title"></h3>' +
            '<p class="modal__desc" data-role="modal-desc"></p>' +
          '</div>' +
          '<button type="button" class="modal__close" data-act="edit-close" aria-label="' + esc(T.t('common.close')) + '">×</button>' +
        '</div>' +
        '<p class="notice notice--danger" data-role="modal-error" hidden></p>' +
        '<div class="form-grid" data-role="modal-fields"></div>' +
        '<div class="modal__actions">' +
          '<button type="button" class="btn btn--ghost" data-act="edit-close">' + esc(T.t('common.cancel')) + '</button>' +
          '<button type="submit" class="btn btn--primary">' + esc(T.t('common.save')) + '</button>' +
        '</div>' +
      '</form>' +
    '</dialog>';
  }

  function deleteModal() {
    return '<dialog class="modal" data-role="delete-modal" tabindex="-1" aria-labelledby="data-delete-title">' +
      '<div class="modal__form">' +
        '<div class="modal__head">' +
          '<div>' +
            '<h3 class="modal__title" id="data-delete-title" data-role="delete-title"></h3>' +
            '<p class="modal__desc" data-role="delete-desc"></p>' +
          '</div>' +
          '<button type="button" class="modal__close" data-act="delete-close" aria-label="' + esc(T.t('common.close')) + '">×</button>' +
        '</div>' +
        '<p class="notice notice--danger" data-role="delete-warn"></p>' +
        '<p class="small muted mt-8" data-role="delete-hint"></p>' +
        '<p class="notice notice--danger mt-12" data-role="delete-error" hidden></p>' +
        '<div class="modal__actions">' +
          '<button type="button" class="btn btn--ghost" data-act="delete-close">' + esc(T.t('common.cancel')) + '</button>' +
          '<button type="button" class="btn btn--danger" data-act="delete-confirm">' + esc(T.t('common.delete')) + '</button>' +
        '</div>' +
      '</div>' +
    '</dialog>';
  }

  /* ---------------- 统计条 ---------------- */

  function renderStats() {
    if (!host) return;
    var stats = st.stats;
    STATS.forEach(function (item) {
      var valueEl = host.querySelector('[data-stat="' + item.tab + '"]');
      if (valueEl) valueEl.textContent = stats ? fmtNum(stats[item.key]) : '—';
      var countEl = host.querySelector('[data-tab-count="' + item.tab + '"]');
      if (countEl) countEl.textContent = stats ? fmtNum(stats[item.key]) : '—';
    });
    var statBtns = host.querySelectorAll('[data-stat-tab]');
    for (var i = 0; i < statBtns.length; i++) {
      statBtns[i].setAttribute('aria-pressed', statBtns[i].getAttribute('data-stat-tab') === st.tab ? 'true' : 'false');
    }
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

  /* ---------------- 子标签 ---------------- */

  function renderTabs() {
    if (!host) return;
    var box = host.querySelector('[data-role="tabs"]');
    if (!box) return;
    box.innerHTML = TAB_ORDER.map(function (id) {
      var active = st.tab === id;
      return '<button type="button" class="chip data-tab" aria-pressed="' + (active ? 'true' : 'false') +
        '" data-tab="' + id + '">' +
        '<span>' + esc(t(TABS[id].label)) + '</span>' +
        '<span class="count" data-tab-count="' + id + '">' + (st.stats ? esc(fmtNum(st.stats[statKeyOf(id)])) : '—') + '</span>' +
        '</button>';
    }).join('');
    renderStats();
  }

  function statKeyOf(tab) {
    for (var i = 0; i < STATS.length; i++) {
      if (STATS[i].tab === tab) return STATS[i].key;
    }
    return tab;
  }

  /* ---------------- 工具栏 ---------------- */

  function pageSizeOptions(current) {
    var sizes = PAGE_SIZES.slice();
    var n = Number(current);
    if (n > 0 && sizes.indexOf(n) < 0) sizes.push(n);
    return sizes.map(function (size) {
      return '<option value="' + size + '"' + (n === size ? ' selected' : '') + '>' + size + '</option>';
    }).join('');
  }

  function optionHtml(options, value) {
    return options.map(function (option) {
      return '<option value="' + esc(option.value) + '"' +
        (String(value === undefined || value === null ? '' : value) === option.value ? ' selected' : '') + '>' +
        esc(labelOf(option.label)) + '</option>';
    }).join('');
  }

  function renderToolbar() {
    if (!host) return;
    var box = host.querySelector('[data-role="toolbar"]');
    if (!box) return;
    var def = TABS[st.tab];
    var s = tabState(st.tab);
    var html = '';
    def.filters.forEach(function (field) {
      var value = s.filters[field.key] === undefined ? '' : s.filters[field.key];
      if (field.type === 'search') {
        html += '<div class="data-search">' + ICONS.search +
          '<label class="visually-hidden" for="data-search-input">' + esc(t('searchLabel')) + '</label>' +
          '<input class="input" id="data-search-input" type="search" data-filter="' + esc(field.key) + '"' +
            ' placeholder="' + esc(t('searchPlaceholder')) + '" value="' + esc(value) + '"' +
            ' autocomplete="off" spellcheck="false">' +
          '</div>';
        return;
      }
      if (field.type === 'select') {
        html += '<label class="data-filter">' +
          '<span class="data-filter__label">' + esc(labelOf(field.label)) + '</span>' +
          '<select class="select" data-filter="' + esc(field.key) + '" aria-label="' + esc(labelOf(field.label)) + '">' +
            optionHtml(field.options, value) +
          '</select></label>';
        return;
      }
      html += '<label class="data-filter">' +
        '<span class="data-filter__label">' + esc(labelOf(field.label)) + '</span>' +
        '<input class="input data-num" type="number" min="1" inputmode="numeric" step="1" data-filter="' + esc(field.key) + '"' +
          ' aria-label="' + esc(labelOf(field.label)) + '" value="' + esc(value) + '" autocomplete="off">' +
        '</label>';
    });
    html += '<button type="button" class="btn btn--ghost btn--sm data-reset" data-act="reset-filters" title="' +
      esc(T.t('common.reset')) + '">' + esc(T.t('common.reset')) + '</button>';
    html += '<label class="data-filter">' +
      '<span class="data-filter__label">' + esc(T.t('common.pageSize')) + '</span>' +
      '<select class="select" data-role="pagesize" aria-label="' + esc(T.t('common.pageSize')) + '">' +
        pageSizeOptions(s.pageSize) + '</select></label>';
    html += '<button type="button" class="btn btn--ghost btn--sm data-refresh" data-act="refresh">' +
      esc(T.t('common.refresh')) + '</button>';
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
    if (col.actions) return '<th scope="col" class="data-th-actions">' + label + '</th>';
    if (!col.sort) return '<th scope="col">' + label + '</th>';
    var aria = s.sortBy === col.sort
      ? ' aria-sort="' + (s.sortOrder === 'asc' ? 'ascending' : 'descending') + '"'
      : '';
    return '<th scope="col" data-sortable="true" data-sort="' + esc(col.sort) + '" tabindex="0"' + aria + '>' + label + '</th>';
  }

  function iconAction(act, id, label, icon, danger) {
    return '<button type="button" class="data-iconbtn' + (danger ? ' data-iconbtn--danger' : '') + '"' +
      ' data-act="' + act + '" data-id="' + esc(id) + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
      icon + '<span class="data-iconbtn__label">' + esc(label) + '</span></button>';
  }

  function actionsHtml(def, row) {
    var id = String(row.id);
    var parts = [iconAction('detail', id, t('detailAction'), ICONS.eye, false)];
    if (def.editable) {
      parts.push(iconAction('edit', id, T.t('common.edit'), ICONS.pencil, false));
      parts.push(iconAction('del', id, T.t('common.delete'), ICONS.trash, true));
    }
    return '<div class="data-actions">' + parts.join('') + '</div>';
  }

  function dataRow(def, row, cols) {
    var cells = cols.map(function (col) {
      if (col.actions) {
        return '<td class="table__actions data-cell--actions" data-label="">' + actionsHtml(def, row) + '</td>';
      }
      return '<td' + tdClass(col) + ' data-label="' + esc(labelOf(col.label)) + '">' + cellHtml(col, row) + '</td>';
    }).join('');
    return '<tr data-id="' + esc(row.id) + '">' + cells + '</tr>';
  }

  function colgroupHtml(cols) {
    return '<colgroup>' + cols.map(function (col) {
      return col.w ? '<col style="width:' + Number(col.w) + 'px">' : '<col>';
    }).join('') + '</colgroup>';
  }

  function tableHtml(def, s, cols) {
    var head = '<thead><tr>' + cols.map(function (col) { return thHtml(col, s); }).join('') + '</tr></thead>';
    var body = '<tbody>' + s.rows.map(function (row) { return dataRow(def, row, cols); }).join('') + '</tbody>';
    return '<div class="data-tablewrap tablewrap' + (s.loading ? ' is-busy' : '') + '">' +
      '<table class="table data-table">' + colgroupHtml(cols) + head + body + '</table></div>';
  }

  function skeletonTable(s, cols) {
    var rows = '';
    for (var i = 0; i < 6; i++) {
      rows += '<tr class="data-skel"><td colspan="' + cols.length + '">' +
        '<span class="skeleton" style="display:block;height:12px;width:' + (48 + i * 7) + '%"></span></td></tr>';
    }
    var head = '<thead><tr>' + cols.map(function (col) { return thHtml(col, s); }).join('') + '</tr></thead>';
    return '<div class="data-tablewrap tablewrap is-busy" aria-busy="true">' +
      '<table class="table data-table">' + colgroupHtml(cols) + head + '<tbody>' + rows + '</tbody></table></div>';
  }

  function hasFilters(tab) {
    var s = tabState(tab);
    var keys = Object.keys(s.filters);
    for (var i = 0; i < keys.length; i++) {
      if (String(s.filters[keys[i]] === undefined || s.filters[keys[i]] === null ? '' : s.filters[keys[i]]) !== '') return true;
    }
    return false;
  }

  function errorBlock(message) {
    return '<div class="notice notice--danger data-error">' +
      '<p class="data-error__text">' + esc(message) + '</p>' +
      '<div class="data-error__actions">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-act="retry-tab">' + esc(T.t('common.retry')) + '</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-act="copy-error" data-copy="' + esc(message) + '">' +
          esc(t('copyError')) + '</button>' +
      '</div>' +
    '</div>';
  }

  function emptyBlock() {
    var filtered = hasFilters(st.tab);
    var title = filtered ? t('emptyFilteredTitle') : t('emptyTitle');
    var desc = filtered ? t('emptyFilteredDesc') : t('emptyDesc');
    var actions = '';
    if (filtered) {
      actions += '<button type="button" class="btn btn--ghost btn--sm" data-act="reset-filters">' + esc(t('clearFilters')) + '</button>';
    }
    actions += '<button type="button" class="btn btn--primary btn--sm" data-act="go-tasks">' + esc(t('goDownload')) + '</button>';
    return '<div class="empty data-empty">' +
      '<p class="data-empty__title">' + esc(title) + '</p>' +
      '<p class="data-empty__desc">' + esc(desc) + '</p>' +
      '<div class="data-empty__actions">' + actions + '</div>' +
    '</div>';
  }

  function renderTable() {
    if (!host) return;
    var box = host.querySelector('[data-role="table"]');
    if (!box) return;
    var def = TABS[st.tab];
    var s = tabState(st.tab);
    var cols = visibleColumns(st.tab);
    var html;
    if (s.error) {
      html = errorBlock(s.error);
    } else if (s.loading && !s.rows.length) {
      html = skeletonTable(s, cols);
    } else if (!s.rows.length) {
      html = emptyBlock();
    } else {
      html = tableHtml(def, s, cols);
    }
    box.innerHTML = html;
  }

  /* ---------------- 分页 ---------------- */

  function renderPager() {
    if (!host) return;
    var box = host.querySelector('[data-role="pager"]');
    if (!box) return;
    var s = tabState(st.tab);
    box.style.display = (s.loading || s.error) ? 'none' : '';
    var info = T.t('common.total', { n: fmtNum(s.total) }) + ' · ' +
      T.t('common.page', { page: s.page, pages: s.totalPages });
    box.innerHTML =
      '<button type="button" class="btn btn--ghost btn--sm" data-act="prev"' + (s.page <= 1 ? ' disabled' : '') + '>' +
        esc(T.t('common.previous')) + '</button>' +
      '<span class="pager__grow">' + esc(info) + '</span>' +
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

  function switchTab(id, filters) {
    if (!TABS[id]) return;
    st.tab = id;
    if (filters) {
      tabState(id).filters = filters;
      tabState(id).page = 1;
    }
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

  /* ---------------- 复制 ---------------- */

  // 复制走外壳的共享实现（剪贴板 API → execCommand），两路都失败再提示手动复制。
  function copyText(text) {
    var value = text === undefined || text === null ? '' : String(text);
    var hint = value.length > 40 ? value.slice(0, 40) + '…' : value;
    T.copyText(value).then(function () {
      T.toast('success', t('copied') + ' · ' + hint);
    }, function () {
      T.toast('error', t('copyFailed'));
    });
  }

  /* ---------------- 详情弹窗 ---------------- */

  function detailGroups(tab, row) {
    var groups = [];
    function group(title, items) { groups.push({ title: title, items: items }); }
    function kv(label, value, extra) {
      var item = { label: label, value: value };
      if (extra) Object.keys(extra).forEach(function (k) { item[k] = extra[k]; });
      return item;
    }
    function badge(label, value, kind, text) {
      return { label: label, badge: '<span class="badge badge--' + kind + '">' + esc(text) + '</span>' };
    }

    if (tab === 'users') {
      group(t('groupIdentity'), [
        kv('ID', row.id, { mono: true, copy: true }),
        kv(t('colScreenName'), row.screen_name, { mono: true, copy: true }),
        kv(t('colName'), row.name)
      ]);
      group(t('groupState'), [
        badge(t('colProtected'), row.protected, row.protected ? 'warn' : 'ok', row.protected ? t('stateProtected') : t('statePublic')),
        badge(t('colAccessible'), row.is_accessible, row.is_accessible ? 'ok' : 'danger', row.is_accessible ? t('stateAccessible') : t('stateInaccessible'))
      ]);
      group(t('groupData'), [
        kv(t('colFriends'), numText(row.friends_count))
      ]);
    } else if (tab === 'lists') {
      group(t('groupIdentity'), [
        kv('ID', row.id, { mono: true, copy: true }),
        kv(t('colName'), row.name, { copy: true })
      ]);
      group(t('groupRelation'), [
        kv(t('colOwner'), row.owner_user_id, { mono: true, copy: true })
      ]);
    } else if (tab === 'userEntities') {
      group(t('groupIdentity'), [
        kv('ID', row.id, { mono: true, copy: true }),
        kv(t('colUserId'), row.user_id, { mono: true, copy: true }),
        kv(t('colName'), row.name, { copy: true })
      ]);
      group(t('groupData'), [
        kv(t('colMediaCount'), numText(row.media_count)),
        kv(t('colLatestRelease'), row.latest_release_time ? T.fmtTime(row.latest_release_time) : '')
      ]);
      group(t('groupPath'), [
        kv(t('colParentDir'), row.parent_dir, { mono: true, copy: true, wrap: true })
      ]);
    } else if (tab === 'listEntities') {
      group(t('groupIdentity'), [
        kv('ID', row.id, { mono: true, copy: true }),
        kv(t('colListId'), row.lst_id, { mono: true, copy: true }),
        kv(t('colName'), row.name, { copy: true })
      ]);
      group(t('groupRelation'), [
        kv(t('colListName'), row.list_name)
      ]);
      group(t('groupPath'), [
        kv(t('colParentDir'), row.parent_dir, { mono: true, copy: true, wrap: true })
      ]);
    } else if (tab === 'userLinks') {
      group(t('groupIdentity'), [
        kv('ID', row.id, { mono: true, copy: true }),
        kv(t('colUserId'), row.user_id, { mono: true, copy: true }),
        kv(t('colName'), row.name, { copy: true })
      ]);
      group(t('groupRelation'), [
        kv(t('colParentEntity'), row.parent_lst_entity_id, { mono: true, copy: true }),
        kv(t('colParentEntityName'), row.parent_lst_entity_name)
      ]);
    } else if (tab === 'previousNames') {
      group(t('groupIdentity'), [
        kv('ID', row.id, { mono: true, copy: true }),
        kv(t('colUserId'), row.user_id, { mono: true, copy: true })
      ]);
      group(t('colScreenName'), [
        kv(t('colScreenName'), row.screen_name, { mono: true, copy: true }),
        kv(t('colName'), row.name),
        kv(t('colRecordDate'), row.record_date ? fmtDate(row.record_date) : '')
      ]);
      group(t('colCurrentScreenName'), [
        kv(t('colCurrentScreenName'), row.current_screen_name, { mono: true, copy: true }),
        kv(t('colCurrentName'), row.current_name)
      ]);
    }
    return groups;
  }

  function kvRow(item) {
    var value;
    if (item.badge) {
      value = item.badge;
    } else if (item.value === undefined || item.value === null || String(item.value) === '') {
      value = '<span class="muted">—</span>';
    } else {
      value = '<span class="' + (item.mono ? 'mono ' : '') + (item.wrap ? 'data-brk' : '') + '">' +
        esc(item.value) + '</span>';
    }
    if (item.copy && !(item.value === undefined || item.value === null || String(item.value) === '')) {
      value += copyButton(item.value, t('copy') + ' ' + item.label);
    }
    return '<div class="kv__row">' +
      '<span class="kv__key">' + esc(item.label) + '</span>' +
      '<span class="kv__val' + (item.wrap ? ' data-kv-wrap' : '') + '">' + value + '</span>' +
    '</div>';
  }

  function renderDetail() {
    if (!host || !st.detail) return;
    var d = st.detail;
    var def = TABS[d.tab];
    var dialog = host.querySelector('[data-role="detail-modal"]');
    if (!dialog) return;
    var titleEl = dialog.querySelector('[data-role="detail-title"]');
    var descEl = dialog.querySelector('[data-role="detail-desc"]');
    if (titleEl) titleEl.textContent = rowLabel(d.row);
    if (descEl) descEl.textContent = t('detailDesc', { type: t(def.label), id: d.id });

    var fields = dialog.querySelector('[data-role="detail-fields"]');
    if (fields) {
      fields.innerHTML = detailGroups(d.tab, d.row).map(function (group) {
        return '<div class="data-group">' +
          '<p class="data-group__title">' + esc(group.title) + '</p>' +
          '<div class="kv">' + group.items.map(kvRow).join('') + '</div>' +
        '</div>';
      }).join('');
    }

    var editBtn = dialog.querySelector('[data-act="detail-edit"]');
    var delBtn = dialog.querySelector('[data-act="detail-delete"]');
    if (editBtn) editBtn.hidden = !def.editable;
    if (delBtn) delBtn.hidden = !def.editable;

    var related = dialog.querySelector('[data-role="detail-related"]');
    var relatedBody = dialog.querySelector('[data-role="detail-related-body"]');
    if (related && relatedBody) {
      if (!def.related) {
        related.hidden = true;
        relatedBody.innerHTML = '';
      } else {
        related.hidden = false;
        relatedBody.innerHTML = '<p class="skeleton" style="height:52px"></p>'; 
        loadRelated(d);
      }
    }
  }

  function relatedRow(title, meta) {
    return '<li class="data-rel">' +
      '<span class="data-rel__name" title="' + esc(title) + '">' + esc(title) + '</span>' +
      '<span class="data-rel__meta">' + esc(meta || '') + '</span>' +
    '</li>';
  }

  function relatedSection(title, rows, total, renderRow, moreTab, moreKey) {
    var head = '<div class="data-subhead">' +
      '<span class="data-subhead__title">' + esc(title) + '</span>' +
      '<span class="count">' + esc(fmtNum(total)) + '</span>';
    if (total > rows.length && moreTab) {
      head += '<button type="button" class="btn btn--ghost btn--sm data-more" data-act="related-more"' +
        ' data-tab="' + moreTab + '" data-filter-key="' + moreKey + '" data-filter-value="' + esc(st.detail ? st.detail.id : '') + '">' +
        esc(t('viewAll', { n: fmtNum(total) })) + '</button>';
    }
    head += '</div>';
    if (!rows.length) return head + '<p class="small muted">' + esc(t('relatedEmpty')) + '</p>';
    return head + '<ul class="data-rel-list">' + rows.map(renderRow).join('') + '</ul>';
  }

  function loadRelated(d) {
    if (!host) return;
    var dialog = host.querySelector('[data-role="detail-modal"]');
    if (!dialog) return;
    var body = dialog.querySelector('[data-role="detail-related-body"]');
    if (!body) return;
    detailSeq += 1;
    var seq = detailSeq;
    var id = d.id;

    function paint(html) {
      if (seq !== detailSeq) return;
      if (!host || !st.detail || st.detail.id !== id) return;
      if (!dialog.open) return;
      body.innerHTML = html;
    }
    function fail(err) {
      paint('<p class="notice notice--danger">' + esc(t('relatedError')) + ' · ' +
        esc((err && err.message) || T.t('common.fetchFailed')) + '</p>');
    }

    if (d.tab === 'users') {
      Promise.all([
        T.api.get('/api/v1/db/users/' + encodeURIComponent(id) + '/entities', { page: 1, pageSize: 5 }),
        T.api.get('/api/v1/db/users/' + encodeURIComponent(id) + '/links', { page: 1, pageSize: 5 }),
        T.api.get('/api/v1/db/users/' + encodeURIComponent(id) + '/previous-names', { page: 1, pageSize: 5 })
      ]).then(function (res) {
        var entities = unwrap(res[0]), links = unwrap(res[1]), names = unwrap(res[2]);
        var html = relatedSection(t('relatedEntities'), entities, totalOf(res[0]), function (row) {
          var meta = t('metaMedia', { n: numText(row.media_count) });
          if (row.latest_release_time) meta += ' · ' + T.fmtTime(row.latest_release_time);
          return relatedRow(row.name || row.screen_name || ('#' + row.id), meta);
        }, 'userEntities', 'userId');
        html += relatedSection(t('relatedLinks'), links, totalOf(res[1]), function (row) {
          return relatedRow(row.name || ('#' + row.id), row.parent_lst_entity_name || '');
        }, 'userLinks', 'userId');
        html += relatedSection(t('relatedNames'), names, totalOf(res[2]), function (row) {
          var meta = row.name ? row.name + ' · ' : '';
          return relatedRow(row.screen_name || ('#' + row.id), meta + fmtDate(row.record_date));
        }, 'previousNames', 'userId');
        paint(html);
      }).catch(fail);
      return;
    }

    if (d.tab === 'lists') {
      var listId = d.row.lst_id;
      T.api.get('/api/v1/db/lists/' + encodeURIComponent(id) + '/entities', { page: 1, pageSize: 5 }).then(function (res) {
        var rows = unwrap(res);
        paint(relatedSection(t('relatedListEntities'), rows, totalOf(res), function (row) {
          return relatedRow(row.name || ('#' + row.id), row.list_name || '');
        }, 'listEntities', 'listId'));
      }).catch(fail);
    }
  }

  function unwrap(res) {
    return (res && Array.isArray(res.data)) ? res.data : [];
  }

  function totalOf(res) {
    if (!res) return 0;
    if (res.total !== undefined && res.total !== null) return Number(res.total) || 0;
    return unwrap(res).length;
  }

  function openDetail(tab, id) {
    if (!host) return;
    var row = findRow(tab, String(id));
    if (!row) return;
    st.detail = { tab: tab, id: String(id), row: row };
    detailSeq += 1;
    renderDetail();
    var dialog = host.querySelector('[data-role="detail-modal"]');
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.focus();
    }
  }

  function closeDetail() {
    st.detail = null;
    detailSeq += 1;
    if (!host) return;
    var dialog = host.querySelector('[data-role="detail-modal"]');
    if (dialog && dialog.open) {
      try { dialog.close(); } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- 编辑弹窗 ---------------- */

  function fieldHtml(field, row) {
    var label = labelOf(field.label);
    var raw = row[field.key];
    var id = 'data-field-' + field.key;
    if (field.kind === 'checkbox') {
      return '<div class="field-box">' +
        '<span class="field-box__label">' + esc(label) + '</span>' +
        '<label class="check"><input type="checkbox" data-field="' + esc(field.key) + '" aria-label="' + esc(label) + '"' +
        (raw ? ' checked' : '') + '></label>' +
      '</div>';
    }
    var type = field.kind === 'number' ? 'number' : (field.kind === 'datetime' ? 'datetime-local' : 'text');
    var value = field.kind === 'datetime' ? toLocalInput(raw) : (raw === undefined || raw === null ? '' : String(raw));
    return '<div class="field-box">' +
      '<label class="field-box__label" for="' + id + '">' + esc(label) +
        (field.required ? ' <span class="data-required">*</span>' : '') + '</label>' +
      '<input class="input" id="' + id + '" type="' + type + '" data-field="' + esc(field.key) + '"' +
        ' value="' + esc(value) + '" autocomplete="off" spellcheck="false"' +
        (type === 'number' ? ' step="1" min="0"' : '') + '>' +
      (field.hint ? '<p class="data-rename-hint">' + esc(t(field.hint)) + '</p>' : '') +
    '</div>';
  }

  function showEditError(message) {
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

  function validateInput(field, raw) {
    var value = raw === undefined || raw === null ? '' : String(raw);
    if (field.kind === 'checkbox') return '';
    if (field.kind === 'number') {
      if (value === '' || !/^-?\d+$/.test(value)) return t('invalidNumber');
      if (field.min !== undefined && Number(value) < field.min) return t('invalidNumber');
      return '';
    }
    if (field.kind === 'datetime') {
      if (value && isNaN(new Date(value).getTime())) return t('invalidTime');
      return '';
    }
    if (field.required && value.trim() === '') return t('invalidEmpty');
    if (field.pattern === 'screen' && value && !/^[A-Za-z0-9_]{1,15}$/.test(value)) return t('invalidScreenName');
    if (field.pattern === 'digits' && value && !/^\d+$/.test(value)) return t('invalidDigits');
    if (field.max && value.length > field.max) return t('invalidTooLong');
    if (field.entityName) {
      if (value !== value.trim()) return t('invalidNameDot');
      if (/[\/\\]/.test(value)) return t('invalidNameChars');
      if (/[:*?"<>|]/.test(value)) return t('invalidNameChars');
      if (/[ .]$/.test(value)) return t('invalidNameDot');
      if (/[\u0000-\u001f]/.test(value)) return t('invalidNameChars');
    }
    return '';
  }

  function openEdit(tab, id) {
    if (!host) return;
    var def = TABS[tab];
    if (!def || !def.editable) return;
    var row = findRow(tab, String(id));
    if (!row) return;

    st.editing = { tab: tab, id: String(id), row: row };

    var dialog = host.querySelector('[data-role="edit-modal"]');
    var form = host.querySelector('[data-role="edit-form"]');
    if (!dialog || !form) return;

    dialog.querySelector('[data-role="modal-title"]').textContent = t('editTitle');
    dialog.querySelector('[data-role="modal-desc"]').textContent = t('editDesc', {
      type: t(def.label),
      id: String(id)
    });
    form.querySelector('[data-role="modal-fields"]').innerHTML = def.fields.map(function (field) {
      return fieldHtml(field, row);
    }).join('');
    showEditError('');
    var save = form.querySelector('button[type="submit"]');
    if (save) save.disabled = false;
    if (!dialog.open) dialog.showModal();
    var first = form.querySelector('input');
    if (first) first.focus();
  }

  function closeEdit() {
    st.editing = null;
    if (!host) return;
    var dialog = host.querySelector('[data-role="edit-modal"]');
    if (dialog && dialog.open) {
      try { dialog.close(); } catch (e) { /* ignore */ }
    }
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
      if (field.kind === 'checkbox') {
        el.removeAttribute('aria-invalid');
        if (!sameValue('checkbox', editing.row[field.key], !!el.checked)) changes[field.key] = !!el.checked;
        return;
      }
      var raw = String(el.value);
      var error = validateInput(field, raw);
      if (error) {
        el.setAttribute('aria-invalid', 'true');
        problems.push(labelOf(field.label) + '：' + error);
        return;
      }
      el.removeAttribute('aria-invalid');
      var next;
      if (field.kind === 'number') {
        next = Math.trunc(Number(raw));
      } else if (field.kind === 'datetime') {
        next = raw.trim() === '' ? '' : new Date(raw).toISOString();
      } else {
        next = raw.trim();
      }
      if (!sameValue(field.kind, editing.row[field.key], next)) changes[field.key] = next;
    });

    if (problems.length) {
      showEditError(problems.join('；'));
      return;
    }
    if (!Object.keys(changes).length) {
      closeEdit();
      T.toast('info', t('noChanges'));
      return;
    }

    var saveBtn = form.querySelector('button[type="submit"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.classList.add('btn--busy'); }
    showEditError('');

    T.api.patch(def.api + '/' + encodeURIComponent(editing.id), changes).then(function () {
      T.toast('success', T.t('common.saved'));
      closeEdit();
      loadTab(editing.tab);
      loadStats();
    }).catch(function (err) {
      if (err && err.status === 401) return;
      showEditError((err && err.message) || T.t('common.failed'));
    }).then(function () {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.classList.remove('btn--busy'); }
    });
  }

  /* ---------------- 删除确认 ---------------- */

  function deleteWarn(tab) {
    if (tab === 'users') return { text: t('deleteUserWarn'), kind: 'danger' };
    if (tab === 'lists') return { text: t('deleteListWarn'), kind: 'danger' };
    if (tab === 'userEntities' || tab === 'listEntities') return { text: t('deleteEntityWarn'), kind: 'danger' };
    return { text: t('deleteLinkWarn'), kind: 'warn' };
  }

  function askDelete(tab, id) {
    if (!host) return;
    var row = findRow(tab, String(id));
    if (!row) return;
    st.deleting = { tab: tab, id: String(id), row: row };
    var dialog = host.querySelector('[data-role="delete-modal"]');
    if (!dialog) return;
    var warn = deleteWarn(tab);
    dialog.querySelector('[data-role="delete-title"]').textContent = t('deleteTitle');
    dialog.querySelector('[data-role="delete-desc"]').textContent = t('deleteDesc', {
      type: t(TABS[tab].label),
      name: rowLabel(row),
      id: String(id)
    });
    var warnEl = dialog.querySelector('[data-role="delete-warn"]');
    warnEl.className = 'notice notice--' + warn.kind;
    warnEl.textContent = warn.text;
    dialog.querySelector('[data-role="delete-hint"]').textContent = t('deleteHint');
    var errEl = dialog.querySelector('[data-role="delete-error"]');
    errEl.hidden = true;
    errEl.textContent = '';
    var btn = dialog.querySelector('[data-act="delete-confirm"]');
    if (btn) btn.disabled = false;
    if (!dialog.open) {
      dialog.showModal();
      dialog.focus();
    }
  }

  function closeDelete() {
    st.deleting = null;
    if (!host) return;
    var dialog = host.querySelector('[data-role="delete-modal"]');
    if (dialog && dialog.open) {
      try { dialog.close(); } catch (e) { /* ignore */ }
    }
  }

  function confirmDelete() {
    if (!host || !st.deleting) return;
    var deleting = st.deleting;
    var def = TABS[deleting.tab];
    var dialog = host.querySelector('[data-role="delete-modal"]');
    if (!dialog) return;
    var btn = dialog.querySelector('[data-act="delete-confirm"]');
    var errEl = dialog.querySelector('[data-role="delete-error"]');
    if (btn) { btn.disabled = true; btn.classList.add('btn--busy'); }
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    T.api.del(def.api + '/' + encodeURIComponent(deleting.id)).then(function () {
      T.toast('success', T.t('common.deleted'));
      closeDelete();
      loadTab(deleting.tab);
      loadStats();
    }).catch(function (err) {
      if (err && err.status === 401) return;
      if (errEl) {
        errEl.textContent = (err && err.message) || T.t('common.failed');
        errEl.hidden = false;
      }
    }).then(function () {
      if (btn) { btn.disabled = false; btn.classList.remove('btn--busy'); }
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

  function relatedMore(el) {
    var tab = el.getAttribute('data-tab');
    var key = el.getAttribute('data-filter-key');
    var value = el.getAttribute('data-filter-value');
    if (!tab || !key || !TABS[tab]) return;
    closeDetail();
    var filters = {};
    filters[key] = value;
    switchTab(tab, filters);
  }

  function onClick(event) {
    var tabBtn = event.target.closest('[data-tab]');
    if (tabBtn && tabBtn.getAttribute('data-tab')) { switchTab(tabBtn.getAttribute('data-tab')); return; }

    var statBtn = event.target.closest('[data-stat-tab]');
    if (statBtn) { switchTab(statBtn.getAttribute('data-stat-tab')); return; }

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
      case 'detail': openDetail(st.tab, id); break;
      case 'edit': openEdit(st.tab, id); break;
      case 'del': askDelete(st.tab, id); break;
      case 'copy': copyText(act.getAttribute('data-copy')); break;
      case 'copy-error': copyText(act.getAttribute('data-copy')); break;
      case 'reset-filters': resetFilters(); break;
      case 'go-tasks': T.navigate('/tasks'); break;
      case 'detail-close': closeDetail(); break;
      case 'detail-edit': {
        var detail = st.detail;
        if (!detail) break;
        closeDetail();
        openEdit(detail.tab, detail.id);
        break;
      }
      case 'detail-delete': {
        var target = st.detail;
        if (!target) break;
        closeDetail();
        askDelete(target.tab, target.id);
        break;
      }
      case 'edit-close': closeEdit(); break;
      case 'delete-close': closeDelete(); break;
      case 'delete-confirm': confirmDelete(); break;
      case 'related-more': relatedMore(act); break;
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
    var detail = host.querySelector('[data-role="detail-modal"]');
    if (detail) {
      detail.addEventListener('close', function () { st.detail = null; detailSeq += 1; });
    }
    var edit = host.querySelector('[data-role="edit-modal"]');
    if (edit) {
      edit.addEventListener('close', function () { st.editing = null; });
    }
    var del = host.querySelector('[data-role="delete-modal"]');
    if (del) {
      del.addEventListener('close', function () { st.deleting = null; });
    }
  }

  function unbind() {
    if (!host) return;
    host.removeEventListener('click', onClick);
    host.removeEventListener('input', onInput);
    host.removeEventListener('change', onChange);
    host.removeEventListener('keydown', onKeydown);
    host.removeEventListener('submit', onSubmit);
    var roles = ['detail-modal', 'edit-modal', 'delete-modal'];
    roles.forEach(function (role) {
      var dialog = host.querySelector('[data-role="' + role + '"]');
      if (dialog && dialog.open) {
        try { dialog.close(); } catch (e) { /* ignore */ }
      }
    });
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
      st.detail = null;
      st.editing = null;
      st.deleting = null;
      detailSeq = 0;
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
          st.detail = null;
          st.editing = null;
          st.deleting = null;
        }
      };
    }
  });
})();
