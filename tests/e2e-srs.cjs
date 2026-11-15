// Spaced repetition flashcards, cards-due widget, page-level PDF links, AI flashcards + "ask my notes".
module.exports = async ({ js, shot, check, sleep, errors, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path'), os = require('os'), wc = win.webContents;
  const deck = { title: 'Bio', cards: [{ q: 'Powerhouse of the cell?', a: 'Mitochondria' }, { q: 'DNA stands for?', a: 'Deoxyribonucleic acid' }, { q: 'Green pigment?', a: 'Chlorophyll' }], i: 0 };
  fs.writeFileSync(path.join(vault, 'Deck.md'), '# Deck\n\n```flash\n' + JSON.stringify(deck) + '\n```\n');
  fs.writeFileSync(path.join(vault, 'Pets.md'), '# Pets\n\nMy cat is named Biscuit and she weighs 4.2 kg. She was adopted in March.\n');
  await js(`window.__vault.reload()`); await sleep(900);
  await js(`window.__app.open('Deck.md')`); await sleep(1400);
  const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
  check('deck shows how many cards are due', /3 due/.test(await js(`document.querySelector('#view [data-study]').textContent`)));
  await click('#view [data-study]'); await sleep(300);
  check('study mode starts with a card to answer', await js(`!!document.querySelector('#view [data-show]')`));
  await click('#view [data-show]'); await sleep(300);
  check('after “Show answer” the grade buttons appear', (await js(`document.querySelectorAll('#view [data-g]').length`)) === 4);
  await click('#view [data-g="2"]'); await sleep(300);           // Good
  await click('#view [data-show]'); await sleep(200); await click('#view [data-g="0"]'); await sleep(300);    // Again -> comes back soon
  await click('#view [data-show]'); await sleep(200); await click('#view [data-g="3"]'); await sleep(300);    // Easy
  // finish remaining (again card + last one)
  for (let i = 0; i < 6 && (await js(`!!document.querySelector('#view [data-show]')`)); i++) { await click('#view [data-show]'); await sleep(150); await click('#view [data-g="2"]'); await sleep(250); }
  check('the session ends with a summary', await js(`/Session finished/.test(document.querySelector('#view').innerText)`), await js(`document.querySelector('#view .flash-done, #view .flash')?.innerText || ''`));
  await sleep(1200);
  const saved = fs.readFileSync(path.join(vault, 'Deck.md'), 'utf8');
  const m = /```flash\n([\s\S]*?)\n```/.exec(saved); const cards = JSON.parse(m[1]).cards;
  check('review results are saved with due dates', cards.every(c => c.due && c.reps >= 1), JSON.stringify(cards.map(c => [c.due, c.ivl, c.reps])));
  check('a due card is scheduled in the future after a good answer', cards.some(c => c.ivl >= 1));
  await shot('101-srs-done');

  // widget
  const wtxt = await js(`(async () => { const { WIDGETS } = await import('./js/widgets.js'); const d = document.createElement('div'); WIDGETS.cards.render(d, { cfg: {} }); return d.innerText; })()`);
  check('the “Flashcards due” widget lists the deck', /Bio/.test(wtxt) && /due today/.test(wtxt), wtxt.slice(0, 120));

  // page-level PDF link
  const { BrowserWindow } = require('electron'); const w = new BrowserWindow({ show: false });
  await w.loadURL('data:text/html,' + encodeURIComponent('<html><body><h1>Page one</h1><div style="page-break-after:always">first</div><h1>Page two</h1><p>second page text</p></body></html>'));
  const pdf = await w.webContents.printToPDF({}); w.destroy(); const fp = path.join(os.tmpdir(), 'two-page.pdf'); fs.writeFileSync(fp, pdf);
  await js(`window.api.doc.import('', ${JSON.stringify([fp])})`); await js(`window.__vault.reload()`); await sleep(800);
  fs.writeFileSync(path.join(vault, 'Cite.md'), '# Cite\n\nSee [[two-page.pdf#page=2|two-page p.2]] for details.\n');
  await js(`window.__vault.reload()`); await sleep(700); await js(`window.__app.open('Cite.md')`); await sleep(1300);
  const lr = await js(`(() => { const r = document.querySelector('#view a.wikilink').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), t: document.querySelector('#view a.wikilink').textContent }; })()`);
  check('the page link shows its short label', /p\.2/.test(lr.t), lr.t);
  wc.sendInputEvent({ type: 'mouseMove', x: lr.x, y: lr.y }); await sleep(100); wc.sendInputEvent({ type: 'mouseDown', x: lr.x, y: lr.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: lr.x, y: lr.y, button: 'left', clickCount: 1 }); await sleep(2000);
  check('clicking it opens the PDF at that page', await js(`window.__app.state.view.type === 'doc' && window.__app.state.view.page === 2 && /#page=2$/.test(document.querySelector('#view iframe').src)`), await js(`document.querySelector('#view iframe')?.src`));

  // AI
  const up = await fetch('http://127.0.0.1:11434/api/tags').then(r => r.ok).catch(() => false);
  if (up) {
    const waitIdle = async () => { const t0 = Date.now(); await sleep(900); while (Date.now() - t0 < 240000 && (await js(`document.getElementById('aipanel').classList.contains('busy')`))) await sleep(700); };
    const ask = async (q) => { await js(`(() => { const ta = document.querySelector('#aipanel textarea'); ta.value = ${JSON.stringify(q)}; ta.dispatchEvent(new Event('input')); document.querySelector('#aipanel [data-send]').click(); })()`); await waitIdle(); };
    await js(`window.__app.open('Pets.md')`); await sleep(1200);
    await js(`document.querySelector('#topbar [data-t=ai]').click()`); await sleep(1500);
    await ask('Using my notes, what is my cat called and how heavy is she?');
    const ans = await js(`(() => { const m = [...document.querySelectorAll('#aipanel .ai-m.bot')]; return m[m.length - 1].innerText; })()`);
    check('“ask my notes” finds the answer in another page', /Biscuit/i.test(ans) && /4\.2/.test(ans), ans.slice(0, 200));
    await js(`window.__app.open('Deck.md')`); await sleep(1000);
    await js(`[...document.querySelectorAll('#aipanel .ai-chip')].find(b => /Flashcards/.test(b.textContent)).click()`); await waitIdle();
    const add = await js(`!![...document.querySelectorAll('#aipanel .ai-m.bot:last-child [data-add]')].find(b => /flashcards/i.test(b.textContent))`);
    check('AI makes flashcards you can add to the page', add, await js(`(() => { const m = [...document.querySelectorAll('#aipanel .ai-m.bot')]; return m[m.length - 1].innerText.slice(0, 200); })()`));
    if (add) { const n0 = await js(`document.querySelectorAll('#view .blk').length`); await js(`[...document.querySelectorAll('#aipanel .ai-m.bot:last-child [data-add]')].find(b => /flashcards/i.test(b.textContent)).click()`); await sleep(800); check('…and they are added', (await js(`document.querySelectorAll('#view .blk').length`)) > n0); }
  }
  check('no console errors', errors.length === 0, errors.join(' | '));
};
