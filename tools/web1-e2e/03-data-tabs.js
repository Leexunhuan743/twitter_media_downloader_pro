// 03-data-tabs: 数据页 6 tab 的 dataSubPage 切换
// 注意：每次点击后页面重建（changed.dataSubPage → render），必须重新获取 tab 元素
(async () => {
  const h = window.__e2e;
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });

  await h.nav('data');
  const expect = { Users: 'users', Lists: 'lists', 'User Entities': 'entities', 'List Entities': 'listEntities', 'User Links': 'userLinks', 'Previous Names': 'previousNames' };
  for (const [label, sub] of Object.entries(expect)) {
    const clicked = h.clickByText('#contentContainer .tab', label);
    await h.wait(600);
    ok('subpage:' + label, clicked && store.state.dataSubPage === sub);
  }
  // 搜索框存在 + 分页栏渲染
  ok('search-input', !!document.querySelector('#dbSearchInput') || !!document.querySelector('.search-input'));
  ok('pagination', h.vis(document.getElementById('dataPagination')) || document.querySelector('#dataPagination') !== null);
  return { name: '03-data-tabs', passed: checks.every(c => c.pass), checks };
})()
