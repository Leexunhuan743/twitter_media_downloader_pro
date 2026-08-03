// 01-navigation: 6 个主页面导航可达性 + 内容渲染
(async () => {
  const h = window.__e2e;
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });

  for (const p of ['overview', 'tasks', 'schedules', 'data', 'logs', 'system']) {
    const navOk = await h.nav(p);
    ok('nav:' + p, navOk);
    const c = document.querySelector('#contentContainer');
    ok('render:' + p, c && c.innerText.length > 20);
  }
  return { name: '01-navigation', passed: checks.every(c => c.pass), checks };
})()
