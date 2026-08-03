// 04-task-tabs: 任务页 7 tab 表单渲染（每个 tab 至少 1 个输入控件）
(async () => {
  const h = window.__e2e;
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });

  await h.nav('tasks');
  const labels = ['用户', '列表', '关注', '批量', 'JSON\n文件', 'JSON\n文件夹', '标记'];
  for (const label of labels) {
    const clicked = h.clickByText('#contentContainer .tab', label);
    await h.wait(500);
    const form = document.querySelector('#taskFormContainer');
    const inputCount = form ? form.querySelectorAll('input, textarea, select').length : 0;
    ok('form:' + label, clicked && inputCount >= 1);
  }
  return { name: '04-task-tabs', passed: checks.every(c => c.pass), checks };
})()
