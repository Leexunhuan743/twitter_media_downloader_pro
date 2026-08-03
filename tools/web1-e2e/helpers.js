// web1 E2E 测试助手 —— 在 xd://browser 的 tab.evaluate 上下文中注入使用。
// 设计要点（来自历次实测踩坑，见 README "陷阱清单"）：
// 1. 每次交互前重新 querySelector —— SPA 点击会触发 render() 重建，旧元素脱离 DOM 后 .click() 不派发事件
// 2. 断言可见性（computed display/visibility/classList）而非存在性 —— 所有面板都预渲染在 DOM 里，隐藏的也存在
// 3. 按钮查找优先用 data-action（文案会变：如暂停后按钮变"继续"而非"恢复"）
// 4. 多编辑器页面（system 三个面板各有模式按钮）必须限定作用域，否则选中第一个匹配
window.__e2e = {
  wait: (ms) => new Promise(res => setTimeout(res, ms)),

  // 可见性断言：display 非 none 且 visibility 非 hidden
  vis: (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden',

  // 通过 data-action 查找元素（任意作用域）；返回元素或 null
  byAction: (action, scope = document) => scope.querySelector('[data-action="' + action + '"]'),

  // 在作用域内按 data-action 点击；返回是否找到并点击
  clickAction: (action, scope = document) => {
    const el = scope.querySelector('[data-action="' + action + '"]');
    if (!el) return false;
    el.click();
    return true;
  },

  // 按文本在作用域内找 tab/按钮并点击（每次重新查询，防 detached）
  clickByText: (selector, text, scope = document) => {
    const el = [...scope.querySelectorAll(selector)].find(e => e.innerText.trim() === text);
    if (!el) return false;
    el.click();
    return true;
  },

  // 按包含文本查找按钮（如 /暂停/ 匹配"暂停"和"继续"后的"恢复"变体）
  clickBtnContaining: (text, scope = document) => {
    const el = [...scope.querySelectorAll('button')].find(b => b.innerText.includes(text));
    if (!el) return false;
    el.click();
    return true;
  },

  // 导航到主页面并等待渲染
  nav: async (page, waitMs = 900) => {
    const el = document.querySelector('.nav-item[data-page="' + page + '"]');
    if (!el) return false;
    el.click();
    await new Promise(res => setTimeout(res, waitMs));
    return store.state.currentPage === page;
  },

  // 取系统页某 tab 对应面板
  systemPanel: (tab) => {
    const map = { config: 'systemConfigPanel', cookies: 'systemCookiesPanel', schedules: 'systemSchedulesPanel', security: 'systemSecurityPanel' };
    return document.getElementById(map[tab]);
  },

  // 切系统页 tab 并断言可见性；返回检查结果
  systemTabVisible: async (tab) => {
    const t = [...document.querySelectorAll('.system-tabs .tab')].find(x => x.dataset.tab === tab);
    if (!t) return { tab, found: false };
    t.click();
    await new Promise(res => setTimeout(res, 400));
    return { tab, found: true, active: t.classList.contains('active'), visible: window.__e2e.vis(window.__e2e.systemPanel(tab)) };
  },
};
