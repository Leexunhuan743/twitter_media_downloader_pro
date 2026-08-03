// 02-system-tabs: 系统页 4 tab 可见性切换 + 三编辑器模式按钮作用域
(async () => {
  const h = window.__e2e;
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });

  await h.nav('system');
  for (const tab of ['config', 'cookies', 'schedules', 'security']) {
    const r = await h.systemTabVisible(tab);
    ok('tab:' + tab, r.found && r.active && r.visible);
  }
  // 切回 config 验证互斥（同一时刻只有当前面板可见）
  await h.systemTabVisible('security');
  await h.systemTabVisible('config');
  ok('exclusive', h.vis(h.systemPanel('config')) && !h.vis(h.systemPanel('security')) && !h.vis(h.systemPanel('cookies')) && !h.vis(h.systemPanel('schedules')));

  // 三个编辑器的"高级"模式按钮：必须限定在各自面板内（全局第一个匹配会点到 config 的）
  const panels = { config: 'systemConfigPanel', cookies: 'systemCookiesPanel', schedules: 'systemSchedulesPanel' };
  for (const [name, panelId] of Object.entries(panels)) {
    const panel = document.getElementById(panelId);
    const advanced = [...panel.querySelectorAll('.mode-tab')].find(b => b.innerText.includes('高级'));
    ok('modebtn:' + name, !!advanced);
    if (advanced) {
      advanced.click();
      await h.wait(800);
      // 高级模式：面板内应有 raw 文本编辑器
      ok('rawmode:' + name, !!panel.querySelector('textarea'));
      // 切回简易模式
      const simple = [...panel.querySelectorAll('.mode-tab')].find(b => b.innerText.includes('简易'));
      if (simple) { simple.click(); await h.wait(800); }
    }
  }
  return { name: '02-system-tabs', passed: checks.every(c => c.pass), checks };
})()
