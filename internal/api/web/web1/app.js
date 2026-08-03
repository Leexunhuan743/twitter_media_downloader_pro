// ============================================
// Init guard — 初始化完成前忽略 SSE 任务事件以消除竞态
// ============================================
let _initComplete = false;
let _initPromise = null;
let _jwtRefreshInterval = null;
let _logGen = 0; // 日志分页代际：refresh/筛选变化时递增，丢弃过期 loadMore 响应
let _tasksEpoch = 0; // 任务快照代际：SSE 应用新快照时递增，丢弃在途 GET /tasks 旧响应
let _logBatch = []; // 日志流批量追加缓冲（rAF 合并）
let _logFlushRAF = null;
let _prependedCount = 0; // loadMore 前置的日志行数（SSE trim 时保留，防刚加载的旧页被削掉）

// ============================================
// Utility Functions
// ============================================
function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn.apply(this, args); }, delay);
  };
}

function glowNewFirstItem(panelId) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const first = panel.querySelector('.config-group');
    if (!first) return;
    first.classList.add('glow-new-item');
    first.addEventListener('animationend', () => first.classList.remove('glow-new-item'), { once: true });
  }));
}

function readListIDsFromTextarea(inputId) {
  const validListID = /^[1-9]\d{0,19}$/;
  const input = document.getElementById(inputId);
  if (!input) return [];
  const lines = input.value.split('\n').map(s => s.trim());
  const validIDs = [];
  const invalidCount = lines.filter(s => s && !validListID.test(s)).length;
  lines.forEach(s => { if (validListID.test(s)) validIDs.push(s); });
  if (invalidCount > 0) {
    toast.show(`发现 ${invalidCount} 个无效列表ID，已自动过滤`, 'warning');
  }
  return validIDs;
}

function readTextareaLines(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return [];
  return el.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

// ============================================
// Search Input Helpers
// ============================================
function updateSearchState(stateKey, subKey, value) {
  if (subKey) {
    store.setState({
      [stateKey]: { ...store.state[stateKey], [subKey]: value }
    });
  } else {
    store.setState({ [stateKey]: value });
  }
}

function restoreSearchValue(inputId, stateKey, subKey = null) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const value = subKey ? store.state[stateKey]?.[subKey] : store.state[stateKey];
  if (value !== undefined) {
    input.value = value;
  }
}

// ============================================
// State Management
// ============================================
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    // 原型污染防护：__proto__/constructor 键不进入状态树
    if (key === '__proto__' || key === 'constructor') continue;
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

const store = {
  state: {
    currentPage: null,
    health: null,
    tasks: [],
    users: [],
    lists: [],
    entities: [],
    sidebarOpen: false,
    isMobile: window.innerWidth < 768,
    sseConnected: false,
    dataSubPage: 'users',
    taskFilter: 'all',
    taskStageFilter: 'all',
    taskSearch: '',
    // Database pagination state
    dbData: {
      users: { data: [], total: 0, page: 1, pageSize: 200 },
      lists: { data: [], total: 0, page: 1, pageSize: 200 },
      entities: { data: [], total: 0, page: 1, pageSize: 200 },
      listEntities: { data: [], total: 0, page: 1, pageSize: 200 },
      userLinks: { data: [], total: 0, page: 1, pageSize: 200 },
      previousNames: { data: [], total: 0, page: 1, pageSize: 200 }
    },
    dbPagination: {
      users: { page: 1, pageSize: 200, totalPages: 1 },
      lists: { page: 1, pageSize: 200, totalPages: 1 },
      entities: { page: 1, pageSize: 200, totalPages: 1 },
      listEntities: { page: 1, pageSize: 200, totalPages: 1 },
      userLinks: { page: 1, pageSize: 200, totalPages: 1 },
      previousNames: { page: 1, pageSize: 200, totalPages: 1 }
    },
    dbSort: {
      users: { sortBy: 'id', sortOrder: 'desc' },
      lists: { sortBy: 'id', sortOrder: 'desc' },
      entities: { sortBy: 'id', sortOrder: 'desc' },
      listEntities: { sortBy: 'id', sortOrder: 'desc' },
      userLinks: { sortBy: 'id', sortOrder: 'desc' },
      previousNames: { sortBy: 'record_date', sortOrder: 'desc' }
    },
    dbSearch: {
      users: '',
      lists: '',
      entities: '',
      listEntities: '',
      userLinks: '',
      previousNames: ''
    },
    dbLoading: {},
    dbError: {},
    _prevNameUserIdFilter: '',
    _relUserIdFilter: '',
    _relListIdFilter: '',
    configRaw: null,
    configExists: false,
    configSaving: false,
    configFieldsLoading: false,
    logLevel: 'all',
    logDomain: 'all',
    logPaused: false,
    logPausedCount: 0,
    logSearch: '',
    logStats: { debug: 0, info: 0, warn: 0, error: 0, total: 0 },
    logPage: 1,
    logTotalPages: 1,
    _systemTab: 'config',
    configMode: 'form',
    configFields: null,
    cookiesRaw: null,
    cookiesExists: false,
    cookiesSaving: false,
    cookieItems: null,
    _cookiesLoading: false,
    cookiesMode: 'form',
    _scheduleTab: 'form',
    _schedules: null,
    _schedulesLoading: false,
    _scheduleRaw: null,
    _scheduleExists: false,
    _scheduleSaving: false,
    _scheduleFormItems: [],
    _scheduleFormDirty: false,
    _scheduleUndoDelete: null,
    _scheduleUndoStack: [],
    _schedulerRunning: false,
  },

  listeners: [],

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  },

  setState(newState) {
    this.state = deepMerge(this.state, newState);
    this._scheduleNotify();
  },

  _notifyPending: false,

  _scheduleNotify() {
    if (this._notifyPending) return;
    this._notifyPending = true;
    Promise.resolve().then(() => {
      this._notifyPending = false;
      this.listeners.forEach(fn => fn(this.state));
    });
  }
};

// Update sidebar version when health changes (moved out of setState to keep it pure)
store.subscribe((state) => {
  if (state.health && state.health.version) {
    const versionEl = document.getElementById('appVersion');
    if (versionEl) versionEl.textContent = state.health.version;
  }
});

// ============================================
// API Client
// ============================================
const API_REQUEST_TIMEOUT_MS = 60000;
const API_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

function clearStoredAuth() {
  localStorage.removeItem('tmd_jwt_token');
  localStorage.removeItem('tmd_jwt_expiry');
}

function isUnauthorizedError(err) {
  return !!err && (err.status === 401 || err._isUnauthorized);
}

function makeUnauthorizedError(tokenType = '') {
  const err = new Error(tokenType === 'expired' ? '登录已过期，请重新认证' : '需要重新认证');
  err.status = 401;
  err._isUnauthorized = true;
  err.tokenType = tokenType || 'unknown';
  return err;
}

function requireAuthentication(err = null) {
  clearStoredAuth();
  showAuthDialog(err?.message || '需要重新认证');
}

const api = {
  base: '',
  _abortControllers: new Set(),
  _refreshPromise: null, // _tryRefreshJWT 去重锁

  abortAll() {
    const controllers = this._abortControllers;
    this._abortControllers = new Set();
    for (const ctrl of controllers) ctrl.abort();
  },

  _getAbortSignal() {
    const controller = new AbortController();
    this._abortControllers.add(controller);
    return { signal: controller.signal, controller };
  },
  
  _cleanupAbortController(controller) {
    this._abortControllers.delete(controller);
  },

  async request(method, path, body = null, extra = {}) {
    const { signal, controller } = this._getAbortSignal();
    let externalAbortHandler = null;
    if (extra.signal) {
      if (extra.signal.aborted) controller.abort();
      externalAbortHandler = () => controller.abort();
      extra.signal.addEventListener('abort', externalAbortHandler, { once: true });
    }
    const timeoutMs = extra.timeoutMs === 0 ? 0 : (extra.timeoutMs || API_REQUEST_TIMEOUT_MS);
    let timedOut = false;
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs) : null;
    const options = {
      method,
      signal
    };
    
    // 注入 Authorization 头（使用 JWT 会话令牌）
    const jwt = localStorage.getItem('tmd_jwt_token');
    if (jwt) {
      options.headers = { ...options.headers, 'Authorization': 'Bearer ' + jwt };
    }
    
    if (extra.isFormData) {
      if (body !== null && body !== undefined) options.body = body;
    } else {
      if (!options.headers) options.headers = {};
      options.headers['Content-Type'] = 'application/json';
      if (body !== null && body !== undefined) options.body = JSON.stringify(body);
    }
    
    try {
      let res;
      try {
        res = await fetch(this.base + path, options);
      } catch (e) {
        // 导航离页导致的主动中止，抛出原始 AbortError 供外层区分
        if (e.name === 'AbortError') {
          if (timedOut) throw new Error(`请求超时 (${Math.round(timeoutMs / 1000)}s)，请稍后重试`);
          throw e;
        }
        throw new Error('网络请求失败，请检查服务器是否运行: ' + e.message);
      }
      let json;
      try {
        json = await res.json();
      } catch (e) {
        throw new Error('服务器返回无效响应 (HTTP ' + res.status + ')');
      }

      // 401 → 尝试 JWT 刷新，否则触发认证对话框
      if (res.status === 401) {
        const tokenType = res.headers.get('X-Token-Type') || '';
        const haveJWT = !!localStorage.getItem('tmd_jwt_token');
        if (haveJWT && tokenType !== 'invalid' && tokenType !== 'missing') {
          // 有 JWT 但 401，说明 JWT 过期/失效 → 尝试 refresh
          const refreshed = await this._tryRefreshJWT();
          if (refreshed && !extra._retried) {
            // refresh 成功 → 重试原请求（不跳过 auth 注入，重新从 localStorage 读取新 JWT）
            // _retried 标志：刷新后仍 401 时不再递归，直接进入认证流程，防无限重试
            return this.request(method, path, body, { ...extra, _retried: true });
          }
        }
        const authErr = makeUnauthorizedError(tokenType);
        requireAuthentication(authErr);
        throw authErr;
      }

      if (!res.ok || !json.success) throw new Error(json.error || '服务器错误 (HTTP ' + res.status + ')');
      return json.data;
    } finally {
      if (timer) clearTimeout(timer);
      if (extra.signal && externalAbortHandler) extra.signal.removeEventListener('abort', externalAbortHandler);
      this._cleanupAbortController(controller);
    }
  },

  // 尝试刷新 JWT token。成功返回 true，失败返回 false（不清除旧 token，留给 auth dialog 处理）
  async _tryRefreshJWT() {
    // 使用 _refreshPromise 去重：多个并发 401 共享同一个刷新请求，
    // 避免第一个重试拿到被覆写的旧 JWT 引发再次失败
    if (this._refreshPromise) return this._refreshPromise;
    this._refreshPromise = this._doRefreshJWT().finally(() => { this._refreshPromise = null; });
    return this._refreshPromise;
  },
  async _doRefreshJWT() {
    const oldJWT = localStorage.getItem('tmd_jwt_token');
    if (!oldJWT) return false;
    const { signal, controller } = this._getAbortSignal();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(this.base + '/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + oldJWT },
        signal
      });
      if (!res.ok) return false;
      const json = await res.json();
      if (!json.success || !json.data || !json.data.token) return false;
      localStorage.setItem('tmd_jwt_token', json.data.token);
      if (json.data.expires_at) {
        localStorage.setItem('tmd_jwt_expiry', json.data.expires_at);
      } else {
        localStorage.removeItem('tmd_jwt_expiry');
      }
      return true;
    } catch(e) {
      return false;
    } finally {
      clearTimeout(timer);
      this._cleanupAbortController(controller);
    }
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  
  // Health
  getHealth() { return this.get('/api/v1/health'); },
  
  // Tasks
  getTasks() { return this.get('/api/v1/tasks'); },
  getTask(id) { return this.get(`/api/v1/tasks/${id}`); },
  cancelTask(id) { return this.post(`/api/v1/tasks/${id}/cancel`, {}); },
  cancelQueuedTasks() { return this.post('/api/v1/tasks/cancel-queued', {}); },
  retryTask(id) { return this.post(`/api/v1/tasks/${id}/retry`, {}); },
  deleteTask(id) { return this.request('DELETE', `/api/v1/tasks/${id}`); },

  // Task Creation
  createUserDownload(screenName, opts) { 
    return this.post(`/api/v1/users/${encodeURIComponent(screenName)}/download`, opts); 
  },
  createProfileDownload(screenName) { 
    return this.post(`/api/v1/users/${encodeURIComponent(screenName)}/profile`, {}); 
  },
  createUserMark(screenName, timestamp) {
    return this.post(`/api/v1/users/${encodeURIComponent(screenName)}/mark`, timestamp ? { timestamp } : {});
  },
  createFollowingDownload(screenName, opts) {
    return this.post(`/api/v1/users/${encodeURIComponent(screenName)}/following/download`, opts);
  },
  createFollowingMark(screenName, timestamp) {
    return this.post(`/api/v1/users/${encodeURIComponent(screenName)}/following/mark`, timestamp ? { timestamp } : {});
  },
  createListDownload(listId, opts) { 
    return this.post(`/api/v1/lists/${encodeURIComponent(listId)}/download`, opts); 
  },
  createListProfile(listId) { 
    return this.post(`/api/v1/lists/${encodeURIComponent(listId)}/profile`, {}); 
  },
  createListMark(listId, timestamp) {
    return this.post(`/api/v1/lists/${encodeURIComponent(listId)}/mark`, timestamp ? { timestamp } : {});
  },
  createBatchDownload(data) { 
    return this.post('/api/v1/batch/download', data); 
  },
  createBatchMark(data) {
    return this.post('/api/v1/batch/mark', data);
  },
  createJsonFileDownload(data) {
    return this.post('/api/v1/json/file/download', data);
  },
  createJsonFolderDownload(data) {
    return this.post('/api/v1/json/folder/download', data);
  },
  upload(path, formData) {
    return this.request('POST', path, formData, { isFormData: true, timeoutMs: API_UPLOAD_TIMEOUT_MS });
  },
  
  // Config
  getConfigRaw() { return this.get('/api/v1/config/raw'); },
  updateConfigRaw(content) { return this.request('PUT', '/api/v1/config/raw', { content }); },
  getConfigFields() { return this.get('/api/v1/config/fields'); },
  saveConfigFields(fields) { return this.request('PUT', '/api/v1/config/fields', { fields }); },
  getCookiesRaw()           { return this.get('/api/v1/cookies/raw'); },
  updateCookiesRaw(content) { return this.request('PUT', '/api/v1/cookies/raw', { content }); },
  getCookies()              { return this.get('/api/v1/cookies'); },
  saveCookies(cookies)      { return this.request('PUT', '/api/v1/cookies', { cookies }); },
  shutdownServer() { return this.post('/api/v1/server/shutdown'); },

  // Logs
  getLogs(params = '') { return this.get(`/api/v1/logs${params}`); },
  getLogStats() { return this.get('/api/v1/logs/stats'); },

  // Schedules
  getSchedules() { return this.get('/api/v1/schedules'); },
  replaceSchedules(entries) { return this.request('PUT', '/api/v1/schedules', { entries }); },
  setScheduleEnabled(id, enabled) { return this.request('PATCH', `/api/v1/schedules/${encodeURIComponent(id)}/enabled`, { enabled }); },
  getSchedulesRaw() { return this.get('/api/v1/schedules/raw'); },
  updateSchedulesRaw(content) { return this.request('PUT', '/api/v1/schedules/raw', { content }); },
  triggerSchedule(id) { return this.request('POST', `/api/v1/schedules/${encodeURIComponent(id)}/trigger`, {}); },
  triggerAllSchedules() { return this.post('/api/v1/schedules/trigger-all', {}); },
  validateSchedule(body, extra = {}) { return this.request('POST', '/api/v1/schedules/validate', body, extra); },
  createSchedule(entry) { return this.post('/api/v1/schedules', entry); },
  updateSchedule(id, entry) { return this.request('PUT', `/api/v1/schedules/${id}`, entry); },
  deleteSchedule(id) { return this.request('DELETE', `/api/v1/schedules/${id}`); },
  reloadSchedules() { return this.post('/api/v1/schedules/reload', {}); },

  // Queue
  getQueueStatus() { return this.get('/api/v1/queue/status'); },

  // Errors
  getErrors() { return this.get('/api/v1/errors'); },
  retryAllErrors() { return this.post('/api/v1/errors/retry', {}); },
  clearErrors() { return this.request('DELETE', '/api/v1/errors'); },

  // Database CRUD with pagination
  getDBUsers(params = '') { return this.get(`/api/v1/db/users${params ? '?' + params : ''}`); },
  getDBUser(id) { return this.get(`/api/v1/db/users/${id}`); },
  updateDBUser(id, data) { return this.request('PATCH', `/api/v1/db/users/${id}`, data); },
  deleteDBUser(id) { return this.request('DELETE', `/api/v1/db/users/${id}`); },

  getDBLists(params = '') { return this.get(`/api/v1/db/lists${params ? '?' + params : ''}`); },
  getDBList(id) { return this.get(`/api/v1/db/lists/${id}`); },
  updateDBList(id, data) { return this.request('PATCH', `/api/v1/db/lists/${id}`, data); },
  deleteDBList(id) { return this.request('DELETE', `/api/v1/db/lists/${id}`); },

  getDBUserEntities(params = '') { return this.get(`/api/v1/db/user-entities${params ? '?' + params : ''}`); },
  getDBUserEntity(id) { return this.get(`/api/v1/db/user-entities/${id}`); },
  updateDBUserEntity(id, data) { return this.request('PATCH', `/api/v1/db/user-entities/${id}`, data); },
  deleteDBUserEntity(id) { return this.request('DELETE', `/api/v1/db/user-entities/${id}`); },
  
  getDBListEntities(params = '') { return this.get(`/api/v1/db/list-entities${params ? '?' + params : ''}`); },
  getDBListEntity(id) { return this.get(`/api/v1/db/list-entities/${id}`); },
  updateDBListEntity(id, data) { return this.request('PATCH', `/api/v1/db/list-entities/${id}`, data); },
  deleteDBListEntity(id) { return this.request('DELETE', `/api/v1/db/list-entities/${id}`); },
  
  getDBUserLinks(params = '') { return this.get(`/api/v1/db/user-links${params ? '?' + params : ''}`); },
  getDBUserLink(id) { return this.get(`/api/v1/db/user-links/${id}`); },
  updateDBUserLink(id, data) { return this.request('PATCH', `/api/v1/db/user-links/${id}`, data); },
  deleteDBUserLink(id) { return this.request('DELETE', `/api/v1/db/user-links/${id}`); },
  getDBPreviousNames(params = '') { return this.get(`/api/v1/db/user-previous-names${params ? '?' + params : ''}`); },
  getDBStats() { return this.get('/api/v1/db/stats'); }
};

// 数据管理类型配置：统一所有类型的 API 方法映射，消除散落的 switch-case
// 各类型显式声明支持的操作（get/update/delete 缺失 = 只读）
// 新增类型只需在此添加一处配置
const DB_TYPE_CONFIG = {
  users: {
    title: 'Users',
    get: id => api.getDBUser(id),
    update: (id, data) => api.updateDBUser(id, data),
    delete: id => api.deleteDBUser(id),
    list: params => api.getDBUsers(params),
  },
  lists: {
    title: 'Lists',
    get: id => api.getDBList(id),
    update: (id, data) => api.updateDBList(id, data),
    delete: id => api.deleteDBList(id),
    list: params => api.getDBLists(params),
  },
  entities: {
    title: 'Entities',
    get: id => api.getDBUserEntity(id),
    update: (id, data) => api.updateDBUserEntity(id, data),
    delete: id => api.deleteDBUserEntity(id),
    list: params => {
      // 关联钻取：从用户行跳转过来时按 userId 过滤
      if (store.state._relUserIdFilter) {
        params.append('userId', store.state._relUserIdFilter);
      }
      return api.getDBUserEntities(params);
    },
  },
  listEntities: {
    title: 'List Entities',
    get: id => api.getDBListEntity(id),
    update: (id, data) => api.updateDBListEntity(id, data),
    delete: id => api.deleteDBListEntity(id),
    list: params => {
      // 关联钻取：从列表行跳转过来时按 listId 过滤
      if (store.state._relListIdFilter) {
        params.append('listId', store.state._relListIdFilter);
      }
      return api.getDBListEntities(params);
    },
  },
  userLinks: {
    title: 'User Links',
    get: id => api.getDBUserLink(id),
    update: (id, data) => api.updateDBUserLink(id, data),
    delete: id => api.deleteDBUserLink(id),
    list: params => {
      // 关联钻取：从用户行跳转过来时按 userId 过滤
      if (store.state._relUserIdFilter) {
        params.append('userId', store.state._relUserIdFilter);
      }
      return api.getDBUserLinks(params);
    },
  },
  previousNames: {
    title: 'Previous Names',
    // 只读类型：无 get/update/delete
    list: params => {
      // 按用户筛选时追加 userId 参数
      if (store.state._prevNameUserIdFilter) {
        params.append('userId', store.state._prevNameUserIdFilter);
      }
      return api.getDBPreviousNames(params);
    },
  },
};

// ============================================
// SSE Manager
// ============================================
const sseManager = {
  conn: null,
  reconnectTimer: null,
  reconnectDelay: 2000,
  maxReconnectDelay: 30000,
  baseReconnectDelay: 2000,
  reconnectAttempts: 0,
  reconnectDisabled: false,
  _everConnected: false, // 首次成功连接前不显示"断开"状态
  _tokenParam() {
    const p = new URLSearchParams();
    appendJWTToken(p);
    const qs = p.toString();
    return qs ? '?' + qs : '';
  },

  connect() {
    this.reconnectDisabled = false;
    if (this.conn) return;

    this.conn = new EventSource('/api/v1/sse/tasks' + this._tokenParam());

    this.conn.onopen = () => {
      this._everConnected = true;
      store.setState({ sseConnected: true });
      this._updateIndicator(true);
      // 连接成功即重置指数退避：无任务事件推送的安静期不会让退避永久涨到上限
      const wasReconnect = this.reconnectAttempts > 0;
      this.reconnectDelay = this.baseReconnectDelay;
      this.reconnectAttempts = 0;
      if (wasReconnect) {
        this.refreshCurrentPage();
      }
    };

    const debouncedTasksUpdate = debounce((tasks) => {
      _tasksEpoch++; // 新快照生效，使在途的 GET /tasks 旧响应失效
      store.setState({ tasks });
      updateOpenTaskDrawerFromTasks(tasks);
    }, 100);

    this.conn.addEventListener('tasks', (e) => {
      if (!_initComplete) return;
      try {
        const tasks = JSON.parse(e.data);
        debouncedTasksUpdate(tasks);
        this.reconnectDelay = this.baseReconnectDelay;
        this.reconnectAttempts = 0;
      } catch (err) {
        console.warn('SSE tasks parse error:', err);
      }
    });

    const debouncedSchedulesUpdate = debounce((data) => {
      const entries = data.entries || [];
      const update = {
        _schedules: entries,
        _schedulerRunning: !!data.scheduler_running,
        _scheduleExists: data.exists !== undefined ? !!data.exists : store.state._scheduleExists,
      };
      if (!store.state._scheduleFormDirty && !isScheduleFormEditing()) {
        update._scheduleFormItems = entries.map(s => scheduleStatusToFormItem(s));
      }
      store.setState(update);
    }, 100);

    this.conn.addEventListener('schedules', (e) => {
      try {
        const data = JSON.parse(e.data);
        debouncedSchedulesUpdate(data);
      } catch (err) {
        console.warn('SSE schedules parse error:', err);
      }
    });

    this.conn.addEventListener('notification', (e) => {
      try {
        const notif = JSON.parse(e.data);
        // notification 与 tasks debounce (100ms) 对齐，避免 toast 先出现但任务列表仍显示"运行中"
        setTimeout(() => {
          const type = notif.type === 'task_completed' ? 'success' :
                       notif.type === 'task_failed' ? 'error' :
                       notif.type === 'task_cancelled' ? 'warning' :
                       notif.type === 'schedule_warning' ? 'warning' : 'info'; // 未知类型默认中性提示，不误导为成功
          toast.show(notif.message, type);
        }, 100);
      } catch (err) {
        console.warn('SSE notification parse error:', err);
      }
    });

    this.conn.addEventListener('server_shutdown', (e) => {
      try {
        const data = JSON.parse(e.data);
        handleServerShutdown(data.message);
      } catch (err) {
        console.warn('[SSE] server_shutdown parse error:', err);
        handleServerShutdown('服务器正在关闭');
      }
    });

    this.conn.onerror = () => {
      this.conn.close();
      this.conn = null;
      if (this._everConnected) {
        store.setState({ sseConnected: false });
        this._updateIndicator(false);
      }
      if (this.reconnectDisabled) return;
      if (store.state.currentPage === 'shutdown') return;
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= 10 && this.reconnectAttempts % 5 === 0) {
        api.getHealth().catch((e) => {
          console.warn('[SSE] 健康检查失败:', e.message, '- 继续重试...');
        });
      }
      tryRefreshJWT('SSE', () => this._scheduleReconnect());
    };

  },
  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
    console.warn(`[SSE] 连接断开，${delay / 1000}s 后重试（第 ${this.reconnectAttempts} 次）`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  },
  
  disconnect() {
    this.reconnectDisabled = true;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    store.setState({ sseConnected: false });
    this._updateIndicator(false);
  },

  resume() {
    this.reconnectDisabled = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect();
  },

  _updateIndicator(connected) {
    const el = document.getElementById('sseIndicator');
    if (!el) return;
    el.classList.toggle('connected', connected);
    el.title = connected ? '实时连接正常 (点击刷新)' : '实时连接已断开 (点击刷新)';
    // role=status + aria-live：断开/恢复状态对屏幕阅读器可感知
    el.setAttribute('aria-label', connected ? '实时连接正常' : '实时连接已断开');
  },

  refreshCurrentPage() {
    const page = store.state.currentPage;
    if (page === 'overview') {
      this._safeRefresh(() => refreshOverviewData(), page);
      return;
    }
    if (page === 'tasks') {
      this._safeRefresh(() => refreshTasks({ silent: true }), page); // 重连自动刷新不弹提示
      return;
    }
    if (page === 'data') {
      this._safeRefresh(() => refreshDBData(), 'data');
      return;
    }
    if (page === 'schedules') {
      this._safeRefresh(() => loadSchedules(), 'schedules');
      return;
    }
    if (page === 'logs') {
      this._safeRefresh(() => refreshLogs(), 'logs');
      return;
    }
    if (page !== 'system') return;

    if (store.state._systemTab === 'schedules') {
      this._safeRefresh(() => refreshSchedulesAfterReconnect(), 'system schedules');
    } else if (store.state._systemTab === 'config') {
      this._safeRefresh(() => refreshConfigAfterReconnect(), 'config');
    } else if (store.state._systemTab === 'cookies') {
      this._safeRefresh(() => refreshCookiesAfterReconnect(), 'cookies');
    }
  },

  _safeRefresh(fn, label) {
    try {
      const result = fn();
      if (result && typeof result.catch === 'function') {
        result.catch(err => console.warn(`[SSE] reconnect refresh failed (${label}):`, err));
      }
    } catch (err) {
      console.warn(`[SSE] reconnect refresh failed (${label}):`, err);
    }
  }
};

// 统一 JWT 预刷新：当 JWT 即将过期时先刷新再执行回调，否则直接回调
function tryRefreshJWT(label, done) {
  const token = localStorage.getItem('tmd_jwt_token');
  if (!token) { done(false); return; }
  const expiry = localStorage.getItem('tmd_jwt_expiry');
  if (!expiry || new Date(expiry) - new Date() >= 2 * 60 * 1000) { done(false); return; }
  api._tryRefreshJWT().then(refreshed => {
    if (refreshed) console.log(`[${label}] JWT refreshed before reconnect`);
    done(refreshed);
  });
}

// 统一 token 参数追加（JWT），避免各处重复构建
function appendJWTToken(params) {
  const jwt = localStorage.getItem('tmd_jwt_token');
  if (jwt) params.append('token', jwt);
}

