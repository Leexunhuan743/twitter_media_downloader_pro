// 08-theme-switch: 主题切换器往返（web1 → web2 → web1）
// 注意：切换后页面重载，evaluate 上下文销毁——每个阶段必须是独立的 browser run，
// 本文件只负责"从当前主题打开切换器并切到另一主题"（由 run-all 分阶段调用或手动两段跑）
(async () => {
  const h = window.__e2e;
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });

  ok('ts-toggle', !!document.querySelector('#ts-toggle'));
  const toggle = document.querySelector('#ts-toggle');
  if (!toggle) return { name: '08-theme-switch', passed: false, checks };

  toggle.click();
  await h.wait(800);
  const panel = document.querySelector('#ts-panel');
  ok('panel-open', panel.classList.contains('open'));
  const opts = [...document.querySelectorAll('#ts-list .ts-opt')];
  ok('options', opts.length >= 2 && opts.some(o => o.textContent.includes('web1')) && opts.some(o => o.textContent.includes('web2')));

  // 点击"另一个"主题（当前是 web1 就点 web2；是 web2 就点 web1），随后页面会重载
  const current = (document.querySelector('#ts-current')?.textContent || '').match(/web\d/)?.[0] || '';
  const target = current === 'web1' ? 'web2' : 'web1';
  const targetOpt = opts.find(o => o.textContent.includes(target));
  ok('target-' + target, !!targetOpt);
  if (targetOpt) targetOpt.click();
  return { name: '08-theme-switch', passed: checks.every(c => c.pass), checks, reloading: !!targetOpt };
})()
