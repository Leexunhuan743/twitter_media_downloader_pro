// 06-logs: 日志页暂停/继续、级别筛选、搜索
// 注意：暂停后按钮文案是"继续"（不是"恢复"）——用 data-action 而非文案
(async () => {
  const h = window.__e2e;
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });

  await h.nav('logs', 1500);
  ok('stream', h.vis(document.getElementById('log-stream')));

  // 暂停 → 继续（data-action="toggleLogPause"）
  ok('pause-btn', !!h.byAction('toggleLogPause'));
  h.clickAction('toggleLogPause');
  await h.wait(400);
  ok('paused', store.state.logPaused === true);
  h.clickAction('toggleLogPause');
  await h.wait(400);
  ok('resumed', store.state.logPaused === false);

  // 级别筛选：点 INFO
  const infoBtn = [...document.querySelectorAll('#contentContainer button')].find(b => b.innerText.includes('INFO'));
  ok('level-btn', !!infoBtn);
  if (infoBtn) {
    infoBtn.click();
    await h.wait(1500);
    const lines = [...document.querySelectorAll('#log-stream .log-entry')];
    ok('info-filter', lines.length > 0 && lines.every(l => l.textContent.includes('INFO')));
  }

  // 搜索：由 🔍 按钮触发（input 事件不触发搜索，Enter 或按钮才触发）
  const search = document.querySelector('#log-search-input');
  ok('search-input', !!search);
  if (search) {
    search.value = 'zzz_nonexistent_keyword';
    h.clickAction('logSearch');
    await h.wait(1000);
    ok('search-empty', document.querySelector('#log-stream').innerText.includes('没有匹配日志'));
    // 清空恢复
    search.value = '';
    h.clickAction('logSearch');
    await h.wait(1000);
    ok('search-restored', document.querySelectorAll('#log-stream .log-entry').length > 0);
  }

  // 导出按钮存在
  ok('export-btn', !!h.byAction('logExport'));
  return { name: '06-logs', passed: checks.every(c => c.pass), checks };
})()
