// 06-logs: 日志页级别筛选、导出按钮
(async () => {
  const h = window.__e2e;
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });

  await h.nav('logs', 1500);
  ok('stream', h.vis(document.getElementById('log-stream')));

  // 级别筛选：点 INFO
  const infoBtn = [...document.querySelectorAll('#contentContainer button')].find(b => b.innerText.includes('INFO'));
  ok('level-btn', !!infoBtn);
  if (infoBtn) {
    infoBtn.click();
    await h.wait(1500);
    const lines = [...document.querySelectorAll('#log-stream .log-entry')];
    ok('info-filter', lines.length > 0 && lines.every(l => l.textContent.includes('INFO')));
  }

  // 导出按钮存在
  ok('export-btn', !!h.byAction('logExport'));
  return { name: '06-logs', passed: checks.every(c => c.pass), checks };
})()
