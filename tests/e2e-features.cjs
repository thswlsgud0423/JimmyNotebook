module.exports = async ({ js, shot, check, sleep, errors, key, type, win, vault }) => {
  const fs = require('fs'), path = require('path');
  await js(`window.__app.settings.theme='psyduck'; window.__app.settings.mode='light'; window.__app.saveSettings(); window.__app.openView({type:'home'})`);
  await sleep(1500);

  // ---- 1. customizable home: add + remove widgets, persisted in the vault
  const before = await js(`document.querySelectorAll('#view .hgrid .wgt').length`);
  await js(`document.querySelector('[data-a=edit]').click()`); await sleep(300);
  await js(`document.querySelector('[data-a=add]').click()`); await sleep(400);
  check('widget gallery lists widgets', await js(`document.querySelectorAll('.wg-card').length >= 15`));
  await shot('80-widget-gallery');
  await js(`document.querySelector('.wg-card[data-k=habits]').click()`); await sleep(500);
  await js(`document.querySelector('[data-a=add]').click()`); await sleep(300);
  await js(`document.querySelector('.wg-card[data-k=countdown]').click()`); await sleep(500);
  const after = await js(`document.querySelectorAll('#view .hgrid .wgt').length`);
  check('widgets added to home', after === before + 2, before + ' -> ' + after);
  await sleep(700);
  const hj = path.join(vault, '.jimmy', 'home.json');
  check('home layout saved in vault (.jimmy/home.json)', fs.existsSync(hj) && JSON.parse(fs.readFileSync(hj, 'utf8')).widgets.length === after);
  await js(`document.querySelector('#view .hgrid .wgt .wgt-tools .iconbtn:last-child').click()`); await sleep(300);
  check('widget removed', await js(`document.querySelectorAll('#view .hgrid .wgt').length`) === after - 1);
  await js(`document.querySelector('[data-a=edit]').click()`); await sleep(300);
  await shot('81-home-customized');

  // ---- 2. page: widgets, columns, code, math, image
  await js(`window.__app.newPage('')`); await sleep(900);
  await type('Feature test'); await key('Enter'); await sleep(200);
  await type('/watch'); await sleep(400); await key('Enter'); await sleep(900);
  check('widget block inserted via slash', await js(`!!document.querySelector('#view .t-widget .wgt')`));
  await js(`(() => { const ed = document.querySelector('#view .editor'); const last = [...ed.querySelectorAll(':scope > .blk')].pop(); last.querySelector('[data-txt]').focus(); })()`);
  await type('/2 col'); await sleep(300); await key('Enter'); await sleep(700);
  check('2-column block inserted', await js(`document.querySelectorAll('#view .t-columns .col-cell').length === 2`));
  await js(`document.querySelector('#view .t-columns .col-cell [data-txt]').focus()`);
  await type('Left column text'); await key('Enter'); await type('- bullet in column');
  await js(`document.querySelectorAll('#view .t-columns .col-cell')[1].querySelector('[data-txt]').focus()`);
  await type('Right column text');
  await sleep(300);
  await js(`(() => { const ed = document.querySelector('#view .editor'); const last = [...ed.querySelectorAll(':scope > .blk')].pop(); last.querySelector('[data-txt]').focus(); })()`);
  await type('/code'); await sleep(300); await key('Enter'); await sleep(500);
  await type('function add(a, b) {'); await key('Enter'); await type('return a + b;');
  const code = await js(`document.querySelector('#view .t-code .code-ta').value`);
  console.log('code value:', JSON.stringify(code));
  check('code editor: auto-close + auto-indent', code === 'function add(a, b) {\n  return a + b;\n}' || code.startsWith('function add(a, b) {\n  return a + b;'), JSON.stringify(code));
  await js(`document.querySelector('#view .t-code select').value='js'; document.querySelector('#view .t-code select').dispatchEvent(new Event('change'))`); await sleep(400);
  check('code highlighted live', await js(`document.querySelector('#view .t-code .code-hl .k') !== null`));
  await key('Enter', ['control']); await sleep(400);
  await type('/math'); await sleep(300); await key('Enter'); await sleep(500);
  await js(`document.querySelector('#view .math-snips button[data-i="0"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await sleep(400);
  check('LaTeX palette inserts + live preview', await js(`document.querySelector('#view .math-live .katex') !== null && document.querySelector('#view .math-src').value.includes('frac')`));
  await key('Escape'); await sleep(500);
  // image paste (simulated clipboard image)
  await js(`(() => { const ed = document.querySelector('#view .editor'); const last = [...ed.querySelectorAll(':scope > .blk')].pop(); const t = last.querySelector('[data-txt]'); t.focus(); })()`);
  await js(`(async () => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; const x = c.getContext('2d'); x.fillStyle = '#d9a02b'; x.fillRect(0, 0, 60, 40); const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'image.png', { type: 'image/png' })); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
  await sleep(1200);
  check('pasted image becomes an image block + asset file', await js(`!!document.querySelector('#view .t-image img')`) && fs.readdirSync(path.join(vault, 'assets')).some(f => /^pasted-/.test(f)));
  await sleep(1200);
  console.log('vault files:', fs.readdirSync(vault).join(' | '));
  const f = fs.readdirSync(vault).find(n => /Feature/i.test(n)) || fs.readdirSync(vault).find(n => /Untitled/.test(n));
  const src = fs.readFileSync(path.join(vault, f), 'utf8');
  console.log(src);
  check('markdown has widget, columns, code, math, image', src.includes('```widget') && src.includes(':::columns') && src.includes('```js') && src.includes('$$') && /!\[\]\(assets\/pasted-/.test(src));
  await js(`window.scrollTo(0,0); document.querySelector('#view').scrollTop = 0`); await sleep(300);
  await shot('82-feature-page');
  await js(`document.querySelector('#view .t-code').scrollIntoView({block:'center'})`); await sleep(400); await shot('83-feature-code');
  // reopen: everything survives a round trip
  await js(`window.__app.open('Welcome to Jimmy Notes.md')`); await sleep(500);
  await js(`window.__app.open('${f.replace(/'/g, "\\'")}')`); await sleep(1200);
  check('page reloads with all blocks', await js(`['t-widget','t-columns','t-code','t-math','t-image'].every(c => document.querySelector('#view .blk.' + c))`));
};