// ============================================
// Toast Notifications
// ============================================
const toast = {
  container: document.getElementById('toastContainer'),
  maxToasts: 3,
  
  show(message, type = 'success', title = '') {
    if (!this.container) return;
    const existingToasts = this.container.querySelectorAll('.toast');
    
    // Dedup: skip if same message already visible
    for (const existing of existingToasts) {
      const msgEl = existing.querySelector('.toast-message');
      if (msgEl && msgEl.textContent === message) {
        // 同文案已显示超过 3s：替换刷新（保留新事件上下文）；否则忽略重复
        if (Date.now() - (existing._shownAt || 0) > 3000) {
          existing.remove();
          break;
        }
        return;
      }
    }
    
    if (existingToasts.length >= this.maxToasts) {
      // 移除最旧的消息（第一个）
      existingToasts[0].remove();
    }
    
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    // 错误通知用 role=alert 立即播报，其余走容器 aria-live=polite
    if (type === 'error') el.setAttribute('role', 'alert');
    
    const icons = { success: '✓', error: '✕', warning: '⚠' };
    const titles = { success: '成功', error: '错误', warning: '警告' };
    const safeTitle = escapeHtml(title || titles[type] || '');
    const safeMessage = escapeHtml(message || '');
    
    el.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <div class="toast-content">
        <div class="toast-title">${safeTitle}</div>
        <div class="toast-message">${safeMessage}</div>
      </div>
      <span class="toast-close">✕</span>
    `;
    
    el.querySelector('.toast-close').onclick = () => el.remove();
    el._shownAt = Date.now();
    this.container.appendChild(el);
    
    setTimeout(() => el.remove(), 5000);
  }
};

// ============================================
// Drawer
// ============================================
const drawer = {
  el: document.getElementById('drawer'),
  overlay: document.getElementById('drawerOverlay'),
  title: document.getElementById('drawerTitle'),
  body: document.getElementById('drawerBody'),
  footer: document.getElementById('drawerFooter'),
  
  open(title, content, footer = '') {
    if (!this.el || !this.title || !this.body || !this.footer || !this.overlay) return;
    delete this._taskId;
    this.title.textContent = title;
    this.body.innerHTML = content;
    this.footer.innerHTML = footer;
    this.el.classList.add('open');
    this.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    // 焦点管理：记住触发元素，聚焦抽屉内第一个可聚焦控件，关闭时还原
    this._lastFocused = document.activeElement;
    const focusable = this.el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
  },
  
  close() {
    this.el.classList.remove('open');
    this.overlay.classList.remove('open');
    document.body.style.overflow = '';
    delete this._taskId;
    if (this._lastFocused && this._lastFocused.isConnected) this._lastFocused.focus();
    this._lastFocused = null;
  }
};

// ============================================
// Page Renderers
// ============================================
const pages = {
  // Overview Page
  overview() {
    const { health, tasks } = store.state;
    const queue = _state._queueStatus || {};
    
    const taskStats = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    tasks.forEach(t => { if (taskStats[t.status] !== undefined) taskStats[t.status]++; });
    
    const recentTasks = tasks.slice(0, 4);
    
    return `
      <div class="page-container">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--success);">●</div>
          <div class="stat-content">
            <div class="stat-value" data-overview-stat="health">${health ? (health.status === 'ok' ? '健康' : '异常') : '检查中'}</div>
            <div class="stat-label">系统状态 ${health ? escapeHtml(health.version) : ''}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--info);">🚀</div>
          <div class="stat-content">
            <div class="stat-value" data-overview-stat="running">${taskStats.running}</div>
            <div class="stat-label">运行中任务</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--success);">✓</div>
          <div class="stat-content">
            <div class="stat-value" data-overview-stat="completed">${taskStats.completed}</div>
            <div class="stat-label">已完成任务</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="color: var(--warning);">🎯</div>
          <div class="stat-content">
            <div class="stat-value" data-overview-stat="queueDepth">${queue.queue_depth ?? '—'}</div>
            <div class="stat-label">队列深度（活跃 ${queue.active_jobs ?? 0} / 排队 ${queue.pending_jobs ?? 0} / 分离 ${queue.detached_jobs ?? 0}）</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom: var(--space-6); flex-shrink: 0">
        <div class="card-header">
          <div>
            <div class="card-title">⚡ 快速下载</div>
            <div class="card-subtitle">输入 Twitter 用户名或链接快速创建下载任务</div>
          </div>
        </div>
        <div class="card-body">
          <div class="flex gap-3" style="flex-wrap: wrap;">
            <input type="text" class="form-input" id="quickDownloadInput"
              placeholder="输入用户名，如: elonmusk 或 https://twitter.com/elonmusk"
              style="flex: 1; min-width: 280px;">
            <button class="btn btn-primary" data-action="handleQuickDownload">粘贴并创建任务</button>
          </div>
          <div class="text-sm text-tertiary mt-4">
            支持格式: twitter.com/username | x.com/username | twitter.com/i/lists/123 | @username
          </div>
        </div>
      </div>

      <div class="card card-fill">
        <div class="card-header">
          <div class="card-title">最近任务</div>
          <button class="btn btn-ghost btn-sm" data-action="navigateToTasks">查看全部 →</button>
        </div>
        <div class="card-body card-body-scroll">
          ${recentTasks.length === 0 ? `
            <div class="empty-state overview-tasks-list">
              <div class="empty-icon">📋</div>
              <div class="empty-title">暂无任务</div>
              <div class="empty-desc">创建一个新任务开始下载 Twitter 媒体文件</div>
            </div>
          ` : `
            <div class="task-list overview-tasks-list">
              ${recentTasks.map(t => renderTaskItem(t)).join('')}
            </div>
          `}
        </div>
      </div>
      </div>
    `;
  },
  
  // Tasks Page
  tasks() {
    const { tasks } = store.state;
    const activeTaskTab = _state._taskFormTab || 'user';
    const taskTabCls = (t) => t === activeTaskTab ? 'tab active' : 'tab';
    
    return `
      <div class="tasks-layout">
        <div>
          <div class="card card-fill">
            <div class="card-header">
              <div>
                <div class="card-title">创建新任务</div>
                <div class="card-subtitle">用户 / 列表 / 关注 / 批量 / JSON 导入</div>
              </div>
            </div>
            <div class="card-body card-body-fill">
              <div class="tabs">
                <div class="${taskTabCls('user')}" data-task-tab="user">用户</div>
                <div class="${taskTabCls('list')}" data-task-tab="list">列表</div>
                <div class="${taskTabCls('following')}" data-task-tab="following">关注</div>
                <div class="${taskTabCls('batch')}" data-task-tab="batch">批量</div>
                <div class="${taskTabCls('jsonfile')}" data-task-tab="jsonfile"><span>JSON</span><span>文件</span></div>
                <div class="${taskTabCls('jsonfolder')}" data-task-tab="jsonfolder"><span>JSON</span><span>文件夹</span></div>
                <div class="${taskTabCls('mark')}" data-task-tab="mark">标记</div>
              </div>

              <div id="taskFormContainer">
                ${renderTaskForm(activeTaskTab)}
              </div>
            </div>
          </div>

          <div class="card" style="margin-top: var(--space-6);">
            <div class="card-header">
              <div>
                <div class="card-title">⚠️ 失败记录</div>
                <div class="card-subtitle">errors.json / json_errors.json 中的失败项，可一键重试或清空</div>
              </div>
            </div>
            <div class="card-body" id="errorsPanelContent">
              <div class="empty-state" style="padding: 24px;">
                <div class="empty-icon" style="width: 40px; height: 40px; font-size: 16px; margin-bottom: 8px;">📋</div>
                <div class="empty-desc">暂无失败记录</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="card card-fill">
            <div class="card-header">
              <div>
                <div class="card-title">任务列表</div>
                <div class="card-subtitle" data-task-count-subtitle>共 ${tasks.length} 个任务</div>
              </div>
            </div>
            <div class="toolbar">
              <div class="toolbar-left">
                <select class="form-select" style="width: 100px;" id="taskFilter" data-binding="taskFilter">
                  <option value="all">全部状态</option>
                  <option value="running">运行中</option>
                  <option value="queued">排队中</option>
                  <option value="completed">已完成</option>
                  <option value="failed">失败</option>
                  <option value="cancelled">已取消</option>
                </select>
                <select class="form-select" style="width: 112px;" id="taskStageFilter" data-binding="taskStageFilter">
                  <option value="all">全部阶段</option>
                  <option value="preparing">准备中</option>
                  <option value="syncing">同步列表</option>
                  <option value="downloading">下载中</option>
                  <option value="retrying">重试中</option>
                  <option value="profile">资料下载</option>
                  <option value="marking">标记中</option>
                </select>
                <input type="text" class="form-input search-input" id="taskSearch" placeholder="搜索任务..." data-binding="taskSearch">
              </div>
              <div class="toolbar-right">
                <button class="btn btn-secondary btn-sm" data-action="cancelQueuedTasks">取消排队中任务</button>
              </div>
            </div>
            <div class="card-body card-body-scroll">
              <div class="${tasks.length === 0 ? (!store.state.health ? 'empty-state' : 'empty-state') : 'task-list'}" id="taskListContainer">
                ${tasks.length === 0 ? (store.state.health === null ? `
                  <div class="empty-icon">⏳</div>
                  <div class="empty-title">加载中...</div>
                ` : `
                  <div class="empty-icon">🚀</div>
                  <div class="empty-title">暂无任务</div>
                  <div class="empty-desc">前往概览页使用快速下载创建任务</div>
                `) : `
                  ${tasks.map(t => renderTaskItem(t)).join('')}
                `}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },
  
  // Data Page
  data() {
    const { dataSubPage, dbData, dbPagination, dbSort, dbSearch, dbLoading, dbError } = store.state;
    
    const dataMap = {
      users: { title: 'Users', data: dbData.users?.data || [], count: dbData.users?.total || 0 },
      lists: { title: 'Lists', data: dbData.lists?.data || [], count: dbData.lists?.total || 0 },
      entities: { title: 'User Entities', data: dbData.entities?.data || [], count: dbData.entities?.total || 0 },
      listEntities: { title: 'List Entities', data: dbData.listEntities?.data || [], count: dbData.listEntities?.total || 0 },
      userLinks: { title: 'User Links', data: dbData.userLinks?.data || [], count: dbData.userLinks?.total || 0 },
      previousNames: { title: 'Previous Names', data: dbData.previousNames?.data || [], count: dbData.previousNames?.total || 0 }
    };
    
    const current = dataMap[dataSubPage];
    const pagination = dbPagination[dataSubPage] || { page: 1, pageSize: 200, totalPages: 1 };
    const sort = dbSort[dataSubPage] || { sortBy: 'id', sortOrder: 'desc' };
    const loading = !!dbLoading[dataSubPage];
    const error = dbError[dataSubPage] || '';
    const filterBanner = renderDBFilterBanner(dataSubPage);
    const dataBody = renderDBDataBody(dataSubPage, current.data, sort, loading, error);
    
    return `
      <div class="page-container">
        <div class="card card-page">
          <div class="card-header">
            <div>
              <div class="tabs" style="margin:0;border:none">
                <div class="tab ${dataSubPage === 'users' ? 'active' : ''}" data-action="setDataSubPage" data-subpage="users">Users</div>
                <div class="tab ${dataSubPage === 'lists' ? 'active' : ''}" data-action="setDataSubPage" data-subpage="lists">Lists</div>
                <div class="tab ${dataSubPage === 'entities' ? 'active' : ''}" data-action="setDataSubPage" data-subpage="entities">User Entities</div>
                <div class="tab ${dataSubPage === 'listEntities' ? 'active' : ''}" data-action="setDataSubPage" data-subpage="listEntities">List Entities</div>
                <div class="tab ${dataSubPage === 'userLinks' ? 'active' : ''}" data-action="setDataSubPage" data-subpage="userLinks">User Links</div>
                <div class="tab ${dataSubPage === 'previousNames' ? 'active' : ''}" data-action="setDataSubPage" data-subpage="previousNames">Previous Names</div>
              </div>
            </div>
            <div class="flex gap-2 items-center">
              <input type="text" class="form-input search-input" id="dbSearchInput"
                placeholder="搜索..." data-binding="dbSearch" value="${escapeAttr(dbSearch[dataSubPage] || '')}">
              <button class="btn btn-ghost btn-icon" data-action="searchDB">🔍</button>
            </div>
          </div>

        ${filterBanner}
        <div class="db-stats-bar" id="dbStatsBar">
          <span class="db-stat-chip" data-db-stat="users">Users —</span>
          <span class="db-stat-chip" data-db-stat="lsts">Lists —</span>
          <span class="db-stat-chip" data-db-stat="user_entities">User Entities —</span>
          <span class="db-stat-chip" data-db-stat="lst_entities">List Entities —</span>
          <span class="db-stat-chip" data-db-stat="user_links">User Links —</span>
          <span class="db-stat-chip" data-db-stat="user_previous_names">Previous Names —</span>
        </div>
        <div class="card-body card-body-scroll">
          ${dataBody}
        </div>

        <div class="pagination" id="dataPagination">
          <div class="pagination-info" id="dataPaginationInfo">
            显示 ${current.data.length} / ${current.count} 条记录 
            (第 ${pagination.page} / ${pagination.totalPages} 页)
          </div>
          <div class="pagination-controls">
            <button class="page-btn" data-action="changeDBPage" data-delta="-1" ${pagination.page <= 1 ? 'disabled' : ''}>←</button>
            ${renderPageNumbers(pagination.page, pagination.totalPages)}
            <button class="page-btn" data-action="changeDBPage" data-delta="1" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>→</button>
          </div>
        </div>
      </div>
    </div>
    `;
  },

  schedules() {
    const { _schedules, _scheduleExists, _schedulerRunning } = store.state;

		    if (_schedules === null) {
		      return `
		        <div class="page-container">
		          <div class="card">
		            <div class="card-header">
		              <div><div class="card-title">定时下载任务</div><div class="card-subtitle">加载中...</div></div>
		              <div class="flex gap-2">
		                <button class="btn btn-primary btn-sm" disabled>⬇️ 下载全部</button>
		                <button class="btn btn-ghost btn-sm" disabled>📝 编辑任务</button>
		              </div>
		            </div>
		            <div class="card-body">
		              <div class="empty-state">
		                <div class="skeleton skeleton-icon"></div>
		                <div class="empty-title">加载中...</div>
		                <div class="empty-desc">正在加载定时任务配置</div>
		              </div>
		            </div>
		          </div>
		        </div>
		      `;
    }

    const schedulerBanner = !_schedulerRunning
      ? `<div class="alert alert-warning" style="margin-bottom:var(--space-3)">⚠️ 调度器未启动，定时任务不会自动执行。请在「定时任务」页面中添加并启用规则后重载配置。</div>`
      : '';

    return `
      <div class="page-container">
        <div id="scheduleBanner" style="flex-shrink:0">${schedulerBanner}</div>
        <div id="scheduleTable">${renderScheduleTable(_schedules, _scheduleExists)}</div>
      </div>
    `;
  },

  // System Page
  system() {
    return `
      <div class="page-container">
        <div class="system-tab-bar">
          <div class="system-tabs" style="margin:0">
            <div class="tab ${store.state._systemTab === 'config' ? 'active' : ''}" data-tab="config" data-action="setSystemTab">⚙️ 配置编辑</div>
            <div class="tab ${store.state._systemTab === 'cookies' ? 'active' : ''}" data-tab="cookies" data-action="setSystemTab">🍪 额外账户</div>
            <div class="tab ${store.state._systemTab === 'schedules' ? 'active' : ''}" data-tab="schedules" data-action="setSystemTab">⏰ 任务配置</div>
            <div class="tab ${store.state._systemTab === 'security' ? 'active' : ''}" data-tab="security" data-action="setSystemTab">🔐 安全认证</div>
          </div>
          <button class="btn btn-danger btn-sm" data-action="shutdownServer">⏻ 关闭服务器</button>
        </div>

        <div id="systemConfigPanel" class="system-panel system-panel-scroll" style="${store.state._systemTab === 'config' ? '' : 'display:none'}">
          ${renderConfigEditor()}
        </div>

        <div id="systemCookiesPanel" class="system-panel system-panel-scroll" style="${store.state._systemTab === 'cookies' ? '' : 'display:none'}">
          ${renderCookiesEditor()}
        </div>

        <div id="systemSchedulesPanel" class="system-panel system-panel-scroll" style="${store.state._systemTab === 'schedules' ? '' : 'display:none'}">
          ${renderScheduleViewer()}
        </div>

        <div id="systemSecurityPanel" class="system-panel system-panel-scroll" style="${store.state._systemTab === 'security' ? '' : 'display:none'}">
          ${renderSecurityEditor()}
        </div>
      </div>
    `;
  },

  logs() {
    return `<div class="page-container">${renderLogViewer()}</div>`;
  }
};

// ============================================
// Module-level state bag (replaces top-level let/const)
// ============================================
const _state = {
  _taskFormState: {},
  _pendingTaskActions: new Set(),
  _dbRequestSeq: 0,
  _configRawLoading: false,
  _configRawLoadError: false,
  _cookiesRawLoading: false,
  _scheduleRawLoading: false,
  _logsPageLoaded: false,
  _errorsData: null,
  _errorsLoading: false,
  _queueStatus: null,
  _dbStats: null
};

// 变化检测器：消除手动维护 _state.lastXxx 的重复模式
// keys: 要追踪的状态键名数组。基础类型用 !== 比较，对象/数组用 JSON.stringify 比较
// 返回 { hasAny: bool, changed: { [key]: bool } }
function makeChangeDetector(keys) {
  const snapshots = {};
  keys.forEach(k => { snapshots[k] = undefined; });
  const capture = (k, cur) => {
    snapshots[k] = (typeof cur === 'object' && cur !== null) ? JSON.parse(JSON.stringify(cur)) : cur;
  };
  return {
    detect(state) {
      const changed = {};
      let hasAny = false;
      keys.forEach(k => {
        const cur = state[k];
        const last = snapshots[k];
        let isDiff;
        if (typeof cur === 'object' && cur !== null) {
          isDiff = JSON.stringify(cur) !== JSON.stringify(last);
        } else {
          isDiff = cur !== last;
        }
        changed[k] = isDiff;
        if (isDiff) hasAny = true;
        capture(k, cur);
      });
      return { hasAny, changed };
    },
    // 同步快照：render() 全量重建后调用，标记当前状态已渲染。
    // 不比较、不触发通知；防止 render 绕过 detect 导致快照过期，
    // 使后续真实变化被误判为"无变化"而漏渲染。
    sync(state) {
      keys.forEach(k => capture(k, state[k]));
    }
  };
}

// DualModeEditor 工厂：统一 config/cookies/schedules 三处 raw/form 双模式编辑器
// 抽象 setMode + skipNextRebuild 标志 + editor 生命周期 + panel 重建
// 注意：save/saveRaw 不纳入工厂（差异太大），仍由各自独立函数处理
// 关键依赖：store 通知是异步的（L183-190 via Promise.resolve().then microtask）
// setMode 在 store.setState 之后同步设置 skip flag，确保 microtask 运行 syncSystemPage 时 skip flag 已就位
function createDualModeEditor(opts) {
  const {
    panelId,          // 'systemConfigPanel' / 'systemCookiesPanel' / 'systemSchedulesPanel'
    modeKey,          // 'configMode' / 'cookiesMode' / '_scheduleTab'
    rawKey,           // 'configRaw' / 'cookiesRaw' / '_scheduleRaw'
    editorAttr,       // 'configEditor' / 'cookiesEditor' / 'scheduleEditor'
    skipRebuildAttr,  // '_configPanelSkipNextRebuild' / ...
    render,           // () => string  无参 render 函数
    initEditor,       // () => void    无参 initEditor 函数
    loadRaw,          // () => Promise  raw 数据为 null 时调用
    onAfterSetState,  // (mode) => void  可选钩子，setState 之后、rebuild 之前调用
  } = opts;

  return {
    // 模式切换：统一三处 setMode 逻辑
    setMode(mode) {
      // form → raw 切换前检查未保存编辑（dirtyCheck 由各编辑器传入）
      if (mode === 'raw' && store.state[modeKey] === 'form' && opts.dirtyCheck) {
        if (opts.dirtyCheck() && !confirm('简易模式有未保存的修改，切换后这些修改将丢失。确定继续？')) {
          return;
        }
      }
      if (mode !== 'raw' && _state[editorAttr]) {
        _state[editorAttr] = null;
      }
      store.setState({ [modeKey]: mode });
      if (mode === 'raw' && store.state[rawKey] === null) loadRaw();
      if (onAfterSetState) onAfterSetState(mode);
      if (mode === 'raw' && store.state[rawKey] !== null) {
        _state[editorAttr] = null;
        _state[skipRebuildAttr] = true;
        const panel = document.getElementById(panelId);
        if (panel) {
          panel.innerHTML = render();
          requestAnimationFrame(() => requestAnimationFrame(initEditor));
        }
      } else {
        _state[skipRebuildAttr] = false;
      }
    },

    // 重建 panel（封装 rerenderSystemPanel 调用）
    // 注意：initEditor 参数必须是函数引用（或 null），不能是箭头函数
    // 因为 rerenderSystemPanel 内部会调用 initEditor()，箭头函数会返回函数引用而非调用它
    rebuild() {
      rerenderSystemPanel(
        panelId, render,
        () => { _state[editorAttr] = null; },
        store.state[modeKey] === 'raw' ? initEditor : null,
        () => store.state[modeKey] === 'raw' ? getEditorValue(_state[editorAttr], null) : null,
        (val) => { if (val !== null && _state[editorAttr]) setEditorValue(_state[editorAttr], val); }
      );
    },

    // editor 生命周期
    getEditorValue() { return getEditorValue(_state[editorAttr], store.state[rawKey]); },
    setEditorValue(val) { if (_state[editorAttr]) setEditorValue(_state[editorAttr], val); },
    destroyEditor() { _state[editorAttr] = null; },
    resetSkipFlag() { _state[skipRebuildAttr] = false; },
    isSkipFlagSet() { return !!_state[skipRebuildAttr]; },
    consumeSkipFlag() {
      if (_state[skipRebuildAttr]) { _state[skipRebuildAttr] = false; return true; }
      return false;
    },

    // 状态查询
    isRawMode(state) { return state[modeKey] === 'raw'; },
  };
}

// 保存当前任务 tab 的表单值
function saveTaskFormState() {
  const inputs = document.querySelectorAll('#taskFormContainer input, #taskFormContainer textarea, #taskFormContainer select');
  const state = {};
  inputs.forEach(el => {
    if (el.id) {
      state[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    }
  });
  // 找到当前激活的 tab
  const activeTab = document.querySelector('[data-task-tab].active');
  if (activeTab) {
    const tab = activeTab.dataset.taskTab;
    _state._taskFormState[tab] = state;
    _state._taskFormTab = tab;
  }
}

// 恢复任务 tab 的表单值
function restoreTaskFormState(tabType) {
  const saved = _state._taskFormState[tabType];
  if (!saved) return;
  // 延迟执行，等待 DOM 渲染完成
  requestAnimationFrame(() => {
    Object.entries(saved).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = value;
      } else {
        el.value = value;
      }
    });
  });
}

// ============================================
// Helper Functions
// ============================================

function getStageText(stage) {
  const stageMap = {
    'preparing': ' · 准备中',
    'syncing': ' · 同步列表',
    'downloading': ' · 下载中',
    'retrying': ' · 重试中',
    'profile': ' · 下载资料',
    'profile_warning': ' · 资料下载异常',
    'marking': ' · 标记中',
    'completed': ''
  };
  return stageMap[stage] || (stage ? ` · ${stage}` : '');
}

function getTaskProgressPercent(task) {
  if (task.status === 'completed') return 100;

  const progress = task.progress || {};
  const total = progress.total || 0;
  const completed = progress.completed || 0;
  const ratio = total > 0 ? Math.min(completed / total, 1) : 0;

  if (task.status === 'failed' || task.status === 'cancelled') {
    return total > 0 ? Math.round(ratio * 100) : 0;
  }

  switch (progress.stage) {
    case 'syncing':
      return 5;
    case 'preparing':
      return 10;
    case 'downloading':
      return Math.round(10 + ratio * 70);
    case 'retrying':
      return Math.round(80 + ratio * 10);
    case 'profile':
      return total > 0 ? Math.round(90 + ratio * 9) : 90;
    case 'profile_warning':
      return 99;
    case 'marking':
      return total > 0 ? Math.round(10 + ratio * 85) : 10;
    default:
      return 0;
  }
}

function getTaskTarget(task) {
  const data = task.data || {};

  if (data.screen_name) {
    return `@${data.screen_name}`;
  }
  if (data.list_id) {
    return `List ${data.list_id}`;
  }

  const parts = [];
  if (Array.isArray(data.users) && data.users.length) {
    parts.push(`${data.users.length} 用户`);
  }
  if (Array.isArray(data.lists) && data.lists.length) {
    parts.push(`${data.lists.length} 列表`);
  }
  if (Array.isArray(data.following_names) && data.following_names.length) {
    parts.push(`${data.following_names.length} 关注源`);
  }

  return parts.length ? parts.join(' · ') : 'Unknown';
}

function getOptionalTimestamp(inputId) {
  const input = document.getElementById(inputId);
  const value = input?.value?.trim() || '';
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('请输入有效的标记时间');
  }
  return date.toISOString();
}

const TASK_STATUS_INFO = {
  queued: { tag: 'tag-queued', statusClass: 'status-queued', text: '排队', detailText: '排队中' },
  running: { tag: 'tag-running', statusClass: 'status-running', text: '运行', detailText: '运行中' },
  completed: { tag: 'tag-completed', statusClass: 'status-completed', text: '完成', detailText: '已完成' },
  failed: { tag: 'tag-failed', statusClass: 'status-failed', text: '失败', detailText: '失败' },
  cancelled: { tag: 'tag-cancelled', statusClass: 'status-cancelled', text: '取消', detailText: '已取消' }
};

function getTaskStatusInfo(status) {
  return TASK_STATUS_INFO[status] || {
    tag: 'tag-queued',
    statusClass: 'status-unknown',
    text: status || '未知',
    detailText: status || '未知'
  };
}

function shortTaskID(id) {
  const value = String(id || '');
  const m = value.match(/^task_([0-9a-f]{8})[0-9a-f-]{28}$/i);
  return m ? m[1] : value;
}

function getTaskStage(task) {
  return task?.progress?.stage || '';
}

function renderTaskItem(task) {
  const status = getTaskStatusInfo(task.status);
  const pct = getTaskProgressPercent(task);
  const fullTaskId = String(task.task_id || '');
  const shortId = shortTaskID(fullTaskId);

  const stageText = task.progress?.stage ? escapeHtml(getStageText(task.progress.stage)) : '';
  const currentText = task.progress?.current ? ` · ${escapeHtml(task.progress.current)}` : '';

  const target = escapeHtml(getTaskTarget(task));

  return `
    <div class="task-item" data-task-id="${escapeAttr(task.task_id)}">
      <div class="task-info">
        <div class="task-title">${escapeHtml(task.type)} - ${target}</div>
        <div class="task-meta">
          <span class="tag ${status.tag}">${escapeHtml(status.text)}</span>
          <span class="task-short-id" title="${escapeAttr(fullTaskId)}">ID: ${escapeHtml(shortId)}</span>
          <span>${formatDate(task.created_at)}</span>
        </div>
      </div>
      <div class="task-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${pct}%"></div>
        </div>
        <div class="task-progress-text">${pct}%${stageText}${currentText}</div>
      </div>
	      <div class="task-actions">
	        ${task.status === 'running' || task.status === 'queued' ?
	          `<button class="btn btn-danger btn-sm" data-task-id="${escapeAttr(task.task_id)}" data-action="cancelTask">取消</button>` :
	          `<button class="btn btn-ghost btn-sm" data-task-id="${escapeAttr(task.task_id)}" data-action="showTaskDetail">详情</button>`
	        }
	      </div>
    </div>
  `;
}

function renderTaskForm(type) {
  const forms = {
    user: `
      <div class="form-group">
        <label class="form-label">Screen Name</label>
        <input type="text" class="form-input" id="userScreenName" placeholder="例如: elonmusk">
      </div>
      ${renderCheckboxes('user')}
      <div class="flex gap-3" style="flex-wrap: wrap;">
        <button class="btn btn-primary" data-action="createUserTask">创建下载任务</button>
        <button class="btn btn-secondary" data-action="createProfileTask">仅下载 Profile</button>
        <button class="btn btn-ghost" data-action="markUserTask">标记已下载</button>
      </div>
    `,
    list: `
      <div class="form-group">
        <label class="form-label">List ID</label>
        <input type="text" inputmode="numeric" pattern="[0-9]*" class="form-input" id="listId" placeholder="例如: 123456789">
      </div>
      ${renderCheckboxes('list')}
      <div class="flex gap-3" style="flex-wrap: wrap;">
        <button class="btn btn-primary" data-action="createListTask">创建下载任务</button>
        <button class="btn btn-secondary" data-action="createListProfileTask">仅下载 Profile</button>
        <button class="btn btn-ghost" data-action="markListTask">标记已下载</button>
      </div>
    `,
    following: `
      <div class="form-group">
        <label class="form-label">Screen Name</label>
        <input type="text" class="form-input" id="followingScreenName" placeholder="例如: elonmusk">
      </div>
      ${renderCheckboxes('following')}
      <div class="flex gap-3" style="flex-wrap: wrap;">
        <button class="btn btn-primary" data-action="createFollowingTask">创建关注下载任务</button>
        <button class="btn btn-ghost" data-action="markFollowingTask">标记已下载</button>
      </div>
    `,
    mark: `
      <div class="form-group">
        <label class="form-label">用户 Screen Name（每行一个）</label>
        <textarea class="form-textarea" id="markUsers" placeholder="elonmusk\njack" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">List IDs（每行一个）</label>
        <textarea class="form-textarea" id="markLists" placeholder="123456789\n987654321" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Following 用户（每行一个）</label>
        <textarea class="form-textarea" id="markFollowingNames" placeholder="user_a\nuser_b" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">标记时间（可选）</label>
        <input type="datetime-local" class="form-input" id="markTimestamp" placeholder="选择日期和时间">
        <div class="text-sm text-tertiary mt-2">留空则使用服务器当前时间。每个输入目标会创建独立标记任务。</div>
      </div>
      <button class="btn btn-primary" data-action="createMarkTask">创建标记任务</button>
    `,
    batch: `
      <div class="form-group">
        <label class="form-label">用户列表（每行一个）</label>
        <textarea class="form-textarea" id="batchUsers" placeholder="user1\nuser2" rows="2"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">List IDs（每行一个）</label>
        <textarea class="form-textarea" id="batchLists" placeholder="123\n456" rows="2"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Following 用户（每行一个）</label>
        <textarea class="form-textarea" id="batchFollowingNames" placeholder="user_a\nuser_b" rows="2"></textarea>
        <div class="text-sm text-tertiary mt-2">将这些用户的 Following 加入批量下载目标</div>
      </div>
      ${renderCheckboxes('batch')}
      <button class="btn btn-primary" data-action="createBatchTask">创建批量任务</button>
    `,
    jsonfile: `
  <div class="form-group">
    <label class="form-label">上传第三方工具导出的 JSON 文件</label>
    <input type="file" class="form-input" id="jsonFileUpload" accept=".json,application/json" multiple>
  </div>
  <div class="text-sm text-tertiary mt-2">
    支持多选 .json 文件。未选择文件时，可改用下面的服务端路径模式。
  </div>
  <div class="form-group mt-3">
    <label class="form-label">高级：服务端 JSON 文件路径（每行一个）</label>
    <textarea class="form-textarea" id="jsonFilePaths" placeholder="/path/to/twitter-followers-123.json\n/path/to/more.json" rows="3"></textarea>
  </div>
  <div class="text-sm text-tertiary mt-2">
    支持格式: 第三方工具导出的Twitter推文搜索结果JSON（含推文列表、media数组、metadata字段）
  </div>
  <div class="form-group mt-3">
    <label class="form-checkbox">
      <input type="checkbox" id="jsonFileNoRetry"> 不重试
    </label>
  </div>
  <button class="btn btn-primary" data-action="createJsonFileTask">创建 JSON 文件任务</button>
`,
jsonfolder: `
  <div class="form-group">
    <label class="form-label">上传 LoongTweet JSON 文件</label>
    <input type="file" class="form-input" id="jsonFolderUpload" accept=".json,application/json" multiple>
  </div>
  <div class="text-sm text-tertiary mt-2">
    直接选择一个或多个 .loongtweet 生成的 JSON 文件。未选择文件时，可改用下面的服务端路径模式。
  </div>
  <div class="form-group mt-3">
    <label class="form-label">高级：服务端 .loongtweet 文件夹路径（每行一个）</label>
    <textarea class="form-textarea" id="jsonFolderPath" placeholder="/path/to/.loongtweet\n/path/to/another/.loongtweet" rows="3"></textarea>
  </div>
  <div class="text-sm text-tertiary mt-2">
    从 TMD 生成的 .loongtweet 目录下载推文媒体文件（仅下载媒体，不保存元数据）
  </div>
  <div class="form-group mt-3">
    <label class="form-checkbox">
      <input type="checkbox" id="jsonFolderNoRetry"> 不重试
    </label>
  </div>
  <button class="btn btn-primary" data-action="createJsonFolderTask">创建 LoongTweet 任务</button>
`
  };
  return forms[type] || forms.user;
}

// Shared helpers for database table rendering

// 共享的 checkbox 模板：auto_follow / follow_members / skip_profile / no_retry
function renderCheckboxes(prefix) {
  return `
      <div class="form-group">
        <label class="form-checkbox">
          <input type="checkbox" id="${prefix}AutoFollow"> 自动申请受保护账号
        </label>
        <label class="form-checkbox">
          <input type="checkbox" id="${prefix}FollowMembers"> 下载时关注目标/成员
        </label>
        <label class="form-checkbox">
          <input type="checkbox" id="${prefix}SkipProfile"> 跳过 Profile
        </label>
        <label class="form-checkbox">
          <input type="checkbox" id="${prefix}NoRetry"> 不重试
        </label>
      </div>`;
}

