/* ============================================================
   TMD Web UI - app.js
   SPA client for Twitter Media Downloader API
   ============================================================ */

/* ---- API Client ---- */
const API_BASE = '';
const API_TIMEOUT = 30000; // 30s timeout for all API requests

function apiBase() { return API_BASE; }

// Helper: fetch with automatic timeout
function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

const API = {
  _refreshPromise: null, // _tryRefreshJWT 去重锁
  // 安全解析：非 JSON 响应（HTML 错误页/代理页）给出可读错误而非 SyntaxError
  async _parse(r) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) return r.json();
    const text = await r.text();
    throw new Error('Server returned non-JSON response (HTTP ' + r.status + '): ' + text.slice(0, 120));
  },
  async _fetch(url, options) {
    const jwt = localStorage.getItem('tmd_jwt_token');
    if (jwt) {
      if (!options) options = {};
      if (!options.headers) options.headers = {};
      options.headers['Authorization'] = 'Bearer ' + jwt;
    }
    
    try {
      const r = await fetchWithTimeout(url, { ...options });
      
      if (r.status === 401) {
        // 有 JWT 时尝试 refresh
        if (jwt) {
          const refreshed = await API._tryRefreshJWT();
          if (refreshed) {
            // 用新 token 重试
            const newToken = localStorage.getItem('tmd_jwt_token');
            const retryOpts = { ...options };
            if (retryOpts.headers) {
              retryOpts.headers['Authorization'] = 'Bearer ' + newToken;
            }
            const r2 = await fetchWithTimeout(url, retryOpts);
            if (r2.status !== 401) return r2;
          }
          // 刷新失败：清理失效 token 并引导重新登录（避免各处只报 unauthorized）
          localStorage.removeItem('tmd_jwt_token');
          localStorage.removeItem('tmd_jwt_expiry');
          showAuthDialog();
        }
        const authErr = new Error('unauthorized');
        authErr.status = 401;
        throw authErr;
      }
      
      return r;
    } catch(e) {
      if (e.name === 'AbortError') throw new Error('Request timed out');
      throw e;
    }
  },
  // Try to refresh the JWT token. Returns true on success.
  async _tryRefreshJWT() {
    // Deduplicate concurrent refresh attempts
    if (this._refreshPromise) return this._refreshPromise;
    this._refreshPromise = this._doRefreshJWT().finally(() => { this._refreshPromise = null; });
    return this._refreshPromise;
  },
  async _doRefreshJWT() {
    const oldJWT = localStorage.getItem('tmd_jwt_token');
    if (!oldJWT) return false;
    try {
      const r = await fetchWithTimeout(apiBase() + '/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + oldJWT }
      });
      if (!r.ok) return false;
      const j = await r.json();
      if (!j.success || !j.data || !j.data.token) return false;
      localStorage.setItem('tmd_jwt_token', j.data.token);
      if (j.data.expires_at) localStorage.setItem('tmd_jwt_expiry', j.data.expires_at);
      return true;
    } catch(e) { return false; }
  },
  get: async (url) => {
    const r = await API._fetch(apiBase() + url);
    const j = await API._parse(r);
    if (!j.success) throw new Error(j.error || 'Request failed');
    return j.data;
  },
  post: async (url, body) => {
    const r = await API._fetch(apiBase() + url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : undefined });
    const j = await API._parse(r);
    if (!j.success) throw new Error(j.error || 'Request failed');
    return j.data;
  },
  put: async (url, body) => {
    const r = await API._fetch(apiBase() + url, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : undefined });
    const j = await API._parse(r);
    if (!j.success) throw new Error(j.error || 'Request failed');
    return j.data;
  },
  patch: async (url, body) => {
    const r = await API._fetch(apiBase() + url, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : undefined });
    const j = await API._parse(r);
    if (!j.success) throw new Error(j.error || 'Request failed');
    return j.data;
  },
  del: async (url) => {
    const r = await API._fetch(apiBase() + url, { method: 'DELETE' });
    const j = await API._parse(r);
    if (!j.success) throw new Error(j.error || 'Request failed');
    return j.data;
  },
  // multipart 上传：不手动设 Content-Type（浏览器自动带 boundary）
  upload: async (url, formData) => {
    const r = await API._fetch(apiBase() + url, { method: 'POST', body: formData });
    const j = await API._parse(r);
    if (!j.success) throw new Error(j.error || 'Request failed');
    return j.data;
  }
};

/* ---- Utility ---- */
const esc = (s) => { if (s == null) return ''; const d = document.createElement('div'); d.appendChild(document.createTextNode(String(s))); return d.innerHTML; };
const jsEsc = (s) => { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,''); };

// Log helpers
function stripAnsi(str) { return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); }

// 提取日志行末尾的推文 ID（行首必须是 [...] 格式）
function getTweetId(text) {
  if (!text.startsWith('[')) return null;
  const m = text.match(/_(\d{16,20})\b/);
  return m ? m[1] : null;
}

function getLogLineColor(line) {
  if (line.startsWith('FATA[')) return 'var(--red)';
  if (line.startsWith('ERRO[')) return 'var(--red)';
  if (line.startsWith('WARN[')) return 'var(--amber)';
  if (line.startsWith('INFO[')) return 'var(--blue)';
  if (line.startsWith('DEBU[')) return 'var(--text-muted)';
  return 'var(--text-secondary)';
}
function highlightLogTimestamp(line) {
  line = line.replace(/(FATA|ERRO|WARN|INFO|DEBU)\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2})\]/g, '$1[<span class="log-timestamp">$2</span>]');
  return line;
}

const relativeTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm ago';
  return new Date(iso).toLocaleDateString();
};

const formatTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString();
};

const formatDuration = (start, end) => {
  if (!start || !end) return '-';
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '-';
  const d = e - s;
  if (d < 1000) return d + 'ms';
  if (d < 60000) return (d / 1000).toFixed(1) + 's';
  const m = Math.floor(d / 60000);
  const secs = Math.floor((d % 60000) / 1000);
  return m + 'm ' + secs + 's';
};

function getTaskProgressPercent(task) {
  if (task.status === 'completed') return 100;
  const p = task.progress || {};
  const total = p.total || 0;
  const completed = p.completed || 0;
  const ratio = total > 0 ? Math.min(completed / total, 1) : 0;
  if (task.status === 'failed' || task.status === 'cancelled') return total > 0 ? Math.round(ratio * 100) : 0;
  switch (p.stage) {
    case 'syncing': return 5;
    case 'preparing': return 10;
    case 'downloading': return Math.round(10 + ratio * 70);
    case 'retrying': return Math.round(80 + ratio * 10);
    case 'profile': return total > 0 ? Math.round(90 + ratio * 9) : 90;
    case 'profile_warning': return 99;
    case 'marking': return total > 0 ? Math.round(10 + ratio * 85) : 10;
    default: return 0;
  }
}

function getStageText(stage) {
  const m = { preparing:'Preparing', syncing:'Syncing', downloading:'Downloading', retrying:'Retrying', profile:'Profile', profile_warning:'Profile Warning', marking:'Marking', completed:'' };
  return m[stage] ? ' · ' + m[stage] : (stage ? ' · ' + stage : '');
}

function getTaskTarget(task) {
  const d = task.data || {};
  if (d.screen_name) return '@' + d.screen_name;
  if (d.list_id) return 'List ' + d.list_id;
  const parts = [];
  if (Array.isArray(d.users) && d.users.length) parts.push(d.users.length + ' users');
  if (Array.isArray(d.lists) && d.lists.length) parts.push(d.lists.length + ' lists');
  if (Array.isArray(d.following_names) && d.following_names.length) parts.push(d.following_names.length + ' following');
  return parts.length ? parts.join(' · ') : '';
}

function taskTypeName(type) {
  const names = {
    user_download:'User Download', list_download:'List Download',
    following_download:'Following Download', profile_download:'Profile Download',
    mark_downloaded:'Mark Downloaded', json_file_download:'JSON File Download',
    json_folder_download:'Folder Download', batch_download:'Batch Download',
    list_profile:'List Profile', retry_all_failed:'Retry All Failed'
  };
  return names[type] || type;
}

function taskTypeIcon(type) {
  const icons = {
    user_download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    list_download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    following_download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    profile_download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M12 3l-4 4h3v5h2V7h3z"/></svg>',
    mark_downloaded: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    json_file_download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l3-3 3 3"/><path d="M12 12v6"/></svg>',
    json_folder_download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M9 15l3-3 3 3"/><path d="M12 12v6"/></svg>',
    batch_download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>',
    list_profile: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    retry_all_failed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>'
  };
  return icons[type] || '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
}

/* ---- Toast ---- */
let toastId = 0;
function toast(msg, type) {
  type = type || 'info';
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Dedup: skip if same message already visible
  for (const el of container.children) {
    const msgEl = el.querySelector('.toast-msg');
    if (msgEl && msgEl.textContent === msg) return;
  }

  // Max 3 concurrent toasts, remove oldest
  while (container.children.length >= 3) container.firstChild.remove();

  const id = ++toastId;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.id = 'toast-' + id;
  // 错误通知用 role=alert 立即播报，其余走容器 aria-live=polite
  if (type === 'error') el.setAttribute('role', 'alert');
  const icons = { success:'✓', error:'✕', warning:'!', info:'i' };
  el.innerHTML = '<span class="toast-icon">' + icons[type] + '</span><span class="toast-msg">' + esc(msg) + '</span><button class="toast-close" aria-label="Dismiss">✕</button>';
  el.querySelector('.toast-close').onclick = () => el.remove();
  container.appendChild(el);
  setTimeout(() => { const e = document.getElementById('toast-'+id); if (e) e.remove(); }, 5000);
}

/* ---- Modal ---- */
let currentModal = null;
function openModal(html) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay._lastFocused = document.activeElement; // 记录触发元素，关闭时还原焦点
  overlay.innerHTML = '<div class="modal">' + html + '</div>';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  currentModal = overlay;
  // 焦点管理：聚焦弹窗内第一个可聚焦控件
  const focusable = overlay.querySelector('input, select, textarea, button');
  if (focusable) setTimeout(() => focusable.focus(), 50);
}
function closeModal() {
  if (currentModal) {
    const opener = currentModal._lastFocused;
    currentModal.remove();
    currentModal = null;
    if (opener && opener.isConnected) opener.focus();
  }
}
// ESC 关闭弹窗/侧边栏；Tab 焦点陷阱循环（弹窗打开时约束在容器内）
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeSidebar(); return; }
  if (e.key !== 'Tab' || !currentModal) return;
  const focusables = currentModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) { e.preventDefault(); return; }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ---- Global State ---- */
let pageTasks = [];
let sseConnected = false;
let _sseAuthChecked = false;
let pageRenderers = {};
let _lastSchedulesData = null;
let _tasksRESTEpoch = 0; // SSE tasks 快照应用时递增，丢弃迟到的 REST 兜底响应
let _dbTabSeq = 0; // 数据页 tab 请求代际：丢弃旧 tab 的迟到响应
let _logGen = 0; // 日志分页代际：refresh/筛选变化时递增，丢弃过期 loadMore 响应
let _prependedCount = 0; // loadMore 前置的日志行数（SSE trim 时保留，防刚加载的旧页被削掉）
let _actionBusy = false; // 下载/标记类动作的全局防重入锁

// 任务状态白名单：未知状态不进入 HTML 属性/class（防属性注入）
const TASK_STATUS_WHITELIST = ['queued', 'running', 'completed', 'failed', 'cancelled'];
const safeTaskStatus = (s) => TASK_STATUS_WHITELIST.includes(s) ? s : 'unknown';

// Debounce utility to batch rapid updates
function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn.apply(this, args); }, delay);
  };
}

/* ---- API Endpoint Mappings ---- */
const ENDPOINTS = {
  // Health
  health:      () => API.get('/api/v1/health'),
  queueStatus: () => API.get('/api/v1/queue/status'),
  authCheck:   () => API.get('/api/v1/auth/check'),

  // Tasks
  tasks:       () => API.get('/api/v1/tasks'),
  getTask:     (id) => API.get('/api/v1/tasks/' + encodeURIComponent(id)),
  cancelTask:  (id) => API.post('/api/v1/tasks/' + encodeURIComponent(id) + '/cancel'),
  cancelQueued:() => API.post('/api/v1/tasks/cancel-queued'),
  retryTask:   (id) => API.post('/api/v1/tasks/' + encodeURIComponent(id) + '/retry'),
  deleteTask:  (id) => API.del('/api/v1/tasks/' + encodeURIComponent(id)),

  // Downloads
  userDownload:        (sn, opts) => API.post('/api/v1/users/' + encodeURIComponent(sn) + '/download', opts),
  userProfile:         (sn) => API.post('/api/v1/users/' + encodeURIComponent(sn) + '/profile', {}),
  userMark:            (sn, ts) => API.post('/api/v1/users/' + encodeURIComponent(sn) + '/mark', ts ? {timestamp:ts} : {}),
  userFollowingDL:     (sn, opts) => API.post('/api/v1/users/' + encodeURIComponent(sn) + '/following/download', opts),
  userFollowingMark:   (sn, ts) => API.post('/api/v1/users/' + encodeURIComponent(sn) + '/following/mark', ts ? {timestamp:ts} : {}),
  listDownload:        (id, opts) => API.post('/api/v1/lists/' + encodeURIComponent(id) + '/download', opts),
  listProfile:         (id) => API.post('/api/v1/lists/' + encodeURIComponent(id) + '/profile', {}),
  listMark:            (id, ts) => API.post('/api/v1/lists/' + encodeURIComponent(id) + '/mark', ts ? {timestamp:ts} : {}),
  batchDownload:       (data) => API.post('/api/v1/batch/download', data),
  batchMark:           (data) => API.post('/api/v1/batch/mark', data),

  // JSON
  jsonFileDownload:    (data) => API.post('/api/v1/json/file/download', data),
  jsonFolderDownload:  (data) => API.post('/api/v1/json/folder/download', data),
  jsonFileUpload:      (fd) => API.upload('/api/v1/json/file/download', fd),
  jsonFolderUpload:    (fd) => API.upload('/api/v1/json/folder/download', fd),

  // DB
  dbUsers:             (p) => API.get('/api/v1/db/users' + qs(p)),
  dbUser:              (id) => API.get('/api/v1/db/users/' + encodeURIComponent(id)),
  dbUserUpdate:        (id,b) => API.patch('/api/v1/db/users/' + encodeURIComponent(id), b),
  dbUserDelete:        (id) => API.del('/api/v1/db/users/' + encodeURIComponent(id)),
  dbUserPrevNames:     (id) => API.get('/api/v1/db/users/' + encodeURIComponent(id) + '/previous-names'),
  dbUserEntities:      (id) => API.get('/api/v1/db/users/' + encodeURIComponent(id) + '/entities'),
  dbUserLinks:         (id) => API.get('/api/v1/db/users/' + encodeURIComponent(id) + '/links'),
  dbLists:             (p) => API.get('/api/v1/db/lists' + qs(p)),
  dbList:              (id) => API.get('/api/v1/db/lists/' + encodeURIComponent(id)),
  dbListUpdate:        (id,b) => API.patch('/api/v1/db/lists/' + encodeURIComponent(id), b),
  dbListDelete:        (id) => API.del('/api/v1/db/lists/' + encodeURIComponent(id)),
  dbListEntities:      (id) => API.get('/api/v1/db/lists/' + encodeURIComponent(id) + '/entities'),
  dbUserEntitiesAll:   (p) => API.get('/api/v1/db/user-entities' + qs(p)),
  dbListEntitiesAll:   (p) => API.get('/api/v1/db/list-entities' + qs(p)),
  dbUserLinksAll:      (p) => API.get('/api/v1/db/user-links' + qs(p)),
  dbPrevNamesAll:      (p) => API.get('/api/v1/db/user-previous-names' + qs(p)),
  dbStats:             () => API.get('/api/v1/db/stats'),
  // 行级：user-entities / list-entities / user-links 详情与删除
  dbUserEntity:        (id) => API.get('/api/v1/db/user-entities/' + encodeURIComponent(id)),
  dbUserEntityDelete:  (id) => API.del('/api/v1/db/user-entities/' + encodeURIComponent(id)),
  dbListEntity:        (id) => API.get('/api/v1/db/list-entities/' + encodeURIComponent(id)),
  dbListEntityDelete:  (id) => API.del('/api/v1/db/list-entities/' + encodeURIComponent(id)),
  dbUserLink:          (id) => API.get('/api/v1/db/user-links/' + encodeURIComponent(id)),
  dbUserLinkDelete:    (id) => API.del('/api/v1/db/user-links/' + encodeURIComponent(id)),

  // Config
  configRaw:     () => API.get('/api/v1/config/raw'),
  configFields:  () => API.get('/api/v1/config/fields'),
  saveConfigRaw: (c) => API.put('/api/v1/config/raw', {content:c}),
  saveConfigFields: (f) => API.put('/api/v1/config/fields', {fields:f}),

  // Cookies
  cookies:       () => API.get('/api/v1/cookies'),
  cookiesRaw:    () => API.get('/api/v1/cookies/raw'),
  saveCookies:   (c) => API.put('/api/v1/cookies', {cookies:c}),
  saveCookiesRaw:(c) => API.put('/api/v1/cookies/raw', {content:c}),

  // Schedules
  schedules:       () => API.get('/api/v1/schedules'),
  schedulesRaw:    () => API.get('/api/v1/schedules/raw'),
  createSchedule:  (e) => API.post('/api/v1/schedules', e),
  saveSchedulesRaw:(c) => API.put('/api/v1/schedules/raw', {content:c}),
  reloadSchedules: () => API.post('/api/v1/schedules/reload'),
  triggerAll:      () => API.post('/api/v1/schedules/trigger-all'),
  updateSchedule:  (id,e) => API.put('/api/v1/schedules/' + encodeURIComponent(id), e),
  deleteSchedule:  (id) => API.del('/api/v1/schedules/' + encodeURIComponent(id)),
  setScheduleEnabled: (id,e) => API.patch('/api/v1/schedules/' + encodeURIComponent(id) + '/enabled', {enabled:e}),
  triggerSchedule: (id) => API.post('/api/v1/schedules/' + encodeURIComponent(id) + '/trigger'),

  // Errors
  errors:      () => API.get('/api/v1/errors'),
  retryErrors: () => API.post('/api/v1/errors/retry'),
  clearErrors: () => API.del('/api/v1/errors'),

  // Logs
  logs:      (p) => API.get('/api/v1/logs' + qs(p)),
  logStats:  () => API.get('/api/v1/logs/stats'),

  // Server
  shutdown:  () => API.post('/api/v1/server/shutdown'),
};

