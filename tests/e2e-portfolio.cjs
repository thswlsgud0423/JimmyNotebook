module.exports = async ({ js, shot, check, sleep, errors, key, type, win, vault }) => {
  const fs = require('fs'), path = require('path');
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings();`);

  // ---------- no made-up data anywhere in the starter content ----------
  const pfSrc = fs.readFileSync(path.join(vault, 'Investment Portfolio.md'), 'utf8');
  const blk = JSON.parse(pfSrc.match(/```portfolio\n([\s\S]*?)\n```/)[1]);
  check('starter portfolio is empty (no fake holdings)', blk.holdings.length === 0 && (blk.cash || []).length === 0 && (blk.history || []).length === 0, JSON.stringify(blk).slice(0, 100));
  check('no fake "net worth" chart in the starter page', !/Net worth \(example\)|"kind":"line"/.test(pfSrc));
  const all = fs.readdirSync(vault).filter(f => f.endsWith('.md')).map(f => fs.readFileSync(path.join(vault, f), 'utf8')).join('\n');
  check('no sample numbers in starter charts', !/"values":\[(?!0,0,0\])[\d.,]+\]/.test(all));

  // ---------- empty state → add a holding with what you paid ----------
  await js(`window.__app.open('Investment Portfolio.md')`); await sleep(2500);
  check('empty state shown', await js(`!!document.querySelector('#view .pf-empty')`));
  await js(`document.querySelector('#view [data-addsym]').click()`); await sleep(500);
  check('add-holding dialog opens', await js(`!!document.querySelector('.pf-form')`));
  // validation: price is required
  await js(`(() => { const f = (k) => document.querySelector('.pf-form [data-f=' + k + ']'); f('sym').value = 'AAPL'; f('shares').value = '10'; })()`);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(400);
  check('price paid is required', await js(`!!document.querySelector('.pf-form')`) && await js(`[...document.querySelectorAll('.toast')].some(t => /price you paid/i.test(t.textContent))`));
  const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  await js(`(() => { const f = (k) => document.querySelector('.pf-form [data-f=' + k + ']'); f('sym').dispatchEvent(new Event('change')); })()`); await sleep(2500);
  check('dialog shows the live price', await js(`/current price/i.test(document.querySelector('.pf-prev').textContent)`), await js(`document.querySelector('.pf-prev').textContent`));
  await js(`(() => { const f = (k) => document.querySelector('.pf-form [data-f=' + k + ']'); f('price').value = '300'; f('price').dispatchEvent(new Event('input')); f('date').value = '${d30}'; })()`); await sleep(300);
  check('dialog previews gain vs your price', await js(`/vs your price/i.test(document.querySelector('.pf-prev').textContent)`));
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(4500);
  const rowTxt = await js(`document.querySelector('#view table.pf tr:nth-child(2)').textContent.replace(/\\s+/g, ' ')`);
  console.log('row:', rowTxt);
  check('holding added with shares + avg cost', /AAPL/.test(rowTxt) && / 10(?=US)/.test(rowTxt) && /300\.00/.test(rowTxt), rowTxt);
  check('P/L is calculated from the price you paid', /[+-]US\$[\d,]+/.test(rowTxt) || /[+-]\$[\d,]+/.test(rowTxt), rowTxt);
  const gainTile = await js(`[...document.querySelectorAll('#view .pf-top .stat')].map(s => s.textContent.replace(/\\s+/g, ' '))[2]`);
  check('Gain / loss tile is real (not "add what you paid")', !/add what you paid/.test(gainTile) && /%/.test(gainTile), gainTile);

  // buy more → weighted average
  await js(`document.querySelector('#view [data-buy="0"]').click()`); await sleep(500);
  await js(`(() => { const f = (k) => document.querySelector('.pf-form [data-f=' + k + ']'); f('shares').value = '5'; f('price').value = '330'; })()`);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(3500);
  const avg = await js(`document.querySelector('#view table.pf tr:nth-child(2)').textContent.replace(/\\s+/g, ' ')`);
  check('buying more recomputes the average cost (10@300 + 5@330 = 310)', /310\.00/.test(avg), avg);

  // cash
  await js(`document.querySelector('#view [data-addcash]').click()`); await sleep(400);
  await js(`(() => { const i = document.querySelector('#view tr.cashrow input[data-ci]'); i.focus(); i.select(); })()`);
  await type('1000'); await sleep(800);
  check('cash counts in net worth', await js(`/US\\$1,000/.test(document.querySelectorAll('#view .pf-top .stat')[4].textContent)`));

  // lots editor
  await js(`document.querySelector('#view td.lotcell').click()`); await sleep(500);
  check('lots editor lists both purchases', await js(`document.querySelectorAll('.modal table.lots tr').length === 3`));
  await js(`document.querySelector('.modal [data-done]').click()`); await sleep(500);

  // trend: rebuild from buy dates
  await js(`document.querySelector('#view [data-rebuild]').click()`); await sleep(6000);
  const hist = await js(`(() => { const b = window.__vault.pages.get('Investment Portfolio.md').body; const m = b.match(/\`\`\`portfolio\\n([\\s\\S]*?)\\n\`\`\`/); return m ? JSON.parse(m[1]).history.length : -1; })()`);
  await sleep(1500);
  const saved = JSON.parse(fs.readFileSync(path.join(vault, 'Investment Portfolio.md'), 'utf8').match(/```portfolio\n([\s\S]*?)\n```/)[1]);
  console.log('history points:', saved.history.length, JSON.stringify(saved.history.slice(0, 2)));
  check('net worth trend rebuilt from real price history', saved.history.length >= 15 && saved.history.every(e => e.h > 0), 'points=' + saved.history.length);
  check('trend chart drawn', await js(`(() => { const c = window.Chart.getChart(document.querySelector('#view .pf-trend-c canvas')); return !!c && c.data.labels.length >= 15 && c.data.datasets[0].data.every(v => v > 0); })()`));
  check('lots + dates saved', saved.holdings[0].lots.length === 2 && saved.holdings[0].lots[0].date === d30 && saved.holdings[0].lots[0].price === 300);
  await js(`document.querySelector('#view .pf-trend').scrollIntoView({block:'center'})`); await sleep(600);
  await shot('160-portfolio-trend');

  // ---------- several accounts in different currencies ----------
  check('wealth change chips show amount and %', await js(`/Change/.test(document.querySelector('#view .pf-chips').textContent) && /%/.test(document.querySelector('#view .pf-chips').textContent)`));
  await js(`document.querySelector('#view [data-r="1M"]').click()`); await sleep(600);
  check('range switch redraws the trend', await js(`document.querySelector('#view [data-r="1M"]').classList.contains('on') && !!window.Chart.getChart(document.querySelector('#view .pf-trend-c canvas'))`));
  await js(`document.querySelector('#view [data-addacct]').click()`); await sleep(400);
  await js(`(() => { const m = document.querySelector('.modal'); m.querySelector('[data-f=name]').value = 'Savings KRW'; m.querySelector('[data-f=cur]').value = 'KRW'; m.querySelector('[data-a=ok]').click(); })()`); await sleep(3000);
  check('second account tab appears', await js(`document.querySelectorAll('#view .pf-tab[data-tab]').length === 3`));
  await js(`document.querySelector('#view [data-addcash]').click()`); await sleep(400);
  await js(`(() => { const i = document.querySelector('#view tr.cashrow input[data-ci]'); i.focus(); i.select(); })()`);
  await type('2000000'); await sleep(900);
  const krwRow = await js(`document.querySelector('#view tr.cashrow select').value`);
  check('cash in the KRW account defaults to KRW', krwRow === 'KRW', krwRow);
  await js(`document.querySelector('#view .pf-tab[data-tab=""]').click()`); await sleep(1200);
  check('all-accounts overview lists both accounts', await js(`document.querySelectorAll('#view .pfa tr[data-pick]').length === 2`));
  const ov = await js(`document.querySelector('#view .pfa').textContent.replace(/\s+/g, ' ')`);
  console.log('overview:', ov);
  check('KRW account shown in its own currency and in USD', /₩/.test(ov) && /US\$|\$/.test(ov), ov);
  const w = await js(`document.querySelectorAll('#view .pf-top .stat')[0].textContent`);
  check('total wealth adds up all accounts (> first account alone)', /\$/.test(w), w);
  await js(`document.querySelector('#view [data-addsym]').click()`); await sleep(400);
  check('add-holding dialog asks which account', await js(`!!document.querySelector('.pf-form select[data-f=acct]')`));
  await js(`document.querySelector('.modal [data-a=c]').click()`); await sleep(300);
  await js(`document.querySelector('#view .pf-trend').scrollIntoView({block:'start'})`); await sleep(600);
  await shot('162-portfolio-accounts');

  // ---------- editable to-dos on Home ----------
  await js(`window.__app.openView({type:'home'})`); await sleep(1800);
  await js(`(() => { const i = document.querySelector('#view .todo-add input'); i.value = 'Buy milk'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); await sleep(1800);
  check('new to-do saved into the To-dos page', fs.existsSync(path.join(vault, 'To-dos.md')) && /- \[ \] Buy milk/.test(fs.readFileSync(path.join(vault, 'To-dos.md'), 'utf8')));
  const idx = await js(`[...document.querySelectorAll('#view .todo-edit')].findIndex(i => i.value === 'Buy milk')`);
  check('new to-do appears in the widget', idx >= 0);
  await js(`(() => { const i = [...document.querySelectorAll('#view .todo-edit')].find(x => x.value === 'Buy milk'); i.focus(); i.value = 'Buy oat milk **today**'; i.blur(); })()`); await sleep(1800);
  check('editing a to-do rewrites the line in its page', /- \[ \] Buy oat milk \*\*today\*\*/.test(fs.readFileSync(path.join(vault, 'To-dos.md'), 'utf8')));
  await shot('161-todos-editable');
  await js(`(() => { const i = [...document.querySelectorAll('#view .todo-edit')].find(x => /oat milk/.test(x.value)); i.closest('.todo-row').querySelector('.chk').click(); })()`); await sleep(1800);
  check('ticking marks it done in the file', /- \[x\] Buy oat milk/.test(fs.readFileSync(path.join(vault, 'To-dos.md'), 'utf8')));
  await js(`(() => { const i = document.querySelector('#view .todo-add input'); i.value = 'Delete me'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); await sleep(1800);
  await js(`(() => { const i = [...document.querySelectorAll('#view .todo-edit')].find(x => x.value === 'Delete me'); i.closest('.todo-row').querySelector('.todo-del').click(); })()`); await sleep(1800);
  check('deleting removes the line', !/Delete me/.test(fs.readFileSync(path.join(vault, 'To-dos.md'), 'utf8')));
  check('no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
};
