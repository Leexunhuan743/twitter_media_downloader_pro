// web1 浏览器 E2E 套件入口 —— 在 xd://browser 的 run code 中执行：
//
// 前提：
// 1. 隔离实例已启动（见 README：TMD_DEV=1 + 端口 25557，勿连生产 25556）
// 2. 浏览器已打开 http://127.0.0.1:25557/ 并完成 API Key 登录（authOverlay 消失）
// 3. 主题处于 web1（08 号测试会切换到 web2 再切回）
//
// 用法（替换路径中的用户名为实际仓库路径）：
//   (async () => {
//     const fs = await import('node:fs');
//     const code = fs.readFileSync('C:/.../tools/web1-e2e/run-all.js', 'utf8');
//     return await eval(code);
//   })()
//
// 输出：JSON 报告 { results: [{ name, passed, checks }], allPassed, total, failed }
(async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = process.env.TMD_WEB1_E2E_DIR || 'C:/Users/leeexx/Documents/NewProject/tmd/tools/web1-e2e';
  const helperSrc = fs.readFileSync(path.join(dir, 'helpers.js'), 'utf8');

  // 自动接受 confirm（如 raw 编辑器的"未保存修改"确认），避免阻塞 evaluate
  page.on('dialog', d => d.accept().catch(() => {}));

  // 08 主题切换会重载页面，最后跑并在结束后把主题切回 web1
  const files = ['01-navigation.js', '02-system-tabs.js', '03-data-tabs.js', '04-task-tabs.js', '05-schedules.js', '06-logs.js', '07-drawer-a11y.js', '09-task-lifecycle.js', '08-theme-switch.js'];
  const results = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    // 每次独立 evaluate：注入 helpers（覆盖旧实例）再执行测试；捕获抛出的异常为失败
    const code = helperSrc + '\n' + ';' + src;
    try {
      const r = await tab.evaluate(code);
      results.push({ file: f, ...r });
    } catch (e) {
      results.push({ file: f, name: f.replace('.js', ''), passed: false, checks: [{ name: 'exec', pass: false, error: String(e).slice(0, 300) }] });
    }
    // 08 触发重载后等待页面恢复
    if (f === '08-theme-switch.js') {
      await new Promise(res => setTimeout(res, 3500));
      // 若切到了 web2，用后端 API 直接切回 web1（避免再跑一轮切换器）
      const theme = await tab.evaluate(async () => {
        try {
          const res = await fetch('/api/v1/config/theme');
          const j = await res.json();
          return j?.data?.theme || 'unknown';
        } catch (e) { return 'error:' + e.message; }
      }).catch(() => 'context-destroyed');
      if (theme && theme !== 'web1' && !String(theme).startsWith('error')) {
        await tab.evaluate(async () => {
          await fetch('/api/v1/config/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'web1' }) });
        }).catch(() => {});
        await new Promise(res => setTimeout(res, 2500));
      }
      await tab.goto('http://127.0.0.1:25557/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' }).catch(() => {});
      await new Promise(res => setTimeout(res, 2500));
    }
  }
  const failed = results.filter(r => !r.passed);
  return { results, allPassed: failed.length === 0, total: results.length, failedCount: failed.length };
})()
