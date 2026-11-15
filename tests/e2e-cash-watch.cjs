module.exports = async ({ js, shot, check, sleep, errors, key, type, win, vault }) => {
  const fs = require('fs'), path = require('path');
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings();`);

  // ---------- dialogs return the OK value (regression: OK used to resolve as cancelled) ----------
  const pr = await js(`(async () => { const ui = await import('./js/ui.js'); const p = ui.promptDialog('Test prompt', 'abc'); await new Promise(r => setTimeout(r, 200)); document.querySelector('.modal input').value = 'hello'; document.querySelector('.modal [data-a=ok]').click(); return await p; })()`);
  check('promptDialog returns the typed value on OK', pr === 'hello', String(pr));
  const cf = await js(`(async () => { const ui = await import('./js/ui.js'); const p = ui.confirmDialog('Sure?'); await new Promise(r => setTimeout(r, 200)); document.querySelector('.modal [data-a=ok]').click(); return await p; })()`);
  check('confirmDialog returns true on OK', cf === true, String(cf));
  const cc = await js(`(async () => { const ui = await import('./js/ui.js'); const p = ui.confirmDialog('Sure?'); await new Promise(r => setTimeout(r, 200)); document.querySelector('.modal [data-a=c]').click(); return await p; })()`);
  check('confirmDialog returns false on Cancel', cc === false, String(cc));
  // UI-level: delete a page through the real menu + confirm
  await js(`(async () => { await window.__vault.createPage('', 'Delete me'); window.__app.open('Delete me.md'); })()`); await sleep(1200);
  await js(`document.querySelector('#topbar [data-t=more]').click()`); await sleep(300);
  await js(`[...document.querySelectorAll('.menu .mi')].find(b => /Delete page/.test(b.textContent)).click()`); await sleep(500);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(1200);
  check('Delete page (menu + confirm) really deletes', !fs.existsSync(path.join(vault, 'Delete me.md')) && fs.existsSync(path.join(vault, '.trash')));

  // ---------- cash in the portfolio ----------
  await js(`window.__app.open('Investment Portfolio.md')`); await sleep(5000);
  await js(`document.querySelector('#view [data-addcash]').click()`); await sleep(500);
  check('cash row exists', await js(`!!document.querySelector('#view tr.cashrow input[data-ci]')`));
  const total0 = await js(`document.querySelector('#view .pf-top .stat b').textContent`);
  await js(`(() => { const i = document.querySelector('#view tr.cashrow input[data-ci]'); i.focus(); i.select(); })()`);
  await type('5000'); await sleep(900);
  const tiles = await js(`[...document.querySelectorAll('#view .pf-top .stat')].map(s => s.textContent.replace(/\\s+/g, ' ')).join(' | ')`);
  console.log('tiles:', tiles);
  check('Cash tile shows the balance', /\$5,000/.test(tiles) && /Cash/.test(tiles), tiles);
  const total1 = await js(`document.querySelector('#view .pf-top .stat b').textContent`);
  check('total value now includes cash', total0 !== total1, total0 + ' -> ' + total1);
  check('pie includes a Cash slice', await js(`(() => { const c = window.Chart.getChart(document.querySelector('#view .pie-area canvas')); return !!c && c.data.labels.includes('Cash'); })()`));
  // add a second cash row in another currency
  await js(`document.querySelector('#view [data-addcash]').click()`); await sleep(500);
  check('+ Cash adds a row', await js(`document.querySelectorAll('#view tr.cashrow').length === 2`));
  await js(`(() => { const s = document.querySelectorAll('#view .cursel')[1]; s.value = 'KRW'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(2500);
  await js(`(() => { const i = document.querySelectorAll('#view tr.cashrow input[data-ci]')[1]; i.focus(); i.select(); })()`);
  await type('1000000'); await sleep(900);
  const row2 = await js(`document.querySelectorAll('#view tr.cashrow')[1].textContent.replace(/\\s+/g, ' ')`);
  console.log('KRW row:', row2);
  check('KRW cash converted to base currency', /\$[\d,]+/.test(row2) && !/–/.test(row2.split('1000000')[1] || ''), row2);
  await shot('130-portfolio-cash');
  await sleep(1200);
  const src = fs.readFileSync(path.join(vault, 'Investment Portfolio.md'), 'utf8');
  check('cash saved in the markdown file', /"cur":"USD","amount":5000/.test(src) && /"cur":"KRW","amount":1000000/.test(src));

  // ---------- watchlist: performance since added ----------
  await js(`window.__app.newPage('')`); await sleep(900);
  await type('Watch test'); await key('Enter'); await sleep(200);
  await type('/watchlist'); await sleep(400); await key('Enter'); await sleep(4500);
  check('watchlist starts empty (no sample tickers)', await js(`document.querySelectorAll('#view .wl td.since').length === 0`));
  for (const sym of ['AAPL', 'VOO', 'BTC-USD']) {
    await js(`(() => { const i = document.querySelector('#view .t-widget input'); i.value = '${sym}'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); await sleep(2200);
  }
  await sleep(2500);
  check('watchlist widget renders with since-added column', await js(`document.querySelectorAll('#view .wl td.since').length >= 3`));
  const items = await js(`(async () => { await new Promise(r => setTimeout(r, 300)); const t = document.querySelector('#view .t-widget'); return 1; })()`);
  await sleep(500);
  await sleep(1200);
  console.log('files:', fs.readdirSync(vault).join(' | ')); const f = fs.readdirSync(vault).find(n => /Watch/i.test(n)) || fs.readdirSync(vault).find(n => /Untitled/.test(n));
  let saved = fs.readFileSync(path.join(vault, f), 'utf8');
  const m = saved.match(/```widget\n([\s\S]*?)\n```/); const w = JSON.parse(m[1]);
  console.log('items:', JSON.stringify(w.cfg.items.slice(0, 2)));
  check('each ticker stores added-date + starting price', w.cfg.items.length >= 3 && w.cfg.items.every(i => i.added && i.base > 0));
  const sinceTxt = await js(`document.querySelector('#view .wl td.since').textContent.replace(/\\s+/g, ' ')`);
  check('since-added shows 0.00% right after adding', /0\.00%|\+0\.0|−0\.0|-0\.0/.test(sinceTxt) || /[+-]?0\.\d\d%/.test(sinceTxt), sinceTxt);
  // back-date AAPL by 30 days → baseline comes from historical close
  await js(`document.querySelector('#view .wl td.since').click()`); await sleep(400);
  await js(`[...document.querySelectorAll('.menu .mi')].find(b => /Set start date/.test(b.textContent)).click()`); await sleep(500);
  const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  await js(`(() => { const i = document.querySelector('.modal input'); i.value = '${d30}'; })()`);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(4000);
  const sinceTxt2 = await js(`document.querySelector('#view .wl td.since').textContent.replace(/\\s+/g, ' ')`);
  console.log('after back-dating:', sinceTxt2);
  check('back-dated start uses historical price (≥29 days tracked)', /\b(29|30|31|32)d\b/.test(sinceTxt2) && !/ 0d /.test(sinceTxt2), sinceTxt2);
  await js(`document.querySelector('#view [data-chart]').click()`); await sleep(5000);
  check('performance chart draws lines', await js(`(() => { const c = window.Chart.getChart(document.querySelector('#view .wl-chart canvas')); return !!c && c.data.datasets.length >= 2 && c.data.datasets[0].data.length > 5; })()`));
  await js(`document.querySelector('#view .t-widget').scrollIntoView({block:'start'})`); await sleep(600);
  await shot('131-watchlist-performance');
};