function renderDBFilterBanner(type) {
  if (type === 'previousNames' && store.state._prevNameUserIdFilter) {
    return `
      <div class="db-filter-banner">
        <span>正在查看用户 ${escapeHtml(store.state._prevNameUserIdFilter)} 的历史名称</span>
        <button class="btn btn-ghost btn-sm" data-action="clearPreviousNamesFilter">清除筛选</button>
      </div>`;
  }
  if ((type === 'entities' || type === 'userLinks') && store.state._relUserIdFilter) {
    return `
      <div class="db-filter-banner">
        <span>正在查看用户 <strong>#${escapeHtml(store.state._relUserIdFilter)}</strong> 的${type === 'entities' ? '下载实体' : '关联链接'}</span>
        <button class="btn btn-ghost btn-sm" data-action="clearRelFilter">清除筛选</button>
      </div>`;
  }
  if (type === 'listEntities' && store.state._relListIdFilter) {
    return `
      <div class="db-filter-banner">
        <span>正在查看列表 <strong>#${escapeHtml(store.state._relListIdFilter)}</strong> 的下载实体</span>
        <button class="btn btn-ghost btn-sm" data-action="clearRelFilter">清除筛选</button>
      </div>`;
  }
  return '';
}

function renderDBDataBody(type, data, sort, loading, error) {
  if (loading) {
    return `
      <div class="empty-state">
        <div class="skeleton skeleton-icon"></div>
        <div class="empty-title">加载中...</div>
        <div class="empty-desc">正在读取数据库记录</div>
      </div>`;
  }
  if (error) {
    return `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">加载失败</div>
        <div class="empty-desc">${escapeHtml(error)}</div>
        <button class="btn btn-primary btn-sm mt-3" data-action="searchDB">重试</button>
      </div>`;
  }
  return `
    <div class="table-scroll-container" id="dataTableContainer">
      ${renderDBTable(type, data, sort)}
    </div>
    <div id="dataMobileCards">${renderDBMobileCards(type, data)}</div>`;
}

function sortIcon(sort, field) {
  if (sort.sortBy !== field) return '<span class="sort-icon">↕</span>';
  return sort.sortOrder === 'asc'
    ? '<span class="sort-icon sort-active">↑</span>'
    : '<span class="sort-icon sort-active">↓</span>';
}

function sortableHeader(sort, field, label) {
  return `
    <th data-sort-field="${escapeAttr(field)}" class="${sort.sortBy === field ? 'sort-active' : ''}" data-action="sortDB">
      ${label} ${sortIcon(sort, field)}
    </th>
  `;
}

function renderDBCell(col, item) {
  if (col.render) return col.render(item);
  return escapeHtml(item[col.key] || '');
}

function renderActionButtons(type, item) {
  const idStr = String(item.id);
  const relationBtn = (type === 'users')
    ? `<button class="btn btn-ghost btn-sm" title="查看关联（实体/链接/历史名称）" data-db-type="${escapeAttr(type)}" data-db-id="${escapeAttr(idStr)}" data-action="viewUserRelations">🔗</button>`
    : (type === 'lists')
      ? `<button class="btn btn-ghost btn-sm" title="查看列表下载实体" data-db-type="${escapeAttr(type)}" data-db-id="${escapeAttr(idStr)}" data-action="viewListRelations">🔗</button>`
      : '';
  return `
    <div class="flex gap-2">
      ${relationBtn}
      <button class="btn btn-ghost btn-sm" data-db-type="${escapeAttr(type)}" data-db-id="${escapeAttr(idStr)}" data-action="editDBItem">✏️</button>
      <button class="btn btn-danger btn-sm" data-db-type="${escapeAttr(type)}" data-db-id="${escapeAttr(idStr)}" data-action="deleteDBItem">🗑️</button>
    </div>
  `;
}

function getDBColumns(type) {
  const map = {
    users: [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'screen_name', label: 'Screen Name', sortable: true, render: i => `@${escapeHtml(i.screen_name)}` },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'protected_str', label: 'Protected', sortable: false, render: i => i.protected ? '🔒' : '🔓' },
      { key: 'is_accessible', label: 'Accessible', sortable: false, render: i => i.is_accessible ? '✅' : '❌' },
      { key: 'friends_count', label: 'Friends', sortable: true },
      { label: 'Actions', sortable: false, mobile: false, render: i => renderActionButtons(type, i) },
    ],
    lists: [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'owner_user_id', label: 'Owner ID', sortable: true, sortBy: 'owner_id' },
      { label: 'Actions', sortable: false, mobile: false, render: i => renderActionButtons(type, i) },
    ],
    entities: [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'user_id', label: 'User ID', sortable: true },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'latest_release_time', label: 'Latest Release', sortable: true, render: i => escapeHtml(i.latest_release_time || '-') },
      { key: 'media_count', label: 'Media Count', sortable: true, render: i => escapeHtml(i.media_count || '-') },
      { label: 'Actions', sortable: false, mobile: false, render: i => renderActionButtons(type, i) },
    ],
    listEntities: [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'lst_id', label: 'List ID', sortable: true },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'parent_dir', label: 'Parent Dir', sortable: false },
      { label: 'Actions', sortable: false, mobile: false, render: i => renderActionButtons(type, i) },
    ],
    userLinks: [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'user_id', label: 'User ID', sortable: true },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'parent_lst_entity_id', label: 'Parent Entity', sortable: false },
      { label: 'Actions', sortable: false, mobile: false, render: i => renderActionButtons(type, i) },
    ],
    previousNames: [
      { key: 'current_screen_name', label: 'Current User', sortable: true, render: i => {
        const label = i.current_screen_name ? `@${escapeHtml(i.current_screen_name)}` : escapeHtml(i.user_id || '');
        return `<a href="javascript:void(0)" data-action="filterPreviousNamesByUser" data-user-id="${escapeAttr(i.user_id || '')}">${label}</a>`;
      }},
      { key: 'screen_name', label: 'Previous @Handle', sortable: true, render: i => `@${escapeHtml(i.screen_name)}` },
      { key: 'name', label: 'Previous Name', sortable: true },
      { key: 'record_date', label: 'Date', sortable: true, render: i => escapeHtml(i.record_date || '-') },
    ],
  };
  return map[type] || [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'user_id', label: 'User ID', sortable: true },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'parent_lst_entity_id', label: 'Parent Entity', sortable: false },
    { label: 'Actions', sortable: false, mobile: false, render: i => renderActionButtons(type, i) },
  ];
}

// 通用数据库表格渲染器：基于列定义数组生成 <table>
// columns: [{ key, label, sortable, sortBy, render(item) }]
//   key = 数据字段名，label = 表头显示文字，sortable = 是否可排序（默认 true）
//   sortBy = 排序字段名（默认 key），render = 自定义单元格渲染（返回 innerHTML，不含 <td>）
function renderTable(columns, data, sort) {
  const rows = data.map(item => `<tr>${columns.map(col => `<td>${renderDBCell(col, item)}</td>`).join('')}</tr>`).join('');
  const thead = columns.map(col => {
    if (col.sortable === false) return `<th>${escapeHtml(col.label)}</th>`;
    return sortableHeader(sort, col.sortBy || col.key, col.label);
  }).join('');
  return `<table class="data-table"><thead><tr>${thead}</tr></thead><tbody>${rows}</tbody></table>`;
}

