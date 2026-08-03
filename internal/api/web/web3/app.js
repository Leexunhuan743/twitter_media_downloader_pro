/* ============================================================
   TMD Pro web3 — glassmorphism SPA
   原生 JS 零构建；架构：API 层（统一请求+JWT 刷新链）+ hash 路由 + 页面渲染器
   ============================================================ */
'use strict';

/* ---------- 工具函数 ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsEsc = (s) => String(s ?? '').replace(/[\\'"\n\r&<>]/g, (c) => ({ '\\': '\\\\', "'": "\\'", '"': '&quot;', '\n': '\\n', '\r': '', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const throttle = (fn, ms) => { let last = 0, t; return (...a) => { const now = Date.now(); clearTimeout(t); if (now - last >= ms) { last = now; fn(...a); } else { t = setTimeout(() => fn(...a), ms - (now - last)); } }; };
const fmtDur = (a, b) => { const ms = new Date(b) - new Date(a); if (isNaN(ms) || ms < 0) return ''; const s = Math.floor(ms / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); return m + 'm ' + (s % 60) + 's'; };
const relTime = (t) => { if (!t) return '-'; const d = new Date(t); if (isNaN(d.getTime())) return '-'; const s = (Date.now() - d.getTime()) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };
const stripAnsi = (s) => String(s ?? '').replace(/\x1b\[[0-9;]*m/g, '');
const toRFC3339 = (v) => { if (!v) return ''; const t = new Date(v); return isNaN(t.getTime()) ? '' : t.toISOString().replace(/\.\d{3}Z$/, 'Z'); };

/* ---------- API 层 ---------- */
const apiBase = () => ((window.TMD_DEV_BASE) || '');
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}

const API = {
  _refreshPromise: null,
  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  patch(url, body) { return this.request('PATCH', url, body); },
  delete(url) { return this.request('DELETE', url); },

  async request(method, url, body, options = {}) {
    const headers = { ...(options.headers || {}) };
    const jwt = localStorage.getItem('tmd_jwt_token');
    // 仅在调用方未显式提供 Authorization 时附加 JWT（如 authLogin 用输入的 key 探测）
    if (jwt && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + jwt;
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const res = await fetchWithTimeout(url, { method, headers, body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined) });
    if (res.status === 401 && jwt) {
      const refreshed = await this._tryRefreshJWT();
      if (refreshed) {
        const headers2 = { ...(options.headers || {}), 'Authorization': 'Bearer ' + localStorage.getItem('tmd_jwt_token') };
        if (body && !(body instanceof FormData)) headers2['Content-Type'] = 'application/json';
        const res2 = await fetchWithTimeout(url, { method, headers: headers2, body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined) });
        if (res2.status !== 401) return this._json(res2);
      }
      // 刷新失败：用 auth/check 区分「会话失效（401 → 清 token 引导重登）」与「网络抖动（保留 token）」
      const probe = await fetchWithTimeout(apiBase() + '/api/v1/auth/check', { headers: { 'Authorization': 'Bearer ' + jwt } }).catch(() => null);
      if (probe && probe.status === 401) {
        localStorage.removeItem('tmd_jwt_token');
        localStorage.removeItem('tmd_jwt_expiry');
        showAuth('Session expired - please re-authenticate');
      }
      const err = new Error('unauthorized'); err.status = 401; throw err;
    }
    return this._json(res);
  },

  async _json(res) {
    let data = null;
    try { data = await res.json(); } catch (e) { /* 非 JSON 响应 */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || ('HTTP ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data && data.data !== undefined ? data.data : data;
  },

  async _doRefreshJWT() {
    const token = localStorage.getItem('tmd_jwt_token');
    if (!token) return { ok: false };
    try {
      const res = await fetchWithTimeout(apiBase() + '/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ token })
      });
      const j = await res.json().catch(() => null);
      if (res.status === 401 || !j || !j.success) return { ok: false };
      localStorage.setItem('tmd_jwt_token', j.data.token);
      if (j.data.expires_at) localStorage.setItem('tmd_jwt_expiry', j.data.expires_at);
      return { ok: true };
    } catch (e) {
      return { ok: false, unreachable: true }; // 网络层失败
    }
  },

  _tryRefreshJWT() {
    if (!this._refreshPromise) {
      this._refreshPromise = this._doRefreshJWT().finally(() => { this._refreshPromise = null; });
    }
    return this._refreshPromise;
  },
};

/* ---------- ENDPOINTS（后端契约全量，参数名已逐条核对） ---------- */
const ENDPOINTS = {
  // Health / queue
  health: () => API.get(apiBase() + '/api/v1/health'),
  queueStatus: () => API.get(apiBase() + '/api/v1/queue/status'),
  // Auth
  authCheck: () => API.get(apiBase() + '/api/v1/auth/check'),
  authLogin: (key) => API.request('POST', apiBase() + '/api/v1/auth/login', null, { headers: { 'Authorization': 'Bearer ' + key } }),
  // Config
  configRaw: () => API.get(apiBase() + '/api/v1/config/raw'),
  saveConfigRaw: (content) => API.put(apiBase() + '/api/v1/config/raw', { content }),
  configFields: () => API.get(apiBase() + '/api/v1/config/fields'),
  saveConfigFields: (data) => API.put(apiBase() + '/api/v1/config/fields', data),
  configThemes: () => API.get(apiBase() + '/api/v1/config/themes'),
  setTheme: (theme) => API.post(apiBase() + '/api/v1/config/theme', { theme }),
  // Cookies
  cookies: () => API.get(apiBase() + '/api/v1/cookies'),
  saveCookies: (cookies) => API.put(apiBase() + '/api/v1/cookies', { cookies }),
  // Errors
  errors: () => API.get(apiBase() + '/api/v1/errors'),
  retryErrors: () => API.post(apiBase() + '/api/v1/errors/retry'),
  clearErrors: () => API.delete(apiBase() + '/api/v1/errors'),
  // Tasks
  tasks: () => API.get(apiBase() + '/api/v1/tasks'),
  getTask: (id) => API.get(apiBase() + '/api/v1/tasks/' + encodeURIComponent(id)),
  taskTimeline: (id) => API.get(apiBase() + '/api/v1/tasks/' + encodeURIComponent(id) + '/timeline'),
  cancelTask: (id) => API.post(apiBase() + '/api/v1/tasks/' + encodeURIComponent(id) + '/cancel'),
  retryTask: (id) => API.post(apiBase() + '/api/v1/tasks/' + encodeURIComponent(id) + '/retry'),
  deleteTask: (id) => API.delete(apiBase() + '/api/v1/tasks/' + encodeURIComponent(id)),
  cancelAllQueued: () => API.post(apiBase() + '/api/v1/tasks/cancel-queued'),
  // Downloads
  userDownload: (name, opts) => API.post(apiBase() + '/api/v1/users/' + encodeURIComponent(name) + '/download', opts || {}),
  userProfile: (name) => API.post(apiBase() + '/api/v1/users/' + encodeURIComponent(name) + '/profile'),
  userMark: (name, ts) => API.post(apiBase() + '/api/v1/users/' + encodeURIComponent(name) + '/mark', ts ? { timestamp: ts } : {}),
  userFollowingMark: (name, ts) => API.post(apiBase() + '/api/v1/users/' + encodeURIComponent(name) + '/following/mark', ts ? { timestamp: ts } : {}),
  userFollowingDownload: (name, opts) => API.post(apiBase() + '/api/v1/users/' + encodeURIComponent(name) + '/following/download', opts || {}),
  listDownload: (id, opts) => API.post(apiBase() + '/api/v1/lists/' + encodeURIComponent(id) + '/download', opts || {}),
  listProfile: (id) => API.post(apiBase() + '/api/v1/lists/' + encodeURIComponent(id) + '/profile'),
  listMark: (id, ts) => API.post(apiBase() + '/api/v1/lists/' + encodeURIComponent(id) + '/mark', ts ? { timestamp: ts } : {}),
  followingDownload: (name, opts) => API.post(apiBase() + '/api/v1/users/' + encodeURIComponent(name) + '/following/download', opts || {}),
  batchDownload: (body) => API.post(apiBase() + '/api/v1/batch/download', body),
  batchMark: (body) => API.post(apiBase() + '/api/v1/batch/mark', body),
  jsonFile: (formData) => API.post(apiBase() + '/api/v1/json/file/download', formData),
  jsonFolder: (body) => API.post(apiBase() + '/api/v1/json/folder/download', body),
  // Schedules
  schedules: () => API.get(apiBase() + '/api/v1/schedules'),
  schedulesRaw: () => API.get(apiBase() + '/api/v1/schedules/raw'),
  saveSchedulesRaw: (content) => API.put(apiBase() + '/api/v1/schedules/raw', { content }),
  createSchedule: (entry) => API.post(apiBase() + '/api/v1/schedules', entry),
  updateSchedule: (id, entry) => API.put(apiBase() + '/api/v1/schedules/' + encodeURIComponent(id), entry),
  deleteSchedule: (id) => API.delete(apiBase() + '/api/v1/schedules/' + encodeURIComponent(id)),
  reloadSchedules: () => API.post(apiBase() + '/api/v1/schedules/reload'),
  setScheduleEnabled: (id, enabled) => API.patch(apiBase() + '/api/v1/schedules/' + encodeURIComponent(id) + '/enabled', { enabled }),
  triggerSchedule: (id) => API.post(apiBase() + '/api/v1/schedules/' + encodeURIComponent(id) + '/trigger'),
  triggerAllSchedules: () => API.post(apiBase() + '/api/v1/schedules/trigger-all'),
  // DB
  dbUsers: (p) => API.get(apiBase() + '/api/v1/db/users' + (p ? '?' + p : '')),
  dbUser: (id) => API.get(apiBase() + '/api/v1/db/users/' + encodeURIComponent(id)),
  dbUserUpdate: (id, data) => API.patch(apiBase() + '/api/v1/db/users/' + encodeURIComponent(id), data),
  dbUserDelete: (id) => API.delete(apiBase() + '/api/v1/db/users/' + encodeURIComponent(id)),
  dbLists: (p) => API.get(apiBase() + '/api/v1/db/lists' + (p ? '?' + p : '')),
  dbList: (id) => API.get(apiBase() + '/api/v1/db/lists/' + encodeURIComponent(id)),
  dbListUpdate: (id, data) => API.patch(apiBase() + '/api/v1/db/lists/' + encodeURIComponent(id), data),
  dbListDelete: (id) => API.delete(apiBase() + '/api/v1/db/lists/' + encodeURIComponent(id)),
  dbUserEntities: (p) => API.get(apiBase() + '/api/v1/db/user-entities' + (p ? '?' + p : '')),
  dbUserEntity: (id) => API.get(apiBase() + '/api/v1/db/user-entities/' + encodeURIComponent(id)),
  dbUserEntityUpdate: (id, data) => API.patch(apiBase() + '/api/v1/db/user-entities/' + encodeURIComponent(id), data),
  dbUserEntityDelete: (id) => API.delete(apiBase() + '/api/v1/db/user-entities/' + encodeURIComponent(id)),
  dbListEntities: (p) => API.get(apiBase() + '/api/v1/db/list-entities' + (p ? '?' + p : '')),
  dbListEntity: (id) => API.get(apiBase() + '/api/v1/db/list-entities/' + encodeURIComponent(id)),
  dbListEntityUpdate: (id, data) => API.patch(apiBase() + '/api/v1/db/list-entities/' + encodeURIComponent(id), data),
  dbListEntityDelete: (id) => API.delete(apiBase() + '/api/v1/db/list-entities/' + encodeURIComponent(id)),
  dbUserLinks: (p) => API.get(apiBase() + '/api/v1/db/user-links' + (p ? '?' + p : '')),
  dbUserLink: (id) => API.get(apiBase() + '/api/v1/db/user-links/' + encodeURIComponent(id)),
  dbUserLinkUpdate: (id, data) => API.patch(apiBase() + '/api/v1/db/user-links/' + encodeURIComponent(id), data),
  dbUserLinkDelete: (id) => API.delete(apiBase() + '/api/v1/db/user-links/' + encodeURIComponent(id)),
  dbPreviousNames: (p) => API.get(apiBase() + '/api/v1/db/previous-names' + (p ? '?' + p : '')),
  dbStats: () => API.get(apiBase() + '/api/v1/db/stats'),
  dbUserPrevNames: (id) => API.get(apiBase() + '/api/v1/db/users/' + encodeURIComponent(id) + '/previous-names'),
  dbUserRelatedEntities: (id) => API.get(apiBase() + '/api/v1/db/users/' + encodeURIComponent(id) + '/entities'),
  dbUserRelatedLinks: (id) => API.get(apiBase() + '/api/v1/db/users/' + encodeURIComponent(id) + '/links'),
  dbListRelatedEntities: (id) => API.get(apiBase() + '/api/v1/db/lists/' + encodeURIComponent(id) + '/entities'),
  // Logs
  logs: (params) => API.get(apiBase() + '/api/v1/logs?' + new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)]))),
  logStats: () => API.get(apiBase() + '/api/v1/logs/stats'),
  logExport: () => apiBase() + '/api/v1/logs/export',
  // Server
  shutdown: () => API.post(apiBase() + '/api/v1/server/shutdown'),
};

/* ---------- 状态 ---------- */
const state = {
  page: 'dashboard',
  tasks: [],
  health: null,
  queue: null,
  errors: null,
  schedules: [],
  sseConnected: false,
};
const listeners = new Set();
const setState = (patch) => { Object.assign(state, patch); listeners.forEach(fn => fn(state)); };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

let pageTasks = []; // SSE 实时快照（与 REST 加载分离）

/* ---------- Toast ---------- */
const icons = { ok: '✓', err: '✕', warn: '!', info: 'ℹ' };
function toast(msg, type = 'info', ms = 5000) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  if (type === 'err') el.setAttribute('role', 'alert');
  el.innerHTML = '<span class="toast-icon">' + icons[type] + '</span><span class="toast-msg">' + esc(msg) + '</span><button class="toast-close" aria-label="Dismiss">✕</button>';
  el.querySelector('.toast-close').onclick = () => el.remove();
  root.appendChild(el);
  let timer = setTimeout(() => el.remove(), ms);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { clearTimeout(timer); timer = setTimeout(() => el.remove(), ms); });
}

