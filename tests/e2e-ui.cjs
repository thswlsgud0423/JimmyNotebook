module.exports = async ({ js, shot, check, sleep, errors, key, type, win, vault }) => {
  const ctrl = ['control'];
  await js(`window.__app.settings.mode='light'; window.__app.saveSettings(); window.__app.open('Welcome to Jimmy Notes.md')`);
  await sleep(900);
  // palette
  await key('K', ctrl); await sleep(400);
  await type('study'); await sleep(400);
  check('palette opens + results', await js(`document.querySelectorAll('.pal-item').length > 0`));
  await shot('20-palette');
  await key('Enter'); await sleep(900);
  check('palette navigates', await js(`document.querySelector('#view .page-title').textContent === 'Study Planner'`));
  // right panel
  await js(`document.querySelector('[data-t=right]').click()`); await sleep(500);
  await js(`window.__app.open('Welcome to Jimmy Notes.md')`); await sleep(800);
  const back = await js(`document.querySelector('#rightbar').textContent.includes('Backlinks')`);
  check('right panel shows backlinks', back);
  await shot('21-rightpanel');
  // new page + title + rename
  await js(`window.__app.newPage('')`); await sleep(900);
  await type('My new idea'); await key('Enter'); await sleep(300);
  await type('Hello #tagged world and a [[Study Planner]] link'); await sleep(1200);
  check('new page created with title', await js(`window.__vault.pages.has('My new idea.md')`), await js(`[...window.__vault.pages.keys()].filter(k=>/Untitled|new idea/.test(k)).join(',')`));
  await shot('22-newpage');
  // drawing
  await js(`window.__app.open('Ideas & Sketches.md')`); await sleep(900);
  await js(`document.querySelector('#view .draw-canvas-wrap').scrollIntoView({block:'center'})`); await sleep(500);
  const cv = await js(`(() => { const c = document.querySelector('#view .draw-canvas-wrap canvas'); const r = c.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
  console.log('canvas rect', cv);
  const [x, y, w, h] = cv;
  const mouse = (t, px, py) => win.webContents.sendInputEvent({ type: t, x: Math.round(px), y: Math.round(py), button: 'left', clickCount: 1 });
  mouse('mouseDown', x + 100, y + 100);
  for (let i = 0; i < 40; i++) { win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x + 100 + i * 8), y: Math.round(y + 100 + Math.sin(i / 4) * 40), button: 'left' }); await sleep(8); }
  mouse('mouseUp', x + 420, y + 100);
  await sleep(1300);
  const fsx = require('fs'), pth = require('path');
  const body = fsx.readFileSync(pth.join(vault, 'Ideas & Sketches.md'), 'utf8');
  const mm = body.match(/```draw\n([\s\S]*?)\n```/);
  const strokes = mm ? JSON.parse(mm[1]).strokes.length : -1;
  check('drawing stroke saved', strokes >= 1, 'strokes=' + strokes);
  await shot('23-draw');
  // database table view
  await js(`window.__app.open('Study Planner.md')`); await sleep(900);
  await js(`document.querySelector('#view .t-database .seg [data-v=table]').click()`); await sleep(500);
  await js(`document.querySelector('#view .t-database').scrollIntoView()`); await sleep(400);
  await shot('24-database-table');
  // settings modal
  await js(`window.__app.settings.theme='yadon'; window.__app.saveSettings();`); await sleep(300);
  await key('P', ctrl); await sleep(300); await type('setti'); await sleep(300); await key('Enter'); await sleep(700);
  check('settings modal opens', await js(`!!document.querySelector('.theme-pick')`));
  await shot('25-settings');
  await key('Escape'); await sleep(300);
  // source mode
  await key('/', ctrl); await sleep(900);
  check('source mode shows textarea', await js(`!!document.querySelector('.source-ta')`));
  await key('/', ctrl); await sleep(700);
  // search
  await key('F', ['control','shift']); await sleep(300); await type('portfolio'); await sleep(500);
  check('global search results', await js(`document.querySelectorAll('.pal-item').length > 0`));
  await shot('26-search');
};
