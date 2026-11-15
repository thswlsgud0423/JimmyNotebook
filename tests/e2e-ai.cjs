// AI assistant against the REAL local Ollama (qwen2.5:7b). Model output varies, so checks are about behavior, not exact words.
module.exports = async ({ js, shot, check, sleep, errors, vault, win }) => {
  win.show(); win.focus(); win.webContents.focus();
  const fs = require('fs'), path = require('path');
  const up = await fetch('http://127.0.0.1:11434/api/tags').then(r => r.ok).catch(() => false);
  if (!up) { console.log('SKIP: Ollama not running'); return; }
  fs.writeFileSync(path.join(vault, 'AiTest.md'), '# AiTest\n\nthis sentense have a few mistake in it.\n\nSales: Jan 10, Feb 25, Mar 40.\n');
  await js(`window.__vault.reload()`); await sleep(900);
  await js(`window.__app.open('AiTest.md')`); await sleep(1400);
  const types = () => js(`[...document.querySelectorAll('#view .blk')].map(b => b._blk.type).join(',')`);
  const lastBot = () => js(`(() => { const m = [...document.querySelectorAll('#aipanel .ai-m.bot')]; return m.length ? m[m.length - 1].innerText : ''; })()`);
  const waitIdle = async (max = 240000) => { const t0 = Date.now(); await sleep(800); while (Date.now() - t0 < max) { if (!(await js(`document.getElementById('aipanel').classList.contains('busy')`))) return true; await sleep(700); } return false; };
  const ask = async (q) => { await js(`(() => { const ta = document.querySelector('#aipanel textarea'); ta.value = ${JSON.stringify(q)}; ta.dispatchEvent(new Event('input')); document.querySelector('#aipanel [data-send]').click(); })()`); return waitIdle(); };

  await js(`document.querySelector('#topbar [data-t=ai]').click()`); await sleep(1500);
  check('AI panel opens from the topbar button', await js(`!document.getElementById('aipanel').hidden`));
  const models = await js(`[...document.querySelectorAll('#aipanel .ai-model option')].map(o => o.textContent).join(',')`);
  check('lists the installed models and picks qwen', /qwen/.test(models) && /qwen/.test(await js(`document.querySelector('#aipanel .ai-model').value`)), models);
  check('shortcut buttons are visible', (await js(`document.querySelectorAll('#aipanel .ai-chip').length`)) >= 8);
  await shot('95-ai-panel');

  // 1. plain chat, streaming
  check('answers a simple question', await ask('What is 17 * 23? Answer with the number only.') && /391/.test(await lastBot()), await lastBot());

  // 2. chart from the page data
  await ask('Make a bar chart of the sales numbers on my page. Title it "Sales".');
  const hasChart = await js(`!!document.querySelector('#aipanel .ai-m.bot:last-child canvas')`);
  check('makes a chart preview from page data', hasChart, await lastBot());
  if (hasChart) { await js(`document.querySelector('#aipanel .ai-m.bot:last-child [data-add]').click()`); await sleep(700); check('the chart can be added to the page', /chart/.test(await types()), await types()); }
  await shot('96-ai-chart');

  // 3. fix grammar of a selected sentence and replace it
  await js(`(() => { const el = [...document.querySelectorAll('#view .blk')].find(b => /sentense/.test(b._blk.text || '')).querySelector('[data-txt]'); el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
  await js(`[...document.querySelectorAll('#aipanel .ai-chip')].find(b => /grammar/i.test(b.textContent)).click()`);
  await waitIdle();
  const rep = await js(`!![...document.querySelectorAll('#aipanel .ai-m.bot:last-child .ai-b')].find(b => /Replace selection/.test(b.textContent))`);
  check('grammar fix offers “Replace selection”', rep, await lastBot());
  if (rep) { await js(`[...document.querySelectorAll('#aipanel .ai-m.bot:last-child .ai-b')].find(b => /Replace selection/.test(b.textContent)).click()`); await sleep(600);
    const t = await js(`[...document.querySelectorAll('#view .blk')].map(b => b._blk.text || '').join('|')`);
    check('the sentence was corrected in the page', /sentence has/i.test(t) || !/sentense/.test(t), t); }

  // 4. actions: create a folder + page, shown for approval, nothing happens before clicking
  await ask('Create a new folder called "Papers" and a page inside it called "Reading list" containing a short to-do list.');
  const hasAct = await js(`!!document.querySelector('#aipanel .ai-m.bot:last-child .ai-act [data-run]')`);
  check('proposes file changes for approval', hasAct, await lastBot());
  check('…and has not changed anything yet', !fs.existsSync(path.join(vault, 'Papers', 'Reading list.md')));
  if (hasAct) { await js(`document.querySelector('#aipanel .ai-m.bot:last-child .ai-act [data-run]').click()`); await sleep(2500);
    check('approved actions create the page', fs.existsSync(path.join(vault, 'Papers', 'Reading list.md')), fs.existsSync(path.join(vault, 'Papers')) ? fs.readdirSync(path.join(vault, 'Papers')).join(',') : 'no folder'); }
  await shot('97-ai-actions');

  // 5. stocks use live data when available (skip the check offline)
  await ask('Give me a short summary of the stock $AAPL.');
  const ans = await lastBot(); check('stock answer comes back', ans.length > 40, ans.slice(0, 200));
  console.log('stock answer:', ans.slice(0, 300).replace(/\n/g, ' '));

  // 6. customization modal
  await js(`document.querySelector('#aipanel [data-c=set]').click()`); await sleep(500);
  check('customize dialog opens', await js(`!!document.querySelector('.ai-set')`));
  await js(`(() => { document.querySelector('.ai-set [data-nl]').value = 'Friendly'; document.querySelector('.ai-set [data-np]').value = 'Rewrite in a friendly tone'; document.querySelector('.ai-set [data-addc]').click(); })()`); await sleep(300);
  await js(`document.querySelector('.modal [data-x]').click()`); await sleep(300);
  check('my own shortcut button appears', await js(`[...document.querySelectorAll('#aipanel .ai-chip')].some(b => /Friendly/.test(b.textContent))`));
  check('no console errors', errors.length === 0, errors.join(' | '));
};
