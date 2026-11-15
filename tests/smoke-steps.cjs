const fs = require('fs');
const path = require('path');

module.exports = async ({ js, shot, check, sleep, vault, errors, key, type }) => {
  // boot + seed
  const n = await js('window.__vault ? window.__vault.pages.size : -1');
  check('app booted & vault seeded', n > 5, 'pages=' + n);
  check('seed files exist on disk', fs.existsSync(path.join(vault, 'Welcome to Jimmy Notes.md')));
  await shot('01-home-basic');

  // open a page with charts/db/portfolio
  await js(`window.__app.open('Study Planner.md')`);
  await sleep(1200);
  await shot('02-study-planner');
  const blocks = await js(`document.querySelectorAll('#view .blk').length`);
  check('study planner renders blocks', blocks > 8, 'blocks=' + blocks);
  const hasChart = await js(`!!document.querySelector('#view .t-widget .stw')`);
  check('study widget present (real data, no sample chart)', hasChart);
  const hasBoard = await js(`!!document.querySelector('#view .board .col')`);
  check('kanban board rendered (starts empty)', hasBoard);

  // typing + slash menu
  await js(`(() => { const t = document.querySelector('#view .editor .txt'); t.focus(); })()`);
  await js(`window.__app.open('Research Notes.md')`);
  await sleep(800);
  await js(`(() => { const ed = document.querySelector('#view .editor'); const last = [...ed.querySelectorAll(':scope > .blk')].pop(); const t = last.querySelector('[data-txt]'); t.focus(); const r=document.createRange(); r.selectNodeContents(t); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
  await key('Enter');
  await type('/');
  await sleep(400);
  const slash = await js(`!!document.querySelector('.slash-menu')`);
  check('slash menu opens on "/"', slash);
  await shot('03-slash-menu');
  await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);

  // portfolio page
  await js(`window.__app.open('Investment Portfolio.md')`);
  await sleep(4500);
  await shot('04-portfolio');
  const pf = await js(`document.querySelector('#view .pf-status')?.textContent || ''`);
  console.log('portfolio status:', pf.slice(0, 100));
  const rows = await js(`document.querySelectorAll('#view table.pf tr').length`);
  check('portfolio starts empty (no sample data)', await js(`!!document.querySelector('#view .pf-empty')`));

  // themes
  for (const t of ['psyduck', 'yadon']) {
    await js(`window.__app.settings.theme='${t}'; window.__app.saveSettings();`);
    await js(`window.__app.openView({type:'home'})`);
    await sleep(700);
    await shot('05-home-' + t);
  }
  await js(`window.__app.settings.mode='dark'; window.__app.saveSettings();`);
  await sleep(500);
  await shot('06-home-yadon-dark');
  await js(`window.__app.settings.theme='psyduck'; window.__app.saveSettings(); window.__app.open('Welcome to Jimmy Notes.md')`);
  await sleep(900);
  await shot('07-welcome-psyduck-dark');
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings();`);

  // persistence: edit title text via API & verify file written
  await js(`window.__app.open('Ideas & Sketches.md')`);
  await sleep(600);
  await js(`(() => { const t = document.querySelector('#view .editor [data-txt]'); t.focus(); const r=document.createRange(); r.selectNodeContents(t); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('insertText', false, ' SAVETEST'); })()`);
  await sleep(1500);
  const src = fs.readFileSync(path.join(vault, 'Ideas & Sketches.md'), 'utf8');
  check('edits are saved to the .md file', src.includes('SAVETEST'));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
};