/* ---------- Modal ---------- */
let currentModal = null;
function openModal(html) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay._lastFocused = document.activeElement;
  overlay.innerHTML = '<div class="modal glass">' + html + '</div>';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  currentModal = overlay;
  document.body.style.overflow = 'hidden'; // 背景锁滚动
  const focusable = overlay.querySelector('input, select, textarea, button');
  if (focusable) setTimeout(() => focusable.focus(), 60);
}
function closeModal() {
  if (currentModal) {
    const opener = currentModal._lastFocused;
    currentModal.remove();
    currentModal = null;
    document.body.style.overflow = '';
    if (opener && opener.isConnected) opener.focus();
  }
}
// Esc 关闭弹窗/认证框；Tab 焦点陷阱（弹窗打开时循环约束在容器内）
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (currentModal) { closeModal(); return; }
    if (document.getElementById('authOverlay').classList.contains('open')) { hideAuth(); return; }
    return;
  }
  if (e.key !== 'Tab' || !currentModal) return;
  const focusables = currentModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) { e.preventDefault(); return; }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ---------- Sidebar（移动端） ---------- */
function openSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('open'); }

/* ---------- Auth ---------- */
let _authDialogOpen = false;
function showAuth(message) {
  if (document.getElementById('authOverlay').classList.contains('open')) return; // 去重
  _authDialogOpen = true;
  const ov = document.getElementById('authOverlay');
  if (message) document.getElementById('authDesc').textContent = message;
  document.getElementById('authError').textContent = '';
  document.getElementById('authKey').value = '';
  ov.classList.add('open');
  setTimeout(() => document.getElementById('authKey').focus(), 80);
}
function hideAuth() {
  _authDialogOpen = false;
  document.getElementById('authOverlay').classList.remove('open');
  // 认证框关闭后若 SSE 已停止（无 token 暂停分支），恢复重连
  if (!sseSource && !_authDialogOpen) {
    sseReconnectDelay = 2000;
    connectSSE();
  }
}
async function submitAuth() {
  const key = document.getElementById('authKey').value.trim();
  const errEl = document.getElementById('authError');
  if (!key) { errEl.textContent = 'Please enter your API key'; return; }
  errEl.textContent = '';
  try {
    const r = await ENDPOINTS.authLogin(key);
    localStorage.setItem('tmd_jwt_token', r.token);
    if (r.expires_at) localStorage.setItem('tmd_jwt_expiry', r.expires_at);
    hideAuth();
    toast('Authenticated', 'ok');
    location.reload(); // 重新初始化（含 SSE）
  } catch (e) {
    errEl.textContent = e.message || 'Authentication failed';
  }
}

/* ---------- 任务工具 ---------- */
const TASK_STAGE_TEXT = {
  queueing: 'Queuing', queued: 'Queued', preparing: 'Preparing', fetching: 'Fetching',
  downloading: 'Downloading', processing: 'Processing', finalizing: 'Finalizing', completed: 'Done',
};
function getStageText(stage) {
  if (!stage) return '';
  if (TASK_STAGE_TEXT[stage]) return ' · ' + TASK_STAGE_TEXT[stage];
  const m = String(stage).match(/(\d+)\s*\/\s*(\d+)/);
  return m ? (' · ' + m[1] + '/' + m[2]) : (' · ' + String(stage));
}
function getTaskPct(t) {
  const p = t.progress || {};
  if (t.status === 'queued' || p.stage === 'queueing' || p.stage === 'queued') return 0; // 排队中不显示假进度
  if (p.stage === 'completed') return 100;
  if (p.stage === 'preparing') return 10;
  if (p.stage === 'finalizing') return 95;
  // TaskProgress 无 percent 字段：用 completed/total 计算
  if (p.completed != null && p.total > 0) return Math.min(100, Math.max(0, Math.round((p.completed / p.total) * 100)));
  const m = String(p.stage || '').match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return Math.min(100, Math.round((+m[1] / +m[2]) * 100));
  return 5;
}
const TASK_TYPE_NAMES = {
  user: 'User', list: 'List', following: 'Following', json_file: 'JSON File',
  json_folder: 'JSON Folder', batch: 'Batch', mark_downloaded: 'Mark', profile_downloaded: 'Profile',
  profile_download: 'Profile', mark: 'Mark',
};
function taskTypeName(t) {
  return TASK_TYPE_NAMES[t.type] || t.type || 'Task';
}
function taskTarget(t) {
  const d = t.data || {};
  if (d.screen_name) return d.screen_name;
  if (d.list_id) return d.list_id;
  if (d.users && d.users.length) return d.users.join(', ');
  if (d.following_names && d.following_names.length) return d.following_names.join(', ');
  if (d.file_path) return d.file_path.replace(/^.*[\\/]/, '');
  return '';
}
const TASK_STATUS_SAFE = { queued: 1, running: 1, completed: 1, failed: 1, cancelled: 1 };
const safeStatus = (s) => (TASK_STATUS_SAFE[s] ? s : 'queued');
function taskTypeIcon(t) {
  const n = taskTypeName(t);
  const g = { User: '👤', List: '📋', Following: '👥', 'JSON File': '📄', 'JSON Folder': '📁', Batch: '📦', Mark: '🏷️', Profile: '🖼️' };
  return g[n] || '📦';
}

/* ---------- 调度工具 ---------- */
function normalizeEntry(item) {
  return {
    type: item.type,
    target: item.type === 'mixed' ? '' : (item.target || '').trim(),
    users: item.type === 'mixed' ? (item.users || []) : [],
    lists: item.type === 'mixed' ? (item.lists || []) : [],
    following_names: item.type === 'mixed' ? (item.following_names || []) : [],
    name: (item.name || '').trim(),
    schedule: `${item.scheduleMode}:${(item.scheduleValue || '').trim()}`,
    enabled: item.enabled !== false,
    run_on_start: !!item.run_on_start,
    auto_follow: !!item.auto_follow,
    follow_members: !!item.follow_members,
    skip_profile: !!item.skip_profile,
    no_retry: !!item.no_retry,
  };
}
function schedToForm(s) {
  const e = s.entry || s;
  const sch = String(e.schedule || 'interval:1h');
  const colon = sch.indexOf(':');
  const mode = colon === -1 ? 'interval' : sch.slice(0, colon);
  const value = colon === -1 ? sch : sch.slice(colon + 1); // daily:07:00 保留完整时间
  return {
    id: e.id, type: e.type, target: e.target || '', name: e.name || '',
    users: e.users || [], lists: e.lists || [], following_names: e.following_names || [],
    scheduleMode: mode, scheduleValue: value,
    enabled: e.enabled !== false, run_on_start: !!e.run_on_start, auto_follow: !!e.auto_follow,
    follow_members: !!e.follow_members, skip_profile: !!e.skip_profile, no_retry: !!e.no_retry,
  };
}

