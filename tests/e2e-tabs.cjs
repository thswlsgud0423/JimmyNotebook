// Tabs: open, switch, close, reopen, per-tab history, shortcuts, rename, Ctrl+click.
module.exports = async ({ js, shot, check, sleep, errors, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path');
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings();`);
  fs.writeFileSync(path.join(vault, 'Alpha.md'), '# Alpha\n\nsee [[Beta]] and [[Gamma]]\n');
  fs.writeFileSync(path.join(vault, 'Beta.md'), '# Beta\n\nsecond\n');
  fs.writeFileSync(path.join(vault, 'Gamma.md'), '# Gamma\n\nthird\n');
  await js(`window.__vault.reload()`); await sleep(1000);
  await js(`window.__app.open('Alpha.md')`); await sleep(1000);

  const tabs = () => js(`[...document.querySelectorAll('#tabbar .tab')].map(t => (t.classList.contains('active') ? '*' : '') + t.querySelector('.tab-t').textContent.trim())`);
  const key = (k, extra = {}) => js(`document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }, ${JSON.stringify(extra)})))`);
  const menuClick = (label) => js(`(() => { const b = [...document.querySelectorAll('body > .menu .mi')].find(x => x.querySelector('span').textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);

  check('a tab bar shows the open page', JSON.stringify(await tabs()) === '["*Alpha"]', JSON.stringify(await tabs()));

  // Ctrl+T -> new tab on Home
  await key('t', { ctrlKey: true }); await sleep(900);
  check('Ctrl+T opens a new tab (Home)', JSON.stringify(await tabs()) === '["Alpha","*Home"]', JSON.stringify(await tabs()));
  await shot('70-tabs');

  // open Beta in this tab, then Ctrl+click Gamma in the sidebar -> new tab
  await js(`window.__app.open('Beta.md')`); await sleep(900);
  check('the new tab follows the page you open', JSON.stringify(await tabs()) === '["Alpha","*Beta"]', JSON.stringify(await tabs()));
  await js(`(() => { const r = [...document.querySelectorAll('.tn-row[data-key="Gamma"] .tn-name')][0]; r.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); })()`); await sleep(900);
  check('Ctrl+click in the sidebar opens in a new tab', JSON.stringify(await tabs()) === '["Alpha","Beta","*Gamma"]', JSON.stringify(await tabs()));

  // clicking an already-open page just switches to it
  await js(`(() => { const r = document.querySelector('.tn-row[data-key="Alpha"] .tn-name'); r.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); })()`); await sleep(900);
  check('Ctrl+click on an open page switches to its tab', JSON.stringify(await tabs()) === '["*Alpha","Beta","Gamma"]', JSON.stringify(await tabs()));

  // Ctrl+click on a [[link]] inside a page opens a new tab
  await js(`(() => { const a = document.querySelector('#view a.wikilink[data-target="Gamma"]'); a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })); })()`); await sleep(900);
  check('Ctrl+click on a [[link]] switches to / opens that page’s tab', (await tabs()).includes('*Gamma') && (await tabs()).length === 3, JSON.stringify(await tabs()));

  // switching keeps what each tab shows and its content
  await key('1', { ctrlKey: true }); await sleep(900);
  check('Ctrl+1 goes to the first tab and shows its page', (await js(`document.querySelector('#view .page-title').textContent`)).trim() === 'Alpha');
  await key('Tab', { ctrlKey: true }); await sleep(900);
  check('Ctrl+Tab goes to the next tab', (await tabs())[1] === '*Beta', JSON.stringify(await tabs()));
  await key('Tab', { ctrlKey: true, shiftKey: true }); await sleep(900);
  check('Ctrl+Shift+Tab goes back', (await tabs())[0] === '*Alpha');

  // per-tab history: Beta tab goes Beta -> Home, Back returns to Beta, other tabs untouched
  await key('2', { ctrlKey: true }); await sleep(800);
  await js(`window.__app.openView({ type: 'calendar' })`); await sleep(800);
  check('a tab can show app screens too', (await tabs())[1] === '*Calendar', JSON.stringify(await tabs()));
  await key('ArrowLeft', { altKey: true }); await sleep(800);
  check('Back works inside a tab and keeps the other tabs', JSON.stringify(await tabs()) === '["Alpha","*Beta","Gamma"]', JSON.stringify(await tabs()));

  // rename a page open in a background tab: the tab follows the new name (via the sidebar's rename)
  await key('1', { ctrlKey: true }); await sleep(700);
  await js(`window.__app.open('Alpha.md')`); await sleep(500);
  await js(`(() => { const r = document.querySelector('.tn-row[data-key="Beta"]'); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 200, button: 2 })); })()`); await sleep(300);
  await menuClick('Rename'); await sleep(500);
  await js(`(() => { const i = document.querySelector('.modal input'); i.value = 'Beta Renamed'; document.querySelector('.modal [data-a=ok]').click(); })()`); await sleep(1200);
  check('renaming a page updates its tab in the background', (await tabs()).includes('Beta Renamed'), JSON.stringify(await tabs()));
  await key('2', { ctrlKey: true }); await sleep(900);
  check('and that tab still opens the renamed page', (await js(`document.querySelector('#view .page-title').textContent`)).trim() === 'Beta Renamed');

  // close tabs: middle click, x button, Ctrl+W, then reopen
  const before = (await tabs()).length;
  await js(`document.querySelector('#tabbar .tab:last-of-type').dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))`); await sleep(800);
  check('middle-click closes a tab', (await tabs()).length === before - 1, JSON.stringify(await tabs()));
  await key('w', { ctrlKey: true }); await sleep(800);
  check('Ctrl+W closes the current tab', (await tabs()).length === before - 2, JSON.stringify(await tabs()));
  await key('t', { ctrlKey: true, shiftKey: true }); await sleep(900);
  check('Ctrl+Shift+T reopens the last closed page tab', (await tabs()).length === before - 1, JSON.stringify(await tabs()));

  // right-click menu: close others
  await js(`(() => { const t = document.querySelector('#tabbar .tab'); const b = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 10, clientY: b.top + 10, button: 2 })); })()`); await sleep(300);
  const labels = await js(`[...document.querySelectorAll('body > .menu .mi span:not(.k)')].map(s => s.textContent.trim())`);
  check('tab menu has duplicate / close / close others', ['Duplicate tab', 'Close tab', 'Close other tabs'].every(l => labels.includes(l)), labels.join(' | '));
  await menuClick('Close other tabs'); await sleep(900);
  check('Close other tabs leaves one', (await tabs()).length === 1, JSON.stringify(await tabs()));

  // closing the last tab leaves a Home tab instead of an empty window
  await key('w', { ctrlKey: true }); await sleep(800);
  check('closing the last tab leaves Home', JSON.stringify(await tabs()) === '["*Home"]', JSON.stringify(await tabs()));
  await shot('71-tabs-home');
  check('no console errors', errors.length === 0, errors.join(' | '));
};
