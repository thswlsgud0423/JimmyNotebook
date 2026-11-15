// Links to files / pages / app screens: create, edit, open, relink a missing file, quick links, study material.
module.exports = async ({ js, shot, check, sleep, errors, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path');
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings();`);
  const menuClick = (label) => js(`(() => { const b = [...document.querySelectorAll('body > .menu .mi')].find(x => x.querySelector('span').textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
  const rightClick = (sel) => js(`(() => { const el = ${sel}; const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5, button: 2 })); })()`);

  // 1. understanding what was typed
  const cls = await js(`(async () => { const L = await import('./js/links.js'); return {
    study: L.classify('Study timer'), app: L.classify('app:calendar'), web: L.classify('www.example.com/x'), https: L.classify('https://a.b'),
    file: L.classify('C:\\\\Docs\\\\Math book.pdf'), url: L.classify('file:///C:/Docs/Math%20book.pdf'), page: L.classify('[[Study Planner]]'),
    norm: L.normalize('C:\\\\Docs\\\\Math (1) #2.pdf'), back: L.classify(L.normalize('C:\\\\Docs\\\\Math (1) #2.pdf')).path } })()`);
  check('typing "Study timer" means the Study timer screen', cls.study.kind === 'app' && cls.study.id === 'study', JSON.stringify(cls.study));
  check('app:calendar, websites and pages are recognised', cls.app.kind === 'app' && cls.web.kind === 'web' && cls.web.url.startsWith('https://') && cls.page.name === 'Study Planner');
  check('a Windows path and a file:// address both mean a file', cls.file.kind === 'file' && cls.url.kind === 'file' && cls.url.path === 'C:\\Docs\\Math book.pdf', JSON.stringify(cls.url));
  check('file addresses survive spaces, brackets and #', cls.back === 'C:\\Docs\\Math (1) #2.pdf', cls.norm);

  // 2. a missing file reports "missing" instead of throwing
  const miss = await js(`window.api.file.open('C:\\\\no\\\\such\\\\file.pdf')`);
  check('opening a missing file is reported, not an error', miss.ok === false && miss.missing === true);
  const bad = await js(`window.api.file.open('C:\\\\Windows\\\\System32\\\\notepad.exe')`);
  check('programs are never launched from a note', bad.ok === false && bad.blocked === true);

  // 3. links written in markdown render and round-trip
  fs.writeFileSync(path.join(vault, 'Math.md'), '# Math\n\nAccording to [the textbook](file:///C:/Docs/Math%20book.pdf) and [[Study Planner]], see [the timer](app:study).\n\nPlain line to link.\n');
  await js(`window.__vault.reload()`); await sleep(800);
  await js(`window.__app.open('Math.md')`); await sleep(1200);
  const anchors = await js(`[...document.querySelectorAll('#view a.ext, #view a.wikilink')].map(a => a.className + '|' + (a.dataset.href || a.dataset.target) + '|' + a.textContent)`);
  check('file, page and app links render', anchors.length === 3 && anchors[0].includes('file:///C:/Docs/Math%20book.pdf') && anchors[2].includes('app:study'), anchors.join('  '));
  await shot('60-links');

  // 4. clicking the app link opens the screen
  await js(`document.querySelector('#view a.ext[data-href^="app:"]').click()`); await sleep(900);
  check('clicking an app link opens that screen', (await js(`window.__app.state.view.type`)) === 'study');
  await js(`window.__app.open('Math.md')`); await sleep(900);

  // 5. clicking a link to a missing file offers "choose the correct file"
  await js(`document.querySelector('#view a.ext[data-href^="file:"]').click()`); await sleep(900);
  const dlg = await js(`(document.querySelector('.modal') || {}).textContent || ''`);
  check('a missing file asks you to pick the correct one', /can.t be found/.test(dlg) && /Choose file/.test(dlg), dlg.slice(0, 120));
  await shot('61-missing-file');
  await js(`document.querySelector('.modal [data-a=c]').click()`); await sleep(400);

  // 6. right-click a link -> Edit link… -> change where it goes
  await rightClick(`document.querySelector('#view a.ext[data-href^="file:"]')`); await sleep(300);
  const items = await js(`[...document.querySelectorAll('body > .menu .mi span:not(.k)')].map(s => s.textContent.trim())`);
  check('right-click on a link: open / edit / copy / remove', ['Open link', 'Edit link…', 'Copy address'].every(l => items.includes(l)) && items.some(l => l.startsWith('Remove link')), items.join(' | '));
  await menuClick('Edit link'); await sleep(500);
  await shot('62-edit-link');
  await js(`(() => { const m = document.querySelector('.modal'); m.querySelector('[data-k=text]').value = 'Calculus book'; m.querySelector('[data-k=target]').value = 'D:\\\\School\\\\Calc 2.pdf'; m.querySelector('[data-k=target]').dispatchEvent(new Event('input')); })()`);
  const what = await js(`document.querySelector('.modal .lk-what').textContent`);
  check('the dialog explains where the link goes', /Calc 2\.pdf/.test(what), what);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(1800);
  const saved = fs.readFileSync(path.join(vault, 'Math.md'), 'utf8');
  check('the edited link is saved in the file', saved.includes('[Calculus book](file:///D:/School/Calc%202.pdf)'), saved.split('\n')[2]);

  // 7. Ctrl+L on selected text
  await js(`(() => { const el = [...document.querySelectorAll('#view [data-txt]')].find(e => e.textContent.startsWith('Plain line')); el.focus(); const r = document.createRange(); r.selectNodeContents(el.firstChild); r.setStart(el.firstChild, 6); r.setEnd(el.firstChild, 10); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true, cancelable: true }))`); await sleep(500);
  check('Ctrl+L opens the link dialog with the selected text', (await js(`(document.querySelector('.modal [data-k=text]') || {}).value`)) === 'line');
  await js(`(() => { const m = document.querySelector('.modal'); m.querySelector('[data-k=target]').value = 'Study timer'; m.querySelector('[data-a=ok]').click(); })()`); await sleep(1800);
  const saved2 = fs.readFileSync(path.join(vault, 'Math.md'), 'utf8');
  check('a link to "Study timer" is stored as an app link', saved2.includes('[line](app:study)'), saved2.split('\n').slice(-3).join('/'));

  // 8. Quick links widget uses the same links
  const res = await js(`(async () => {
    const { WIDGETS } = await import('./js/widgets.js');
    const host = document.createElement('div'); host.id = 'qltest'; host.style.cssText = 'position:fixed;left:20px;top:20px;width:300px;background:#fff;z-index:50;padding:10px'; document.body.appendChild(host);
    const inst = { cfg: { items: [{ t: 'Timer', u: 'Study timer' }, { t: 'Gone', u: 'C:\\\\nope\\\\a.pdf' }, { t: 'Site', u: 'example.com' }] }, save() {} };
    WIDGETS.links.render(host, inst);
    return host.querySelectorAll('.prow').length; })()`);
  check('Quick links render 3 items', res === 3);
  await js(`document.querySelector('#qltest .prow').click()`); await sleep(900);
  check('a Quick link called "Study timer" opens the Study timer', (await js(`window.__app.state.view.type`)) === 'study');
  await js(`document.querySelectorAll('#qltest .prow')[1] && document.body.contains(document.querySelector('#qltest')) ? 0 : 0`);
  await js(`window.__app.open('Math.md')`); await sleep(500);
  await js(`document.getElementById('qltest') && document.getElementById('qltest').remove()`);
  check('no console errors', errors.length === 0, errors.join(' | '));
};