// Database Table Renderer with sorting and actions
function renderDBTable(type, data, sort) {
  if (!data || data.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <div class="empty-title">暂无数据</div>
        <div class="empty-desc">数据库中还没有记录</div>
      </div>
    `;
  }
  return renderTable(getDBColumns(type), data, sort);
}

function renderDBMobileCards(type, data) {
  if (!data || data.length === 0) return '';
  const columns = getDBColumns(type).filter(col => col.mobile !== false && col.label !== 'Actions');
  const config = DB_TYPE_CONFIG[type] || {};
  const cards = data.map(item => {
    const titleCol = columns.find(col => ['screen_name', 'name', 'current_screen_name'].includes(col.key)) || columns[0];
    const title = titleCol ? renderDBCell(titleCol, item) : escapeHtml(item.id || '');
    const details = columns
      .filter(col => col !== titleCol)
      .map(col => `<div><strong>${escapeHtml(col.label)}:</strong> ${renderDBCell(col, item)}</div>`)
      .join('');
    const actions = config.delete || config.update ? `<div class="mt-3">${renderActionButtons(type, item)}</div>` : '';
    return `
      <div class="mobile-card">
        <div class="mobile-card-title">${title}</div>
        <div class="mobile-card-meta">${details}</div>
        ${actions}
      </div>`;
  }).join('');
  return `<div class="mobile-card-list">${cards}</div>`;
}

function renderPageNumbers(currentPage, totalPages, onClickHandler = 'goToDBPage') {
  if (totalPages <= 1) return `<button class="page-btn active">1</button>`;

  let pages = [];
  const maxVisible = 5;

  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    if (currentPage <= 3) {
      pages = [1, 2, 3, 4, '...', totalPages];
    } else if (currentPage >= totalPages - 2) {
      pages = [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    } else {
      pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
    }
  }

  return pages.map(p => {
    if (p === '...') return `<span class="page-btn" style="cursor: default;">...</span>`;
    return `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-action="${escapeAttr(onClickHandler)}" data-page="${p}">${p}</button>`;
  }).join('');
}

// ============================================
// Database Actions
// ============================================
async function refreshDBData() {
  const { dataSubPage, dbPagination, dbSort, dbSearch } = store.state;
  const pagination = dbPagination[dataSubPage];
  const sort = dbSort[dataSubPage];
  const search = dbSearch[dataSubPage];
  const requestSeq = ++_state._dbRequestSeq;

  const config = DB_TYPE_CONFIG[dataSubPage];
  if (!config?.list) return;

  const params = new URLSearchParams();
  params.append('page', pagination.page);
  params.append('pageSize', pagination.pageSize);
  params.append('sortBy', sort.sortBy);
  params.append('sortOrder', sort.sortOrder);
  if (search) params.append('q', search);

  // 加载兜底：15s 未完成自动转错误态（SQLite 锁/慢查询时防止永久 loading）
  const loadingGuard = setTimeout(() => {
    if (requestSeq !== _state._dbRequestSeq) return;
    store.setState({
      dbLoading: { ...store.state.dbLoading, [dataSubPage]: false },
      dbError: { ...store.state.dbError, [dataSubPage]: '加载超时，请重试' }
    });
  }, 15000);

  try {
    store.setState({
      dbLoading: { ...store.state.dbLoading, [dataSubPage]: true },
      dbError: { ...store.state.dbError, [dataSubPage]: '' }
    });
    const response = await config.list(params);
    if (requestSeq !== _state._dbRequestSeq || dataSubPage !== store.state.dataSubPage) {
      clearTimeout(loadingGuard);
      return;
    }
    clearTimeout(loadingGuard);

    if (response) {
      const data = response || {};
      store.setState({
        dbData: {
          ...store.state.dbData,
          [dataSubPage]: {
            data: data.data || [],
            total: data.total || 0,
            page: data.page || 1,
            pageSize: data.pageSize || 200
          }
        },
        dbPagination: {
          ...store.state.dbPagination,
          [dataSubPage]: {
            page: data.page || 1,
            pageSize: data.pageSize || 200,
            totalPages: data.totalPages || 1
          }
        },
        dbLoading: { ...store.state.dbLoading, [dataSubPage]: false },
        dbError: { ...store.state.dbError, [dataSubPage]: '' }
      });
    } else {
      store.setState({
        dbLoading: { ...store.state.dbLoading, [dataSubPage]: false },
        dbError: { ...store.state.dbError, [dataSubPage]: '获取数据失败' }
      });
      toast.show('获取数据失败', 'error');
    }
  } catch (err) {
    clearTimeout(loadingGuard);
    if (requestSeq !== _state._dbRequestSeq || dataSubPage !== store.state.dataSubPage) return;
    if (err.name === 'AbortError') {
      // 导航中止在途请求：不弹虚假错误，但必须重置 loading（页面可能仍停留在数据页）
      store.setState({
        dbLoading: { ...store.state.dbLoading, [dataSubPage]: false }
      });
      return;
    }
    store.setState({
      dbLoading: { ...store.state.dbLoading, [dataSubPage]: false },
      dbError: { ...store.state.dbError, [dataSubPage]: err.message }
    });
    toast.show(err.message, 'error');
  }
}

function changeDBPage(delta) {
  const { dataSubPage, dbPagination } = store.state;
  const current = dbPagination[dataSubPage];
  const newPage = current.page + delta;

  if (newPage >= 1 && newPage <= current.totalPages) {
    store.setState({
      dbPagination: {
        ...dbPagination,
        [dataSubPage]: { ...current, page: newPage }
      }
    });
    refreshDBData();
  }
}

function goToDBPage(page) {
  const { dataSubPage, dbPagination } = store.state;
  const pag = dbPagination[dataSubPage];
  if (!pag) return;
  if (page < 1) page = 1;
  if (pag.totalPages && page > pag.totalPages) page = pag.totalPages;
  store.setState({
    dbPagination: {
      ...dbPagination,
      [dataSubPage]: { ...pag, page }
    }
  });
  refreshDBData();
}

function sortDB(field) {
  const { dataSubPage, dbSort } = store.state;
  const current = dbSort[dataSubPage];

  let newOrder = 'asc';
  if (current.sortBy === field && current.sortOrder === 'asc') {
    newOrder = 'desc';
  }

  store.setState({
    dbSort: {
      ...dbSort,
      [dataSubPage]: { sortBy: field, sortOrder: newOrder }
    },
    // 排序改变数据顺序，页码必须回到第 1 页，否则可能落在空页/错位页
    dbPagination: {
      ...store.state.dbPagination,
      [dataSubPage]: { ...store.state.dbPagination[dataSubPage], page: 1 }
    }
  });
  refreshDBData();
}

function searchDB() {
  store.setState({
    dbPagination: {
      ...store.state.dbPagination,
      [store.state.dataSubPage]: { ...store.state.dbPagination[store.state.dataSubPage], page: 1 }
    },
    _prevNameUserIdFilter: store.state.dataSubPage !== 'previousNames' ? '' : store.state._prevNameUserIdFilter,
  });
  refreshDBData();
}

function filterPreviousNamesByUser(userId) {
  if (!userId) return;
  store.setState({
    dataSubPage: 'previousNames',
    dbPagination: {
      ...store.state.dbPagination,
      previousNames: { ...store.state.dbPagination.previousNames, page: 1 }
    },
    _prevNameUserIdFilter: userId
  });
  refreshDBData();
}

function clearPreviousNamesFilter() {
  store.setState({
    _prevNameUserIdFilter: '',
    dbPagination: {
      ...store.state.dbPagination,
      previousNames: { ...store.state.dbPagination.previousNames, page: 1 }
    }
  });
  refreshDBData();
}

// 关联钻取：从用户行查看其实体/链接，从列表行查看其下载实体
function viewUserRelations(el) {
  const userId = el.dataset.dbId;
  if (!userId) return;
  store.setState({
    dataSubPage: 'entities',
    _relUserIdFilter: userId,
    _relListIdFilter: '',
    dbPagination: {
      ...store.state.dbPagination,
      entities: { ...store.state.dbPagination.entities, page: 1 },
      userLinks: { ...store.state.dbPagination.userLinks, page: 1 }
    },
    dbSearch: {
      ...store.state.dbSearch,
      entities: '',
      userLinks: ''
    }
  });
  updateURL('data', 'entities');
  refreshDBData();
}

function viewListRelations(el) {
  const listId = el.dataset.dbId;
  if (!listId) return;
  store.setState({
    dataSubPage: 'listEntities',
    _relListIdFilter: listId,
    _relUserIdFilter: '',
    dbPagination: {
      ...store.state.dbPagination,
      listEntities: { ...store.state.dbPagination.listEntities, page: 1 }
    },
    dbSearch: {
      ...store.state.dbSearch,
      listEntities: ''
    }
  });
  updateURL('data', 'listEntities');
  refreshDBData();
}

function clearRelFilter() {
  store.setState({
    _relUserIdFilter: '',
    _relListIdFilter: '',
    dbPagination: {
      ...store.state.dbPagination,
      entities: { ...store.state.dbPagination.entities, page: 1 },
      userLinks: { ...store.state.dbPagination.userLinks, page: 1 },
      listEntities: { ...store.state.dbPagination.listEntities, page: 1 }
    }
  });
  refreshDBData();
}

async function editDBItem(type, id) {
  try {
    const config = DB_TYPE_CONFIG[type];
    if (!config?.get) return toast.show('This type does not support editing', 'error');
    const item = await config.get(id);

    if (!item) {
      throw new Error('Failed to load item data');
    }

    // 根据类型构建表单内容
    let content = `
      <div class="form-group">
        <label class="form-label">ID</label>
        <div class="font-mono text-sm code-display">${escapeHtml(item.id)}</div>
      </div>
    `;

    switch (type) {
      case 'users':
        content += `
          <div class="form-group">
            <label class="form-label">Screen Name</label>
            <input type="text" class="form-input" id="editScreenName" value="${escapeAttr(item.screen_name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="editName" value="${escapeAttr(item.name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Friends Count</label>
            <input type="number" class="form-input" id="editFriendsCount" value="${escapeAttr(item.friends_count || 0)}" min="0" max="999999999">
          </div>
          <div class="form-group">
            <label class="form-checkbox">
              <input type="checkbox" id="editProtected" ${item.protected ? 'checked' : ''}> Protected
            </label>
          </div>
          <div class="form-group">
            <label class="form-checkbox">
              <input type="checkbox" id="editAccessible" ${item.is_accessible ? 'checked' : ''}> Is Accessible
            </label>
          </div>
        `;
        break;
      case 'lists':
        content += `
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="editListName" value="${escapeAttr(item.name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Owner ID</label>
            <input type="text" class="form-input" id="editListOwnerId" value="${escapeAttr(item.owner_user_id || '')}">
          </div>
        `;
        break;
      case 'entities':
        content += `
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="editEntityName" value="${escapeAttr(item.name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">User ID</label>
            <div class="font-mono text-sm code-display">${escapeHtml(item.user_id)}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Media Count</label>
            <input type="number" class="form-input" id="editEntityMediaCount" value="${escapeAttr(item.media_count || 0)}">
          </div>
        `;
        break;
      case 'listEntities':
        content += `
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="editListEntityName" value="${escapeAttr(item.name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">List ID</label>
            <div class="font-mono text-sm code-display">${escapeHtml(item.lst_id)}</div>
          </div>
        `;
        break;
      case 'userLinks':
        content += `
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="editUserLinkName" value="${escapeAttr(item.name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">User ID</label>
            <div class="font-mono text-sm code-display">${escapeHtml(item.user_id)}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Parent Entity ID</label>
            <div class="font-mono text-sm code-display">${escapeHtml(item.parent_lst_entity_id)}</div>
          </div>
        `;
        break;
    }

    const footer = `
      <button class="btn btn-secondary" data-action="closeDrawer">取消</button>
      <button class="btn btn-primary" data-db-type="${escapeAttr(type)}" data-db-id="${escapeAttr(id)}" data-action="saveDBItem">保存</button>
    `;

    drawer.open('编辑 ' + type, content, footer);
  } catch (err) {
    toast.show(err.message, 'error');
  }
}

async function saveDBItem(type, id) {
  const data = {};

  // 根据类型收集数据
  switch (type) {
    case 'users':
      data.screen_name = document.getElementById('editScreenName').value.trim();
      data.name = document.getElementById('editName').value.trim();
      const fcVal = document.getElementById('editFriendsCount').value;
      if (fcVal !== '') {
        data.friends_count = parseInt(fcVal, 10) || 0;
      }
      data.protected = document.getElementById('editProtected').checked;
      data.is_accessible = document.getElementById('editAccessible').checked;
      if (!data.name) return toast.show('Name is required', 'error');
      break;
    case 'lists':
      data.name = document.getElementById('editListName').value.trim();
      data.owner_user_id = document.getElementById('editListOwnerId').value.trim();
      if (!data.name) return toast.show('Name is required', 'error');
      break;
    case 'entities':
      data.name = document.getElementById('editEntityName').value.trim();
      const mcVal = document.getElementById('editEntityMediaCount').value;
      if (mcVal !== '') {
        data.media_count = parseInt(mcVal, 10) || 0;
      }
      if (!data.name) return toast.show('Name is required', 'error');
      break;
    case 'listEntities':
      data.name = document.getElementById('editListEntityName').value.trim();
      if (!data.name) return toast.show('Name is required', 'error');
      break;
    case 'userLinks':
      data.name = document.getElementById('editUserLinkName').value.trim();
      if (!data.name) return toast.show('Name is required', 'error');
      break;
  }
  try {
    const config = DB_TYPE_CONFIG[type];
    if (!config?.update) return toast.show('This type does not support saving', 'error');
    await config.update(id, data);
    drawer.close();
    toast.show('保存成功');
    refreshDBData();
  } catch (err) {
    toast.show(err.message, 'error');
  }
}

async function deleteDBItem(type, id) {
  const config = DB_TYPE_CONFIG[type];
  if (!config?.delete) return toast.show('This type does not support deletion', 'error');
  const currentRows = store.state.dbData[type]?.data || [];
  const item = currentRows.find(row => String(row.id) === String(id));
  const label = item?.screen_name ? `@${item.screen_name}` : (item?.name || item?.id || id);
  if (!confirm(`确定删除 ${config.title || type} #${id}${label ? ` (${label})` : ''} 吗？\n此操作不可恢复。`)) return;
  try {
    await config.delete(id);
    toast.show('删除成功');
    const { dataSubPage, dbPagination } = store.state;
    const current = dbPagination[dataSubPage];
    const checkParams = new URLSearchParams();
    checkParams.append('page', '1');
    checkParams.append('pageSize', current.pageSize);
    const listFn = DB_TYPE_CONFIG[dataSubPage]?.list;
    if (listFn) {
      const resp = await listFn(checkParams);
      const total = (resp || {}).total || 0;
      const totalPages = Math.max(1, Math.ceil(total / (current.pageSize || 200)));
      store.setState({
        dbPagination: {
          ...dbPagination,
          [dataSubPage]: { ...current, page: Math.min(current.page, totalPages), totalPages }
        }
      });
    }
    refreshDBData();
  } catch (err) {
    toast.show(err.message, 'error');
  }
}

// ============================================
// Actions
// ============================================

// ---- 失败记录（errors.json / json_errors.json）----

async function loadDBStats() {
  try {
    _state._dbStats = await api.getDBStats();
  } catch (err) {
    return;
  }
  // 数据页已渲染时局部更新统计条
  const stats = _state._dbStats || {};
  document.querySelectorAll('[data-db-stat]').forEach(el => {
    const v = stats[el.dataset.dbStat];
    if (v !== undefined) el.textContent = el.textContent.replace(/—$/, v);
  });
}

async function loadQueueStatus() {
  try {
    _state._queueStatus = await api.getQueueStatus();
  } catch (err) {
    _state._queueStatus = null;
    return;
  }
  // 概览页已渲染时局部更新队列卡（避免整页重建）
  const q = _state._queueStatus || {};
  const valEl = document.querySelector('[data-overview-stat="queueDepth"]');
  if (valEl) valEl.textContent = q.queue_depth ?? '—';
  const labelEl = valEl && valEl.nextElementSibling;
  if (labelEl) {
    labelEl.textContent = `队列深度（活跃 ${q.active_jobs ?? 0} / 排队 ${q.pending_jobs ?? 0} / 分离 ${q.detached_jobs ?? 0}）`;
  }
}

async function loadErrors(force = false) {
  if (_state._errorsLoading) return;
  if (!force && _state._errorsData !== null) return;
  _state._errorsLoading = true;
  try {
    _state._errorsData = await api.getErrors();
    renderErrorsPanel();
  } catch (err) {
    // 静默：任务页主体不因错误面板失败而报错；下拉刷新可重试
  } finally {
    _state._errorsLoading = false;
  }
}

function renderErrorsPanel() {
  const container = document.getElementById('errorsPanelContent');
  if (!container) return;
  const data = _state._errorsData || {};
  const regular = data.regular || {};
  const json = data.json || [];
  const regKeys = Object.keys(regular);
  const total = regKeys.length + json.length;

  if (total === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        <div class="empty-icon" style="width: 40px; height: 40px; font-size: 16px; margin-bottom: 8px;">✅</div>
        <div class="empty-desc">暂无失败记录</div>
      </div>
    `;
    return;
  }

  const regRows = regKeys.length ? regKeys.map(k => `
    <tr><td class="mono">#${escapeHtml(k)}</td><td class="text-right">${escapeHtml(String(regular[k]))}</td></tr>
  `).join('') : '';
  const jsonRows = json.length ? json.map(j => `
    <tr><td class="mono" title="${escapeAttr(j.source_path || '')}">${escapeHtml((j.source_path || '').split(/[\\/]/).pop())}</td><td class="text-right">${escapeHtml(String(j.count || 0))}</td></tr>
  `).join('') : '';

  container.innerHTML = `
    <div class="flex gap-2" style="margin-bottom: 12px; flex-wrap: wrap;">
      <button class="btn btn-primary btn-sm" data-action="retryAllErrors">重试全部失败</button>
      <button class="btn btn-danger btn-sm" data-action="clearErrors">清空失败记录</button>
    </div>
    ${regKeys.length ? `
      <div class="text-sm text-secondary" style="margin-bottom: 6px;">常规失败（${regKeys.length} 个实体）</div>
      <div class="table-scroll-container" style="max-height: 180px;">
        <table class="data-table">
          <thead><tr><th>实体 ID</th><th class="text-right">失败推文数</th></tr></thead>
          <tbody>${regRows}</tbody>
        </table>
      </div>
    ` : ''}
    ${json.length ? `
      <div class="text-sm text-secondary" style="margin-top: 12px; margin-bottom: 6px;">JSON 导入失败（${json.length} 个来源）</div>
      <div class="table-scroll-container" style="max-height: 180px;">
        <table class="data-table">
          <thead><tr><th>来源</th><th class="text-right">失败数</th></tr></thead>
          <tbody>${jsonRows}</tbody>
        </table>
      </div>
    ` : ''}
  `;
}

async function retryAllErrors() {
  if (_state._pendingTaskActions.has('retry-all-errors')) return;
  _state._pendingTaskActions.add('retry-all-errors');
  try {
    const res = await api.retryAllErrors();
    toast.show('已创建重试任务 ' + (res.task_id || ''), 'success');
  } catch (err) {
    toast.show(err.message, 'error');
  } finally {
    _state._pendingTaskActions.delete('retry-all-errors');
  }
}

async function clearErrors() {
  if (!confirm('确定清空所有失败记录？此操作不可撤销。')) return;
  try {
    await api.clearErrors();
    _state._errorsData = null;
    await loadErrors(true);
    toast.show('失败记录已清空', 'success');
  } catch (err) {
    toast.show(err.message, 'error');
  }
}

async function handleQuickDownload(button = null) {
  const input = document.getElementById('quickDownloadInput');
  let value = input.value.trim();
  
  if (!value) {
    if (!navigator.clipboard?.readText) {
      return toast.show('当前环境不支持读取剪切板，请手动输入', 'error');
    }
    try {
      value = await navigator.clipboard.readText();
      value = value.trim();
    } catch (err) {
      return toast.show('请输入用户名或链接，或允许读取剪切板', 'error');
    }
    if (!value) {
      return toast.show('剪切板为空，请输入用户名或链接', 'error');
    }
    // await 期间用户可能已手动输入，此时不应覆盖
    const currentVal = input.value.trim();
    if (currentVal && currentVal !== value) {
      value = currentVal;
    } else {
      input.value = value;
    }
  }

  let username = value;
  // 从粘贴文本中提取第一个 URL（支持行内混合粘贴），无 URL 时用原始输入
  // 排除常见尾随标点，避免 "twitter.com/elonmusk," 提取出带逗号的用户名
  const firstUrl = (value.match(/https?:\/\/[^\s,，。;；、]+/) || [value])[0];
  const listMatch = firstUrl.match(/https?:\/\/(?:twitter\.com|x\.com)\/i\/lists\/(\d+)/);
  if (listMatch) {
    await runTaskButtonAction(button, `create:quick:list:${listMatch[1]}`, async () => {
      try {
        await api.createListDownload(listMatch[1], { auto_follow: true });
        toast.show(`已创建列表下载任务: List ${listMatch[1]}`);
        input.value = '';
      } catch (err) {
        toast.show(err.message, 'error');
      }
    });
    return;
  }
  const userMatch = firstUrl.match(/https?:\/\/(?:twitter\.com|x\.com)\/([^/\s?]+)/);
  if (userMatch) {
    const pathPart = userMatch[1];
    if (!['i', 'search', 'status', 'home', 'explore', 'notifications', 'messages', 'settings', 'compose', 'bookmarks', 'lists', 'communities'].includes(pathPart.toLowerCase())) {
      username = pathPart;
    }
  }
  if (username.startsWith('@')) username = username.slice(1);

  await runTaskButtonAction(button, `create:quick:user:${username}`, async () => {
    try {
      await api.createUserDownload(username, { auto_follow: true });
      toast.show(`已创建用户下载任务: @${username}`);
      input.value = '';
    } catch (err) {
      toast.show(err.message, 'error');
    }
  });
}

async function createUserTask(button = null) {
  return createTaskFromInput(button, {
    inputId: 'userScreenName', emptyMsg: '请输入 Screen Name',
    actionKeyPrefix: 'create:user',
    makeApi: v => api.createUserDownload(v, getCheckedOptions('user')),
    successMsg: '用户下载任务已创建',
  });
}

async function createProfileTask(button = null) {
  return createTaskFromInput(button, {
    inputId: 'userScreenName', emptyMsg: '请输入 Screen Name',
    actionKeyPrefix: 'create:profile',
    makeApi: v => api.createProfileDownload(v),
    successMsg: 'Profile 下载任务已创建',
  });
}

async function markUserTask(button = null) {
  return createTaskFromInput(button, {
    inputId: 'userScreenName', emptyMsg: '请输入 Screen Name',
    actionKeyPrefix: 'mark:user',
    makeApi: v => api.createUserMark(v),
    successMsg: '标记任务已创建',
  });
}

async function markFollowingTask(button = null) {
  return createTaskFromInput(button, {
    inputId: 'followingScreenName', emptyMsg: '请输入 Screen Name',
    actionKeyPrefix: 'mark:following',
    makeApi: v => api.createFollowingMark(v),
    successMsg: '标记任务已创建',
  });
}

async function markListTask(button = null) {
  return createTaskFromInput(button, {
    inputId: 'listId', emptyMsg: '请输入 List ID', numericOnly: true,
    actionKeyPrefix: 'mark:list',
    makeApi: v => api.createListMark(v),
    successMsg: '标记任务已创建',
  });
}

// 单输入任务创建模板：读输入 → 空/格式校验 → 防重入执行 → 成功清空输入。
// 统一了 user/list/following 三组创建/Profile/标记 handler 的重复骨架，
// 并把 List ID 数字校验（此前仅 markListTask 有）统一到所有 list 入口。
async function createTaskFromInput(button, { inputId, emptyMsg, numericOnly = false, actionKeyPrefix, makeApi, successMsg }) {
  const input = document.getElementById(inputId);
  if (!input) return false;
  const value = input.value.trim();
  if (!value) return toast.show(emptyMsg, 'error');
  if (numericOnly && !/^\d+$/.test(value)) return toast.show('List ID 必须为数字', 'error');
  const ok = await runTaskButtonAction(button, `${actionKeyPrefix}:${value}`, () => apiTask(makeApi(value), successMsg));
  if (ok) input.value = '';
  return ok;
}

async function apiTask(apiCall, successMsg) {
  try {
    await apiCall();
    toast.show(successMsg);
    return true;
  } catch (err) {
    toast.show(err.message, 'error');
  }
}

async function runTaskButtonAction(button, actionKey, work) {
  if (_state._pendingTaskActions.has(actionKey)) return false;
  _state._pendingTaskActions.add(actionKey);

  const originalHTML = button ? button.innerHTML : '';
  const originalDisabled = button ? button.disabled : false;
  const originalAriaDisabled = button ? button.getAttribute('aria-disabled') : null;
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    button.classList.add('is-busy');
    button.innerHTML = '<span class="loading-spinner"></span>处理中...';
  }

  try {
    return await work();
  } finally {
    _state._pendingTaskActions.delete(actionKey);
    if (button && document.body.contains(button)) {
      button.disabled = originalDisabled;
      if (originalAriaDisabled === null) button.removeAttribute('aria-disabled');
      else button.setAttribute('aria-disabled', originalAriaDisabled);
      button.classList.remove('is-busy');
      button.innerHTML = originalHTML;
    }
  }
}

// 读取标准 checkbox 选项组 (auto_follow / follow_members / skip_profile / no_retry)
function getCheckedOptions(prefix) {
  return {
    auto_follow: document.getElementById(prefix + 'AutoFollow')?.checked ?? false,
    follow_members: document.getElementById(prefix + 'FollowMembers')?.checked ?? false,
    skip_profile: document.getElementById(prefix + 'SkipProfile')?.checked ?? false,
    no_retry: document.getElementById(prefix + 'NoRetry')?.checked ?? false,
  };
}

async function createListTask(button = null) {
  return createTaskFromInput(button, {
    inputId: 'listId', emptyMsg: '请输入 List ID', numericOnly: true,
    actionKeyPrefix: 'create:list',
    makeApi: v => api.createListDownload(v, getCheckedOptions('list')),
    successMsg: '列表下载任务已创建',
  });
}

async function createListProfileTask(button = null) {
  return createTaskFromInput(button, {
    inputId: 'listId', emptyMsg: '请输入 List ID', numericOnly: true,
    actionKeyPrefix: 'create:list-profile',
    makeApi: v => api.createListProfile(v),
    successMsg: '列表 Profile 任务已创建',
  });
}

async function createFollowingTask(button = null) {
  return createTaskFromInput(button, {
    inputId: 'followingScreenName', emptyMsg: '请输入 Screen Name',
    actionKeyPrefix: 'create:following',
    makeApi: v => api.createFollowingDownload(v, getCheckedOptions('following')),
    successMsg: '关注下载任务已创建',
  });
}

async function createMarkTask(button = null) {
  const users = document.getElementById('markUsers').value.split('\n').map(s => s.trim()).filter(Boolean);
  const listIDs = readListIDsFromTextarea('markLists');
  const followingNames = document.getElementById('markFollowingNames').value.split('\n').map(s => s.trim()).filter(Boolean);

  if (!users.length && !listIDs.length && !followingNames.length) {
    return toast.show('请输入至少一个用户、列表或 Following 用户', 'error');
  }

  await runTaskButtonAction(button, 'create:mark', async () => {
    try {
      const timestamp = getOptionalTimestamp('markTimestamp');
      const data = {};
      if (users.length) data.users = users;
      if (listIDs.length) data.lists = listIDs;
      if (followingNames.length) data.following_names = followingNames;
      if (timestamp) data.timestamp = timestamp;

      await api.createBatchMark(data);
      document.getElementById('markUsers').value = '';
      document.getElementById('markLists').value = '';
      document.getElementById('markFollowingNames').value = '';
      document.getElementById('markTimestamp').value = '';

      const totalCount = users.length + listIDs.length + followingNames.length;
      toast.show(`已创建批量标记任务（共 ${totalCount} 个目标）`);
    } catch (err) {
      toast.show(err.message, 'error');
    }
  });
}

async function createBatchTask(button = null) {
  const users = document.getElementById('batchUsers').value.split('\n').map(s => s.trim()).filter(Boolean);
  const lists = readListIDsFromTextarea('batchLists');
  const followingNames = document.getElementById('batchFollowingNames').value.split('\n').map(s => s.trim()).filter(Boolean);
  
  if (!users.length && !lists.length && !followingNames.length) {
    return toast.show('请输入至少一个用户、列表或 Following 用户', 'error');
  }
  
  await runTaskButtonAction(button, 'create:batch', async () => {
    try {
      await api.createBatchDownload({
        users,
        lists,
        following_names: followingNames,
        auto_follow: document.getElementById('batchAutoFollow').checked,
        follow_members: document.getElementById('batchFollowMembers').checked,
        skip_profile: document.getElementById('batchSkipProfile').checked,
        no_retry: document.getElementById('batchNoRetry').checked
      });
      toast.show(`批量任务已创建 (${users.length} 用户, ${lists.length} 列表, ${followingNames.length} 关注源)`);
      document.getElementById('batchUsers').value = '';
      document.getElementById('batchLists').value = '';
      document.getElementById('batchFollowingNames').value = '';
    } catch (err) {
      toast.show(err.message, 'error');
    }
  });
}

async function createJsonFileTask(button = null) {
  const uploadInput = document.getElementById('jsonFileUpload');
  const paths = readTextareaLines('jsonFilePaths');
  const noRetry = document.getElementById('jsonFileNoRetry').checked;

  if (uploadInput.files.length > 0) {
    const formData = new FormData();
    for (const file of uploadInput.files) formData.append('files', file);
    formData.append('no_retry', String(noRetry));

    await runTaskButtonAction(button, 'create:json-file:upload', async () => {
      try {
        const result = await api.upload('/api/v1/json/file/download', formData);
        toast.show(result.message || 'JSON 文件上传任务已创建');
        uploadInput.value = '';
        document.getElementById('jsonFilePaths').value = '';
      } catch (err) {
        toast.show(err.message, 'error');
      }
    });
    return;
  }

  if (!paths.length) return toast.show('请选择至少一个 JSON 文件，或填写服务端路径', 'error');

  await runTaskButtonAction(button, 'create:json-file:paths', async () => {
    try {
      const result = await api.createJsonFileDownload({
        paths,
        no_retry: noRetry
      });
      toast.show(result.message || 'JSON 文件任务已创建');
      document.getElementById('jsonFilePaths').value = '';
    } catch (err) {
      toast.show(err.message, 'error');
    }
  });
}

async function createJsonFolderTask(button = null) {
  const uploadInput = document.getElementById('jsonFolderUpload');
  const paths = readTextareaLines('jsonFolderPath');
  const noRetry = document.getElementById('jsonFolderNoRetry').checked;

  if (uploadInput.files.length > 0) {
    const formData = new FormData();
    for (const file of uploadInput.files) formData.append('files', file);
    formData.append('no_retry', String(noRetry));

    await runTaskButtonAction(button, 'create:json-folder:upload', async () => {
      try {
        const result = await api.upload('/api/v1/json/folder/download', formData);
        toast.show(result.message || 'LoongTweet 上传任务已创建');
        uploadInput.value = '';
        document.getElementById('jsonFolderPath').value = '';
      } catch (err) {
        toast.show(err.message, 'error');
      }
    });
    return;
  }

  if (!paths.length) return toast.show('请选择至少一个 JSON 文件，或填写 LoongTweet 文件夹路径', 'error');

  await runTaskButtonAction(button, 'create:json-folder:paths', async () => {
    try {
      const result = await api.createJsonFolderDownload({
        paths,
        no_retry: noRetry
      });
      toast.show(result.message || 'LoongTweet 任务已创建');
      document.getElementById('jsonFolderPath').value = '';
    } catch (err) {
      toast.show(err.message, 'error');
    }
  });
}

async function cancelTask(id, button = null) {
  if (!confirm('确定要取消这个任务吗？')) return;

  await runTaskButtonAction(button, `cancel:${id}`, async () => {
    try {
      await api.cancelTask(id);
      toast.show('任务已取消');
      await refreshTasks({ silent: true });
    } catch (err) {
      toast.show(err.message, 'error');
    }
  });
}

async function retryTask(id, button = null) {
  await runTaskButtonAction(button, `retry:${id}`, async () => {
    try {
      await api.retryTask(id);
      toast.show('任务已重新创建');
      await refreshTasks({ silent: true });
    } catch (err) {
      toast.show(err.message, 'error');
    }
  });
}

async function deleteTask(id, button = null) {
  if (!confirm('确定要删除这个任务吗？')) return;

  await runTaskButtonAction(button, `delete:${id}`, async () => {
    try {
      await api.deleteTask(id);
      toast.show('任务已删除');
      if (drawer._taskId === id) drawer.close();
      await refreshTasks({ silent: true });
    } catch (err) {
      toast.show(err.message, 'error');
    }
  });
}

async function cancelQueuedTasks(button = null) {
  const queuedCount = store.state.tasks.filter(t => t.status === 'queued').length;
  if (queuedCount === 0) return toast.show('没有排队中的任务', 'error');
  if (!confirm(`确定要取消 ${queuedCount} 个排队中的任务吗？`)) return;

  await runTaskButtonAction(button, 'cancel:queued', async () => {
    try {
      const result = await api.cancelQueuedTasks();
      toast.show(`已取消 ${result.cancelled_count} 个排队中的任务`);
      await refreshTasks({ silent: true });
    } catch (err) {
      toast.show(err.message, 'error');
    }
  });
}

async function showTaskDetail(id) {
  drawer.open('任务详情', '<div class="text-sm text-secondary" style="text-align:center;padding:var(--space-8)">加载中...</div>');
  drawer._taskId = id;

  let task;
  try {
    task = await api.getTask(id);
  } catch (err) {
    drawer.open('任务详情',
      `<div class="task-detail-error">获取任务详情失败: ${escapeHtml(err.message)}</div>`,
      `<button class="btn btn-secondary" data-action="closeDrawer">关闭</button>
	       <button class="btn btn-primary" data-task-id="${escapeAttr(id)}" data-action="showTaskDetail">重试</button>`
    );
    drawer._taskId = id;
    return;
  }

  if (!task) {
    drawer.open('任务详情',
      '<div class="task-detail-error">未找到该任务</div>',
      '<button class="btn btn-secondary" data-action="closeDrawer">关闭</button>'
    );
    drawer._taskId = id;
    return;
  }

  renderTaskDetail(task);
}

function renderTaskDetail(task, options = {}) {
  const scrollTop = options.preserveScroll && drawer.body ? drawer.body.scrollTop : 0;
  const status = getTaskStatusInfo(task.status);
  const statusText = escapeHtml(status.detailText);
  const pct = getTaskProgressPercent(task);
  const stageText = task.progress?.stage ? escapeHtml(getStageText(task.progress.stage)) : '';
  const currentText = task.progress?.current ? ` · ${escapeHtml(task.progress.current)}` : '';
  const target = escapeHtml(getTaskTarget(task));

  // Build target details
  let targetDetails = '';
  if (task.data?.screen_name) {
    targetDetails = `<div class="task-detail-grid"><div class="task-detail-label">用户</div><div class="task-detail-value">@${escapeHtml(task.data.screen_name)}</div></div>`;
  } else if (task.data?.list_id) {
    targetDetails = `<div class="task-detail-grid"><div class="task-detail-label">列表</div><div class="task-detail-value">${escapeHtml(String(task.data.list_id))}</div></div>`;
  } else {
    const parts = [];
    if (task.data?.users?.length) parts.push(`<div class="task-detail-label">用户</div><div class="task-detail-value">${task.data.users.map(u => '@' + escapeHtml(u)).join(', ')}</div>`);
    if (task.data?.lists?.length) parts.push(`<div class="task-detail-label">列表</div><div class="task-detail-value">${task.data.lists.map(l => escapeHtml(String(l))).join(', ')}</div>`);
    if (task.data?.following_names?.length) parts.push(`<div class="task-detail-label">关注</div><div class="task-detail-value">${task.data.following_names.map(f => '@' + escapeHtml(f)).join(', ')}</div>`);
    if (parts.length) targetDetails = `<div class="task-detail-grid">${parts.join('')}</div>`;
  }

  // Build time timeline
  const createdTime = formatDate(task.created_at);
  const startedTime = task.started_at ? formatDate(task.started_at) : null;
  const endedTime = task.ended_at ? formatDate(task.ended_at) : null;

  let durationText = '';
  if (task.started_at && task.ended_at) {
    const dur = new Date(task.ended_at) - new Date(task.started_at);
    if (!isNaN(dur)) {
      const mins = Math.floor(dur / 60000);
      const secs = Math.round((dur % 60000) / 1000);
      if (mins > 0) durationText = `${mins}分${secs}秒`;
      else durationText = `${secs}秒`;
    }
  }

  let timeHtml = `
    <div class="task-detail-time-row">
      <div class="task-detail-time-dot" style="background:var(--info)"></div>
      <div class="task-detail-time-label">创建</div>
      <div class="task-detail-time-value">${createdTime}</div>
    </div>`;
  if (startedTime) {
    timeHtml += `
    <div class="task-detail-time-line"></div>
    <div class="task-detail-time-row">
      <div class="task-detail-time-dot" style="background:var(--warning)"></div>
      <div class="task-detail-time-label">开始</div>
      <div class="task-detail-time-value">${startedTime}</div>
    </div>`;
  }
  if (endedTime) {
    timeHtml += `
    <div class="task-detail-time-line"></div>
    <div class="task-detail-time-row">
      <div class="task-detail-time-dot" style="background:var(--success)"></div>
      <div class="task-detail-time-label">结束</div>
      <div class="task-detail-time-value">${endedTime}</div>
    </div>`;
  }
  if (durationText) {
    timeHtml += `
    <div class="task-detail-time-line"></div>
    <div class="task-detail-time-row">
      <div class="task-detail-time-dot" style="background:var(--text-secondary)"></div>
      <div class="task-detail-time-label">耗时</div>
      <div class="task-detail-time-value" style="color:var(--text-primary)">${durationText}</div>
    </div>`;
  }

  // Build result
  let resultHtml = '';
  const result = task.result;
  if (result) {
    let mainHtml = '';
    if (result.main) {
      const parts = [`<span class="task-detail-stat"><span class="task-detail-stat-val success">${result.main.downloaded || 0}</span><span class="task-detail-stat-lbl">已下载</span></span>`];
      if (result.main.failed) {
        parts.push(`<span class="task-detail-stat"><span class="task-detail-stat-val danger">${result.main.failed}</span><span class="task-detail-stat-lbl">失败</span></span>`);
      }
      mainHtml = `<div class="task-detail-section-title-sm">主下载</div><div class="task-detail-stats">${parts.join('')}</div>`;
    }
    let profileHtml = '';
    if (result.profile) {
      const parts = [`<span class="task-detail-stat"><span class="task-detail-stat-val success">${result.profile.downloaded || 0}</span><span class="task-detail-stat-lbl">已下载</span></span>`];
      if (result.profile.failed) {
        parts.push(`<span class="task-detail-stat"><span class="task-detail-stat-val danger">${result.profile.failed}</span><span class="task-detail-stat-lbl">失败</span></span>`);
      }
      if (result.profile.versioned) {
        parts.push(`<span class="task-detail-stat"><span class="task-detail-stat-val info">${result.profile.versioned}</span><span class="task-detail-stat-lbl">已更新</span></span>`);
      }
      profileHtml = `<div class="task-detail-section-title-sm">Profile</div><div class="task-detail-stats">${parts.join('')}</div>`;
    }
    const msgHtml = result.message ? `<div class="task-detail-msg">${escapeHtml(result.message)}</div>` : '';

    if (mainHtml || profileHtml || msgHtml) {
      resultHtml = `
        <div class="task-detail-section">
          <div class="task-detail-section-title">结果</div>
          <div class="task-detail-card">
            ${mainHtml}${mainHtml && (profileHtml || msgHtml) ? '<div style="height:1px;background:var(--border-secondary);margin:var(--space-2) 0"></div>' : ''}
            ${profileHtml}${profileHtml && msgHtml ? '<div style="height:1px;background:var(--border-secondary);margin:var(--space-2) 0"></div>' : ''}
            ${msgHtml}
          </div>
        </div>`;
    }
  }

  // Build content
  const content = `
    <div class="task-detail-header ${status.statusClass}">
      <div class="task-detail-header-info">
        <div class="task-detail-header-title">${target || '未知目标'}</div>
        <div class="task-detail-header-sub">${escapeHtml(task.task_id)}</div>
      </div>
      <span class="tag ${status.tag}" style="font-size:var(--text-base)">${statusText}</span>
    </div>

    <div class="task-detail-section">
      <div class="task-detail-section-title">概览</div>
      <div class="task-detail-card">
        <div class="task-detail-grid">
          <div class="task-detail-label">类型</div>
          <div class="task-detail-value">${escapeHtml(task.type)}</div>
          <div class="task-detail-label">状态</div>
          <div class="task-detail-value ${status.statusClass}">${statusText}</div>
        </div>
      </div>
    </div>

    ${targetDetails ? `
    <div class="task-detail-section">
      <div class="task-detail-section-title">目标</div>
      <div class="task-detail-card">${targetDetails}</div>
    </div>` : ''}

    <div class="task-detail-section">
      <div class="task-detail-section-title">进度</div>
      <div class="task-detail-card">
        <div class="progress-bar" style="margin-bottom: var(--space-2);">
          <div class="progress-fill" style="width: ${pct}%"></div>
        </div>
        <div class="text-sm" style="display:flex;justify-content:space-between;color:var(--text-secondary);">
          <span>${task.progress?.completed || 0} / ${task.progress?.total || 0} (${pct}%)</span>
          <span>${stageText}${currentText}</span>
        </div>
        ${task.progress?.failed ? `<div class="text-sm" style="color: var(--danger); margin-top: 6px;">失败推文: ${escapeHtml(task.progress.failed)}</div>` : ''}
      </div>
    </div>

    <div class="task-detail-section">
      <div class="task-detail-section-title">时间</div>
      <div class="task-detail-card">${timeHtml}</div>
    </div>

    ${resultHtml}

    ${task.error ? `
    <div class="task-detail-section">
      <div class="task-detail-section-title" style="color:var(--danger);border-bottom-color:rgba(248,81,73,0.3);">错误</div>
      <div class="task-detail-error">${escapeHtml(task.error)}</div>
    </div>` : ''}
  `;

  const footer = task.status === 'running' || task.status === 'queued' ?
    `<button class="btn btn-danger" data-task-id="${escapeAttr(task.task_id)}" data-action="cancelTask">取消任务</button>` :
    `<button class="btn btn-primary" data-task-id="${escapeAttr(task.task_id)}" data-action="retryTask">重试</button>
     <button class="btn btn-danger" data-task-id="${escapeAttr(task.task_id)}" data-action="deleteTask">删除</button>
     <button class="btn btn-secondary" data-action="closeDrawer">关闭</button>`;

  drawer.open('任务详情', content, footer);
  drawer._taskId = task.task_id;
  if (options.preserveScroll && drawer.body) {
    requestAnimationFrame(() => { drawer.body.scrollTop = scrollTop; });
  }
}

let _drawerRAF = null;
let _drawerPendingTasks = null;
function updateOpenTaskDrawerFromTasks(tasks) {
  // rAF 节流：同帧内多次任务快照只重建一次抽屉详情
  _drawerPendingTasks = tasks;
  if (_drawerRAF) return;
  _drawerRAF = requestAnimationFrame(() => {
    _drawerRAF = null;
    const latest = _drawerPendingTasks;
    _drawerPendingTasks = null;
    if (!drawer._taskId || !drawer.el?.classList.contains('open')) return;
    const task = (latest || []).find(t => t.task_id === drawer._taskId);
    if (!task) {
      drawer.body.innerHTML = '<div class="task-detail-error">该任务已不在任务列表中</div>';
      drawer.footer.innerHTML = '<button class="btn btn-secondary" data-action="closeDrawer">关闭</button>';
      return;
    }
    renderTaskDetail(task, { preserveScroll: true });
  });
}

async function refreshTasks(options = {}) {
  const epoch = _tasksEpoch;
  try {
    const data = await api.getTasks();
    // 期间 SSE 已推送更新的任务快照 → 丢弃迟到的旧 GET 响应，避免列表回滚
    if (epoch !== _tasksEpoch) return;
    const tasks = data.tasks || [];
    store.setState({ tasks });
    updateOpenTaskDrawerFromTasks(tasks);
    if (!options.silent) toast.show('任务列表已刷新');
  } catch (err) {
    if (err.name === 'AbortError') return; // 导航中止在途请求，不弹虚假错误
    toast.show(err.message, 'error');
  }
}

async function loadOverviewData() {
  const epoch = _tasksEpoch; // 捕获发起时代际：SSE 推送的新快照优先，在途 GET 过期即弃
  const [health, tasks] = await Promise.all([
    api.getHealth(),
    api.getTasks()
  ]);
  if (epoch !== _tasksEpoch) return null; // 期间 SSE 已推送更新，丢弃过期快照
  return {
    health,
    tasks: tasks.tasks || [],
  };
}

async function refreshOverviewData() {
  const data = await loadOverviewData();
  if (!data) return null; // 代际过期：SSE 已推送更新，本次响应作废
  store.setState(data);
  return data;
}

// 安全的日期格式化：无效/缺失值显示 '-'（避免 "Invalid Date" 文案）
function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function escapeHtml(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, '&#96;');
}

// 剥离 ANSI：CSI 序列 + OSC 序列（\x1b]...\x07/\x1b\\）+ 孤立 ESC 字符
function stripAnsi(str) {
  return String(str)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b/g, '');
}

const LOG_STREAM_MAX_LINES = 5000;
const LOG_DOMAIN_OPTIONS = [
  ['all', '全部域'],
  ['api', 'api'],
  ['auth', 'auth'],
  ['batch', 'batch'],
  ['db', 'db'],
  ['download', 'download'],
  ['download-queue', 'download-queue'],
  ['downloader', 'downloader'],
  ['logs', 'logs'],
  ['profile', 'profile'],
  ['scheduler', 'scheduler'],
  ['server', 'server'],
  ['startup', 'startup'],
  ['task', 'task'],
  ['twitter', 'twitter'],
  ['sse', 'sse']
];

function getLineLevel(line) {
  if (line.startsWith('FATA[')) return 'fatal';
  if (line.startsWith('ERRO[')) return 'error';
  if (line.startsWith('WARN[')) return 'warn';
  if (line.startsWith('INFO[')) return 'info';
  if (line.startsWith('DEBU[')) return 'debug';
  return '';
}

function getLogEntryClass(line) {
  const level = getLineLevel(line);
  return 'log-entry' + (level ? ' log-entry-' + level : '');
}

function getLogDomain(line) {
  const m = stripAnsi(line).match(/^(?:(?:DEBU|INFO|WARN|ERRO|FATA)\[[^\]]+\]\s+)?\[([a-z0-9_-]+)\]/i);
  return m ? m[1].toLowerCase() : '';
}

function getLogFieldTone(key, value) {
  const normalized = String(value || '').replace(/^"|"$/g, '').toLowerCase();
  const numeric = Number(normalized);
  if (key === 'error') return 'danger';
  if (key === 'reason') return 'warning';
  if (key === 'dur' || key === 'duration') return 'info';
  if (key === 'status') {
    if (/^5/.test(normalized)) return 'danger';
    if (/^4/.test(normalized)) return 'warning';
    if (/^[23]/.test(normalized)) return 'success';
  }
  if (['failed', 'failed_tweets', 'remaining_tweets', 'remaining_entities', 'errors', 'unable_to_start'].includes(key)) {
    return numeric > 0 ? 'danger' : 'muted';
  }
  if (['skipped', 'suppressed'].includes(key)) {
    return numeric > 0 ? 'warning' : 'muted';
  }
  if (['succeeded', 'downloaded', 'versioned', 'total'].includes(key)) {
    return numeric > 0 ? 'success' : 'muted';
  }
  return '';
}

function renderLogField(key, value) {
  const tone = getLogFieldTone(key, value);
  const toneClass = tone ? ' log-field-' + tone : '';
  return '<span class="log-field' + toneClass + '"><span class="log-field-key">' +
    escapeHtml(key) + '</span>=<span class="log-field-value">' + escapeHtml(value) + '</span></span>';
}

function highlightLogFields(line) {
  // 字段值排除尾部标点：\S+ 会吞掉 status=200, 的逗号、error="x". 的句号
  const fieldRegex = /\b([A-Za-z_][A-Za-z0-9_-]*)=("(?:[^"\\]|\\.)*"|[^\s,;.)\]}]+)/g;
  let html = '';
  let lastIndex = 0;
  let match;
  while ((match = fieldRegex.exec(line)) !== null) {
    html += escapeHtml(line.slice(lastIndex, match.index));
    html += renderLogField(match[1], match[2]);
    lastIndex = match.index + match[0].length;
  }
  html += escapeHtml(line.slice(lastIndex));
  return html;
}

function highlightLogLine(line) {
  let html = highlightLogFields(line);
  // 当前 logrus TextFormatter 格式: LEVEL[TIMESTAMP]
  const levelRegex = /^(FATA|ERRO|WARN|INFO|DEBU)\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2})\]/;
  const levelMatch = levelRegex.exec(html);
  if (levelMatch) {
    html = html.slice(0, levelMatch[0].length).replace(
      levelRegex,
      '<span class="log-level">$1</span>[<span class="log-timestamp">$2</span>]'
    ) + html.slice(levelMatch[0].length);
    // domain 高亮仅在标准 logrus 行执行（有 LEVEL[TIMESTAMP] 前缀），
    // 避免裸日志行中用户文本首次出现的 "] [" 被误包
    html = html.replace(/(\]\s+)(\[[a-z0-9_-]+\])/i, '$1<span class="log-domain">$2</span>');
  }
  return html;
}

// ============================================
// Security 面板：JWT 会话状态 + API Key 登录/测试/刷新/清除
// 不持久化 API Key 明文到 localStorage（web2 的 tmd_api_key 行为有意不复刻，避免明文密钥驻留浏览器）
// ============================================
function getJWTStatusHTML() {
  const jwt = localStorage.getItem('tmd_jwt_token');
  const jwtExpiry = localStorage.getItem('tmd_jwt_expiry');
  if (!jwt) return '<div class="card-subtitle">当前无 JWT 会话（服务器可能未启用认证）</div>';
  if (!jwtExpiry) return '<div class="card-subtitle" style="color:var(--success)">✅ JWT 会话已建立（无过期时间）</div>';
  const remaining = new Date(jwtExpiry) - new Date();
  if (remaining > 0) {
    const mins = Math.max(1, Math.round(remaining / 60000));
    return `<div class="card-subtitle" style="color:var(--success)">✅ JWT 会话有效，约 ${mins} 分钟后过期</div>`;
  }
  return '<div class="card-subtitle" style="color:var(--danger)">❌ JWT 已过期，需要重新登录</div>';
}

function renderSecurityEditor() {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">🔐 安全认证</div>
          ${getJWTStatusHTML()}
        </div>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">API Key</label>
          <input type="password" class="form-input" id="secApiKey" placeholder="输入 API Key 以建立会话" autocomplete="off">
          <div class="form-hint" style="font-size:12px;color:var(--text-tertiary);margin-top:6px">API Key 在「配置编辑」页的安全认证分组或 conf.yaml 中设置。登录后仅保存 JWT 会话，不保存 API Key 明文到浏览器。</div>
        </div>
        <div class="flex gap-3" style="flex-wrap:wrap;margin-top:12px">
          <button class="btn btn-primary btn-sm" data-action="secLogin">登录并保存</button>
          <button class="btn btn-secondary btn-sm" data-action="secTest">测试连接</button>
          <button class="btn btn-ghost btn-sm" data-action="secRefresh">刷新会话</button>
          <button class="btn btn-ghost btn-sm" data-action="secClear">清除会话</button>
        </div>
        <div id="secStatus" class="form-hint" style="font-size:12px;margin-top:10px;min-height:18px"></div>
      </div>
    </div>
  `;
}

function setSecStatus(message, color = '') {
  const st = document.getElementById('secStatus');
  if (!st) return;
  st.textContent = message;
  if (color) st.style.color = color;
}

function refreshSecStatusHeader() {
  const subtitle = document.querySelector('#systemSecurityPanel .card-subtitle');
  if (subtitle) subtitle.outerHTML = getJWTStatusHTML();
}

async function secLogin() {
  const input = document.getElementById('secApiKey');
  if (!input) return;
  const key = input.value.trim();
  if (!key) { setSecStatus('⚠️ 请输入 API Key', 'var(--warning)'); return; }
  setSecStatus('⏳ 正在登录...');
  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key }
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success || !json.data || !json.data.token) {
      throw new Error(json?.error || '认证失败 (HTTP ' + res.status + ')');
    }
    localStorage.setItem('tmd_jwt_token', json.data.token);
    if (json.data.expires_at) localStorage.setItem('tmd_jwt_expiry', json.data.expires_at);
    else localStorage.removeItem('tmd_jwt_expiry');
    input.value = '';
    setSecStatus('✅ 登录成功，JWT 会话已建立', 'var(--success)');
    refreshSecStatusHeader();
  } catch (e) {
    setSecStatus('❌ 登录失败: ' + e.message, 'var(--danger)');
  }
}

async function secTest() {
  const input = document.getElementById('secApiKey');
  const key = input ? input.value.trim() : '';
  if (!key) { setSecStatus('⚠️ 请先输入 API Key', 'var(--warning)'); return; }
  setSecStatus('⏳ 正在测试...');
  try {
    // 直接 fetch + Bearer 头：显式验证 key，不走 JWT 自动刷新链
    const res = await fetch('/api/v1/tasks?limit=1', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (res.ok) setSecStatus('✅ 连接成功，API Key 有效', 'var(--success)');
    else if (res.status === 401) setSecStatus('❌ API Key 无效（服务器返回 401）', 'var(--danger)');
    else setSecStatus('⚠️ 服务器返回状态 ' + res.status, 'var(--warning)');
  } catch (e) {
    if (e.name === 'AbortError') setSecStatus('❌ 请求超时', 'var(--danger)');
    else setSecStatus('❌ 网络错误: ' + e.message, 'var(--danger)');
  }
}

async function secRefresh() {
  setSecStatus('⏳ 正在刷新会话...');
  const ok = await api._tryRefreshJWT();
  if (ok) {
    const expiry = localStorage.getItem('tmd_jwt_expiry');
    const remaining = expiry ? Math.max(1, Math.round((new Date(expiry) - new Date()) / 60000)) : '?';
    setSecStatus(`✅ 会话已刷新（约 ${remaining} 分钟后过期）`, 'var(--success)');
    refreshSecStatusHeader();
  } else {
    setSecStatus('❌ 会话刷新失败，请重新登录', 'var(--danger)');
  }
}

function secClear() {
  clearStoredAuth();
  const input = document.getElementById('secApiKey');
  if (input) input.value = '';
  setSecStatus('✅ 已清除 JWT 会话', 'var(--success)');
  refreshSecStatusHeader();
}

function renderConfigEditor() {
  const { configMode, configFields, configSaving, configExists, configRaw, configFieldsLoading } = store.state;

  const modeTabs = `
    <div class="config-mode-tabs">
      <button class="mode-tab ${configMode === 'form' ? 'active' : ''}" data-action="setConfigMode" data-mode="form">📝 简易模式</button>
      <button class="mode-tab ${configMode === 'raw' ? 'active' : ''}" data-action="setConfigMode" data-mode="raw">🔧 高级 (YAML)</button>
    </div>
  `;

  if (configMode === 'raw') return `<div class="mode-tabs-wrapper">${modeTabs}${renderConfigRawEditor(configRaw, configSaving, configExists)}</div>`;
  return `<div class="mode-tabs-wrapper">${modeTabs}${renderConfigForm(configFields, configSaving, configExists, configFieldsLoading)}</div>`;
}

function renderConfigForm(fields, saving, exists, loading = false) {
  if (loading || fields === null) {
    return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">配置编辑</div><div class="card-subtitle">加载中...</div></div>
          <button class="btn btn-primary btn-sm" disabled>⏳ 加载中...</button>
        </div>
        <div class="card-body"><div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-title">加载中...</div></div></div>
      </div>
    `;
  }
  if (fields.length === 0) {
    return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">配置编辑</div><div class="card-subtitle">${exists ? '✅ 配置文件存在' : '⚠️ 将创建新配置'}</div></div>
        </div>
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-icon">⚙️</div>
            <div class="empty-title">暂无配置项</div>
            <div class="empty-desc">请使用高级 (YAML) 模式直接编辑配置文件</div>
          </div>
        </div>
      </div>
    `;
  }

  const groups = {};
  const groupLabels = { basic: '📁 基础设置', cookie: '🍪 Cookie 认证', advanced: '⚙️ 高级选项', security: '🔐 安全认证' };
  fields.forEach(f => {
    if (!groups[f.group]) groups[f.group] = [];
    groups[f.group].push(f);
  });

  const renderField = f => {
    const inputType = f.type === 'password' ? 'password' : (f.type === 'number' ? 'number' : 'text');
    const placeholder = f.type === 'password' && f.value
      ? `当前值: ${escapeAttr(f.value)}`
      : escapeAttr(f.placeholder || f.prompt);
    return `
      <div class="config-field">
        <label class="config-label">${escapeHtml(f.label)}</label>
        <input type="${inputType}" class="form-input config-input" id="cf_${escapeAttr(f.name)}"
          name="${escapeAttr(f.name)}" value="${escapeAttr(f.type === 'password' ? '' : f.value)}"
          placeholder="${placeholder}"
          ${f.type === 'number' ? `min="1" max="${f.name === 'max_download_routine' ? '100' : '245'}"` : ''}>
      </div>
    `;
  };

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">配置编辑</div>
          <div class="card-subtitle">${exists ? '✅ 配置文件存在' : '⚠️ 将创建新配置'} · 共 ${fields.length} 个可编辑项</div>
        </div>
        <button class="btn btn-primary btn-sm" data-action="saveConfigForm" ${saving ? 'disabled' : ''}>
          ${saving ? '<span class="loading-spinner"></span> 保存中...' : '💾 保存配置'}
        </button>
      </div>
      <div class="card-body">
        ${Object.entries(groups).map(([key, items]) => items.length ? `
          <div class="config-group">
            <div class="config-group-title">${groupLabels[key] || key}</div>
            ${items.map(renderField).join('')}
          </div>
        ` : '').join('')}
      </div>
    </div>
  `;
}

function renderRawEditorLoading(title, desc, loadError = false) {
  if (loadError) {
    return `
    <div class="card">
      <div class="card-header">
        <div><div class="card-title">${title}</div><div class="card-subtitle">加载失败</div></div>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" data-action="configRetryLoadRaw">🔄 重试</button>
        </div>
      </div>
      <div class="card-body">
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">加载失败</div>
          <div class="empty-desc">${desc}</div>
        </div>
      </div>
    </div>`;
  }
  return `
    <div class="card">
      <div class="card-header">
        <div><div class="card-title">${title}</div><div class="card-subtitle">加载中...</div></div>
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm" disabled>⏳ 加载中...</button>
        </div>
      </div>
      <div class="card-body">
        <div class="empty-state">
          <div class="skeleton skeleton-icon"></div>
          <div class="empty-title">加载中...</div>
          <div class="empty-desc">${desc}</div>
        </div>
      </div>
    </div>`;
}

function renderRawEditorContent(opts) {
  const { title, exists, existsNewText, action, btnText, containerId, hintText } = opts;
  return `
    <div class="card">
      <div class="card-header">
        <div><div class="card-title">${title}</div><div class="card-subtitle">${exists ? '✅ 文件存在' : '⚠️ ' + existsNewText}</div></div>
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm" data-action="${action}" ${opts.saving ? 'disabled' : ''}>
            ${opts.saving ? '<span class="loading-spinner"></span> 保存中...' : btnText}
          </button>
        </div>
      </div>
      <div class="card-body raw-editor-body">
        <div id="${containerId}" class="raw-editor-container"></div>
        <div class="config-hint text-sm text-tertiary p-3 raw-editor-hint">
          ${hintText}
        </div>
      </div>
    </div>
  `;
}

function renderConfigRawEditor(raw, saving, exists) {
  if (raw === null) return renderRawEditorLoading('conf.yaml 原始编辑器', '请检查网络连接后重试', _state._configRawLoadError);
  return renderRawEditorContent({
    title: 'conf.yaml 原始编辑器',
    exists,
    existsNewText: '将创建新配置',
    action: 'saveConfig',
    btnText: '💾 保存配置',
    containerId: 'configEditorContainer',
    hintText: '⚠️ 直接编辑 YAML 需要了解语法格式。建议使用简易模式。',
    saving,
  });
}

function renderCookiesEditor() {
  const { cookiesMode, cookieItems, cookiesSaving, cookiesExists, cookiesRaw, _cookiesLoading } = store.state;

  const modeTabs = `
    <div class="config-mode-tabs">
      <button class="mode-tab ${cookiesMode === 'form' ? 'active' : ''}" data-action="setCookiesMode" data-mode="form">📝 简易模式</button>
      <button class="mode-tab ${cookiesMode === 'raw' ? 'active' : ''}" data-action="setCookiesMode" data-mode="raw">🔧 高级 (YAML)</button>
    </div>
  `;

  if (cookiesMode === 'raw') return `<div class="mode-tabs-wrapper">${modeTabs}${renderCookiesRawEditor(cookiesRaw, cookiesSaving, cookiesExists)}</div>`;
  return `<div class="mode-tabs-wrapper">${modeTabs}${renderCookiesForm(cookieItems, cookiesSaving, cookiesExists, _cookiesLoading)}</div>`;
}

function renderCookiesForm(items, saving, exists, loading = false) {
  if (loading || items === null) {
    return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">额外账户管理</div><div class="card-subtitle">加载中...</div></div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" disabled>➕ 添加账户</button>
            <button class="btn btn-primary btn-sm" disabled>⏳ 加载中...</button>
          </div>
        </div>
        <div class="card-body">
          <div class="empty-state">
            <div class="skeleton skeleton-icon"></div>
            <div class="empty-title">加载中...</div>
            <div class="empty-desc">正在加载额外账户配置</div>
          </div>
        </div>
      </div>
    `;
  }
  if (!items || items.length === 0) {
    return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">额外账户管理</div><div class="card-subtitle">${exists ? '✅ 文件存在 · 0 个账户' : '⚠️ 将创建新文件'}</div></div>
          <button class="btn btn-ghost btn-sm" data-action="addCookieAccount">➕ 添加账户</button>
        </div>
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-icon">🍪</div>
            <div class="empty-title">暂无额外账户</div>
            <div class="empty-desc">点击「添加账户」添加额外的 Twitter 账号</div>
          </div>
        </div>
      </div>
    `;
  }

  const renderItem = (item, idx) => `
    <div class="config-group">
      <div class="config-group-title">
        <span>🏷️ 账户 #${idx + 1}</span>
        <button class="btn btn-danger btn-sm" data-action="removeCookieAccount" data-index="${idx}">删除</button>
      </div>
      <div class="config-field">
        <label class="config-label">Auth Token</label>
        <input type="password" class="form-input config-input cookie-input" id="cookie_auth_${idx}"
          name="auth_token_${idx}" value="" placeholder="${item.auth_token ? '当前值: ' + escapeAttr(item.auth_token) : '请输入 auth_token'}">
      </div>
      <div class="config-field">
        <label class="config-label">CT0</label>
        <input type="password" class="form-input config-input cookie-input" id="cookie_ct0_${idx}"
          name="ct0_${idx}" value="" placeholder="${item.ct0 ? '当前值: ' + escapeAttr(item.ct0) : '请输入 ct0'}">
      </div>
    </div>
  `;

  return `
    <div class="card">
      <div class="card-header">
        <div><div class="card-title">额外账户管理</div><div class="card-subtitle">${exists ? '✅ 文件存在' : '⚠️ 将创建新文件'} · 共 ${items.length} 个账户</div></div>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" data-action="addCookieAccount">➕ 添加账户</button>
          <button class="btn btn-primary btn-sm" data-action="saveCookiesForm" ${saving ? 'disabled' : ''}>
            ${saving ? '<span class="loading-spinner"></span> 保存中...' : '💾 保存配置'}
          </button>
        </div>
      </div>
      <div class="card-body">
        ${items.map(renderItem).join('<div class="config-divider"></div>')}
      </div>
    </div>
  `;
}

function renderCookiesRawEditor(raw, saving, exists) {
  if (raw === null) return renderRawEditorLoading('additional_cookies.yaml 原始编辑器', '正在加载额外账户配置');
  return renderRawEditorContent({
    title: 'additional_cookies.yaml 原始编辑器',
    exists,
    existsNewText: '将创建新文件',
    action: 'saveCookies',
    btnText: '💾 保存配置',
    containerId: 'cookiesEditorContainer',
    hintText: '⚠️ 直接编辑 YAML 需要了解语法格式。建议使用简易模式。',
    saving,
  });
}

function renderLogViewer() {
  const { logLevel, logStats, logDomain, logPaused, logPausedCount } = store.state;

  return `
    <div class="card card-page" id="logViewerCard">
      <div class="toolbar">
        <div class="toolbar-left">
          ${renderLogFilterButtons(logLevel, logStats)}
          ${renderLogDomainSelect(logDomain)}
          <input type="text" id="log-search-input" class="form-input search-input" placeholder="搜索日志..." value="${escapeAttr(store.state.logSearch)}">
          <button class="btn btn-ghost btn-sm" data-action="logSearch">🔍</button>
        </div>
        <div class="toolbar-right">
          <button class="btn ${logPaused ? 'btn-primary' : 'btn-ghost'} btn-sm" id="log-pause-toggle" data-action="toggleLogPause">
            ${logPaused ? '继续' : '暂停'}${logPausedCount > 0 ? ` (${logPausedCount})` : ''}
          </button>
          <button class="btn btn-ghost btn-sm" data-action="logRefresh">刷新</button>
          <button class="btn btn-ghost btn-sm" data-action="logExport">导出</button>
          <label class="form-checkbox" style="font-size:12px;white-space:nowrap">
            <input type="checkbox" id="log-auto-scroll-toggle" ${logAutoScroll ? 'checked' : ''} data-action="toggleLogAutoScroll">
            自动滚动
          </label>
        </div>
      </div>
      <div class="card-body card-body-scroll" style="padding:0;position:relative">
        <div class="log-stream" id="log-stream">
          ${renderLogEmptyHint('暂无日志', '选择日志级别或等待实时日志')}
        </div>
        <button class="log-scroll-to-top-btn" id="log-new-arrived-btn"
          style="display:none" data-action="logScrollToBottom">
          📌 新日志已到达
        </button>
      </div>
    </div>
  `;
}

function renderLogEmptyHint(title, desc) {
  return `
    <div class="empty-state" id="log-empty-hint">
      <div class="empty-icon">📋</div>
      <div class="empty-title">${escapeHtml(title)}</div>
      <div class="empty-desc">${escapeHtml(desc)}</div>
    </div>
  `;
}

// 提取下载标题行末尾的推文 ID，兼容 logrus 前缀和裸 [download] 行。
function getTweetId(text) {
  if (!text.includes('[download]')) return null;
  const m = text.match(/\s_(\d{16,20})\b/);
  return m ? m[1] : null;
}

function renderLogLines(logs) {
  if (!logs || logs.length === 0) return '';
  return logs.map(renderLogEntry).join('');
}

function renderLogEntry(line) {
  const clean = stripAnsi(line);
  const tweetId = getTweetId(clean);
  const domain = getLogDomain(clean);
  const html = highlightLogLine(clean);
  const tweetIdAttr = tweetId ? ` data-tweet-id="${escapeAttr(tweetId)}"` : '';
  const domainAttr = domain ? ` data-log-domain="${escapeAttr(domain)}"` : '';
  const tweetButton = tweetId ? `<button class="log-entry-action" data-action="copyLogTweetId" data-tweet-id="${escapeAttr(tweetId)}" title="复制推文 ID">ID</button>` : '';
  return `<div class="${getLogEntryClass(clean)}"${tweetIdAttr}${domainAttr} data-log-line="${escapeAttr(clean)}">
    <span class="log-entry-text">${html}</span>
    <span class="log-entry-actions">
      ${tweetButton}
      <button class="log-entry-action" data-action="copyLogLine" title="复制整行日志">复制</button>
    </span>
  </div>`;
}

function renderLogFilterButtons(level, stats) {
  return '<div class="log-level-filters">' +
    ['all','debug','info','warn','error'].map(l => {
      const count = l === 'all' ? (stats ? stats.total : 0) : (stats ? (stats[l] || 0) : 0);
      return '<button class="btn btn-sm ' + (level === l ? 'btn-primary' : 'btn-ghost') + '" data-action="logSetLevel" data-level="' + l + '">' + l.toUpperCase() + (count > 0 ? ' (' + count + ')' : '') + '</button>';
    }).join('') +
    '</div>';
}

function renderLogDomainSelect(domain) {
  const known = new Set(LOG_DOMAIN_OPTIONS.map(([value]) => value));
  const options = LOG_DOMAIN_OPTIONS.slice();
  if (domain && !known.has(domain)) options.push([domain, domain]);
  return `<select id="log-domain-select" class="form-input log-domain-select" data-log-domain-filter="true">
    ${options.map(([value, label]) => `<option value="${escapeAttr(value)}" ${domain === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
  </select>`;
}

let logAutoScroll = true;
let logSSESource = null;
let _logReconnectAttempts = 0;
let _logIntentionalDisconnect = false;
let _logSSETimer = null;

function toggleLogAutoScroll() {
  logAutoScroll = document.getElementById('log-auto-scroll-toggle')?.checked ?? true;
  if (logAutoScroll) {
    const stream = document.getElementById('log-stream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  }
}

async function exportLogs() {
  // 用 fetch + Authorization 头 + blob 下载，避免 JWT 进入 URL（浏览器历史/扩展可见）
  const doExport = async () => {
    const res = await fetch('/api/v1/logs/export', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('tmd_jwt_token') || '') }
    });
    if (!res.ok) {
      if (res.status === 401) {
        const authErr = makeUnauthorizedError(res.headers.get('X-Token-Type') || '');
        // 接入统一 JWT 刷新链：刷新成功则重试一次导出，与其余 API 调用行为一致
        const refreshed = await api._tryRefreshJWT();
        if (refreshed) {
          const retry = await fetch('/api/v1/logs/export', {
            headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('tmd_jwt_token') || '') }
          });
          if (retry.ok) return retry;
        }
        requireAuthentication(authErr);
        throw authErr;
      }
      throw new Error('导出失败 (HTTP ' + res.status + ')');
    }
    return res;
  };
  try {
    const res = await doExport();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tmd2.log';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (err.name === 'UnauthorizedError' || err._isUnauthorized) return; // 已弹认证框
    toast.show(err.message, 'error');
  }
}

async function setLogLevel(level) {
  store.setState({ logLevel: level, logPage: 1, logPausedCount: 0 });
  await refreshLogs();
  // 重连 SSE 以应用新的 level 过滤
  disconnectLogSSE();
  connectLogSSE();
}

async function setLogDomain(domain) {
  store.setState({ logDomain: domain || 'all', logPage: 1, logPausedCount: 0 });
  await refreshLogs();
  disconnectLogSSE();
  connectLogSSE();
}

async function doLogSearch() {
  const q = document.getElementById('log-search-input')?.value?.trim() || '';
  store.setState({ logSearch: q, logPage: 1, logPausedCount: 0 });
  await refreshLogs();
  // 重连 SSE 以应用搜索过滤
  disconnectLogSSE();
  connectLogSSE();
}

async function toggleLogPause() {
  const nextPaused = !store.state.logPaused;
  store.setState({ logPaused: nextPaused, logPausedCount: nextPaused ? store.state.logPausedCount : 0 });
  updateLogPauseButton();
  if (!nextPaused) {
    await refreshLogs();
  }
}

function updateLogPauseButton() {
  const btn = document.getElementById('log-pause-toggle');
  if (!btn) return;
  const { logPaused, logPausedCount } = store.state;
  btn.textContent = (logPaused ? '继续' : '暂停') + (logPausedCount > 0 ? ` (${logPausedCount})` : '');
  btn.className = 'btn ' + (logPaused ? 'btn-primary' : 'btn-ghost') + ' btn-sm';
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

let _logLoadingMore = false;

async function refreshLogs() {
  _logGen++;
  store.setState({ logPage: 1 });
  _prependedCount = 0; // 重置前置页计数
  await loadLogsReplace();
  // 实时流断开（自动重连耗尽/未连接）时通过刷新按钮复活
  if (!logSSESource) connectLogSSE();
}

// 构建日志查询参数（loadLogsReplace / loadMoreLogs / connectLogSSE 共用）：
// page 可选（SSE 流不需要分页），level/domain 非 all 才追加，q 非空才追加
function buildLogQuery({ page = null, pageSize = 200, level = 'all', domain = 'all', q = '' } = {}) {
  const p = new URLSearchParams();
  if (page != null) p.append('page', String(page));
  p.append('pageSize', String(pageSize));
  if (level !== 'all') p.append('level', level);
  if (domain !== 'all') p.append('domain', domain);
  if (q) p.append('q', q);
  return p;
}

async function loadLogsReplace() {
  const stream = document.getElementById('log-stream');
  if (!stream) return;
  const { logLevel, logSearch, logPage, logDomain } = store.state;
  try {
    const { logLevel, logSearch, logPage, logDomain } = store.state;
    const p = buildLogQuery({ page: logPage, level: logLevel, domain: logDomain, q: logSearch });
    const d = await api.getLogs('?' + p.toString());
    const lines = (d.logs || []).reverse();
    stream.innerHTML = lines.length ? renderLogLines(lines) : renderLogEmptyHint('没有匹配日志', '调整级别或搜索条件后重试');
    stream.scrollTop = stream.scrollHeight;
    store.setState({ logTotalPages: d.totalPages || 1 });
    loadLogStats();
  } catch (e) {
    if (e.name === 'AbortError') return; // 导航中止在途请求，不残留错误文案
    stream.innerHTML = '<div class="log-entry" style="color:var(--danger)">加载日志失败: ' + escapeHtml(e.message) + '</div>';
  }
}

async function loadMoreLogs() {
  if (_logLoadingMore) return;
  const { logPage, logTotalPages } = store.state;
  if (logPage >= logTotalPages) return; // 没有更多了
  _logLoadingMore = true;
  const gen = _logGen; // 捕获发起时的代际
  const stream = document.getElementById('log-stream');
  if (!stream) { _logLoadingMore = false; return; }
  const nextPage = logPage + 1;
  store.setState({ logPage: nextPage });
  const { logLevel, logSearch, logDomain } = store.state;
  try {
    const p = buildLogQuery({ page: nextPage, level: logLevel, domain: logDomain, q: logSearch });
    const d = await api.getLogs('?' + p.toString());
    // 代际过期：期间发生了刷新/筛选变化，丢弃本次响应（防止旧筛选条件下的老页混入）
    if (gen !== _logGen) {
      store.setState({ logPage: logPage });
      return;
    }
    const lines = (d.logs || []).reverse();
    const oldHeight = stream.scrollHeight;
    stream.innerHTML = renderLogLines(lines) + stream.innerHTML;
    // 记录前置页行数：SSE trim 时保留，防止刚加载的旧页被立即削掉
    _prependedCount += lines.length;
    // 保持视觉位置不变
    stream.scrollTop = (stream.scrollHeight - oldHeight) + stream.scrollTop;
    store.setState({ logTotalPages: d.totalPages || 1 });
  } catch (e) {
    // 代际过期：期间发生了刷新/筛选变化，丢弃本次响应（防止把新查询的 logPage 覆盖回旧值）
    if (gen !== _logGen) return;
    // 加载失败，回退页码
    store.setState({ logPage: logPage });
  } finally {
    _logLoadingMore = false;
    // 暂停/翻页路径同样受 5000 行上限约束，防止 DOM 无界增长
    trimLogStream();
  }
}

async function loadLogStats() {
  try {
    const s = await api.getLogStats();
    store.setState({ logStats: { debug: s.debug || 0, info: s.info || 0, warn: s.warn || 0, error: s.error || 0, total: s.total || 0 } });
    // 精细化更新按钮文本和 active 状态，避免 outerHTML 整体替换
    const lvl = store.state.logLevel;
    document.querySelectorAll('.log-level-filters [data-action="logSetLevel"]').forEach(btn => {
      const level = btn.dataset.level;
      const count = level === 'all' ? (s.total || 0) : (s[level] || 0);
      btn.textContent = level.toUpperCase() + (count > 0 ? ' (' + count + ')' : '');
      btn.className = 'btn btn-sm ' + (lvl === level ? 'btn-primary' : 'btn-ghost');
    });
  } catch(e) {
    console.warn('loadLogStats 失败:', e);
    if (!_state._logStatsWarned) {
      _state._logStatsWarned = true;
      toast.show('日志统计加载失败，级别计数可能不准确', 'warning');
    }
  }
}

async function loadConfigFields() {
  if (store.state.configFieldsLoading) return;
  store.setState({ configFieldsLoading: true });
  try {
    const d = await api.getConfigFields();
    store.setState({ configFields: d.fields || [], configExists: d.exists || false, configFieldsLoading: false });
  } catch (e) {
    toast.show('加载配置失败: ' + e.message, 'error');
    store.setState({ configFieldsLoading: false });
  }
}

async function loadConfigRaw() {
  if (_state._configRawLoading) return;
  _state._configRawLoading = true;
  _state._configRawLoadError = false;
  try {
    const d = await api.getConfigRaw();
    store.setState({ configRaw: d.content || '', configExists: d.exists || false });
  } catch (e) {
    _state._configRawLoadError = true;
    toast.show('加载配置失败: ' + e.message, 'error');
  }
  _state._configRawLoading = false;
}

function isPanelInputFocused(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel || !document.activeElement || !panel.contains(document.activeElement)) return false;
  return document.activeElement.matches('input, textarea, select');
}

function isConfigFormDirty() {
  if (store.state.configMode !== 'form') return false;
  return (store.state.configFields || []).some(field => {
    const input = document.getElementById(`cf_${field.name}`);
    if (!input) return false;
    if (field.type === 'password') return input.value.trim() !== '';
    return input.value !== String(field.value ?? '');
  });
}

function isConfigRawDirty() {
  return store.state.configMode === 'raw' && _state.configEditor && getEditorValue(_state.configEditor, store.state.configRaw) !== (store.state.configRaw || '');
}

function refreshConfigAfterReconnect() {
  if (isPanelInputFocused('systemConfigPanel') || isConfigFormDirty() || isConfigRawDirty()) return;
  if (store.state.configMode === 'raw') loadConfigRaw();
  else loadConfigFields();
}

function showManualRestartNotice(subject) {
  toast.show(`${subject}已保存，需要手动重启服务后生效`, 'success');
}

function isScheduleRawDirty() {
  return store.state._scheduleTab === 'raw' && _state.scheduleEditor && getEditorValue(_state.scheduleEditor, store.state._scheduleRaw) !== (store.state._scheduleRaw || '');
}

function refreshSchedulesAfterReconnect() {
  if (isPanelInputFocused('systemSchedulesPanel') || store.state._scheduleFormDirty || isScheduleRawDirty()) return;
  if (store.state._scheduleTab === 'raw') loadScheduleRaw();
  else loadSchedules({ updateFormItems: true });
}

function renderScheduleViewer() {
  const { _scheduleTab, _schedules, _scheduleRaw, _scheduleExists, _scheduleSaving, _scheduleFormItems, _schedulerRunning, _schedulesLoading } = store.state;

  const schedulerBanner = !_schedulerRunning
    ? `<div class="alert alert-warning" style="margin-bottom:var(--space-3)">⚠️ 调度器未启动，定时任务不会自动执行。请添加并启用规则后重载配置。</div>`
    : '';

  const modeTabs = `
    <div class="config-mode-tabs">
      <button class="mode-tab ${_scheduleTab === 'form' ? 'active' : ''}" data-action="setScheduleTab" data-tab="form">📝 简易模式</button>
      <button class="mode-tab ${_scheduleTab === 'raw' ? 'active' : ''}" data-action="setScheduleTab" data-tab="raw">🔧 高级 (YAML)</button>
    </div>
  `;

  if (_scheduleTab === 'raw') return `<div class="mode-tabs-wrapper">${schedulerBanner}${modeTabs}${renderScheduleRawEditor(_scheduleRaw, _scheduleSaving, _scheduleExists)}</div>`;
  return `<div class="mode-tabs-wrapper">${schedulerBanner}${modeTabs}${renderScheduleForm(_scheduleFormItems, _scheduleSaving, _scheduleExists, _schedulesLoading)}</div>`;
}

function renderScheduleFormField(item, idx) {
  const typeOptions = (selected) => ['list', 'user', 'following', 'mixed'].map(t =>
    `<option value="${t}" ${t === selected ? 'selected' : ''}>${t === 'list' ? '📋 列表' : t === 'user' ? '👤 用户' : t === 'following' ? '👥 关注' : '🔀 混合'}</option>`
  ).join('');

  const scheduleModeOptions = (selected) => ['interval', 'daily'].map(m =>
    `<option value="${m}" ${m === selected ? 'selected' : ''}>${m === 'interval' ? '⏱️ 间隔执行' : '🕐 每日定时'}</option>`
  ).join('');

  return `
    <div class="config-group">
      <div class="config-group-title">
        <span>📋 任务 #${idx + 1}${item.name ? ' · ' + escapeHtml(item.name) : ''}</span>
        <button class="btn btn-danger btn-sm" data-action="removeScheduleItem" data-index="${idx}">删除</button>
      </div>
      <div class="config-field">
        <label class="config-label" for="sf_type_${idx}">类型</label>
        <select class="form-input config-input" id="sf_type_${idx}" data-binding="sf_type" data-idx="${idx}">
          ${typeOptions(item.type)}
        </select>
      </div>
      ${item.type === 'mixed' ? `
      <div class="config-field">
        <label class="config-label" for="sf_users_${idx}">用户名 <span class="form-hint-inline">每行一个</span></label>
        <textarea class="form-textarea config-input" id="sf_users_${idx}" rows="3"
          aria-describedby="sf_schedule_hint_${idx}"
          placeholder="elonmusk&#10;openai" data-binding="sf_field" data-idx="${idx}">${escapeHtml((item.users || []).join('\n'))}</textarea>
      </div>
      <div class="config-field">
        <label class="config-label" for="sf_lists_${idx}">列表 ID <span class="form-hint-inline">每行一个</span></label>
        <textarea class="form-textarea config-input" id="sf_lists_${idx}" rows="3"
          aria-describedby="sf_schedule_hint_${idx}"
          placeholder="123456789&#10;987654321" data-binding="sf_field" data-idx="${idx}">${escapeHtml((item.lists || []).join('\n'))}</textarea>
      </div>
      <div class="config-field">
        <label class="config-label" for="sf_following_${idx}">关注用户名 <span class="form-hint-inline">每行一个</span></label>
        <textarea class="form-textarea config-input" id="sf_following_${idx}" rows="3"
          aria-describedby="sf_schedule_hint_${idx}"
          placeholder="someuser" data-binding="sf_field" data-idx="${idx}">${escapeHtml((item.following_names || []).join('\n'))}</textarea>
      </div>` : `
      <div class="config-field">
        <label class="config-label" for="sf_target_${idx}">${item.type === 'list' ? '列表 ID' : '用户名 (Screen Name)'}</label>
        <input type="text" class="form-input config-input" id="sf_target_${idx}"
          value="${escapeAttr(item.target || '')}"
          aria-describedby="sf_schedule_hint_${idx}"
          placeholder="${item.type === 'list' ? '例如: 123456789' : '例如: elonmusk'}"
          data-binding="sf_field" data-idx="${idx}">
      </div>`}
      <div class="config-field">
        <label class="config-label">名称（可选）</label>
        <input type="text" class="form-input config-input" id="sf_name_${idx}"
          value="${escapeAttr(item.name || '')}"
          placeholder="给这条规则起个名字">
      </div>
      <div class="config-field">
        <label class="config-label">调度方式</label>
        <select class="form-input config-input" id="sf_schedule_mode_${idx}" data-binding="sf_type" data-idx="${idx}">
          ${scheduleModeOptions(item.scheduleMode || 'interval')}
        </select>
      </div>
      <div class="config-field">
        <label class="config-label" for="sf_schedule_value_${idx}">${(item.scheduleMode || 'interval') === 'interval' ? '执行间隔' : '执行时间'}</label>
        <input type="text" class="form-input config-input" id="sf_schedule_value_${idx}"
          value="${escapeAttr(item.scheduleValue || '')}"
          aria-describedby="sf_schedule_hint_${idx}"
          placeholder="${(item.scheduleMode || 'interval') === 'interval' ? '例如: 2h, 30m, 6h30m, 24h' : '例如: 07:00,21:00 或 02:30'}"
          data-binding="sf_field" data-idx="${idx}">
      </div>
      <div class="config-field" style="display:flex;gap:16px;flex-wrap:wrap;">
        <label class="config-label checkbox-inline">
          <input type="checkbox" id="sf_enabled_${idx}" ${item.enabled ? 'checked' : ''}>
          启用
        </label>
        <label class="config-label checkbox-inline">
          <input type="checkbox" id="sf_auto_follow_${idx}" ${item.auto_follow ? 'checked' : ''}>
          自动申请受保护账号
        </label>
        <label class="config-label checkbox-inline">
          <input type="checkbox" id="sf_follow_members_${idx}" ${item.follow_members ? 'checked' : ''}>
          下载时关注目标/成员
        </label>
        <label class="config-label checkbox-inline">
          <input type="checkbox" id="sf_skip_profile_${idx}" ${item.skip_profile ? 'checked' : ''}>
          跳过 Profile
        </label>
        <label class="config-label checkbox-inline">
          <input type="checkbox" id="sf_no_retry_${idx}" ${item.no_retry ? 'checked' : ''}>
          不重试
        </label>
        <label class="config-label checkbox-inline">
          <input type="checkbox" id="sf_run_on_start_${idx}" ${item.run_on_start ? 'checked' : ''}>
          首次启动时立即运行
        </label>
      </div>
      <div id="sf_schedule_hint_${idx}" class="config-hint form-hint-validate" aria-live="polite"></div>
    </div>
  `;
}

function renderScheduleForm(items, saving, exists, loading = false) {
  // 撤销横幅显示栈顶最近删除项
  const undoStack = store.state._scheduleUndoStack || [];
  const undo = undoStack[undoStack.length - 1];
  const undoBanner = undo ? `
    <div class="schedule-undo-banner">
      <span>已删除规则 #${undo.index + 1}${undo.item?.name ? ` · ${escapeHtml(undo.item.name)}` : ''}</span>
      <button class="btn btn-ghost btn-sm" data-action="undoRemoveScheduleItem">撤销</button>
    </div>` : '';
  if (loading) {
    return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">定时下载任务</div><div class="card-subtitle">加载中...</div></div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" disabled>➕ 添加规则</button>
            <button class="btn btn-primary btn-sm" disabled>⏳ 加载中...</button>
          </div>
        </div>
        <div class="card-body">
          <div class="empty-state">
            <div class="skeleton skeleton-icon"></div>
            <div class="empty-title">加载中...</div>
            <div class="empty-desc">正在加载定时任务配置</div>
          </div>
        </div>
      </div>
    `;
  }
  if (!items || items.length === 0) {
    return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">定时下载任务</div><div class="card-subtitle">${exists ? '✅ 文件存在 · 0 条规则' : '⚠️ 配置文件不存在'}</div></div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" data-action="addScheduleItem">➕ 添加规则</button>
          </div>
        </div>
        ${undoBanner}
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-icon">⏰</div>
            <div class="empty-title">暂无定时任务</div>
            <div class="empty-desc">点击「添加规则」创建定时下载任务</div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header">
        <div><div class="card-title">定时下载任务</div><div class="card-subtitle">${exists ? '✅ 文件存在' : '⚠️ 将创建新文件'} · 共 ${items.length} 条规则</div></div>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" data-action="addScheduleItem">➕ 添加规则</button>
          <button class="btn btn-primary btn-sm" data-action="saveScheduleForm" ${saving ? 'disabled' : ''}>
            ${saving ? '<span class="loading-spinner"></span> 保存中...' : '💾 保存并重载'}
          </button>
        </div>
      </div>
      ${undoBanner}
      <div class="card-body">
        ${items.map((item, idx) => renderScheduleFormField(item, idx)).join('<div class="config-divider"></div>')}
      </div>
    </div>
  `;
}

// Shared helpers for schedule table rendering
function typeTag(type) {
  const map = { list: ['List', 'tag-info'], user: ['User', 'tag-success'], following: ['Following', 'tag-warning'], mixed: ['Mixed', 'tag-primary'] };
  const [label, cls] = map[type] || [String(type || 'Unknown'), ''];
  return `<span class="tag ${escapeAttr(cls)}">${escapeHtml(label)}</span>`;
}

function failureTag(count) {
  if (!count || count === 0) return '';
  if (count >= 3) return `<span class="tag tag-danger">⚠ ${count}次失败</span>`;
  return `<span class="tag tag-warning">${count}次失败</span>`;
}

function getLastTask(s) {
  const taskId = s ? s.last_task_id : null;
  if (!taskId) return null;
  return (store.state.tasks || []).find(t => t.task_id === taskId);
}

function taskStatusTag(task) {
  if (!task) return '';
  const statusMap = {
    completed: { tag: 'tag-completed', text: '完成' },
    failed: { tag: 'tag-failed', text: '失败' },
    running: { tag: 'tag-running', text: '运行中' },
    queued: { tag: 'tag-queued', text: '排队' },
    cancelled: { tag: 'tag-cancelled', text: '已取消' }
  };
  const st = statusMap[task.status];
  if (!st) return '';
  return `<span class="tag ${st.tag} tag-sm">${st.text}</span>`;
}

function fmtTime(t) {
  return t ? formatDate(t) : '-';
}

function renderScheduleItem(s) {
  const entry = normalizeScheduleEntry(s.entry);
  const failures = s.consecutive_failures || 0;
  let displayName = entry.name || entry.target;
  if (entry.type === 'mixed' && !displayName) {
    const parts = [];
    if ((entry.users || []).length) parts.push(`${entry.users.length} 用户`);
    if ((entry.lists || []).length) parts.push(`${entry.lists.length} 列表`);
    if ((entry.following_names || []).length) parts.push(`${entry.following_names.length} 关注`);
    displayName = parts.join(' · ') || '混合任务';
  } else if (!displayName) {
    displayName = entry.type === 'following'
      ? '关注任务'
      : entry.type === 'user'
        ? '用户任务'
        : entry.type === 'list'
          ? '列表任务'
          : '定时任务';
  }
  const metaParts = [escapeHtml(s.schedule_display), `执行 ${s.run_count} 次`];
  if (entry.type === 'mixed') {
    const targetParts = [];
    if ((entry.users || []).length) targetParts.push(`${entry.users.length}用户`);
    if ((entry.lists || []).length) targetParts.push(`${entry.lists.length}列表`);
    if ((entry.following_names || []).length) targetParts.push(`${entry.following_names.length}关注`);
    if (targetParts.length) metaParts.unshift(targetParts.join('+'));
  }
  const fTag = failureTag(failures);
  if (fTag) metaParts.push(fTag);

  const lastTask = getLastTask(s);
  const tTag = taskStatusTag(lastTask);
  if (tTag) metaParts.push(tTag);

  const entryId = escapeAttr(entry.id);

  return `
    <div class="schedule-item${failures >= 3 ? ' has-failure' : ''}">
      <div class="schedule-type">${typeTag(entry.type)}</div>
      <div class="schedule-info">
        <div class="schedule-title">${escapeHtml(displayName)}</div>
        <div class="schedule-meta">${metaParts.join('<span class="schedule-meta-sep">·</span>')}</div>
      </div>
      <div class="schedule-status">
        <span class="tag ${entry.enabled ? 'tag-success' : 'tag-danger'}" style="cursor:pointer" data-schedule-id="${escapeAttr(entry.id)}" data-enabled="${entry.enabled}" data-action="toggleScheduleEnabled">${entry.enabled ? '启用' : '禁用'}</span>
	      </div>
	      <div class="schedule-time">
	        <div>上次 ${fmtTime(s.last_run_at)}</div>
	        <div>下次 ${fmtTime(s.next_run_at)}</div>
	      </div>
	      <div class="schedule-actions">
	        <button class="btn btn-primary btn-sm" data-schedule-id="${escapeAttr(entry.id)}" data-action="triggerSchedule" ${!entry.enabled ? 'disabled title="规则已禁用"' : ''}>▶ 执行</button>
      </div>
    </div>
  `;
}

function renderScheduleTable(schedules, exists) {
  schedules = schedules || [];
  const active = schedules.filter(s => normalizeScheduleEntry(s.entry).enabled).length;
  const total = schedules.length;
  const failures = schedules.filter(s => (s.consecutive_failures || 0) > 0).length;

  if (schedules.length === 0) {
    return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">定时下载任务</div><div class="card-subtitle">${exists ? '✅ 文件存在 · 0 条规则' : '⚠️ 配置文件不存在'}</div></div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" data-action="reloadSchedules">🔄 重载配置</button>
            <button class="btn btn-primary btn-sm" data-action="navigateToSystemSchedules">📝 编辑任务</button>
          </div>
        </div>
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-icon">⏰</div>
            <div class="empty-title">暂无定时任务</div>
            <div class="empty-desc">点击「编辑任务」创建定时下载任务</div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card card-fill">
      <div class="card-header">
        <div><div class="card-title">定时下载任务</div><div class="card-subtitle">共 ${total} 条规则 · ${active} 个启用${failures > 0 ? ` · ${failures} 个异常` : ''}</div></div>
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm" id="btnTriggerAll" data-action="triggerAllSchedules">⬇️ 下载全部</button>
          <button class="btn btn-ghost btn-sm" data-action="reloadSchedules">🔄 重载配置</button>
          <button class="btn btn-ghost btn-sm" data-action="navigateToSystemSchedules">📝 编辑任务</button>
        </div>
      </div>
      <div class="card-body card-body-scroll">
        ${schedules.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">⏰</div>
            <div class="empty-title">暂无定时任务</div>
            <div class="empty-desc">点击上方「编辑任务」按钮创建定时下载规则</div>
          </div>
        ` : `
          <div class="schedule-list">
            ${schedules.map(renderScheduleItem).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

function renderScheduleRawEditor(raw, saving, exists) {
  if (raw === null) return renderRawEditorLoading('schedules.yaml 原始编辑器', '正在加载定时任务配置');
  return renderRawEditorContent({
    title: 'schedules.yaml 原始编辑器',
    exists,
    existsNewText: '将创建新文件',
    action: 'saveScheduleRaw',
    btnText: '💾 保存并重载',
    containerId: 'scheduleEditorContainer',
    hintText: '⚠️ 保存后将自动重载调度配置，无需重启服务。',
    saving,
  });
}

function isScheduleFormEditing() {
  if (store.state.currentPage !== 'system' || store.state._systemTab !== 'schedules' || store.state._scheduleTab !== 'form') {
    return false;
  }
  const panel = document.getElementById('systemSchedulesPanel');
  if (!panel || !document.activeElement || !panel.contains(document.activeElement)) {
    return false;
  }
  return document.activeElement.matches('input, textarea, select');
}

async function loadSchedules(options = {}) {
  if (store.state._schedulesLoading) return;
  store.setState({ _schedulesLoading: true });
  try {
    const data = await api.getSchedules();
    const entries = data.entries || [];
    const update = {
      _schedules: entries,
      _schedulesLoading: false,
      _schedulerRunning: !!data.scheduler_running,
    };
    if (options.updateFormItems !== false) {
      update._scheduleFormItems = entries.map(s => scheduleStatusToFormItem(s));
      update._scheduleFormDirty = false;
      update._scheduleUndoDelete = null;
      update._scheduleUndoStack = [];
      // 表单初始化时的服务器基线 id 集合：diff 保存时只删除用户明确删过的条目，
      // 外部客户端新增的条目不会被误删
      _state._scheduleBaselineIds = entries.map(s => normalizeScheduleEntry(s.entry || s).id).filter(Boolean);
    }
    store.setState(update);
  } catch (e) {
    store.setState({ _schedulesLoading: false });
    console.warn('loadSchedules failed:', e);
    toast.show('加载定时任务失败: ' + e.message, 'error');
  }
}

function scheduleStatusToFormItem(status) {
  const e = normalizeScheduleEntry(status.entry);
  const raw = e.schedule || '';
  let scheduleMode = 'interval';
  let scheduleValue = '';
  if (raw.startsWith('daily:')) {
    scheduleMode = 'daily';
    scheduleValue = raw.replace('daily:', '');
  } else if (raw.startsWith('interval:')) {
    scheduleMode = 'interval';
    scheduleValue = raw.replace('interval:', '');
  } else if (raw) {
    // 未知格式，尝试按 interval 解析，保留原值以便用户修正
    scheduleMode = 'interval';
    scheduleValue = raw;
  }
  return {
    id: e.id || '',
    type: e.type || 'list',
    target: e.target || '',
    users: e.users || [],
    lists: e.lists || [],
    following_names: e.following_names || [],
    name: e.name || '',
    scheduleMode,
    scheduleValue,
    enabled: e.enabled !== false,
    run_on_start: !!e.run_on_start,
    auto_follow: !!e.auto_follow,
    follow_members: !!e.follow_members,
    skip_profile: !!e.skip_profile,
    no_retry: !!e.no_retry,
  };
}

function normalizeScheduleEntry(entry) {
  entry = entry || {};
  return {
    id: entry.id || '',
    type: entry.type || '',
    target: entry.target || '',
    users: entry.users || [],
    lists: entry.lists || [],
    following_names: entry.following_names || [],
    name: entry.name || '',
    schedule: entry.schedule || '',
    enabled: entry.enabled !== false,
    run_on_start: !!entry.run_on_start,
    auto_follow: !!entry.auto_follow,
    follow_members: !!entry.follow_members,
    skip_profile: !!entry.skip_profile,
    no_retry: !!entry.no_retry,
  };
}

async function loadScheduleRaw() {
  if (_state._scheduleRawLoading) return;
  _state._scheduleRawLoading = true;
  try {
    const data = await api.getSchedulesRaw();
    store.setState({ _scheduleRaw: data.content || '', _scheduleExists: data.exists || false });
  } catch (e) {
    console.warn('loadScheduleRaw failed:', e);
    toast.show('加载调度原始配置失败: ' + e.message, 'error');
  }
  _state._scheduleRawLoading = false;
}

async function saveScheduleRaw() {
  const content = getEditorValue(_state.scheduleEditor, store.state._scheduleRaw);
  store.setState({ _scheduleRaw: content, _scheduleSaving: true });
  try {
    const validateResult = await api.validateSchedule({ raw: content });
    if (!validateResult.valid) {
      const msg = (validateResult.errors || []).join('; ');
      toast.show('校验失败: ' + msg, 'error');
      store.setState({ _scheduleSaving: false });
      return;
    }
    await api.updateSchedulesRaw(content);
    toast.show('调度配置已保存并重载');
    // form 无未保存编辑时同步重载表单数据，避免切回简易模式显示旧快照后再保存覆盖刚改的 raw 配置
    await loadSchedules({ updateFormItems: !store.state._scheduleFormDirty });
    const rawData = await api.getSchedulesRaw();
    store.setState({
      _scheduleRaw: rawData.content || '',
      _scheduleExists: rawData.exists || false,
      _scheduleSaving: false,
      _scheduleUndoDelete: null,
      _scheduleUndoStack: [],
    });
    setEditorValue(_state.scheduleEditor, store.state._scheduleRaw || '');
  } catch (e) {
    toast.show('保存失败: ' + e.message, 'error');
    store.setState({ _scheduleSaving: false });
  }
}

async function triggerSchedule(id, button = null) {
  await runTaskButtonAction(button, `schedule:trigger:${id}`, async () => {
    try {
      const data = await api.triggerSchedule(id);
      toast.show('已触发定时任务: ' + data.task_id);
    } catch (e) {
      toast.show('触发失败: ' + e.message, 'error');
    }
  });
}

// 重载调度配置：外部手工修改 schedules.yaml 后热加载，不经过表单保存
async function reloadSchedulesConfig(button = null) {
  const btn = button || document.querySelector('[data-action="reloadSchedules"]');
  if (btn) { btn.disabled = true; btn.textContent = '重载中...'; }
  try {
    await api.reloadSchedules();
    toast.show('调度配置已重新加载');
    await loadSchedules();
  } catch (e) {
    toast.show('重载失败: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 重载配置'; }
  }
}

async function triggerAllSchedules() {
  const btn = document.getElementById('btnTriggerAll');
  if (!btn) return;
  const schedules = (store.state._schedules || []).filter(s => normalizeScheduleEntry(s.entry).enabled);
  if (schedules.length === 0) {
    toast.show('没有已启用的调度任务', 'error');
    return;
  }
  if (!confirm(`确定要触发全部 ${schedules.length} 个已启用的调度任务吗？`)) return;

  await runTaskButtonAction(btn, 'schedule:trigger-all', async () => {
    try {
      const data = await api.triggerAllSchedules();
      if (data.failed > 0) {
        const errMsgs = (data.results || []).filter(r => r.error).map(r => `${r.entry_id}: ${r.error}`).join('; ');
        toast.show(`${data.succeeded} 成功, ${data.failed} 失败: ${errMsgs}`, 'error');
      } else {
        toast.show(`已全部触发成功 (${data.succeeded})`);
      }
    } catch (e) {
      toast.show('触发失败: ' + e.message, 'error');
    }
  });
}

async function toggleScheduleEnabled(id, currentEnabled, button = null) {
  await runTaskButtonAction(button, `schedule:toggle:${id}`, async () => {
    try {
      await api.setScheduleEnabled(id, !currentEnabled);
      toast.show(currentEnabled ? '已禁用定时任务' : '已启用定时任务');
    } catch (e) {
      toast.show('操作失败: ' + e.message, 'error');
    }
  });
}

// ============================================
// DualModeEditor 实例（config/cookies/schedules 三处统一抽象）
// 注意：configEditor 是工厂实例，_state.configEditor 是 editor DOM 引用，两者不冲突
// 依赖 hoist：initConfigEditor/initCookiesEditor/initScheduleEditor/loadXxxRaw/renderXxxEditor
// 都是 function 声明会 hoist 到作用域顶部，因此工厂实例可在这些函数定义之前引用
// ============================================
const configEditor = createDualModeEditor({
  panelId: 'systemConfigPanel',
  modeKey: 'configMode',
  rawKey: 'configRaw',
  editorAttr: 'configEditor',
  skipRebuildAttr: '_configPanelSkipNextRebuild',
  render: renderConfigEditor,
  initEditor: initConfigEditor,
  loadRaw: loadConfigRaw,
  dirtyCheck: () => isConfigFormDirty(),
  // config 没有 form 模式预加载（由 syncConfigTabView 负责），不传 onAfterSetState
});

const cookiesEditor = createDualModeEditor({
  panelId: 'systemCookiesPanel',
  modeKey: 'cookiesMode',
  rawKey: 'cookiesRaw',
  editorAttr: 'cookiesEditor',
  skipRebuildAttr: '_cookiesPanelSkipNextRebuild',
  render: renderCookiesEditor,
  initEditor: initCookiesEditor,
  loadRaw: loadCookiesRaw,
  dirtyCheck: () => isCookiesFormDirty(),
  // cookies 没有 form 模式预加载（由 syncCookiesTabView 负责），不传 onAfterSetState
});

const scheduleEditor = createDualModeEditor({
  panelId: 'systemSchedulesPanel',
  modeKey: '_scheduleTab',
  rawKey: '_scheduleRaw',
  editorAttr: 'scheduleEditor',
  skipRebuildAttr: '_schedulePanelSkipNextRebuild',
  render: renderScheduleViewer,
  initEditor: initScheduleEditor,
  loadRaw: loadScheduleRaw,
  dirtyCheck: () => store.state._scheduleFormDirty,
  // 保留原 setScheduleTab L3500 的行为：form 模式且数据为空时调 loadSchedules
  onAfterSetState: (mode) => {
    if (mode === 'form' && store.state._scheduleFormItems.length === 0 && (store.state._schedules || []).length === 0) {
      loadSchedules();
    }
  },
});

// 保留原函数名作为薄封装，避免改动 data-action 分发
function setConfigMode(mode) { configEditor.setMode(mode); }
function setCookiesMode(mode) { cookiesEditor.setMode(mode); }
function setScheduleTab(tab) { scheduleEditor.setMode(tab); }

function navigateToSystemSchedules() {
  if (_state.lastPage === 'system') {
    store.setState({ _systemTab: 'schedules' });
  } else {
    store.setState({ currentPage: 'system', _systemTab: 'schedules' });
    updateURL('system');
    updateNavigationUI('system');
    if (store.state.isMobile) {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('open');
    }
  }
}

// setScheduleTab 已由上面的 scheduleEditor 工厂实例 + 薄封装取代

_state._addScheduleItemPending = false;

function addScheduleItem() {
  if (_state._addScheduleItemPending) return;
  // 先保存当前 DOM 中的未保存编辑内容，再添加新条目
  const currentItems = readScheduleFormItemsFromDOM();
  const items = [{
    id: '',
    type: 'list',
    target: '',
    users: [],
    lists: [],
    following_names: [],
    name: '',
    scheduleMode: 'interval',
    scheduleValue: '8h',
    enabled: true,
    run_on_start: false,
    auto_follow: false,
    follow_members: false,
    skip_profile: false,
    no_retry: false,
  }, ...currentItems];
  store.setState({ _scheduleFormItems: items, _scheduleFormDirty: true });
  glowNewFirstItem('systemSchedulesPanel');
  _state._addScheduleItemPending = true;
  setTimeout(() => { _state._addScheduleItemPending = false; }, 0);
}

function clearAllScheduleValidationTimers() {
  Object.keys(_state._scheduleValidateTimers).forEach(k => {
    clearTimeout(_state._scheduleValidateTimers[k]);
    delete _state._scheduleValidateTimers[k];
  });
  Object.keys(_state._scheduleValidateRequests).forEach(k => {
    if (_state._scheduleValidateRequests[k]?.controller) {
      _state._scheduleValidateRequests[k].controller.abort();
    }
    delete _state._scheduleValidateRequests[k];
  });
}

function removeScheduleItem(index) {
  clearAllScheduleValidationTimers();
  const currentItems = readScheduleFormItemsFromDOM();
  const removed = currentItems[index];
  if (!removed) return;
  const items = currentItems.filter((_, i) => i !== index);
  // 撤销栈：保留最近删除的条目与其原位置，多次删除可连续撤销
  const undoStack = [...(store.state._scheduleUndoStack || [])];
  undoStack.push({ item: removed, index });
  if (undoStack.length > 5) undoStack.shift(); // 最多保留 5 步
  store.setState({
    _scheduleFormItems: items,
    _scheduleFormDirty: true,
    _scheduleUndoStack: undoStack,
    _scheduleUndoDelete: null
  });
}

function undoRemoveScheduleItem() {
  const undoStack = store.state._scheduleUndoStack || [];
  const undo = undoStack[undoStack.length - 1];
  if (!undo?.item) return;
  const items = readScheduleFormItemsFromDOM();
  const index = Math.max(0, Math.min(undo.index, items.length));
  items.splice(index, 0, undo.item);
  store.setState({
    _scheduleFormItems: items,
    _scheduleFormDirty: true,
    _scheduleUndoStack: undoStack.slice(0, -1),
    _scheduleUndoDelete: null
  });
  requestAnimationFrame(() => {
    const group = document.querySelectorAll('#systemSchedulesPanel .config-group')[index];
    if (group) group.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function readScheduleFormItemsFromDOM() {
  return store.state._scheduleFormItems.map((fallback, idx) => {
    const type = document.getElementById(`sf_type_${idx}`)?.value || fallback.type || 'list';
    const scheduleMode = document.getElementById(`sf_schedule_mode_${idx}`)?.value || fallback.scheduleMode || 'interval';
    const readLines = (id) => (document.getElementById(id)?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    return {
      id: fallback.id || '',
      type,
      target: type !== 'mixed' ? (document.getElementById(`sf_target_${idx}`)?.value || '') : '',
      name: document.getElementById(`sf_name_${idx}`)?.value || '',
      scheduleMode,
      scheduleValue: document.getElementById(`sf_schedule_value_${idx}`)?.value || '',
      enabled: document.getElementById(`sf_enabled_${idx}`)?.checked ?? fallback.enabled !== false,
      run_on_start: document.getElementById(`sf_run_on_start_${idx}`)?.checked ?? !!fallback.run_on_start,
      auto_follow: document.getElementById(`sf_auto_follow_${idx}`)?.checked ?? !!fallback.auto_follow,
      follow_members: document.getElementById(`sf_follow_members_${idx}`)?.checked ?? !!fallback.follow_members,
      skip_profile: document.getElementById(`sf_skip_profile_${idx}`)?.checked ?? !!fallback.skip_profile,
      no_retry: document.getElementById(`sf_no_retry_${idx}`)?.checked ?? !!fallback.no_retry,
      users: type === 'mixed' ? readLines(`sf_users_${idx}`) : [],
      lists: type === 'mixed' ? readLines(`sf_lists_${idx}`) : [],
      following_names: type === 'mixed' ? readLines(`sf_following_${idx}`) : [],
    };
  });
}

function clearScheduleValidationState(index) {
  clearTimeout(_state._scheduleValidateTimers[index]);
  delete _state._scheduleValidateTimers[index];
  if (_state._scheduleValidateRequests[index]?.controller) {
    _state._scheduleValidateRequests[index].controller.abort();
  }
  delete _state._scheduleValidateRequests[index];
  setScheduleValidationAriaState(index, false);
  const clearHint = () => {
    const hint = document.getElementById(`sf_schedule_hint_${index}`);
    if (hint) hint.innerHTML = '';
  };
  clearHint();
  setTimeout(clearHint, 0);
}

function setScheduleValidationAriaState(index, invalid) {
  const fieldIds = [
    `sf_target_${index}`,
    `sf_users_${index}`,
    `sf_lists_${index}`,
    `sf_following_${index}`,
    `sf_schedule_value_${index}`,
  ];
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  });
}

function updateScheduleFormItem(index, field, value) {
  const items = readScheduleFormItemsFromDOM();
  if (field === 'type') {
    clearScheduleValidationState(index);
    const prevType = items[index].type;
    items[index].type = value;
    if (value === 'mixed') {
      items[index].target = '';
    } else {
      items[index].users = [];
      items[index].lists = [];
      items[index].following_names = [];
      if (prevType === 'mixed') {
        items[index].target = '';
      }
    }
  }
  if (field === 'scheduleMode') {
    clearScheduleValidationState(index);
    items[index].scheduleMode = value;
    items[index].scheduleValue = '';
    const scheduleValue = document.getElementById(`sf_schedule_value_${index}`);
    if (scheduleValue) {
      scheduleValue.value = '';
      const label = scheduleValue.closest('.config-field')?.querySelector('.config-label');
      if (label) label.textContent = value === 'interval' ? '执行间隔' : '执行时间';
      scheduleValue.placeholder = value === 'interval' ? '例如: 2h, 30m, 6h30m, 24h' : '例如: 07:00,21:00 或 02:30';
    }
  }
  store.setState({ _scheduleFormItems: items, _scheduleFormDirty: true });
}

_state._scheduleValidateTimers = {};
_state._scheduleValidateRequests = {};
_state._scheduleValidateRequestSeq = 0;

function scheduleFieldChanged(idx) {
  clearTimeout(_state._scheduleValidateTimers[idx]);
  _state._scheduleValidateTimers[idx] = setTimeout(() => validateScheduleField(idx), 600);
}

async function validateScheduleField(idx) {
  const hint = document.getElementById(`sf_schedule_hint_${idx}`);
  if (!hint) return;

  const type = document.getElementById(`sf_type_${idx}`)?.value || 'list';
  const mode = document.getElementById(`sf_schedule_mode_${idx}`)?.value || 'interval';
  const scheduleValue = document.getElementById(`sf_schedule_value_${idx}`)?.value?.trim() || '';
  if (!scheduleValue) {
    hint.innerHTML = '';
    setScheduleValidationAriaState(idx, false);
    // schedule 为空时仍继续验证 target 等其他字段
  }

  const entry = { type, schedule: scheduleValue ? `${mode}:${scheduleValue}` : '' };

  if (type === 'mixed') {
    const usersRaw = document.getElementById(`sf_users_${idx}`)?.value || '';
    const listsRaw = document.getElementById(`sf_lists_${idx}`)?.value || '';
    const followingRaw = document.getElementById(`sf_following_${idx}`)?.value || '';
    entry.users = usersRaw.split('\n').map(s => s.trim()).filter(Boolean);
    entry.lists = listsRaw.split('\n').map(s => s.trim()).filter(Boolean);
    entry.following_names = followingRaw.split('\n').map(s => s.trim()).filter(Boolean);
  } else {
    entry.target = document.getElementById(`sf_target_${idx}`)?.value?.trim() || '';
  }

  // schedule 为空时也发送请求，让后端验证 target 等其他字段
  const requestSeq = ++_state._scheduleValidateRequestSeq;
  if (_state._scheduleValidateRequests[idx]?.controller) {
    _state._scheduleValidateRequests[idx].controller.abort();
  }
  const controller = new AbortController();
  _state._scheduleValidateRequests[idx] = { seq: requestSeq, controller };
  try {
    const result = await api.validateSchedule({ entries: [entry] }, { signal: controller.signal });
    if (_state._scheduleValidateRequests[idx]?.seq !== requestSeq) return;
    if (result.valid) {
      hint.innerHTML = '';
      setScheduleValidationAriaState(idx, false);
    } else {
      const msg = (result.errors || []).join('; ');
      hint.innerHTML = `<span style="color:var(--danger, #f85149)">✗ ${escapeHtml(msg)}</span>`;
      setScheduleValidationAriaState(idx, true);
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (_state._scheduleValidateRequests[idx]?.seq !== requestSeq) return;
    hint.innerHTML = '';
    setScheduleValidationAriaState(idx, false);
  } finally {
    if (_state._scheduleValidateRequests[idx]?.seq === requestSeq) {
      delete _state._scheduleValidateRequests[idx];
    }
  }
}

async function validateScheduleForm() {
  const items = readScheduleFormItemsFromDOM();
  const entries = items.map(item => ({
    type: item.type,
    target: item.type === 'mixed' ? '' : item.target.trim(),
    schedule: `${item.scheduleMode}:${item.scheduleValue.trim()}`,
    ...(item.type === 'mixed' ? {
      users: item.users || [],
      lists: item.lists || [],
      following_names: item.following_names || [],
    } : {}),
  }));
  try {
    const result = await api.validateSchedule({ entries });
    if (!result.valid) {
      const errors = result.errors || [];
      showScheduleValidationErrors(errors);
      return false;
    }
  } catch (e) {
    toast.show('校验请求失败: ' + e.message, 'error');
    return false;
  }
  return true;
}

function getScheduleErrorIndex(message) {
  const m = String(message || '').match(/schedule #(\d+)/i);
  if (!m) return -1;
  return Math.max(0, Number(m[1]) - 1);
}

function focusScheduleRule(index, message) {
  if (index < 0) return;
  const hint = document.getElementById(`sf_schedule_hint_${index}`);
  if (hint && message) {
    hint.innerHTML = `<span style="color:var(--danger, #f85149)">✗ ${escapeHtml(message)}</span>`;
  }
  setScheduleValidationAriaState(index, true);
  const group = hint?.closest('.config-group') || document.querySelectorAll('#systemSchedulesPanel .config-group')[index];
  if (group) group.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const firstInput = group?.querySelector('input, textarea, select');
  if (firstInput) firstInput.focus({ preventScroll: true });
}

function showScheduleValidationErrors(errors) {
  const msg = (errors || []).join('; ') || '调度配置校验失败';
  const index = getScheduleErrorIndex(msg);
  if (index >= 0) {
    focusScheduleRule(index, msg);
  }
  toast.show(msg, 'error');
}

function failScheduleRule(index, message) {
  focusScheduleRule(index, message);
  toast.show(message, 'error');
  return false;
}

// form item → 服务器 entry 的单一转换（saveScheduleForm 兜底全量、diff 保存共用），
// enabled 统一 !== false 语义，文本字段带空保护
function scheduleFormItemToEntry(item) {
  return {
    type: item.type,
    target: item.type === 'mixed' ? '' : (item.target || '').trim(),
    users: item.type === 'mixed' ? (item.users || []) : [],
    lists: item.type === 'mixed' ? (item.lists || []) : [],
    following_names: item.type === 'mixed' ? (item.following_names || []) : [],
    name: (item.name || '').trim(),
    schedule: `${item.scheduleMode}:${item.scheduleValue.trim()}`,
    enabled: item.enabled !== false,
    run_on_start: !!item.run_on_start,
    auto_follow: !!item.auto_follow,
    follow_members: !!item.follow_members,
    skip_profile: !!item.skip_profile,
    no_retry: !!item.no_retry,
  };
}

// 规范化调度条目用于 diff 保存：固定字段顺序的 JSON 字符串（id 不参与比较），
// 返回 { entry, key } —— entry 可直接作为 POST/PUT body
function normalizeSchedForDiff(item) {
  const entry = scheduleFormItemToEntry(item);
  return { entry, key: JSON.stringify(entry) };
}

async function saveScheduleForm() {
  if (store.state._scheduleSaving) return; // 防重入：双击/重复点击不并发提交
  const items = readScheduleFormItemsFromDOM();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type !== 'mixed' && !item.target.trim()) {
      return failScheduleRule(i, `规则 #${i + 1}: 目标不能为空`);
    }
    if (item.type === 'mixed' && !item.users.length && !item.lists.length && !item.following_names.length) {
      return failScheduleRule(i, `规则 #${i + 1}: 混合任务至少需要一个目标`);
    }
    if (!item.scheduleValue.trim()) {
      return failScheduleRule(i, `规则 #${i + 1}: 调度值不能为空`);
    }
  }

  if (!(await validateScheduleForm())) return;

  const schedules = items.map(item => ({ id: item.id || '', ...scheduleFormItemToEntry(item) }));

  store.setState({ _scheduleFormItems: items, _scheduleSaving: true });
  try {
    // 逐条 CRUD：与服务器基线 diff，新增 POST / 修改 PUT / 删除 DELETE。
    // 只在基线从未加载（null/undefined）时回退全量替换 PUT /schedules，避免静默覆盖外部修改。
    // 注意：空数组也是有效基线（服务器确认 0 条规则 → 新增走 POST）
    const baselineItems = (store.state._schedules || []).map(s => scheduleStatusToFormItem(s));
    const baselineIds = _state._scheduleBaselineIds || baselineItems.map(i => i.id).filter(Boolean);
    const hasBaseline = Array.isArray(store.state._schedules);

    if (hasBaseline) {
      const baselineById = new Map(baselineItems.map(i => [i.id, i]));
      const creates = [];
      const updates = [];
      const deletes = [];

      for (const item of items) {
        const norm = normalizeSchedForDiff(item);
        if (item.id && baselineById.has(item.id)) {
          if (normalizeSchedForDiff(baselineById.get(item.id)).key !== norm.key) updates.push({ id: item.id, entry: norm.entry });
        } else {
          creates.push(norm.entry);
        }
      }
      for (const id of baselineIds) {
        if (!items.some(i => i.id === id)) deletes.push(id);
      }

      if (!creates.length && !updates.length && !deletes.length) {
        // 无任何变化：与保存成功路径一致地清理 dirty/undo 状态，
        // 否则 _scheduleFormDirty 保持 true 会让 SSE 调度同步与重连刷新永久跳过表单更新
        store.setState({
          _scheduleSaving: false,
          _scheduleFormDirty: false,
          _scheduleUndoDelete: null,
          _scheduleUndoStack: [],
        });
        // raw 快照同步 fire-and-forget：无变化时失败不打扰用户（不是保存失败）
        api.getSchedulesRaw().then(rawData => {
          store.setState({
            _scheduleRaw: rawData.content || '',
            _scheduleExists: rawData.exists || false,
          });
        }).catch(() => {});
        toast.show('调度配置无变化');
        return;
      }

      // 顺序：新增 → 修改 → 删除（互不依赖，任一失败即停止并保留已应用部分）
      for (const c of creates) await api.createSchedule(c);
      for (const u of updates) await api.updateSchedule(u.id, u.entry);
      for (const id of deletes) await api.deleteSchedule(id);

      const saved = await api.getSchedules();
      const entries = saved.entries || [];
      _state._scheduleBaselineIds = entries.map(e => normalizeScheduleEntry(e.entry || e).id).filter(Boolean);
      store.setState({
        _scheduleFormItems: entries.map(entry => scheduleStatusToFormItem(entry)),
        _scheduleFormDirty: false,
        _scheduleUndoDelete: null,
        _scheduleUndoStack: [],
      });
      await loadSchedules({ updateFormItems: false });
      toast.show(`调度配置已保存并重载（新增 ${creates.length} / 修改 ${updates.length} / 删除 ${deletes.length}）`);
      const rawData = await api.getSchedulesRaw();
      store.setState({
        _scheduleRaw: rawData.content || '',
        _scheduleExists: rawData.exists || false,
        _scheduleSaving: false,
        _scheduleUndoDelete: null,
      });
      return;
    }

    // 兜底：无基线时全量替换（与旧行为一致）
    const saved = await api.replaceSchedules(schedules);
    if (saved?.entries) {
      store.setState({
        _scheduleFormItems: saved.entries.map(entry => scheduleStatusToFormItem({ entry })),
        _scheduleFormDirty: false,
        _scheduleUndoDelete: null,
      });
    }
    await loadSchedules({ updateFormItems: false });
    toast.show('调度配置已保存并重载');
    const rawData = await api.getSchedulesRaw();
    store.setState({
      _scheduleRaw: rawData.content || '',
      _scheduleExists: rawData.exists || false,
      _scheduleSaving: false,
      _scheduleUndoDelete: null,
    });
  } catch (e) {
    toast.show('保存失败: ' + e.message, 'error');
    store.setState({ _scheduleSaving: false });
  }
}

_state.scheduleEditor = null;

function initScheduleEditor() {
  if (_state.scheduleEditor) return;
  const container = document.getElementById('scheduleEditorContainer');
  if (container) {
    _state.scheduleEditor = initRawEditor('scheduleEditorContainer', store.state._scheduleRaw, 'yaml');
  }
}

function syncScheduleTabView() {
  if (store.state._schedules === null && !store.state.sseConnected) loadSchedules();
  // 提前加载原始数据，切换高级模式时无需等待异步请求
  if (store.state._scheduleRaw === null) loadScheduleRaw();
  if (store.state._scheduleTab === 'raw' && !_state.scheduleEditor) requestAnimationFrame(() => requestAnimationFrame(initScheduleEditor));
}

function renderServerClosedState() {
  const el = document.getElementById('contentContainer');
  if (!el) return;
  el.innerHTML = `
    <div class="empty-state" style="padding: 80px 20px;">
      <div style="font-size: 48px; margin-bottom: 20px;">👋</div>
      <div class="empty-title">服务器已关闭</div>
      <div class="empty-desc">如需重新启动，请运行 tmd -server</div>
    </div>
  `;
}

async function saveConfigForm() {
  if (store.state.configSaving) return;
  const inputs = document.querySelectorAll('.config-input:not(.cookie-input)[name]');
  const fields = {};
  for (const el of inputs) {
    if (el.type === 'password' && el.value.includes('•••')) {
      // 用户粘贴了后端掩码占位文本（如 abc•••xyz）：留空可保留原值，避免被当真实值提交
      toast.show(`${el.name}: 检测到掩码占位文本，请留空以保留原值`, 'error');
      return;
    }
    if (el.type === 'password' && el.value.trim() === '') {
      // api_key 是唯一可安全清空的可选密码字段（清空 = 关闭认证）
      fields[el.name] = el.name === 'api_key' ? '__CLEAR__' : '__KEEP_OLD__';
      continue;
    }
    if (el.type === 'number') {
      const val = parseInt(el.value, 10);
      const min = el.min !== '' ? parseInt(el.min, 10) : 1;
      const max = el.max !== '' ? parseInt(el.max, 10) : (el.name.includes('routine') ? 100 : 245);
      if (isNaN(val) || val < min || val > max) {
        toast.show(`${el.name} 必须在 ${min}-${max} 之间`, 'error');
        return;
      }
    }
    fields[el.name] = el.value;
  }

  store.setState({ configSaving: true });
  try {
    const data = await api.saveConfigFields(fields);
    store.setState({
      configSaving: false,
      configFields: data.fields || store.state.configFields,
      configRaw: data.yaml_preview || store.state.configRaw
    });
    showManualRestartNotice('配置');
    // 若 api_key 字段有实际值且发生变更，清除过期 JWT
    if (fields['api_key'] && fields['api_key'] !== '__KEEP_OLD__') {
      // API Key 变更 → 旧的 JWT 已失效 → 清除
      clearStoredAuth();
    }
    // API 已返回 data.fields（含脱敏值）和 data.yaml_preview，无需额外请求重载
  } catch (e) {
    toast.show('❌ 保存失败: ' + e.message, 'error');
    store.setState({ configSaving: false });
  }
}

async function saveConfig() {
  if (store.state.configSaving) return;
  const content = getEditorValue(_state.configEditor, store.state.configRaw);
  if (!content.trim()) return toast.show('配置不能为空', 'error');
  const getApiKey = yaml => { const m = (yaml || '').match(/^api_key:\s*(\S+)/m); return m ? m[1] : null; };
  const oldKey = getApiKey(store.state.configRaw);
  const newKey = getApiKey(content);
  store.setState({ configRaw: content, configSaving: true });
  try {
    const data = await api.updateConfigRaw(content);
    store.setState({
      configSaving: false,
      configRaw: data.yaml_preview || content
    });
    // raw 保存成功后同步 form 数据：form 无未保存编辑时重拉 fields，避免切回简易模式时旧快照覆盖新值
    if (!isConfigFormDirty()) {
      loadConfigFields();
    }
    showManualRestartNotice('配置');
    // 比较新旧 api_key 值，仅在实际变更时清除 JWT（避免每次 raw 保存都重新登录）
    if (newKey !== oldKey) {
      clearStoredAuth();
    }
  } catch (e) {
    toast.show('❌ 保存失败: ' + e.message, 'error');
    store.setState({ configSaving: false });
  }
}

async function loadCookiesItems() {
  if (store.state._cookiesLoading) return;
  store.setState({ _cookiesLoading: true });
  try {
    const d = await api.getCookies();
    store.setState({ cookieItems: d.items || [], cookiesExists: d.exists || false, _cookiesLoading: false });
  } catch (e) {
    store.setState({ _cookiesLoading: false });
    toast.show('加载额外账户失败: ' + e.message, 'error');
  }
}

async function loadCookiesRaw() {
  if (_state._cookiesRawLoading) return;
  _state._cookiesRawLoading = true;
  try {
    const d = await api.getCookiesRaw();
    store.setState({ cookiesRaw: d.content || '', cookiesExists: d.exists || false });
  } catch (e) { toast.show('加载额外账户失败: ' + e.message, 'error'); }
  _state._cookiesRawLoading = false;
}

function isCookiesFormDirty() {
  if (store.state.cookiesMode !== 'form') return false;
  const inputs = document.querySelectorAll('#systemCookiesPanel input.cookie-input');
  return Array.from(inputs).some(input => input.value.trim() !== '');
}

function isCookiesRawDirty() {
  return store.state.cookiesMode === 'raw' && _state.cookiesEditor && getEditorValue(_state.cookiesEditor, store.state.cookiesRaw) !== (store.state.cookiesRaw || '');
}

function refreshCookiesAfterReconnect() {
  if (isPanelInputFocused('systemCookiesPanel') || isCookiesFormDirty() || isCookiesRawDirty()) return;
  if (store.state.cookiesMode === 'raw') loadCookiesRaw();
  else loadCookiesItems();
}

async function saveCookiesForm() {
  const cookies = [];
  const items = store.state.cookieItems || [];

  for (let i = 0; i < items.length; i++) {
    const authInput = document.getElementById(`cookie_auth_${i}`);
    const ct0Input = document.getElementById(`cookie_ct0_${i}`);
    const authVal = authInput ? authInput.value.trim() : '';
    const ct0Val = ct0Input ? ct0Input.value.trim() : '';
    const originalIndex = Number.isInteger(items[i].index) ? items[i].index : null;
    const isNewAccount = originalIndex === null;

    if (isNewAccount && !authVal && !ct0Val) {
      toast.show(`账户 #${i + 1} 的 Auth Token 和 CT0 不能同时为空`, 'error');
      return;
    }

    cookies.push({
      index: originalIndex,
      auth_token: (isNewAccount || authVal) ? authVal : '__KEEP_OLD__',
      ct0: (isNewAccount || ct0Val) ? ct0Val : '__KEEP_OLD__',
    });
  }

  store.setState({ cookiesSaving: true });
  try {
    await api.saveCookies(cookies);
    store.setState({ cookiesSaving: false });
    showManualRestartNotice('额外账户');
    // 保存后重载数据，刷新脱敏显示
    loadCookiesItems();
    loadCookiesRaw();
  } catch (e) {
    toast.show('❌ 保存失败: ' + e.message, 'error');
    store.setState({ cookiesSaving: false });
  }
}

async function saveCookies() {
  const content = getEditorValue(_state.cookiesEditor, store.state.cookiesRaw);
  if (!content.trim()) return toast.show('内容不能为空', 'error');

  store.setState({ cookiesRaw: content, cookiesSaving: true });
  try {
    await api.updateCookiesRaw(content);
    store.setState({ cookiesSaving: false, cookiesRaw: content });
    showManualRestartNotice('额外账户');
    loadCookiesItems(); // 同步刷新表单模式数据
  } catch (e) {
    toast.show('❌ 保存失败: ' + e.message, 'error');
    store.setState({ cookiesSaving: false });
  }
}

// setCookiesMode 已由上面的 cookiesEditor 工厂实例 + 薄封装取代

function addCookieAccount() {
  const items = [{ index: null, auth_token: '', ct0: '' }, ...(store.state.cookieItems || [])];
  store.setState({ cookieItems: items });
  glowNewFirstItem('systemCookiesPanel');
}

function removeCookieAccount(index) {
  const items = (store.state.cookieItems || []).filter((_, i) => i !== index);
  store.setState({ cookieItems: items });
}

async function shutdownServer() {
  if (!confirm('确定要关闭服务器吗？\n\n关闭后需要手动重新启动 TMD 服务。')) {
    return;
  }

  toast.show('正在关闭服务器...', 'warning');
  cleanupSystemTimers();

  try {
    await api.shutdownServer();
  } catch (err) {
    // HTTP 请求异常时服务端可能也已关闭，继续走同一套清理
  }
  handleServerShutdown('服务器已关闭');
}

function handleServerShutdown(message) {
  cleanupSystemTimers();
  stopJWTRefreshLoop();
  api.abortAll();
  sseManager.disconnect();
  destroyAllEditors();
  renderServerClosedState();
}

// setConfigMode 已由上面的 configEditor 工厂实例 + 薄封装取代

function initRawEditor(containerId, content, _mode) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  container.innerHTML = '';
  const textarea = document.createElement('textarea');
  textarea.className = 'form-textarea raw-editor-textarea';
  textarea.spellcheck = false;
  textarea.value = content;
  container.appendChild(textarea);
  return textarea;
}

function getEditorValue(editor, fallback = '') {
  if (!editor) return fallback || '';
  if (typeof editor.getValue === 'function') return editor.getValue();
  return editor.value || fallback || '';
}

function setEditorValue(editor, value) {
  if (!editor) return;
  if (typeof editor.setValue === 'function') {
    editor.setValue(value);
  } else {
    editor.value = value;
  }
}

function initConfigEditor() {
  if (_state.configEditor) return;
  const container = document.getElementById('configEditorContainer');
  if (container) {
    _state.configEditor = initRawEditor('configEditorContainer', store.state.configRaw, 'yaml');
  }
}

function initCookiesEditor() {
  if (_state.cookiesEditor) return;
  const container = document.getElementById('cookiesEditorContainer');
  if (container) {
    _state.cookiesEditor = initRawEditor('cookiesEditorContainer', store.state.cookiesRaw, 'yaml');
  }
}

function cleanupSystemTimers() {
  _state._logsPageLoaded = false;
  clearAllScheduleValidationTimers();
  disconnectLogSSE();
}

function stopJWTRefreshLoop() {
  if (!_jwtRefreshInterval) return;
  clearInterval(_jwtRefreshInterval);
  _jwtRefreshInterval = null;
}

function destroyAllEditors() {
  configEditor.destroyEditor();
  cookiesEditor.destroyEditor();
  scheduleEditor.destroyEditor();
}

function connectLogSSE() {
  if (logSSESource) { logSSESource.close(); logSSESource = null; }
  if (_logSSETimer) { clearTimeout(_logSSETimer); _logSSETimer = null; }
  _logIntentionalDisconnect = false;
  const { logLevel, logSearch, logDomain } = store.state;
  const params = buildLogQuery({ level: logLevel, domain: logDomain, q: logSearch }); // SSE 流不分页
  appendJWTToken(params);
  const qs = params.toString();
  const url = '/api/v1/logs/stream' + (qs ? '?' + qs : '');
  logSSESource = new EventSource(url);

  // 连接成功即重置计数：日志流安静（无新日志事件）时计数器也要归零，
  // 否则跨多次独立断连累计 60 次后即使重连成功也会被误判为永久断开
  logSSESource.onopen = () => {
    _logReconnectAttempts = 0;
  };

  logSSESource.addEventListener('log', (e) => {
    _logReconnectAttempts = 0; // 成功收到事件 → 连接正常，重置计数器
    const stream = document.getElementById('log-stream');
    if (!stream) return;
    const clean = stripAnsi(e.data);
    if (store.state.logPaused) {
      store.setState({ logPausedCount: (store.state.logPausedCount || 0) + 1 });
      updateLogPauseButton();
      return;
    }
    // 批量追加：同帧内的多条日志合并为一次 DOM 插入，避免逐行 insertAdjacentHTML + scrollTop 强制布局
    _logBatch.push(clean);
    if (_logFlushRAF) return;
    _logFlushRAF = requestAnimationFrame(() => {
      _logFlushRAF = null;
      const stream = document.getElementById('log-stream');
      if (!stream || _logBatch.length === 0) { _logBatch = []; return; }
      const lines = _logBatch;
      _logBatch = [];
      const frag = document.createDocumentFragment();
      for (const line of lines) {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderLogEntry(line);
        while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      }
      stream.appendChild(frag);
      // 移除 loading 占位
      const hint = document.getElementById('log-empty-hint');
      if (hint) hint.style.display = 'none';
      if (logAutoScroll) {
        // Auto-scroll is checked → scroll to bottom（延迟到下一帧，合并强制布局）
        requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; });
      } else {
        // 仅在用户不在底部时显示按钮
        const userAtBottom = stream.scrollTop + stream.clientHeight >= stream.scrollHeight - 10;
        if (!userAtBottom) {
          const btn = document.getElementById('log-new-arrived-btn');
          if (btn) btn.style.display = 'flex';
        }
      }
      // Keep last N lines
      trimLogStream();
    });
  });

  logSSESource.onerror = () => {
    // 清理当前连接引用
    if (logSSESource) { logSSESource.close(); logSSESource = null; }
    // 主动断开时不触发重连
    if (_logIntentionalDisconnect) { _logIntentionalDisconnect = false; return; }
    _logReconnectAttempts++;
    if (_logReconnectAttempts > 60) {
      _logReconnectAttempts = 0;
      // 放弃自动重连：提示用户手动点「刷新」复活实时流（refreshLogs 会重建连接）
      toast.show('日志实时流已断开，点击「刷新」可重新连接', 'warning');
      return;
    }
    const delay = Math.min(2000 * Math.pow(1.5, _logReconnectAttempts - 1), 30000);
    // 无条件尝试刷新 JWT（无 2 分钟窗口限制），并保证无论刷新结果都继续重连
    api._tryRefreshJWT().finally(() => { _logSSETimer = setTimeout(connectLogSSE, delay); });
  };
}

function trimLogStream() {
  const stream = document.getElementById('log-stream');
  if (!stream) return;
  // 保留 loadMore 前置的旧页：上限放宽 _prependedCount 行，防刚加载内容被立即削掉
  while (stream.children.length > LOG_STREAM_MAX_LINES + _prependedCount) stream.removeChild(stream.firstChild);
}

function disconnectLogSSE() {
  _logIntentionalDisconnect = true;
  if (logSSESource) { logSSESource.close(); logSSESource = null; }
  if (_logSSETimer) { clearTimeout(_logSSETimer); _logSSETimer = null; }
  _logReconnectAttempts = 0;
}

function copyTextToClipboard(text, successMessage) {
  navigator.clipboard.writeText(text).then(() => {
    toast.show(successMessage, 'success');
  }).catch(() => {
    toast.show('复制失败，请手动选择文本复制', 'warning');
  });
}

function copyLogLine(button) {
  const entry = button.closest('.log-entry[data-log-line]');
  if (!entry) return;
  copyTextToClipboard(entry.dataset.logLine || '', '已复制日志行');
}

function copyLogTweetId(button) {
  const id = button.dataset.tweetId || button.closest('.log-entry[data-tweet-id]')?.dataset.tweetId;
  if (!id) return;
  copyTextToClipboard(id, '已复制推文 ID: ' + id);
}

function syncConfigTabView() {
  if (store.state.configMode === 'form' && store.state.configFields === null) {
    loadConfigFields();
  }
  // 提前加载原始数据，切换高级模式时无需等待异步请求
  if (store.state.configRaw === null) loadConfigRaw();
  if (store.state.configMode === 'raw' && !_state.configEditor) {
    requestAnimationFrame(() => requestAnimationFrame(initConfigEditor));
  }
}

function syncCookiesTabView() {
  if (store.state.cookiesMode === 'form' && store.state.cookieItems === null) {
    loadCookiesItems();
  }
  // 提前加载原始数据，切换高级模式时无需等待异步请求
  if (store.state.cookiesRaw === null) loadCookiesRaw();
  if (store.state.cookiesMode === 'raw' && !_state.cookiesEditor) {
    requestAnimationFrame(() => requestAnimationFrame(initCookiesEditor));
  }
}

function syncLogsPageView() {
  // 先断开旧 SSE，避免事件在 refreshLogs 的 innerHTML 重置前插入被清掉（丢行窗口）
  if (logSSESource) disconnectLogSSE();
  if (!_state._logsPageLoaded) {
    _state._logsPageLoaded = true;
    refreshLogs();
  }
  loadLogStats();
  connectLogSSE();
  const stream = document.getElementById('log-stream');
  if (stream && !stream._scrollHandlerAttached) {
    stream._scrollHandlerAttached = true;
    // Auto-uncheck only when user scrolls UP from bottom (scrolling down never unchecks)
    let _lastScrollTop = 0;
    stream.addEventListener('scroll', () => {
      const atBottom = stream.scrollTop + stream.clientHeight >= stream.scrollHeight - 10;
      const scrolledUp = stream.scrollTop < _lastScrollTop;
      _lastScrollTop = stream.scrollTop;
      if (stream.scrollTop <= 0) {
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
  }
}

function syncSystemTabView() {
  if (store.state.currentPage !== 'system') return;

  if (store.state._systemTab === 'config') syncConfigTabView();
  if (store.state._systemTab === 'cookies') syncCookiesTabView();
  if (store.state._systemTab === 'schedules') syncScheduleTabView();
}

function rerenderSystemPanel(panelId, renderFn, resetEditor = null, initEditor = null, saveFn = null, restoreFn = null) {
  const saved = saveFn ? saveFn() : null;
  const panel = document.getElementById(panelId);
  const savedScrollTop = panel ? panel.scrollTop : 0;
  if (resetEditor) resetEditor();
  if (panel) panel.innerHTML = renderFn();
  if (panel) panel.scrollTop = savedScrollTop;
  if (initEditor) requestAnimationFrame(() => requestAnimationFrame(() => {
    initEditor();
    // 仅在旧编辑器有实际内容时恢复，避免空内容覆盖新加载的数据
    if (restoreFn && saved !== null && saved !== '') restoreFn(saved);
  }));
}

function setSystemTab(tab) {
  // 切换 tab 时清除所有 Skip 标志，防止残留阻挡后续重建
  configEditor.resetSkipFlag();
  cookiesEditor.resetSkipFlag();
  scheduleEditor.resetSkipFlag();
  store.setState({ _systemTab: tab });
  setTimeout(syncSystemTabView, 0);
}

// ============================================
// Navigation & Routing
// ============================================

// Shared route mappings (single source of truth)
const ROUTE_TO_PAGE = { '/': 'overview', '/tasks': 'tasks', '/data': 'data', '/schedules': 'schedules', '/system': 'system', '/logs': 'logs' };
const PAGE_TO_ROUTE = { overview: '/', tasks: '/tasks', data: '/data', schedules: '/schedules', system: '/system', logs: '/logs' };
const HASH_TO_SUB = { 'users': 'users', 'lists': 'lists', 'entities': 'entities', 'list-entities': 'listEntities', 'user-links': 'userLinks', 'previous-names': 'previousNames' };
const SUB_TO_HASH = { 'users': '', 'lists': '#lists', 'entities': '#entities', 'listEntities': '#list-entities', 'userLinks': '#user-links', 'previousNames': '#previous-names' };
const PAGE_TITLES = { overview: '概览', tasks: '任务中心', data: '数据管理', schedules: '定时任务', system: '应用配置', logs: '系统日志' };

function updateNavigationUI(page) {
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
    const active = el.dataset.page === page;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || '概览';
}

// Parse URL to determine current page
function parseRoute() {
  const path = window.location.pathname;
  const hash = window.location.hash.slice(1); // Remove #
  
  const page = ROUTE_TO_PAGE[path] || 'overview';
  const dataSubPage = HASH_TO_SUB[hash] || 'users';
  
  return { page, dataSubPage };
}

// Update URL based on current page
function updateURL(page, dataSubPage = null) {
  const path = PAGE_TO_ROUTE[page] || '/';
  const hash = (page === 'data' && dataSubPage) ? SUB_TO_HASH[dataSubPage] : '';
  
  // Use history API to update URL without reloading
  const newUrl = path + hash;
  if (window.location.pathname + window.location.hash !== newUrl) {
    window.history.pushState({ page, dataSubPage }, '', newUrl);
  }
}

function navigateTo(page) {
  drawer.close();
  api.abortAll();
  if ((_state.lastPage === 'system' || _state.lastPage === 'logs') && page !== _state.lastPage) {
    cleanupSystemTimers();
    destroyAllEditors();
  }
  // 导航进入数据页时刷新当前子页数据（避免显示 bootstrap 时的旧快照）
  if (page === 'data') refreshDBData();
  store.setState({ currentPage: page });
  
  // Update URL
  updateURL(page, store.state.dataSubPage);
  
  // Update sidebar, mobile nav, and title
  updateNavigationUI(page);
  
  // Close sidebar on mobile
  if (store.state.isMobile) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  }
  
  // Note: render() is called by subscribe callback when page changes
}

// Handle browser back/forward buttons
window.onpopstate = (event) => {
  const { page, dataSubPage } = parseRoute();
  if ((_state.lastPage === 'system' || _state.lastPage === 'logs') && page !== _state.lastPage) {
    cleanupSystemTimers();
    destroyAllEditors();
  }
  
  if (page === 'data' && dataSubPage !== store.state.dataSubPage) {
    store.setState({ 
      currentPage: page,
      dataSubPage: dataSubPage 
    });
  } else {
    store.setState({ currentPage: page });
  }
  
  // 后退/前进进入数据页时刷新当前子页数据
  if (page === 'data') refreshDBData();
  
  // Update sidebar, mobile nav, and title
  updateNavigationUI(page);
};

function setDataSubPage(subPage) {
  store.setState({
    dataSubPage: subPage,
    dbPagination: {
      ...store.state.dbPagination,
      [subPage]: { page: 1, pageSize: 200, totalPages: 1 }
    },
    dbSearch: {
      ...store.state.dbSearch,
      [subPage]: ''
    },
    _prevNameUserIdFilter: subPage === 'previousNames' ? store.state._prevNameUserIdFilter : ''
  });
  
  // Update URL when changing data sub-page
  updateURL('data', subPage);
  
  // Note: render() is called by subscribe callback for data page
  refreshDBData();
}

function render() {
  const container = document.getElementById('contentContainer');
  const page = store.state.currentPage;

  if (pages[page]) {
    // 任务页重建前保存表单输入（切页/重建不丢已输入内容）
    if (page === 'tasks' && container.querySelector('#taskFormContainer')) {
      saveTaskFormState();
    }

    container.innerHTML = pages[page]();

    if (page === 'system') {
      // Defer to avoid re-entering store subscription via loadConfigFields() -> setState
      setTimeout(() => syncSystemTabView(), 0);
    } else if (page === 'logs') {
      syncLogsPageView();
    } else if (page === 'tasks') {
      restoreTaskFormState(_state._taskFormTab || 'user');
    }
    
    // Restore filter and search values
      restoreSearchValue('taskFilter', 'taskFilter');
      restoreSearchValue('taskStageFilter', 'taskStageFilter');
      restoreSearchValue('taskSearch', 'taskSearch');

    // Restore search value for data page
    if (page === 'data') {
      restoreSearchValue('dbSearchInput', 'dbSearch', store.state.dataSubPage);
    }

    if (page === 'schedules') {
      if (store.state._schedules === null) loadSchedules();
    }

    if (page === 'tasks') {
      loadErrors();
    }

    if (page === 'overview') {
      loadQueueStatus();
    }

    if (page === 'data') {
      loadDBStats();
    }

    // 全量重建后同步各变化检测器快照：render() 绕过 detect 时快照过期，
    // 不同步会让下一次真实变化被误判为"无变化"（如 dbLoading 恢复后表格不渲染）
    dataDetector.sync(store.state);
    scheduleDetector.sync(store.state);
    overviewDetector.sync(store.state);
    systemDetector.sync(store.state);
  }
}

// Filter tasks based on status and search
function filterTasks() {
  // Reuse updateTaskListUI to render filtered tasks
  updateTaskListUI(store.state.tasks);
}

// ============================================
// Global Error Boundary
// ============================================

window.onerror = function (msg, url, line, col, error) {
  console.error('[Global] 未捕获的异常:', msg, 'at', url + ':' + line + ':' + col, error);
  return true;
};

window.addEventListener('unhandledrejection', function (e) {
  console.error('[Global] 未处理的 Promise 拒绝:', e.reason);
  if (isUnauthorizedError(e.reason)) {
    requireAuthentication(e.reason);
  }
  e.preventDefault();
});

// ============================================
// Initialization
// ============================================

function refreshJWTIfNeeded() {
  const jwt = localStorage.getItem('tmd_jwt_token');
  if (!jwt) return;
  // 仅在 JWT 剩余不足 30 分钟时才刷新，避免无谓的网络请求
  const expiry = localStorage.getItem('tmd_jwt_expiry');
  if (expiry) {
    const remaining = new Date(expiry) - new Date();
    if (remaining > 30 * 60 * 1000) return;
  }
  api._tryRefreshJWT();
}

function startJWTRefreshLoop() {
  if (_jwtRefreshInterval) return;
  // 定时刷新：每 45 分钟尝试刷新一次 JWT
  // 首次刷新由第一个 API 请求的 401 处理逻辑自动触发，无需提前检查
  _jwtRefreshInterval = setInterval(refreshJWTIfNeeded, 45 * 60 * 1000);
}

async function init() {
  if (_initPromise) return _initPromise;
  _initPromise = bootstrapApp();
  return _initPromise;
}

async function bootstrapApp() {
  const { page, dataSubPage } = parseRoute();
  _state.lastPage = page;
  updateNavigationUI(page);

  startJWTRefreshLoop();
  sseManager.connect();

  try {
    const data = await loadOverviewData();
    // 代际过期（SSE 已推送）时保留 store 已有值，不覆盖新快照
    const { health = store.state.health, tasks = store.state.tasks } = data || {};

    store.setState({
      currentPage: page,
      dataSubPage: dataSubPage,
      health,
      tasks,
    });

    _initComplete = true;

    await refreshDBData();

  } catch (err) {
    _initComplete = true;
    store.setState({
      currentPage: page,
      dataSubPage: dataSubPage
    });

    // 401 → 显示认证对话框
    if (isUnauthorizedError(err)) {
      requireAuthentication(err);
    } else {
      toast.show('加载数据失败: ' + err.message, 'error');
    }
  }

  render();
}

// ============================================
// Auth Dialog
// ============================================
function showAuthDialog(message = '') {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  const status = document.getElementById('authDialogStatus');
  if (status && message) {
    status.textContent = message;
    status.style.color = 'var(--warning)';
  }
  if (overlay.classList.contains('open')) return; // 已在显示中，防重复触发
  overlay._lastFocused = document.activeElement; // 记录触发元素，关闭时还原焦点
  requestAnimationFrame(() => overlay.classList.add('open'));
  const input = document.getElementById('authDialogKey');
  if (input) {
    setTimeout(() => input.focus(), 100);
  }
}

function hideAuthDialog() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  const status = document.getElementById('authDialogStatus');
  if (status) status.textContent = '';
  // 焦点还原：弹窗关闭后焦点回到触发元素（若有），否则归还 body
  if (overlay.contains(document.activeElement)) {
    if (overlay._lastFocused && overlay._lastFocused.isConnected) overlay._lastFocused.focus();
    else document.activeElement.blur();
  }
  overlay._lastFocused = null;
}

async function submitAuthKey() {
  const input = document.getElementById('authDialogKey');
  const status = document.getElementById('authDialogStatus');
  const btn = document.getElementById('authSubmitBtn');
  if (!input || !btn) return;
  const key = input.value.trim();
  if (!key) {
    if (status) { status.textContent = '请输入 API Key'; status.style.color = 'var(--danger)'; }
    input.focus();
    return;
  }
  // Show loading state
  btn.disabled = true;
  btn.textContent = '验证中...';
  if (status) status.textContent = '';

  try {
    // 调用 login 端点获取 JWT
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key }
    });
    const json = await res.json();
    if (!res.ok || !json.success || !json.data || !json.data.token) {
      throw new Error(json.error || '认证失败');
    }
    // 存储 JWT
    localStorage.setItem('tmd_jwt_token', json.data.token);
    if (json.data.expires_at) {
      localStorage.setItem('tmd_jwt_expiry', json.data.expires_at);
    } else {
      localStorage.removeItem('tmd_jwt_expiry');
    }
    setTimeout(() => { window.location.reload(); }, 300);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '确认';
    if (status) { status.textContent = '❌ 登录失败: ' + e.message; status.style.color = 'var(--danger)'; }
  }
}

// Event Listeners
document.getElementById('menuToggle').onclick = () => {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  sb.classList.toggle('open');
  ov.classList.toggle('open', sb.classList.contains('open'));
  document.getElementById('menuToggle').setAttribute('aria-expanded', sb.classList.contains('open'));
};



document.getElementById('sseIndicator').onclick = () => {
  sseManager.resume();
  sseManager.refreshCurrentPage();
};

// Handle window resize
window.addEventListener('resize', () => {
  const isMobile = window.innerWidth < 768;
  if (isMobile !== store.state.isMobile) {
    store.setState({ isMobile });
    // 断点切换后，惰性渲染的另一侧容器需要补渲染
    if (store.state.currentPage === 'data' && !store.state.dbLoading && !store.state.dbError) {
      renderDataTables(store.state);
    }
  }
});

// Subscribe to state changes
const dataDetector = makeChangeDetector(['dataSubPage', 'dbData', 'dbPagination', 'dbSort', 'dbLoading', 'dbError', '_prevNameUserIdFilter', '_relUserIdFilter', '_relListIdFilter']);
const scheduleDetector = makeChangeDetector(['_schedules', '_scheduleRaw', '_scheduleExists', '_scheduleSaving', '_scheduleTab', '_scheduleFormItems', '_schedulerRunning']);
const overviewDetector = makeChangeDetector(['tasks', 'health']);
// system 页变化检测器：取代原 syncSystemPage 中 18 行手写 lastXxx 比较
// 注意：不包含 'tasks'，原代码 tasks 变化不触发 system 页 rebuild（lastTasksJson 是死代码）
const systemDetector = makeChangeDetector([
  '_systemTab',
  'configRaw', 'configSaving', 'configFields', 'configFieldsLoading', 'configExists', 'configMode',
  'cookieItems', 'cookiesMode', 'cookiesRaw', 'cookiesSaving', 'cookiesExists', '_cookiesLoading',
  '_schedules', '_scheduleRaw', '_scheduleExists', '_scheduleSaving', '_scheduleTab', '_scheduleFormItems'
]);

// ============================================
// Page-specific state sync functions
// ============================================

// 局部更新表格 + 分页栏（syncDataPage 与 resize 断点切换共用）
// 惰性渲染：只重建当前视口可见的容器（桌面表格 / 移动卡片），隐藏侧在断点切换时补渲染
function renderDataTables(state) {
  const subPage = state.dataSubPage;
  const current = state.dbData[subPage] || { data: [], total: 0 };
  const pagination = state.dbPagination[subPage] || { page: 1, pageSize: 200, totalPages: 1 };
  const sort = state.dbSort[subPage] || { sortBy: 'id', sortOrder: 'desc' };

  const isMobile = window.innerWidth < 768;
  const tableEl = document.getElementById('dataTableContainer');
  if (tableEl && !isMobile) tableEl.innerHTML = renderDBTable(subPage, current.data, sort);

  const mobileEl = document.getElementById('dataMobileCards');
  if (mobileEl && isMobile) mobileEl.innerHTML = renderDBMobileCards(subPage, current.data);

  const pagEl = document.getElementById('dataPagination');
  if (pagEl) {
    const infoEl = pagEl.querySelector('#dataPaginationInfo');
    if (infoEl) {
      infoEl.textContent = `显示 ${current.data.length || 0} / ${current.total || 0} 条记录 (第 ${pagination.page} / ${pagination.totalPages} 页)`;
    }
    const controlsEl = pagEl.querySelector('.pagination-controls');
    if (controlsEl) {
      controlsEl.innerHTML = `
        <button class="page-btn" data-action="changeDBPage" data-delta="-1" ${pagination.page <= 1 ? 'disabled' : ''}>←</button>
        ${renderPageNumbers(pagination.page, pagination.totalPages)}
        <button class="page-btn" data-action="changeDBPage" data-delta="1" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>→</button>
      `;
    }
  }
}

function syncDataPage(state) {
  const { hasAny, changed } = dataDetector.detect(state);
  if (!hasAny) return;

  // 子页面、加载/错误态、筛选横幅变化：全量重建（这些区域不只影响表格主体）
  if (changed.dataSubPage || changed.dbLoading || changed.dbError || changed._prevNameUserIdFilter || changed._relUserIdFilter || changed._relListIdFilter) { render(); return; }

  // 仅数据/排序/分页变化：局部更新表格 + 分页栏，保留标签页和搜索状态
  renderDataTables(state);
}

// ============================================
// System 页三个面板的 rebuild 函数（提取自原 syncSystemPage）
// skip 判定省略原代码两个冗余条件：
// - currentPage === 'system'：syncSystemPage 仅在 system 页调用（store.subscribe），恒为 true
// - shouldRebuild：raw 模式下 shouldRebuild 包含 changed.xxxMode，若 changed.xxxMode=true 则必为 true
// ============================================
function rebuildConfigPanel(state, changed) {
  // skip 判定：setConfigMode 已同步重建 panel，跳过避免重复
  const skipRebuild = configEditor.isSkipFlagSet()
    && changed.configMode
    && state.configMode === 'raw';
  if (skipRebuild) {
    configEditor.consumeSkipFlag();
    _state.lastConfigRaw = state.configRaw;  // 修正 11：必须更新，否则 rawRebuildNeeded 判定失效
    return;
  }
  // rebuild 判定（与原逻辑等价）
  const rawRebuildNeeded = changed.configRaw && _state.lastConfigRaw === null && state.configRaw !== null;
  const shouldRebuild = state.configMode === 'raw'
    ? (changed.configMode || changed.configSaving || changed.configExists || rawRebuildNeeded)
    : (changed.configRaw || changed.configFields || changed.configFieldsLoading || changed.configSaving || changed.configExists || changed.configMode);
  if (shouldRebuild) {
    _state.lastConfigRaw = state.configRaw;  // 保留 _state.lastConfigRaw 用于 rawRebuildNeeded 判定
    configEditor.rebuild();
  } else if (changed.configRaw && state.configMode === 'raw' && _state.configEditor) {
    _state.lastConfigRaw = state.configRaw;  // 修正 12：必须更新，与原代码 L4692 等价
    configEditor.setEditorValue(state.configRaw);
  }
}

function rebuildCookiesPanel(state, changed) {
  const skipRebuild = cookiesEditor.isSkipFlagSet()
    && changed.cookiesMode
    && state.cookiesMode === 'raw';
  if (skipRebuild) {
    cookiesEditor.consumeSkipFlag();
    _state.lastCookiesRaw = state.cookiesRaw;  // 修正 11
    return;
  }
  const rawRebuildNeeded = changed.cookiesRaw && _state.lastCookiesRaw === null && state.cookiesRaw !== null;
  const shouldRebuild = state.cookiesMode === 'raw'
    ? (changed.cookiesMode || changed.cookiesSaving || changed.cookiesExists || rawRebuildNeeded)
    : (changed.cookieItems || changed.cookiesMode || changed.cookiesRaw || changed.cookiesSaving || changed.cookiesExists || changed._cookiesLoading);
  if (shouldRebuild) {
    _state.lastCookiesRaw = state.cookiesRaw;
    cookiesEditor.rebuild();
  } else if (changed.cookiesRaw && state.cookiesMode === 'raw' && _state.cookiesEditor) {
    _state.lastCookiesRaw = state.cookiesRaw;  // 修正 12
    cookiesEditor.setEditorValue(state.cookiesRaw);
  }
}

function rebuildSchedulePanel(state, changed) {
  const skipRebuild = scheduleEditor.isSkipFlagSet()
    && changed._scheduleTab
    && state._scheduleTab === 'raw';
  if (skipRebuild) {
    scheduleEditor.consumeSkipFlag();
    _state.lastScheduleRaw = state._scheduleRaw;  // 修正 11
    return;
  }
  // 注意：schedulesChanged 只依赖 changed._schedules，不包含 changed.tasks
  // 原代码 tasks 变化不触发 schedules rebuild（lastTasksJson 是死代码，修正 3/15）
  // 原代码 L4727-4729 的 `if (schedulesChanged && !schedulePanelSchedulesChanged)` 分支
  // 已被 detector 自动管理 snapshot 替代（修正 14），直接删除
  const schedulesChanged = changed._schedules;
  const schedulePanelSchedulesChanged = state._scheduleTab !== 'form' && schedulesChanged;
  const rawRebuildNeeded = changed._scheduleRaw && _state.lastScheduleRaw === null && state._scheduleRaw !== null;
  const shouldRebuild = state._scheduleTab === 'raw'
    ? (changed._scheduleTab || changed._scheduleSaving || changed._scheduleExists || rawRebuildNeeded || schedulePanelSchedulesChanged || changed._scheduleFormItems)
    : (schedulePanelSchedulesChanged || changed._scheduleRaw || changed._scheduleExists || changed._scheduleSaving || changed._scheduleTab || changed._scheduleFormItems);
  if (shouldRebuild) {
    _state.lastScheduleRaw = state._scheduleRaw;
    scheduleEditor.rebuild();
  } else if (changed._scheduleRaw && state._scheduleTab === 'raw' && _state.scheduleEditor) {
    _state.lastScheduleRaw = state._scheduleRaw;  // 修正 12
    scheduleEditor.setEditorValue(state._scheduleRaw);
  }
}

function syncSystemPage(state) {
  const { hasAny, changed } = systemDetector.detect(state);
  if (!hasAny) return;

  // tab 切换：只改 display + active class，不重建 panel
  if (changed._systemTab) {
    document.querySelectorAll('.system-tabs .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === state._systemTab);
    });
    document.getElementById('systemConfigPanel').style.display = state._systemTab === 'config' ? '' : 'none';
    document.getElementById('systemCookiesPanel').style.display = state._systemTab === 'cookies' ? '' : 'none';
    document.getElementById('systemSchedulesPanel').style.display = state._systemTab === 'schedules' ? '' : 'none';
    document.getElementById('systemSecurityPanel').style.display = state._systemTab === 'security' ? '' : 'none';
  }

  // 三个面板独立 rebuild（仅当相关状态变化时）
  if (changed.configRaw || changed.configSaving || changed.configFields || changed.configFieldsLoading || changed.configExists || changed.configMode) {
    rebuildConfigPanel(state, changed);
  }
  if (changed.cookieItems || changed.cookiesMode || changed.cookiesRaw || changed.cookiesSaving || changed.cookiesExists || changed._cookiesLoading) {
    rebuildCookiesPanel(state, changed);
  }
  if (changed._schedules || changed._scheduleRaw || changed._scheduleExists || changed._scheduleSaving || changed._scheduleTab || changed._scheduleFormItems) {
    rebuildSchedulePanel(state, changed);
  }
}

function syncSchedulesPage(state) {
  const { hasAny, changed } = scheduleDetector.detect(state);
  if (!hasAny) return;

  // 手术刀更新：banner → 只改 #scheduleBanner，保留列表 DOM 和滚动位置
  if (changed._schedulerRunning) {
    const bannerEl = document.getElementById('scheduleBanner');
    if (bannerEl) {
      bannerEl.innerHTML = state._schedulerRunning
        ? '' : '<div class="alert alert-warning" style="margin-bottom:var(--space-3)">⚠️ 调度器未启动，定时任务不会自动执行。请在「定时任务」页面中添加并启用规则后重载配置。</div>';
    }
  }

  // 手术刀更新：列表 → 只改 #scheduleTable，保留页面容器和滚动位置
  if (changed._schedules || changed._scheduleExists) {
    const tableEl = document.getElementById('scheduleTable');
    if (!tableEl) {
      // #scheduleTable 不存在说明当前是骨架屏（_schedules 从 null → 有值），
      // 触发全页渲染从骨架屏切换到真正的视图
      render();
      return;
    }
    // 保存当前滚动位置（card-body-scroll 是实际滚动容器）
    const scrollBody = tableEl.querySelector('.card-body-scroll');
    const scrollPos = scrollBody ? scrollBody.scrollTop : 0;
    tableEl.innerHTML = renderScheduleTable(state._schedules, state._scheduleExists);
    // 恢复滚动位置
    if (scrollPos > 0) {
      requestAnimationFrame(() => {
        const newScroll = tableEl.querySelector('.card-body-scroll');
        if (newScroll) newScroll.scrollTop = scrollPos;
      });
    }
  }
}

function syncOverviewPage(state) {
  const { hasAny, changed } = overviewDetector.detect(state);
  if (!hasAny) return;

  if (changed.tasks) {
    updateOverviewTasksUI(state.tasks);
  }
  if (changed.health) {
    updateOverviewHealthUI(state.health);
  }
}

function updateOverviewHealthUI(health) {
  const el = document.querySelector('[data-overview-stat="health"]');
  if (el) el.textContent = health ? (health.status === 'ok' ? '健康' : '异常') : '检查中';
  const labelEl = document.querySelector('.stat-card:first-child .stat-label');
  if (labelEl) labelEl.textContent = '系统状态 ' + (health ? health.version : '');
}

store.subscribe((state) => {
  // 首次渲染由 init() 的 render() 控制，订阅只处理页面切换和手术刀更新
  if (state.currentPage === null) return;

  if (state.currentPage !== _state.lastPage) {
    // 离开任务页前保存表单输入（render 重建时旧表单已不在 DOM 中）
    if (_state.lastPage === 'tasks') saveTaskFormState();
    _state.lastPage = state.currentPage;
    render();
    return;
  }

  if (state.currentPage === 'tasks') {
    const { changed } = overviewDetector.detect(state);
    if (changed.tasks) { updateTaskListUI(state.tasks); }
  }

  if (state.currentPage === 'data') syncDataPage(state);
  else if (state.currentPage === 'system') syncSystemPage(state);
  else if (state.currentPage === 'schedules') syncSchedulesPage(state);
  // 日志页使用直接 DOM 操作（refreshLogs/connectLogSSE），不需要 store 订阅做手术刀更新
  else if (state.currentPage === 'overview') syncOverviewPage(state);
});

function getTaskStats(tasks) {
  const taskStats = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  tasks.forEach(t => { if (taskStats[t.status] !== undefined) taskStats[t.status]++; });
  return taskStats;
}

function updateOverviewStatsUI(tasks) {
  const taskStats = getTaskStats(tasks);

  const runningStat = document.querySelector('[data-overview-stat="running"]');
  if (runningStat) runningStat.textContent = taskStats.running;

  const completedStat = document.querySelector('[data-overview-stat="completed"]');
  if (completedStat) completedStat.textContent = taskStats.completed;
}

// Update overview page recent tasks without full re-render
function updateOverviewTasksUI(tasks) {
  const recentTasks = tasks.slice(0, 4);
  const taskList = document.querySelector('.overview-tasks-list');
  if (!taskList) return;

  updateOverviewStatsUI(tasks);
  
  if (recentTasks.length === 0) {
    taskList.className = 'empty-state overview-tasks-list';
    taskList.innerHTML = `
      <div class="empty-icon">📋</div>
      <div class="empty-title">暂无任务</div>
      <div class="empty-desc">创建一个新任务开始下载 Twitter 媒体文件</div>
    `;
  } else {
    taskList.className = 'task-list overview-tasks-list';
    taskList.innerHTML = recentTasks.map(t => renderTaskItem(t)).join('');
  }
}

// 增量更新单个任务行的动态部分（进度/状态/操作按钮），静态标题与时间不重建
function updateTaskItemDynamic(el, task) {
  const status = getTaskStatusInfo(task.status);
  const pct = getTaskProgressPercent(task);
  const stageText = task.progress?.stage ? getStageText(task.progress.stage) : '';
  const currentText = task.progress?.current ? ' · ' + task.progress.current : '';

  const tag = el.querySelector('.tag');
  if (tag) {
    const newTagClass = 'tag ' + status.tag;
    if (tag.className !== newTagClass) tag.className = newTagClass;
    if (tag.textContent !== status.text) tag.textContent = status.text;
  }

  const fill = el.querySelector('.progress-fill');
  if (fill) fill.style.width = pct + '%';

  const ptext = el.querySelector('.task-progress-text');
  if (ptext) {
    const newText = pct + '%' + stageText + currentText;
    if (ptext.textContent !== newText) ptext.textContent = newText;
  }

  const actions = el.querySelector('.task-actions');
  const btn = actions?.querySelector('button');
  const shouldCancel = task.status === 'running' || task.status === 'queued';
  const needBtnSwap = shouldCancel
    ? (btn?.dataset.action !== 'cancelTask')
    : (btn?.dataset.action !== 'showTaskDetail');
  if (actions && needBtnSwap) {
    actions.innerHTML = shouldCancel
      ? `<button class="btn btn-danger btn-sm" data-task-id="${escapeAttr(task.task_id)}" data-action="cancelTask">取消</button>`
      : `<button class="btn btn-ghost btn-sm" data-task-id="${escapeAttr(task.task_id)}" data-action="showTaskDetail">详情</button>`;
  }
}

// Update only the task list part of the UI without full re-render
// keyed 增量：按 task_id 复用行元素，仅更新进度/状态/按钮，避免 SSE 高频快照触发整表重建
function updateTaskListUI(tasks) {
  const taskList = document.getElementById('taskListContainer');
  if (!taskList) return;
  
  const filter = store.state.taskFilter;
  const stageFilter = store.state.taskStageFilter;
  const search = store.state.taskSearch.toLowerCase();
  
  let filtered = tasks;
  
  if (filter !== 'all') {
    filtered = filtered.filter(t => t.status === filter);
  }

  if (stageFilter !== 'all') {
    filtered = filtered.filter(t => getTaskStage(t) === stageFilter);
  }
  
  if (search) {
    filtered = filtered.filter(t => {
      const target = (t.data?.screen_name || t.data?.list_id || '').toString().toLowerCase();
      const batchTargets = [
        ...(t.data?.users || []),
        ...(t.data?.lists || []),
        ...(t.data?.following_names || [])
      ].join(' ').toLowerCase();
      const shortId = shortTaskID(t.task_id).toLowerCase();
      const stage = getTaskStage(t).toLowerCase();
      return target.includes(search) || batchTargets.includes(search) ||
        t.task_id.toLowerCase().includes(search) || shortId.includes(search) ||
        stage.includes(search) || (t.type || '').toLowerCase().includes(search);
    });
  }
  
  if (filtered.length === 0) {
    if (!taskList.classList.contains('empty-state')) {
      taskList.className = 'empty-state';
      taskList.innerHTML = `
        <div class="empty-icon">🔍</div>
        <div class="empty-title">没有找到匹配的任务</div>
        <div class="empty-desc">尝试调整筛选条件或搜索关键词</div>
      `;
    }
  } else {
    if (!taskList.classList.contains('task-list')) {
      // 从空态切换到列表：先清空空态 DOM
      taskList.className = 'task-list';
      taskList.innerHTML = '';
    }
    const existing = new Map();
    taskList.querySelectorAll('.task-item').forEach(el => {
      const id = el.getAttribute('data-task-id');
      if (id) existing.set(id, el);
    });
    const seen = new Set();
    for (const t of filtered) {
      const id = String(t.task_id);
      seen.add(id);
      const el = existing.get(id);
      if (el) {
        updateTaskItemDynamic(el, t);
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderTaskItem(t);
        taskList.appendChild(tmp.firstElementChild);
      }
    }
    // 移除已消失（取消/删除/筛选变化）的行
    for (const [id, el] of existing) {
      if (!seen.has(id)) el.remove();
    }
  }
  
  // Update task count subtitle
  const subtitle = document.querySelector('[data-task-count-subtitle]');
  if (subtitle) {
    subtitle.textContent = `共 ${filtered.length} 个任务（总计 ${tasks.length}）`;
  }
}

// Register global event listeners once (event delegation on content container)
document.getElementById('contentContainer').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const id = e.target.id;
  if (id === 'quickDownloadInput') handleQuickDownload();
  else if (id === 'dbSearchInput') searchDB();
  else if (id === 'log-search-input') doLogSearch();
});

