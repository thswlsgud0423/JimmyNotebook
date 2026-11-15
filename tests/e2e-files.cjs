// Folders, right-click menus and Ctrl+C / X / V for pages, folders and blocks.
module.exports = async ({ js, shot, check, sleep, errors, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path');
  const ex = (p) => fs.existsSync(path.join(vault, p));
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings();`);
  await sleep(500);

  const menuLabels = () => js(`[...document.querySelectorAll('body > .menu .mi span:not(.k)')].map(s => s.textContent.trim())`);
  const clickMenu = (label) => js(`(() => { const b = [...document.querySelectorAll('body > .menu .mi')].find(x => x.querySelector('span').textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
  const rightClick = (sel) => js(`(() => { const el = ${sel}; const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + Math.min(10, r.height / 2), button: 2 })); })()`);
  const press = (k, extra = {}) => js(`(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }, ${JSON.stringify(extra)})))`);
  const clickRow = async (key) => { await js(`(() => { const r = document.querySelector('.tn-row[data-key="${key}"]'); r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); r.querySelector('.tn-name').click(); })()`); await sleep(400); };
  const answer = async (text) => { await sleep(300); await js(`(() => { const i = document.querySelector('.modal input'); i.value = ${JSON.stringify(text)}; document.querySelector('.modal [data-a=ok]').click(); })()`); await sleep(700); };
  const confirmYes = async () => { await sleep(300); await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(700); };

  // seed: a page with a sub-page, and one plain page
  fs.writeFileSync(path.join(vault, 'Alpha.md'), '# Alpha\n\nfirst page\n');
  fs.mkdirSync(path.join(vault, 'Alpha'), { recursive: true });
  fs.writeFileSync(path.join(vault, 'Alpha', 'Child.md'), '# Child\n\nin alpha\n');
  fs.writeFileSync(path.join(vault, 'Beta.md'), '# Beta\n\nsecond page\n');
  await js(`window.__vault.reload()`); await sleep(1200);
  await js(`window.__app.openView({type:'home'})`); await sleep(800);

  // 1. right-click on the empty area under the tree -> New page / New folder
  await rightClick(`document.querySelector('.tree-hint')`); await sleep(300);
  let labels = await menuLabels();
  check('right-click on empty sidebar space offers New page + New folder', labels.includes('New page') && labels.includes('New folder'), labels.join(' | '));
  await shot('50-sidebar-blank-menu');
  await clickMenu('New folder'); await answer('School');
  check('New folder creates a real folder on disk', ex('School') && fs.statSync(path.join(vault, 'School')).isDirectory());
  check('the empty folder shows in the sidebar', await js(`!!document.querySelector('.tn-row[data-key="School"]')`));
  // header button too
  await js(`document.querySelector('[data-act=newfolder]').click()`); await answer('Money');
  check('the folder button next to "Pages" works', ex('Money'));

  // 2. copy a page (Ctrl+C), paste into a folder (Ctrl+V on the folder)
  await clickRow('Beta'); await press('c', { ctrlKey: true }); await sleep(300);
  await clickRow('School'); await press('v', { ctrlKey: true }); await sleep(1200);
  check('Ctrl+C then Ctrl+V on a folder copies the page into it', ex('School/Beta.md') && ex('Beta.md'), labels.join(','));
  // 3. cut + paste moves
  await clickRow('Alpha'); await press('x', { ctrlKey: true }); await sleep(300);
  await clickRow('Money'); await press('v', { ctrlKey: true }); await sleep(1200);
  check('Ctrl+X then Ctrl+V moves a page together with its sub-pages', ex('Money/Alpha.md') && ex('Money/Alpha/Child.md') && !ex('Alpha.md') && !ex('Alpha'));
  // 4. right-click menu on a folder: copy / paste inside / rename / delete
  await rightClick(`document.querySelector('.tn-row[data-key="School"]')`); await sleep(300);
  labels = await menuLabels();
  check('folder menu has the file actions', ['New page in this folder', 'New folder inside', 'Copy', 'Cut', 'Duplicate', 'Rename', 'Delete folder'].every(l => labels.includes(l)), labels.join(' | '));
  await shot('51-folder-menu');
  await clickMenu('Duplicate'); await sleep(1200);
  check('Duplicate folder copies it with its pages', ex('School copy') && ex('School copy/Beta.md'));
  await rightClick(`document.querySelector('.tn-row[data-key="School copy"]')`); await sleep(300);
  await clickMenu('Rename'); await answer('Archive');
  check('Rename folder works', ex('Archive/Beta.md') && !ex('School copy'));
  // folder into folder, and never into itself
  await clickRow('Archive'); await press('x', { ctrlKey: true }); await sleep(300);
  await clickRow('School'); await press('v', { ctrlKey: true }); await sleep(1200);
  check('a folder can be cut and pasted into another folder', ex('School/Archive/Beta.md') && !ex('Archive'));
  await clickRow('School'); await press('x', { ctrlKey: true }); await sleep(300);
  await clickRow('School');   // clicking a folder toggles it: open it again
  await clickRow('School/Archive'); await press('v', { ctrlKey: true }); await sleep(900);
  check('a folder is not moved into itself', ex('School/Archive/Beta.md') && !ex('School/Archive/School'));
  // keyboard rename + delete
  await clickRow('Money'); await press('F2'); await answer('Cash');
  check('F2 renames the selected folder', ex('Cash/Alpha.md') && !ex('Money'));
  await clickRow('School'); await press('Delete'); await confirmYes();
  check('Delete on a folder moves it to .trash (confirmation first)', !ex('School') && fs.readdirSync(path.join(vault, '.trash')).some(n => n.startsWith('School')));
  // drag a page onto a folder (the drop code path)
  const mv = await js(`(async () => { await window.__vault.moveKey('Beta', 'Cash'); return true; })()`); await sleep(600);
  check('moveKey moves a page into a folder', ex('Cash/Beta.md') && !ex('Beta.md'));

  // 5. right-click on a page row
  await js(`window.__app.openView({type:'home'})`); await sleep(500);
  await rightClick(`document.querySelector('.tn-row[data-key="Cash"]')`); await sleep(300);
  await clickMenu('Copy'); await sleep(300);
  await rightClick(`document.querySelector('.tree-hint')`); await sleep(300);
  labels = await menuLabels();
  check('after Copy, the empty-space menu offers Paste', labels.some(l => l.startsWith('Paste “Cash”')), labels.join(' | '));
  await clickMenu('Paste'); await sleep(1200);
  check('pasting a copy next to the original gets a "copy" name', ex('Cash copy/Alpha/Child.md'));

  // 6. blocks: chart widget -> Ctrl+C / Ctrl+V / right-click menu
  fs.writeFileSync(path.join(vault, 'Blocks.md'), '# Blocks\n\nintro text\n\n```chart\n' + JSON.stringify({ kind: 'bar', title: 'Sales', labels: ['a', 'b'], series: [{ name: 'x', values: [1, 2] }] }) + '\n```\n\nend\n');
  await js(`window.__vault.reload()`); await sleep(800);
  await js(`window.__app.open('Blocks.md')`); await sleep(1500);
  const count = () => js(`document.querySelector('.blk')._ed.blocks.length`);
  const n0 = await count();
  const chartBlk = `[...document.querySelectorAll('#view .blk')].find(b => b._blk.type === 'chart')`;
  check('chart block rendered', await js(`!!(${chartBlk})`));
  await js(`(() => { const b = ${chartBlk}; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.activeElement && document.activeElement.blur(); })()`);
  await press('c', { ctrlKey: true }); await sleep(500);
  const clip = await js(`navigator.clipboard.readText()`);
  check('Ctrl+C on a chart copies it as a block', /```chart/.test(clip), clip.slice(0, 40));
  await press('v', { ctrlKey: true }); await sleep(900);
  check('Ctrl+V pastes a second chart', (await count()) === n0 + 1 && (await js(`[...document.querySelectorAll('#view .blk')].filter(b => b._blk.type === 'chart').length`)) === 2);
  await rightClick(chartBlk); await sleep(300);
  labels = await menuLabels();
  check('right-click on a chart shows Copy / Cut / Paste below', ['Copy', 'Cut', 'Paste below', 'Duplicate', 'Delete'].every(l => labels.includes(l)), labels.join(' | '));
  await shot('52-block-menu');
  await clickMenu('Cut'); await sleep(700);
  check('Cut removes the chart', (await js(`[...document.querySelectorAll('#view .blk')].filter(b => b._blk.type === 'chart').length`)) === 1);
  // block selection mode: Esc-style select, Ctrl+A, Ctrl+C, paste after
  await js(`(() => { const ed = document.querySelector('.blk')._ed; ed.selectBlock(document.querySelector('#view .blk')); })()`); await sleep(200);
  await press('a', { ctrlKey: true }); await sleep(200);
  check('Ctrl+A selects every block', (await js(`document.querySelectorAll('#view .blk.sel').length`)) >= 3);
  await press('c', { ctrlKey: true }); await sleep(500);
  const all = await js(`navigator.clipboard.readText()`);
  check('copying all blocks puts the whole page on the clipboard', /intro text/.test(all) && /```chart/.test(all) && /end/.test(all));
  check('no console errors', errors.length === 0, errors.join(' | '));
};