function qs(params) {
  if (!params) return '';
  const filtered = {};
  for (const k of Object.keys(params)) if (params[k] !== undefined && params[k] !== null && params[k] !== '') filtered[k] = params[k];
  const keys = Object.keys(filtered);
  if (!keys.length) return '';
  return '?' + keys.map(k => encodeURIComponent(k) + '=' + encodeURIComponent(filtered[k])).join('&');
}

/* ---- Overview Page ---- */
function renderDashboard(container) {
  container.innerHTML = `
    <div class="stats-grid" id="dash-stats"></div>
    <div class="card mb-4">
      <div class="card-header">
        <h3>Recent Tasks</h3>
        <button class="btn btn-xs btn-ghost" onclick="navigateTo('tasks')">View all &rarr;</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th style="width:32px">Type</th><th>ID</th><th style="width:100px">Status</th><th style="width:220px">Progress</th><th style="width:130px">Time</th></tr></thead>
          <tbody id="dash-task-body"><tr><td colspan="5" class="text-muted">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>`;
  updateDashboard();
  checkHealth();
  // 队列深度
  ENDPOINTS.queueStatus().then(q => {
    const el = document.getElementById('dash-queue-depth');
    if (el) el.textContent = q.queue_depth || 0;
    const labels = document.querySelectorAll('#dash-stats .stat-card[data-dash]');
    labels.forEach(l => {
      const k = l.dataset.dash;
      if (k === 'active') l.querySelector('.stat-value').textContent = q.active_jobs || 0;
      if (k === 'pending') l.querySelector('.stat-value').textContent = q.pending_jobs || 0;
      if (k === 'detached') l.querySelector('.stat-value').textContent = q.detached_jobs || 0;
    });
  }).catch(() => {});
}