// Esc 关闭：抽屉优先，其次认证弹窗（键盘可达性）
// Tab 焦点陷阱：抽屉/认证弹窗打开时 Tab/Shift+Tab 循环约束在容器内，不落到遮罩后的页面
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (drawer.el.classList.contains('open')) {
      drawer.close();
      return;
    }
    const authOverlayEl = document.getElementById('authOverlay');
    if (authOverlayEl && authOverlayEl.classList.contains('open')) hideAuthDialog();
    return;
  }
  if (e.key !== 'Tab') return;
  const authOverlayEl = document.getElementById('authOverlay');
  const openModal = drawer.el.classList.contains('open') ? drawer.el
    : (authOverlayEl && authOverlayEl.classList.contains('open') ? authOverlayEl : null);
  if (!openModal) return;
  const focusables = openModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) { e.preventDefault(); return; }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// 导航项键盘可达性：role=link 的 div 用 Enter/Space 触发导航（与点击行为一致）
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const nav = e.target?.closest?.('[data-action="navigateTo"][data-page]');
  if (!nav) return;
  e.preventDefault();
  navigateTo(nav.dataset.page);
});

// Auth Dialog: Enter key 提交（弹窗在 #app 内但不在 #contentContainer 内，需独立委派）
document.getElementById('app').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const overlay = document.getElementById('authOverlay');
  if (!overlay || overlay.style.display === 'none') return;
  if (e.target.id === 'authDialogKey') submitAuthKey();
});

