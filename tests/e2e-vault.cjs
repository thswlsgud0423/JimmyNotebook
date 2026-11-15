module.exports = async ({ js, shot, check, sleep, errors, key, type, win, vault }) => {
  const fs = require('fs'), path = require('path');
  await js(`window.__app.settings.mode='light'; window.__app.settings.theme='basic'; window.__app.saveSettings();`);
  await sleep(500);
  // 1. rename rewrites wikilinks in other pages
  const before = fs.readFileSync(path.join(vault, 'Welcome to Jimmy Notes.md'), 'utf8');
  check('welcome links Study Planner', before.includes('[[Study Planner]]'));
  await js(`(async () => { await window.__app.flush(); await window.__vault.renamePage('Study Planner.md', 'Study Hub'); window.__app.refresh(); })()`);
  await sleep(800);
  const after = fs.readFileSync(path.join(vault, 'Welcome to Jimmy Notes.md'), 'utf8');
  check('rename rewrote [[links]] in other pages', after.includes('[[Study Hub]]') && !after.includes('[[Study Planner]]'));
  check('renamed file exists', fs.existsSync(path.join(vault, 'Study Hub.md')) && !fs.existsSync(path.join(vault, 'Study Planner.md')));

  // 2. subpage creation + move + delete
  await js(`window.__app.newPage('Study Hub', 'Chapter 1 notes')`); await sleep(1000);
  check('subpage file in folder', fs.existsSync(path.join(vault, 'Study Hub', 'Chapter 1 notes.md')));
  await js(`window.__app.open('Study Hub.md')`); await sleep(700);
  await shot('40-subpage-tree');
  await js(`(async () => { await window.__vault.movePage('Study Hub/Chapter 1 notes.md', ''); window.__app.refresh(); })()`); await sleep(600);
  check('movePage to root', fs.existsSync(path.join(vault, 'Chapter 1 notes.md')));
  await js(`(async () => { await window.__vault.deletePage('Chapter 1 notes.md'); window.__app.refresh(); })()`); await sleep(500);
  check('delete moves to .trash', !fs.existsSync(path.join(vault, 'Chapter 1 notes.md')) && fs.existsSync(path.join(vault, '.trash')));

  // 3. image block from assets
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8Dwn4EIwDiqkL4KAcT9GO0U4BxoAAAAAElFTkSuQmCC', 'base64');
  fs.writeFileSync(path.join(vault, 'assets', 'dot.png'), png);
  fs.writeFileSync(path.join(vault, 'Image test.md'), '# Image test\n\n![cap|120](assets/dot.png)\n\n![[dot.png]]\n');
  await js(`(async () => { await window.__vault.reload(); window.__app.open('Image test.md'); })()`); await sleep(900);
  const loaded = await js(`[...document.querySelectorAll('#view img')].map(i => i.complete && i.naturalWidth > 0)`);
  check('images load from vault assets (file://)', loaded.length === 2 && loaded.every(Boolean), JSON.stringify(loaded));
  const w = await js(`document.querySelector('#view img').style.width`);
  check('image width from ![alt|120]', w === '120px', w);

  // 4. template picker insert
  await js(`window.__app.open('Image test.md')`); await sleep(500);
  await js(`document.querySelector('#view .editor').scrollIntoView(); const ed = document.querySelector('#view .editor'); const last = [...ed.querySelectorAll(':scope > .blk')].pop(); last.querySelector('[data-nav]')?.focus();`);
  await js(`document.querySelector('#view .page-ctl [data-c=template]').click()`); await sleep(500);
  check('template picker lists templates', await js(`document.querySelectorAll('.modal .prow').length >= 5`));
  await js(`document.querySelector('.modal .prow').click()`); await sleep(800);
  const nb = await js(`document.querySelectorAll('#view .editor > .blk').length`);
  check('template blocks inserted', nb > 4, 'blocks=' + nb);
  await shot('41-template-inserted');

  // 5. todo check toggles & saves
  await js(`window.__app.open('Welcome to Jimmy Notes.md')`); await sleep(800);
  await js(`document.querySelector('#view .chk').click()`); await sleep(2200);
  check('todo checkbox persists', fs.readFileSync(path.join(vault, 'Welcome to Jimmy Notes.md'), 'utf8').includes('- [x] Type'));

  // 6. daily note
  await js(`window.__app.openDaily('2026-12-25')`); await sleep(1000);
  check('daily note created from template', fs.existsSync(path.join(vault, 'Daily', '2026-12-25.md')));
  await shot('42-daily');
  // 7. external edit picked up
  fs.writeFileSync(path.join(vault, 'Daily', '2026-12-25.md'), fs.readFileSync(path.join(vault, 'Daily', '2026-12-25.md'), 'utf8') + '\nEXTERNAL EDIT\n');
  await sleep(2500);
  check('external file edit appears live', await js(`document.querySelector('#view').textContent.includes('EXTERNAL EDIT')`));
};
