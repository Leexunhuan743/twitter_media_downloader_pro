// 05-schedules: 调度表单完整 diff 生命周期
// 新增（POST）→ 无变化保存（dirty 清理回归点）→ 删除（DELETE）→ 环境还原
(async () => {
  const h = window.__e2e;
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });

  await h.nav('schedules');
  ok('edit-entry', !!h.byAction('navigateToSystemSchedules'));
  h.clickAction('navigateToSystemSchedules');
  // 轮询等待 system schedules 面板真正渲染（导航 + 面板切换有时序）
  let panel = null;
  for (let i = 0; i < 20 && !panel; i++) {
    await h.wait(300);
    const p = document.getElementById('systemSchedulesPanel');
    if (p && p.querySelector('[data-action="addScheduleItem"]')) panel = p;
  }
  ok('panel-ready', !!panel);
  if (!panel) return { name: '05-schedules', passed: false, checks };

  // 清理残留：删除所有无 id 的未保存规则（它们不在服务器上，删除无害），
  // 使测试对脏环境鲁棒（历史测试中断可能留下空规则，保存时会被校验拦截）
  let guard = 0;
  while (guard++ < 20) {
    const items = store.state._scheduleFormItems;
    const unsavedIdx = items.findIndex(i => !i.id);
    if (unsavedIdx === -1) break;
    const rm = panel.querySelector('[data-action="removeScheduleItem"][data-index="' + unsavedIdx + '"]');
    if (!rm) break;
    rm.click();
    await h.wait(400);
  }
  ok('clean-start', store.state._scheduleFormItems.every(i => i.id));

  // 1. 添加规则并填写（新规则在 index 0；先填文本字段再改 type，避免 change 重建丢输入）
  const add = panel.querySelector('[data-action="addScheduleItem"]');
  ok('add-btn', !!add);
  if (!add) return { name: '05-schedules', passed: false, checks };
  add.click();
  await h.wait(600);
  const setVal = (sel, val) => { const el = panel.querySelector(sel); if (!el) return false; el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
  ok('fill-target', setVal('#sf_target_0', 'barackobama'));
  ok('fill-schedule', setVal('#sf_schedule_value_0', '3h'));
  const typeSel = panel.querySelector('#sf_type_0');
  ok('type-select', !!typeSel);
  if (typeSel) {
    typeSel.value = 'user';
    typeSel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await h.wait(1200);
  ok('rule-added', store.state._scheduleFormItems.length >= 1);

  // 2. 保存（真实新增 → POST）
  const saveBtn = () => panel.querySelector('[data-action="saveScheduleForm"]');
  ok('save-btn', !!saveBtn());
  if (!saveBtn()) return { name: '05-schedules', passed: false, checks };
  saveBtn().click();
  await h.wait(3000);
  ok('create-toast', (document.querySelector('.toast-message')?.textContent || '').includes('新增 1'));
  ok('rule-has-id', store.state._scheduleFormItems.some(i => i.id && i.target === 'barackobama'));

  // 3. 无变化再保存：no-op + dirty 清理（回归点）
  if (saveBtn()) {
    saveBtn().click();
    await h.wait(2500);
    ok('noop-toast', (document.querySelector('.toast-message')?.textContent || '').includes('无变化'));
    ok('dirty-cleared', store.state._scheduleFormDirty === false);
  }

  // 4. 删除规则并保存（DELETE）→ 环境还原
  const rm = panel.querySelector('[data-action="removeScheduleItem"][data-index="0"]');
  ok('remove-btn', !!rm);
  if (rm) {
    rm.click();
    await h.wait(500);
    if (saveBtn()) {
      saveBtn().click();
      await h.wait(3000);
      ok('delete-toast', (document.querySelector('.toast-message')?.textContent || '').includes('删除 1'));
    }
  }

  // 5. raw 编辑器（作用域限定在本面板）
  const advanced = [...panel.querySelectorAll('.mode-tab')].find(b => b.innerText.includes('高级'));
  ok('raw-tab', !!advanced);
  if (advanced) {
    advanced.click();
    await h.wait(1500);
    ok('raw-editor', !!panel.querySelector('#scheduleEditorContainer textarea'));
    const simple = [...panel.querySelectorAll('.mode-tab')].find(b => b.innerText.includes('简易'));
    if (simple) { simple.click(); await h.wait(800); }
  }
  return { name: '05-schedules', passed: checks.every(c => c.pass), checks };
})()
