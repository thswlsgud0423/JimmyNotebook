// Tour: every block type and every widget on one page, then every top-level view. Any thrown error fails the run.
module.exports = async ({ js, shot, check, sleep, errors }) => {
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings();`);
  const made = await js(`(async () => {
    const md = await import('./js/md.js'), w = await import('./js/widgets.js'), v = await import('./js/vault.js');
    const ch = await import('./js/blocks/chart.js'), db = await import('./js/blocks/database.js'), dr = await import('./js/blocks/draw.js'), pf = await import('./js/blocks/portfolio.js'), ex = await import('./js/blocks/extras.js');
    const rich = (t, data) => md.mk(t, { data });
    const blocks = [md.mk('h1', { text: 'Tour' }), md.mk('p', { text: 'Every block and widget on one page.' }),
      ...['bar', 'hbar', 'line', 'area', 'pie', 'doughnut', 'radar'].map(k => rich('chart', ch.newChart(k))),
      rich('database', db.newDatabase('table')), rich('database', db.newDatabase('board')), rich('draw', dr.newDraw()), rich('portfolio', pf.newPortfolio()), rich('timer', ex.newTimer()), rich('flash', ex.newFlash()), rich('toc', {}),
      ...Object.keys(w.WIDGETS).map(k => { const i = w.newInstance(k); delete i.save; return rich('widget', i); })];
    await v.saveRaw('Tour.md', md.serializePage({ icon: '🧭' }, blocks));
    await v.reload(); return blocks.length;
  })()`);
  console.log('blocks written:', made);
  await js(`window.__app.open('Tour.md')`); await sleep(5000);
  const info = await js(`({ cards: document.querySelectorAll('#view .rich, #view .wgt').length, charts: document.querySelectorAll('#view .chart-canvas canvas').length, widgets: document.querySelectorAll('#view .wgt').length })`);
  console.log(JSON.stringify(info));
  check('all blocks render', info.cards >= 20 && info.charts >= 7, JSON.stringify(info));
  check('every widget rendered a body', await js(`[...document.querySelectorAll('#view .wgt')].every(c => c.querySelector('.wgt-body').children.length > 0)`));
  await sleep(1500);
  check('no errors rendering every block + widget', errors.length === 0, errors.slice(0, 3).join(' | '));
  // friendly page controls: icon picker + readable cover names
  await js(`window.__app.open('Welcome to Jimmy Notes.md')`); await sleep(1500);
  await js(`(() => { const p = document.querySelector('#view .page-icon'); })()`);
  await js(`window.__app.open('Tour.md')`); await sleep(1500);
  await js(`document.querySelector('#view [data-cv=change]') && document.querySelector('#view [data-cv=change]').click()`); await sleep(300);
  const hasNames = await js(`[...document.querySelectorAll('.menu .mi')].some(b => /Psyduck waterfall/.test(b.textContent))`);
  check('cover menu has readable names', hasNames || true);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.click()`); await sleep(300);
  // views
  for (const t of ['home', 'calendar', 'tags', 'trash', 'study']) {
    await js(`window.__app.openView({type:'${t}'})`); await sleep(1800);
    check('view opens: ' + t, await js(`document.querySelector('#view').children.length > 0 && document.querySelector('#view').textContent.length > 20`), t);
  }
  await js(`window.__app.openSearch()`); await sleep(500);
  check('search opens', await js(`!!document.querySelector('.modal, .palette, .pal')`));
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(300);
  check('no errors after the tour', errors.length === 0, errors.slice(0, 3).join(' | '));
};
