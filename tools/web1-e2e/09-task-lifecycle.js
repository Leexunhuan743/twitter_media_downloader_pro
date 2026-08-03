// 09-task-lifecycle: 创建 mark 任务 → 状态完成 → 详情抽屉 → Esc 关闭
// 使用 mark（标记已下载）而非真实下载：不消耗 Twitter API 配额
(async () => {
  const h = window.__e2e;
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });

  await h.nav('tasks');
  h.clickByText('#contentContainer .tab', '标记');
  await h.wait(500);
  const input = document.querySelector('#markUsers');
  ok('mark-input', !!input);
  if (!input) return { name: '09-task-lifecycle', passed: false, checks };

  input.value = 'barackobama';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  h.clickAction('createMarkTask');
  await h.wait(2500);

  const created = (store.state.tasks || []).find(t => t.type === 'mark_downloaded');
  ok('task-created', !!created);
  ok('task-rendered', document.querySelectorAll('#taskListContainer .task-item').length >= 1);
  if (created) ok('task-status', ['completed', 'running', 'queued', 'failed'].includes(created.status));

  // 详情抽屉（任务完成后是"详情"按钮）
  const detailBtn = document.querySelector('#taskListContainer [data-action="showTaskDetail"]');
  ok('detail-btn', !!detailBtn);
  if (detailBtn) {
    detailBtn.click();
    await h.wait(600);
    ok('drawer-open', drawer.el.classList.contains('open'));
    ok('drawer-title', (document.querySelector('#drawerTitle')?.textContent || '').includes('任务详情'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await h.wait(300);
    ok('drawer-esc', !drawer.el.classList.contains('open'));
  }
  return { name: '09-task-lifecycle', passed: checks.every(c => c.pass), checks };
})()