/* ---------- Tasks 页 ---------- */
let _errorsData = null;
function renderTasks(root) {
  root.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2>Tasks</h2>
        <div class="page-actions">
          <button class="btn ghost" onclick="cancelAllQueued()">Cancel Queued</button>
        </div>
      </div>
      <!-- 创建下载：核心操作内嵌页面顶部，零弹窗 -->
      <div class="glass card" id="taskFormCard">
        <div class="filter-bar">
          <div class="tabs" id="taskFormTabs">
            ${Object.entries(TASK_FORM_LABELS).map(([id, label]) => `<button class="tab ${taskFormType === id ? 'active' : ''}" onclick="switchTaskForm('${id}')">${esc(label)}</button>`).join('')}
          </div>
        </div>
        <div style="padding:16px 20px" id="taskFormBody"></div>
      </div>
      <div class="stats-grid">
        <div class="stat-card glass info"><div class="stat-value" data-taskstat="queued">—</div><div class="stat-label">Queued</div></div>
        <div class="stat-card glass accent"><div class="stat-value" data-taskstat="running">—</div><div class="stat-label">Running</div></div>
        <div class="stat-card glass ok"><div class="stat-value" data-taskstat="completed">—</div><div class="stat-label">Completed</div></div>
        <div class="stat-card glass err"><div class="stat-value" data-taskstat="failed">—</div><div class="stat-label">Failed</div></div>
        <div class="stat-card glass"><div class="stat-value" data-taskstat="total">—</div><div class="stat-label">Total</div></div>
      </div>
      <div>
        <div class="section-title">Task List</div>
        <div class="glass card" id="taskListCard"></div>
      </div>
      <div class="errors-panel glass card" id="errorsPanel">
        <div class="errors-panel-header" onclick="toggleErrorsPanel()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleErrorsPanel()}" tabindex="0" role="button" aria-expanded="false">
          <span class="errors-icon" id="errorsIcon">⚠</span>
          <span class="errors-title">Failed Records</span>
          <span class="errors-badge hidden" id="errorsBadge">0</span>
          <span class="errors-arrow" id="errorsArrow">▶</span>
        </div>
        <div class="errors-body hidden" id="errorsBody">
          <div id="errorsContent"><div class="loading-block"><div class="spinner sm"></div></div></div>
        </div>
      </div>
    </div>`;
  renderTaskFormInline();
  updateTasksUI();
  loadErrors();
}

function updateTasksUI() {
  const stats = { queued: 0, running: 0, completed: 0, failed: 0, total: pageTasks.length };
  pageTasks.forEach(t => { if (stats[t.status] !== undefined) stats[t.status]++; });
  Object.entries(stats).forEach(([k, v]) => {
    const el = document.querySelector('[data-taskstat="' + k + '"]');
    if (el && el.textContent !== String(v)) el.textContent = v;
  });
  const card = document.getElementById('taskListCard');
  if (!card) return;
  if (!pageTasks.length) {
    card.innerHTML = '<div class="empty"><div class="empty-title">No tasks</div><div class="empty-desc">Create a download to get started</div></div>';
    return;
  }
  const existing = new Map();
  card.querySelectorAll('tr[data-task-id]').forEach(tr => existing.set(tr.dataset.taskId, tr));
  const seen = new Set();
  for (const t of pageTasks) {
    const id = String(t.task_id || '');
    if (!id) continue;
    seen.add(id);
    const tr = existing.get(id);
    if (tr) updateTaskRow(tr, t);
    else {
      if (!card.querySelector('table')) card.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Type</th><th>ID</th><th>Status</th><th>Progress</th><th>Time</th><th>Actions</th></tr></thead><tbody></tbody></table></div>';
      const tbody = card.querySelector('tbody');
      const tmp = document.createElement('tbody');
      tmp.innerHTML = taskRowHTML(t);
      const node = tmp.firstElementChild;
      // 快照按 created_at 倒序，新任务总是最新 → 插到首位（appendChild 会落到末尾造成顺序错乱）
      const first = tbody.firstElementChild;
      if (first) tbody.insertBefore(node, first);
      else tbody.appendChild(node);
    }
  }
  for (const [id, tr] of existing) if (!seen.has(id)) tr.remove();
}

function taskRowHTML(t) {
  const target = taskTarget(t);
  const canCancel = t.status === 'queued' || t.status === 'running';
  const canRetry = t.status === 'failed' || t.status === 'cancelled';
  const canDelete = t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled';
  return `<tr data-task-id="${jsEsc(t.task_id)}" data-status="${jsEsc(safeStatus(t.status))}">
    <td>${esc(taskTypeIcon(t))}</td>
    <td><span class="mono">${esc(t.task_id)}</span><div class="text-sm text-muted ellipsis">${esc(taskTypeName(t))}${target ? ' · ' + esc(target) : ''}</div></td>
    <td><span class="badge badge-${safeStatus(t.status)}">${esc(t.status)}</span></td>
    <td style="min-width:180px">${progressHTML(t)}</td>
    <td><span class="text-sm">${esc(relTime(t.created_at))}</span>${t.started_at && t.ended_at ? '<div class="text-sm text-muted">' + esc(fmtDur(t.started_at, t.ended_at)) + '</div>' : ''}</td>
    <td><div class="flex gap-2">
      ${(t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') ? '<button class="btn xs ghost" onclick="openTaskDetail(\'' + jsEsc(t.task_id) + '\')">View</button>' : ''}
      ${canCancel ? '<button class="btn xs ghost" onclick="cancelTask(\'' + jsEsc(t.task_id) + '\')">Cancel</button>' : ''}
      ${canRetry ? '<button class="btn xs ghost" onclick="retryTask(\'' + jsEsc(t.task_id) + '\')">Retry</button>' : ''}
      ${canDelete ? '<button class="btn xs ghost" onclick="deleteTask(\'' + jsEsc(t.task_id) + '\')">Del</button>' : ''}
    </div></td>
  </tr>`;
}

function updateTaskRow(tr, t) {
  if (tr.dataset.status !== t.status) tr.dataset.status = t.status;
  const badge = tr.querySelector('.badge');
  if (badge) {
    const cls = 'badge badge-' + safeStatus(t.status);
    if (badge.className !== cls) badge.className = cls;
    if (badge.textContent !== t.status) badge.textContent = t.status;
  }
  const cell = tr.querySelector('td:nth-child(4)');
  if (cell) {
    const html = progressHTML(t);
    if (cell.innerHTML !== html) cell.innerHTML = html;
  }
  const timeCell = tr.querySelector('td:nth-child(5)');
  if (timeCell) {
    const html = '<span class="text-sm">' + esc(relTime(t.created_at)) + '</span>' + (t.started_at && t.ended_at ? '<div class="text-sm text-muted">' + esc(fmtDur(t.started_at, t.ended_at)) + '</div>' : '');
    if (timeCell.innerHTML !== html) timeCell.innerHTML = html;
  }
}

async function cancelTask(id) { try { await ENDPOINTS.cancelTask(id); toast('Task cancelled', 'info'); } catch (e) { toast(e.message, 'err'); } }
async function retryTask(id) { try { await ENDPOINTS.retryTask(id); toast('Retry task created', 'ok'); } catch (e) { toast(e.message, 'err'); } }
async function deleteTask(id) { if (!confirm('Delete task ' + id + '?')) return; try { await ENDPOINTS.deleteTask(id); toast('Task deleted', 'ok'); } catch (e) { toast(e.message, 'err'); } }
async function cancelAllQueued() { try { await ENDPOINTS.cancelAllQueued(); toast('Queued tasks cancelled', 'ok'); } catch (e) { toast(e.message, 'err'); } }

/* ---------- 任务表单（inline，页面顶部直连） ---------- */
const TASK_FORM_LABELS = { user: 'User', list: 'List', following: 'Following', batch: 'Batch', jsonFile: 'JSON File', jsonFolder: 'JSON Folder', mark: 'Mark' };
let taskFormType = 'user';

const TASK_FORM_HTML = {
  user: `<div class="form-row"><div class="form-group"><label>Screen Name</label><input type="text" id="tf-target" placeholder="@username" style="max-width:420px"></div></div>`,
  list: `<div class="form-row"><div class="form-group"><label>List ID</label><input type="text" id="tf-listid" placeholder="List ID (numeric)" style="max-width:420px"></div></div>`,
  following: `<div class="form-row"><div class="form-group"><label>Screen Name</label><input type="text" id="tf-target" placeholder="@username" style="max-width:420px"></div></div>`,
  batch: `<div class="form-row">
    <div class="form-group"><label>Users (one per line)</label><textarea id="tf-users"></textarea></div>
    <div class="form-group"><label>Lists (one per line)</label><textarea id="tf-lists"></textarea></div>
    <div class="form-group"><label>Following (one per line)</label><textarea id="tf-following"></textarea></div>
  </div>`,
  jsonFile: `<div class="form-group"><label>Upload JSON files exported by third-party tools</label><input type="file" id="tf-files" accept=".json,application/json" multiple><div class="form-hint">Multiple .json files supported; leave empty to use the server-path mode below</div></div>
    <div class="form-group"><label>Advanced: server-side JSON file paths (one per line)</label><textarea id="tf-paths" rows="3" placeholder="/path/to/twitter-followers-123.json"></textarea></div>`,
  jsonFolder: `<div class="form-group"><label>Upload LoongTweet JSON files</label><input type="file" id="tf-files" accept=".json,application/json" multiple><div class="form-hint">Pick one or more .loongtweet JSON files; leave empty to use the server-path mode below</div></div>
    <div class="form-group"><label>Advanced: server-side .loongtweet folder paths (one per line)</label><textarea id="tf-paths" rows="3" placeholder="/path/to/.loongtweet"></textarea></div>`,
  mark: `<div class="form-row">
    <div class="form-group"><label>Users (one per line)</label><textarea id="tf-users"></textarea></div>
    <div class="form-group"><label>Lists (one per line)</label><textarea id="tf-lists"></textarea></div>
    <div class="form-group"><label>Following (one per line)</label><textarea id="tf-following"></textarea></div>
  </div>
  <div class="form-row"><div class="form-group"><label>Mark timestamp (optional)</label><input type="datetime-local" id="tf-marktime" style="max-width:420px"></div></div>`,
};
const TASK_FORM_OPTS = `<div class="checkbox-grid" id="tf-opts">
    <label class="checkbox-line"><input type="checkbox" id="tf-autofollow"> Auto follow</label>
    <label class="checkbox-line"><input type="checkbox" id="tf-followmembers"> Follow members</label>
    <label class="checkbox-line"><input type="checkbox" id="tf-skipprofile"> Skip profile</label>
    <label class="checkbox-line"><input type="checkbox" id="tf-noretry"> No retry</label>
  </div>`;
const TASK_FORM_NO_OPTS = new Set(['jsonFile', 'jsonFolder', 'mark']);
const TASK_FORM_NORETRY_ONLY = new Set(['jsonFile', 'jsonFolder']);
const TASK_FORM_NORETRY_OPTS = `<div class="checkbox-grid" id="tf-opts">
    <label class="checkbox-line"><input type="checkbox" id="tf-noretry"> No retry</label>
  </div>`;

function renderTaskFormInline() {
  const body = document.getElementById('taskFormBody');
  if (!body) return;
  const opts = TASK_FORM_NORETRY_ONLY.has(taskFormType) ? TASK_FORM_NORETRY_OPTS
    : TASK_FORM_NO_OPTS.has(taskFormType) ? '' : TASK_FORM_OPTS;
  const submitLabel = taskFormType === 'mark' ? 'Mark Downloaded' : 'Create Download';
  // 并列操作（web1 同款，共享输入框）：user/list 有「仅下载 Profile」，user/list/following 有「标记已下载」
  const profileBtn = (taskFormType === 'user' || taskFormType === 'list') ? `<button class="btn" onclick="submitTaskForm('${taskFormType}', 'profile')">Profile Only</button>` : '';
  const markBtn = (taskFormType === 'user' || taskFormType === 'list' || taskFormType === 'following') ? `<button class="btn ghost" onclick="submitTaskForm('${taskFormType}', 'mark')">Mark Downloaded</button>` : '';
  body.innerHTML = `
    ${TASK_FORM_HTML[taskFormType]}
    ${opts}
    <div class="flex gap-2" style="margin-top:14px">
      <button class="btn primary" onclick="submitTaskForm('${taskFormType}')">${submitLabel}</button>
      ${profileBtn}${markBtn}
    </div>`;
}
function switchTaskForm(type) {
  taskFormType = TASK_FORM_HTML[type] ? type : 'user';
  document.querySelectorAll('#taskFormTabs .tab').forEach(t => t.classList.toggle('active', t.textContent === TASK_FORM_LABELS[taskFormType]));
  renderTaskFormInline();
}

function checkedOpts() {
  const o = {};
  if (document.getElementById('tf-autofollow')) o.auto_follow = document.getElementById('tf-autofollow').checked;
  if (document.getElementById('tf-followmembers')) o.follow_members = document.getElementById('tf-followmembers').checked;
  if (document.getElementById('tf-skipprofile')) o.skip_profile = document.getElementById('tf-skipprofile').checked;
  if (document.getElementById('tf-noretry')) o.no_retry = document.getElementById('tf-noretry').checked;
  return o;
}
function areaLines(id) { const v = document.getElementById(id)?.value || ''; return v.split('\n').map(s => s.trim()).filter(Boolean); }

async function submitTaskForm(type, action = 'download') {
  const buttons = [...document.querySelectorAll('#taskFormBody button')];
  const submitBtn = buttons.find(b => b.classList.contains('primary')) || null;
  const busyLocked = buttons.some(b => b.disabled);
  if (busyLocked) return;
  buttons.forEach(b => { b.disabled = true; });
  const tsRaw = document.getElementById('tf-marktime')?.value || '';
  const ts = tsRaw ? toRFC3339(tsRaw) : undefined;
  try {
    if (action === 'profile') {
      if (type === 'user') {
        const name = document.getElementById('tf-target').value.trim();
        if (!name) return toast('Enter a screen name', 'warn');
        await ENDPOINTS.userProfile(name);
      } else if (type === 'list') {
        const id = document.getElementById('tf-listid').value.trim();
        if (!id) return toast('Enter a list ID', 'warn');
        if (!/^\d+$/.test(id)) return toast('List ID must be numeric', 'warn');
        await ENDPOINTS.listProfile(id);
      } else {
        return toast('Profile not available for this type', 'warn');
      }
    } else if (action === 'mark') {
      if (type === 'user') {
        const name = document.getElementById('tf-target').value.trim();
        if (!name) return toast('Enter a screen name', 'warn');
        await ENDPOINTS.userMark(name, ts);
      } else if (type === 'list') {
        const id = document.getElementById('tf-listid').value.trim();
        if (!id) return toast('Enter a list ID', 'warn');
        if (!/^\d+$/.test(id)) return toast('List ID must be numeric', 'warn');
        await ENDPOINTS.listMark(id, ts);
      } else if (type === 'following') {
        const name = document.getElementById('tf-target').value.trim();
        if (!name) return toast('Enter a screen name', 'warn');
        await ENDPOINTS.userFollowingMark(name, ts);
      } else {
        return toast('Mark not available for this type', 'warn');
      }
    } else {
      switch (type) {
        case 'user': {
          const name = document.getElementById('tf-target').value.trim();
          if (!name) return toast('Enter a screen name', 'warn');
          await ENDPOINTS.userDownload(name, checkedOpts()); break;
        }
        case 'list': {
          const id = document.getElementById('tf-listid').value.trim();
          if (!id) return toast('Enter a list ID', 'warn');
          if (!/^\d+$/.test(id)) return toast('List ID must be numeric', 'warn');
          await ENDPOINTS.listDownload(id, checkedOpts()); break;
        }
        case 'following': {
          const name = document.getElementById('tf-target').value.trim();
          if (!name) return toast('Enter a screen name', 'warn');
          await ENDPOINTS.followingDownload(name, checkedOpts()); break;
        }      case 'batch': {
          const users = areaLines('tf-users'), lists = areaLines('tf-lists'), following_names = areaLines('tf-following');
          if (!users.length && !lists.length && !following_names.length) return toast('Enter at least one target', 'warn');
          await ENDPOINTS.batchDownload({ users, lists, following_names, ...checkedOpts() }); break;
        }
        case 'jsonFile': {
          const files = document.getElementById('tf-files').files;
          const paths = areaLines('tf-paths');
          const noRetry = document.getElementById('tf-noretry')?.checked;
          if (!files.length && !paths.length) return toast('Select files or enter server paths', 'warn');
          if (files.length) {
            const fd = new FormData();
            for (const f of files) fd.append('files', f);
            if (noRetry) fd.append('no_retry', 'true');
            await ENDPOINTS.jsonFile(fd);
          } else {
            await ENDPOINTS.jsonFile({ paths, no_retry: noRetry });
          }
          break;
        }
        case 'jsonFolder': {
          const files = document.getElementById('tf-files').files;
          const paths = areaLines('tf-paths');
          const noRetry = document.getElementById('tf-noretry')?.checked;
          if (!files.length && !paths.length) return toast('Select files or enter server paths', 'warn');
          if (files.length) {
            const fd = new FormData();
            for (const f of files) fd.append('files', f);
            if (noRetry) fd.append('no_retry', 'true');
            await ENDPOINTS.jsonFolder(fd);
          } else {
            await ENDPOINTS.jsonFolder({ paths, no_retry: noRetry });
          }
          break;
        }
        case 'mark': {
          const users = areaLines('tf-users'), lists = areaLines('tf-lists'), following_names = areaLines('tf-following');
          if (!users.length && !lists.length && !following_names.length) return toast('Enter at least one target', 'warn');
          await ENDPOINTS.batchMark({ users, lists, following_names, timestamp: ts }); break;
        }
      }
    }
    closeModal();
    // inline 模式（页面顶部表单）：成功后清空输入，便于连续创建
    document.querySelectorAll('#taskFormBody input[type="text"], #taskFormBody input[type="password"], #taskFormBody textarea').forEach(el => { if (el.id !== 'tf-marktime') el.value = ''; });
    document.querySelectorAll('#taskFormBody input[type="checkbox"]').forEach(el => { el.checked = false; });
    const fileInput = document.getElementById('tf-files'); if (fileInput) fileInput.value = '';
    toast(action === 'profile' ? 'Profile task created' : action === 'mark' ? 'Mark task created' : (type === 'mark' ? 'Mark task created' : 'Download task created'), 'ok');
  } catch (e) { toast(e.message, 'err'); }
  finally { buttons.forEach(b => { b.disabled = false; }); }
}

/* ---------- 失败记录 ---------- */
let errorsGen = 0;
async function loadErrors() {
  const gen = ++errorsGen;
  try {
    _errorsData = await ENDPOINTS.errors();
    if (gen === errorsGen) updateErrorsPanel();
  } catch (e) {
    // 加载失败：渲染空态而非永久 spinner
    if (gen === errorsGen) updateErrorsPanel();
  }
}
function toggleErrorsPanel() {
  const body = document.getElementById('errorsBody');
  const arrow = document.getElementById('errorsArrow');
  if (!body) return;
  const isOpen = !body.classList.contains('hidden');
  body.classList.toggle('hidden', isOpen);
  arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
  const header = document.querySelector('.errors-panel-header');
  if (header) header.setAttribute('aria-expanded', String(!isOpen));
}
function updateErrorsPanel() {
  const badge = document.getElementById('errorsBadge');
  const icon = document.getElementById('errorsIcon');
  const body = document.getElementById('errorsBody');
  const content = document.getElementById('errorsContent');
  const panel = document.getElementById('errorsPanel');
  if (!content) return;
  const r = _errorsData || {};
  const regular = r.regular || {};
  const json = r.json || [];
  const regKeys = Object.keys(regular);
  const regTotal = regKeys.reduce((s, k) => s + (regular[k] || 0), 0);
  const jsonTotal = json.reduce((s, j) => s + (j.count || 0), 0);
  const total = regKeys.length + json.length;
  if (panel) panel.classList.toggle('has-errors', total > 0);
  if (badge) { badge.textContent = String(total); badge.classList.toggle('hidden', total === 0); }
  if (icon) icon.style.display = total ? '' : 'none';
  if (!total) {
    body.classList.add('hidden');
    document.querySelector('.errors-panel-header')?.setAttribute('aria-expanded', 'false');
    if (document.getElementById('errorsArrow')) document.getElementById('errorsArrow').style.transform = '';
    content.innerHTML = '<div class="errors-empty">No failed records — everything looks good.</div>';
    return;
  }
  if (body.classList.contains('hidden')) {
    body.classList.remove('hidden');
    document.querySelector('.errors-panel-header')?.setAttribute('aria-expanded', 'true');
    if (document.getElementById('errorsArrow')) document.getElementById('errorsArrow').style.transform = 'rotate(90deg)';
  }
  content.innerHTML = `
    <div class="errors-actions">
      <button class="btn primary sm" onclick="retryAllErrors()">Retry All Failed</button>
      <button class="btn danger sm" onclick="clearAllErrors()">Clear Errors</button>
    </div>
    <div class="errors-summary">
      <span><strong>${regKeys.length}</strong> entit${regKeys.length === 1 ? 'y' : 'ies'} · ${regTotal} failed tweet${regTotal === 1 ? '' : 's'}</span>
      ${json.length ? `<span><strong>${json.length}</strong> JSON source${json.length === 1 ? '' : 's'} · ${jsonTotal} failed tweet${jsonTotal === 1 ? '' : 's'}</span>` : ''}
    </div>
    ${regKeys.length ? `<div class="section-title">Regular errors</div><div class="table-wrap"><table><thead><tr><th>Entity ID</th><th>Failed Tweets</th></tr></thead><tbody>${regKeys.map(k => `<tr><td class="mono">${esc(k)}</td><td>${regular[k]}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${json.length ? `<div class="section-title mt-3">JSON errors</div><div class="table-wrap"><table><thead><tr><th>Source</th><th>Count</th></tr></thead><tbody>${json.map(j => `<tr><td class="mono">${esc(j.source_path || '')}</td><td>${j.count || 0}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}
async function retryAllErrors() { try { const r = await ENDPOINTS.retryErrors(); toast('Retry task: ' + r.task_id, 'ok'); loadErrors(); } catch (e) { toast(e.message, 'err'); } }
async function clearAllErrors() { if (!confirm('Clear all failed records?')) return; try { await ENDPOINTS.clearErrors(); toast('Failed records cleared', 'ok'); loadErrors(); } catch (e) { toast(e.message, 'err'); } }

/* ---------- 任务详情 ---------- */
async function openTaskDetail(id) {
  try {
    const [task, timeline] = await Promise.all([ENDPOINTS.getTask(id), ENDPOINTS.taskTimeline(id)]);
    const rows = (timeline || []).map(l => `<tr><td class="text-sm text-muted">${esc(l.timestamp || '')}</td><td class="text-sm">${esc(l.message || '')}</td></tr>`).join('');
    openModal(`
      <div class="modal-header"><h2>Task ${esc(id)}</h2><button class="icon-btn" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label>Status</label><span class="badge badge-${safeStatus(task.status)}">${esc(task.status)}</span></div>
          <div class="form-group"><label>Type</label><span>${esc(taskTypeName(task))}</span></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Created</label><span class="text-sm">${esc(task.created_at || '-')}</span></div>
          <div class="form-group"><label>Duration</label><span class="text-sm">${task.started_at && task.ended_at ? esc(fmtDur(task.started_at, task.ended_at)) : '-'}</span></div>
        </div>
        <div class="form-group"><label>Progress</label>${progressHTML(task)}</div>
        ${task.result ? `<div class="form-group"><label>Result</label><pre class="mono text-sm" style="white-space:pre-wrap;background:rgba(255,255,255,.04);padding:10px;border-radius:8px">${esc(JSON.stringify(task.result, null, 2))}</pre></div>` : ''}
        ${rows ? `<div class="section-title mt-3">Timeline</div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Event</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      </div>
      <div class="modal-footer"><button class="btn ghost" onclick="closeModal()">Close</button></div>`);
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------- Data 页 ---------- */
const DB_TABS = [
  { id: 'users', label: 'Users', endpoint: 'dbUsers', columns: ['id', 'screen_name', 'name', 'protected', 'created_at'], sortable: ['id', 'screen_name', 'name', 'created_at'] },
  { id: 'lists', label: 'Lists', endpoint: 'dbLists', columns: ['id', 'name', 'owner_user_id', 'created_at'], sortable: ['id', 'name', 'owner_user_id', 'created_at'] },
  { id: 'user-entities', label: 'User Entities', endpoint: 'dbUserEntities', columns: ['id', 'name', 'parent_dir', 'media_count', 'latest_release_time'], sortable: ['id', 'name', 'media_count', 'latest_release_time'] },
  { id: 'list-entities', label: 'List Entities', endpoint: 'dbListEntities', columns: ['id', 'name', 'parent_dir', 'latest_release_time'], sortable: ['id', 'name', 'latest_release_time'] },
  { id: 'user-links', label: 'User Links', endpoint: 'dbUserLinks', columns: ['id', 'name', 'parent_lst_entity_name', 'parent_lst_entity_id', 'created_at'], sortable: ['id', 'name', 'created_at'] },
  { id: 'previous-names', label: 'Previous Names', endpoint: 'dbPreviousNames', columns: ['id', 'screen_name', 'name', 'record_date', 'current_screen_name'], sortable: ['id', 'screen_name', 'name', 'record_date'] },
];
const DB_EDIT_FIELDS = {
  'users': [{ key: 'screen_name', label: 'Screen Name' }, { key: 'name', label: 'Name' }],
  'lists': [{ key: 'name', label: 'Name' }],
  'user-entities': [{ key: 'name', label: 'Name' }, { key: 'media_count', label: 'Media Count', numeric: true }, { key: 'latest_release_time', label: 'Latest Release Time' }],
  'list-entities': [{ key: 'name', label: 'Name' }],
  'user-links': [{ key: 'name', label: 'Name' }],
};
let dbState = { tab: 'users', page: 1, pageSize: 50, q: '', sortBy: 'id', sortOrder: 'desc', total: 0, totalPages: 1, data: [], loading: false };
let dbGen = 0;

function renderData(root) {
  root.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2>Data</h2>
        <div class="page-actions">
          <input type="text" id="dbSearch" placeholder="Search..." style="width:220px" value="${esc(dbState.q)}" onkeydown="if(event.key==='Enter')dbSearchSubmit()">
          <button class="btn ghost sm" onclick="dbSearchSubmit()">Search</button>
          <button class="btn ghost sm" onclick="dbRefresh()">Refresh</button>
        </div>
      </div>
      <div class="glass card">
        <div class="filter-bar">
          <div class="tabs" id="dbTabs">${DB_TABS.map(t => `<button class="tab ${dbState.tab === t.id ? 'active' : ''}" onclick="dbSwitchTab('${t.id}')">${esc(t.label)}</button>`).join('')}</div>
          <span class="text-sm text-muted" id="dbStats">—</span>
        </div>
        <div class="table-wrap" id="dbTableWrap"><div class="loading-block"><div class="spinner"></div></div></div>
        <div class="filter-bar" id="dbPagination"></div>
      </div>
    </div>`;
  dbLoad();
}

async function dbSwitchTab(tab) {
  dbState.tab = tab; dbState.page = 1; dbState.q = '';
  document.querySelectorAll('#dbTabs .tab').forEach(t => t.classList.toggle('active', t.textContent === DB_TABS.find(x => x.id === tab).label));
  const si = document.getElementById('dbSearch'); if (si) si.value = '';
  dbLoad();
}
function dbSearchSubmit() { dbState.q = document.getElementById('dbSearch').value.trim(); dbState.page = 1; dbLoad(); }
function dbRefresh() { dbState.page = 1; dbLoad(); }

async function dbLoad() {
  const tab = DB_TABS.find(t => t.id === dbState.tab);
  const gen = ++dbGen; // 代际递增：快速切 tab/翻页/搜索时旧响应作废
  dbState.loading = true;
  const wrap = document.getElementById('dbTableWrap');
  if (wrap) wrap.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';
  try {
    const params = new URLSearchParams({ page: dbState.page, pageSize: dbState.pageSize, sortBy: dbState.sortBy, sortOrder: dbState.sortOrder });
    if (dbState.q) params.append('q', dbState.q);
    const r = await ENDPOINTS[tab.endpoint](params.toString());
    if (gen !== dbGen) return; // 期间发生了新的加载，丢弃过期响应
    dbState.data = r.data || [];
    dbState.total = r.total || 0;
    dbState.totalPages = r.totalPages || 1;
    renderDBTable();
    renderDBPagination();
  } catch (e) {
    if (gen !== dbGen) return;
    if (wrap) wrap.innerHTML = '<div class="empty"><div class="empty-title">Load failed</div><div class="empty-desc">' + esc(e.message) + '</div></div>';
  } finally {
    if (gen === dbGen) dbState.loading = false;
  }
  ENDPOINTS.dbStats().then(s => {
    const el = document.getElementById('dbStats');
    if (el && s) el.textContent = Object.entries(s).map(([k, v]) => k + ': ' + v).join(' · ');
  }).catch(() => {});
}

function renderDBTable() {
  const wrap = document.getElementById('dbTableWrap');
  if (!wrap) return;
  const tab = DB_TABS.find(t => t.id === dbState.tab);
  if (!dbState.data.length) {
    wrap.innerHTML = '<div class="empty"><div class="empty-title">No records</div><div class="empty-desc">' + (dbState.q ? 'No matches' : 'Table is empty') + '</div></div>';
    return;
  }
  wrap.innerHTML = `<table>
    <thead><tr>${tab.columns.map(c => `<th${tab.sortable.includes(c) ? ` role="button" tabindex="0" aria-sort="${dbState.sortBy === c ? (dbState.sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}" onclick="dbSort('${c}')" onkeydown="if(event.key==='Enter'||event.key===' ')dbSort('${c}')"` : ''}>${esc(c)}${dbState.sortBy === c ? (dbState.sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}</th>`).join('')}<th>Actions</th></tr></thead>
    <tbody>${dbState.data.map(row => dbRowHTML(tab, row)).join('')}</tbody></table>`;
}
function dbRowHTML(tab, row) {
  const cells = tab.columns.map(c => {
    let v = row[c];
    if (v == null) v = '-';
    if (typeof v === 'boolean') v = v ? 'Yes' : 'No';
    if (typeof v === 'string' && v.length > 40) v = v.slice(0, 40) + '…';
    return `<td class="${c === 'id' ? 'mono' : ''}">${esc(String(v))}</td>`;
  }).join('');
  const id = row.id;
  const detail = tab.id === 'users' ? `<button class="btn xs ghost" onclick="openDBDetail('users','${jsEsc(id)}')">View</button>`
    : tab.id === 'lists' ? `<button class="btn xs ghost" onclick="openDBListDetail('${jsEsc(id)}')">View</button>` : '';
  const edit = DB_EDIT_FIELDS[tab.id] ? `<button class="btn xs ghost" onclick="openDBEdit('${tab.id}','${jsEsc(id)}')">Edit</button>` : '';
  const del = `<button class="btn xs ghost" onclick="dbDelete('${tab.id}','${jsEsc(id)}')">Del</button>`;
  return `<tr>${cells}<td><div class="flex gap-2">${detail}${edit}${del}</div></td></tr>`;
}
function dbSort(col) {
  if (dbState.sortBy === col) dbState.sortOrder = dbState.sortOrder === 'asc' ? 'desc' : 'asc';
  else { dbState.sortBy = col; dbState.sortOrder = 'desc'; }
  dbLoad();
}
function dbChangePage(delta) {
  const next = dbState.page + delta;
  if (next < 1 || next > dbState.totalPages) return;
  dbState.page = next;
  dbLoad();
}
function renderDBPagination() {
  const el = document.getElementById('dbPagination');
  if (!el) return;
  el.innerHTML = `<span class="text-sm text-muted">${dbState.total} records · page ${dbState.page}/${dbState.totalPages}</span>
    <span style="margin-left:auto;display:flex;gap:6px">
      <button class="btn xs ghost" onclick="dbChangePage(-1)" ${dbState.page <= 1 ? 'disabled' : ''}>← Prev</button>
      <button class="btn xs ghost" onclick="dbChangePage(1)" ${dbState.page >= dbState.totalPages ? 'disabled' : ''}>Next →</button>
    </span>`;
}

async function openDBDetail(type, id) {
  try {
    const u = await ENDPOINTS.dbUser(id);
    const [prev, ents, links] = await Promise.all([
      ENDPOINTS.dbUserPrevNames(id).catch(() => ({ data: [] })),
      ENDPOINTS.dbUserRelatedEntities(id).catch(() => ({ data: [] })),
      ENDPOINTS.dbUserRelatedLinks(id).catch(() => ({ data: [] })),
    ]);
    const prevArr = (prev && prev.data) || [];
    const entsArr = (ents && ents.data) || [];
    const linksArr = (links && links.data) || [];
    openModal(`
      <div class="modal-header"><h2>User: ${esc(u.screen_name)}</h2><button class="icon-btn" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label>ID</label><span class="mono">${esc(u.id)}</span></div>
          <div class="form-group"><label>Protected</label><span>${u.protected ? 'Yes' : 'No'}</span></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Screen Name</label><input type="text" id="dbEditScreenName" value="${esc(u.screen_name)}"></div>
          <div class="form-group"><label>Name</label><input type="text" id="dbEditName" value="${esc(u.name || '')}"></div>
        </div>
        ${prevArr.length ? `<div class="section-title mt-3">Previous Names (${prevArr.length})</div><div class="table-wrap"><table><thead><tr><th>Screen Name</th><th>Name</th><th>Date</th></tr></thead><tbody>${prevArr.map(p => `<tr><td class="mono">${esc(p.screen_name)}</td><td>${esc(p.name)}</td><td class="text-sm">${esc(p.record_date)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${entsArr.length ? `<div class="section-title mt-3">Entities (${entsArr.length})</div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Parent Dir</th><th>Media</th></tr></thead><tbody>${entsArr.map(e => `<tr><td>${esc(e.name)}</td><td class="mono text-sm">${esc(e.parent_dir)}</td><td>${e.media_count || 0}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${linksArr.length ? `<div class="section-title mt-3">Links (${linksArr.length})</div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Parent Entity</th></tr></thead><tbody>${linksArr.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.parent_lst_entity_name || l.parent_lst_entity_id || '-')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn ghost" onclick="closeModal()">Close</button>
        <button class="btn primary" onclick="dbSaveUserDetail('${jsEsc(id)}')">Save</button>
      </div>`);
  } catch (e) { toast(e.message, 'err'); }
}
async function dbSaveUserDetail(id) {
  const data = {
    screen_name: document.getElementById('dbEditScreenName').value.trim(),
    name: document.getElementById('dbEditName').value.trim(),
  };
  closeModal();
  try { await ENDPOINTS.dbUserUpdate(id, data); toast('Saved', 'ok'); dbLoad(); } catch (e) { toast(e.message, 'err'); }
}

async function openDBListDetail(id) {
  try {
    const l = await ENDPOINTS.dbList(id);
    const ents = await ENDPOINTS.dbListRelatedEntities(id).catch(() => ({ data: [] }));
    const entsArr = (ents && ents.data) || [];
    openModal(`
      <div class="modal-header"><h2>List: ${esc(l.name)}</h2><button class="icon-btn" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label>ID</label><span class="mono">${esc(l.id)}</span></div>
          <div class="form-group"><label>Owner</label><span class="mono text-sm">${esc(l.owner_user_id || '-')}</span></div>
        </div>
        <div class="form-group"><label>Name</label><input type="text" id="dbEditName" value="${esc(l.name || '')}"></div>
        ${entsArr.length ? `<div class="section-title mt-3">Entities (${entsArr.length})</div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Parent Dir</th><th>Media</th></tr></thead><tbody>${entsArr.map(e => `<tr><td>${esc(e.name)}</td><td class="mono text-sm">${esc(e.parent_dir)}</td><td>${e.media_count || 0}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn ghost" onclick="closeModal()">Close</button>
        <button class="btn primary" onclick="dbSaveListDetail('${jsEsc(id)}')">Save</button>
      </div>`);
  } catch (e) { toast(e.message, 'err'); }
}
async function dbSaveListDetail(id) {
  const data = { name: document.getElementById('dbEditName').value.trim() };
  closeModal();
  try { await ENDPOINTS.dbListUpdate(id, data); toast('Saved', 'ok'); dbLoad(); } catch (e) { toast(e.message, 'err'); }
}

async function openDBEdit(tab, id) {
  const getters = { 'users': ENDPOINTS.dbUser, 'lists': ENDPOINTS.dbList, 'user-entities': ENDPOINTS.dbUserEntity, 'list-entities': ENDPOINTS.dbListEntity, 'user-links': ENDPOINTS.dbUserLink };
  try {
    const item = await getters[tab](id);
    const fields = DB_EDIT_FIELDS[tab] || [];
    openModal(`
      <div class="modal-header"><h2>Edit ${esc(DB_TABS.find(t => t.id === tab).label)}</h2><button class="icon-btn" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div class="form-group"><label>ID</label><span class="mono">${esc(id)}</span></div>
        ${fields.map(f => `<div class="form-group"><label>${esc(f.label)}</label><input type="${f.numeric ? 'number' : 'text'}" id="dbEditField-${f.key}" value="${esc(item[f.key] == null ? '' : String(item[f.key]))}"></div>`).join('')}
        ${tab === 'user-entities' && item.parent_dir ? `<div class="form-group"><label>Parent Dir (read-only)</label><span class="mono text-sm">${esc(item.parent_dir)}</span></div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="dbSaveEdit('${tab}','${jsEsc(id)}')">Save</button>
      </div>`);
  } catch (e) { toast(e.message, 'err'); }
}
async function dbSaveEdit(tab, id) {
  const updaters = { 'users': ENDPOINTS.dbUserUpdate, 'lists': ENDPOINTS.dbListUpdate, 'user-entities': ENDPOINTS.dbUserEntityUpdate, 'list-entities': ENDPOINTS.dbListEntityUpdate, 'user-links': ENDPOINTS.dbUserLinkUpdate };
  const data = {};
  for (const f of (DB_EDIT_FIELDS[tab] || [])) {
    const el = document.getElementById('dbEditField-' + f.key);
    if (!el) continue;
    if (f.numeric) data[f.key] = el.value === '' ? undefined : Number(el.value);
    else if (f.key === 'latest_release_time') {
      const v = el.value.trim();
      if (v === '') data[f.key] = '';
      else {
        // GET 返回 "2006-01-02 15:04:05"（本地无时区）；按本地时区补偏移输出 RFC3339，避免 toISOString 的 UTC 漂移
        const t = new Date(v);
        if (isNaN(t.getTime())) data[f.key] = undefined;
        else {
          const off = -t.getTimezoneOffset();
          const pad2 = (n) => String(n).padStart(2, '0');
          data[f.key] = t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()) + 'T' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ':' + pad2(t.getSeconds())
            + (off >= 0 ? '+' : '-') + pad2(Math.floor(Math.abs(off) / 60)) + ':' + pad2(Math.abs(off) % 60);
        }
      }
    } else data[f.key] = el.value;
  }
  closeModal();
  try { await updaters[tab](id, data); toast('Saved', 'ok'); dbLoad(); } catch (e) { toast(e.message, 'err'); }
}
async function dbDelete(tab, id) {
  if (!confirm('Delete record ' + id + '?')) return;
  const dels = { 'users': ENDPOINTS.dbUserDelete, 'lists': ENDPOINTS.dbListDelete, 'user-entities': ENDPOINTS.dbUserEntityDelete, 'list-entities': ENDPOINTS.dbListEntityDelete, 'user-links': ENDPOINTS.dbUserLinkDelete };
  try { await dels[tab](id); toast('Deleted', 'ok'); dbLoad(); } catch (e) { toast(e.message, 'err'); }
}

/* ---------- Schedules 页 ---------- */
let schedState = { mode: 'form', items: [] };
let schedGen = 0;

function renderSchedules(root) {
  root.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2>Schedules</h2>
        <div class="page-actions">
          <button class="btn" onclick="openScheduleEdit(null)">+ Add</button>
          <button class="btn ghost" onclick="schedToggleMode()" id="schedModeBtn">Raw YAML</button>
          <button class="btn ghost" onclick="triggerAllSchedules()">Trigger All</button>
          <button class="btn ghost" onclick="reloadSchedules()">Reload</button>
        </div>
      </div>
      <div class="glass card" id="schedView"></div>
    </div>`;
  schedLoad();
}

async function schedLoad() {
  const gen = ++schedGen;
  const view = document.getElementById('schedView');
  if (!view) return;
  try {
    const r = await ENDPOINTS.schedules();
    if (gen !== schedGen) return; // 期间发生了新的加载/导航，丢弃过期响应
    schedState.items = (r.entries || []).map(schedToForm);
    renderSchedView();
  } catch (e) {
    if (gen !== schedGen) return;
    view.innerHTML = '<div class="empty"><div class="empty-title">Load failed</div><div class="empty-desc">' + esc(e.message) + '</div></div>';
  }
}

function schedToggleMode() {
  schedState.mode = schedState.mode === 'form' ? 'raw' : 'form';
  document.getElementById('schedModeBtn').textContent = schedState.mode === 'form' ? 'Raw YAML' : 'Form';
  renderSchedView();
}

function renderSchedView() {
  const view = document.getElementById('schedView');
  if (!view) return;
  if (schedState.mode === 'raw') {
    const modeSnapshot = 'raw';
    ENDPOINTS.schedulesRaw().then(r => {
      // 竞态守卫：期间用户切回 form 则丢弃 raw 响应
      if (schedState.mode !== modeSnapshot) return;
      view.innerHTML = `<div style="padding:16px">
        <textarea id="schedRawText" rows="18" style="font-family:var(--mono);font-size:12.5px">${esc(r.content || '')}</textarea>
        <div class="flex gap-2" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="schedToggleMode()">Cancel</button><button class="btn primary" onclick="saveSchedRaw()">Save</button></div>
      </div>`;
    }).catch(e => { view.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
    return;
  }
  const items = schedState.items;
  if (!items.length) {
    view.innerHTML = '<div class="empty"><div class="empty-title">No schedules</div><div class="empty-desc">Click + Add to create a schedule</div></div>';
    return;
  }
  view.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Type</th><th>Target</th><th>Name</th><th>Schedule</th><th>Enabled</th><th>Actions</th></tr></thead>
    <tbody>${items.map(i => `<tr data-sched-id="${jsEsc(i.id || '')}">
      <td><span class="badge badge-${i.type === 'mixed' ? 'warn' : 'queued'}">${esc(i.type)}</span></td>
      <td>${i.type === 'mixed' ? '<span class="text-sm">' + esc((i.users || []).length) + ' users · ' + esc((i.lists || []).length) + ' lists · ' + esc((i.following_names || []).length) + ' following</span>' : esc(i.target || '')}</td>
      <td>${esc(i.name || '-')}</td>
      <td><span class="mono text-sm">${esc(i.scheduleMode)}:${esc(i.scheduleValue)}</span></td>
      <td><label class="toggle"><input type="checkbox" ${i.enabled ? 'checked' : ''} onchange="toggleSchedule('${jsEsc(i.id || '')}', this.checked)"><span class="toggle-track"></span></label></td>
      <td><div class="flex gap-2">
        <button class="btn xs ghost" onclick="triggerSchedule('${jsEsc(i.id || '')}')">Run</button>
        <button class="btn xs ghost" onclick="openScheduleEdit('${jsEsc(i.id || '')}')">Edit</button>
        <button class="btn xs ghost" onclick="deleteSchedule('${jsEsc(i.id || '')}')">Del</button>
      </div></td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function saveSchedRaw() {
  const text = document.getElementById('schedRawText').value;
  try { await ENDPOINTS.saveSchedulesRaw(text); toast('Schedule YAML saved', 'ok'); schedToggleMode(); schedLoad(); } catch (e) { toast(e.message, 'err'); }
}
async function triggerAllSchedules() { try { await ENDPOINTS.triggerAllSchedules(); toast('All schedules triggered', 'ok'); } catch (e) { toast(e.message, 'err'); } }
async function triggerSchedule(id) { try { await ENDPOINTS.triggerSchedule(id); toast('Triggered', 'ok'); } catch (e) { toast(e.message, 'err'); } }
async function reloadSchedules() { try { await ENDPOINTS.reloadSchedules(); toast('Schedules reloaded', 'ok'); schedLoad(); } catch (e) { toast(e.message, 'err'); } }
async function toggleSchedule(id, enabled) {
  if (!id) return toast('Cannot toggle unsaved entry', 'warn');
  try { await ENDPOINTS.setScheduleEnabled(id, enabled); toast(enabled ? 'Enabled' : 'Disabled', 'ok'); schedLoad(); }
  catch (e) { toast(e.message, 'err'); schedLoad(); }
}
async function deleteSchedule(id) {
  if (!id) return toast('Cannot delete unsaved entry', 'warn');
  if (!confirm('Delete schedule ' + id + '?')) return;
  try { await ENDPOINTS.deleteSchedule(id); toast('Deleted', 'ok'); schedLoad(); } catch (e) { toast(e.message, 'err'); }
}

function scheduleFormHTML(ent) {
  const e = ent || { type: 'user', target: '', name: '', users: [], lists: [], following_names: [], scheduleMode: 'interval', scheduleValue: '1h', enabled: true, run_on_start: false, auto_follow: false, follow_members: false, skip_profile: false, no_retry: false };
  const mixed = e.type === 'mixed';
  return `
    <div class="form-row">
      <div class="form-group"><label>Type</label><select id="seType" onchange="seTypeChange()">
        ${['user', 'list', 'following', 'mixed'].map(t => `<option value="${t}" ${e.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      </select></div>
      <div class="form-group"><label>Name (optional)</label><input type="text" id="seName" value="${esc(e.name)}"></div>
    </div>
    <div class="form-group" id="seTargetWrap" ${mixed ? 'style="display:none"' : ''}><label>Target</label><input type="text" id="seTarget" value="${esc(e.target || '')}" placeholder="${e.type === 'list' ? 'List ID (numeric)' : '@username'}"></div>
    <div class="form-group" id="seUsersWrap" ${mixed ? '' : 'style="display:none"'}><label>Users (one per line)</label><textarea id="seUsers">${esc((e.users || []).join('\n'))}</textarea></div>
    <div class="form-row">
      <div class="form-group" id="seListsWrap" ${mixed ? '' : 'style="display:none"'}><label>Lists (one per line)</label><textarea id="seLists">${esc((e.lists || []).join('\n'))}</textarea></div>
      <div class="form-group" id="seFollWrap" ${mixed ? '' : 'style="display:none"'}><label>Following (one per line)</label><textarea id="seFoll">${esc((e.following_names || []).join('\n'))}</textarea></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Mode</label><select id="seMode">
        <option value="interval" ${e.scheduleMode === 'interval' ? 'selected' : ''}>Interval</option>
        <option value="daily" ${e.scheduleMode === 'daily' ? 'selected' : ''}>Daily at (HH:MM)</option>
      </select></div>
      <div class="form-group"><label>Value</label><input type="text" id="seValue" value="${esc(e.scheduleValue)}" placeholder="${e.scheduleMode === 'daily' ? '09:00' : '2h / 30m / 1d'}"></div>
    </div>
    <div class="checkbox-grid">
      <label class="checkbox-line"><input type="checkbox" id="seEnabled" ${e.enabled ? 'checked' : ''}> Enabled</label>
      <label class="checkbox-line"><input type="checkbox" id="seRunOnStart" ${e.run_on_start ? 'checked' : ''}> Run on start</label>
      <label class="checkbox-line"><input type="checkbox" id="seAutoFollow" ${e.auto_follow ? 'checked' : ''}> Auto follow</label>
      <label class="checkbox-line"><input type="checkbox" id="seFollowMembers" ${e.follow_members ? 'checked' : ''}> Follow members</label>
      <label class="checkbox-line"><input type="checkbox" id="seSkipProfile" ${e.skip_profile ? 'checked' : ''}> Skip profile</label>
      <label class="checkbox-line"><input type="checkbox" id="seNoRetry" ${e.no_retry ? 'checked' : ''}> No retry</label>
    </div>`;
}
function seTypeChange() {
  const mixed = document.getElementById('seType').value === 'mixed';
  document.getElementById('seTargetWrap').style.display = mixed ? 'none' : '';
  document.getElementById('seUsersWrap').style.display = mixed ? '' : 'none';
  document.getElementById('seListsWrap').style.display = mixed ? '' : 'none';
  document.getElementById('seFollWrap').style.display = mixed ? '' : 'none';
}
function readScheduleForm() {
  const type = document.getElementById('seType').value;
  const item = {
    type,
    target: document.getElementById('seTarget').value.trim(),
    users: areaLines('seUsers'), lists: areaLines('seLists'), following_names: areaLines('seFoll'),
    name: document.getElementById('seName').value.trim(),
    scheduleMode: document.getElementById('seMode').value,
    scheduleValue: document.getElementById('seValue').value.trim(),
    enabled: document.getElementById('seEnabled').checked,
    run_on_start: document.getElementById('seRunOnStart').checked,
    auto_follow: document.getElementById('seAutoFollow').checked,
    follow_members: document.getElementById('seFollowMembers').checked,
    skip_profile: document.getElementById('seSkipProfile').checked,
    no_retry: document.getElementById('seNoRetry').checked,
  };
  if (type === 'mixed' && !item.users.length && !item.lists.length && !item.following_names.length) throw new Error('Enter at least one mixed target');
  if (type !== 'mixed' && !item.target) throw new Error(type === 'list' ? 'Enter a list ID' : 'Enter a target');
  if (type === 'list' && !/^\d+$/.test(item.target)) throw new Error('List ID must be numeric');
  if (!item.scheduleValue) throw new Error('Enter a schedule value');
  return item;
}
function openScheduleEdit(id) {
  const ent = id ? schedState.items.find(i => i.id === id) : null;
  openModal(`
    <div class="modal-header"><h2>${ent ? 'Edit Schedule' : 'New Schedule'}</h2><button class="icon-btn" onclick="closeModal()" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
    <div class="modal-body">${scheduleFormHTML(ent)}</div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveScheduleForm('${jsEsc(id || '')}')">Save</button>
    </div>`);
}
async function saveScheduleForm(id) {
  let item;
  try { item = readScheduleForm(); } catch (e) { return toast(e.message, 'warn'); }
  const entry = normalizeEntry(item);
  closeModal();
  try {
    if (id) { await ENDPOINTS.updateSchedule(id, entry); toast('Schedule updated', 'ok'); }
    else { await ENDPOINTS.createSchedule(entry); toast('Schedule created', 'ok'); }
    schedLoad();
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------- 路由 ---------- */
const PAGE_TITLES = { dashboard: 'Dashboard', tasks: 'Tasks', data: 'Data', schedules: 'Schedules', settings: 'Settings', logs: 'Logs' };
const PAGES = { dashboard: renderDashboard, tasks: renderTasks, data: renderData, schedules: renderSchedules, settings: renderSettings, logs: renderLogs };

function currentPageFromHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const name = h.split('?')[0];
  return PAGES[name] ? name : 'dashboard';
}
function navigateTo(page, replace = false) {
  if (!PAGES[page]) page = 'dashboard';
  // 只改 hash：renderPage 由 hashchange 监听器统一执行（避免此处与监听器双重渲染）
  if (replace) history.replaceState(null, '', '#/' + page);
  else if (location.hash !== '#/' + page) location.hash = '#/' + page;
  else { setState({ page }); renderPage(); } // hash 相同（如 logo 重复点击）：直接渲染
}
function renderPage() {
  // 导航时关闭残留模态（弹窗挂 body，不关会压在新区块上）
  if (currentModal) closeModal();
  const page = state.page;
  // 离开 Logs 页时断开日志 SSE（避免旧流跨页空转）
  if (page !== 'logs' && logSSE) disconnectLogSSE();
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || 'Dashboard';
  closeSidebar();
  const content = document.getElementById('content');
  content.innerHTML = '';
  try {
    PAGES[page](content);
  } catch (e) {
    console.error('renderPage error', e);
    content.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-title">Render error</div><div class="empty-desc">' + esc(e.message) + '</div></div>';
  }
}

/* ---------- Settings 页 ---------- */
let settingsTab = 'config';
let settingsGen = 0;

function renderSettings(root) {
  root.innerHTML = `
    <div class="page">
      <div class="page-header"><h2>Settings</h2></div>
      <div class="glass card">
        <div class="filter-bar">
          <div class="tabs" id="settingsTabs">
            <button class="tab ${settingsTab === 'config' ? 'active' : ''}" onclick="settingsSwitch('config')">Configuration</button>
            <button class="tab ${settingsTab === 'cookies' ? 'active' : ''}" onclick="settingsSwitch('cookies')">Cookies</button>
            <button class="tab ${settingsTab === 'security' ? 'active' : ''}" onclick="settingsSwitch('security')">Security</button>
            <button class="tab ${settingsTab === 'theme' ? 'active' : ''}" onclick="settingsSwitch('theme')">Theme</button>
            <button class="tab ${settingsTab === 'raw' ? 'active' : ''}" onclick="settingsSwitch('raw')">Raw YAML</button>
          </div>
        </div>
        <div id="settingsBody"><div class="loading-block"><div class="spinner"></div></div></div>
      </div>
    </div>`;
  settingsSwitch(settingsTab);
}

function settingsSwitch(tab) {
  settingsTab = tab;
  const gen = ++settingsGen; // 代际守卫：快速切换 tab 时旧响应不覆盖新内容
  const labels = { config: 'Configuration', cookies: 'Cookies', security: 'Security', theme: 'Theme', raw: 'Raw YAML' };
  document.querySelectorAll('#settingsTabs .tab').forEach(t => t.classList.toggle('active', t.textContent === labels[tab]));
  const body = document.getElementById('settingsBody');
  // 旧响应晚到时：重新渲染当前 tab 自愈（不可清空 body——会误删新 tab 内容）
  const wrap = (renderFn) => { const p = renderFn(body); if (p && p.then) p.then(() => { if (gen !== settingsGen) settingsSwitch(settingsTab); }).catch(() => {}); };
  if (tab === 'config') wrap(renderConfigFields);
  else if (tab === 'cookies') wrap(renderCookies);
  else if (tab === 'security') wrap(renderSecurity);
  else if (tab === 'theme') wrap(renderTheme);
  else wrap(renderRawConfig);
}

/* ---- 主题切换 ---- */
async function renderTheme(body) {
  try {
    const r = await ENDPOINTS.configThemes();
    const themes = r.themes || [];
    const current = r.current || 'web1';
    body.innerHTML = `<div style="padding:18px 20px;max-width:520px">
      <div class="section-title">Interface Theme</div>
      <div class="checkbox-grid">${themes.map(t => `
        <button class="btn ${t === current ? 'primary' : 'ghost'}" style="justify-content:flex-start" onclick="switchTheme('${jsEsc(t)}')">
          <span style="flex:1">${esc(t)}</span>${t === current ? ' ✓' : ''}
        </button>`).join('')}</div>
      <div class="form-hint mt-2">Switching reloads the page.</div>
    </div>`;
  } catch (e) { body.innerHTML = '<div class="empty">Load failed: ' + esc(e.message) + '</div>'; }
}
async function switchTheme(theme) {
  try {
    await ENDPOINTS.setTheme(theme);
    location.reload();
  } catch (e) { toast(e.message, 'err'); }
}

/* ---- 配置字段（password 字段掩码哨兵；数值/布尔类型按后端契约） ---- */
async function renderConfigFields(body) {
  try {
    const r = await ENDPOINTS.configFields();
    const fields = Array.isArray(r) ? r : (r.fields || []);
    if (!fields.length) { body.innerHTML = '<div class="empty">No configurable fields</div>'; return; }
    body.innerHTML = `<div style="padding:18px 20px">
      <div class="form-row">${fields.map((f, i) => `
        <div class="form-group">
          <label>${esc(f.name || f.key || '')}</label>
          ${f.type === 'password'
            ? `<div><input type="password" id="cf-${i}" data-fname="${esc(f.name)}" autocomplete="off" placeholder="${f.value ? 'Leave empty to keep current' : ''}">
               ${f.name === 'api_key' && f.value ? `<label class="checkbox-line mt-1" style="font-size:12px"><input type="checkbox" id="cf-clear-${i}"> Clear API key (disables auth)</label>` : ''}</div>`
            : f.type === 'number'
              ? `<input type="number" id="cf-${i}" data-fname="${esc(f.name)}" value="${esc(f.value ?? '')}">`
              : f.type === 'bool'
                ? `<label class="checkbox-line"><input type="checkbox" id="cf-${i}" data-fname="${esc(f.name)}" ${f.value ? 'checked' : ''}> Enabled</label>`
                : `<input type="text" id="cf-${i}" data-fname="${esc(f.name)}" value="${esc(f.value ?? '')}">`}
          ${f.prompt ? `<div class="form-hint">${esc(f.prompt)}</div>` : ''}
        </div>`).join('')}
      </div>
      <div class="flex gap-2" style="justify-content:flex-end"><button class="btn primary" onclick="saveConfigFields()">Save</button></div>
    </div>`;
  } catch (e) { body.innerHTML = '<div class="empty">Load failed: ' + esc(e.message) + '</div>'; }
}

async function saveConfigFields() {
  // 后端契约：{fields: {fieldName: stringValue}}——缺失字段/空值/__KEEP_OLD__ 均保留旧值；__CLEAR__ 清空；掩码值拒绝
  const data = {};
  const inputs = document.querySelectorAll('#settingsBody [id^="cf-"]');
  for (const el of inputs) {
    const fname = el.dataset.fname;
    if (!fname) continue;
    if (el.type === 'password') {
      const v = el.value.trim();
      if (v === '') {
        // 留空 = 保留旧值（不发）；仅当显式勾选 Clear 复选框才清空 api_key（关闭认证）
        const clearBox = document.getElementById('cf-clear-' + el.id.slice(3));
        if (clearBox && clearBox.checked) data[fname] = '__CLEAR__';
        continue;
      }
      if (v.includes('•••')) return toast('Password field: masked placeholder detected, leave empty to keep current', 'warn');
      data[fname] = v;
      // api_key 变更后旧 JWT 失效，清掉本地会话
      if (fname === 'api_key') { localStorage.removeItem('tmd_jwt_token'); localStorage.removeItem('tmd_jwt_expiry'); }
    } else if (el.type === 'checkbox') {
      data[fname] = el.checked ? 'true' : 'false';
    } else {
      data[fname] = el.value;
    }
  }
  try {
    await ENDPOINTS.saveConfigFields({ fields: data });
    toast('Configuration saved (restart to apply)', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

/* ---- Cookies（data-orig 比较 + __KEEP_OLD__ 哨兵） ---- */
async function renderCookies(body) {
  let cookies;
  try { cookies = await ENDPOINTS.cookies(); }
  catch (e) {
    body.innerHTML = '<div class="empty">Failed to load cookies: ' + esc(e.message) + '</div>';
    return;
  }
  const cArr = Array.isArray(cookies) ? cookies : ((cookies && cookies.items) || []);
  body.innerHTML = `<div style="padding:18px 20px">
    ${cArr.length === 0 ? '<div class="empty" style="padding:20px">No additional cookies configured.</div>' : ''}
    <div id="cookiesForm">${cArr.map((c, i) => `
      <div class="form-row">
        <div class="form-group"><label>auth_token</label><input type="text" id="ck-at-${i}" value="${jsEsc(c.auth_token || '')}" data-orig="${jsEsc(c.auth_token || '')}" data-index="${jsEsc(c.index != null ? c.index : '')}" placeholder="empty = clear" style="font-family:var(--mono);font-size:12px"></div>
        <div class="form-group"><label>ct0</label><input type="text" id="ck-ct0-${i}" value="${jsEsc(c.ct0 || '')}" data-orig="${jsEsc(c.ct0 || '')}" data-index="${jsEsc(c.index != null ? c.index : '')}" placeholder="empty = clear" style="font-family:var(--mono);font-size:12px"></div>
      </div>`).join('')}</div>
    <div class="flex gap-2" style="margin-top:12px">
      <button class="btn ghost sm" onclick="addCookieRow()">+ Add Account</button>
      <span style="flex:1"></span>
      <button class="btn primary" onclick="saveCookies()">Save</button>
    </div>
  </div>`;
}
function addCookieRow() {
  const form = document.getElementById('cookiesForm');
  if (!form) return;
  const idx = form.children.length;
  const div = document.createElement('div');
  div.className = 'form-row';
  div.innerHTML = `<div class="form-group"><label>auth_token</label><input type="text" id="ck-at-${idx}" placeholder="empty = clear" style="font-family:var(--mono);font-size:12px"></div>
    <div class="form-group"><label>ct0</label><input type="text" id="ck-ct0-${idx}" placeholder="empty = clear" style="font-family:var(--mono);font-size:12px"></div>`;
  form.appendChild(div);
}
async function saveCookies() {
  const rows = [...document.querySelectorAll('#cookiesForm .form-row')];
  const list = [];
  for (let i = 0; i < rows.length; i++) {
    const atEl = rows[i].querySelector('[id^="ck-at-"]');
    const ct0El = rows[i].querySelector('[id^="ck-ct0-"]');
    if (!atEl) continue;
    const at = atEl.value, ct0 = ct0El ? ct0El.value : '';
    const origAt = atEl.dataset.orig || '', origCt0 = ct0El ? (ct0El.dataset.orig || '') : '';
    const keepAt = origAt !== '' && at === origAt;
    const keepCt0 = origCt0 !== '' && ct0 === origCt0;
    if (origAt === '' && origCt0 === '' && !at.trim() && !ct0.trim()) continue;
    if (!keepAt && !keepCt0 && !at.trim() && !ct0.trim()) return toast('Account #' + (i + 1) + ': auth_token and ct0 cannot both be empty', 'warn');
    // 携带服务器 index（后端 __KEEP_OLD__ 按 index 优先，位置兜底）；*int 需数字
    const idx = atEl.dataset.index || ct0El?.dataset.index || '';
    const idxNum = idx === '' ? undefined : Number(idx);
    list.push({ index: idxNum, auth_token: keepAt ? '__KEEP_OLD__' : at, ct0: keepCt0 ? '__KEEP_OLD__' : ct0 });
  }
  if (!list.length) return toast('Nothing to save', 'warn');
  try { await ENDPOINTS.saveCookies(list); toast('Cookies saved', 'ok'); settingsSwitch('cookies'); } catch (e) { toast(e.message, 'err'); }
}

/* ---- Security（JWT 状态 + API Key，不持久化 key） ---- */
function getJWTStatus() {
  const jwt = localStorage.getItem('tmd_jwt_token');
  const exp = localStorage.getItem('tmd_jwt_expiry');
  if (!jwt) return { label: 'No session', cls: '' };
  if (!exp) return { label: 'Active (no expiry)', cls: 'ok' };
  const ms = new Date(exp) - new Date();
  if (isNaN(ms) || ms <= 0) return { label: 'Expired', cls: 'err' };
  return { label: 'Expires in ~' + Math.max(1, Math.round(ms / 60000)) + ' min', cls: 'ok' };
}
async function renderSecurity(body) {
  const st = getJWTStatus();
  body.innerHTML = `<div style="padding:18px 20px;max-width:520px">
    <div class="form-group"><label>Session</label><span class="badge ${st.cls === 'ok' ? 'badge-completed' : st.cls === 'err' ? 'badge-failed' : ''}">${esc(st.label)}</span></div>
    <div class="form-group"><label>API Key</label><input type="password" id="secKey" placeholder="Enter API Key" autocomplete="off"></div>
    <div class="form-hint" style="margin-bottom:12px">API Key is never stored in the browser — only the JWT session.</div>
    <div class="flex gap-2">
      <button class="btn primary" onclick="secLogin()">Login</button>
      <button class="btn ghost" onclick="secTest()">Test</button>
      <button class="btn ghost" onclick="secRefresh()">Refresh</button>
      <button class="btn danger ghost" onclick="secClear()">Clear</button>
    </div>
    <div class="form-hint mt-2" id="secStatus"></div>
  </div>`;
  renderServerSection(body);
}
function secStatus(msg, cls) { const el = document.getElementById('secStatus'); if (el) { el.textContent = msg; el.style.color = cls ? 'var(--' + cls + ')' : ''; } }
async function secLogin() {
  const key = document.getElementById('secKey').value.trim();
  if (!key) return secStatus('Please enter the API key', 'warn');
  try {
    const r = await ENDPOINTS.authLogin(key);
    localStorage.setItem('tmd_jwt_token', r.token);
    if (r.expires_at) localStorage.setItem('tmd_jwt_expiry', r.expires_at);
    document.getElementById('secKey').value = '';
    secStatus('Authenticated', 'ok');
    renderSecurity(document.getElementById('settingsBody'));
    // 建立/恢复 SSE（此前可能因无 token 暂停）
    if (!sseSource) connectSSE();
  } catch (e) { secStatus(e.message, 'err'); }
}
async function secTest() {
  const key = document.getElementById('secKey').value.trim();
  if (!key) return secStatus('Enter the API key first', 'warn');
  try {
    const res = await fetchWithTimeout(apiBase() + '/api/v1/tasks', { headers: { 'Authorization': 'Bearer ' + key } });
    if (res.ok) secStatus('API key works', 'ok');
    else if (res.status === 401) secStatus('API key rejected (401)', 'err');
    else secStatus('Server returned ' + res.status, 'warn');
  } catch (e) { secStatus('Network error: ' + e.message, 'err'); }
}
async function secRefresh() {
  const r = await API._tryRefreshJWT();
  secStatus(r.ok ? 'Session refreshed' : 'Refresh failed', r.ok ? 'ok' : 'err');
  renderSecurity(document.getElementById('settingsBody'));
}
function secClear() {
  localStorage.removeItem('tmd_jwt_token');
  localStorage.removeItem('tmd_jwt_expiry');
  secStatus('Session cleared', 'ok');
  renderSecurity(document.getElementById('settingsBody'));
}

// Server 控制（Settings → Security tab 底部）
function renderServerSection(body) {
  const div = document.createElement('div');
  div.className = 'form-group';
  div.style.cssText = 'margin-top:28px;padding-top:20px;border-top:1px solid var(--glass-border)';
  div.innerHTML = `<div class="section-title" style="margin-bottom:10px">Server</div>
    <button class="btn danger" onclick="shutdownServer()">Shut Down Server</button>
    <div class="form-hint" style="margin-top:6px">Stops the server process. The web UI will disconnect.</div>`;
  body.appendChild(div);
}
async function shutdownServer() {
  if (!confirm('Shut down the server now?')) return;
  try { await ENDPOINTS.shutdown(); toast('Shutdown requested', 'warn', 10000); } catch (e) { toast(e.message, 'err'); }
}

/* ---- Raw config ---- */
async function renderRawConfig(body) {
  try {
    const r = await ENDPOINTS.configRaw();
    body.innerHTML = `<div style="padding:16px 20px">
      <textarea id="rawConfigText" rows="22" style="font-family:var(--mono);font-size:12.5px">${esc(r.content || '')}</textarea>
      <div class="flex gap-2" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" onclick="saveRawConfig()">Save</button></div>
    </div>`;
  } catch (e) { body.innerHTML = '<div class="empty">Load failed: ' + esc(e.message) + '</div>'; }
}
async function saveRawConfig() {
  try { await ENDPOINTS.saveConfigRaw(document.getElementById('rawConfigText').value); toast('Configuration saved (restart to apply)', 'ok'); } catch (e) { toast(e.message, 'err'); }
}

/* ---------- Logs 页 ---------- */
let logState = { level: '', domain: '', q: '', startTime: '', endTime: '', paused: false, page: 1, totalPages: 1, gen: 0, prepended: 0, loadingMore: false };
let logSSE = null;
let logReconnectAttempts = 0;
const LOG_MAX_LINES = 5000;

function logLineInWindow(clean) {
  if (!logState.startTime && !logState.endTime) return true;
  // logrus TextFormatter：time="2026-08-03T20:00:00+08:00" 或 [2026-08-03T...] 两种格式都匹配
  const m = clean.match(/(?:time="|\[)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[^"\]\s]*)?)/);
  if (!m) return true;
  const t = new Date(m[1]).getTime();
  if (isNaN(t)) return true;
  if (logState.startTime && t < new Date(logState.startTime).getTime()) return false;
  if (logState.endTime && t > new Date(logState.endTime).getTime()) return false;
  return true;
}

function renderLogs(root) {
  // 重新进入页面：控件回填当前过滤状态（与 web2 一致——保留用户筛选意图，显示与请求条件一致）
  root.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2>Logs</h2>
        <div class="page-actions">
          <button class="btn ghost sm" onclick="logRefresh()">Refresh</button>
          <button class="btn ghost sm" onclick="logExport()">Export</button>
          <button class="btn ghost sm" onclick="toggleLogPause()" id="logPauseBtn">Pause</button>
        </div>
      </div>
      <div class="glass card">
        <div class="filter-bar">
          <div class="tabs" id="logStatsBar" style="display:none"></div>
          <select id="logLevel" onchange="logApplyFilters()">
            <option value="">All levels</option>
            ${['debug','info','warn','error','fatal'].map(l => `<option value="${l}">${l.toUpperCase()}</option>`).join('')}
          </select>
          <select id="logDomain" onchange="logApplyFilters()">
            <option value="">All domains</option>
          </select>
          <input type="text" id="logQ" placeholder="search text..." style="width:150px" onkeydown="if(event.key==='Enter')logApplyFilters()">
          <input type="datetime-local" id="logStart" title="From time" style="width:170px">
          <input type="datetime-local" id="logEnd" title="To time" style="width:170px">
          <button class="btn primary sm" onclick="logApplyFilters()">Filter</button>
        </div>
        <div class="log-stream" id="logStream"><div class="text-muted">Loading...</div></div>
      </div>
    </div>`;
  logStartStream();
}

function logApplyFilters() {
  logState.level = document.getElementById('logLevel').value;
  logState.domain = document.getElementById('logDomain').value;
  logState.q = document.getElementById('logQ').value.trim();
  logState.startTime = toRFC3339(document.getElementById('logStart').value);
  logState.endTime = toRFC3339(document.getElementById('logEnd').value);
  logState.page = 1;
  logState.gen++;
  disconnectLogSSE();
  logRefresh();
}

async function logRefresh() {
  logState.page = 1;
  logState.prepended = 0;
  logState.gen++; // 代际递增：作废在途 loadMore（Refresh 与筛选一致）
  logState.loadingMore = false;
  await logLoadReplace();
  if (!logSSE) logConnect();
}

function logParams(page) {
  const p = { page, pageSize: 200 };
  if (logState.level) p.level = logState.level;
  if (logState.domain) p.domain = logState.domain;
  if (logState.q) p.q = logState.q;
  if (logState.startTime) p.start_time = logState.startTime;
  if (logState.endTime) p.end_time = logState.endTime;
  return p;
}

function logEntryHTML(clean, tweetId, color) {
  let html = '<div class="log-entry" style="color:' + color + '"';
  if (tweetId) html += ' data-tweet-id="' + tweetId + '"';
  html += '>' + esc(clean);
  if (tweetId) html += ' <button class="log-copy-btn" onclick="copyLogTweetId(this)" title="Copy tweet ID">📋</button>';
  html += '</div>';
  return html;
}
function copyLogTweetId(btn) {
  const id = btn.closest('.log-entry')?.dataset.tweetId;
  if (!id) return;
  navigator.clipboard.writeText(id).then(() => toast('Copied: ' + id, 'ok')).catch(() => toast('Copy failed', 'warn'));
}

async function logLoadReplace() {
  const stream = document.getElementById('logStream');
  if (!stream) return;
  const gen = logState.gen;
  try {
    const r = await ENDPOINTS.logs(logParams(1));
    if (gen !== logState.gen) return;
    logState.totalPages = r.totalPages || 1;
    // 后端返回 newest-first，反转成 oldest→newest（与 loadMore 前置页、SSE 追加方向一致）
    stream.innerHTML = (r.logs || []).reverse().map(l => {
      const clean = stripAnsi(l);
      const tweetId = (clean.match(/tweet_id=(\d+)/) || [])[1];
      const color = clean.includes('ERROR') || clean.includes('FATA') ? 'var(--err)' : clean.includes('WARN') ? 'var(--warn)' : '';
      return logEntryHTML(clean, tweetId, color);
    }).join('') || '<div class="text-muted">No log lines match the filter.</div>';
    stream.scrollTop = stream.scrollHeight;
  } catch (e) {
    if (gen !== logState.gen) return;
    stream.innerHTML = '<div class="text-err">Load failed: ' + esc(e.message) + '</div>';
  }
}

async function logLoadMore() {
  if (logState.loadingMore || logState.page >= logState.totalPages) return;
  logState.loadingMore = true;
  const stream = document.getElementById('logStream');
  const gen = logState.gen;
  const nextPage = logState.page + 1;
  logState.page = nextPage;
  try {
    const r = await ENDPOINTS.logs(logParams(nextPage));
    if (gen !== logState.gen) return;
    const lines = (r.logs || []).reverse();
    const oldHeight = stream.scrollHeight;
    const html = lines.map(l => {
      const clean = stripAnsi(l);
      const tweetId = (clean.match(/tweet_id=(\d+)/) || [])[1];
      const color = clean.includes('ERROR') || clean.includes('FATA') ? 'var(--err)' : clean.includes('WARN') ? 'var(--warn)' : '';
      return logEntryHTML(clean, tweetId, color);
    }).join('');
    stream.innerHTML = html + stream.innerHTML;
    logState.prepended += lines.length;
    stream.scrollTop = (stream.scrollHeight - oldHeight) + stream.scrollTop;
    logState.totalPages = r.totalPages || 1;
  } catch (e) {
    if (gen !== logState.gen) return;
    logState.page--;
  } finally {
    logState.loadingMore = false;
  }
}

function trimLogStream() {
  const stream = document.getElementById('logStream');
  if (!stream) return;
  // 上限 = 基础行数 + 前置页配额（最多再借 LOG_MAX_LINES）：既保护 loadMore 旧页不被立即削掉，
  // 又避免 prepended 随回翻次数无限膨胀 DOM
  const cap = LOG_MAX_LINES + Math.min(logState.prepended, LOG_MAX_LINES);
  while (stream.children.length > cap) stream.removeChild(stream.firstChild);
}

function toggleLogPause() {
  logState.paused = !logState.paused;
  const btn = document.getElementById('logPauseBtn');
  if (btn) btn.textContent = logState.paused ? 'Resume' : 'Pause';
  if (!logState.paused) logRefresh();
}
function logRefreshManual() { logState.paused = false; const btn = document.getElementById('logPauseBtn'); if (btn) btn.textContent = 'Pause'; logRefresh(); }

function logConnect() {
  if (logSSE || document.getElementById('logStream') === null) return;
  const params = new URLSearchParams();
  if (logState.level) params.append('level', logState.level);
  if (logState.domain) params.append('domain', logState.domain);
  if (logState.q) params.append('q', logState.q);
  if (logState.startTime) params.append('start_time', logState.startTime);
  if (logState.endTime) params.append('end_time', logState.endTime);
  const jwt = localStorage.getItem('tmd_jwt_token');
  if (jwt) params.append('token', jwt);
  const source = new EventSource(apiBase() + '/api/v1/logs/stream?' + params.toString());
  logSSE = source;
  source.onopen = () => { logReconnectAttempts = 0; };
  source.addEventListener('log', (e) => {
    logReconnectAttempts = 0;
    const stream = document.getElementById('logStream');
    if (!stream) return;
    const clean = stripAnsi(e.data);
    if (!logLineInWindow(clean)) return;
    if (logState.paused) return;
    const wrapper = document.createElement('div');
    const tweetId = (clean.match(/tweet_id=(\d+)/) || [])[1];
    const color = clean.includes('ERROR') || clean.includes('FATA') ? 'var(--err)' : clean.includes('WARN') ? 'var(--warn)' : '';
    wrapper.innerHTML = logEntryHTML(clean, tweetId, color);
    const stick = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 40;
    stream.appendChild(wrapper.firstChild);
    trimLogStream();
    if (stick) stream.scrollTop = stream.scrollHeight;
  });
  source.onerror = () => {
    if (source !== logSSE) return;
    logSSE = null;
    source.close();
    logReconnectAttempts++;
    if (logReconnectAttempts >= 60) return;
    setTimeout(logConnect, Math.min(1000 * Math.pow(1.5, Math.min(logReconnectAttempts, 8)), 30000));
  };
}
function disconnectLogSSE() {
  if (logSSE) { logSSE.close(); logSSE = null; }
  logReconnectAttempts = 0;
}
function logStartStream() {
  // 控件回填当前过滤状态（重进页面后显示与请求条件一致，不丢用户筛选意图）
  const lvl = document.getElementById('logLevel'); if (lvl) lvl.value = logState.level;
  const dom = document.getElementById('logDomain'); if (dom) dom.value = logState.domain;
  const q = document.getElementById('logQ'); if (q) q.value = logState.q;
  const toLocalInput = (iso) => { const d = new Date(iso); if (isNaN(d.getTime())) return ''; const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  const st = document.getElementById('logStart'); if (st) st.value = toLocalInput(logState.startTime);
  const en = document.getElementById('logEnd'); if (en) en.value = toLocalInput(logState.endTime);
  const pauseBtn = document.getElementById('logPauseBtn');
  if (pauseBtn) pauseBtn.textContent = logState.paused ? 'Resume' : 'Pause';
  logRefresh();
  logLoadStats();
  const stream = document.getElementById('logStream');
  if (stream && !stream.dataset.scrollBound) {
    stream.dataset.scrollBound = '1';
    stream.addEventListener('scroll', () => { if (stream.scrollTop < 60) logLoadMore(); });
  }
}

// 日志级别统计条（/api/v1/logs/stats）
async function logLoadStats() {
  try {
    const r = await ENDPOINTS.logStats();
    const counts = r && (r.counts || r.levels) ? (r.counts || r.levels) : r;
    if (!counts || typeof counts !== 'object') return;
    const bar = document.getElementById('logStatsBar');
    if (!bar) return;
    const entries = Object.entries(counts).filter(([, v]) => v > 0);
    if (!entries.length) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    bar.innerHTML = entries.map(([level, n]) => {
      const lv = String(level).toLowerCase();
      const cls = lv === 'error' || lv === 'fatal' ? 'err' : lv === 'warn' ? 'warn' : '';
      return `<span class="chip ${cls}">${esc(level)} ${n}</span>`;
    }).join('');
  } catch (e) { /* 统计非关键路径 */ }
}
async function logExport() {
  try {
    const res = await fetchWithTimeout(apiBase() + '/api/v1/logs/export', { headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('tmd_jwt_token') || '') } }, 60000);
    if (!res.ok) throw new Error('Export failed (HTTP ' + res.status + ')');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tmd2.log';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------- Dashboard ---------- */
function renderDashboard(root) {
  root.innerHTML = `
    <div class="page">
      <div class="stats-grid" id="dashStats">
        <div class="stat-card glass card-hover accent"><div class="stat-value" data-stat="status">—</div><div class="stat-label">System Status</div></div>
        <div class="stat-card glass card-hover info"><div class="stat-value" data-stat="running">—</div><div class="stat-label">Running</div></div>
        <div class="stat-card glass card-hover warn"><div class="stat-value" data-stat="queued">—</div><div class="stat-label">Queued</div></div>
        <div class="stat-card glass card-hover ok"><div class="stat-value" data-stat="completed">—</div><div class="stat-label">Completed</div></div>
        <div class="stat-card glass card-hover err"><div class="stat-value" data-stat="failed">—</div><div class="stat-label">Failed</div></div>
        <div class="stat-card glass card-hover"><div class="stat-value" data-stat="queue">—</div><div class="stat-label">Queue Depth</div></div>
      </div>

      <div class="glass card">
        <div class="filter-bar">
          <input type="text" id="quickDlInput" placeholder="Twitter URL or @username ..." style="flex:1;min-width:200px" onkeydown="if(event.key==='Enter')quickDownload()">
          <button class="btn primary" onclick="quickDownload()">Quick Download</button>
        </div>
      </div>

      <div>
        <div class="section-title">Recent Tasks</div>
        <div class="glass card" id="dashTasks"></div>
      </div>
    </div>`;
  loadDashboard();
}

function loadDashboard() {
  refreshStats();
  checkHealth();
  ENDPOINTS.queueStatus().then(q => { state.queue = q; updateStat('queue', q.queue_depth ?? '—'); }).catch(() => {});
  renderRecentTasks();
}

function updateStat(key, val) {
  const el = document.querySelector('[data-stat="' + key + '"]');
  if (el && el.textContent !== String(val)) el.textContent = val;
}

function refreshStats() {
  const stats = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  pageTasks.forEach(t => { if (stats[t.status] !== undefined) stats[t.status]++; });
  updateStat('running', stats.running);
  updateStat('queued', stats.queued);
  updateStat('completed', stats.completed);
  updateStat('failed', stats.failed);
}

function renderRecentTasks() {
  const el = document.getElementById('dashTasks');
  if (!el) return;
  const sorted = [...pageTasks].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const recent = sorted.slice(0, 5);
  if (!recent.length) {
    el.innerHTML = '<div class="empty"><div class="empty-title">No tasks yet</div><div class="empty-desc">Start a download to see tasks here</div></div>';
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Type</th><th>ID</th><th>Status</th><th>Progress</th><th>Time</th></tr></thead>
    <tbody>${recent.map(t => `
      <tr>
        <td>${esc(taskTypeIcon(t))}</td>
        <td><span class="mono">${esc(t.task_id)}</span><div class="text-sm text-muted">${esc(taskTypeName(t))}${taskTarget(t) ? ' · ' + esc(taskTarget(t)) : ''}</div></td>
        <td><span class="badge badge-${safeStatus(t.status)}">${esc(t.status)}</span></td>
        <td style="min-width:160px">${progressHTML(t)}</td>
        <td><span class="text-sm">${esc(relTime(t.created_at))}</span></td>
      </tr>`).join('')}</tbody></table></div>`;
}

function progressHTML(t) {
  const pct = getTaskPct(t);
  const cls = t.status === 'failed' ? 'err' : (pct === 100 ? 'ok' : '');
  return `<div class="progress"><div class="progress-track"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div><span class="progress-text">${pct}%${esc(getStageText(t.progress && t.progress.stage))}</span></div>`;
}

let _dlBusy = false;
async function quickDownload() {
  if (_dlBusy) return;
  const input = document.getElementById('quickDlInput');
  if (!input) return;
  let value = input.value.trim();
  if (!value) return toast('Enter a Twitter username or URL', 'warn');
  _dlBusy = true;
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Quick Download'));
  if (btn) { btn.disabled = true; }
  try {
    const listMatch = value.match(/https?:\/\/(?:twitter\.com|x\.com)\/i\/lists\/(\d+)/);
    if (listMatch) {
      await ENDPOINTS.listDownload(listMatch[1], { auto_follow: true });
      toast('List download task created', 'ok');
    } else {
      const userMatch = value.match(/https?:\/\/(?:twitter\.com|x\.com)\/([^/\s?]+)/);
      if (userMatch) {
        const reserved = ['i','search','status','home','explore','notifications','messages','settings','compose','bookmarks','lists','following'];
        if (reserved.includes(userMatch[1].toLowerCase())) {
          return toast('Could not extract username from URL', 'warn'); // 保留字路径（如 /i/status/…）不当作用户名提交
        }
        value = userMatch[1];
      }
      if (value.startsWith('@')) value = value.slice(1);
      if (!value) return toast('Could not extract username from URL', 'warn');
      await ENDPOINTS.userDownload(value, { auto_follow: true });
      toast('Download task created for @' + value, 'ok');
    }
    input.value = '';
  } catch (e) { toast(e.message, 'err'); }
  finally {
    _dlBusy = false;
    if (btn) { btn.disabled = false; }
  }
}

/* ---------- Health ---------- */
async function checkHealth() {
  try {
    const h = await ENDPOINTS.health();
    state.health = h;
    const dot = document.getElementById('healthDot');
    const text = document.getElementById('healthText');
    const status = h.status || 'OK';
    dot.className = 'health-dot ' + (status === 'ok' ? 'ok' : 'warn');
    text.textContent = status === 'ok' ? 'Online' : status;
    updateStat('status', status === 'ok' ? 'Online' : status);
    document.getElementById('versionInfo').textContent = h.version || 'v0';
  } catch (e) {
    document.getElementById('healthDot').className = 'health-dot err';
    document.getElementById('healthText').textContent = (e.status === 401) ? 'Auth required' : 'Offline';
    updateStat('status', (e.status === 401) ? 'Auth required' : 'Offline');
  }
}

/* ---------- SSE ---------- */
let sseSource = null;
let sseReconnectDelay = 2000;
let sseReconnectTimer = null;
function updateSseBadge(ok) {
  state.sseConnected = ok;
  const el = document.getElementById('sseBadge');
  if (!el) return;
  el.className = 'sse-badge ' + (ok ? 'live' : 'off');
  el.textContent = ok ? 'Live' : 'Reconnecting…';
}
function connectSSE() {
  if (sseSource) return;
  const jwt = localStorage.getItem('tmd_jwt_token');
  const params = new URLSearchParams();
  if (jwt) params.append('token', jwt);
  sseSource = new EventSource(apiBase() + '/api/v1/sse/tasks?' + params.toString());
  sseSource.onopen = () => { sseReconnectDelay = 2000; updateSseBadge(true); checkHealth(); };
  sseSource.onerror = () => {
    updateSseBadge(false);
    if (sseSource) { sseSource.close(); sseSource = null; }
    const jwt = localStorage.getItem('tmd_jwt_token');
    if (!jwt) {
      // 无 token：认证框打开时暂停（避免后台噪音），否则退避重连（免认证部署常态）
      if (_authDialogOpen) return;
      sseReconnectTimer = setTimeout(connectSSE, Math.min(sseReconnectDelay *= 2, 30000));
      return;
    }
    // 有 token：刷新失败时用 auth/check 区分「会话失效（401 → 弹认证框）」与「网络故障（静默重连）」
    API._tryRefreshJWT().then(r => {
      if (r.ok) { sseReconnectDelay = 2000; connectSSE(); return; }
      fetchWithTimeout(apiBase() + '/api/v1/auth/check', { headers: { 'Authorization': 'Bearer ' + jwt } })
        .then(res => {
          if (res.status === 401) { showAuth('Session expired - please re-authenticate'); return; }
          sseReconnectTimer = setTimeout(connectSSE, Math.min(sseReconnectDelay *= 2, 30000));
        })
        .catch(() => { sseReconnectTimer = setTimeout(connectSSE, Math.min(sseReconnectDelay *= 2, 30000)); });
    });
  };
  sseSource.addEventListener('tasks', throttle((e) => {
    try {
      pageTasks = JSON.parse(e.data) || [];
      refreshStats();
      if (state.page === 'dashboard') renderRecentTasks();
      if (state.page === 'tasks') updateTasksUI();
    } catch (err) { /* 忽略坏帧 */ }
  }, 300));
  sseSource.addEventListener('notification', (e) => {
    try { const n = JSON.parse(e.data); if (n && n.message) toast(n.message, n.level === 'error' ? 'err' : 'info'); } catch (err) {}
  });
  sseSource.addEventListener('server_shutdown', () => {
    if (sseSource) { sseSource.close(); sseSource = null; }
    toast('Server is shutting down', 'warn', 10000);
    updateSseBadge(false);
  });
}

/* ---------- 初始化 ---------- */
async function init() {
  // hash 路由：主题切换器 reload 后保留 hash，必须从 hash 恢复当前页
  window.addEventListener('hashchange', () => {
    setState({ page: currentPageFromHash() });
    renderPage();
  });
  document.getElementById('menuToggle').onclick = openSidebar;
  document.getElementById('sidebarClose').onclick = closeSidebar;
  document.getElementById('sidebarOverlay').onclick = closeSidebar;
  // brand logo：走 hash 路由而非整页刷新（避免丢 SSE/状态，兼容 TMD_DEV_BASE）
  document.querySelectorAll('[data-page-link]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); navigateTo(el.dataset.pageLink); });
  });
  document.getElementById('authSubmit').onclick = submitAuth;
  document.getElementById('authCancel').onclick = hideAuth;
  document.getElementById('authKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });

  setState({ page: currentPageFromHash() });
  renderPage();
  checkHealth(); // 全局健康检查：左下角状态不依赖 Dashboard 页加载（直接进其它页或主题切换回原页时也要更新）

  // 认证探测：有 JWT 先轻量校验，无 JWT 探测 tasks；均用 REST 兜底填充初始任务快照（SSE 未建立时不显示误导空态）
  const jwt = localStorage.getItem('tmd_jwt_token');
  try {
    if (jwt) {
      await ENDPOINTS.authCheck();
    } else {
      await ENDPOINTS.tasks();
    }
  } catch (e) {
    // 无 JWT 且服务器要求认证：必须弹登录框（401 在有 JWT 时由 _fetch 处理，无 JWT 时这里兜底）
    if (!jwt && (e.status === 401 || e.message === 'unauthorized')) showAuth('Authentication required');
    /* 网络失败不阻塞启动 */
  }
  try {
    const t = await ENDPOINTS.tasks();
    if (Array.isArray(t)) { pageTasks = t; refreshStats(); if (state.page === 'dashboard') renderRecentTasks(); if (state.page === 'tasks') updateTasksUI(); }
  } catch (e) { /* 忽略 */ }
  connectSSE();
}

document.addEventListener('DOMContentLoaded', init);
