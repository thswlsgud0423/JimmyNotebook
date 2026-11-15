// Blocks: click-select, Backspace delete, drag, copy/paste of charts + images, pasting screenshots, reordering pages.
module.exports = async ({ js, shot, check, sleep, errors, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path'), { clipboard } = require('electron');
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings();`);
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  fs.mkdirSync(path.join(vault, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(vault, 'assets', 'pic.png'), Buffer.from(PNG, 'base64'));
  fs.writeFileSync(path.join(vault, 'Blocks2.md'), '# Blocks2\n\nintro text\n\n```chart\n' + JSON.stringify({ kind: 'bar', title: 'Sales', labels: ['a', 'b'], series: [{ name: 'x', values: [1, 2] }] }) + '\n```\n\n![](assets/pic.png)\n\nend\n');
  await js(`window.__vault.reload()`); await sleep(900);
  await js(`window.__app.open('Blocks2.md')`); await sleep(1400);

  const types = () => js(`[...document.querySelectorAll('#view > .page .blk, #view .blk')].filter(b => b.parentElement && b.parentElement.closest('.blk') === null).map(b => b._blk.type).join(',')`);
  const blk = (t) => `[...document.querySelectorAll('#view .blk')].find(b => b._blk.type === '${t}')`;
  const press = (k, extra = {}) => js(`(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }, ${JSON.stringify(extra)})))`);
  const clickBlk = (t, inner, up = true) => js(`(() => { const b = ${blk(t)}; const el = ${inner ? `b.querySelector('${inner}')` : 'b'}; el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); ${up ? `el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));` : ''} })()`);
  const clipTypes = async () => { const it = await clipboard.read(); return it.length ? it[0].types : []; };
  const clipPng = async () => { const it = await clipboard.read(); if (!it.length || !it[0].types.includes('image/png')) return 0; return (await it[0].getType('image/png')).size; };
  const clipText = async () => { const it = await clipboard.read(); if (!it.length || !it[0].types.includes('text/plain')) return ''; return await (await it[0].getType('text/plain')).text(); };
  const pasteFile = (sel, extra) => js(`(() => { const dt = new DataTransfer(); const bytes = Uint8Array.from(atob('${PNG}'), c => c.charCodeAt(0)); dt.items.add(new File([bytes], 'shot.png', { type: 'image/png' })); ${extra || ''} const el = ${sel}; el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);

  const t0 = await types();
  check('page has chart and image', /chart/.test(t0) && /image/.test(t0), t0);

  // 1. click a chart -> it is selected; Backspace deletes it; Ctrl+Z brings it back
  await clickBlk('chart', 'canvas'); await sleep(300);
  check('clicking a chart selects it', await js(`${blk('chart')}.classList.contains('sel')`));
  await shot('80-chart-selected');
  await press('Backspace'); await sleep(500);
  check('Backspace deletes the selected chart', !/chart/.test(await types()), await types());
  await press('z', { ctrlKey: true }); await sleep(600);
  check('Ctrl+Z brings it back', /chart/.test(await types()), await types());

  // 2. same for an image
  await clickBlk('image', 'img'); await sleep(300);
  check('clicking an image selects it', await js(`${blk('image')}.classList.contains('sel')`));
  await press('Delete'); await sleep(500);
  check('Delete removes the selected image', !/image/.test(await types()), await types());
  await press('z', { ctrlKey: true }); await sleep(600);
  check('and undo restores it', /image/.test(await types()));

  // 3. drag with the REAL mouse: the chart by its body, a paragraph by its grip, a code snippet by its bar
  const wc = win.webContents;
  const rectOf = (sel, scroll = false) => js(`(() => { const el = ${sel}; ${scroll ? "el.scrollIntoView({ block: 'center' });" : ''} const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), l: Math.round(r.left), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width) }; })()`);
  const realDrag = async (from, toY, toX) => {
    wc.sendInputEvent({ type: 'mouseMove', x: from.x, y: from.y }); await sleep(120);
    wc.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 }); await sleep(120);
    const steps = 14; for (let i = 1; i <= steps; i++) { wc.sendInputEvent({ type: 'mouseMove', x: from.x + (toX - from.x) * i / steps, y: from.y + (toY - from.y) * i / steps, button: 'left' }); await sleep(35); }
    wc.sendInputEvent({ type: 'mouseUp', x: toX, y: toY, button: 'left', clickCount: 1 }); await sleep(900);
  };
  const lastP = `(() => { const ps = [...document.querySelectorAll('#view .blk')].filter(x => x._blk.type === 'p'); return ps[ps.length - 1]; })()`;
  await js(`document.querySelector('#view').scrollTop = 0`); await sleep(400);
  const chartCv = `${blk('chart')}.querySelector('canvas')`;
  let from = await rectOf(chartCv); let to = await rectOf(lastP);
  console.log('drag from', JSON.stringify(from), 'to', JSON.stringify(to));
  await realDrag(from, to.b - 3, to.l + 60);
  let t1 = (await types()).split(',');
  check('dragging a chart by its body with the mouse moves it', t1[t1.length - 1] === 'chart', t1.join(','));
  await shot('83-after-drag');

  // by the grip
  await js(`document.querySelector('#view').scrollTop = 0`); await sleep(300);
  await js(`${blk('image')}.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`);
  let grip = await rectOf(`${blk('image')}.querySelector('.blk-handle .drag')`);
  const firstP = await rectOf(`[...document.querySelectorAll('#view .blk')].find(x => x._blk.type === 'p')`);
  console.log('grip', JSON.stringify(grip), 'firstP', JSON.stringify(firstP));
  await realDrag(grip, firstP.t + 2, firstP.l + 80);
  const t2 = (await types()).split(',');
  check('dragging the grip moves the image above the first paragraph', t2.indexOf('image') < t2.indexOf('p') || t2[1] === 'image', t2.join(','));

  // 4. copy a chart -> system clipboard has an image AND the block text; paste gives a chart, not a picture
  await clickBlk('chart', 'canvas'); await sleep(200);
  clipboard.clear();
  await press('c', { ctrlKey: true }); await sleep(700);
  check('Ctrl+C on a chart puts a picture on the clipboard', (await clipPng()) > 100, JSON.stringify(await clipTypes()));
  check('…and its block text', /```chart/.test(await clipText()));
  const nChart = await js(`[...document.querySelectorAll('#view .blk')].filter(b => b._blk.type === 'chart').length`);
  win.focus(); win.webContents.focus(); await sleep(300);          // the clipboard API needs the window focused (it always is for a real user)
  await press('v', { ctrlKey: true }); await sleep(900);
  check('Ctrl+V after that pastes a second chart (not a picture)', (await js(`[...document.querySelectorAll('#view .blk')].filter(b => b._blk.type === 'chart').length`)) === nChart + 1 && !/image,.*image/.test(await types()), await types());

  // 5. copy an image block -> picture on the clipboard
  await clickBlk('image', 'img'); await sleep(200);
  clipboard.clear();
  await press('c', { ctrlKey: true }); await sleep(700);
  check('Ctrl+C on an image puts the image on the clipboard', (await clipPng()) > 20, String(await clipPng()));

  // 6. pasting a screenshot / copied image
  const imgCount = () => js(`[...document.querySelectorAll('#view .blk')].filter(b => b._blk.type === 'image').length`);
  const before = await imgCount();
  await js(`(() => { const ps = [...document.querySelectorAll('#view .blk')].filter(x => x._blk.type === 'p'); const el = ps[ps.length - 1].querySelector('[data-txt]'); el.focus(); })()`);
  await pasteFile(`document.activeElement`); await sleep(1200);
  check('pasting an image while typing adds an image block', (await imgCount()) === before + 1, String(await imgCount()));
  check('…and saves it in assets/', fs.readdirSync(path.join(vault, 'assets')).some(f => /shot/.test(f)), fs.readdirSync(path.join(vault, 'assets')).join(','));

  await clickBlk('chart', 'canvas'); await sleep(200);
  await pasteFile(`document.activeElement`); await sleep(1200);
  check('pasting an image while a chart is selected adds it below the chart', (await imgCount()) === before + 2, String(await imgCount()));

  await js(`document.querySelector('#sidebar').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
  await js(`document.activeElement && document.activeElement.blur()`); await sleep(200);
  await pasteFile(`document.body`); await sleep(1200);
  check('pasting an image with nothing focused still adds it', (await imgCount()) === before + 3, String(await imgCount()));

  const n3 = await imgCount();
  await js(`(() => { const ps = [...document.querySelectorAll('#view .blk')].filter(x => x._blk.type === 'p'); ps[ps.length - 1].querySelector('[data-txt]').focus(); })()`);
  await pasteFile(`document.activeElement`, `dt.setData('text/plain', 'cell text');`); await sleep(700);
  check('copied cells (text + picture) paste as text, not as an image', (await imgCount()) === n3 && /cell text/.test(await js(`document.body.innerText`)));
  await shot('81-pasted');

  // 6b. code snippets, tables, databases… : click the edge of the block (real mouse) then Backspace; drag by the edge
  fs.writeFileSync(path.join(vault, 'Others.md'), '# Others\n\nfirst\n\n```js\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nlast\n');
  await js(`window.__vault.reload()`); await sleep(700);
  await js(`window.__app.open('Others.md')`); await sleep(1400);
  win.focus(); wc.focus && wc.focus();
  const edge = async (type) => { await js(`document.querySelector('#view').scrollTop = 0`); await sleep(250); return rectOf(`(() => { const b = ${blk(type)}; return b.querySelector('.blk-body > *'); })()`); };
  const realClick = async (x, y) => { wc.sendInputEvent({ type: 'mouseMove', x, y }); await sleep(100); wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); await sleep(60); wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); await sleep(350); };
  const realKey = async (k, mods = []) => { wc.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: mods }); wc.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: mods }); await sleep(500); };
  for (const type of ['code', 'table']) {
    const r = await edge(type);
    const px = type === 'table' ? r.l + r.w - 5 : r.l + 2, py = type === 'table' ? r.y : r.t + 3;
    console.log(type, 'under:', await js(`(() => { const e = document.elementFromPoint(${px}, ${py}); return e.tagName + '.' + e.className; })()`));
    await realClick(px, py);
    check(`clicking the edge of a ${type} block selects it`, await js(`!!(${blk(type)} && ${blk(type)}.classList.contains('sel'))`), JSON.stringify(r));
    await realKey('Backspace');
    check(`real Backspace deletes the ${type} block`, !(await types()).includes(type), await types());
    await realKey('Z', ['control']);
    check(`and Ctrl+Z restores the ${type} block`, (await types()).includes(type), await types());
  }
  // drag the code block below "last"
  { const r = await edge('code'); const l = await rectOf(`(() => { const ps = [...document.querySelectorAll('#view .blk')].filter(x => x._blk.type === 'p'); return ps[ps.length - 1]; })()`);
    await realDrag({ x: r.l + 2, y: r.t + 3 }, l.b - 3, l.l + 60);
    const tt = (await types()).split(','); check('a code snippet can be dragged by its edge', tt.indexOf('code') > tt.indexOf('table'), tt.join(',')); }

  // 7. reorder pages in the sidebar
  fs.mkdirSync(path.join(vault, 'Ord'), { recursive: true });
  for (const n of ['One', 'Two', 'Three']) fs.writeFileSync(path.join(vault, 'Ord', n + '.md'), '# ' + n + '\n');
  fs.writeFileSync(path.join(vault, 'Mover.md'), '# Mover\n');
  await js(`window.__vault.reload()`); await sleep(900);
  await js(`window.__app.settings.expanded = ['Ord']; window.__app.openView({ type: 'home' })`); await sleep(900);
  const order = () => js(`[...document.querySelectorAll('.tn-row[data-key^="Ord/"]')].map(r => r.dataset.key.replace('Ord/', '')).join(',')`);
  check('pages start in alphabetical order', (await order()) === 'One,Three,Two', await order());

  const dnd = (srcKey, dstKey, frac) => js(`(() => {
    const s = document.querySelector('.tn-row[data-key="${srcKey}"]'), d = document.querySelector('.tn-row[data-key="${dstKey}"]'); const dt = new DataTransfer();
    s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const r = d.getBoundingClientRect(); const y = r.top + r.height * ${frac};
    d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 30, clientY: y }));
    const cls = d.className;
    d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 30, clientY: y }));
    return cls; })()`);
  const cls = await dnd('Ord/Two', 'Ord/Three', 0.1); await sleep(900);
  check('dragging onto the top edge shows a drop line', /drop-before/.test(cls), cls);
  check('dragging a page above another reorders them', (await order()) === 'One,Two,Three', await order());
  await dnd('Ord/One', 'Ord/Three', 0.9); await sleep(900);
  check('dropping on the bottom edge puts it after', (await order()) === 'Two,Three,One', await order());

  // keyboard: select a row, Alt+Up
  await js(`(() => { const r = document.querySelector('.tn-row[data-key="Ord/One"]'); r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); r.querySelector('.tn-name').click(); })()`); await sleep(500);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }))`); await sleep(500);
  check('Alt+↑ moves the selected page up', (await order()) === 'Two,One,Three', await order());

  // moving into another folder by dropping next to one of its pages
  await dnd('Mover', 'Ord/Two', 0.1); await sleep(1200);
  check('dropping a page between pages of another folder moves it there', fs.existsSync(path.join(vault, 'Ord', 'Mover.md')) && (await order()).startsWith('Mover,Two'), await order());

  // the order is saved in the vault and survives a rebuild
  await sleep(700);
  const saved = fs.existsSync(path.join(vault, '.jimmy', 'order.json')) ? JSON.parse(fs.readFileSync(path.join(vault, '.jimmy', 'order.json'), 'utf8')) : null;
  check('the order is saved in .jimmy/order.json', saved && Array.isArray(saved.Ord) && saved.Ord[0] === 'Ord/Mover', JSON.stringify(saved));
  await js(`window.__vault.reload()`); await sleep(800); await js(`window.__app.refresh()`); await sleep(400);
  check('order survives a reload', (await order()).startsWith('Mover,Two,One'), await order());
  await shot('82-reordered');

  // folder-level order and the right-click menu
  await js(`(() => { const r = document.querySelector('.tn-row[data-key="Ord/Three"]'); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 300, button: 2 })); })()`); await sleep(300);
  const labels = await js(`[...document.querySelectorAll('body > .menu .mi span:not(.k)')].map(s => s.textContent.trim())`);
  check('right-click menu has Move up / Move down', labels.includes('Move up') && labels.includes('Move down'), labels.join(' | '));
  await js(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
  check('no console errors', errors.length === 0, errors.join(' | '));
};
