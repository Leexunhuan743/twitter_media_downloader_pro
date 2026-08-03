// 07-drawer-a11y: 抽屉焦点移入、Tab 陷阱循环、Esc 关闭
(async () => {
  const h = window.__e2e;
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });

  drawer.open('测试', '<button id="e2e-a">A</button><button id="e2e-b">B</button>', '');
  await h.wait(300);
  ok('open', drawer.el.classList.contains('open'));
  ok('focus-in', drawer.el.contains(document.activeElement));

  // Tab 陷阱：从最后一个 Tab → 回到第一个（drawer 内第一个可聚焦元素是 drawerClose）
  const btns = () => [...drawer.el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
  const last = btns()[btns().length - 1];
  last.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  ok('tab-wrap', btns()[0].contains(document.activeElement) || document.activeElement === btns()[0]);

  // Shift+Tab 从第一个 → 最后一个
  const first = btns()[0];
  first.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
  ok('shift-tab-wrap', document.activeElement === btns()[btns().length - 1]);

  // 中间元素 Tab：合成事件不触发浏览器默认焦点前进，断言焦点未被陷阱拦截（仍在 drawer 内原位置）
  if (btns().length >= 3) {
    btns()[1].focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    ok('mid-tab-free', document.activeElement === btns()[1] && drawer.el.contains(document.activeElement));
  }

  // Esc 关闭
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await h.wait(300);
  ok('esc-close', !drawer.el.classList.contains('open'));
  return { name: '07-drawer-a11y', passed: checks.every(c => c.pass), checks };
})()
