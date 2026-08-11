(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const logNav = document.querySelector('.nav-item[data-page="logs"]');
  if (!logNav) return { passed: false, error: 'Logs navigation item not found' };

  logNav.click();
  await wait(600);

  const root = document.documentElement;
  const content = document.querySelector('.content');
  const filter = document.querySelector('.log-filter-bar');
  if (!content || !filter) return { passed: false, error: 'Logs layout not rendered' };

  const withinViewport = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= window.innerWidth + 1;
  };
  const checks = {
    documentFits: root.scrollWidth <= root.clientWidth + 1,
    contentFits: content.scrollWidth <= content.clientWidth + 1,
    filterFits: filter.scrollWidth <= filter.clientWidth + 1,
    controlsFit: [...filter.children].every(withinViewport),
  };

  return {
    passed: Object.values(checks).every(Boolean),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    dimensions: {
      document: [root.clientWidth, root.scrollWidth],
      content: [content.clientWidth, content.scrollWidth],
      filter: [filter.clientWidth, filter.scrollWidth],
    },
    checks,
  };
})();