// 防抖任务搜索：每次击键不立即全量重建列表
const debouncedFilterTasks = debounce(filterTasks, 200);

// Delegated input/change/blur for data-binding elements (replaces inline on* handlers)
document.getElementById('contentContainer').addEventListener('input', (e) => {
  const el = e.target.closest('[data-binding]');
  if (!el) return;
  const binding = el.dataset.binding;
  const idx = el.dataset.idx;
  if (binding === 'taskSearch') {
    updateSearchState('taskSearch', null, el.value);
    debouncedFilterTasks();
  } else if (binding === 'dbSearch') {
    updateSearchState('dbSearch', store.state.dataSubPage, el.value);
  } else if (binding === 'sf_field' && idx !== undefined) {
    scheduleFieldChanged(Number(idx));
  }
});

document.getElementById('contentContainer').addEventListener('change', (e) => {
  const domainFilter = e.target.closest('[data-log-domain-filter]');
  if (domainFilter) {
    setLogDomain(domainFilter.value);
    return;
  }

  const el = e.target.closest('[data-binding]');
  if (!el) return;
  const binding = el.dataset.binding;
  const idx = el.dataset.idx;
  if (binding === 'taskFilter') {
    updateSearchState('taskFilter', null, el.value);
    filterTasks();
  } else if (binding === 'taskStageFilter') {
    updateSearchState('taskStageFilter', null, el.value);
    filterTasks();
  } else if (binding === 'sf_type' && idx !== undefined) {
    updateScheduleFormItem(Number(idx), el.id.includes('mode') ? 'scheduleMode' : 'type', el.value);
  }
});

