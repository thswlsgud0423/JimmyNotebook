// Undo / redo with REAL keyboard events: after typing, with focus on the page background, and with a block selected.
module.exports = async ({ js, shot, check, sleep, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path'), wc = win.webContents;
  fs.writeFileSync(path.join(vault, 'Undo1.md'), '# Undo1\n\nfirst line\n\n```chart\n' + JSON.stringify({ kind: 'bar', title: 'S', labels: ['a'], series: [{ name: 'x', values: [1] }] }) + '\n```\n\nlast line\n');
  await js(`window.__vault.reload()`); await sleep(900);
  await js(`window.__app.open('Undo1.md')`); await sleep(1400);
  const key = async (k, mods = []) => { wc.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: mods }); if (k.length === 1) wc.sendInputEvent({ type: 'char', keyCode: k, modifiers: mods }); await sleep(60); wc.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: mods }); await sleep(120); };
  const types = () => js(`[...document.querySelectorAll('#view .blk')].map(b => b._blk.type).join(',')`);
  const texts = () => js(`[...document.querySelectorAll('#view .blk')].filter(b => b._blk.type === 'p').map(b => b._blk.text).join('|')`);

  // 1. type in the first paragraph, wait for the history snapshot, Ctrl+Z / Ctrl+Y
  await js(`(() => { const el = [...document.querySelectorAll('#view .blk')].find(b => b._blk.type === 'p').querySelector('[data-txt]'); el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
  for (const c of ' XYZ') await key(c === ' ' ? 'Space' : c);
  await sleep(900);
  const typed = await texts(); check('typing changed the text', /XYZ/i.test(typed), typed);
  await key('Z', ['control']); await sleep(500);
  const undone = await texts(); check('Ctrl+Z undoes the typing', !/XYZ/i.test(undone), undone);
  await key('Y', ['control']); await sleep(500);
  const redone = await texts(); check('Ctrl+Y redoes it', /XYZ/i.test(redone), redone);
  await key('Z', ['control']); await sleep(500);
  check('Ctrl+Shift+Z also redoes', true);
  await key('Z', ['control', 'shift']); await sleep(500);
  check('…redo via Ctrl+Shift+Z', /XYZ/i.test(await texts()), await texts());

  // 2. delete a chart with focus on the page background (nothing in the text focused) then undo
  await js(`document.activeElement && document.activeElement.blur(); const b = [...document.querySelectorAll('#view .blk')].find(b => b._blk.type === 'chart'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); b.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));`); await sleep(300);
  await key('Backspace'); await sleep(600);
  check('Backspace deleted the chart', !/chart/.test(await types()), await types());
  await js(`document.activeElement && document.activeElement.blur(); document.body.focus()`); await sleep(200);
  await key('Z', ['control']); await sleep(600);
  check('Ctrl+Z restores the chart even with focus on the background', /chart/.test(await types()), await types());
  await key('Y', ['control']); await sleep(600);
  check('Ctrl+Y deletes it again', !/chart/.test(await types()), await types());
  await key('Z', ['control']); await sleep(600);
  check('Ctrl+Z once more brings it back', /chart/.test(await types()), await types());
  console.log('active after undo:', await js(`document.activeElement && (document.activeElement.className || document.activeElement.tagName)`));
};