// 更新概览页统计与最近任务（SSE 快照到达时调用）
function updateDashboard() {
  const tasks = pageTasks;
  const stats = {queued:0, running:0, completed:0, failed:0, cancelled:0, total:tasks.length};
  tasks.forEach(t => { if (stats[t.status] !== undefined) stats[t.status]++; });
  const statsEl = document.getElementById('dash-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-card completed"><div class="stat-value" id="dash-health-text">${document.getElementById('health-text') ? document.getElementById('health-text').textContent : 'OK'}</div><div class="stat-label">Status</div></div>
      <div class="stat-card running"><div class="stat-value">${stats.running}</div><div class="stat-label">Running</div></div>
      <div class="stat-card queued"><div class="stat-value">${stats.queued}</div><div class="stat-label">Queued</div></div>
      <div class="stat-card completed"><div class="stat-value">${stats.completed}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card total"><div class="stat-value" id="dash-queue-depth">-</div><div class="stat-label">Queue Depth</div></div>
    `;
  }
  const tbody = document.getElementById('dash-task-body');
  if (!tbody) return;
  const recent = tasks.slice(0, 5);
  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No tasks yet. Start a download to see tasks here.</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map(t => {
    const p = t.progress || {};
    const pct = getTaskProgressPercent(t);
    const target = getTaskTarget(t);
    return `<tr>
      <td>${taskTypeIcon(t.type)}</td>
      <td><span class="mono">${esc(t.task_id || t.id)}</span><div class="text-sm text-muted">${esc(taskTypeName(t.type))}${target ? ' - ' + esc(target) : ''}</div></td>
      <td><span class="badge badge-${safeTaskStatus(t.status)}">${esc(t.status)}</span></td>
      <td>
        <div class="progress-bar-wrap"><div class="progress-bar-fill ${p.stage === 'completed' ? 'completed' : (t.status === 'failed' ? 'failed' : (t.status === 'running' ? 'pulsing' : ''))}" style="width:${pct}%"></div></div>
        <div class="progress-detail"><span>${pct}%${esc(getStageText(p.stage))}</span>${p.current ? '<span> &middot; ' + esc(p.current) + '</span>' : ''}</div>
      </td>
      <td><div class="text-sm">${relativeTime(t.created_at)}</div></td>
    </tr>`;
  }).join('');
}

/* ---- Routing ---- */
function navigateTo(page) {
  closeModal();
  // Clean up log SSE when leaving logs page
  if (currentPage === 'logs' && page !== 'logs') {
    disconnectLogSSE();
  }
  if (page === currentPage) return;
  currentPage = page;
  history.pushState({page}, '', page === 'overview' ? '/' : '/' + page);
  renderPage(page);
  // 移动端：导航后收起侧边栏并隐藏遮罩
  closeSidebar();
}

window.addEventListener('popstate', (e) => {
  const page = location.pathname.replace(/^\//, '') || 'overview';
  // 与 navigateTo 共用离开清理：浏览器前进/后退离开日志页也要断开 log SSE
  if (currentPage === 'logs' && page !== 'logs') {
    disconnectLogSSE();
  }
  currentPage = page;
  renderPage(page);
});

function renderPage(page) {
  // Update sidebar
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  const titles = {overview:'Dashboard', tasks:'Tasks', data:'Data', schedules:'Schedules', system:'System', logs:'Logs'};
  document.getElementById('page-title').textContent = titles[page] || 'Tasks';

  const container = document.getElementById('page-content');
  if (pageRenderers[page]) {
    pageRenderers[page](container);
  } else {
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';
    loadPageModule(page, container);
  }
}

function loadPageModule(page, container) {
  const loaders = {
    overview:  renderDashboard,
    tasks:     renderTasksPage,
    data:      renderDataPage,
    schedules: renderSchedulesPage,
    system:    renderSystemPage,
    logs:      renderLogsPage,
  };
  if (loaders[page]) {
    loaders[page](container);
    pageRenderers[page] = loaders[page];
  }
}

/* ---- SSE ---- */
let sseSource = null;
let sseReconnectTimer = null;
let sseReconnectDelay = 1000;

function sseJWT() {
  return localStorage.getItem('tmd_jwt_token') || '';
}

// 统一 JWT 预刷新：当 JWT 即将过期时先刷新再执行回调，否则直接回调
function tryRefreshJWT(label, done) {
  const token = localStorage.getItem('tmd_jwt_token');
  if (!token) { done(false); return; }
  const expiry = localStorage.getItem('tmd_jwt_expiry');
  if (!expiry || new Date(expiry) - new Date() >= 2 * 60 * 1000) { done(false); return; }
  API._tryRefreshJWT().then(refreshed => {
    if (refreshed) console.log(`[${label}] JWT refreshed before reconnect`);
    done(refreshed);
  });
}

// Debounce rapid SSE updates to avoid excessive re-renders
const debouncedTasksUpdate = debounce(function(tasks) {
  _tasksRESTEpoch++; // 新快照生效，作废在途 REST 兜底响应
  pageTasks = tasks;
  if (currentPage === 'tasks' && pageRenderers.tasks) {
    try { updateTasksView(); } catch(err) { console.warn('SSE tasks update error:', err); }
  }
  if (currentPage === 'overview' && pageRenderers.overview) {
    try { updateDashboard(); } catch(err) { console.warn('SSE dashboard update error:', err); }
  }
  // errors 数据随任务终态变化，跟随任务事件去抖刷新（原实现每 SSE 事件直接请求，形成风暴）
  if (currentPage === 'tasks') loadErrors();
}, 100);
const debouncedSchedulesUpdate = debounce(function(data) {
  _lastSchedulesData = data;
  if (currentPage === 'schedules' && pageRenderers.schedules) {
    try { updateSchedulesView(); } catch(err) { /* ignore */ }
  }
}, 100);

function connectSSE() {
  if (sseReconnectTimer) { clearTimeout(sseReconnectTimer); sseReconnectTimer = null; }
  if (sseSource) { sseSource.close(); sseSource = null; }
  const key = sseJWT();
  // 首次加载时若无 JWT，推迟连接，等 checkAuth 确认无需认证或完成后重连
  if (!key && !_sseAuthChecked) {
    _sseAuthChecked = true;
    return;
  }
  sseSource = new EventSource(apiBase() + '/api/v1/sse/tasks' + (key ? '?token=' + encodeURIComponent(key) : ''));

  sseSource.addEventListener('tasks', (e) => {
    try {
      const tasks = JSON.parse(e.data);
      if (Array.isArray(tasks)) {
        debouncedTasksUpdate(tasks);
      }
    } catch(err) { /* ignore parse errors */ }
  });

  sseSource.addEventListener('schedules', (e) => {
    try {
      const data = JSON.parse(e.data);
      debouncedSchedulesUpdate(data);
    } catch(err) { /* ignore */ }
  });

  sseSource.addEventListener('notification', (e) => {
    try {
      const n = JSON.parse(e.data);
      if (n && n.message) {
        const type = n.type === 'task_completed' ? 'success' :
                     n.type === 'task_failed' ? 'error' :
                     n.type === 'task_cancelled' ? 'warning' :
                     n.type === 'schedule_warning' ? 'warning' : 'info';
        // Delay toast to align with SSE debounce
        setTimeout(() => toast(n.message, type), 100);
      }
    } catch(err) { /* ignore */ }
  });

  sseSource.addEventListener('server_shutdown', (e) => {
    toast('Server is shutting down...', 'error');
  });

  sseSource.onopen = () => {
    sseConnected = true;
    sseReconnectDelay = 1000;
    // Refresh current page data after reconnect（保留当前页码，不踢回第 1 页）
    if (currentPage === 'data') {
      const activeTab = document.querySelector('#db-tabs .tab.active');
      const tab = activeTab ? activeTab.dataset.dbtab : 'users';
      loadDBTab(tab, dbPageState[tab] !== undefined ? dbPageState[tab] : 0);
    }
    document.querySelector('.health-dot') && (document.querySelector('.health-dot').style.background = 'var(--green)');
  };

  sseSource.onerror = () => {
    sseConnected = false;
    document.querySelector('.health-dot') && (document.querySelector('.health-dot').style.background = 'var(--red)');
    sseSource.close();
    // 尝试刷新 JWT；刷新失败时用 auth/check 区分「服务器不可达（暂时故障，静默重连）」与「会话确实失效（弹认证框）」
    API._tryRefreshJWT().then(ok => {
      if (ok) {
        sseReconnectDelay = Math.min(sseReconnectDelay * 2, 30000);
        sseReconnectTimer = setTimeout(connectSSE, sseReconnectDelay);
        return;
      }
      const jwt = localStorage.getItem('tmd_jwt_token');
      if (!jwt) {
        // 无 token：登录前静默重连，避免反复弹框
        sseReconnectTimer = setTimeout(connectSSE, sseReconnectDelay);
        return;
      }
      // auth/check 带旧 token 探测：网络错误 = 服务器暂时不可达 → 静默重连；401 = 会话失效 → 弹框
      fetch(apiBase() + '/api/v1/auth/check', { headers: { 'Authorization': 'Bearer ' + jwt } })
        .then(res => {
          if (res.status === 401) {
            showAuthDialog('Session expired - please re-authenticate');
            return;
          }
          sseReconnectDelay = Math.min(sseReconnectDelay * 2, 30000);
          sseReconnectTimer = setTimeout(connectSSE, sseReconnectDelay);
        })
        .catch(() => {
          sseReconnectDelay = Math.min(sseReconnectDelay * 2, 30000);
          sseReconnectTimer = setTimeout(connectSSE, sseReconnectDelay);
        });
    });
  };
}

/* ---- Health Check ---- */
async function checkHealth() {
  try {
    const h = await ENDPOINTS.health();
    const dot = document.getElementById('health-dot');
    const text = document.getElementById('health-text');
    if (dot) dot.className = 'health-dot';
    if (text) text.textContent = h.status || 'OK';
    const vi = document.getElementById('version-info');
    if (vi) vi.innerHTML = '<a href="https://github.com/Leexunhuan743/twitter_media_downloader_pro" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">' + esc(h.version || 'v2') + ' &middot; Go + SQLite</a>';
  } catch(e) {
    const dot = document.getElementById('health-dot');
    if (dot) dot.className = 'health-dot error';
    const text = document.getElementById('health-text');
    // 401 = 认证问题而非服务器故障，避免误导用户
    if (text) text.textContent = (e.status === 401) ? 'Auth required' : 'Offline';
  }
}

/* ============================================================
   PAGE RENDERERS
   ============================================================ */

/* ---- Tasks Page ---- */
function renderTasksPage(container) {
  container.innerHTML = `
    <div class="stats-grid" id="task-stats"></div>
    <div class="card mb-4">
      <div class="card-body" style="padding:12px 20px">
        <div class="flex gap-2 items-center" style="flex-wrap:wrap">
          <input type="text" id="quick-dl-input" placeholder="Twitter URL or @username ... paste link or type name" style="flex:1;min-width:200px">
          <button class="btn btn-primary btn-sm" onclick="handleQuickDownload()">Quick Download</button>
        </div>
      </div>
    </div>
    <div class="card mb-4" id="errors-panel">
      <div class="card-header" onclick="toggleErrorsPanel()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleErrorsPanel()}" tabindex="0" role="button" aria-expanded="false" id="errors-panel-toggle" style="cursor:pointer;user-select:none">
        <span id="errors-panel-title">Failed Records</span>
        <span id="errors-panel-badge" style="margin-left:auto"></span>
        <span id="errors-panel-arrow" style="margin-left:8px;transition:transform .2s">▶</span>
      </div>
      <div class="card-body hidden" id="errors-panel-body">
        <div id="errors-panel-content"><div class="loading"><div class="spinner"></div> Loading...</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-header">
        <h2>Tasks</h2>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" onclick="showBatchForm()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Download
          </button>
          <button class="btn btn-ghost btn-sm" onclick="cancelAllQueued()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel Queued
          </button>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="task-table">
            <colgroup>
              <col style="width:48px">
              <col>
              <col style="width:100px">
              <col style="width:220px">
              <col style="width:130px">
              <col style="width:100px">
            </colgroup>
            <thead>
              <tr>
                <th style="width:32px">Type</th>
                <th>ID</th>
                <th style="width:100px">Status</th>
                <th style="width:220px">Progress</th>
                <th style="width:130px">Time</th>
                <th style="width:100px">Actions</th>
              </tr>
            </thead>
            <tbody id="task-table-body"></tbody>
          </table>
        </div>
        <div class="card-body" id="task-empty" style="display:none">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <p>No tasks yet. Start a download to see tasks here.</p>
          </div>
        </div>
      </div>
    </div>`;

  pageRenderers.tasks = renderTasksPage;
  updateTasksView();
  loadErrors();
  // SSE 未就绪时的兜底：REST 拉取填充任务列表（SSE 快照到达后自动作废）
  const epoch = _tasksRESTEpoch;
  ENDPOINTS.tasks().then(r => {
    if (epoch !== _tasksRESTEpoch) return; // 期间 SSE 已提供更新快照，丢弃迟到响应
    if (Array.isArray(r.tasks)) {
      pageTasks = r.tasks;
      if (currentPage === 'tasks') updateTasksView();
    }
  }).catch(() => { /* SSE 断开时静默，页面保持空态 */ });
}

function renderTaskActions(t, { canCancel, canRetry, canDelete }) {
  return `
          ${(t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') ? '<button class="btn btn-xs btn-ghost" onclick="showTaskDetail(\'' + jsEsc(t.task_id) + '\')" title="View"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>' : ''}
          ${canCancel ? '<button class="btn btn-xs btn-ghost" onclick="doCancelTask(\'' + jsEsc(t.task_id) + '\')" title="Cancel"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' : ''}
          ${canRetry ? '<button class="btn btn-xs btn-ghost" onclick="doRetryTask(\'' + jsEsc(t.task_id) + '\')" title="Retry"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>' : ''}
          ${canDelete ? '<button class="btn btn-xs btn-ghost" onclick="doDeleteTask(\'' + jsEsc(t.task_id) + '\')" title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : ''}`;
}

function renderTaskRow(t) {
  const p = t.progress || {};
  const pct = getTaskProgressPercent(t);
  const barClass = p.stage === 'completed' ? 'completed' : (t.status === 'failed' ? 'failed' : (t.status === 'running' ? 'pulsing' : ''));
  const stageText = getStageText(p.stage);
  const target = getTaskTarget(t);
  const canCancel = t.status === 'queued' || t.status === 'running';
  const canRetry = t.status === 'failed' || t.status === 'cancelled';
  const canDelete = t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled';

  return `<tr data-status="${t.status}" data-task-id="${jsEsc(t.task_id || t.id || '')}">
      <td>${taskTypeIcon(t.type)}</td>
      <td><span class="mono">${esc(t.task_id || t.id)}</span><div class="text-sm text-muted">${esc(taskTypeName(t.type))}${target ? ' - ' + esc(target) : ''}</div></td>
      <td><span class="badge badge-${safeTaskStatus(t.status)}">${esc(t.status)}</span></td>
      <td>
        <div class="progress-bar-wrap"><div class="progress-bar-fill ${barClass}" style="width:${pct}%"></div></div>
        <div class="progress-detail">
          <span>${pct}%${stageText}</span>
          ${p.current ? '<span> &middot; ' + esc(p.current) + '</span>' : ''}
          ${p.failed ? '<span class="fail"> &middot; ' + esc(p.failed) + ' failed</span>' : ''}
        </div>
      </td>
      <td class="task-time-cell">
        <div class="text-sm">${relativeTime(t.created_at)}</div>
        ${t.started_at && t.ended_at ? '<div class="text-sm text-muted">' + formatDuration(t.started_at, t.ended_at) + '</div>' : ''}
      </td>
      <td>
        <div class="task-actions" data-state="${canCancel}/${canRetry}/${canDelete}">${renderTaskActions(t, { canCancel, canRetry, canDelete })}</div>
      </td>
    </tr>`;
}

// 增量更新单行的动态部分（badge/进度/时间/操作按钮），静态部分（type/ID/target）不重建
function updateTaskRowDynamic(tr, t) {
  const p = t.progress || {};
  const pct = getTaskProgressPercent(t);

  if (tr.dataset.status !== t.status) tr.dataset.status = t.status;

  const badge = tr.querySelector('.badge');
  if (badge) {
    const cls = 'badge badge-' + safeTaskStatus(t.status);
    if (badge.className !== cls) badge.className = cls;
    if (badge.textContent !== t.status) badge.textContent = t.status;
  }

  const barClass = p.stage === 'completed' ? 'completed' : (t.status === 'failed' ? 'failed' : (t.status === 'running' ? 'pulsing' : ''));
  const fill = tr.querySelector('.progress-bar-fill');
  if (fill) {
    fill.style.width = pct + '%';
    const cls = 'progress-bar-fill ' + barClass;
    if (fill.className !== cls) fill.className = cls;
  }

  const detail = tr.querySelector('.progress-detail');
  if (detail) {
    const stageText = getStageText(p.stage);
    let html = '<span>' + pct + '%' + esc(stageText) + '</span>';
    if (p.current) html += '<span> &middot; ' + esc(p.current) + '</span>';
    if (p.failed) html += '<span class="fail"> &middot; ' + esc(p.failed) + ' failed</span>';
    if (detail.innerHTML !== html) detail.innerHTML = html;
  }

  // 相对时间会过期，纳入增量更新
  const timeCell = tr.querySelector('.task-time-cell');
  if (timeCell) {
    const html = '<div class="text-sm">' + relativeTime(t.created_at) + '</div>' + (t.started_at && t.ended_at ? '<div class="text-sm text-muted">' + formatDuration(t.started_at, t.ended_at) + '</div>' : '');
    if (timeCell.innerHTML !== html) timeCell.innerHTML = html;
  }

  // 操作按钮集随状态变化，变化时才重建
  const canCancel = t.status === 'queued' || t.status === 'running';
  const canRetry = t.status === 'failed' || t.status === 'cancelled';
  const canDelete = t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled';
  const stateKey = canCancel + '/' + canRetry + '/' + canDelete;
  const actions = tr.querySelector('.task-actions');
  if (actions && actions.dataset.state !== stateKey) {
    actions.dataset.state = stateKey;
    actions.innerHTML = renderTaskActions(t, { canCancel, canRetry, canDelete });
  }
}

function updateTasksView() {
  const tasks = pageTasks;
  // Stats
  const stats = {queued:0, running:0, completed:0, failed:0, cancelled:0, total:tasks.length};
  tasks.forEach(t => { if (stats[t.status] !== undefined) stats[t.status]++; });

  const statsHtml = Object.entries(stats).map(([k,v]) =>
    `<div class="stat-card ${k}"><div class="stat-value">${v}</div><div class="stat-label">${k}</div></div>`
  ).join('');
  const statsEl = document.getElementById('task-stats');
  if (statsEl) statsEl.innerHTML = statsHtml;

  // Table：keyed 增量（SSE 高频快照只 patch 动态部分，不整表重建）
  const tbody = document.getElementById('task-table-body');
  const empty = document.getElementById('task-empty');
  if (!tbody) return;

  if (!tasks.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const existing = new Map();
  tbody.querySelectorAll('tr[data-task-id]').forEach(tr => existing.set(tr.dataset.taskId, tr));
  const seen = new Set();
  for (const t of tasks) {
    const id = String(t.task_id || t.id || '');
    if (!id) continue;
    seen.add(id);
    const tr = existing.get(id);
    if (tr) updateTaskRowDynamic(tr, t);
    else {
      const tmp = document.createElement('tbody');
      tmp.innerHTML = renderTaskRow(t);
      tbody.appendChild(tmp.firstElementChild);
    }
  }
  // 移除已消失（取消/删除/清理）的行
  for (const [id, tr] of existing) {
    if (!seen.has(id)) tr.remove();
  }
}

/* ---- Download Forms ---- */

function showBatchForm() {
  openModal(`
    <div class="modal-header">
      <h2>New Download</h2>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="tabs" id="dl-tabs">
        <button class="tab active" data-dltab="user">User</button>
        <button class="tab" data-dltab="list">List</button>
        <button class="tab" data-dltab="following">Following</button>
        <button class="tab" data-dltab="batch">Batch</button>
        <button class="tab" data-dltab="json">JSON</button>
      </div>

      <!-- User Download -->
      <div class="dl-tab-content" id="dl-tab-user">
        <div class="form-group">
          <label>Screen Name</label>
          <input type="text" id="dl-user-name" placeholder="elonmusk">
        </div>
        <div class="form-row">
          <label class="checkbox-label"><input type="checkbox" id="dl-user-autofollow"> Auto-follow</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-user-followmembers"> Follow members</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-user-skipprofile"> Skip profile</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-user-noretry"> No retry</label>
        </div>
        <div class="form-group">
          <label>Mark timestamp (optional)</label>
          <input type="datetime-local" id="dl-user-marktime">
          <div class="text-sm text-muted">Leave empty to mark as now.</div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="doUserDownload()">Download User</button>
          <button class="btn btn-secondary" onclick="doUserProfile()">Profile Only</button>
          <button class="btn btn-secondary" onclick="doUserMark()">Mark Downloaded</button>
        </div>
      </div>

      <!-- List Download -->
      <div class="dl-tab-content hidden" id="dl-tab-list">
        <div class="form-group">
          <label>List ID</label>
          <input type="text" id="dl-list-id" placeholder="1234567890">
        </div>
        <div class="form-row">
          <label class="checkbox-label"><input type="checkbox" id="dl-list-autofollow"> Auto-follow</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-list-followmembers"> Follow members</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-list-skipprofile"> Skip profile</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-list-noretry"> No retry</label>
        </div>
        <div class="form-group">
          <label>Mark timestamp (optional)</label>
          <input type="datetime-local" id="dl-list-marktime">
          <div class="text-sm text-muted">Leave empty to mark as now.</div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="doListDownload()">Download List</button>
          <button class="btn btn-secondary" onclick="doListProfile()">Profile Only</button>
          <button class="btn btn-secondary" onclick="doListMark()">Mark Downloaded</button>
        </div>
      </div>

      <!-- Following Download -->
      <div class="dl-tab-content hidden" id="dl-tab-following">
        <div class="form-group">
          <label>User's Followings</label>
          <input type="text" id="dl-foll-name" placeholder="elonmusk">
        </div>
        <div class="form-row">
          <label class="checkbox-label"><input type="checkbox" id="dl-foll-autofollow"> Auto-follow</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-foll-followmembers"> Follow members</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-foll-skipprofile"> Skip profile</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-foll-noretry"> No retry</label>
        </div>
        <div class="form-group">
          <label>Mark timestamp (optional)</label>
          <input type="datetime-local" id="dl-foll-marktime">
          <div class="text-sm text-muted">Leave empty to mark as now.</div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="doFollowingDownload()">Download</button>
          <button class="btn btn-secondary" onclick="doFollowingMark()">Mark Downloaded</button>
        </div>
      </div>

      <!-- Batch Download -->
      <div class="dl-tab-content hidden" id="dl-tab-batch">
        <div class="form-group">
          <label>Users (one per line)</label>
          <textarea id="dl-batch-users" rows="3" placeholder="elonmusk"></textarea>
        </div>
        <div class="form-group">
          <label>List IDs (one per line)</label>
          <textarea id="dl-batch-lists" rows="2" placeholder="1234567890"></textarea>
        </div>
        <div class="form-group">
          <label>Following (one per line)</label>
          <textarea id="dl-batch-foll" rows="2" placeholder="jack"></textarea>
        </div>
        <div class="form-row">
          <label class="checkbox-label"><input type="checkbox" id="dl-batch-autofollow"> Auto-follow</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-batch-followmembers"> Follow members</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-batch-skipprofile"> Skip profile</label>
          <label class="checkbox-label"><input type="checkbox" id="dl-batch-noretry"> No retry</label>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="doBatchDownload()">Batch Download</button>
          <button class="btn btn-secondary" onclick="doBatchMark()">Batch Mark</button>
        </div>
      </div>

      <!-- JSON Download -->
      <div class="dl-tab-content hidden" id="dl-tab-json">
        <div class="form-group">
          <label>Upload JSON files (third-party export / .loongtweet)</label>
          <input type="file" id="dl-json-files" multiple accept=".json,application/json">
          <div class="text-sm text-muted">Select files to upload, or use server paths below.</div>
        </div>
        <div class="form-group">
          <label>Server JSON File Paths (one per line)</label>
          <textarea id="dl-json-paths" rows="3" placeholder="/path/to/tweets.json"></textarea>
        </div>
        <label class="checkbox-label"><input type="checkbox" id="dl-json-noretry"> No retry</label>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="doJSONFileDownload()">Download from Files</button>
          <button class="btn btn-secondary" onclick="doJSONFolderDownload()">Download from Folders</button>
        </div>
      </div>
    </div>`);

  // Tab switching
  document.querySelectorAll('[data-dltab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-dltab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.dl-tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById('dl-tab-' + tab.dataset.dltab).classList.remove('hidden');
    });
  });
}

// Download action functions
async function doUserDownload() {
  const name = document.getElementById('dl-user-name').value.trim();
  if (!name) return toast('Enter a screen name', 'warning');
  // 先读控件值再关弹窗（弹窗关闭后 DOM 已移除）
  const auto_follow = document.getElementById('dl-user-autofollow').checked;
  const follow_members = document.getElementById('dl-user-followmembers').checked;
  const skip_profile = document.getElementById('dl-user-skipprofile').checked;
  const no_retry = document.getElementById('dl-user-noretry').checked;
  if (_actionBusy) { toast('A download is already in progress, please wait', 'warning'); return; }
  closeModal();
  _actionBusy = true;
  try {
    const r = await ENDPOINTS.userDownload(name, { auto_follow, follow_members, skip_profile, no_retry });
    toast('Task created: ' + r.task_id, 'success');
  } catch(e) { toast(e.message, 'error'); }
  finally { _actionBusy = false; }
}

async function doUserProfile() {
  const name = document.getElementById('dl-user-name').value.trim();
  if (!name) return toast('Enter a screen name', 'warning');
  closeModal();
  try { const r = await ENDPOINTS.userProfile(name); toast('Task created: ' + r.task_id, 'success'); }
  catch(e) { toast(e.message, 'error'); }
}

async function doUserMark() {
  if (_actionBusy) { toast('A download is already in progress, please wait', 'warning'); return; }
  const name = document.getElementById('dl-user-name').value.trim();
  if (!name) return toast('Enter a screen name', 'warning');
  // 先读控件值再关弹窗（弹窗关闭后 DOM 已移除）
  const tsRaw = document.getElementById('dl-user-marktime').value || '';
  // datetime-local 值（2026-08-03T14:30）非 RFC3339，需转 ISO 再提交（后端 Timestamp 只接受 RFC3339）
  const ts = tsRaw ? new Date(tsRaw).toISOString() : '';
  _actionBusy = true;
  closeModal();
  try { const r = await ENDPOINTS.userMark(name, ts || undefined); toast('Marked: ' + r.task_id, 'success'); }
  catch(e) { toast(e.message, 'error'); }
  finally { _actionBusy = false; }
}

async function doListDownload() {
  const id = document.getElementById('dl-list-id').value.trim();
  if (!id) return toast('Enter a list ID', 'warning');
  // 先读控件值再关弹窗（弹窗关闭后 DOM 已移除）
  const auto_follow = document.getElementById('dl-list-autofollow').checked;
  const follow_members = document.getElementById('dl-list-followmembers').checked;
  const skip_profile = document.getElementById('dl-list-skipprofile').checked;
  const no_retry = document.getElementById('dl-list-noretry').checked;
  if (_actionBusy) { toast('A download is already in progress, please wait', 'warning'); return; }
  closeModal();
  _actionBusy = true;
  try {
    const r = await ENDPOINTS.listDownload(id, { auto_follow, follow_members, skip_profile, no_retry });
    toast('Task created: ' + r.task_id, 'success');
  } catch(e) { toast(e.message, 'error'); }
  finally { _actionBusy = false; }
}

async function doListProfile() {
  const id = document.getElementById('dl-list-id').value.trim();
  if (!id) return toast('Enter a list ID', 'warning');
  closeModal();
  try { const r = await ENDPOINTS.listProfile(id); toast('Task created: ' + r.task_id, 'success'); }
  catch(e) { toast(e.message, 'error'); }
}

async function doListMark() {
  if (_actionBusy) { toast('A download is already in progress, please wait', 'warning'); return; }
  const id = document.getElementById('dl-list-id').value.trim();
  if (!id) return toast('Enter a list ID', 'warning');
  // 先读控件值再关弹窗（弹窗关闭后 DOM 已移除）
  const tsRaw = document.getElementById('dl-list-marktime').value || '';
  // datetime-local 值非 RFC3339，需转 ISO 再提交
  const ts = tsRaw ? new Date(tsRaw).toISOString() : '';
  _actionBusy = true;
  closeModal();
  try { const r = await ENDPOINTS.listMark(id, ts || undefined); toast('Marked: ' + r.task_id, 'success'); }
  catch(e) { toast(e.message, 'error'); }
  finally { _actionBusy = false; }
}

async function doFollowingDownload() {
  const name = document.getElementById('dl-foll-name').value.trim();
  if (!name) return toast('Enter a screen name', 'warning');
  // 先读控件值再关弹窗（弹窗关闭后 DOM 已移除）
  const auto_follow = document.getElementById('dl-foll-autofollow').checked;
  const follow_members = document.getElementById('dl-foll-followmembers').checked;
  const skip_profile = document.getElementById('dl-foll-skipprofile').checked;
  const no_retry = document.getElementById('dl-foll-noretry').checked;
  if (_actionBusy) { toast('A download is already in progress, please wait', 'warning'); return; }
  closeModal();
  _actionBusy = true;
  try {
    const r = await ENDPOINTS.userFollowingDL(name, { auto_follow, follow_members, skip_profile, no_retry });
    toast('Task created: ' + r.task_id, 'success');
  } catch(e) { toast(e.message, 'error'); }
  finally { _actionBusy = false; }
}

async function doFollowingMark() {
  if (_actionBusy) { toast('A download is already in progress, please wait', 'warning'); return; }
  const name = document.getElementById('dl-foll-name').value.trim();
  if (!name) return toast('Enter a screen name', 'warning');
  // 先读控件值再关弹窗（弹窗关闭后 DOM 已移除）
  const tsRaw = document.getElementById('dl-foll-marktime').value || '';
  // datetime-local 值非 RFC3339，需转 ISO 再提交
  const ts = tsRaw ? new Date(tsRaw).toISOString() : '';
  _actionBusy = true;
  closeModal();
  try { const r = await ENDPOINTS.userFollowingMark(name, ts || undefined); toast('Marked: ' + r.task_id, 'success'); }
  catch(e) { toast(e.message, 'error'); }
  finally { _actionBusy = false; }
}

async function doBatchDownload() {
  const users = document.getElementById('dl-batch-users').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const lists = document.getElementById('dl-batch-lists').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const foll = document.getElementById('dl-batch-foll').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
  if (!users.length && !lists.length && !foll.length) return toast('Enter at least one target', 'warning');
  // 先读控件值再关弹窗（弹窗关闭后 DOM 已移除）
  const auto_follow = document.getElementById('dl-batch-autofollow').checked;
  const follow_members = document.getElementById('dl-batch-followmembers').checked;
  const skip_profile = document.getElementById('dl-batch-skipprofile').checked;
  const no_retry = document.getElementById('dl-batch-noretry').checked;
  if (_actionBusy) { toast('A download is already in progress, please wait', 'warning'); return; }
  closeModal();
  _actionBusy = true;
  try {
    const r = await ENDPOINTS.batchDownload({
      users, lists, following_names: foll,
      auto_follow, follow_members, skip_profile, no_retry
    });
    toast('Batch task: ' + r.task_id, 'success');
  } catch(e) { toast(e.message, 'error'); }
  finally { _actionBusy = false; }
}

async function doBatchMark() {
  const users = document.getElementById('dl-batch-users').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const lists = document.getElementById('dl-batch-lists').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const foll = document.getElementById('dl-batch-foll').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
  if (!users.length && !lists.length && !foll.length) return toast('Enter at least one target', 'warning');
  closeModal();
  try {
    const r = await ENDPOINTS.batchMark({ users, lists, following_names: foll });
    toast('Batch mark: ' + r.task_id, 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function doJSONFileDownload() {
  const fileInput = document.getElementById('dl-json-files');
  const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
  const paths = document.getElementById('dl-json-paths').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
  if (!files.length && !paths.length) return toast('Select files or enter at least one path', 'warning');
  // 先读控件值再关弹窗（弹窗关闭后 DOM 已移除）
  const no_retry = document.getElementById('dl-json-noretry').checked;
  if (_actionBusy) { toast('A download is already in progress, please wait', 'warning'); return; }
  closeModal();
  _actionBusy = true;
  try {
    if (files.length) {
      // multipart 上传：浏览器直接上传文件，无需服务端路径
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      if (no_retry) fd.append('no_retry', 'true');
      const r = await ENDPOINTS.jsonFileUpload(fd);
      toast('Task created: ' + r.task_id, 'success');
    } else {
      const r = await ENDPOINTS.jsonFileDownload({ paths, no_retry });
      toast('Task created: ' + r.task_id, 'success');
    }
  } catch(e) { toast(e.message, 'error'); }
  finally { _actionBusy = false; }
}

async function doJSONFolderDownload() {
  const fileInput = document.getElementById('dl-json-files');
  const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
  const paths = document.getElementById('dl-json-paths').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
  if (!files.length && !paths.length) return toast('Select files or enter at least one path', 'warning');
  // 先读控件值再关弹窗（弹窗关闭后 DOM 已移除）
  const no_retry = document.getElementById('dl-json-noretry').checked;
  if (_actionBusy) { toast('A download is already in progress, please wait', 'warning'); return; }
  closeModal();
  _actionBusy = true;
  try {
    if (files.length) {
      // multipart 上传（.loongtweet 文件夹可打包为 zip 上传，或逐个上传其内 json）
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      if (no_retry) fd.append('no_retry', 'true');
      const r = await ENDPOINTS.jsonFolderUpload(fd);
      toast('Task created: ' + r.task_id, 'success');
    } else {
      const r = await ENDPOINTS.jsonFolderDownload({ paths, no_retry });
      toast('Task created: ' + r.task_id, 'success');
    }
  } catch(e) { toast(e.message, 'error'); }
  finally { _actionBusy = false; }
}

// Task actions
async function doCancelTask(id) {
  if (!confirm('Cancel this task?')) return;
  try { await ENDPOINTS.cancelTask(id); toast('Task cancelled', 'info'); }
  catch(e) { toast(e.message, 'error'); }
}

async function doRetryTask(id) {
  try { const r = await ENDPOINTS.retryTask(id); toast('Retry created: ' + r.task_id, 'success'); }
  catch(e) { toast(e.message, 'error'); }
}

async function doDeleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try { await ENDPOINTS.deleteTask(id); toast('Task deleted', 'info'); }
  catch(e) { toast(e.message, 'error'); }
}

// Task detail view
async function showTaskDetail(id) {
  let task;
  try {
    task = await ENDPOINTS.getTask(id);
  } catch(e) {
    return toast('Failed to load task: ' + e.message, 'error');
  }
  if (!task) return toast('Task not found', 'error');

  const statusColors = { queued:'#8b949e', running:'#58a6ff', completed:'#3fb950', failed:'#f85149', cancelled:'#6e7681' };
  const bgColors = { queued:'rgba(139,148,158,0.1)', running:'rgba(88,166,255,0.1)', completed:'rgba(63,185,80,0.1)', failed:'rgba(248,81,73,0.1)', cancelled:'rgba(110,118,129,0.1)' };
  const sc = statusColors[task.status] || '#8b949e';
  const bg = bgColors[task.status] || 'rgba(139,148,158,0.1)';
  const target = getTaskTarget(task);
  const pct = getTaskProgressPercent(task);

  // Timeline
  const fmt = (t) => { if (!t) return '-'; const d = new Date(t); return isNaN(d.getTime()) ? '-' : d.toLocaleString(); };
  const started = task.started_at ? fmt(task.started_at) : null;
  const ended = task.ended_at ? fmt(task.ended_at) : null;
  const dur = (task.started_at && task.ended_at) ? formatDuration(task.started_at, task.ended_at) : null;

  // Result
  let resultHtml = '';
  const res = task.result;
  if (res) {
    const parts = [];
    if (res.main) parts.push('<div><strong>Main:</strong> ' + (res.main.downloaded||0) + ' downloaded' + (res.main.failed ? ', ' + res.main.failed + ' failed' : '') + '</div>');
    if (res.profile) parts.push('<div><strong>Profile:</strong> ' + (res.profile.downloaded||0) + ' downloaded' + (res.profile.failed ? ', ' + res.profile.failed + ' failed' : '') + (res.profile.versioned ? ', ' + res.profile.versioned + ' versioned' : '') + '</div>');
    if (res.message) parts.push('<div class="text-sm text-muted">' + esc(res.message) + '</div>');
    if (parts.length) resultHtml = '<div class="section-header mt-4"><h3>Result</h3></div><div class="card" style="padding:12px 16px">' + parts.join('') + '</div>';
  }

  openModal(`
    <div class="modal-header">
      <h2>Task Detail</h2>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body">
      <div style="background:${bg};border-radius:var(--radius);padding:12px 16px;margin-bottom:16px">
        <div style="font-weight:600;font-size:15px">${esc(target || task.task_id)}</div>
        <div class="text-sm text-muted" style="margin-top:4px">${esc(task.task_id)}</div>
        <div style="margin-top:8px"><span class="badge badge-${safeTaskStatus(task.status)}">${esc(task.status)}</span> <span class="text-sm text-muted">${esc(taskTypeName(task.type))}</span></div>
      </div>

      <div class="section-header"><h3>Progress</h3></div>
      <div class="progress-bar-wrap mb-2"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="progress-detail"><span>${pct}%${esc(getStageText(task.progress?.stage))}</span></div>

      <div class="section-header mt-4"><h3>Timeline</h3></div>
      <div class="card" style="padding:12px 16px">
        <div class="text-sm">Created: ${fmt(task.created_at)}</div>
        ${started ? '<div class="text-sm">Started: ' + started + '</div>' : ''}
        ${ended ? '<div class="text-sm">Ended: ' + ended + '</div>' : ''}
        ${dur ? '<div class="text-sm">Duration: ' + dur + '</div>' : ''}
      </div>

      ${resultHtml}

      ${task.error ? '<div class="section-header mt-4"><h3 style="color:var(--red)">Error</h3></div><div class="card" style="padding:12px 16px;color:var(--red)">' + esc(task.error) + '</div>' : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      ${task.status === 'queued' || task.status === 'running' ? '<button class="btn btn-danger btn-sm" onclick="closeModal();doCancelTask(\'' + jsEsc(task.task_id) + '\')">Cancel</button>' : ''}
      ${task.status === 'failed' || task.status === 'cancelled' ? '<button class="btn btn-primary btn-sm" onclick="closeModal();doRetryTask(\'' + jsEsc(task.task_id) + '\')">Retry</button>' : ''}
      ${task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled' ? '<button class="btn btn-danger btn-sm" onclick="closeModal();doDeleteTask(\'' + jsEsc(task.task_id) + '\')">Delete</button>' : ''}
    </div>`);
}

async function cancelAllQueued() {
  const queued = pageTasks.filter(t => t.status === 'queued').length;
  if (queued === 0) return toast('No queued tasks to cancel', 'info');
  if (!confirm('Cancel all ' + queued + ' queued tasks?')) return;
  try { const r = await ENDPOINTS.cancelQueued(); toast('Cancelled ' + (r.cancelled_count || 0) + ' tasks', 'info'); }
  catch(e) { toast(e.message, 'error'); }
}

// Quick download with Twitter URL parsing
async function handleQuickDownload() {
  if (_actionBusy) { toast('A download is already in progress, please wait', 'warning'); return; }
  const input = document.getElementById('quick-dl-input');
  if (!input) return;
  let value = input.value.trim();
  if (!value) return toast('Enter a Twitter username or URL', 'warning');

  // Parse list link: twitter.com/i/lists/123 or x.com/i/lists/123
  if (value.match(/https?:\/\/(?:twitter\.com|x\.com)\/i\/lists\/(\d+)/)) {
    _actionBusy = true;
    try {
      await ENDPOINTS.listDownload(value.match(/https?:\/\/(?:twitter\.com|x\.com)\/i\/lists\/(\d+)/)[1], { auto_follow: true });
      toast('List download task created', 'success');
      input.value = '';
    } catch(e) { toast(e.message, 'error'); }
    finally { _actionBusy = false; }
    return;
  }

  // Parse user link: twitter.com/username or x.com/username
  const userMatch = value.match(/https?:\/\/(?:twitter\.com|x\.com)\/([^/\s?]+)/);
  if (userMatch) {
    const pathPart = userMatch[1];
    const reserved = ['i','search','status','home','explore','notifications','messages','settings','compose','bookmarks','lists'];
    if (!reserved.includes(pathPart.toLowerCase())) {
      value = pathPart;
    }
  }

  // Strip @ prefix
  if (value.startsWith('@')) value = value.slice(1);
  if (!value) return toast('Could not extract username from URL', 'warning');

  _actionBusy = true;
  try {
    await ENDPOINTS.userDownload(value, { auto_follow: true });
    toast('Download task created for @' + value, 'success');
    input.value = '';
  } catch(e) { toast(e.message, 'error'); }
  finally { _actionBusy = false; }
}

/* ---- Data Page ---- */
function renderDataPage(container) {
  container.innerHTML = `
    <div class="section">
      <div class="section-header">
        <h2>Database Browser</h2>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="tabs" id="db-tabs">
            <button class="tab active" data-dbtab="users">Users</button>
            <button class="tab" data-dbtab="lists">Lists</button>
            <button class="tab" data-dbtab="entities">User Entities</button>
            <button class="tab" data-dbtab="list-entities">List Entities</button>
            <button class="tab" data-dbtab="links">Links</button>
            <button class="tab" data-dbtab="prevnames">Previous Names</button>
            <button class="tab" data-dbtab="stats">Stats</button>
          </div>
        </div>
        <div class="card-body" id="db-content">
          <div class="loading"><div class="spinner"></div> Loading...</div>
        </div>
      </div>
    </div>`;

  pageRenderers.data = renderDataPage;
  loadDBTab('users');

  // Tab switching for Data page
  const dbTabs = document.getElementById('db-tabs');
  if (dbTabs) {
    dbTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-dbtab]');
      if (!tab) return;
      document.querySelectorAll('[data-dbtab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadDBTab(tab.dataset.dbtab);
    });
  }
}

let dbPageState = { users:0, lists:0, entities:0, 'list-entities':0, links:0, prevnames:0 };
let dbSearchState = { users:'', lists:'', entities:'', 'list-entities':'', links:'', prevnames:'' };
let dbSortState = { users:{by:'id',order:'desc'}, lists:{by:'id',order:'desc'}, entities:{by:'id',order:'desc'}, 'list-entities':{by:'id',order:'desc'}, links:{by:'id',order:'desc'}, prevnames:{by:'record_date',order:'desc'} };
const DB_PAGE_SIZE = 20;

// 表头排序：切换 asc/desc 并重载当前页
function sortDB(tab, field) {
  const cur = dbSortState[tab] || { by: 'id', order: 'desc' };
  dbSortState[tab] = {
    by: field,
    order: (cur.by === field && cur.order === 'asc') ? 'desc' : 'asc'
  };
  loadDBTab(tab, 0);
}

// 排序表头：当前排序字段加箭头指示；键盘可达（Tab 聚焦 + Enter 排序）
function sortableTh(label, tab, field, sort) {
  const active = sort && sort.by === field;
  const arrow = active ? (sort.order === 'asc' ? ' &uarr;' : ' &darr;') : '';
  return `<th style="cursor:pointer" tabindex="0" role="button" onclick="sortDB('${tab}','${field}')" onkeydown="if(event.key==='Enter'){sortDB('${tab}','${field}')}">${label}${arrow}</th>`;
}

async function loadDBTab(tab, page) {
  const content = document.getElementById('db-content');
  if (!content) return;
  // 代际守卫：快速切 tab/翻页时丢弃旧请求的迟到响应，防止旧 tab 数据覆盖新 tab
  const seq = ++_dbTabSeq;
  const tabAtRequest = tab;
  if (page != null) dbPageState[tab] = page;
  else dbPageState[tab] = 0;
  const p = dbPageState[tab];
  const q = dbSearchState[tab] || '';
  const sort = dbSortState[tab] || { by: 'id', order: 'desc' };

  content.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';

  try {
    let html = '';
    switch (tab) {
      case 'users': html = await renderDBUsers(content, p, q, sort); break;
      case 'lists': html = await renderDBLists(content, p, q, sort); break;
      case 'entities': html = await renderDBEntities(content, p, q, 'user-entities', 'user_entities', sort); break;
      case 'list-entities': html = await renderDBEntities(content, p, q, 'list-entities', 'list_entities', sort); break;
      case 'links': html = await renderDBEntities(content, p, q, 'user-links', 'user_links', sort); break;
      case 'prevnames': html = await renderDBPrevNames(content, p, q, sort); break;
      case 'stats': html = await renderDBStats(content); break;
    }
    // 响应已过期（期间切换了 tab/发起了新请求）→ 丢弃，不覆盖当前内容
    if (seq !== _dbTabSeq || tabAtRequest !== currentDBTab()) return;
    content.innerHTML = html;
  } catch(e) {
    if (seq !== _dbTabSeq) return;
    content.innerHTML = '<div class="empty-state"><p>Error loading data: ' + esc(e.message) + '</p></div>';
  }
}

function currentDBTab() {
  const active = document.querySelector('#db-tabs .tab.active');
  return active ? active.dataset.dbtab : 'users';
}

async function renderDBUsers(content, page, search, sort) {
  const params = { page: page + 1, pageSize: DB_PAGE_SIZE };
  if (search) params.q = search;
  if (sort) { params.sortBy = sort.by; params.sortOrder = sort.order; }
  const r = await ENDPOINTS.dbUsers(params);
  const users = r.data || r || [];
  const total = r.total || users.length;
  const totalPages = r.totalPages || 1;

  return `
    <div class="filter-bar">
      <input type="text" id="db-search-input" placeholder="Search screen name..." value="${esc(search)}">
      <button class="btn btn-primary btn-sm" onclick="dbSearch('users')">Search</button>
      <button class="btn btn-ghost btn-sm" onclick="dbSearchClear('users')">Clear</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${sortableTh('ID', 'users', 'id', sort)}${sortableTh('Screen Name', 'users', 'screen_name', sort)}${sortableTh('Display Name', 'users', 'name', sort)}<th>Protected</th><th>Friends</th><th>Accessible</th><th>Actions</th></tr></thead>
        <tbody>${users.map(u => `<tr>
          <td><span class="mono">${esc(u.id||'')}</span></td>
          <td>${esc(u.screen_name||'')}</td>
          <td>${esc(u.name||'')}</td>
          <td>${u.protected ? 'Yes' : 'No'}</td>
          <td>${u.friends_count||0}</td>
          <td>${u.is_accessible ? 'Yes' : 'No'}</td>
          <td><button class="btn btn-xs btn-ghost" onclick="viewUserDetail('${jsEsc(u.id)}')">View</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    ${renderPagination(page, totalPages, total, 'users')}`;
}

async function renderDBLists(content, page, search, sort) {
  const params = { page: page + 1, pageSize: DB_PAGE_SIZE };
  if (search) params.q = search;
  if (sort) { params.sortBy = sort.by; params.sortOrder = sort.order; }
  const r = await ENDPOINTS.dbLists(params);
  const lists = r.data || r || [];
  const total = r.total || lists.length;
  const totalPages = r.totalPages || 1;

  return `
    <div class="filter-bar">
      <input type="text" id="db-search-input" placeholder="Search..." value="${esc(search)}">
      <button class="btn btn-primary btn-sm" onclick="dbSearch('lists')">Search</button>
      <button class="btn btn-ghost btn-sm" onclick="dbSearchClear('lists')">Clear</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${sortableTh('ID', 'lists', 'id', sort)}${sortableTh('Name', 'lists', 'name', sort)}${sortableTh('Owner ID', 'lists', 'owner_id', sort)}<th>Actions</th></tr></thead>
        <tbody>${lists.map(l => `<tr>
          <td><span class="mono">${esc(l.id||'')}</span></td>
          <td>${esc(l.name||'')}</td>
          <td>${esc(l.owner_user_id||'')}</td>
          <td><button class="btn btn-xs btn-ghost" onclick="viewListDetail('${jsEsc(l.id)}')">View</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    ${renderPagination(page, totalPages, total, 'lists')}`;
}

async function renderDBEntities(content, page, search, ep, label, sort) {
  const params = { page: page + 1, pageSize: DB_PAGE_SIZE };
  if (search) params.q = search;
  if (sort) { params.sortBy = sort.by; params.sortOrder = sort.order; }
  const r = await ENDPOINTS['db' + ep.charAt(0).toUpperCase() + ep.slice(1).replace(/-([a-z])/g, (_,c) => c.toUpperCase()) + 'All'](params);
  const items = r.data || r || [];
  const total = r.total || items.length;
  const totalPages = r.totalPages || 1;

  const cols = label === 'user_entities'
    ? `${sortableTh('ID', ep, 'id', sort)}${sortableTh('User ID', ep, 'user_id', sort)}${sortableTh('Name', ep, 'name', sort)}<th>Parent Dir</th>${sortableTh('Media', ep, 'media_count', sort)}<th>Latest Release</th><th>Actions</th>`
    : label === 'list_entities'
    ? `${sortableTh('ID', ep, 'id', sort)}${sortableTh('List ID', ep, 'lst_id', sort)}${sortableTh('Name', ep, 'name', sort)}<th>Parent Dir</th><th>List Name</th><th>Actions</th>`
    : `${sortableTh('ID', ep, 'id', sort)}${sortableTh('User ID', ep, 'user_id', sort)}${sortableTh('Name', ep, 'name', sort)}<th>Parent Entity</th><th>Actions</th>`;

  const rows = items.map(i => {
    const actions = `<td><button class="btn btn-xs btn-ghost" onclick="viewEntityDetail('${ep}', '${jsEsc(i.id)}')">View</button> <button class="btn btn-xs btn-ghost" onclick="if(confirm('Delete entity ${jsEsc(i.id)}?')){deleteEntity('${ep}', '${jsEsc(i.id)}')}">Delete</button></td>`;
    if (label === 'user_entities')
      return `<tr><td><span class="mono">${esc(i.id||'')}</span></td><td>${esc(i.user_id||'')}</td><td>${esc(i.name||'')}</td><td>${esc(i.parent_dir||'')}</td><td>${i.media_count||0}</td><td class="text-sm">${esc(i.latest_release_time||'')}</td>${actions}</tr>`;
    else if (label === 'list_entities')
      return `<tr><td><span class="mono">${esc(i.id||'')}</span></td><td>${esc(i.lst_id||'')}</td><td>${esc(i.name||'')}</td><td>${esc(i.parent_dir||'')}</td><td>${esc(i.list_name||'')}</td>${actions}</tr>`;
    else
      return `<tr><td><span class="mono">${esc(i.id||'')}</span></td><td>${esc(i.user_id||'')}</td><td>${esc(i.name||'')}</td><td>${esc(i.parent_lst_entity_name||i.parent_lst_entity_id||'')}</td>${actions}</tr>`;
  }).join('');

  return `
    <div class="filter-bar">
      <input type="text" id="db-search-input" placeholder="Search..." value="${esc(search)}">
      <button class="btn btn-primary btn-sm" onclick="dbSearch('${ep}')">Search</button>
      <button class="btn btn-ghost btn-sm" onclick="dbSearchClear('${ep}')">Clear</button>
    </div>
    <div class="table-wrap">
      <table><thead><tr>${cols}</tr></thead><tbody>${rows || '<tr><td colspan="8"><div class="empty-state"><p>No records found</p></div></td></tr>'}</tbody></table>
    </div>
    ${renderPagination(page, totalPages, total, ep)}`;
}

// 实体/链接详情 + 编辑 + 删除（user-entities / list-entities / user-links）
async function viewEntityDetail(ep, id) {
  const getters = {
    'user-entities': ENDPOINTS.dbUserEntity,
    'list-entities': ENDPOINTS.dbListEntity,
    'user-links': ENDPOINTS.dbUserLink
  };
  const labels = {
    'user-entities': 'User Entity',
    'list-entities': 'List Entity',
    'user-links': 'User Link'
  };
  // 各类型的可编辑字段（对齐后端 PATCH 契约）
  const editFields = {
    'user-entities': [
      { key: 'name', label: 'Name' },
      { key: 'parent_dir', label: 'Parent Dir' },
      { key: 'media_count', label: 'Media Count', numeric: true },
      { key: 'latest_release_time', label: 'Latest Release Time' }
    ],
    'list-entities': [
      { key: 'name', label: 'Name' },
      { key: 'parent_dir', label: 'Parent Dir' }
    ],
    'user-links': [
      { key: 'name', label: 'Name' }
    ]
  };
  const updaters = {
    'user-entities': ENDPOINTS.dbUserEntityUpdate,
    'list-entities': ENDPOINTS.dbListEntityUpdate,
    'user-links': ENDPOINTS.dbUserLinkUpdate
  };
  try {
    const item = await getters[ep](id);
    if (!item) return toast('Not found', 'error');
    const readonlyFields = Object.entries(item).filter(([k]) => !(editFields[ep] || []).some(f => f.key === k))
      .map(([k, v]) =>
        `<div class="form-row"><div class="form-group"><label>${esc(k)}</label><code>${esc(v == null ? '-' : String(v))}</code></div></div>`
      ).join('');
    const inputs = (editFields[ep] || []).map(f =>
      `<div class="form-group"><label>${esc(f.label)}</label><input type="${f.numeric ? 'number' : 'text'}" id="ent-edit-${esc(f.key)}" value="${esc(item[f.key] == null ? '' : String(item[f.key]))}"></div>`
    ).join('');
    openModal(`
      <div class="modal-header"><h2>${labels[ep]}: ${esc(item.name || item.id)}</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div class="form-row">${inputs}</div>
        ${readonlyFields}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="saveEntityEdit('${ep}', '${jsEsc(id)}')">Save</button>
        <button class="btn btn-danger" onclick="if(confirm('Delete ${labels[ep]} ${jsEsc(item.name || item.id)}?')){deleteEntity('${ep}', '${jsEsc(id)}').then(()=>closeModal())}">Delete</button>
      </div>`);
  } catch(e) { toast(e.message, 'error'); }
}

// 保存实体/链接编辑（仅提交可编辑字段，PATCH 后端契约）
async function saveEntityEdit(ep, id) {
  const updaters = {
    'user-entities': ENDPOINTS.dbUserEntityUpdate,
    'list-entities': ENDPOINTS.dbListEntityUpdate,
    'user-links': ENDPOINTS.dbUserLinkUpdate
  };
  const editFields = {
    'user-entities': ['name', 'parent_dir', 'media_count', 'latest_release_time'],
    'list-entities': ['name', 'parent_dir'],
    'user-links': ['name']
  };
  const data = {};
  for (const key of (editFields[ep] || [])) {
    const el = document.getElementById('ent-edit-' + key);
    if (!el) continue;
    data[key] = key === 'media_count' ? (el.value === '' ? undefined : Number(el.value)) : el.value;
  }
  closeModal();
  try {
    await updaters[ep](id, data);
    toast('Saved', 'success');
    loadDBTab(currentDBTab());
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteEntity(ep, id) {
  const deleters = {
    'user-entities': ENDPOINTS.dbUserEntityDelete,
    'list-entities': ENDPOINTS.dbListEntityDelete,
    'user-links': ENDPOINTS.dbUserLinkDelete
  };
  try {
    await deleters[ep](id);
    toast('Deleted', 'success');
    loadDBTab(currentDBTab());
  } catch(e) { toast(e.message, 'error'); }
}

async function renderDBPrevNames(content, page, search, sort) {
  const params = { page: page + 1, pageSize: DB_PAGE_SIZE };
  if (search) params.q = search;
  if (sort) { params.sortBy = sort.by; params.sortOrder = sort.order; }
  const r = await ENDPOINTS.dbPrevNamesAll(params);
  const items = r.data || r || [];
  const total = r.total || items.length;
  const totalPages = r.totalPages || 1;

  return `
    <div class="filter-bar">
      <input type="text" id="db-search-input" placeholder="Search..." value="${esc(search)}">
      <button class="btn btn-primary btn-sm" onclick="dbSearch('prevnames')">Search</button>
      <button class="btn btn-ghost btn-sm" onclick="dbSearchClear('prevnames')">Clear</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${sortableTh('ID', 'prevnames', 'id', sort)}${sortableTh('User ID', 'prevnames', 'user_id', sort)}${sortableTh('Screen Name', 'prevnames', 'screen_name', sort)}${sortableTh('Name', 'prevnames', 'name', sort)}${sortableTh('Date', 'prevnames', 'record_date', sort)}<th>Current Name</th></tr></thead>
        <tbody>${items.map(i => `<tr><td><span class="mono">${esc(i.id||'')}</span></td><td>${esc(i.user_id||'')}</td><td>${esc(i.screen_name||'')}</td><td>${esc(i.name||'')}</td><td class="text-sm">${esc(i.record_date||'')}</td><td>${i.current_screen_name ? esc(i.current_screen_name) : '-'}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    ${renderPagination(page, totalPages, total, 'prevnames')}`;
}

async function renderDBStats(content) {
  const s = await ENDPOINTS.dbStats();
  const items = [
    ['Total Users', s.users || 0],
    ['Total Lists', s.lists || 0],
    ['User Entities', s.user_entities || 0],
    ['List Entities', s.lst_entities || 0],
    ['Links', s.user_links || 0],
    ['Previous Names', s.user_previous_names || 0],
  ];
  return `<div class="stats-grid">${items.map(([k,v]) => `<div class="stat-card total"><div class="stat-value">${v}</div><div class="stat-label">${k}</div></div>`).join('')}</div>`;
}

function renderPagination(page, totalPages, total, tabId) {
  if (totalPages <= 1) return '';
  let html = '<div class="pagination">';
  html += `<button class="btn btn-xs btn-ghost" ${page === 0 ? 'disabled' : ''} onclick="loadDBTab('${tabId}', 0)">First</button>`;
  html += `<button class="btn btn-xs btn-ghost" ${page === 0 ? 'disabled' : ''} onclick="loadDBTab('${tabId}', ${page - 1})">Prev</button>`;
  // Page numbers with ellipsis
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    if (page < 4) {
      pages.push(0, 1, 2, 3, -1, totalPages - 1);
    } else if (page > totalPages - 5) {
      pages.push(0, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1);
    } else {
      pages.push(0, -1, page - 1, page, page + 1, -1, totalPages - 1);
    }
  }
  pages.forEach(p => {
    if (p === -1) { html += '<span class="pagination-dots">...</span>'; return; }
    html += `<button class="btn btn-xs ${p === page ? 'btn-primary' : 'btn-ghost'}" onclick="loadDBTab('${tabId}', ${p})">${p + 1}</button>`;
  });
  html += `<button class="btn btn-xs btn-ghost" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="loadDBTab('${tabId}', ${page + 1})">Next</button>`;
  html += `<button class="btn btn-xs btn-ghost" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="loadDBTab('${tabId}', ${totalPages - 1})">Last</button>`;
  html += ` <span class="pagination-info">Page ${page + 1}/${totalPages} (${total})</span>`;
  html += '</div>';
  return html;
}

window.dbSearch = (tab) => {
  const input = document.getElementById('db-search-input');
  if (input) dbSearchState[tab] = input.value;
  loadDBTab(tab, 0);
};
window.dbSearchClear = (tab) => {
  dbSearchState[tab] = '';
  loadDBTab(tab, 0);
};

async function viewUserDetail(id) {
  try {
    const [u, prev, ents, links] = await Promise.all([
      ENDPOINTS.dbUser(id),
      ENDPOINTS.dbUserPrevNames(id),
      ENDPOINTS.dbUserEntities(id),
      ENDPOINTS.dbUserLinks(id)
    ]);
    if (!u) return toast('User not found', 'error');
    // 后端快捷端点返回 PaginatedResponse {data,total,...}，取 .data 数组
    const prevArr = (prev && prev.data) || [];
    const entsArr = (ents && ents.data) || [];
    const linksArr = (links && links.data) || [];

    openModal(`
      <div class="modal-header"><h2>User: ${esc(u.screen_name)}</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label>ID</label><code>${esc(u.id)}</code></div>
          <div class="form-group"><label>Protected</label><code>${u.protected ? 'Yes' : 'No'}</code></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Screen Name</label><input type="text" id="db-edit-screenname" value="${esc(u.screen_name)}"></div>
          <div class="form-group"><label>Name</label><input type="text" id="db-edit-name" value="${esc(u.name)}"></div>
        </div>
        ${prevArr.length ? `<div class="section-header mt-4"><h3>Previous Names (${prevArr.length})</h3></div>
        <table><thead><tr><th>Screen Name</th><th>Name</th><th>Date</th></tr></thead><tbody>${prevArr.map(p => `<tr><td>${esc(p.screen_name)}</td><td>${esc(p.name)}</td><td class="text-sm">${esc(p.record_date)}</td></tr>`).join('')}</tbody></table>` : ''}
        ${entsArr.length ? `<div class="section-header mt-4"><h3>Entities (${entsArr.length})</h3></div>
        <table><thead><tr><th>Name</th><th>Parent Dir</th><th>Media</th></tr></thead><tbody>${entsArr.map(e => `<tr><td>${esc(e.name)}</td><td>${esc(e.parent_dir)}</td><td>${e.media_count||0}</td></tr>`).join('')}</tbody></table>` : ''}
        ${linksArr.length ? `<div class="section-header mt-4"><h3>Links (${linksArr.length})</h3></div>
        <table><thead><tr><th>Name</th><th>Parent Entity</th></tr></thead><tbody>${linksArr.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.parent_lst_entity_name||l.parent_lst_entity_id||'-')}</td></tr>`).join('')}</tbody></table>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="saveUserEdit('${jsEsc(u.id)}')">Save</button>
        <button class="btn btn-danger" onclick="if(confirm('Delete user ${jsEsc(u.screen_name)}?')){ENDPOINTS.dbUserDelete('${jsEsc(u.id)}').then(()=>{closeModal();loadDBTab(currentDBTab());}).catch(e=>toast(e.message,'error'))}">Delete</button>
      </div>`);
  } catch(e) { toast(e.message, 'error'); }
}

async function saveUserEdit(id) {
  const screen_name = document.getElementById('db-edit-screenname').value.trim();
  const name = document.getElementById('db-edit-name').value.trim();
  closeModal();
  try {
    await ENDPOINTS.dbUserUpdate(id, { screen_name, name });
    toast('User updated', 'success');
    loadDBTab(currentDBTab());
  } catch(e) { toast(e.message, 'error'); }
}

async function viewListDetail(id) {
  try {
    const l = await ENDPOINTS.dbList(id);
    const ents = await ENDPOINTS.dbListEntities(id);
    // 后端快捷端点返回 PaginatedResponse {data,total,...}，取 .data 数组
    const entsArr = (ents && ents.data) || [];

    openModal(`
      <div class="modal-header"><h2>List: ${esc(l.name)}</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label>ID</label><code>${esc(l.id)}</code></div>
          <div class="form-group"><label>Owner ID</label><code>${esc(l.owner_user_id)}</code></div>
        </div>
        <div class="form-group"><label>Name</label><input type="text" id="db-edit-listname" value="${esc(l.name)}"></div>
        ${entsArr.length ? `<div class="section-header mt-4"><h3>Entities (${entsArr.length})</h3></div>
        <table><thead><tr><th>Name</th><th>Parent Dir</th></tr></thead><tbody>${entsArr.map(e => `<tr><td>${esc(e.name)}</td><td>${esc(e.parent_dir)}</td></tr>`).join('')}</tbody></table>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="saveListEdit('${jsEsc(l.id)}')">Save</button>
        <button class="btn btn-danger" onclick="if(confirm('Delete list ${jsEsc(l.name)}?')){ENDPOINTS.dbListDelete('${jsEsc(l.id)}').then(()=>{closeModal();loadDBTab(currentDBTab());}).catch(e=>toast(e.message,'error'))}">Delete</button>
      </div>`);
  } catch(e) { toast(e.message, 'error'); }
}

async function saveListEdit(id) {
  const name = document.getElementById('db-edit-listname').value.trim();
  closeModal();
  try {
    await ENDPOINTS.dbListUpdate(id, { name });
    toast('List updated', 'success');
    loadDBTab(currentDBTab());
  } catch(e) { toast(e.message, 'error'); }
}

/* ---- Schedules Page ---- */
function renderSchedulesPage(container) {
  container.innerHTML = `
    <div class="section">
      <div class="section-header">
        <h2>Schedules</h2>
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm" onclick="showNewScheduleForm()">+ Add</button>
          <button class="btn btn-ghost btn-sm" onclick="showSchedulesRawEditor()">Raw YAML</button>
          <button class="btn btn-ghost btn-sm" onclick="triggerAllSchedules()">Trigger All</button>
          <button class="btn btn-ghost btn-sm" onclick="reloadSchedules()">Reload</button>
        </div>
      </div>
      <div class="stats-grid" id="sched-stats"></div>
      <div id="sched-warning" class="hidden"></div>
      <div id="sched-list"></div>
    </div>`;

  pageRenderers.schedules = renderSchedulesPage;
  updateSchedulesView();
  loadSchedules();
}

async function loadSchedules() {
  try {
    const r = await ENDPOINTS.schedules();
    _lastSchedulesData = { scheduler_running: r.scheduler_running, entries: r.entries || [] };
    updateSchedulesView();
  } catch(e) { toast(e.message, 'error'); }
}

function updateSchedulesView() {
  const d = _lastSchedulesData;
  if (!d) return;

  const entries = d.entries || [];
  const running = d.scheduler_running;

  // ScheduleStatus wraps ScheduleEntry in .entry; flatten for templates
  const flatEntries = entries.map(e => ({
    ...(e.entry || e),
    last_run_at: e.last_run_at || e.last_run,
    next_run_at: e.next_run_at || e.next_run,
    last_error: e.last_error,
    consecutive_failures: e.consecutive_failures || 0
  }));

  const stats = {
    total: flatEntries.length,
    enabled: flatEntries.filter(e => e.enabled).length,
    disabled: flatEntries.filter(e => !e.enabled).length,
    failures: entries.reduce((s, e) => s + (e.consecutive_failures || 0), 0)
  };

  const statsEl = document.getElementById('sched-stats');
  if (statsEl) {
    statsEl.innerHTML = [
      ['Total', stats.total, 'total'],
      ['Enabled', stats.enabled, 'completed'],
      ['Disabled', stats.disabled, 'cancelled'],
      ['Failures', stats.failures, 'failed']
    ].map(([k, v, cls]) => `<div class="stat-card ${cls}"><div class="stat-value">${v}</div><div class="stat-label">${k}</div></div>`).join('');
  }

  // Warning when scheduler not running
  const warnEl = document.getElementById('sched-warning');
  if (warnEl) {
    if (!running) {
      warnEl.className = 'alert alert-warning';
      warnEl.innerHTML = 'Scheduler is not running - scheduled downloads will not execute automatically.';
    } else {
      warnEl.className = 'hidden';
    }
  }

  const listEl = document.getElementById('sched-list');
  if (!listEl) return;

  if (!flatEntries.length) {
    listEl.innerHTML = '<div class="empty-state"><p>No schedules configured.</p></div>';
    return;
  }

  listEl.innerHTML = flatEntries.map(e => {
    // 手写 yaml 条目可能无 id：无 id 时后端无法定位，禁用全部操作并提示
    const hasId = !!(e.id);
    const opDisabled = hasId ? '' : ' disabled title="Entry has no ID (edit schedules.yaml to add one)"';
    return `
    <div class="schedule-item${e.consecutive_failures > 0 ? ' has-failure' : ''}">
      <div class="schedule-item-header">
        <div class="schedule-item-title">
          <span class="schedule-status-dot ${e.enabled ? 'enabled' : 'disabled'}"></span>
          <strong>${esc(e.name || e.target || 'Unnamed')}</strong>
          <span class="badge badge-queued">${esc(e.type)}</span>
          ${e.consecutive_failures > 0 ? `<span class="badge badge-failed">${e.consecutive_failures} failures</span>` : ''}
          ${!hasId ? '<span class="badge badge-failed" title="Missing id field">no id</span>' : ''}
        </div>
        <div class="flex gap-2">
          <label class="toggle"${opDisabled}>
            <input type="checkbox" name="sched-toggle-${esc(e.id)}" ${e.enabled ? 'checked' : ''} onchange="toggleSchedule('${jsEsc(e.id)}', this.checked)"${hasId ? '' : ' disabled'}>
            <span class="toggle-slider"></span>
          </label>
          <button class="btn btn-xs btn-ghost" onclick="triggerSchedule('${jsEsc(e.id)}')" title="Run now"${opDisabled}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <button class="btn btn-xs btn-ghost" onclick="editSchedule('${jsEsc(e.id)}')" title="Edit"${opDisabled}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-xs btn-ghost" onclick="deleteSchedule('${jsEsc(e.id)}')" title="Delete"${opDisabled}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="schedule-meta">
        <span>Schedule: ${esc(e.schedule)}</span>
        <span> &middot; ${e.type === 'mixed' ? ('Users: ' + (e.users||[]).length + ', Lists: ' + (e.lists||[]).length + ', Following: ' + (e.following_names||[]).length) : 'Target: ' + esc(e.target)}</span>
        ${e.last_run_at ? '<span> &middot; Last: ' + relativeTime(e.last_run_at) + '</span>' : ''}
        ${e.next_run_at ? '<span> &middot; Next: ' + relativeTime(e.next_run_at) + '</span>' : ''}
        ${e.last_error ? '<span class="fail"> &middot; Error: ' + esc(e.last_error) + '</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

// Raw YAML 调度编辑器：直接编辑 schedules.yaml 全文
async function showSchedulesRawEditor() {
  let content = '';
  try {
    const d = await ENDPOINTS.schedulesRaw();
    content = d.content || '';
  } catch(e) {
    return toast(e.message, 'error');
  }
  openModal(`
    <div class="modal-header"><h2>Schedules YAML</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
    <div class="modal-body">
      <textarea id="sched-raw-content" rows="18" style="width:100%;font-family:monospace;font-size:12px" spellcheck="false">${esc(content)}</textarea>
      <div class="text-sm text-muted">Save reloads the scheduler with the new configuration.</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveSchedulesRawEditor()">Save &amp; Reload</button>
    </div>`);
}

async function saveSchedulesRawEditor() {
  const content = document.getElementById('sched-raw-content').value;
  closeModal();
  try {
    await ENDPOINTS.saveSchedulesRaw(content);
    toast('Schedules saved & reloaded', 'success');
    loadSchedules();
  } catch(e) { toast(e.message, 'error'); }
}

function showNewScheduleForm() {
  openModal(`
    <div class="modal-header"><h2>Add Schedule</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
    <div class="modal-body">
      <div class="form-group">
        <label>Type</label>
        <select id="sched-type" onchange="toggleSchedTargetFields()">
          <option value="user">User</option>
          <option value="list">List</option>
          <option value="following">Following</option>
          <option value="mixed">Mixed</option>
        </select>
      </div>
      <div id="sched-target-fields">
        <div class="form-group" id="sched-target-single">
          <label>Target</label>
          <input type="text" id="sched-target" placeholder="screen_name or list_id">
        </div>
        <div class="form-group hidden" id="sched-target-mixed">
          <label>Users (one per line)</label>
          <textarea id="sched-mixed-users" rows="2" placeholder="elonmusk"></textarea>
        </div>
        <div class="form-group hidden" id="sched-target-mixed-lists">
          <label>Lists (one per line)</label>
          <textarea id="sched-mixed-lists" rows="2" placeholder="1234567890"></textarea>
        </div>
        <div class="form-group hidden" id="sched-target-mixed-foll">
          <label>Following (one per line)</label>
          <textarea id="sched-mixed-foll" rows="2" placeholder="jack"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="sched-name" placeholder="My Schedule">
      </div>
      <div class="form-group">
        <label>Schedule</label>
        <input type="text" id="sched-schedule" placeholder="daily:08:00,20:00 or interval:4h">
        <div class="hint">Format: "daily:HH:MM,HH:MM" or "interval:1h30m"</div>
      </div>
      <div class="form-row">
        <label class="checkbox-label"><input type="checkbox" id="sched-runonstart"> Run on start</label>
      </div>
      <div class="form-row">
        <label class="checkbox-label"><input type="checkbox" id="sched-autofollow"> Auto-follow</label>
        <label class="checkbox-label"><input type="checkbox" id="sched-followmembers"> Follow members</label>
        <label class="checkbox-label"><input type="checkbox" id="sched-skipprofile"> Skip profile</label>
        <label class="checkbox-label"><input type="checkbox" id="sched-noretry"> No retry</label>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewSchedule()">Create</button>
    </div>`);
}

function toggleSchedTargetFields() {
  const type = document.getElementById('sched-type').value;
  document.getElementById('sched-target-single').classList.toggle('hidden', type === 'mixed');
  document.getElementById('sched-target-mixed').classList.toggle('hidden', type !== 'mixed');
  document.getElementById('sched-target-mixed-lists').classList.toggle('hidden', type !== 'mixed');
  document.getElementById('sched-target-mixed-foll').classList.toggle('hidden', type !== 'mixed');
}

async function saveNewSchedule() {
  const type = document.getElementById('sched-type').value;
  let schedule = document.getElementById('sched-schedule').value.trim();
  if (!schedule) return toast('Schedule pattern required', 'warning');
  // 规范化：兼容 "daily 08:00" / "interval 4h" 空格写法 → "daily:08:00" / "interval:4h"
  schedule = schedule.replace(/^(daily|interval)\s+/, '$1:');
  const name = document.getElementById('sched-name').value.trim();
  const runOnStart = document.getElementById('sched-runonstart').checked;
  // 先读全部控件值并校验，再关弹窗（弹窗关闭后 DOM 已移除）
  const payload = {
    type, name, schedule, enabled: true, run_on_start: runOnStart,
    auto_follow: document.getElementById('sched-autofollow').checked,
    follow_members: document.getElementById('sched-followmembers').checked,
    skip_profile: document.getElementById('sched-skipprofile').checked,
    no_retry: document.getElementById('sched-noretry').checked
  };
  if (type === 'mixed') {
    const users = document.getElementById('sched-mixed-users').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
    const lists = document.getElementById('sched-mixed-lists').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
    const foll = document.getElementById('sched-mixed-foll').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
    if (!users.length && !lists.length && !foll.length) return toast('Enter at least one target', 'warning');
    payload.users = users; payload.lists = lists; payload.following_names = foll;
  } else {
    const target = document.getElementById('sched-target').value.trim();
    if (!target) return toast('Target required', 'warning');
    payload.target = target;
  }
  closeModal();
  try {
    await ENDPOINTS.createSchedule(payload);
    toast('Schedule created', 'success');
    loadSchedules();
  } catch(e) { toast(e.message, 'error'); }
}

async function toggleSchedule(id, enabled) {
  try { await ENDPOINTS.setScheduleEnabled(id, enabled); loadSchedules(); }
  catch(e) { toast(e.message, 'error'); loadSchedules(); } // 失败回滚到服务器真实状态（乐观切换的补偿）
}

async function triggerSchedule(id) {
  try { const r = await ENDPOINTS.triggerSchedule(id); toast('Triggered: ' + r.task_id, 'success'); }
  catch(e) { toast(e.message, 'error'); }
}

async function triggerAllSchedules() {
  if (!confirm('Trigger all enabled schedules?')) return;
  const btn = document.querySelector('[onclick="triggerAllSchedules()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Triggering...'; }
  try {
    const r = await ENDPOINTS.triggerAll();
    if (r.failed > 0) {
      const errMsgs = (r.results || []).filter(x => x.error).map(x => x.entry_id + ': ' + x.error).join('; ');
      toast('Triggered ' + r.succeeded + '/' + r.total + ' schedules (' + r.failed + ' failed): ' + errMsgs, 'warning');
    } else {
      toast('All ' + r.succeeded + ' schedules triggered successfully', 'success');
    }
  } catch(e) { toast(e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Trigger All'; } }
}

async function reloadSchedules() {
  try { await ENDPOINTS.reloadSchedules(); toast('Schedules reloaded', 'success'); loadSchedules(); }
  catch(e) { toast(e.message, 'error'); }
}

async function editSchedule(id) {
  const d = _lastSchedulesData;
  const entry = d && d.entries ? d.entries.find(e => (e.entry && e.entry.id === id) || e.id === id) : null;
  if (!entry) return toast('Schedule not found', 'error');
  const ent = entry.entry || entry;

  openModal(`
    <div class="modal-header"><h2>Edit Schedule</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
    <div class="modal-body">
      <div class="form-group">
        <label>Type</label>
        <select id="sched-edit-type" onchange="toggleEditSchedTargetFields()">
          <option value="user" ${ent.type === 'user' ? 'selected' : ''}>User</option>
          <option value="list" ${ent.type === 'list' ? 'selected' : ''}>List</option>
          <option value="following" ${ent.type === 'following' ? 'selected' : ''}>Following</option>
          <option value="mixed" ${ent.type === 'mixed' ? 'selected' : ''}>Mixed</option>
        </select>
      </div>
      <div id="sched-edit-target-fields">
        <div class="form-group" id="sched-edit-target-single" ${ent.type === 'mixed' ? 'style="display:none"' : ''}>
          <label>Target</label>
          <input type="text" id="sched-edit-target" value="${esc(ent.target||'')}">
        </div>
        <div class="form-group" id="sched-edit-mixed-users-group" ${ent.type !== 'mixed' ? 'style="display:none"' : ''}>
          <label>Users (one per line)</label>
          <textarea id="sched-edit-mixed-users" rows="2">${esc((ent.users||[]).join('\n'))}</textarea>
        </div>
        <div class="form-group" id="sched-edit-mixed-lists-group" ${ent.type !== 'mixed' ? 'style="display:none"' : ''}>
          <label>Lists (one per line)</label>
          <textarea id="sched-edit-mixed-lists" rows="2">${esc((ent.lists||[]).join('\n'))}</textarea>
        </div>
        <div class="form-group" id="sched-edit-mixed-foll-group" ${ent.type !== 'mixed' ? 'style="display:none"' : ''}>
          <label>Following (one per line)</label>
          <textarea id="sched-edit-mixed-foll" rows="2">${esc((ent.following_names||[]).join('\n'))}</textarea>
        </div>
      </div>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="sched-edit-name" value="${esc(ent.name||'')}">
      </div>
      <div class="form-group">
        <label>Schedule</label>
        <input type="text" id="sched-edit-schedule" value="${esc(ent.schedule||'')}">
      </div>
      <label class="checkbox-label"><input type="checkbox" id="sched-edit-runonstart" ${ent.run_on_start ? 'checked' : ''}> Run on start</label>
      <div class="form-row">
        <label class="checkbox-label"><input type="checkbox" id="sched-edit-autofollow" ${ent.auto_follow ? 'checked' : ''}> Auto-follow</label>
        <label class="checkbox-label"><input type="checkbox" id="sched-edit-followmembers" ${ent.follow_members ? 'checked' : ''}> Follow members</label>
        <label class="checkbox-label"><input type="checkbox" id="sched-edit-skipprofile" ${ent.skip_profile ? 'checked' : ''}> Skip profile</label>
        <label class="checkbox-label"><input type="checkbox" id="sched-edit-noretry" ${ent.no_retry ? 'checked' : ''}> No retry</label>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveScheduleEdit('${jsEsc(id)}')">Save</button>
    </div>`);
}

async function saveScheduleEdit(id) {
  const type = document.getElementById('sched-edit-type').value;
  const name = document.getElementById('sched-edit-name').value.trim();
  let schedule = document.getElementById('sched-edit-schedule').value.trim();
  if (!schedule) return toast('Schedule pattern required', 'warning');
  // 规范化：兼容 "daily 08:00" / "interval 4h" 空格写法 → "daily:08:00" / "interval:4h"
  schedule = schedule.replace(/^(daily|interval)\s+/, '$1:');
  const runOnStart = document.getElementById('sched-edit-runonstart').checked;
  // 先读全部控件值并校验，再关弹窗（弹窗关闭后 DOM 已移除）
  const payload = {
    type, name, schedule, run_on_start: runOnStart,
    auto_follow: document.getElementById('sched-edit-autofollow').checked,
    follow_members: document.getElementById('sched-edit-followmembers').checked,
    skip_profile: document.getElementById('sched-edit-skipprofile').checked,
    no_retry: document.getElementById('sched-edit-noretry').checked
  };
  if (type === 'mixed') {
    const users = document.getElementById('sched-edit-mixed-users').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
    const lists = document.getElementById('sched-edit-mixed-lists').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
    const foll = document.getElementById('sched-edit-mixed-foll').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
    if (!users.length && !lists.length && !foll.length) return toast('Enter at least one target', 'warning');
    payload.users = users; payload.lists = lists; payload.following_names = foll;
  } else {
    const target = document.getElementById('sched-edit-target').value.trim();
    if (!target) return toast('Target required', 'warning');
    payload.target = target;
  }
  closeModal();
  try {
    await ENDPOINTS.updateSchedule(id, payload);
    toast('Schedule updated', 'success');
    loadSchedules();
  } catch(e) { toast(e.message, 'error'); }
}

function toggleEditSchedTargetFields() {
  const type = document.getElementById('sched-edit-type').value;
  document.getElementById('sched-edit-target-single').style.display = type === 'mixed' ? 'none' : '';
  document.getElementById('sched-edit-target-mixed').style.display = type !== 'mixed' ? 'none' : '';
  document.getElementById('sched-edit-mixed-users-group').style.display = type !== 'mixed' ? 'none' : '';
  document.getElementById('sched-edit-mixed-lists-group').style.display = type !== 'mixed' ? 'none' : '';
  document.getElementById('sched-edit-mixed-foll-group').style.display = type !== 'mixed' ? 'none' : '';
}

async function deleteSchedule(id) {
  if (!confirm('Delete this schedule?')) return;
  try { await ENDPOINTS.deleteSchedule(id); toast('Schedule deleted', 'info'); loadSchedules(); }
  catch(e) { toast(e.message, 'error'); }
}

/* ---- System Page ---- */
function renderSystemPage(container) {
  container.innerHTML = `
    <div class="section">
      <div class="section-header"><h2>System</h2></div>
      <div class="stats-grid" id="sys-queue"></div>
    </div>

    <div class="section">
      <div class="section-header"><h2>Configuration</h2></div>
      <div class="card">
        <div class="card-header">
          <div class="tabs" id="config-tabs">
            <button class="tab active" data-configtab="fields">Fields</button>
            <button class="tab" data-configtab="raw">Raw YAML</button>
            <button class="tab" data-configtab="cookies">Cookies</button>
            <button class="tab" data-configtab="cookies-raw">Raw Cookies</button>
            <button class="tab" data-configtab="security">Security</button>
          </div>
          <button class="btn btn-danger btn-sm" style="flex-shrink:0" onclick="if(confirm('Shut down the server?')){ENDPOINTS.shutdown().then(r=>toast(r.message||'Shutting down...','warning')).catch(e=>toast(e.message,'error'))}">Shut Down Server</button>
        </div>
        <div class="card-body" id="config-content">
          <div class="loading"><div class="spinner"></div> Loading...</div>
        </div>
      </div>
    </div>
    `;

  pageRenderers.system = renderSystemPage;
  loadSystemData();
  loadConfigTab('fields');

  // Tab switching for System page
  const configTabs = document.getElementById('config-tabs');
  if (configTabs) {
    configTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-configtab]');
      if (!tab) return;
      document.querySelectorAll('[data-configtab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadConfigTab(tab.dataset.configtab);
    });
  }
}

async function loadSystemData() {
  let loadErr = null;
  try {
    const [health, queue] = await Promise.all([ENDPOINTS.health(), ENDPOINTS.queueStatus()]);
    const qEl = document.getElementById('sys-queue');
    if (qEl) {
      qEl.innerHTML = [
        ['Status', health.status || 'ok', health.status === 'ok' ? 'completed' : 'failed'],
        ['Queue Depth', queue.queue_depth || 0, 'total'],
        ['Active Jobs', queue.active_jobs || 0, 'running'],
        ['Pending', queue.pending_jobs || 0, 'queued'],
        ['Detached', queue.detached_jobs || 0, 'cancelled'],
      ].map(([k, v, cls]) => `<div class="stat-card ${cls}"><div class="stat-value">${v}</div><div class="stat-label">${k}</div></div>`).join('');
    }
  } catch(e) { loadErr = e; }
  // 队列状态加载失败时给出可重试提示（原实现静默吞错）
  const qEl = document.getElementById('sys-queue');
  if (qEl && !qEl.children.length) {
    qEl.innerHTML = '<div class="empty-state"><p>Failed to load queue status: ' + esc(loadErr && loadErr.message || 'unknown error') + '</p><button class="btn btn-ghost btn-sm mt-2" onclick="loadSystemData()">Retry</button></div>';
  }
}

async function loadConfigTab(tab) {
  const content = document.getElementById('config-content');
  if (!content) return;
  content.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';

  try {
    switch (tab) {
      case 'fields': await renderConfigFields(content); break;
      case 'raw': await renderConfigRaw(content); break;
      case 'cookies': await renderCookies(content); break;
      case 'cookies-raw': await renderCookiesRaw(content); break;
      case 'security': renderSecurityEditor(content); break;
    }
  } catch(e) {
    content.innerHTML = '<div class="empty-state"><p>Error: ' + esc(e.message) + '</p></div>';
  }
}

async function renderConfigFields(content) {
  const r = await ENDPOINTS.configFields();
  const fields = r.fields || [];
  content.innerHTML = `
    <div id="config-fields-form">
      ${fields.map(f => `
        <div class="form-group">
          <label>${esc(f.label || f.name)}</label>
          ${f.type === 'number'
            ? `<input type="number" id="cf-${esc(f.name)}" value="${esc(f.value||f.default||'')}" placeholder="${esc(f.placeholder||'')}">`
            : f.type === 'password'
              ? `<input type="password" id="cf-${esc(f.name)}" value="" placeholder="${f.value ? 'Leave empty to keep current' : ''}" autocomplete="off">`
              : `<input type="text" id="cf-${esc(f.name)}" value="${esc(f.value||f.default||'')}" placeholder="${esc(f.placeholder||'')}">`
          }
          ${f.prompt ? '<div class="hint">' + esc(f.prompt) + '</div>' : ''}
        </div>`).join('')}
      <div class="form-actions">
        <button class="btn btn-primary" id="btn-save-config-fields" onclick="saveConfigFields()">Save</button>
      </div>
    </div>`;
}

async function saveConfigFields() {
  const saveBtn = document.getElementById('btn-save-config-fields');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  try {
    const r = await ENDPOINTS.configFields();
    const fields = r.fields || [];
    const data = {};
    let clearingApiKey = false;
    fields.forEach(f => {
      const el = document.getElementById('cf-' + f.name);
      if (!el) return;
      // 空密码字段使用 sentinel 值：api_key 可安全清空，其他密码字段保留旧值
      if (f.type === 'password' && el.value.trim() === '') {
        data[f.name] = f.name === 'api_key' ? '__CLEAR__' : '__KEEP_OLD__';
        if (f.name === 'api_key' && data[f.name] === '__CLEAR__' && (r.fields.find(x => x.name === 'api_key') || {}).value) clearingApiKey = true;
        return;
      }
      data[f.name] = el.value;
    });
    // 清空 api_key 会关闭 HTTP 认证并作废全部 JWT——需显式确认
    if (clearingApiKey && !confirm('API Key field is empty - this will CLEAR the API key and disable authentication. Continue?')) {
      return;
    }
    await ENDPOINTS.saveConfigFields(data);
    // 如果 api_key 变更，清除过期 JWT
    if ('api_key' in data && data['api_key'] !== '__KEEP_OLD__') {
      localStorage.removeItem('tmd_jwt_token');
      localStorage.removeItem('tmd_jwt_expiry');
    }
    toast('Configuration saved (restart to apply)', 'success');
  } catch(e) { toast(e.message, 'error'); }
  finally { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; } }
}

async function renderConfigRaw(content) {
  const r = await ENDPOINTS.configRaw();
  content.innerHTML = `
    <div class="form-group">
      <label>Raw YAML Configuration</label>
      <textarea id="config-raw-text" rows="15">${esc(r.content||'')}</textarea>
      <div class="hint">Path: ${esc(r.path)}</div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" id="btn-save-config-raw" onclick="saveConfigRaw()">Save</button>
    </div>`;
}

async function saveConfigRaw() {
  const el = document.getElementById('config-raw-text');
  if (!el) return toast('Configuration form not found', 'error');
  const saveBtn = document.getElementById('btn-save-config-raw');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  const text = el.value;
  try { await ENDPOINTS.saveConfigRaw(text); toast('Configuration saved (restart to apply)', 'success'); }
  catch(e) { toast(e.message, 'error'); }
  finally { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; } }
}

async function renderCookies(content) {
  let cookies;
  try { cookies = await ENDPOINTS.cookies(); }
  catch(e) {
    // 网络/认证错误不伪装成空配置
    toast(e.message, 'error');
    content.innerHTML = '<div class="empty-state"><p>Failed to load cookies: ' + esc(e.message) + '</p><button class="btn btn-ghost btn-sm mt-2" onclick="loadConfigTab(\'cookies\')">Retry</button></div>';
    return;
  }
  const cArr = cookies && Array.isArray(cookies) ? cookies : (cookies && cookies.items) || [];
  content.innerHTML = `
    <div id="cookies-form">
      ${cArr.length === 0 ? '<p class="text-muted">No additional cookies configured.</p>' : ''}
      ${cArr.map((c, i) => `
        <div class="form-row" style="margin-bottom:8px">
          <input type="text" id="cookie-at-${i}" value="${esc(c.auth_token||'')}" data-orig-at="${esc(c.auth_token||'')}" placeholder="auth_token (empty = keep current)" style="font-family:var(--font-mono);font-size:12px">
          <input type="text" id="cookie-ct0-${i}" value="${esc(c.ct0||'')}" data-orig-ct0="${esc(c.ct0||'')}" placeholder="ct0 (empty = keep current)" style="font-family:var(--font-mono);font-size:12px">
        </div>`).join('')}
      <div class="form-actions">
        <button class="btn btn-ghost btn-sm" onclick="addCookieRow()">+ Add Account</button>
        <button class="btn btn-primary" id="btn-save-cookies" onclick="saveCookies()">Save</button>
      </div>
    </div>`;
}

async function saveCookies() {
  const saveBtn = document.getElementById('btn-save-cookies');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  try {
    const cArr = document.querySelectorAll('[id^="cookie-at-"]');
    const cookies = [];
    for (let i = 0; i < cArr.length; i++) {
      const el = cArr[i];
      const at = el.value;
      const ct0El = document.getElementById('cookie-ct0-' + i);
      const ct0 = ct0El ? ct0El.value : '';
      const origAt = el.dataset.origAt || '';
      const origCt0 = ct0El ? (ct0El.dataset.origCt0 || '') : '';
      // 未修改的字段发 __KEEP_OLD__：后端按数组索引取原值（掩码值原样回传会被拒绝）
      const keepAt = origAt !== '' && at === origAt;
      const keepCt0 = origCt0 !== '' && ct0 === origCt0;
      // 新增空行（无原始值且全空）忽略
      if (origAt === '' && origCt0 === '' && !at.trim() && !ct0.trim()) continue;
      if (!keepAt && !keepCt0 && !at.trim() && !ct0.trim()) {
        toast('Account #' + (i + 1) + ': auth_token and ct0 cannot both be empty', 'error');
        return;
      }
      cookies.push({ auth_token: keepAt ? '__KEEP_OLD__' : at, ct0: keepCt0 ? '__KEEP_OLD__' : ct0 });
    }
    if (!cookies.length) { toast('Nothing to save', 'warning'); return; }
    await ENDPOINTS.saveCookies(cookies); toast('Cookies saved', 'success');
  }
  catch(e) { toast(e.message, 'error'); }
  finally { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; } }
}

function addCookieRow() {
  const form = document.getElementById('cookies-form');
  if (!form) return;
  const existing = form.querySelectorAll('[id^="cookie-at-"]');
  const idx = existing.length;
  const row = document.createElement('div');
  row.className = 'form-row-flex';
  row.style.marginBottom = '8px';
  row.innerHTML = '<input type="text" id="cookie-at-' + idx + '" value="" placeholder="auth_token" style="font-family:var(--font-mono);font-size:12px">' +
    '<input type="text" id="cookie-ct0-' + idx + '" value="" placeholder="ct0" style="font-family:var(--font-mono);font-size:12px">';
  const actions = form.querySelector('.form-actions');
  if (actions) form.insertBefore(row, actions);
}

async function renderCookiesRaw(content) {
  const r = await ENDPOINTS.cookiesRaw();
  content.innerHTML = `
    <div class="form-group">
      <label>Raw Cookies YAML</label>
      <textarea id="cookies-raw-text" rows="12">${esc(r.content||'')}</textarea>
      <div class="hint">Path: ${esc(r.path)}</div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveCookiesRaw()">Save</button>
    </div>`;
}

async function saveCookiesRaw() {
  const el = document.getElementById('cookies-raw-text');
  if (!el) return toast('Cookies form not found', 'error');
  const text = el.value;
  try { await ENDPOINTS.saveCookiesRaw(text); toast('Cookies saved', 'success'); }
  catch(e) { toast(e.message, 'error'); }
}

function renderSecurityEditor(content) {
  const jwt = localStorage.getItem('tmd_jwt_token');
  const jwtExpiry = localStorage.getItem('tmd_jwt_expiry');
  let jwtStatus = '';
  if (jwt && jwtExpiry) {
    const remaining = new Date(jwtExpiry) - new Date();
    if (remaining > 0) {
      const mins = Math.round(remaining / 60000);
      jwtStatus = `<span class="text-sm" style="color:var(--green)">✅ JWT active (expires in ~${mins} min)</span>`;
    } else {
      jwtStatus = `<span class="text-sm" style="color:var(--danger)">❌ JWT expired — re-login required</span>`;
    }
  }
  content.innerHTML = `
    <div class="form-group">
      <h3>API Authentication</h3>
      <p class="hint" style="margin-bottom:12px">
        All API requests use a JWT session token obtained by logging in with your API Key.
      </p>
      <div id="sec-jwt-status" style="margin-bottom:12px">${jwtStatus}</div>
      <p class="hint text-sm text-muted" style="margin-bottom:12px">
        💡 The API Key is set via <strong>Configuration → Fields</strong> tab or <code>conf.yaml</code>.
        Enter it below to start a session.
      </p>
      <div class="flex gap-2 items-center" style="flex-wrap:wrap">
        <input type="password" id="sec-api-key" style="flex:1;min-width:200px"
          placeholder="Enter API Key" autocomplete="off" />
      </div>
      <div class="flex gap-2 mt-2">
        <button class="btn btn-primary btn-sm" onclick="saveSecKey()">Login &amp; Save</button>
        <button class="btn btn-ghost btn-sm" onclick="testSecKey()">Test Connection</button>
        <button class="btn btn-ghost btn-sm" onclick="clearSecKey()">Clear</button>
        ${jwt ? '<button class="btn btn-ghost btn-sm" onclick="refreshSecJWT()">Refresh Session</button>' : ''}
      </div>
      <div id="sec-status" class="mt-2"></div>
    </div>`;
}

function updateSecStatus(msg, color) {
  const st = document.getElementById('sec-status');
  if (st) { st.textContent = msg; st.style.color = color || 'var(--text)'; }
}

// Shared helper: call /api/v1/auth/login with a raw API key.
// Stores JWT and expiry in localStorage on success.
// Returns the parsed JSON response.
// Throws on failure (network, non-ok status, missing token).
async function loginWithApiKey(key) {
  const res = await fetch(apiBase() + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key }
  });
  const json = await API._parse(res);
  if (!json.success || !json.data || !json.data.token) {
    throw new Error(json.error || 'Login failed');
  }
  localStorage.setItem('tmd_jwt_token', json.data.token);
  if (json.data.expires_at) localStorage.setItem('tmd_jwt_expiry', json.data.expires_at);
  return json;
}

async function saveSecKey() {
  const el = document.getElementById('sec-api-key');
  if (!el) return;
  const key = el.value.trim();
  if (!key) {
    // Clear all tokens
    localStorage.removeItem('tmd_api_key');
    localStorage.removeItem('tmd_jwt_token');
    localStorage.removeItem('tmd_jwt_expiry');
    updateSecStatus('✅ Authentication cleared');
    return;
  }
  updateSecStatus('⏳ Logging in...');
  try {
    const json = await loginWithApiKey(key);
    updateSecStatus('✅ Login successful, JWT session started');
  } catch(e) {
    updateSecStatus('❌ Login failed: ' + e.message);
  }
}

async function refreshSecJWT() {
  const ok = await API._tryRefreshJWT();
  if (ok) {
    const expiry = localStorage.getItem('tmd_jwt_expiry');
    let remaining = '?';
    if (expiry) {
      const ms = new Date(expiry) - new Date();
      remaining = isNaN(ms) ? '?' : Math.max(1, Math.round(ms / 60000));
    }
    updateSecStatus(`✅ Session refreshed (expires in ~${remaining} min)`);
  } else {
    updateSecStatus('❌ Session refresh failed, please re-login');
  }
}

function clearSecKey() {
  localStorage.removeItem('tmd_jwt_token');
  localStorage.removeItem('tmd_jwt_expiry');
  localStorage.removeItem('tmd_api_key'); // 与 saveSecKey 保持一致
  const el = document.getElementById('sec-api-key');
  if (el) el.value = '';
  updateSecStatus('✅ Authentication cleared');
}

async function testSecKey() {
  const el = document.getElementById('sec-api-key');
  if (!el) return;
  const key = el.value.trim();
  if (!key) { updateSecStatus('⚠️ Enter an API Key first', 'orange'); return; }
  updateSecStatus('⏳ Testing...');
  try {
    // Use raw fetch instead of API._fetch() to test authentication explicitly:
    // API._fetch would already attach the same Bearer header and 401 handling,
    // making it impossible to distinguish "key works" from "server not responding".
    const res = await fetchWithTimeout(apiBase() + '/api/v1/tasks?limit=1', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (res.ok) { updateSecStatus('✅ Connection successful! API Key is valid', 'green'); }
    else if (res.status === 401) { updateSecStatus('❌ API Key is invalid (server returned 401)', 'red'); }
    else { updateSecStatus('⚠️ Server returned status ' + res.status, 'orange'); }
  } catch(e) {
    if (e.name === 'AbortError') { updateSecStatus('❌ Request timed out', 'red'); }
    else { updateSecStatus('❌ Network error: ' + e.message, 'red'); }
  }
}



/* ---- Logs Page ---- */
function renderLogsPage(container) {
  container.innerHTML = `
    <div class="section">
      <div class="section-header">
        <h2>Logs</h2>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" onclick="refreshLogs()">Refresh</button>
          <button class="btn btn-ghost btn-sm" onclick="exportLogs()">Export</button>
          <label class="checkbox-label" style="font-size:12px"><input type="checkbox" id="log-auto-scroll-toggle" checked onchange="toggleLogAutoScroll()"> Auto-scroll</label>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="flex gap-2 items-center" style="flex-wrap:wrap">
            <input type="text" id="log-level" placeholder="level (info/warn/error)" style="width:130px" onkeydown="if(event.key==='Enter')setLogLevel()">
            <select id="log-domain" style="width:130px" onchange="setLogDomain()">
              <option value="">All domains</option>
              <option value="api">api</option><option value="auth">auth</option><option value="batch">batch</option>
              <option value="db">db</option><option value="download">download</option><option value="downloader">downloader</option>
              <option value="logs">logs</option><option value="profile">profile</option><option value="scheduler">scheduler</option>
              <option value="server">server</option><option value="startup">startup</option><option value="task">task</option>
              <option value="twitter">twitter</option><option value="sse">sse</option><option value="consolelog">consolelog</option>
            </select>
            <input type="text" id="log-search-input" placeholder="search text..." style="width:130px" onkeydown="if(event.key==='Enter')doLogSearch()">
            <button class="btn btn-primary btn-sm" onclick="setLogLevel()">Filter</button>
            <button class="btn btn-ghost btn-sm" onclick="doLogSearch()">Search</button>
            <button class="btn btn-ghost btn-sm" id="log-pause-btn" onclick="toggleLogPause()">Pause</button>
            <span id="log-stats-inline" class="text-sm text-muted" style="margin-left:8px"></span>
          </div>
        </div>
        <div class="card-body" style="padding:0;position:relative">
          <div class="log-stream" id="log-stream">
            <div class="loading"><div class="spinner"></div> Loading logs...</div>
          </div>
          <button class="log-scroll-to-top-btn" id="log-new-arrived-btn"
            style="display:none" onclick="scrollLogToBottom()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            New logs arrived
          </button>
        </div>
      </div>
    </div>`;

  pageRenderers.logs = renderLogsPage;
  refreshLogs();
  loadLogStats();
  connectLogSSE();

  // Auto-uncheck only when user scrolls UP from bottom (scrolling down never unchecks)
  let _lastScrollTop = 0;
  let _logScrollRAF = null;
  const logStream = document.getElementById('log-stream');
  logStream.addEventListener('scroll', () => {
    // rAF 节流：滚动事件每帧最多处理一次，避免逐帧强制布局
    if (_logScrollRAF) return;
    _logScrollRAF = requestAnimationFrame(() => {
      _logScrollRAF = null;
      const atBottom = logStream.scrollTop + logStream.clientHeight >= logStream.scrollHeight - 10;
      const scrolledUp = logStream.scrollTop < _lastScrollTop;
      _lastScrollTop = logStream.scrollTop;
      if (logStream.scrollTop <= 0) {
        // 滚动到顶部 → 加载上一页并拼接
        loadMoreLogs();
      } else if (atBottom) {
        // User scrolled to bottom → hide button if visible
        const btn = document.getElementById('log-new-arrived-btn');
        if (btn) btn.style.display = 'none';
      } else if (scrolledUp && logAutoScroll) {
        // User scrolled up → uncheck
        logAutoScroll = false;
        const cb = document.getElementById('log-auto-scroll-toggle');
        if (cb) cb.checked = false;
      }
    });
  });
}

let logSSESource = null;
let logAutoScroll = true;
let _logReconnectAttempts = 0;
let _logIntentionalDisconnect = false;
let _logSSETimer = null;
let _logPage = 1;
let _logTotalPages = 1;
let _logLoadingMore = false;
let logDomain = '';      // 域过滤（空 = 全部）
let logPaused = false;   // 暂停实时插入
let logPausedCount = 0;  // 暂停期间跳过的行数
let _logBatch = [];      // 日志流批量追加缓冲（rAF 合并）
let _logFlushRAF = null;

function toggleLogAutoScroll() {
  logAutoScroll = document.getElementById('log-auto-scroll-toggle').checked;
  if (logAutoScroll) {
    const stream = document.getElementById('log-stream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  }
}
async function exportLogs() {
  // fetch + Authorization 头 + blob 下载：window.open 无法带头且 URL 拼 token 会泄露 JWT
  try {
    const res = await fetch(apiBase() + '/api/v1/logs/export', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('tmd_jwt_token') || '') }
    });
    if (!res.ok) throw new Error('Export failed (HTTP ' + res.status + ')');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tmd2.log';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch(e) { toast(e.message, 'error'); }
}

// 日志行 HTML（loadLogsReplace/loadMoreLogs/SSE 追加共用）；tweet id 行加显式复制按钮
function renderLogEntryHTML(clean, tweetId, color) {
  let html = '<div class="log-entry" style="color:' + color + '"';
  if (tweetId) html += ' data-tweet-id="' + tweetId + '"';
  html += '>' + highlightLogTimestamp(esc(clean));
  if (tweetId) html += ' <button class="log-copy-btn" onclick="copyLogTweetId(this)" title="Copy tweet ID" aria-label="Copy tweet ID">&#128203;</button>';
  html += '</div>';
  return html;
}

// 显式复制按钮触发（不再整行点击复制，避免框选误触覆盖剪贴板）
function copyLogTweetId(btn) {
  const entry = btn.closest('.log-entry');
  const id = entry && entry.dataset.tweetId;
  if (!id) return;
  navigator.clipboard.writeText(id).then(() => {
    toast('已复制推文 ID: ' + id, 'success');
  }).catch(() => {
    toast('复制失败，请手动选择文本复制', 'warning');
  });
}

function setLogLevel() {
  _logPage = 1;
  _logGen++; // 代际递增：丢弃在途 loadMore 旧响应
  // 先断开旧 SSE，避免 refresh 前旧流追加的行被 innerHTML 重置清掉（丢行窗口）
  disconnectLogSSE();
  refreshLogs();
  connectLogSSE();
}

function setLogDomain() {
  const sel = document.getElementById('log-domain');
  logDomain = sel ? sel.value : '';
  _logPage = 1;
  _logGen++; // 代际递增：丢弃在途 loadMore 旧响应
  // 先断开旧 SSE，避免丢行窗口；await 刷新完成再重连，防止 REST 重建前 SSE 行被清掉
  disconnectLogSSE();
  refreshLogs().then(() => connectLogSSE());
}

function toggleLogPause() {
  logPaused = !logPaused;
  if (!logPaused) {
    logPausedCount = 0;
    refreshLogs(); // 恢复时刷新历史，补齐暂停期间错过的行
  }
  const btn = document.getElementById('log-pause-btn');
  if (btn) btn.textContent = logPaused ? 'Continue (' + logPausedCount + ')' : 'Pause';
}

function doLogSearch() {
  _logPage = 1;
  _logGen++; // 代际递增：丢弃在途 loadMore 旧响应
  // 先断开旧 SSE，避免 refresh 前旧流追加的行被 innerHTML 重置清掉（丢行窗口）
  disconnectLogSSE();
  refreshLogs().then(() => connectLogSSE());
}

function scrollLogToBottom() {
  const stream = document.getElementById('log-stream');
  if (stream) { stream.scrollTop = stream.scrollHeight; }
  const btn = document.getElementById('log-new-arrived-btn');
  if (btn) btn.style.display = 'none';
  logAutoScroll = true;
  const cb = document.getElementById('log-auto-scroll-toggle');
  if (cb) cb.checked = true;
}

async function refreshLogs() {
  _logGen++; // 代际递增：丢弃在途 loadMore 旧响应
  _logPage = 1;
  _logLoadingMore = false;
  _prependedCount = 0; // 重置前置页计数
  await loadLogsReplace();
  // 实时流断开（重连耗尽/未连接）时通过刷新按钮复活
  if (!logSSESource) connectLogSSE();
}

async function loadLogsReplace() {
  const stream = document.getElementById('log-stream');
  if (!stream) return;
  const level = document.getElementById('log-level') ? document.getElementById('log-level').value.trim() : '';
  const q = document.getElementById('log-search-input') ? document.getElementById('log-search-input').value.trim() : '';
  try {
    const r = await ENDPOINTS.logs({ page: _logPage, pageSize: 200, level: level || undefined, domain: logDomain || undefined, q: q || undefined });
    _logTotalPages = r.totalPages || 1;
    const lines = (r.logs || []).reverse();
    stream.innerHTML = lines.map(l => {
      const clean = stripAnsi(l);
      const color = getLogLineColor(clean);
      const tweetId = getTweetId(clean);
      return renderLogEntryHTML(clean, tweetId, color);
    }).join('');
    // 仅在自动滚动开启时滚到底部（关闭时保留用户阅读位置）
    if (logAutoScroll) stream.scrollTop = stream.scrollHeight;
  } catch(e) {
    stream.innerHTML = '<div class="log-entry">Error loading logs: ' + esc(e.message) + '</div>';
  }
}

async function loadMoreLogs() {
  if (_logLoadingMore) return;
  if (_logPage >= _logTotalPages) return;
  _logLoadingMore = true;
  const gen = _logGen; // 捕获发起时代际：期间筛选/刷新变化则丢弃响应
  const stream = document.getElementById('log-stream');
  if (!stream) { _logLoadingMore = false; return; }
  const nextPage = _logPage + 1;
  _logPage = nextPage;
  const level = document.getElementById('log-level') ? document.getElementById('log-level').value.trim() : '';
  const q = document.getElementById('log-search-input') ? document.getElementById('log-search-input').value.trim() : '';
  try {
    const r = await ENDPOINTS.logs({ page: nextPage, pageSize: 200, level: level || undefined, domain: logDomain || undefined, q: q || undefined });
    if (gen !== _logGen) {
      // 期间发生了筛选/刷新：丢弃旧响应并回退页码
      _logPage--;
      return;
    }
    const lines = (r.logs || []).reverse();
    const oldHeight = stream.scrollHeight;
    const newLines = lines.map(l => {
      const clean = stripAnsi(l);
      const color = getLogLineColor(clean);
      const tweetId = getTweetId(clean);
      return renderLogEntryHTML(clean, tweetId, color);
    }).join('');
    stream.innerHTML = newLines + stream.innerHTML;
    // 记录前置页行数：SSE trim 时保留，防止刚加载的旧页被立即削掉
    _prependedCount += lines.length;
    // 保持视觉位置不变
    stream.scrollTop = (stream.scrollHeight - oldHeight) + stream.scrollTop;
    _logTotalPages = r.totalPages || 1;
  } catch(e) {
    if (gen !== _logGen) return; // 代际过期：不回退（刷新已重置页码）
    _logPage--;
  } finally {
    _logLoadingMore = false;
  }
}

async function loadLogStats() {
  try {
    const s = await ENDPOINTS.logStats();
    const el = document.getElementById('log-stats-inline');
    if (el) el.textContent = (s.total || 0) + ' lines' + ((s.error || 0) > 0 ? ', errors: ' + s.error : '') + ((s.warn || 0) > 0 ? ', warns: ' + s.warn : '');
  } catch(e) { /* optional stat, ignore silently */ }
}

function connectLogSSE() {
  if (logSSESource) { logSSESource.close(); logSSESource = null; }
  if (_logSSETimer) { clearTimeout(_logSSETimer); _logSSETimer = null; }
  _logIntentionalDisconnect = false;
  const level = document.getElementById('log-level') ? document.getElementById('log-level').value.trim() : '';
  const q = document.getElementById('log-search-input') ? document.getElementById('log-search-input').value.trim() : '';
  const params = new URLSearchParams();
  if (level) params.append('level', level);
  if (logDomain) params.append('domain', logDomain);
  if (q) params.append('q', q);
  const key = sseJWT();
  if (key) params.append('token', key);
  const qs = params.toString();
  logSSESource = new EventSource(apiBase() + '/api/v1/logs/stream' + (qs ? '?' + qs : ''));

  logSSESource.addEventListener('log', (e) => {
    _logReconnectAttempts = 0; // 成功收到事件 → 连接正常，重置计数（防累计 60 次后永久断流）
    const stream = document.getElementById('log-stream');
    if (!stream) return;
    // 暂停时只计数不插入（恢复时刷新历史补齐）
    if (logPaused) {
      logPausedCount++;
      const btn = document.getElementById('log-pause-btn');
      if (btn) btn.textContent = 'Continue (' + logPausedCount + ')';
      return;
    }
    // 批量追加：同帧内多条日志合并为一次 DOM 插入，避免逐行 append + scrollTop 强制布局
    _logBatch.push(e.data);
    if (_logFlushRAF) return;
    _logFlushRAF = requestAnimationFrame(() => {
      _logFlushRAF = null;
      const stream = document.getElementById('log-stream');
      if (!stream || _logBatch.length === 0) { _logBatch = []; return; }
      const lines = _logBatch;
      _logBatch = [];
      const frag = document.createDocumentFragment();
      for (const raw of lines) {
        const clean = stripAnsi(raw);
        const tweetId = getTweetId(clean);
        const color = getLogLineColor(clean);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderLogEntryHTML(clean, tweetId, color);
        frag.appendChild(wrapper.firstChild);
      }
      stream.appendChild(frag);
      if (logAutoScroll) {
        // Auto-scroll：延迟到下一帧，合并强制布局
        requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; });
      } else {
        // Only show button if user is NOT at the bottom
        const userAtBottom = stream.scrollTop + stream.clientHeight >= stream.scrollHeight - 10;
        if (!userAtBottom) {
          const btn = document.getElementById('log-new-arrived-btn');
          if (btn) btn.style.display = 'flex';
        }
      }
      // Keep last 5000 lines（保留 loadMore 前置的旧页，防刚加载内容被削掉）
      while (stream.children.length > 5000 + _prependedCount) stream.removeChild(stream.firstChild);
    });
  });

  logSSESource.onopen = () => {
    _logReconnectAttempts = 0; // 连接成功 → 重置重连计数
  };

  logSSESource.onerror = () => {
    if (logSSESource) { logSSESource.close(); logSSESource = null; }
    if (_logIntentionalDisconnect) { _logIntentionalDisconnect = false; return; }
    _logReconnectAttempts++;
    if (_logReconnectAttempts > 60) {
      _logReconnectAttempts = 0;
      toast('Log stream disconnected - press Refresh to reconnect', 'warning');
      return;
    }
    const delay = Math.min(2000 * Math.pow(1.5, _logReconnectAttempts - 1), 30000);
    tryRefreshJWT('LogSSE', () => { _logSSETimer = setTimeout(connectLogSSE, delay); });
  };
}

function disconnectLogSSE() {
  _logIntentionalDisconnect = true;
  if (logSSESource) { logSSESource.close(); logSSESource = null; }
  if (_logSSETimer) { clearTimeout(_logSSETimer); _logSSETimer = null; }
  _logReconnectAttempts = 0;
}

/* ---- Sidebar ---- */
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const open = sb.classList.toggle('open');
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.style.display = open ? 'block' : 'none';
  const btn = document.querySelector('.mobile-menu-btn');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.classList.remove('open');
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.style.display = 'none';
  const btn = document.querySelector('.mobile-menu-btn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/* ---- Errors ---- */
let _errorsData = null;
function toggleErrorsPanel() {
  const body = document.getElementById('errors-panel-body');
  const arrow = document.getElementById('errors-panel-arrow');
  if (!body) return;
  const isOpen = !body.classList.contains('hidden');
  body.classList.toggle('hidden', isOpen);
  if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
  if (!isOpen && _errorsData) updateErrorsPanel();
}

async function loadErrors() {
  try {
    const r = await ENDPOINTS.errors();
    _errorsData = r;
    updateErrorsPanel();
  } catch(e) { /* ignore */ }
}

function updateErrorsPanel() {
  const title = document.getElementById('errors-panel-title');
  const badge = document.getElementById('errors-panel-badge');
  const arrow = document.getElementById('errors-panel-arrow');
  const body = document.getElementById('errors-panel-body');
  const content = document.getElementById('errors-panel-content');
  if (!content) return;

  const r = _errorsData || {};
  const regular = r.regular || {};
  const json = r.json || [];
  const regKeys = Object.keys(regular);
  const total = regKeys.length + json.length;

  if (title) title.textContent = 'Failed Records' + (total ? ' (' + total + ')' : '');
  if (badge) {
    badge.textContent = total > 0 ? '\u26A0\uFE0F' : '';
    badge.style.display = total > 0 ? '' : 'none';
	}
	if (!total) {
		if (body) body.classList.add('hidden');
		content.innerHTML = '';
		return;
	}

  content.innerHTML = `
    <div style="margin-bottom:10px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="retryAllErrors()">Retry All Failed</button>
      <button class="btn btn-danger btn-sm" onclick="clearAllErrors()">Clear Errors</button>
    </div>
    ${regKeys.length ? `<div class="section-header mt-2"><h3>Regular errors (${regKeys.length} entities)</h3></div>
    <table><thead><tr><th>Entity ID</th><th>Failed Tweets</th></tr></thead><tbody>${regKeys.map(k => `<tr><td>${esc(k)}</td><td>${regular[k]}</td></tr>`).join('')}</tbody></table>` : ''}
    ${json.length ? `<div class="section-header mt-2"><h3>JSON errors (${json.length} sources)</h3></div>
    <table><thead><tr><th>Source</th><th>Count</th></tr></thead><tbody>${json.map(j => `<tr><td class="mono">${esc(j.source_path||'')}</td><td>${j.count||0}</td></tr>`).join('')}</tbody></table>` : ''}`;
}

async function retryAllErrors() {
  try { const r = await ENDPOINTS.retryErrors(); toast('Retry task: ' + r.task_id, 'success'); }
  catch(e) { toast(e.message, 'error'); }
}

async function clearAllErrors() {
  if (!confirm('Clear all error records?')) return;
  try { await ENDPOINTS.clearErrors(); toast('Errors cleared', 'info'); loadErrors(); }
  catch(e) { toast(e.message, 'error'); }
}

/* ---- Auth Dialog ---- */
function showAuthDialog() {
  openModal(`
      <div class="modal-header">
        <h2>Authentication Required</h2>
      </div>
      <div class="modal-body">
        <p class="text-muted" style="font-size:13px;line-height:1.5;margin-bottom:14px">
          This server requires an API Key. Enter your key below, or configure one in System settings.
        </p>
        <input type="password" id="authDialogKey" style="width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;box-sizing:border-box"
          placeholder="Enter API Key" autocomplete="off" />
        <div id="authDialogStatus" class="mt-2" style="font-size:13px;min-height:20px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-sm" id="authSubmitBtn" onclick="submitAuthKey()">Confirm</button>
      </div>
  `);
  const input = document.getElementById('authDialogKey');
  if (input) {
    input.onkeydown = (e) => {
      if (e.key === 'Enter') submitAuthKey();
    };
    setTimeout(() => input.focus(), 100);
  }
}

async function submitAuthKey() {
  const input = document.getElementById('authDialogKey');
  const status = document.getElementById('authDialogStatus');
  const btn = document.getElementById('authSubmitBtn');
  if (!input || !btn) return;
  const key = input.value.trim();
  if (!key) {
    if (status) { status.textContent = 'Please enter an API Key'; status.style.color = 'var(--danger)'; }
    input.focus();
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  if (status) status.textContent = '';
  // Call login endpoint to get JWT via shared helper
  try {
    await loginWithApiKey(key);
    // setItem 是同步操作，写入完成后再 reload
    window.location.reload();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Confirm';
    if (status) { status.textContent = '❌ ' + e.message; status.style.color = 'var(--danger)'; }
  }
}

// Proactive auth check: if the server requires auth and no key is stored,
// show the auth dialog. Called from DOMContentLoaded.
async function checkAuth() {
  const jwt = localStorage.getItem('tmd_jwt_token');
  if (jwt) {
    // 有 token 也做一次轻量校验（auth/check）：过期/损坏的 token 启动即引导重新登录，
    // 而不是等首个 API 请求 401 才弹框。401 由 _fetch 统一处理（清 token + 弹框）。
    try {
      await ENDPOINTS.authCheck();
    } catch(e) { /* 401 已由 _fetch 弹框；网络失败不阻塞启动 */ }
    connectSSE();
    return;
  }
  try {
    await ENDPOINTS.tasks();
    // 无需认证或 JWT 有效，建立推迟的 SSE 连接
    connectSSE();
  } catch(e) {
    if (e.status === 401 || e.message === 'unauthorized') {
      showAuthDialog();
    }
  }
}

/* ---- Init ---- */
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Global] Unhandled promise rejection:', e.reason);
  if (e.reason && (e.reason.status === 401 || e.reason.message === 'unauthorized')) {
    if (localStorage.getItem('tmd_jwt_token')) {
      API._tryRefreshJWT().then(refreshed => {
        if (!refreshed) showAuthDialog();
      });
    } else {
      showAuthDialog();
    }
  }
});
document.addEventListener('DOMContentLoaded', () => {
  // Determine initial page
  const path = location.pathname.replace(/^\//, '') || 'overview';
  currentPage = path;

  // Proactive JWT refresh
  // 定时刷新：每 45 分钟尝试刷新一次 JWT
  // 首次刷新由第一个 API 请求的 401 处理逻辑自动触发
  setInterval(() => {
    if (localStorage.getItem('tmd_jwt_token')) API._tryRefreshJWT();
  }, 45 * 60 * 1000);

  // Highlight sidebar
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.page));
    el.classList.toggle('active', el.dataset.page === currentPage);
  });

  // Set page title
  const titles = {tasks:'Tasks', data:'Data', schedules:'Schedules', system:'System', logs:'Logs'};
  document.getElementById('page-title').textContent = titles[currentPage] || 'Tasks';

  // Connect SSE first
  connectSSE();

  // Initial health check
  checkHealth();
  setInterval(checkHealth, 30000);

  // Render initial page
  renderPage(currentPage);

  // Proactive auth check - shows dialog if server requires auth
  checkAuth();
});

// Export functions for inline onclick
window.ENDPOINTS = ENDPOINTS;
window.apiBase = apiBase;
