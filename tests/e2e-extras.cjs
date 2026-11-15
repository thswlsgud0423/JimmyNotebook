module.exports = async ({ js, shot, check, sleep, errors, key, type, win, vault }) => {
  const fs = require('fs'), path = require('path');
  await js(`window.__app.settings.theme='duo'; window.__app.settings.mode='dark'; window.__app.saveSettings(); window.__app.openView({type:'home'})`);
  await sleep(1800);
  await shot('100-duo-dark-home');
  await js(`window.__app.settings.mode='light'; window.__app.saveSettings();`); await sleep(1200);
  await shot('101-duo-light-home');

  // --- TOC block
  await js(`window.__app.newPage('')`); await sleep(900);
  await type('TOC test'); await key('Enter'); await sleep(200);
  await type('/toc'); await sleep(300); await key('Enter'); await sleep(500);
  await js(`(() => { const ed = document.querySelector('#view .editor'); const last = [...ed.querySelectorAll(':scope > .blk')].pop(); last.querySelector('[data-txt]').focus(); })()`);
  await type('## First heading'); await key('Enter'); await type('some text'); await key('Enter'); await type('## Second heading'); await sleep(900);
  const toc = await js(`[...document.querySelectorAll('#view .toc-i')].map(x => x.textContent).join('|')`);
  check('TOC block lists headings live', toc === 'First heading|Second heading', toc);

  // --- find in page (UI + IPC)
  await key('F', ['control']); await sleep(400);
  check('find bar opens (Ctrl+F)', await js(`!!document.querySelector('#findbar input')`));
  await type('heading'); await sleep(700);
  const fc = await js(`document.querySelector('#findbar .fc').textContent`);
  check('find counts matches', /\d+ \/ \d+/.test(fc), fc);
  await key('Escape'); await sleep(300);
  check('find bar closes', await js(`!document.querySelector('#findbar')`));

  // --- trash: delete -> appears -> restore
  await sleep(1200);
  await js(`(async () => { await window.__app.flush(); await window.__vault.deletePage('TOC test.md'); window.__app.openView({type:'trash'}); })()`); await sleep(1200);
  check('deleted page shows in Trash view', await js(`document.querySelector('#view [data-n]')?.dataset.n === 'TOC test.md'`));
  await shot('102-trash');
  await js(`document.querySelector('#view [data-restore]').click()`); await sleep(1500);
  check('restore brings the page back', fs.existsSync(path.join(vault, 'TOC test.md')));

  // --- emoji not clipped: favorites cards + sidebar + page icon (dark and light)
  for (const mode of ['dark', 'light']) {
    await js(`window.__app.settings.mode='${mode}'; window.__app.saveSettings(); window.__app.openView({type:'home'})`); await sleep(1500);
    const clip = await js(`(() => { const out = []; document.querySelectorAll('.gcard .gi').forEach(el => { const r = el.getBoundingClientRect(); const c = el.closest('.gcard').getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); out.push(r.top >= c.top && r.bottom <= c.bottom && (top === el || el.contains(top))); }); return out; })()`);
    check('favorite-card emoji fully visible (' + mode + ')', clip.length > 0 && clip.every(Boolean), JSON.stringify(clip));
    await shot('103-emoji-' + mode);
  }
  await js(`window.__app.open('Writing Guide.md')`); await sleep(1500);
  await shot('104-page-icon');
};