document.getElementById('contentContainer').addEventListener('focusout', (e) => {
  const el = e.target.closest('[data-binding]');
  if (!el) return;
  const idx = el.dataset.idx;
  if (el.dataset.binding === 'sf_field' && idx !== undefined) {
    validateScheduleField(Number(idx));
  }
});

document.getElementById('contentContainer').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-task-tab]');
  if (tab) {
    saveTaskFormState();
    // 记录新激活 tab（saveTaskFormState 保存的是切换前的 active tab，需在此更新）
    _state._taskFormTab = tab.dataset.taskTab;
    document.querySelectorAll('[data-task-tab]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('taskFormContainer').innerHTML = renderTaskForm(tab.dataset.taskTab);
    restoreTaskFormState(tab.dataset.taskTab);
    return;
  }

  const taskItem = e.target.closest('.task-item[data-task-id]');
  if (taskItem) {
    // 如果点击的是 data-action 按钮（如取消/重试），
    // 该按钮已由 Universal action dispatch 处理，此处不应再打开详情
    if (e.target.closest('[data-action]')) return;
    showTaskDetail(taskItem.dataset.taskId);
  }
});

// ============================================
// Universal action dispatch (replaces inline onclick)
// ============================================
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const action = el.dataset.action;
  const inDrawer = !!el.closest('#drawer');

  switch (action) {
    case 'navigateTo':            navigateTo(el.dataset.page); break;
    case 'setSystemTab':          setSystemTab(el.dataset.tab); break;
    case 'setDataSubPage':        setDataSubPage(el.dataset.subpage); break;
    case 'navigateToSystemSchedules': navigateToSystemSchedules(); break;
    case 'navigateToTasks':       navigateTo('tasks'); break;

    // Task creation
    case 'createUserTask':        createUserTask(el); break;
    case 'createProfileTask':     createProfileTask(el); break;
    case 'markUserTask':          markUserTask(el); break;
    case 'markFollowingTask':     markFollowingTask(el); break;
    case 'markListTask':          markListTask(el); break;
    case 'createListTask':        createListTask(el); break;
    case 'createListProfileTask': createListProfileTask(el); break;
    case 'createFollowingTask':   createFollowingTask(el); break;
    case 'createMarkTask':        createMarkTask(el); break;
    case 'createBatchTask':       createBatchTask(el); break;
    case 'createJsonFileTask':    createJsonFileTask(el); break;
    case 'createJsonFolderTask':  createJsonFolderTask(el); break;
    case 'handleQuickDownload':   handleQuickDownload(el); break;
    case 'cancelQueuedTasks':     cancelQueuedTasks(el); break;

    // Config
    case 'setConfigMode':         setConfigMode(el.dataset.mode); break;
    case 'saveConfigForm':        saveConfigForm(); break;
    case 'saveConfig':            saveConfig(); break;
    case 'configRetryLoadRaw':    loadConfigRaw(); break;

    // Cookies
    case 'setCookiesMode':        setCookiesMode(el.dataset.mode); break;
    case 'addCookieAccount':      addCookieAccount(); break;
    case 'saveCookiesForm':       saveCookiesForm(); break;
    case 'removeCookieAccount':   removeCookieAccount(Number(el.dataset.index)); break;
    case 'saveCookies':           saveCookies(); break;

    case 'hideAuthDialog':        hideAuthDialog(); break;
    case 'submitAuthKey':         submitAuthKey(); break;

    // Schedules
    case 'setScheduleTab':        setScheduleTab(el.dataset.tab); break;
    case 'addScheduleItem':       addScheduleItem(); break;
    case 'removeScheduleItem':    removeScheduleItem(Number(el.dataset.index)); break;
    case 'undoRemoveScheduleItem': undoRemoveScheduleItem(); break;
    case 'saveScheduleForm':      saveScheduleForm(); break;
    case 'saveScheduleRaw':       saveScheduleRaw(); break;
    case 'triggerSchedule':       triggerSchedule(el.dataset.scheduleId, el); break;
    case 'triggerAllSchedules':   triggerAllSchedules(); break;
    case 'toggleScheduleEnabled': toggleScheduleEnabled(el.dataset.scheduleId, el.dataset.enabled === 'true', el); break;

    // DB page
    case 'changeDBPage':          changeDBPage(Number(el.dataset.delta)); break;
    case 'goToDBPage':            goToDBPage(Number(el.dataset.page)); break;
    case 'sortDB':                sortDB(el.dataset.sortField); break;
    case 'searchDB':              searchDB(); break;
    case 'editDBItem':            editDBItem(el.dataset.dbType, el.dataset.dbId); break;
    case 'deleteDBItem':          deleteDBItem(el.dataset.dbType, el.dataset.dbId); break;
    case 'saveDBItem':            saveDBItem(el.dataset.dbType, el.dataset.dbId); break;
    case 'filterPreviousNamesByUser': filterPreviousNamesByUser(el.dataset.userId); break;
    case 'clearPreviousNamesFilter': clearPreviousNamesFilter(); break;
    case 'viewUserRelations':      viewUserRelations(el); break;
    case 'viewListRelations':      viewListRelations(el); break;
    case 'clearRelFilter':         clearRelFilter(); break;

    // Logs
    case 'logSetLevel':       setLogLevel(el.dataset.level); break;
    case 'toggleLogPause':    toggleLogPause(); break;
    case 'logSearch':         doLogSearch(); break;
    case 'logRefresh':        refreshLogs(); break;
    case 'logExport':         exportLogs(); break;
    case 'logScrollToBottom': scrollLogToBottom(); break;
    case 'toggleLogAutoScroll':     toggleLogAutoScroll(); break;
    case 'copyLogLine':       copyLogLine(el); break;
    case 'copyLogTweetId':    copyLogTweetId(el); break;

    // Server
    case 'shutdownServer':        shutdownServer(); break;

    // Security
    case 'secLogin':              secLogin(); break;
    case 'secTest':               secTest(); break;
    case 'secRefresh':            secRefresh(); break;
    case 'secClear':              secClear(); break;

    // Schedules
    case 'reloadSchedules':       reloadSchedulesConfig(el); break;

    // Errors
    case 'retryAllErrors':        retryAllErrors(); break;
    case 'clearErrors':           clearErrors(); break;

    // Drawer
    case 'closeDrawer':           drawer.close(); return;

    // Tasks in list/drawer
    case 'cancelTask':            cancelTask(el.dataset.taskId, el); break;
    case 'retryTask':             retryTask(el.dataset.taskId, el); break;
    case 'deleteTask':            deleteTask(el.dataset.taskId, el); break;
    case 'showTaskDetail':        showTaskDetail(el.dataset.taskId); break;

    case 'closeSidebar':
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('open');
      break;
  }

  // Most drawer actions close the drawer, but task operations update the drawer in place.
  const drawerKeepsOpen = ['cancelTask', 'retryTask', 'deleteTask', 'showTaskDetail'];
  if (inDrawer && !drawerKeepsOpen.includes(action)) drawer.close();
});

// Start
init();
