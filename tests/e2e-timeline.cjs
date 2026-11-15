// Timeline = zoomable mind-map canvas: create, add connected ideas, edit, zoom/pan/drag with the REAL mouse, present, save/reload.
module.exports = async ({ js, shot, check, sleep, errors, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path'), wc = win.webContents;
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings();`);
  await js(`window.__app.openView({ type: 'home' })`); await sleep(700);
  check('the sidebar has a New timeline button', await js(`!!document.querySelector('[data-act=newtimeline]')`));
  check('the graph view is gone', !(await js(`!!document.querySelector('[data-nav=graph],[data-go=graph]')`)) && !(await js(`window.__app.commands().some(c => /graph/i.test(c.name))`)));
  await js(`document.querySelector('[data-act=newtimeline]').click()`); await sleep(500);
  await js(`(() => { const i = document.querySelector('.modal input'); i.value = 'Learning log'; document.querySelector('.modal [data-a=ok]').click(); })()`); await sleep(1800);
  check('a timeline page is created and opened', await js(`!!document.querySelector('#view .tlc')`) && fs.existsSync(path.join(vault, 'Learning log.md')));
  check('the root title node is shown', (await js(`document.querySelector('#view .tlc-node.root').textContent`)).includes('Learning log'));

  const names = () => js(`[...document.querySelectorAll('#view .tlc-node:not(.root) .tl-title')].map(e => e.textContent)`);
  const setText = (i, t) => js(`(() => { const e = document.querySelectorAll('#view .tlc-node:not(.root) .tl-title')[${i}]; e.textContent = ${JSON.stringify(t)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  // add: first from the toolbar, then children with the "+" handle
  await js(`document.querySelector('#view .tlc [data-t=add]').click()`); await sleep(500);
  await setText(0, 'Calculus');
  await js(`document.querySelectorAll('#view .tlc-node:not(.root) .tlc-plus')[0].click()`); await sleep(500);
  await setText(1, 'Derivatives');
  await js(`document.querySelectorAll('#view .tlc-node:not(.root) .tlc-plus')[0].click()`); await sleep(500);
  await setText(2, 'Integrals');
  await js(`document.querySelectorAll('#view .tlc-node:not(.root) .tlc-plus')[1].click()`); await sleep(500);
  await setText(3, 'Chain rule');
  check('four ideas exist', JSON.stringify(await names()) === '["Calculus","Derivatives","Integrals","Chain rule"]', JSON.stringify(await names()));
  const geo = () => js(`(() => { const o = {}; document.querySelectorAll('#view .tlc-node:not(.root)').forEach(n => { o[n.querySelector('.tl-title').textContent] = [parseFloat(n.style.left), parseFloat(n.style.top)]; }); return o; })()`);
  let g = await geo();
  check('it is a horizontal tree (children sit to the right of their parent)', g['Derivatives'][0] > g['Calculus'][0] && g['Chain rule'][0] > g['Derivatives'][0] && g['Integrals'][0] === g['Derivatives'][0], JSON.stringify(g));
  check('every link has a curve drawn', (await js(`document.querySelectorAll('#view .tlc-edges path').length`)) === 4);
  await js(`document.querySelector('#view .tlc [data-t=tidy]').click()`); await sleep(900);
  await shot('90-timeline-tree');

  // zoom with the real mouse wheel (zooms around the pointer), pan by dragging empty space
  const rect = await js(`(() => { const r = document.querySelector('#view .tlc').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const cx = Math.round(rect.x + rect.w / 2), cy = Math.round(rect.y + rect.h * 0.8);
  const k0 = await js(`document.querySelector('#view .tlc-zoom').textContent`);
  wc.sendInputEvent({ type: 'mouseMove', x: cx, y: cy });
  for (let i = 0; i < 5; i++) { wc.sendInputEvent({ type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: -120, canScroll: true }); await sleep(60); }
  await sleep(300);
  const kOut = await js(`document.querySelector('#view .tlc-zoom').textContent`);
  check('mouse wheel zooms the canvas', parseInt(kOut) < parseInt(k0), k0 + ' -> ' + kOut);
  for (let i = 0; i < 12; i++) { wc.sendInputEvent({ type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 120, canScroll: true }); await sleep(40); }
  await sleep(300);
  const kIn = await js(`document.querySelector('#view .tlc-zoom').textContent`);
  check('…and zooms back in', parseInt(kIn) > parseInt(kOut), kOut + ' -> ' + kIn);
  const wt = () => js(`document.querySelector('#view .tlc-world').style.transform`);
  const before = await wt();
  const ex = Math.round(rect.x + rect.w - 40), ey = Math.round(rect.y + rect.h - 60);
  wc.sendInputEvent({ type: 'mouseMove', x: ex, y: ey }); wc.sendInputEvent({ type: 'mouseDown', x: ex, y: ey, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) { wc.sendInputEvent({ type: 'mouseMove', x: ex - i * 12, y: ey - i * 6, modifiers: ['leftButtonDown'] }); await sleep(20); }
  wc.sendInputEvent({ type: 'mouseUp', x: ex - 96, y: ey - 48, button: 'left', clickCount: 1 }); await sleep(300);
  check('dragging empty space pans the canvas', (await wt()) !== before, before + ' | ' + (await wt()));

  // fit, then drag a card by its header: it moves and its saved position changes
  await js(`document.querySelector('#view .tlc [data-t=fit]').click()`); await sleep(700);
  const nb = await js(`(() => { const n = document.querySelectorAll('#view .tlc-node:not(.root)')[1]; const r = n.querySelector('.tl-sp').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: parseFloat(n.style.left), top: parseFloat(n.style.top) }; })()`);
  const sx = Math.round(nb.x), sy = Math.round(nb.y);
  wc.sendInputEvent({ type: 'mouseMove', x: sx, y: sy }); wc.sendInputEvent({ type: 'mouseDown', x: sx, y: sy, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) { wc.sendInputEvent({ type: 'mouseMove', x: sx + i * 6, y: sy + i * 8, modifiers: ['leftButtonDown'] }); await sleep(20); }
  wc.sendInputEvent({ type: 'mouseUp', x: sx + 48, y: sy + 64, button: 'left', clickCount: 1 }); await sleep(400);
  const na = await js(`(() => { const n = document.querySelectorAll('#view .tlc-node:not(.root)')[1]; return { left: parseFloat(n.style.left), top: parseFloat(n.style.top) }; })()`);
  check('dragging a card moves it', na.left !== nb.left && na.top !== nb.top, JSON.stringify([nb, na]));

  // re-connect: move "Chain rule" under "Integrals"
  await js(`(() => { const n = [...document.querySelectorAll('#view .tlc-node:not(.root)')].find(x => x.querySelector('.tl-title').textContent === 'Chain rule'); n.querySelector('[data-a=move]').click(); })()`); await sleep(300);
  await js(`[...document.querySelectorAll('#view .tlc-node:not(.root)')].find(x => x.querySelector('.tl-title').textContent === 'Integrals').click()`); await sleep(500);
  g = await geo();
  check('re-connecting moved it under the new parent', g['Chain rule'][0] > g['Integrals'][0], JSON.stringify(g));

  // present mode flies card to card
  await js(`document.querySelector('#view .tlc [data-t=play]').click()`); await sleep(1200);
  check('present mode highlights the first card', (await js(`document.querySelector('#view .tlc-node.cur .tl-title').textContent`)) === 'Calculus');
  await js(`document.querySelector('#view .tlc [data-t=next]').click()`); await sleep(1000);
  check('next moves to the following card', (await js(`document.querySelector('#view .tlc-node.cur .tl-title').textContent`)) !== 'Calculus');
  await shot('91-timeline-present');
  await js(`document.querySelector('#view .tlc [data-t=stop]').click()`); await sleep(500);
  check('exit leaves present mode', await js(`!document.querySelector('#view .tlc').classList.contains('present')`));

  // delete a middle card: its children move up
  await js(`(() => { const n = [...document.querySelectorAll('#view .tlc-node:not(.root)')].find(x => x.querySelector('.tl-title').textContent === 'Integrals'); n.querySelector('[data-a=del]').click(); })()`); await sleep(500);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(600);
  check('deleting a card keeps its children', JSON.stringify(await names()) === '["Calculus","Derivatives","Chain rule"]', JSON.stringify(await names()));

  // saved as a normal .md file and reloads identically (positions included)
  await sleep(1500);
  const src = fs.readFileSync(path.join(vault, 'Learning log.md'), 'utf8');
  check('saved in the .md file', /```timeline/.test(src) && /Chain rule/.test(src) && /"parent"/.test(src) && /"x"/.test(src), src.slice(0, 200));
  await js(`window.__app.openView({ type: 'home' })`); await sleep(500);
  await js(`window.__app.open('Learning log.md')`); await sleep(1500);
  check('reopening shows the same cards', JSON.stringify(await names()) === '["Calculus","Derivatives","Chain rule"]', JSON.stringify(await names()));

  // also in the command palette
  const cmds = await js(`window.__app.commands().map(c => c.name)`);
  check('“New timeline” is in the command palette', cmds.includes('New timeline'));
  check('no console errors', errors.length === 0, errors.join(' | '));
};
