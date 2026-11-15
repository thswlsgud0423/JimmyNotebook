// The always-visible toolbar: shown on pages, style / lists / bold, Insert menu, quick buttons, undo, help.
module.exports = async ({ js, shot, check, sleep, errors, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path'), wc = win.webContents;
  fs.writeFileSync(path.join(vault, 'Tb1.md'), '# Tb1\n\nhello world\n\nsecond\n');
  await js(`window.__vault.reload()`); await sleep(900);
  await js(`window.__app.open('Tb1.md')`); await sleep(1400);
  const types = () => js(`[...document.querySelectorAll('#view .blk')].map(b => b._blk.type).join(',')`);
  const rect = (sel) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const click = async (sel) => { const r = await rect(sel); wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await sleep(80); wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 }); await sleep(350); };
  const clickMenu = async (label) => { const ok = await js(`(() => { const b = [...document.querySelectorAll('body > .menu .mi')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (!b) return false; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) }; })()`); if (!ok) return false; wc.sendInputEvent({ type: 'mouseDown', x: ok.x, y: ok.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: ok.x, y: ok.y, button: 'left', clickCount: 1 }); await sleep(450); return true; };
  const focusP = (i) => js(`(() => { const el = [...document.querySelectorAll('#view .blk')].filter(b => b._blk.type !== 'h1')[${i}].querySelector('[data-txt]'); el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);

  check('toolbar is visible on a page', await js(`(() => { const t = document.getElementById('doctools'); return !t.hidden && t.offsetHeight > 20 && t.querySelectorAll('.dt-b').length > 12; })()`));
  await shot('90-toolbar');

  // heading via the Style menu
  await focusP(0); await click('#doctools [data-c=style]');
  check('Style menu opens', await js(`!!document.querySelector('body > .menu')`));
  await clickMenu('Heading 2'); const t1 = await types();
  check('Style → Heading 2 converts the paragraph', /h1,h2,p/.test(t1), t1);
  check('the Style button shows the current style', /Heading 2/.test(await js(`document.querySelector('.dt-style-t').textContent`)));

  // bullet list button toggles
  await focusP(1); await click('#doctools [data-c=ul]');
  check('Bulleted-list button converts the block', /ul/.test(await types()), await types());
  await click('#doctools [data-c=ul]');
  check('…and pressing it again turns it back to text', !/ul/.test(await types()), await types());

  // bold with a real selection
  await js(`(() => { const el = [...document.querySelectorAll('#view .blk')].filter(b => b._blk.type === 'p')[0].querySelector('[data-txt]'); el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
  await click('#doctools [data-c=bold]'); await sleep(300);
  const md = await js(`[...document.querySelectorAll('#view .blk')].filter(b => b._blk.type === 'p')[0]._blk.text`);
  check('Bold button wraps the selected text', /\*\*/.test(md), md);

  // Insert menu → Table, quick Chart button, Timeline button
  await focusP(1); await click('#doctools [data-c=insert]');
  const names = await js(`[...document.querySelectorAll('body > .menu .mi')].map(b => b.textContent.trim().split('\\n')[0]).length`);
  check('Insert menu lists many blocks', names > 20, names);
  await shot('91-insert-menu');
  await clickMenu('Table'); check('Insert → Table adds a table', /table/.test(await types()), await types());
  await focusP(1); await click('#doctools [data-c=chart]'); check('Chart button adds a chart', /chart/.test(await types()), await types());
  await click('#doctools [data-c=timeline]'); check('Timeline button adds a timeline', /timeline/.test(await types()), await types());

  // undo button
  await click('#doctools [data-c=undo]'); check('Undo button removes the timeline again', !/timeline/.test(await types()), await types());
  await click('#doctools [data-c=redo]'); check('Redo button brings it back', /timeline/.test(await types()), await types());

  // Insert with nothing focused still works
  await js(`document.activeElement && document.activeElement.blur(); document.body.focus()`); const n0 = (await types()).split(',').length;
  await click('#doctools [data-c=image]'); check('Image button works with nothing focused', (await types()).split(',').length > n0, await types());

  // help
  await click('#doctools [data-c=help]'); check('Help opens', await js(`!!document.querySelector('#overlay .modal .hp')`));
  await shot('92-help');
  await js(`document.querySelector('#overlay .modal [data-a=ok]').click()`); await sleep(200);

  // hidden on non-page views
  await js(`window.__app.openView({ type: 'calendar' })`).catch(() => {}); await sleep(700);
  check('toolbar is hidden on other screens', await js(`document.getElementById('doctools').hidden`));
  check('no console errors', errors.length === 0, errors.join(' | '));
};
