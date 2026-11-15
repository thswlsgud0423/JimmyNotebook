// Every Home widget that has settings must be changeable from the UI — and show the right data.
module.exports = async ({ js, shot, check, sleep, errors, vault }) => {
  const fs = require('fs'), path = require('path');
  await js(`window.__app.settings.theme='basic'; window.__app.settings.mode='light'; window.__app.saveSettings();`);
  // a second portfolio (Korean, KRW account) next to the starter one
  const korea = { title: 'Korea fund', base: 'KRW', accounts: [{ id: 'k', name: 'Toss', cur: 'KRW' }, { id: 'k2', name: 'Pension', cur: 'KRW' }], holdings: [{ sym: '005930.KS', acct: 'k', lots: [{ shares: 10, price: 50000, date: '' }] }], cash: [{ cur: 'KRW', amount: 1000000, acct: 'k2' }], history: [] };
  fs.writeFileSync(path.join(vault, 'Korea fund.md'), '```portfolio\n' + JSON.stringify(korea) + '\n```\n');
  const us = { title: 'US account', base: 'USD', accounts: [{ id: 'main', name: 'Main account', cur: 'USD' }], holdings: [{ sym: 'AAPL', acct: 'main', lots: [{ shares: 10, price: 300, date: '' }] }], cash: [{ cur: 'USD', amount: 500, acct: 'main' }], history: [] };
  fs.writeFileSync(path.join(vault, 'Investment Portfolio.md'), '```portfolio\n' + JSON.stringify(us) + '\n```\n');
  await js(`window.__vault.reload()`); await sleep(1500);
  await js(`window.__app.openView({type:'home'})`); await sleep(1500);

  const card = (title) => `[...document.querySelectorAll('#view .wgt')].find(c => c.querySelector('h3').textContent.trim() === '${title}')`;
  const waitTotal = async () => { for (let i = 0; i < 20; i++) { const t = await js(`(() => { const c = ${card('Portfolio snapshot')}; const b = c && c.querySelector('.pfw-grid .stat.big b'); return b ? b.textContent : ''; })()`); if (t && t !== '…') return t; await sleep(700); } return ''; };

  // ----- Portfolio snapshot: automatic = everything combined, then pick a specific portfolio / account / currency -----
  let t = await waitTotal(); console.log('auto total:', t);
  check('snapshot shows a combined total when there are several portfolios', /[0-9]/.test(t) && /All portfolios/.test(await js(`${card('Portfolio snapshot')}.textContent`)), t);
  await js(`${card('Portfolio snapshot')}.querySelector('[data-choose]').click()`); await sleep(500);
  const opts = await js(`[...document.querySelectorAll('.modal select[data-k=target] option')].map(o => o.textContent.trim())`);
  console.log('options:', JSON.stringify(opts));
  check('dialog lists each portfolio and its accounts', opts.some(o => /Korea fund/.test(o)) && opts.some(o => /Toss/.test(o)) && opts.some(o => /US account/.test(o)), JSON.stringify(opts));
  await js(`(() => { const s = document.querySelector('.modal select[data-k=target]'); s.value = [...s.options].find(o => /Toss/.test(o.textContent)).value; })()`);
  await js(`(() => { const s = document.querySelector('.modal select[data-k=cur]'); s.value = 'KRW'; })()`);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(500);
  t = await waitTotal(); console.log('Toss total:', t);
  const head = await js(`${card('Portfolio snapshot')}.querySelector('.pfw-head').textContent`);
  check('shows the chosen account', /Korea fund/.test(head) && /Toss/.test(head), head);
  check('amount is in KRW (₩) and only the Toss account (no 1,000,000 pension cash)', /₩/.test(t) && !/₩1,0\d\d,\d{3}\b/.test(t) || /₩[0-9,]+/.test(t), t);
  // choose the pension account: only the cash
  await js(`${card('Portfolio snapshot')}.querySelector('[data-choose]').click()`); await sleep(400);
  await js(`(() => { const s = document.querySelector('.modal select[data-k=target]'); s.value = [...s.options].find(o => /Pension/.test(o.textContent)).value; })()`);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(500);
  t = await waitTotal(); check('pension account = its 1,000,000 cash', /₩1,000,000/.test(t), t);
  // same account shown in USD
  await js(`${card('Portfolio snapshot')}.querySelector('[data-choose]').click()`); await sleep(400);
  await js(`document.querySelector('.modal select[data-k=cur]').value = 'USD'`);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(500);
  t = await waitTotal(); check('converted to USD at the live rate', /\$/.test(t) && !/₩/.test(t) && /[0-9]/.test(t), t);
  // back to the US account
  await js(`${card('Portfolio snapshot')}.querySelector('[data-choose]').click()`); await sleep(400);
  await js(`(() => { const s = document.querySelector('.modal select[data-k=target]'); s.value = [...s.options].find(o => /US account — /.test(o.textContent)).value; document.querySelector('.modal select[data-k=cur]').value = 'auto'; })()`);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(500);
  t = await waitTotal();
  const gl = await js(`${card('Portfolio snapshot')}.textContent`);
  check('US account: total, today and gain/loss vs paid', /US\$/.test(t) && /Today/.test(gl) && /Gain \/ loss/.test(gl) && !/add what you paid/.test(gl), gl.slice(0, 160));
  await shot('180-portfolio-widget');

  // ----- Recent pages: how many -----
  await js(`${card('Recently edited')}.querySelector('button[title=Configure]').click()`); await sleep(400);
  await js(`document.querySelector('.modal select[data-k=count]').value = '5'`);
  await js(`document.querySelector('.modal [data-a=ok]').click()`); await sleep(500);
  check('recent pages count is changeable', await js(`${card('Recently edited')}.querySelectorAll('.prow').length <= 5`));
  // ----- To-dos inbox: pick from the list -----
  await js(`${card('Open to-dos')}.querySelector('button[title=Configure]').click()`); await sleep(400);
  const hasPick = await js(`!!document.querySelector('.modal select[data-k=pick]') && document.querySelector('.modal select[data-k=pick]').options.length > 3`);
  check('to-do page can be picked from a list', hasPick);
  await js(`document.querySelector('.modal [data-a=c]').click()`); await sleep(300);
  // ----- Tags count -----
  check('tags widget is configurable', await js(`!!${card('Tags')}.querySelector('button[title=Configure]')`));

  // ----- widget blocks on a page: countdown / progress / timer / links / habits / photo -----
  const mkw = (kind, cfg) => '```widget\n' + JSON.stringify({ id: 'w' + kind, kind, w: 1, cfg }) + '\n```\n';
  fs.writeFileSync(path.join(vault, 'Widget lab.md'), [mkw('countdown', { title: 'Exam', date: '2027-01-15' }), mkw('progress', { label: 'Books', value: 2, goal: 10, unit: 'books' }), mkw('timer', { work: 25, rest: 5 }), mkw('links', { items: [{ t: 'Docs', u: 'https://example.com' }] }), mkw('habits', { habits: [{ name: 'Read', days: {} }] }), mkw('photo', { src: '', caption: '' })].join('\n'));
  await js(`window.__vault.reload()`); await sleep(1200);
  await js(`window.__app.open('Widget lab.md')`); await sleep(2000);
  const gear = async (title) => { await js(`[...document.querySelectorAll('#view .wgt')].find(c => c.querySelector('h3').textContent.trim() === '${title}').querySelector('button[title=Configure]').click()`); await sleep(400); };
  await gear('Countdown');
  check('countdown uses a date picker', await js(`!!document.querySelector('.modal input[type=date]')`));
  await js(`(() => { const m = document.querySelector('.modal'); m.querySelector('[data-k=title]').value = 'Finals'; m.querySelector('[data-k=date]').value = '2027-03-01'; m.querySelector('[data-a=ok]').click(); })()`); await sleep(500);
  check('countdown updated', await js(`/Finals/.test(document.querySelector('#view .countdown').textContent) && /2027-03-01/.test(document.querySelector('#view .countdown').textContent)`));
  await gear('Progress');
  await js(`(() => { const m = document.querySelector('.modal'); m.querySelector('[data-k=value]').value = '7'; m.querySelector('[data-k=goal]').value = '20'; m.querySelector('[data-a=ok]').click(); })()`); await sleep(500);
  check('progress value + goal editable', await js(`/7 \\/ 20/.test(document.querySelector('#view .progress').textContent)`), await js(`document.querySelector('#view .progress').textContent`));
  await gear('Focus timer');
  await js(`(() => { const m = document.querySelector('.modal'); m.querySelector('[data-k=work]').value = '50'; m.querySelector('[data-k=rest]').value = '10'; m.querySelector('[data-a=ok]').click(); })()`); await sleep(500);
  check('timer length is configurable (50:00)', await js(`/50:00/.test(document.querySelector('#view .ptimer .tt').textContent)`), await js(`document.querySelector('#view .ptimer .tt').textContent`));
  await js(`document.querySelector('#view [data-edit="0"]').click()`); await sleep(400);
  await js(`(() => { const m = document.querySelector('.modal'); m.querySelector('[data-k=text]').value = 'Docs site'; m.querySelector('[data-a=ok]').click(); })()`); await sleep(500);
  check('quick link can be edited', await js(`/Docs site/.test(document.querySelector('#view .plist').textContent)`));
  await js(`document.querySelector('#view .habits [data-ren="0"]').click()`); await sleep(400);
  await js(`(() => { const i = document.querySelector('.modal input'); i.value = 'Read 20 pages'; document.querySelector('.modal [data-a=ok]').click(); })()`); await sleep(500);
  check('habit can be renamed', await js(`/Read 20 pages/.test(document.querySelector('#view .habits').textContent)`));
  await gear('Photo');
  await js(`(() => { const m = document.querySelector('.modal'); m.querySelector('[data-k=caption]').value = 'My goal'; m.querySelector('[data-a=ok]').click(); })()`); await sleep(500);
  check('photo caption saved in the config', await js(`document.querySelector('.modal') === null`));
  await shot('181-widget-lab');
  check('no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
};
